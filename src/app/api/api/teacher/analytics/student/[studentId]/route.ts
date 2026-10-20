// src/app/api/teacher/analytics/student/[studentId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  getVNHour,
  mergeOverlappingIntervals,
  resolveStudentRealtimeStatus,
  safePercent,
  toVNDateKey,
  TRACKING_CONFIG,
} from '@/utils/analytics/timeEngine';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Kiểm tra quyền: Học viên này có thuộc ít nhất 1 lớp do Giảng viên phụ trách không?
    const { data: teacherCourses } = await supabase
      .from('courses')
      .select('id, title')
      .eq('teacher_id', user.id);

    const allowedCourseIds = (teacherCourses || []).map((c) => c.id);
    if (allowedCourseIds.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: studentEnrollments } = await supabase
      .from('enrollments')
      .select('course_id, joined_at')
      .eq('student_id', studentId)
      .in('course_id', allowedCourseIds);

    if (!studentEnrollments || studentEnrollments.length === 0) {
      return NextResponse.json(
        { error: 'Forbidden: Học viên không thuộc lớp phụ trách của bạn.' },
        { status: 403 }
      );
    }

    const studentCourseIds = studentEnrollments.map((e) => e.course_id);
    const courseTitleMap = new Map((teacherCourses || []).map((c) => [c.id, c.title]));

    // 2. Lấy bộ thẻ thuộc phạm vi lớp học của giảng viên (Không đọc bộ thẻ riêng tư của học viên)
    const { data: allowedDecksData } = await supabase
      .from('decks')
      .select('id, title, course_id, cards(id, term, definition)')
      .in('course_id', studentCourseIds);

    const allowedDecks = allowedDecksData || [];
    const allowedDeckIds = allowedDecks.map((d) => d.id);

    const [profileRes, visitsRes, intervalsRes, sessionsRes, reviewsRes, progressRes] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, student_code, tracking_enabled_at')
          .eq('id', studentId)
          .maybeSingle(),
        supabase
          .from('web_visits')
          .select('*')
          .eq('user_id', studentId)
          .order('started_at', { ascending: false })
          .limit(50),
        supabase
          .from('telemetry_intervals')
          .select('*')
          .eq('user_id', studentId)
          .order('start_ms', { ascending: false })
          .limit(400),
        supabase
          .from('study_sessions')
          .select('*')
          .eq('user_id', studentId)
          .in('deck_id', allowedDeckIds.length > 0 ? allowedDeckIds : ['00000000-0000-0000-0000-000000000000'])
          .order('started_at', { ascending: false }),
        supabase
          .from('review_logs')
          .select('*')
          .eq('user_id', studentId)
          .in('deck_id', allowedDeckIds.length > 0 ? allowedDeckIds : ['00000000-0000-0000-0000-000000000000'])
          .order('reviewed_at', { ascending: false }),
        supabase
          .from('card_progress')
          .select('*')
          .eq('user_id', studentId)
          .in('deck_id', allowedDeckIds.length > 0 ? allowedDeckIds : ['00000000-0000-0000-0000-000000000000']),
      ]);

    const profile = profileRes.data;
    const visits = visitsRes.data || [];
    const intervals = intervalsRes.data || [];
    const sessions = sessionsRes.data || [];
    const reviews = reviewsRes.data || [];
    const progress = progressRes.data || [];

    // 3. Tính chuỗi ngày học (Streak) & Biểu đồ truy cập vs học theo ngày
    const dailyMap = new Map<
      string,
      { date: string; visitsCount: number; presenceSec: number; activeSec: number; studySec: number; reviewsCount: number }
    >();

    visits.forEach((v) => {
      const dKey = toVNDateKey(v.started_at);
      const item = dailyMap.get(dKey) || {
        date: dKey,
        visitsCount: 0,
        presenceSec: 0,
        activeSec: 0,
        studySec: 0,
        reviewsCount: 0,
      };
      item.visitsCount += 1;
      item.presenceSec += Number(v.presence_sec || 0);
      item.activeSec += Number(v.active_sec || 0);
      item.studySec += Number(v.study_sec || 0);
      dailyMap.set(dKey, item);
    });

    reviews.forEach((r) => {
      const dKey = toVNDateKey(r.reviewed_at);
      const item = dailyMap.get(dKey) || {
        date: dKey,
        visitsCount: 0,
        presenceSec: 0,
        activeSec: 0,
        studySec: 0,
        reviewsCount: 0,
      };
      item.reviewsCount += 1;
      dailyMap.set(dKey, item);
    });

    // Lịch hoạt động theo giờ (0h -> 23h)
    const hourlyHeatmap = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      activeCount: 0,
      studyCount: 0,
    }));

    intervals.forEach((intv) => {
      const h = getVNHour(Number(intv.start_ms));
      if (hourlyHeatmap[h]) {
        hourlyHeatmap[h].activeCount += 1;
        if (intv.kind === 'study') hourlyHeatmap[h].studyCount += 1;
      }
    });

    // Tính chuỗi ngày học liên tiếp (Streak)
    const studyDaysSorted = Array.from(
      new Set(reviews.map((r) => toVNDateKey(r.reviewed_at)))
    ).sort((a, b) => b.localeCompare(a));

    let currentStreak = 0;
    let cursorDate = toVNDateKey(Date.now());
    for (const dayStr of studyDaysSorted) {
      if (dayStr === cursorDate) {
        currentStreak += 1;
        const prevMs = new Date(`${cursorDate}T00:00:00+07:00`).getTime() - 86400000;
        cursorDate = toVNDateKey(prevMs);
      } else if (dayStr < cursorDate && currentStreak === 0) {
        currentStreak = 1;
        const prevMs = new Date(`${dayStr}T00:00:00+07:00`).getTime() - 86400000;
        cursorDate = toVNDateKey(prevMs);
      } else {
        break;
      }
    }

    // Phân bố mức tự đánh giá (Grade 1, 3, 4, 5)
    const selfRatingDistribution = {
      forgot: reviews.filter((r) => r.grade === 1).length,
      hard: reviews.filter((r) => r.grade === 3).length,
      good: reviews.filter((r) => r.grade === 4).length,
      easy: reviews.filter((r) => r.grade === 5).length,
      rememberedRate: safePercent(
        reviews.filter((r) => r.is_remembered).length,
        reviews.length
      ),
    };

    // Những từ thường quên của học viên trong phạm vi lớp
    const cardMetaMap = new Map<string, { term: string; definition: string; deckTitle: string }>();
    allowedDecks.forEach((d) => {
      (Array.isArray(d.cards) ? d.cards : []).forEach((c: any) => {
        cardMetaMap.set(c.id, { term: c.term, definition: c.definition, deckTitle: d.title });
      });
    });

    const personalHardMap = new Map<string, { forgot: number; total: number }>();
    reviews.forEach((r) => {
      if (!cardMetaMap.has(r.card_id)) return;
      const st = personalHardMap.get(r.card_id) || { forgot: 0, total: 0 };
      st.total += 1;
      if (!r.is_remembered) st.forgot += 1;
      personalHardMap.set(r.card_id, st);
    });

    const frequentlyForgottenWords = Array.from(personalHardMap.entries())
      .filter(([, st]) => st.forgot > 0)
      .map(([cardId, st]) => {
        const meta = cardMetaMap.get(cardId)!;
        return {
          cardId,
          term: meta.term,
          definition: meta.definition,
          deckTitle: meta.deckTitle,
          forgotCount: st.forgot,
          totalReviews: st.total,
          forgotRate: safePercent(st.forgot, st.total),
        };
      })
      .sort((a, b) => b.forgotCount - a.forgotCount)
      .slice(0, 10);

    // 4. Danh sách lượt truy cập chi tiết (kèm thông báo rõ nếu không xác định được thời điểm rời web)
    const detailedVisits = visits.map((v) => {
      const visitIntervals = intervals.filter((i) => i.visit_id === v.id);
      const hasStudyActivity = Number(v.study_sec || 0) > 0 || visitIntervals.some((i) => i.kind === 'study');

      const endDisplay = v.ended_at
        ? `Kết thúc lúc ${new Date(v.ended_at).toLocaleString('vi-VN')}`
        : `Ghi nhận cuối lúc ${new Date(v.last_seen_at).toLocaleString('vi-VN')}`;

      return {
        id: v.id,
        startedAt: v.started_at,
        lastSeenAt: v.last_seen_at,
        endedAt: v.ended_at,
        endDisplay,
        endReason: v.end_reason,
        deviceSummary: v.device_summary,
        entryPath: v.entry_path,
        pageViewsCount: v.page_views_count,
        presenceSec: v.presence_sec,
        activeSec: v.active_sec,
        studySec: v.study_sec,
        hasStudyActivity,
        intervals: visitIntervals.slice(0, 15).map((i) => ({
          id: i.id,
          kind: i.kind,
          path: i.path,
          startMs: i.start_ms,
          endMs: i.end_ms,
          creditedSec: i.credited_sec,
        })),
      };
    });

    const realtime = resolveStudentRealtimeStatus({
      lastSeenAt: visits[0]?.last_seen_at || null,
      lastActiveAt: visits[0]?.last_seen_at || null,
      lastStudyAt: reviews[0]?.reviewed_at || sessions[0]?.last_interaction_at || null,
    });

    const mergedTotalPresence = mergeOverlappingIntervals(
      intervals.map((i) => ({ startMs: Number(i.start_ms), endMs: Number(i.end_ms) }))
    );

    return NextResponse.json({
      student: {
        id: studentId,
        fullName: profile?.full_name || 'Học viên',
        email: profile?.email || '',
        studentCode: profile?.student_code || `SV${studentId.slice(0, 6).toUpperCase()}`,
        trackingEnabledAt: profile?.tracking_enabled_at || null,
        classes: studentCourseIds.map((cid) => courseTitleMap.get(cid) || 'Lớp học'),
        realtimeStatus: realtime.status,
        realtimeLabel: realtime.label,
        currentStreakDays: currentStreak,
        totalReviewsCount: reviews.length,
        totalSessionsCount: sessions.length,
        distinctCardsLearned: new Set(progress.map((p) => p.card_id)).size,
        mergedPresenceSec: mergedTotalPresence.totalSeconds,
      },
      dailySeries: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      hourlyHeatmap,
      selfRatingDistribution,
      frequentlyForgottenWords,
      visits: detailedVisits,
      visitsWithoutStudy: detailedVisits.filter((v) => !v.hasStudyActivity),
      sessions: sessions.slice(0, 20).map((s) => ({
        id: s.id,
        deckId: s.deck_id,
        deckTitle: allowedDecks.find((d) => d.id === s.deck_id)?.title || 'Bộ thẻ lớp học',
        startedAt: s.started_at,
        endedAt: s.ended_at || s.last_interaction_at,
        cardsReviewed: s.cards_reviewed,
        durationSec: s.duration_sec,
      })),
    });
  } catch (err) {
    console.error('Student detail analytics error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}