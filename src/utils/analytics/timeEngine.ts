// src/utils/analytics/timeEngine.ts

export const TRACKING_CONFIG = {
  /** Chu kỳ gửi tín hiệu heartbeat định kỳ (15 giây) */
  HEARTBEAT_INTERVAL_SEC: 15,
  /** Ngưỡng không tương tác tối đa trước khi chuyển sang trạng thái Idle (120 giây) */
  IDLE_THRESHOLD_SEC: 120,
  /** Ngưỡng không hoạt động để kết thúc lượt truy cập cũ và tạo lượt truy cập mới (30 phút = 1800 giây) */
  VISIT_TIMEOUT_SEC: 1800,
  /** Khoảng thời gian tối đa được công nhận cho một nhịp gửi tín hiệu để chống cộng dồn lúc mất mạng/máy ngủ (30 giây) */
  MAX_CREDITED_GAP_SEC: 30,
  /** Cửa sổ duy trì trạng thái đang học sau mỗi thao tác học tập như lật thẻ, nghe âm thanh, chấm điểm (60 giây) */
  STUDY_INTERACTION_WINDOW_SEC: 60,
  /** Múi giờ chuẩn hiển thị và nhóm ngày */
  TIMEZONE: 'Asia/Ho_Chi_Minh',
  /** Độ lệch chuẩn của Asia/Ho_Chi_Minh so với UTC (+7 giờ = 25,200,000 ms) */
  VN_OFFSET_MS: 7 * 60 * 60 * 1000,
} as const;

export type IntervalKind = 'presence' | 'active' | 'study';

export interface TimeIntervalInput {
  event_id?: string;
  kind: IntervalKind;
  started_at: string | Date | number;
  ended_at: string | Date | number;
  deck_id?: string | null;
  study_session_id?: string | null;
  visit_id?: string | null;
  has_gap?: boolean;
}

export interface NumericRange {
  startMs: number;
  endMs: number;
}

/**
 * Chuyển đổi một mốc thời gian UTC bất kỳ sang chuỗi ngày 'YYYY-MM-DD' theo múi giờ Asia/Ho_Chi_Minh
 */
export function toVietnamDateKey(input: string | Date | number): string {
  const utcMs = typeof input === 'number' ? input : new Date(input).getTime();
  const vnTime = new Date(utcMs + TRACKING_CONFIG.VN_OFFSET_MS);
  const year = vnTime.getUTCFullYear();
  const month = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vnTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Lấy giờ trong ngày (0..23) theo múi giờ Asia/Ho_Chi_Minh
 */
export function toVietnamHour(input: string | Date | number): number {
  const utcMs = typeof input === 'number' ? input : new Date(input).getTime();
  const vnTime = new Date(utcMs + TRACKING_CONFIG.VN_OFFSET_MS);
  return vnTime.getUTCHours();
}

/**
 * Lấy mốc đầu ngày (00:00:00.000) tại Asia/Ho_Chi_Minh trả về timestamp UTC (ms)
 */
export function getVietnamStartOfDayUtcMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const vnMidnightAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return vnMidnightAsUtc - TRACKING_CONFIG.VN_OFFSET_MS;
}

/**
 * Lấy tuần ISO (YYYY-Wxx) từ ngày YYYY-MM-DD
 */
export function toVietnamWeekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Lấy tháng (YYYY-MM) từ ngày YYYY-MM-DD
 */
export function toVietnamMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/**
 * Kiểm tra và giới hạn khoảng thời gian gửi từ trình duyệt lên máy chủ.
 * Nếu khoảng cách > MAX_CREDITED_GAP_SEC (mặc định 30s) do ngủ máy hoặc rớt mạng,
 * chỉ công nhận tối đa 30s tính tới ended_at và gắn cờ has_gap = true.
 */
