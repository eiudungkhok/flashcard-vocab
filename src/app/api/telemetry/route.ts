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

    const rawStart = Number(body.rawStart || body.startMs || now - 5000);
    const rawEnd = Number(body.rawEnd || body.endMs || now);

    // 1. Tìm hoặc tạo Lượt truy cập (web_visits)
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
        const initSec = Math.max(5, Number(body.totalSec || 0));
        const initStudySec = Math.max(0, Number(body.studySec || 0));
        const { data: createdVisit } = await supabase
          .from('web_visits')
          .insert({
            user_id: user.id,
            started_at: new Date(now - initSec * 1000).toISOString(),
            last_seen_at: new Date(now).toISOString(),
            end_reason: 'active',
            device_summary: device,
            user_agent: req.headers.get('user-agent') || '',
            entry_path: path,
            page_views_count: 1,
            presence_sec: initSec,
            active_sec: initSec,
            study_sec: initStudySec,
          })
          .select('id')
          .single();

        visitId = createdVisit?.id || null;
      }
    }

    // Đồng bộ thời gian localStorage nếu lượt truy cập vừa khởi tạo chưa có số giây
    if (eventType === 'sync_local' && visitId) {
      const localTotalSec = Math.max(0, Number(body.totalSec || 0));
      const localStudySec = Math.max(0, Number(body.studySec || 0));
      const { data: v } = await supabase
        .from('web_visits')
        .select('presence_sec, active_sec, study_sec')
        .eq('id', visitId)
        .maybeSingle();

      if (v && Number(v.presence_sec || 0) < localTotalSec) {
        await supabase
          .from('web_visits')
          .update({
            last_seen_at: new Date(now).toISOString(),
            presence_sec: localTotalSec,
            active_sec: localTotalSec,
            study_sec: Math.max(Number(v.study_sec || 0), localStudySec),
          })
          .eq('id', visitId);
      }
      return NextResponse.json({ ok: true, visitId, synced: true });
    }

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
        .maybeSingle();

      await supabase
        .from('web_visits')
        .update({
          last_seen_at: new Date(now).toISOString(),
          page_views_count: (v?.page_views_count || 0) + 1,
        })
        .eq('id', visitId);

      return NextResponse.json({ ok: true, visitId, eventType: 'pageview' });
    }

    const {
      isValid,
      startMs,
      endMs,
      rawDurationSec,
      creditedDurationSec,
      hasGap,
    } = validateAndClampInterval(rawStart, rawEnd);

    if (!isValid || creditedDurationSec <= 0) {
      return NextResponse.json({
        ok: true,
        visitId,
        skipped: true,
        heartbeatIntervalSec: TRACKING_CONFIG.HEARTBEAT_INTERVAL_SEC,
      });
    }

    const kind: IntervalKind = isStudying ? 'study' : isActive ? 'active' : 'presence';

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
        .maybeSingle();

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