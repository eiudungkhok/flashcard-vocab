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
    const durationMs = Number(body.durationMs || 0);
    const rawStart = Number(body.rawStart || body.startMs || (durationMs ? now - durationMs : now));
    const rawEnd = Number(body.rawEnd || body.endMs || now);
    const kind: IntervalKind = body.kind || 'study';
    const path: string = body.path || '/';

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
        skipped: true,
        heartbeatIntervalSec: TRACKING_CONFIG.HEARTBEAT_INTERVAL_SEC,
      });
    }

    const device = parseUserAgentSummary(req.headers.get('user-agent'));

    // Lấy thống kê thời gian hiện tại của học viên và cộng dồn thêm số giây mới
    const currentStats = user.user_metadata?.telemetry_stats || {
      totalSec: 0,
      studySec: 0,
      daily: {},
      lastDevice: device,
    };

    const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const prevDailySec = Number(currentStats.daily?.[todayVN] || 0);

    const updatedStats = {
      totalSec: Number(currentStats.totalSec || 0) + creditedDurationSec,
      studySec:
        Number(currentStats.studySec || 0) + (kind === 'study' ? creditedDurationSec : 0),
      daily: {
        ...(currentStats.daily || {}),
        [todayVN]: prevDailySec + creditedDurationSec,
      },
      lastDevice: device,
      updatedAt: new Date().toISOString(),
    };

    await supabase.auth.updateUser({
      data: {
        telemetry_stats: updatedStats,
      },
    });

    return NextResponse.json({
      ok: true,
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
    console.error('Telemetry error:', error);
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }
}