export function validateAndClampInterval(
  rawStart: string | number | Date,
  rawEnd: string | number | Date,
  serverNowMs: number = Date.now(),
  maxGapSec: number = TRACKING_CONFIG.MAX_CREDITED_GAP_SEC
): {
  isValid: boolean;
  startMs: number;
  endMs: number;
  rawDurationSec: number;
  creditedDurationSec: number;
  hasGap: boolean;
} {
  let startMs = typeof rawStart === 'number' ? rawStart : new Date(rawStart).getTime();
  let endMs = typeof rawEnd === 'number' ? rawEnd : new Date(rawEnd).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return { isValid: false, startMs: 0, endMs: 0, rawDurationSec: 0, creditedDurationSec: 0, hasGap: false };
  }

  // Không cho phép thời gian kết thúc vượt quá thời gian máy chủ quá 10 giây (chống lệch đồng hồ/gian lận)
  const maxAllowedEndMs = serverNowMs + 10_000;
  if (endMs > maxAllowedEndMs) {
    const shift = endMs - maxAllowedEndMs;
    endMs = maxAllowedEndMs;
    startMs = Math.max(0, startMs - shift);
  }

  const rawDurationSec = Math.round((endMs - startMs) / 1000);
  if (rawDurationSec <= 0) {
    return { isValid: false, startMs, endMs, rawDurationSec: 0, creditedDurationSec: 0, hasGap: false };
  }

  const maxGapMs = maxGapSec * 1000;
  let hasGap = false;
  if (endMs - startMs > maxGapMs) {
    hasGap = true;
    startMs = endMs - maxGapMs;
  }

  const creditedDurationSec = Math.round((endMs - startMs) / 1000);
  return {
    isValid: creditedDurationSec > 0,
    startMs,
    endMs,
    rawDurationSec,
    creditedDurationSec,
    hasGap,
  };
}

/**
 * Hợp nhất các khoảng thời gian chồng lấn (Union of Overlapping Intervals)
 * Đảm bảo mở nhiều tab hoặc nhiều thiết bị cùng lúc không bao giờ bị cộng gấp đôi số giây.
 */
