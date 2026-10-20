// src/app/api/teacher/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  mergeOverlappingIntervals,
  resolveStudentRealtimeStatus,
  safePercent,
  toVNDateKey,
  TRACKING_CONFIG,
} from '@/utils/analytics/timeEngine';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const courseFilter = searchParams.get('courseId') || 'all';
    const deckFilter = searchParams.get('deckId') || 'all';
    const assignmentFilter = searchParams.get('assignmentId') || 'all';
    const statusFilter = searchParams.get('status') || 'all';
    const scopeMode = (searchParams.get('scopeMode') || 'class_learning') as
      | 'website'
      | 'class_learning';
    const chartGranularity = (searchParams.get('granularity') || 'day') as
      | 'day'
      | 'week'
      | 'month';
    const quizRule = (searchParams.get('quizRule') || 'highest') as
      | 'first'
      | 'latest'
      | 'highest';
    const rankingMetric = (searchParams.get('rankingMetric') || 'completion') as
      | 'completion'
      | 'study_days'
      | 'quiz_score';
    const inactiveDaysThreshold = Math.max(
      1,
      Number(searchParams.get('inactiveDays') || 3)
    );
    const signalThresholdSec = Math.max(
      15,
      Number(
        searchParams.get('signalThresholdSec') ||
          TRACKING_CONFIG.SIGNAL_ALIVE_THRESHOLD_SEC
      )
    );

    // Tham số tìm kiếm, sắp xếp và phân trang bảng Lưu lượng truy cập phía Server
    const searchKeyword = (searchParams.get('search') || '').trim().toLowerCase();
    const sortBy = searchParams.get('sortBy') || 'lastSeenAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize') || 10)));

    // Khoảng thời gian lọc (Mặc định 30 ngày gần nhất)
    const nowMs = Date.now();
    const toDateStr = searchParams.get('to') || toVNDateKey(nowMs);
    const fromDateStr =
      searchParams.get('from') || toVNDateKey(nowMs - 29 * 86400 * 1000);

    const fromIso = new Date(`${fromDateStr}T00:00:00+07:00`).toISOString();
    const toIso = new Date(`${toDateStr}T23:59:59.999+07:00`).toISOString();
    const fromMs = new Date(fromIso).getTime();
    const toMs = new Date(toIso).getTime();

    // 1. KIỂM TRA QUYỀN SERVER-SIDE: Chỉ lấy các lớp do chính giảng viên này phụ trách
    const { data: teacherCourses } = await supabase
      .from('courses')
      .select('id, title, description, created_at')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    const allowedCourses = teacherCourses || [];
    const allowedCourseIds = allowedCourses.map((c) => c.id);

    if (
      courseFilter !== 'all' &&
      !allowedCourseIds.includes(courseFilter)
    ) {
      return NextResponse.json(
        { error: 'Forbidden: Bạn không có quyền truy cập lớp học này.' },
        { status: 403 }
      );
    }

    const activeCourseIds =
      courseFilter === 'all' ? allowedCourseIds : [courseFilter];

    if (activeCourseIds.length === 0) {
      return NextResponse.json({
        updatedAt: new Date().toISOString(),
        courses: [],
        decks: [],
        assignments: [],
        quizzes: [],
        gv1Overview: {
          totalStudents: 0,
          visitedStudents: 0,
          studiedStudents: 0,
          notStudiedStudents: 0,
          totalReviews: 0,
          assignedDecksCount: 0,
          participationRate: 0,
        },
        trafficSummary: {
          totalVisits: 0,
          uniqueVisitors: 0,
          pageViewsCount: 0,
          recentlyActiveUsers: 0,
          recentlyStudyingUsers: 0,
          totalPresenceSec: 0,
          totalActiveSec: 0,
          totalStudySec: 0,
          avgVisitDurationSec: 0,
          visitedButNoStudyUsers: 0,
        },
        trafficTable: { rows: [], total: 0, page, pageSize },
        gv3ProgressMatrix: { decks: [], students: [] },
        gv4Timeline: [],
        gv5HardWords: [],
        gv6InactiveList: [],
        gv7Assignments: [],
        gv8Quizzes: { summary: null, distribution: [], questionStats: [], attempts: [] },
        gv9ClassComparison: [],
        gv10Ranking: [],
      });
    }

    // 2. Lấy danh sách ghi danh (enrollments) trong các lớp được phép
    const { data: enrollmentsData } = await supabase
      .from('enrollments')
      .select('course_id, student_id, joined_at')
      .in('course_id', activeCourseIds);

    const enrollments = enrollmentsData || [];

    // Đếm học viên duy nhất (chống cộng trùng khi 1 học viên học nhiều lớp của giảng viên)
    const uniqueStudentIds = Array.from(
      new Set(enrollments.map((e) => e.student_id))
    );

    // Map học viên -> danh sách các lớp của giảng viên
    const studentCoursesMap = new Map<string, string[]>();
    const courseTitleMap = new Map(allowedCourses.map((c) => [c.id, c.title]));

    enrollments.forEach((e) => {
      const list = studentCoursesMap.get(e.student_id) || [];
      const title = courseTitleMap.get(e.course_id) || 'Lớp học';
      if (!list.includes(title)) list.push(title);
      studentCoursesMap.set(e.student_id, list);
    });

    // 3. Lấy hồ sơ học viên (profiles)
    const { data: profilesData } =
      uniqueStudentIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, email, full_name, student_code, tracking_enabled_at')
            .in('id', uniqueStudentIds)
        : { data: [] };

    const profileMap = new Map((profilesData || []).map((p) => [p.id, p]));

    // 4. Lấy các Bộ thẻ thuộc lớp được phép (Không bao giờ đọc bộ thẻ riêng tư của học viên)
    let deckQuery = supabase
      .from('decks')
      .select('id, title, course_id, user_id, created_at, cards(id, term, phonetic, definition)')
      .in('course_id', activeCourseIds);

    if (deckFilter !== 'all') {
      deckQuery = deckQuery.eq('id', deckFilter);
    }

    const { data: assignedDecksData } = await deckQuery;
    const assignedDecks = assignedDecksData || [];
    const allowedDeckIds = assignedDecks.map((d) => d.id);

    // 5. Lấy dữ liệu Telemetry & Học tập của các học viên thuộc phạm vi
    const [
      visitsRes,
      intervalsRes,
      pageViewsRes,
      sessionsRes,
      reviewsRes,
      cardProgressRes,
      assignmentsRes,
      quizzesRes,
      quizAttemptsRes,
    ] =
      uniqueStudentIds.length > 0
        ? await Promise.all([
            supabase
              .from('web_visits')
              .select('*')
              .in('user_id', uniqueStudentIds)
              .gte('started_at', fromIso)
              .lte('started_at', toIso),
            supabase
              .from('telemetry_intervals')
              .select('*')
              .in('user_id', uniqueStudentIds)
              .gte('start_ms', fromMs)
              .lte('end_ms', toMs),
            supabase
              .from('page_views')
              .select('id, user_id, path, created_at')
              .in('user_id', uniqueStudentIds)
              .gte('created_at', fromIso)
              .lte('created_at', toIso),
            supabase
              .from('study_sessions')
              .select('*')
              .in('user_id', uniqueStudentIds)
              .gte('started_at', fromIso)
              .lte('started_at', toIso),
            supabase
              .from('review_logs')
              .select('*')
              .in('user_id', uniqueStudentIds)
              .gte('reviewed_at', fromIso)
              .lte('reviewed_at', toIso),
            allowedDeckIds.length > 0
              ? supabase
                  .from('card_progress')
                  .select('*')
                  .in('user_id', uniqueStudentIds)
                  .in('deck_id', allowedDeckIds)
              : Promise.resolve({ data: [] }),
            supabase
              .from('assignments')
              .select('*')
              .in('course_id', activeCourseIds)
              .order('due_at', { ascending: true }),
            supabase
              .from('quizzes')
              .select('*')
              .in('course_id', activeCourseIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('quiz_attempts')
              .select('*')
              .in('course_id', activeCourseIds)
              .in('user_id', uniqueStudentIds)
              .gte('submitted_at', fromIso)
              .lte('submitted_at', toIso),
          ])
        : [
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
            { data: [] },
          ];

    const visits = visitsRes.data || [];
    const rawIntervals = intervalsRes.data || [];
    const pageViews = (pageViewsRes.data || []).filter(
      (pv) => !pv.path.startsWith('/api') && !pv.path.startsWith('/_next')
    );

    // Áp dụng bộ lọc phạm vi: "website" vs "class_learning"
    const sessions = (sessionsRes.data || []).filter((s) =>
      scopeMode === 'class_learning' ? allowedDeckIds.includes(s.deck_id) : true
    );
    const reviews = (reviewsRes.data || []).filter((r) =>
      scopeMode === 'class_learning' ? allowedDeckIds.includes(r.deck_id) : true
    );
    const cardProgressList = cardProgressRes.data || [];
    const assignments = assignmentsRes.data || [];
    const quizzes = quizzesRes.data || [];
    const quizAttempts = quizAttemptsRes.data || [];

    // 6. TÍNH TOÁN CHỈ SỐ TỪNG HỌC VIÊN (Hợp nhất khoảng thời gian chồng lấn đa tab)
    const studentMetricsList = uniqueStudentIds.map((studentId) => {
      const profile = profileMap.get(studentId);
      const studentVisits = visits.filter((v) => v.user_id === studentId);
      const studentIntervals = rawIntervals.filter((i) => i.user_id === studentId);
      const studentSessions = sessions.filter((s) => s.user_id === studentId);
      const studentReviews = reviews.filter((r) => r.user_id === studentId);

      // Hợp nhất khoảng thời gian bằng mergeOverlappingIntervals để chống nhân đôi khi mở nhiều tab
      const presenceMerged = mergeOverlappingIntervals(
        studentIntervals.map((i) => ({ startMs: Number(i.start_ms), endMs: Number(i.end_ms) }))
      );
      const activeMerged = mergeOverlappingIntervals(
        studentIntervals
          .filter((i) => i.kind === 'active' || i.kind === 'study')
          .map((i) => ({ startMs: Number(i.start_ms), endMs: Number(i.end_ms) }))
      );
      const studyIntervalsFiltered = studentIntervals.filter(
        (i) =>
          i.kind === 'study' &&
          (scopeMode === 'class_learning'
            ? !i.deck_id || allowedDeckIds.includes(i.deck_id)
            : true)
      );
      const studyMerged = mergeOverlappingIntervals(
        studyIntervalsFiltered.map((i) => ({
          startMs: Number(i.start_ms),
          endMs: Number(i.end_ms),
        }))
      );

      // Nếu bảng intervals chưa có nhưng có sessions/visits thì fallback hợp lý
      const sessionDurationSum = studentSessions.reduce(
        (acc, s) => acc + Number(s.duration_sec || 0),
        0
      );
      const visitPresenceSum = studentVisits.reduce(
        (acc, v) => acc + Number(v.presence_sec || 0),
        0
      );
      const visitActiveSum = studentVisits.reduce(
        (acc, v) => acc + Number(v.active_sec || 0),
        0
      );

      const presenceSec = Math.max(presenceMerged.totalSeconds, visitPresenceSum);
      const activeSec = Math.max(activeMerged.totalSeconds, visitActiveSum);
      const studySec = Math.max(studyMerged.totalSeconds, sessionDurationSum);

      // Số ngày truy cập & Số ngày học hợp lệ
      const visitDaySet = new Set<string>();
      studentVisits.forEach((v) => visitDaySet.add(toVNDateKey(v.started_at)));
      studentIntervals.forEach((i) => visitDaySet.add(toVNDateKey(Number(i.start_ms))));

      const studyDaySet = new Set<string>();
      studentReviews.forEach((r) => studyDaySet.add(toVNDateKey(r.reviewed_at)));
      studentSessions.forEach((s) => studyDaySet.add(toVNDateKey(s.started_at)));

      // Lần truy cập gần nhất & Lần học gần nhất
      const lastSeenAt =
        studentVisits.length > 0
          ? studentVisits.reduce(
              (latest, v) => (v.last_seen_at > latest ? v.last_seen_at : latest),
              studentVisits[0].last_seen_at
            )
          : null;

      const lastActiveInterval = studentIntervals
        .filter((i) => i.kind === 'active' || i.kind === 'study')
        .sort((a, b) => Number(b.end_ms) - Number(a.end_ms))[0];

      const lastActiveAt = lastActiveInterval
        ? new Date(Number(lastActiveInterval.end_ms)).toISOString()
        : lastSeenAt;

      const latestReviewAt =
        studentReviews.length > 0
          ? studentReviews.reduce(
              (latest, r) => (r.reviewed_at > latest ? r.reviewed_at : latest),
              studentReviews[0].reviewed_at
            )
          : null;

      const latestSessionAt =
        studentSessions.length > 0
          ? studentSessions.reduce(
              (latest, s) =>
                s.last_interaction_at > latest ? s.last_interaction_at : latest,
              studentSessions[0].last_interaction_at
            )
          : null;

      const lastStudyAt =
        latestReviewAt && latestSessionAt
          ? latestReviewAt > latestSessionAt
            ? latestReviewAt
            : latestSessionAt
          : latestReviewAt || latestSessionAt;

      const realtime = resolveStudentRealtimeStatus({
        lastSeenAt,
        lastActiveAt,
        lastStudyAt,
        nowMs,
        signalThresholdSec,
      });

      // Tiến độ bộ thẻ được giao (Dựa trên số thẻ KHÁC NHAU đã ôn, không tính tổng lượt ôn)
      const totalAssignedCards = assignedDecks.reduce(
        (acc, d) => acc + (Array.isArray(d.cards) ? d.cards.length : 0),
        0
      );
      const distinctReviewedCards = new Set(
        cardProgressList
          .filter((cp) => cp.user_id === studentId && allowedDeckIds.includes(cp.deck_id))
          .map((cp) => cp.card_id)
      ).size;

      const completionPct = safePercent(distinctReviewedCards, totalAssignedCards);

      return {
        studentId,
        fullName:
          profile?.full_name ||
          profile?.email?.split('@')[0] ||
          `Học viên #${studentId.slice(0, 6).toUpperCase()}`,
        email: profile?.email || '',
        studentCode:
          profile?.student_code || `SV${studentId.slice(0, 6).toUpperCase()}`,
        classes: studentCoursesMap.get(studentId) || [],
        trackingEnabledAt: profile?.tracking_enabled_at || null,
        visitsCount: studentVisits.length,
        visitDaysCount: visitDaySet.size,
        studyDaysCount: studyDaySet.size,
        presenceSec,
        activeSec,
        studySec,
        sessionsCount: studentSessions.length,
        reviewsCount: studentReviews.length,
        distinctReviewedCards,
        totalAssignedCards,
        completionPct,
        lastSeenAt,
        lastStudyAt,
        realtimeStatus: realtime.status,
        realtimeLabel: realtime.label,
      };
    });

    // 7. GV1 – TỔNG QUAN LỚP & KHU VỰC LƯU LƯỢNG TRUY CẬP
    const totalStudents = studentMetricsList.length;
    const visitedStudents = studentMetricsList.filter(
      (s) => s.visitsCount > 0 || s.presenceSec > 0
    ).length;
    const studiedStudents = studentMetricsList.filter(
      (s) => s.reviewsCount > 0 || s.sessionsCount > 0
    ).length;
    const notStudiedStudents = Math.max(0, totalStudents - studiedStudents);
    const totalReviews = studentMetricsList.reduce((acc, s) => acc + s.reviewsCount, 0);

    const gv1Overview = {
      totalStudents,
      visitedStudents,
      studiedStudents,
      notStudiedStudents,
      totalReviews,
      assignedDecksCount: assignedDecks.length,
      participationRate: safePercent(studiedStudents, totalStudents),
      denominatorNote: `${studiedStudents} học viên có hoạt động học hợp lệ / ${totalStudents} học viên thuộc phạm vi lớp`,
    };

    const totalVisits = studentMetricsList.reduce((acc, s) => acc + s.visitsCount, 0);
    const totalPresenceSec = studentMetricsList.reduce((acc, s) => acc + s.presenceSec, 0);
    const totalActiveSec = studentMetricsList.reduce((acc, s) => acc + s.activeSec, 0);
    const totalStudySec = studentMetricsList.reduce((acc, s) => acc + s.studySec, 0);

    const trafficSummary = {
      totalVisits,
      uniqueVisitors: visitedStudents,
      pageViewsCount: pageViews.length,
      recentlyActiveUsers: studentMetricsList.filter(
        (s) => s.realtimeStatus === 'active' || s.realtimeStatus === 'studying'
      ).length,
      recentlyStudyingUsers: studentMetricsList.filter(
        (s) => s.realtimeStatus === 'studying'
      ).length,
      totalPresenceSec,
      totalActiveSec,
      totalStudySec,
      avgVisitDurationSec:
        totalVisits > 0 ? Math.round(totalPresenceSec / totalVisits) : 0,
      visitedButNoStudyUsers: studentMetricsList.filter(
        (s) => (s.visitsCount > 0 || s.presenceSec > 0) && s.reviewsCount === 0 && s.sessionsCount === 0
      ).length,
    };

    // 8. LỌC, SẮP XẾP & PHÂN TRANG BẢNG LƯU LƯỢNG TRUY CẬP PHÍA MÁY CHỦ
    let filteredTrafficRows = studentMetricsList.filter((row) => {
      if (statusFilter !== 'all' && row.realtimeStatus !== statusFilter) {
        return false;
      }
      if (searchKeyword) {
        const matchName = row.fullName.toLowerCase().includes(searchKeyword);
        const matchCode = row.studentCode.toLowerCase().includes(searchKeyword);
        const matchEmail = row.email.toLowerCase().includes(searchKeyword);
        const matchClass = row.classes.some((c) =>
          c.toLowerCase().includes(searchKeyword)
        );
        if (!matchName && !matchCode && !matchEmail && !matchClass) return false;
      }
      return true;
    });

    filteredTrafficRows.sort((a: any, b: any) => {
      const valA = a[sortBy] ?? '';
      const valB = b[sortBy] ?? '';
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const totalTrafficRows = filteredTrafficRows.length;
    const paginatedTrafficRows = filteredTrafficRows.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

    // 9. GV3 – BẢNG TIẾN ĐỘ (MA TRẬN HỌC VIÊN × BỘ THẺ ĐƯỢC GIAO)
    const gv3ProgressMatrix = {
      decks: assignedDecks.map((d) => ({
        id: d.id,
        title: d.title,
        totalCards: Array.isArray(d.cards) ? d.cards.length : 0,
      })),
      students: studentMetricsList.map((student) => {
        const deckCells = assignedDecks.map((deck) => {
          const totalCards = Array.isArray(deck.cards) ? deck.cards.length : 0;
          const studentDeckProgress = cardProgressList.filter(
            (cp) => cp.user_id === student.studentId && cp.deck_id === deck.id
          );
          const reviewedDistinct = new Set(studentDeckProgress.map((cp) => cp.card_id)).size;
          const pct = safePercent(reviewedDistinct, totalCards);
          const lastStudied =
            studentDeckProgress.length > 0
              ? studentDeckProgress.reduce(
                  (latest, cp) => (cp.updated_at > latest ? cp.updated_at : latest),
                  studentDeckProgress[0].updated_at
                )
              : null;

          const status =
            reviewedDistinct === 0
              ? 'not_started'
              : reviewedDistinct >= totalCards && totalCards > 0
              ? 'completed'
              : 'in_progress';

          return {
            deckId: deck.id,
            reviewedDistinct,
            totalCards,
            completionPct: pct,
            status,
            lastStudiedAt: lastStudied,
          };
        });

        return {
          studentId: student.studentId,
          fullName: student.fullName,
          studentCode: student.studentCode,
          classes: student.classes,
          cells: deckCells,
        };
      }),
    };

    // 10. GV4 – BIỂU ĐỒ LỚP THEO NGÀY / TUẦN / THÁNG
    const timelineBuckets = new Map<
      string,
      { bucket: string; studentsSet: Set<string>; reviewsCount: number; studySec: number }
    >();

    const getBucketKey = (dateStr: string) => {
      if (chartGranularity === 'month') return dateStr.slice(0, 7); // YYYY-MM
      if (chartGranularity === 'week') {
        const d = new Date(`${dateStr}T00:00:00+07:00`);
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
        return `Tuần ${d.toISOString().slice(0, 10)}`;
      }
      return dateStr;
    };

    reviews.forEach((r) => {
      const dateKey = toVNDateKey(r.reviewed_at);
      const bKey = getBucketKey(dateKey);
      const item = timelineBuckets.get(bKey) || {
        bucket: bKey,
        studentsSet: new Set<string>(),
        reviewsCount: 0,
        studySec: 0,
      };
      item.studentsSet.add(r.user_id);
      item.reviewsCount += 1;
      timelineBuckets.set(bKey, item);
    });

    sessions.forEach((s) => {
      const dateKey = toVNDateKey(s.started_at);
      const bKey = getBucketKey(dateKey);
      const item = timelineBuckets.get(bKey) || {
        bucket: bKey,
        studentsSet: new Set<string>(),
        reviewsCount: 0,
        studySec: 0,
      };
      item.studentsSet.add(s.user_id);
      item.studySec += Number(s.duration_sec || 0);
      timelineBuckets.set(bKey, item);
    });

    const gv4Timeline = Array.from(timelineBuckets.values())
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((item) => ({
        bucket: item.bucket,
        activeLearners: item.studentsSet.size,
        reviewsCount: item.reviewsCount,
        studyMinutes: Math.round((item.studySec / 60) * 10) / 10,
      }));

    // 11. GV5 – TỪ VỰNG KHÓ (Xếp theo tỷ lệ "Chưa nhớ" kèm số lượt đánh giá & số học viên đã ôn)
    const cardLookup = new Map<
      string,
      { id: string; term: string; definition: string; deckTitle: string }
    >();
    assignedDecks.forEach((d) => {
      (Array.isArray(d.cards) ? d.cards : []).forEach((c: any) => {
        cardLookup.set(c.id, {
          id: c.id,
          term: c.term,
          definition: c.definition,
          deckTitle: d.title,
        });
      });
    });

    const hardWordMap = new Map<
      string,
      { totalReviews: number; forgotCount: number; studentsSet: Set<string> }
    >();

    reviews.forEach((r) => {
      if (!cardLookup.has(r.card_id)) return;
      const entry = hardWordMap.get(r.card_id) || {
        totalReviews: 0,
        forgotCount: 0,
        studentsSet: new Set<string>(),
      };
      entry.totalReviews += 1;
      if (!r.is_remembered || Number(r.grade) < 3) {
        entry.forgotCount += 1;
      }
      entry.studentsSet.add(r.user_id);
      hardWordMap.set(r.card_id, entry);
    });

    const gv5HardWords = Array.from(hardWordMap.entries())
      .map(([cardId, stats]) => {
        const meta = cardLookup.get(cardId)!;
        const unrememberedRate = safePercent(stats.forgotCount, stats.totalReviews);
        return {
          cardId,
          term: meta.term,
          definition: meta.definition,
          deckTitle: meta.deckTitle,
          totalEvaluations: stats.totalReviews,
          forgotCount: stats.forgotCount,
          uniqueStudentsCount: stats.studentsSet.size,
          unrememberedRate,
          lowSampleWarning: stats.totalReviews < 3 || stats.studentsSet.size < 2,
        };
      })
      .sort((a, b) => b.unrememberedRate - a.unrememberedRate || b.totalEvaluations - a.totalEvaluations)
      .slice(0, 20);

    // 12. GV6 – PHÁT HIỆN HỌC VIÊN ÍT HOẠT ĐỘNG (Phân biệt rõ "có truy cập nhưng chưa học" với "không truy cập")
    const thresholdCutoffMs = nowMs - inactiveDaysThreshold * 86400 * 1000;
    const gv6InactiveList = studentMetricsList
      .map((s) => {
        const lastVisitMs = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : 0;
        const lastStudyMs = s.lastStudyAt ? new Date(s.lastStudyAt).getTime() : 0;

        let category:
          | 'visited_but_never_studied'
          | 'no_visit_in_days'
          | 'visited_recently_but_no_study_in_days'
          | 'active' = 'active';
        let reasonLabel = 'Đang duy trì học tập';

        if (lastVisitMs > 0 && lastStudyMs === 0) {
          category = 'visited_but_never_studied';
          reasonLabel = 'Có truy cập website nhưng chưa bắt đầu học';
        } else if (lastVisitMs === 0 || lastVisitMs < thresholdCutoffMs) {
          category = 'no_visit_in_days';
          reasonLabel = `Không truy cập trong ≥ ${inactiveDaysThreshold} ngày`;
        } else if (lastStudyMs < thresholdCutoffMs) {
          category = 'visited_recently_but_no_study_in_days';
          reasonLabel = `Có truy cập nhưng không học trong ≥ ${inactiveDaysThreshold} ngày`;
        }

        return {
          studentId: s.studentId,
          fullName: s.fullName,
          studentCode: s.studentCode,
          classes: s.classes,
          lastSeenAt: s.lastSeenAt,
          lastStudyAt: s.lastStudyAt,
          visitsCount: s.visitsCount,
          reviewsCount: s.reviewsCount,
          category,
          reasonLabel,
        };
      })
      .filter((item) => item.category !== 'active');

    // 13. GV7 – THEO DÕI BÀI ĐƯỢC GIAO (Dựa trên Snapshot thẻ tại thời điểm giao)
    const filteredAssignments =
      assignmentFilter === 'all'
        ? assignments
        : assignments.filter((a) => a.id === assignmentFilter);

    const gv7Assignments = filteredAssignments.map((assignment) => {
      const snapshotIds: string[] = Array.isArray(assignment.snapshot_card_ids)
        ? assignment.snapshot_card_ids
        : [];
      const dueMs = new Date(assignment.due_at).getTime();
      const courseEnrollments = enrollments.filter(
        (e) => e.course_id === assignment.course_id
      );

      let notStarted = 0;
      let inProgress = 0;
      let completedOnTime = 0;
      let completedLate = 0;
      let overdueIncomplete = 0;

      const studentStatuses = courseEnrollments.map((enr) => {
        const stProgress = cardProgressList.filter(
          (cp) =>
            cp.user_id === enr.student_id &&
            snapshotIds.includes(cp.card_id)
        );
        const doneCount = new Set(stProgress.map((cp) => cp.card_id)).size;
        const totalSnapshot = snapshotIds.length;
        const pct = safePercent(doneCount, totalSnapshot);
        const latestUpdateMs =
          stProgress.length > 0
            ? Math.max(...stProgress.map((cp) => new Date(cp.updated_at).getTime()))
            : 0;

        let state:
          | 'not_started'
          | 'in_progress'
          | 'completed_on_time'
          | 'completed_late'
          | 'overdue_incomplete' = 'not_started';

        if (doneCount >= totalSnapshot && totalSnapshot > 0) {
          if (latestUpdateMs <= dueMs) {
            state = 'completed_on_time';
            completedOnTime += 1;
          } else {
            state = 'completed_late';
            completedLate += 1;
          }
        } else if (nowMs > dueMs) {
          state = 'overdue_incomplete';
          overdueIncomplete += 1;
        } else if (doneCount === 0) {
          state = 'not_started';
          notStarted += 1;
        } else {
          state = 'in_progress';
          inProgress += 1;
        }

        const profile = profileMap.get(enr.student_id);
        return {
          studentId: enr.student_id,
          fullName: profile?.full_name || 'Học viên',
          studentCode: profile?.student_code || '',
          doneCount,
          totalSnapshot,
          completionPct: pct,
          state,
          lastUpdatedAt: latestUpdateMs ? new Date(latestUpdateMs).toISOString() : null,
        };
      });

      return {
        id: assignment.id,
        title: assignment.title,
        courseId: assignment.course_id,
        courseTitle: courseTitleMap.get(assignment.course_id) || 'Lớp học',
        deckId: assignment.deck_id,
        dueAt: assignment.due_at,
        snapshotCount: snapshotIds.length,
        notStarted,
        inProgress,
        completedOnTime,
        completedLate,
        overdueIncomplete,
        studentStatuses,
      };
    });

    // 14. GV8 – BÀI KIỂM TRA (Chọn 1 quy tắc duy nhất: first | latest | highest, không trộn lẫn)
    const attemptsByStudentQuiz = new Map<string, any[]>();
    quizAttempts.forEach((att) => {
      const key = `${att.quiz_id}__${att.user_id}`;
      const list = attemptsByStudentQuiz.get(key) || [];
      list.push(att);
      attemptsByStudentQuiz.set(key, list);
    });

    const selectedAttempts: any[] = [];
    attemptsByStudentQuiz.forEach((list) => {
      const sortedByTime = [...list].sort(
        (a, b) =>
          new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
      );
      if (quizRule === 'first') {
        selectedAttempts.push(sortedByTime[0]);
      } else if (quizRule === 'latest') {
        selectedAttempts.push(sortedByTime[sortedByTime.length - 1]);
      } else {
        const highest = [...sortedByTime].sort((a, b) => b.score - a.score)[0];
        selectedAttempts.push(highest);
      }
    });

    const avgQuizScore =
      selectedAttempts.length > 0
        ? Math.round(
            (selectedAttempts.reduce((acc, a) => acc + Number(a.score || 0), 0) /
              selectedAttempts.length) *
              10
          ) / 10
        : null;

    const scoreDistribution = [
      { range: '0 - 4.9 (Yếu)', count: selectedAttempts.filter((a) => a.score < 5).length },
      {
        range: '5.0 - 6.9 (Trung bình)',
        count: selectedAttempts.filter((a) => a.score >= 5 && a.score < 7).length,
      },
      {
        range: '7.0 - 8.4 (Khá)',
        count: selectedAttempts.filter((a) => a.score >= 7 && a.score < 8.5).length,
      },
      {
        range: '8.5 - 10 (Giỏi)',
        count: selectedAttempts.filter((a) => a.score >= 8.5).length,
      },
    ];

    const questionStatMap = new Map<
      string,
      { term: string; total: number; correct: number }
    >();
    selectedAttempts.forEach((att) => {
      const ansList: any[] = Array.isArray(att.answers) ? att.answers : [];
      ansList.forEach((ans) => {
        const item = questionStatMap.get(ans.card_id) || {
          term: ans.term || 'Câu hỏi',
          total: 0,
          correct: 0,
        };
        item.total += 1;
        if (ans.is_correct) item.correct += 1;
        questionStatMap.set(ans.card_id, item);
      });
    });

    const gv8Quizzes = {
      ruleApplied: quizRule,
      summary: {
        totalQuizzes: quizzes.length,
        totalAttemptsRaw: quizAttempts.length,
        evaluatedStudentsCount: selectedAttempts.length,
        avgScore: avgQuizScore,
      },
      distribution: scoreDistribution,
      questionStats: Array.from(questionStatMap.entries()).map(([cardId, st]) => ({
        cardId,
        term: st.term,
        attemptsCount: st.total,
        correctRate: safePercent(st.correct, st.total),
      })),
      attempts: selectedAttempts.slice(0, 25).map((att) => {
        const p = profileMap.get(att.user_id);
        return {
          id: att.id,
          studentName: p?.full_name || 'Học viên',
          studentCode: p?.student_code || '',
          score: att.score,
          correctCount: att.correct_count,
          totalQuestions: att.total_questions,
          durationSec: att.duration_sec,
          submittedAt: att.submitted_at,
        };
      }),
    };

    // 15. GV9 – SO SÁNH LỚP (Hiển thị quy mô mỗi lớp & chỉ số bình quân trên cùng khoảng thời gian)
    const gv9ClassComparison = allowedCourses.map((course) => {
      const classStudentIds = Array.from(
        new Set(
          enrollments
            .filter((e) => e.course_id === course.id)
            .map((e) => e.student_id)
        )
      );
      const classSize = classStudentIds.length;
      const classStudentsMetrics = studentMetricsList.filter((s) =>
        classStudentIds.includes(s.studentId)
      );

      const activeLearners = classStudentsMetrics.filter(
        (s) => s.reviewsCount > 0 || s.sessionsCount > 0
      ).length;
      const avgCompletionPct =
        classSize > 0
          ? Math.round(
              (classStudentsMetrics.reduce((acc, s) => acc + s.completionPct, 0) /
                classSize) *
                10
            ) / 10
          : 0;
      const avgStudySec =
        classSize > 0
          ? Math.round(
              classStudentsMetrics.reduce((acc, s) => acc + s.studySec, 0) / classSize
            )
          : 0;

      const classQuizAttempts = selectedAttempts.filter(
        (a) => a.course_id === course.id
      );
      const avgQuiz =
        classQuizAttempts.length > 0
          ? Math.round(
              (classQuizAttempts.reduce((acc, a) => acc + Number(a.score || 0), 0) /
                classQuizAttempts.length) *
                10
            ) / 10
          : null;

      return {
        courseId: course.id,
        courseTitle: course.title,
        classSize,
        activeLearners,
        participationRate: safePercent(activeLearners, classSize),
        avgCompletionPct,
        avgStudySec,
        avgQuizScore: avgQuiz,
      };
    });

    // 16. GV10 – XẾP HẠNG ĐƠN TIÊU CHÍ (Giữ riêng từng tiêu chí, không gộp điểm tổng hợp, không lấy thời gian mở web làm tiêu chí học tốt)
    const studentBestQuizMap = new Map<string, number>();
    selectedAttempts.forEach((att) => {
      const prev = studentBestQuizMap.get(att.user_id);
      if (prev === undefined || att.score > prev) {
        studentBestQuizMap.set(att.user_id, att.score);
      }
    });

    const gv10Ranking = studentMetricsList
      .map((s) => ({
        studentId: s.studentId,
        fullName: s.fullName,
        studentCode: s.studentCode,
        classes: s.classes,
        completionPct: s.completionPct,
        distinctReviewedCards: s.distinctReviewedCards,
        totalAssignedCards: s.totalAssignedCards,
        studyDaysCount: s.studyDaysCount,
        quizScore: studentBestQuizMap.get(s.studentId) ?? null,
      }))
      .sort((a, b) => {
        if (rankingMetric === 'completion') {
          return b.completionPct - a.completionPct || b.distinctReviewedCards - a.distinctReviewedCards;
        }
        if (rankingMetric === 'study_days') {
          return b.studyDaysCount - a.studyDaysCount;
        }
        const scoreA = a.quizScore ?? -1;
        const scoreB = b.quizScore ?? -1;
        return scoreB - scoreA;
      })
      .slice(0, 20);

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      signalThresholdSec,
      scopeMode,
      dateRange: { from: fromDateStr, to: toDateStr },
      courses: allowedCourses,
      decks: assignedDecks.map((d) => ({ id: d.id, title: d.title, course_id: d.course_id })),
      assignments: assignments.map((a) => ({ id: a.id, title: a.title, course_id: a.course_id })),
      quizzes: quizzes.map((q) => ({ id: q.id, title: q.title, course_id: q.course_id })),
      gv1Overview,
      trafficSummary,
      trafficTable: {
        rows: paginatedTrafficRows,
        total: totalTrafficRows,
        page,
        pageSize,
      },
      gv3ProgressMatrix,
      gv4Timeline,
      gv5HardWords,
      gv6InactiveList,
      gv7Assignments,
      gv8Quizzes,
      gv9ClassComparison,
      gv10Ranking,
    });
  } catch (err) {
    console.error('Teacher analytics error:', err);
    return NextResponse.json(
      { error: 'Không thể tải dữ liệu thống kê giảng viên.' },
      { status: 500 }
    );
  }
}