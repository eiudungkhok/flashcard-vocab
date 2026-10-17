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

    // Hỗ trợ đọc body từ cả application/json (fetch) và text/plain (navigator.sendBeacon)
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

    if (!isValid) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        heartbeatIntervalSec: TRACKING_CONFIG.HEARTBEAT_INTERVAL_SEC,
      });
    }

    const device = parseUserAgentSummary(req.headers.get('user-agent'));

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