export function mergeOverlappingRanges(ranges: NumericRange[]): NumericRange[] {
  const valid = ranges
    .filter((r) => !Number.isNaN(r.startMs) && !Number.isNaN(r.endMs) && r.endMs > r.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (valid.length === 0) return [];

  const merged: NumericRange[] = [{ ...valid[0] }];
  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const last = merged[merged.length - 1];
    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Tìm phần giao (Intersection) giữa hai tập khoảng thời gian đã hợp nhất.
 * Dùng để đảm bảo: Study ⊆ Active ⊆ Presence.
 */
export function intersectMergedRanges(subset: NumericRange[], superset: NumericRange[]): NumericRange[] {
  const result: NumericRange[] = [];
  let i = 0;
  let j = 0;

  while (i < subset.length && j < superset.length) {
    const start = Math.max(subset[i].startMs, superset[j].startMs);
    const end = Math.min(subset[i].endMs, superset[j].endMs);
    if (start < end) {
      result.push({ startMs: start, endMs: end });
    }
    if (subset[i].endMs < superset[j].endMs) {
      i++;
    } else {
      j++;
    }
  }
  return result;
}

/**
 * Tổng số giây từ danh sách khoảng thời gian đã hợp nhất
 */
export function sumRangesSeconds(ranges: NumericRange[]): number {
  const totalMs = ranges.reduce((acc, r) => acc + Math.max(0, r.endMs - r.startMs), 0);
  return Math.round(totalMs / 1000);
}

/**
 * Cắt chính xác một khoảng thời gian [startMs, endMs] qua ranh giới nửa đêm (00:00:00)
 * và từng khung giờ (00..23) theo múi giờ Asia/Ho_Chi_Minh.
 */
export function splitRangeByVietnamDayAndHour(range: NumericRange): {
  byDayMs: Record<string, number>;
  byHourMs: Record<number, number>;
} {
  const byDayMs: Record<string, number> = {};
  const byHourMs: Record<number, number> = {};

  let cursor = range.startMs;
  const end = range.endMs;

  while (cursor < end) {
    // Đổi sang trục giờ VN để tìm mốc chuyển giao giờ tiếp theo
    const vnCursorMs = cursor + TRACKING_CONFIG.VN_OFFSET_MS;
    const vnDate = new Date(vnCursorMs);

    const year = vnDate.getUTCFullYear();
    const month = vnDate.getUTCMonth();
    const day = vnDate.getUTCDate();
    const hour = vnDate.getUTCHours();

    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const nextHourVnMs = Date.UTC(year, month, day, hour + 1, 0, 0, 0);
    const nextBoundaryUtcMs = nextHourVnMs - TRACKING_CONFIG.VN_OFFSET_MS;

    const sliceEnd = Math.min(end, nextBoundaryUtcMs);
    const deltaMs = Math.max(0, sliceEnd - cursor);

    if (deltaMs > 0) {
      byDayMs[dateKey] = (byDayMs[dateKey] || 0) + deltaMs;
      byHourMs[hour] = (byHourMs[hour] || 0) + deltaMs;
    }

    cursor = sliceEnd;
  }

  return { byDayMs, byHourMs };
}

/**
 * Tính toán hợp nhất 3 tầng thời gian (Presence, Active, Study)
 * Bảo đảm tuyệt đối:
 * 1. Không cộng trùng đa tab / đa thiết bị
 * 2. Cắt đúng qua nửa đêm Asia/Ho_Chi_Minh
 * 3. studySeconds <= activeSeconds <= presenceSeconds trên cả tổng và từng ngày/giờ
 */
export function computeUnifiedTimeMetrics(intervals: TimeIntervalInput[]) {
  const rawPresence: NumericRange[] = [];
  const rawActive: NumericRange[] = [];
  const rawStudy: NumericRange[] = [];

  for (const item of intervals) {
    const startMs = typeof item.started_at === 'number' ? item.started_at : new Date(item.started_at).getTime();
    const endMs = typeof item.ended_at === 'number' ? item.ended_at : new Date(item.ended_at).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue;

    if (item.kind === 'presence') {
      rawPresence.push({ startMs, endMs });
    } else if (item.kind === 'active') {
      rawActive.push({ startMs, endMs });
      // Mọi khoảng đang hoạt động đều đồng thời là đang hiện diện
      rawPresence.push({ startMs, endMs });
    } else if (item.kind === 'study') {
      rawStudy.push({ startMs, endMs });
      // Mọi khoảng đang học đều đồng thời là đang hoạt động và hiện diện
      rawActive.push({ startMs, endMs });
      rawPresence.push({ startMs, endMs });
    }
  }

  const mergedPresence = mergeOverlappingRanges(rawPresence);
  const mergedActive = intersectMergedRanges(mergeOverlappingRanges(rawActive), mergedPresence);
  const mergedStudy = intersectMergedRanges(mergeOverlappingRanges(rawStudy), mergedActive);

  const presenceSeconds = sumRangesSeconds(mergedPresence);
  const activeSeconds = Math.min(presenceSeconds, sumRangesSeconds(mergedActive));
  const studySeconds = Math.min(activeSeconds, sumRangesSeconds(mergedStudy));

  // Phân bổ theo ngày (YYYY-MM-DD) và theo giờ (0..23) tại Asia/Ho_Chi_Minh
  const dailyMap: Record<string, { presenceSec: number; activeSec: number; studySec: number }> = {};
  const hourlyMap: Record<number, { presenceSec: number; activeSec: number; studySec: number }> = {};
  for (let h = 0; h < 24; h++) {
    hourlyMap[h] = { presenceSec: 0, activeSec: 0, studySec: 0 };
  }

  const accumulateBuckets = (ranges: NumericRange[], field: 'presenceSec' | 'activeSec' | 'studySec') => {
    const dayAccumulatorMs: Record<string, number> = {};
    const hourAccumulatorMs: Record<number, number> = {};

    for (const r of ranges) {
      const { byDayMs, byHourMs } = splitRangeByVietnamDayAndHour(r);
      for (const [dKey, ms] of Object.entries(byDayMs)) {
        dayAccumulatorMs[dKey] = (dayAccumulatorMs[dKey] || 0) + ms;
      }
      for (const [hKey, ms] of Object.entries(byHourMs)) {
        const h = Number(hKey);
        hourAccumulatorMs[h] = (hourAccumulatorMs[h] || 0) + ms;
      }
    }

    for (const [dKey, ms] of Object.entries(dayAccumulatorMs)) {
      if (!dailyMap[dKey]) dailyMap[dKey] = { presenceSec: 0, activeSec: 0, studySec: 0 };
      dailyMap[dKey][field] = Math.round(ms / 1000);
    }
    for (const [hKey, ms] of Object.entries(hourAccumulatorMs)) {
      const h = Number(hKey);
      hourlyMap[h][field] = Math.round(ms / 1000);
    }
  };

  accumulateBuckets(mergedPresence, 'presenceSec');
  accumulateBuckets(mergedActive, 'activeSec');
  accumulateBuckets(mergedStudy, 'studySec');

  // Khóa chặt bất đẳng thức ở từng ngày và từng giờ sau khi làm tròn giây
  for (const dKey of Object.keys(dailyMap)) {
    dailyMap[dKey].activeSec = Math.min(dailyMap[dKey].activeSec, dailyMap[dKey].presenceSec);
    dailyMap[dKey].studySec = Math.min(dailyMap[dKey].studySec, dailyMap[dKey].activeSec);
  }
  for (let h = 0; h < 24; h++) {
    hourlyMap[h].activeSec = Math.min(hourlyMap[h].activeSec, hourlyMap[h].presenceSec);
    hourlyMap[h].studySec = Math.min(hourlyMap[h].studySec, hourlyMap[h].activeSec);
  }

  return {
    presenceSeconds,
    activeSeconds,
    studySeconds,
    mergedPresence,
    mergedActive,
    mergedStudy,
    dailyMap,
    hourlyMap,
  };
}

/**
 * Cộng/trừ số ngày vào chuỗi YYYY-MM-DD
 */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * HV8 - Tính chuỗi ngày học (Current Streak & Longest Streak) theo Asia/Ho_Chi_Minh.
 * Quy tắc: Một ngày chỉ được tính khi có ít nhất 1 lượt ôn hợp lệ (từ review_logs),
 * chỉ đăng nhập hoặc xem trang KHÔNG được tính vào chuỗi ngày học.
 */
export function calculateStudyStreak(
  reviewTimestamps: (string | Date | number)[],
  nowInput: string | Date | number = Date.now()
): {
  currentStreak: number;
  longestStreak: number;
  studiedDateKeys: string[];
  studiedToday: boolean;
} {
  const dateSet = new Set<string>();
  for (const ts of reviewTimestamps) {
    dateSet.add(toVietnamDateKey(ts));
  }

  const studiedDateKeys = Array.from(dateSet).sort();
  if (studiedDateKeys.length === 0) {
    return { currentStreak: 0, longestStreak: 0, studiedDateKeys: [], studiedToday: false };
  }

  // Tính chuỗi dài nhất (Longest Streak)
  let longestStreak = 1;
  let runningStreak = 1;
  for (let i = 1; i < studiedDateKeys.length; i++) {
    const expectedNext = addDaysToDateKey(studiedDateKeys[i - 1], 1);
    if (studiedDateKeys[i] === expectedNext) {
      runningStreak += 1;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else {
      runningStreak = 1;
    }
  }

  // Tính chuỗi hiện tại (Current Streak) tính đến Hôm nay hoặc Hôm qua (theo giờ VN)
  const todayKey = toVietnamDateKey(nowInput);
  const yesterdayKey = addDaysToDateKey(todayKey, -1);
  const studiedToday = dateSet.has(todayKey);

  let anchorKey: string | null = null;
  if (studiedToday) {
    anchorKey = todayKey;
  } else if (dateSet.has(yesterdayKey)) {
    anchorKey = yesterdayKey;
  }

  let currentStreak = 0;
  if (anchorKey) {
    let pointer = anchorKey;
    while (dateSet.has(pointer)) {
      currentStreak += 1;
      pointer = addDaysToDateKey(pointer, -1);
    }
  }

  return {
    currentStreak,
    longestStreak,
    studiedDateKeys,
    studiedToday,
  };
}

/**
 * HV11 - So sánh tiến bộ giữa hai kỳ (Tuần này vs Tuần trước, Tháng này vs Tháng trước)
 * Xử lý an toàn phép chia cho 0 khi kỳ trước = 0.
 */
export function calculatePeriodComparison(currentValue: number, previousValue: number, unitLabel: string = '') {
  const diff = currentValue - previousValue;

  if (previousValue === 0) {
    if (currentValue === 0) {
      return {
        currentValue,
        previousValue,
        diff: 0,
        percentChange: null,
        trend: 'neutral' as const,
        displayText: 'Chưa có dữ liệu đối chiếu',
      };
    }
    return {
      currentValue,
      previousValue,
      diff,
      percentChange: null,
      trend: 'up' as const,
      displayText: `+${currentValue}${unitLabel ? ' ' + unitLabel : ''} (Kỳ trước: 0 — tăng tuyệt đối)`,
    };
  }

  const percentChange = Math.round((diff / previousValue) * 100);
  const sign = diff > 0 ? '+' : '';
  const trend = diff > 0 ? ('up' as const) : diff < 0 ? ('down' as const) : ('neutral' as const);

  return {
    currentValue,
    previousValue,
    diff,
    percentChange,
    trend,
    displayText: `${sign}${percentChange}% (${sign}${diff}${unitLabel ? ' ' + unitLabel : ''} so với kỳ trước)`,
  };
}

/**
 * Định dạng số giây thành chuỗi dễ đọc tiếng Việt
 */
export function formatDurationVi(seconds: number | null | undefined, allowZero: boolean = true): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return 'Chưa ghi nhận';
  }
  if (seconds === 0 && !allowZero) {
    return 'Chưa ghi nhận';
  }
  const sec = Math.max(0, Math.round(seconds));
  if (sec < 60) return `${sec} giây`;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
  }
  return remSec > 0 ? `${minutes} phút ${remSec} giây` : `${minutes} phút`;
}

