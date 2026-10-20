// src/app/api/telemetry/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  validateAndClampInterval,
  parseUserAgentSummary,
  TRACKING_CONFIG,
  IntervalKind,
} from '@/utils/analytics/timeEngine';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await req.text();
    const body = rawBody ? JSON.parse(rawBody) : {};

    const now = Date.now();
    const eventType: string = body.eventType || 'heartbeat';
    const path: string = body.path || '/';
    const deckId: string | null = body.deckId || null;
    const isActive = Boolean(body.isActive ?? true);
    const isStudying = Boolean(body.isStudying ?? false);
    const device = parseUserAgentSummary(req.headers.get('user-agent'));

    const rawStart = Number(body.rawStart || body.startMs || now - 1000);
    const rawEnd = Number(body.rawEnd || body.endMs || now);

    const {
      isValid,
      startMs,
      endMs,
      rawDurationSec,
      creditedDurationSec,
      hasGap,
    } = validateAndClampInterval(rawStart, rawEnd);

    // 1. Tìm hoặc tạo Lượt truy cập (web_visits) trong vòng 30 phút gần nhất
    let visitId: string | null = body.visitId || null;
    const timeoutCutoff = new Date(now - TRACKING_CONFIG.VISIT_TIMEOUT_SEC * 1000).toISOString();

    if (visitId) {
      const { data: existingVisit } = await supabase
        .from('web_visits')
        .select('id, last_seen_at')
        .eq('id', visitId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingVisit || existingVisit.last_seen_at < timeoutCutoff) {
        visitId = null;
      }
    }

    if (!visitId) {
      const { data: recentVisit } = await supabase
        .from('web_visits')
        .select('id')
        .eq('user_id', user.id)
        .gte('last_seen_at', timeoutCutoff)
        .order('last_seen_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentVisit) {
        visitId = recentVisit.id;
      } else {
        const { data: createdVisit } = await supabase
          .from('web_visits')
          .insert({
            user_id: user.id,
            started_at: new Date(startMs || now).toISOString(),
            last_seen_at: new Date(now).toISOString(),
            end_reason: 'active',
            device_summary: device,
            user_agent: req.headers.get('user-agent') || '',
            entry_path: path,
            page_views_count: 1,
          })
          .select('id')
          .single();

        visitId = createdVisit?.id || null;
      }
    }

    // 2. Nếu là sự kiện xem trang mới (loại trừ API, tài nguyên tĩnh và heartbeat)
    if (eventType === 'pageview' && visitId && !path.startsWith('/api') && !path.startsWith('/_next')) {
      await supabase.from('page_views').insert({
        visit_id: visitId,
        user_id: user.id,
        path,
      });

      const { data: v } = await supabase
        .from('web_visits')
        .select('page_views_count')
        .eq('id', visitId)
        .single();

      await supabase
        .from('web_visits')
        .update({
          last_seen_at: new Date(now).toISOString(),
          page_views_count: (v?.page_views_count || 0) + 1,
        })
        .eq('id', visitId);

      return NextResponse.json({ ok: true, visitId, eventType: 'pageview' });
    }

    if (!isValid || creditedDurationSec <= 0) {
      return NextResponse.json({
        ok: true,
        visitId,
        skipped: true,
        heartbeatIntervalSec: TRACKING_CONFIG.HEARTBEAT_INTERVAL_SEC,
      });
    }

    const kind: IntervalKind = isStudying ? 'study' : isActive ? 'active' : 'presence';

    // 3. Chống ghi trùng khoảng thời gian (Idempotency check)
    const { data: duplicate } = await supabase
      .from('telemetry_intervals')
      .select('id')
      .eq('user_id', user.id)
      .eq('start_ms', startMs)
      .eq('end_ms', endMs)
      .maybeSingle();

    if (!duplicate) {
      await supabase.from('telemetry_intervals').insert({
        visit_id: visitId,
        user_id: user.id,
        kind,
        path,
        deck_id: deckId,
        start_ms: startMs,
        end_ms: endMs,
        credited_sec: creditedDurationSec,
        device_summary: device,
      });

      if (visitId) {
        const { data: currentVisit } = await supabase
          .from('web_visits')
          .select('presence_sec, active_sec, study_sec')
          .eq('id', visitId)
          .single();

        await supabase
          .from('web_visits')
          .update({
            last_seen_at: new Date(now).toISOString(),
            ended_at: eventType === 'unload' ? new Date(now).toISOString() : null,
            end_reason: eventType === 'unload' ? 'closed' : isActive ? 'active' : 'idle_timeout',
            presence_sec: (currentVisit?.presence_sec || 0) + creditedDurationSec,
            active_sec: (currentVisit?.active_sec || 0) + (isActive ? creditedDurationSec : 0),
            study_sec: (currentVisit?.study_sec || 0) + (isStudying ? creditedDurationSec : 0),
          })
          .eq('id', visitId);
      }
    }

    return NextResponse.json({
      ok: true,
      visitId,
      userId: user.id,
      kind,
      path,
      startMs,
      endMs,
      rawDurationSec,
      creditedDurationSec,
      hasGap,
      device,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }
}