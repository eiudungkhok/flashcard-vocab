// src/utils/analytics/timeEngine.ts
export type IntervalKind = 'presence' | 'active' | 'study' | 'dashboard' | 'idle';

export type RealtimeStudentStatus =
  | 'studying'      // Đang học (có tương tác học hợp lệ trong ngưỡng tín hiệu)
  | 'active'        // Đang hoạt động trên website
  | 'idle'          // Mở tab nhưng không tương tác
  | 'offline';      // Không có tín hiệu gần đây

export const TRACKING_CONFIG = {
  HEARTBEAT_INTERVAL_SEC: 15,
  SIGNAL_ALIVE_THRESHOLD_SEC: 60,      // Mặc định 60 giây còn tín hiệu
  DASHBOARD_REFRESH_INTERVAL_SEC: 30,  // Cập nhật định kỳ 30 giây
  IDLE_THRESHOLD_SEC: 120,             // Quá 120s không thao tác -> coi là Idle
  VISIT_TIMEOUT_SEC: 1800,             // 30 phút không có tín hiệu -> tạo lượt truy cập (visit) mới
  MAX_CREDITED_GAP_SEC: 30,            // Kẹp trần mỗi nhịp tối đa 30s để chống gian lận/treo máy
  STUDY_INTERACTION_WINDOW_SEC: 60,    // Tương tác lật thẻ/nghe phát âm trong 60s gần nhất mới tính là thời gian học
  TIMEZONE: 'Asia/Ho_Chi_Minh' as const,
  VN_OFFSET_MS: 7 * 3600 * 1000,
} as const;

export interface RawTimeInterval {
  startMs: number;
  endMs: number;
}

/**
 * Kiểm tra và kẹp trần khoảng thời gian (chống âm, chống nhảy vọt khi ngủ máy/mất mạng)
 */
export function validateAndClampInterval(
  rawStart: number,
  rawEnd: number,
  maxCapSec: number = TRACKING_CONFIG.MAX_CREDITED_GAP_SEC
) {
  const startMs = Number(rawStart);
  const endMs = Number(rawEnd);

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    startMs <= 0
  ) {
    return {
      isValid: false,
      startMs: 0,
      endMs: 0,
      rawDurationSec: 0,
      creditedDurationSec: 0,
      hasGap: false,
    };
  }

  const rawDurationSec = Math.round((endMs - startMs) / 1000);
  if (rawDurationSec < 1) {
    return {
      isValid: false,
      startMs,
      endMs,
      rawDurationSec: 0,
      creditedDurationSec: 0,
      hasGap: false,
    };
  }

  const hasGap = rawDurationSec > maxCapSec;
  const creditedDurationSec = Math.min(rawDurationSec, maxCapSec);
  const clampedEndMs = startMs + creditedDurationSec * 1000;

  return {
    isValid: true,
    startMs,
    endMs: clampedEndMs,
    rawDurationSec,
    creditedDurationSec,
    hasGap,
  };
}

/**
 * Hợp nhất các khoảng thời gian chồng lấn giữa nhiều Tab / Thiết bị (Interval Union)
 * Đảm bảo 1 học viên mở 3 tab trong 10 phút vẫn chỉ tính tối đa 10 phút, không bao giờ nhân 3.
 */
export function mergeOverlappingIntervals(intervals: RawTimeInterval[]): {
  merged: RawTimeInterval[];
  totalSeconds: number;
} {
  const valid = intervals
    .filter((i) => Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (valid.length === 0) {
    return { merged: [], totalSeconds: 0 };
  }

  const merged: RawTimeInterval[] = [
    { startMs: valid[0].startMs, endMs: valid[0].endMs },
  ];

  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const last = merged[merged.length - 1];

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ startMs: current.startMs, endMs: current.endMs });
    }
  }

  const totalMs = merged.reduce((acc, item) => acc + (item.endMs - item.startMs), 0);
  return {
    merged,
    totalSeconds: Math.round(totalMs / 1000),
  };
}