/**
 * Phân tích User-Agent ở mức khái quát (Không thu thập thông tin định danh nhạy cảm)
 */
export function parseUserAgentSummary(ua: string | null | undefined): {
  deviceSummary: string;
  browserSummary: string;
  osSummary: string;
} {
  if (!ua) {
    return { deviceSummary: 'Thiết bị web', browserSummary: 'Trình duyệt', osSummary: 'Hệ điều hành' };
  }
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const deviceSummary = isTablet ? 'Máy tính bảng' : isMobile ? 'Điện thoại' : 'Máy tính (PC/Laptop)';

  let browserSummary = 'Trình duyệt khác';
  if (/Edg\//i.test(ua)) browserSummary = 'Microsoft Edge';
  else if (/CocCoc/i.test(ua)) browserSummary = 'Cốc Cốc';
  else if (/Chrome\//i.test(ua)) browserSummary = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browserSummary = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browserSummary = 'Apple Safari';

  let osSummary = 'HĐH khác';
  if (/Windows/i.test(ua)) osSummary = 'Windows';
  else if (/Android/i.test(ua)) osSummary = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) osSummary = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) osSummary = 'macOS';
  else if (/Linux/i.test(ua)) osSummary = 'Linux';

  return { deviceSummary, browserSummary, osSummary };
}