/**
 * Xác định trạng thái tín hiệu thời gian thực của học viên
 */
export function resolveStudentRealtimeStatus(params: {
  lastSeenAt?: string | null;
  lastActiveAt?: string | null;
  lastStudyAt?: string | null;
  nowMs?: number;
  signalThresholdSec?: number;
}): {
  status: RealtimeStudentStatus;
  label: string;
  secondsSinceLastSeen: number | null;
} {
  const now = params.nowMs ?? Date.now();
  const thresholdSec = params.signalThresholdSec ?? TRACKING_CONFIG.SIGNAL_ALIVE_THRESHOLD_SEC;

  if (!params.lastSeenAt) {
    return {
      status: 'offline',
      label: 'Không có tín hiệu gần đây',
      secondsSinceLastSeen: null,
    };
  }

  const lastSeenMs = new Date(params.lastSeenAt).getTime();
  const diffSeenSec = Math.max(0, Math.round((now - lastSeenMs) / 1000));

  if (diffSeenSec > thresholdSec) {
    return {
      status: 'offline',
      label: 'Không có tín hiệu gần đây',
      secondsSinceLastSeen: diffSeenSec,
    };
  }

  if (params.lastStudyAt) {
    const diffStudySec = Math.max(0, Math.round((now - new Date(params.lastStudyAt).getTime()) / 1000));
    if (diffStudySec <= thresholdSec) {
      return {
        status: 'studying',
        label: 'Đang học',
        secondsSinceLastSeen: diffSeenSec,
      };
    }
  }

  if (params.lastActiveAt) {
    const diffActiveSec = Math.max(0, Math.round((now - new Date(params.lastActiveAt).getTime()) / 1000));
    if (diffActiveSec <= thresholdSec) {
      return {
        status: 'active',
        label: 'Đang hoạt động',
        secondsSinceLastSeen: diffSeenSec,
      };
    }
  }

  return {
    status: 'idle',
    label: 'Không hoạt động',
    secondsSinceLastSeen: diffSeenSec,
  };
}

export function parseUserAgentSummary(userAgent: string | null): string {
  if (!userAgent) return 'Không rõ thiết bị';
  const browser = /edg/i.test(userAgent)
    ? 'Edge'
    : /chrome|crios/i.test(userAgent)
    ? 'Chrome'
    : /firefox|fxios/i.test(userAgent)
    ? 'Firefox'
    : /safari/i.test(userAgent)
    ? 'Safari'
    : 'Browser';

  const os = /windows/i.test(userAgent)
    ? 'Windows'
    : /android/i.test(userAgent)
    ? 'Android'
    : /iphone|ipad|ipod/i.test(userAgent)
    ? 'iOS'
    : /macintosh|mac os/i.test(userAgent)
    ? 'macOS'
    : 'Linux';

  const formFactor = /mobile|android|iphone|ipad/i.test(userAgent) ? 'Mobile' : 'Desktop';
  return `${formFactor} (${browser} / ${os})`;
}

/**
 * Chuẩn hóa chuỗi ngày theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 */
export function toVNDateKey(dateInput: Date | string | number): string {
  const ms = typeof dateInput === 'number' ? dateInput : new Date(dateInput).getTime();
  return new Date(ms + TRACKING_CONFIG.VN_OFFSET_MS).toISOString().slice(0, 10);
}

export function getVNHour(dateInput: Date | string | number): number {
  const ms = typeof dateInput === 'number' ? dateInput : new Date(dateInput).getTime();
  return new Date(ms + TRACKING_CONFIG.VN_OFFSET_MS).getUTCHours();
}

export function formatDurationVN(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'Chưa ghi nhận';
  const sec = Math.max(0, Math.round(seconds));
  if (sec === 0) return '0 giây';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  if (m > 0) return `${m} phút ${s > 0 ? `${s}s` : ''}`.trim();
  return `${s} giây`;
}

export function safePercent(numerator: number, denominator: number, decimals = 1): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100 * factor) / factor));
}