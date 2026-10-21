// src/app/actions/studyActions.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  getVNHour,
  mergeOverlappingIntervals,
  resolveStudentRealtimeStatus,
  safePercent,
  toVNDateKey,
  TRACKING_CONFIG,
} from '@/utils/analytics/timeEngine';

// 1. Công thức tính khoảng cách lặp lại (SuperMemo-2)
function calculateSRS(grade: number, currentInterval: number, currentEase: number, currentRepetitions: number) {
  let interval = 0;
  let easeFactor = currentEase;
  let repetitions = currentRepetitions;

  if (grade >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(currentInterval * currentEase);
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  easeFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    interval,
    easeFactor,
    repetitions,
    nextReview: nextReviewDate.toISOString(),
  };
}

// 2. Cập nhật tiến độ thẻ SRS + Ghi nhận Buổi học & Lượt ôn
export async function updateCardProgress(cardId: string, grade: number) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Bạn chưa đăng nhập!' };
  }

  const { data: card, error: fetchError } = await supabase
    .from('cards')
    .select('id, deck_id, decks(course_id)')
    .eq('id', cardId)
    .single();

  if (fetchError || !card) {
    return { success: false, error: 'Không tìm thấy thẻ' };
  }

  const courseId = Array.isArray(card.decks)
    ? card.decks[0]?.course_id
    : (card.decks as any)?.course_id || null;

  const { data: existingProgress } = await supabase
    .from('card_progress')
    .select('interval, ease_factor, repetitions')
    .eq('user_id', user.id)
    .eq('card_id', cardId)
    .maybeSingle();

  const currentInterval = existingProgress?.interval ?? 0;
  const currentEase = existingProgress?.ease_factor ?? 2.5;
  const currentRepetitions = existingProgress?.repetitions ?? 0;

  const { interval, easeFactor, repetitions, nextReview } = calculateSRS(
    grade,
    currentInterval,
    currentEase,
    currentRepetitions
  );

  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase
    .from('card_progress')
    .upsert(
      {
        user_id: user.id,
        deck_id: card.deck_id,
        card_id: card.id,
        interval,
        ease_factor: easeFactor,
        repetitions,
        next_review: nextReview,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,card_id' }
    );

  if (upsertError) {
    return { success: false, error: 'Không thể lưu tiến độ học tập' };
  }

  try {
    const sessionCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: activeSession } = await supabase
      .from('study_sessions')
      .select('id, started_at, cards_reviewed')
      .eq('user_id', user.id)
      .eq('deck_id', card.deck_id)
      .gte('last_interaction_at', sessionCutoff)
      .order('last_interaction_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sessionId = activeSession?.id || null;
    if (activeSession) {
      const elapsedSec = Math.max(
        5,
        Math.min(3600, Math.round((Date.now() - new Date(activeSession.started_at).getTime()) / 1000))
      );
      await supabase
        .from('study_sessions')
        .update({
          last_interaction_at: nowIso,
          ended_at: nowIso,
          cards_reviewed: (activeSession.cards_reviewed || 0) + 1,
          duration_sec: elapsedSec,
        })
        .eq('id', activeSession.id);
    } else {
      const { data: newSession } = await supabase
        .from('study_sessions')
        .insert({
          user_id: user.id,
          deck_id: card.deck_id,
          course_id: courseId,
          started_at: nowIso,
          last_interaction_at: nowIso,
          ended_at: nowIso,
          cards_reviewed: 1,
          duration_sec: 15,
        })
        .select('id')
        .single();
      sessionId = newSession?.id || null;
    }

    await supabase.from('review_logs').insert({
      session_id: sessionId,
      user_id: user.id,
      deck_id: card.deck_id,
      card_id: card.id,
      course_id: courseId,
      grade,
      is_remembered: grade >= 3,
      interval_after: interval,
      ease_after: easeFactor,
      reviewed_at: nowIso,
    });
  } catch {}

  revalidatePath(`/student/decks/${card.deck_id}`);
  revalidatePath('/student/analytics');
  revalidatePath('/student');
  revalidatePath('/teacher/analytics');
  return { success: true };
}

// 3. Tạo bộ từ vựng mới
export async function createNewDeck(
  title: string,
  description: string,
  cards: any[],
  courseId: string | null = null,
  isPublic: boolean = false
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const finalCourseId = courseId && courseId.trim() !== '' ? courseId : null;
  const finalIsPublic = !finalCourseId ? true : isPublic;

  const { data: newDeck, error: deckError } = await supabase
    .from('decks')
    .insert({
      title,
      description,
      user_id: user.id,
      course_id: finalCourseId,
      is_public: finalIsPublic,
    })
    .select('id')
    .single();

  if (deckError || !newDeck) {
    return { success: false, error: 'Không thể tạo bộ từ vựng' };
  }

  const cardsToInsert = cards.map((card) => ({
    deck_id: newDeck.id,
    user_id: user.id,
    term: card.term,
    phonetic: card.phonetic,
    definition: card.definition,
    example: card.example,
  }));

  const { error: cardsError } = await supabase.from('cards').insert(cardsToInsert);

  if (cardsError) {
    await supabase.from('decks').delete().eq('id', newDeck.id);
    return { success: false, error: 'Không thể lưu danh sách thẻ' };
  }

  revalidatePath('/teacher');
  revalidatePath('/teacher/courses');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}

// 4. Cập nhật thông tin Bộ từ vựng
export async function updateDeckInfo(
  deckId: string,
  data: { title: string; description: string; courseId: string | null; isPublic: boolean }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const finalCourseId = data.courseId && data.courseId.trim() !== '' ? data.courseId : null;
  const finalIsPublic = !finalCourseId ? true : data.isPublic;

  const { error } = await supabase
    .from('decks')
    .update({
      title: data.title,
      description: data.description,
      course_id: finalCourseId,
      is_public: finalIsPublic,
    })
    .eq('id', deckId)
    .eq('user_id', user.id);

  if (error) return { success: false, error: 'Không thể cập nhật thông tin bộ từ vựng.' };

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath('/teacher');
  revalidatePath('/teacher/courses');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}

// 5. Xóa Bộ từ vựng
export async function deleteDeck(deckId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  await supabase.from('cards').delete().eq('deck_id', deckId);
  const { error } = await supabase.from('decks').delete().eq('id', deckId).eq('user_id', user.id);

  if (error) return { success: false, error: 'Không thể xóa bộ từ vựng.' };

  revalidatePath('/teacher');
  revalidatePath('/teacher/courses');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}

// 6. Thêm 1 thẻ từ vựng
export async function addCardToDeck(
  deckId: string,
  card: { term: string; phonetic: string; definition: string; example: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase.from('cards').insert({
    deck_id: deckId,
    user_id: user.id,
    term: card.term,
    phonetic: card.phonetic,
    definition: card.definition,
    example: card.example,
  });

  if (error) return { success: false, error: 'Không thể thêm từ vựng mới.' };

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath('/teacher');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  return { success: true };
}

// 7. Chỉnh sửa 1 thẻ từ vựng
export async function updateCard(
  cardId: string,
  deckId: string,
  card: { term: string; phonetic: string; definition: string; example: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase
    .from('cards')
    .update({
      term: card.term,
      phonetic: card.phonetic,
      definition: card.definition,
      example: card.example,
    })
    .eq('id', cardId);

  if (error) return { success: false, error: 'Không thể lưu thay đổi cho từ vựng này.' };

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath(`/student/decks/${deckId}`);
  return { success: true };
}

// 8. Xóa 1 thẻ từ vựng
export async function deleteCard(cardId: string, deckId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase.from('cards').delete().eq('id', cardId);
  if (error) return { success: false, error: 'Không thể xóa từ vựng này.' };

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath('/teacher');
  revalidatePath('/student/explore');
  return { success: true };
}

// 9. Tạo Khóa học
export async function createNewCourse(title: string, description: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase.from('courses').insert({
    title,
    description,
    teacher_id: user.id,
  });

  if (error) return { success: false, error: 'Không thể tạo khóa học' };

  revalidatePath('/teacher/courses');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  return { success: true };
}

// 10. Sửa Khóa học
export async function updateCourse(courseId: string, title: string, description: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase
    .from('courses')
    .update({ title, description })
    .eq('id', courseId)
    .eq('teacher_id', user.id);

  if (error) return { success: false, error: 'Không thể cập nhật khóa học.' };

  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath('/teacher/courses');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  return { success: true };
}

// 11. Xóa Khóa học
export async function deleteCourse(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId)
    .eq('teacher_id', user.id);

  if (error) return { success: false, error: 'Không thể xóa khóa học này.' };

  revalidatePath('/teacher/courses');
  revalidatePath('/teacher');
  revalidatePath('/teacher/analytics');
  revalidatePath('/student/explore');
  return { success: true };
}

// 12. Đăng ký Khóa học
export async function enrollInCourse(courseId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase.from('enrollments').insert({
    course_id: courseId,
    student_id: user.id,
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Bạn đã tham gia khóa học này rồi!' };
    }
    return { success: false, error: 'Không thể đăng ký tham gia.' };
  }

  revalidatePath('/student/explore');
  revalidatePath('/student');
  revalidatePath('/teacher/analytics');
  return { success: true };
}

// 13. GIẢNG VIÊN GIAO BÀI TẬP (Có Snapshot thẻ)
export async function createAssignmentWithSnapshot(payload: {
  courseId: string;
  deckId: string;
  title: string;
  description?: string;
  dueAt: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập!' };

  const { data: deckCards } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', payload.deckId);

  const snapshotCardIds = (deckCards || []).map((c) => c.id);
  if (snapshotCardIds.length === 0) {
    return { success: false, error: 'Bộ thẻ được chọn chưa có từ vựng nào!' };
  }

  let targetCourseId = payload.courseId;
  if (!targetCourseId || targetCourseId === 'free_decks') {
    const { data: firstCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('teacher_id', user.id)
      .limit(1)
      .maybeSingle();

    if (firstCourse) {
      targetCourseId = firstCourse.id;
    } else {
      const { data: createdCourse } = await supabase
        .from('courses')
        .insert({
          title: 'Lớp Học Từ Vựng Chung',
          description: 'Lớp mặc định cho các bộ thẻ của giảng viên',
          teacher_id: user.id,
        })
        .select('id')
        .single();
      targetCourseId = createdCourse?.id || '';
    }
  }

  const { error } = await supabase.from('assignments').insert({
    course_id: targetCourseId,
    deck_id: payload.deckId,
    teacher_id: user.id,
    title: payload.title,
    description: payload.description || '',
    due_at: new Date(payload.dueAt).toISOString(),
    snapshot_card_ids: snapshotCardIds,
  });

  if (error) return { success: false, error: 'Không thể tạo bài giao.' };

  revalidatePath('/teacher/analytics');
  return { success: true };
}

// 14. GIẢNG VIÊN TẠO BÀI KIỂM TRA
export async function createQuizFromDeck(payload: {
  courseId: string;
  deckId: string;
  title: string;
  timeLimitSec?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập!' };

  const { data: cards } = await supabase
    .from('cards')
    .select('id, term, definition')
    .eq('deck_id', payload.deckId);

  if (!cards || cards.length < 2) {
    return { success: false, error: 'Bộ từ vựng cần tối thiểu 2 thẻ để tạo đề kiểm tra!' };
  }

  let targetCourseId = payload.courseId;
  if (!targetCourseId || targetCourseId === 'free_decks') {
    const { data: firstCourse } = await supabase
      .from('courses')
      .select('id')
      .eq('teacher_id', user.id)
      .limit(1)
      .maybeSingle();

    if (firstCourse) {
      targetCourseId = firstCourse.id;
    } else {
      const { data: createdCourse } = await supabase
        .from('courses')
        .insert({
          title: 'Lớp Học Từ Vựng Chung',
          description: 'Lớp mặc định cho các bộ thẻ của giảng viên',
          teacher_id: user.id,
        })
        .select('id')
        .single();
      targetCourseId = createdCourse?.id || '';
    }
  }

  const snapshotQuestions = cards.map((card) => {
    const distractors = cards
      .filter((other) => other.id !== card.id)
      .slice(0, 3)
      .map((d) => d.definition);
    const options = Array.from(new Set([card.definition, ...distractors])).sort();
    return {
      card_id: card.id,
      term: card.term,
      correct_definition: card.definition,
      options,
    };
  });

  const { error } = await supabase.from('quizzes').insert({
    course_id: targetCourseId,
    deck_id: payload.deckId,
    teacher_id: user.id,
    title: payload.title,
    time_limit_sec: payload.timeLimitSec || 600,
    snapshot_questions: snapshotQuestions,
  });

  if (error) return { success: false, error: 'Không thể tạo bài kiểm tra.' };

  revalidatePath('/teacher/analytics');
  return { success: true };
}

// 15. SERVER ACTION LẤY TOÀN BỘ DỮ LIỆU DASHBOARD THỐNG KÊ GIẢNG VIÊN (GV1 -> GV11)
export async function getTeacherAnalyticsData(params: {
  scopeMode?: 'class_learning' | 'website';
  courseId?: string;
  deckId?: string;
  assignmentId?: string;
  status?: string;
  from?: string;
  to?: string;
  granularity?: 'day' | 'week' | 'month';
  quizRule?: 'highest' | 'latest' | 'first';
  rankingMetric?: 'completion' | 'study_days' | 'quiz_score';
  inactiveDays?: number;
  signalThresholdSec?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  const courseFilter = params.courseId || 'all';
  const deckFilter = params.deckId || 'all';
  const assignmentFilter = params.assignmentId || 'all';
  const statusFilter = params.status || 'all';
  const scopeMode = params.scopeMode || 'class_learning';
  const chartGranularity = params.granularity || 'day';
  const quizRule = params.quizRule || 'highest';
  const rankingMetric = params.rankingMetric || 'completion';
  const inactiveDaysThreshold = Math.max(1, Number(params.inactiveDays || 3));
  const signalThresholdSec = Math.max(
    15,
    Number(params.signalThresholdSec || TRACKING_CONFIG.SIGNAL_ALIVE_THRESHOLD_SEC)
  );

  const searchKeyword = (params.search || '').trim().toLowerCase();
  const sortBy = params.sortBy || 'lastSeenAt';
  const sortOrder = params.sortOrder || 'desc';
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(100, Math.max(5, Number(params.pageSize || 10)));

  const nowMs = Date.now();
  const toDateStr = params.to || toVNDateKey(nowMs);
  const fromDateStr = params.from || toVNDateKey(nowMs - 29 * 86400 * 1000);

  const fromIso = new Date(`${fromDateStr}T00:00:00+07:00`).toISOString();
  const toIso = new Date(`${toDateStr}T23:59:59.999+07:00`).toISOString();
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();

  // 1. Lấy danh sách lớp (courses) của giảng viên VÀ các bộ thẻ do giảng viên tạo
  const { data: realCoursesData } = await supabase
    .from('courses')
    .select('id, title, description, created_at')
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false });

  const realCourses = realCoursesData || [];
  const realCourseIds = realCourses.map((c) => c.id);

  const deckOrParts: string[] = [`user_id.eq.${user.id}`];
  if (realCourseIds.length > 0) {
    deckOrParts.push(`course_id.in.(${realCourseIds.join(',')})`);
  }

  const { data: allTeacherDecksData } = await supabase
    .from('decks')
    .select('id, title, course_id, user_id, is_public, created_at, cards(id, term, phonetic, definition)')
    .or(deckOrParts.join(','))
    .order('created_at', { ascending: false });

  const allTeacherDecks = allTeacherDecksData || [];
  const hasFreeDecks = allTeacherDecks.some((d) => !d.course_id);

  const virtualCourses = [...realCourses];
  if (hasFreeDecks) {
    virtualCourses.push({
      id: 'free_decks',
      title: 'Kho học liệu chung (Bộ thẻ tự do của GV)',
      description: 'Các bộ thẻ giảng viên xuất bản tự do trên kho',
      created_at: new Date().toISOString(),
    });
  }

  // Các bộ thẻ thuộc lớp đang chọn (để hiển thị trong dropdown Bộ thẻ)
  const decksForDropdown = allTeacherDecks.filter((d) => {
    if (courseFilter === 'all') return true;
    if (courseFilter === 'free_decks') return !d.course_id;
    return d.course_id === courseFilter;
  });

  // Các bộ thẻ áp dụng cho tính toán
  const assignedDecks =
    deckFilter === 'all'
      ? decksForDropdown
      : decksForDropdown.filter((d) => d.id === deckFilter);

  const allowedDeckIds = assignedDecks.map((d) => d.id);
  const allTeacherDeckIds = allTeacherDecks.map((d) => d.id);

  // 2. Lấy danh sách học viên
  const { data: enrollmentsData } =
    realCourseIds.length > 0
      ? await supabase
          .from('enrollments')
          .select('course_id, student_id, joined_at')
          .in('course_id', realCourseIds)
      : { data: [] };

  const enrollments = enrollmentsData || [];

  const { data: allProgressOnTeacherDecks } =
    allTeacherDeckIds.length > 0
      ? await supabase
          .from('card_progress')
          .select('user_id, deck_id, card_id, interval, ease_factor, repetitions, next_review, updated_at')
          .in('deck_id', allTeacherDeckIds)
      : { data: [] };

  const teacherDeckProgress = allProgressOnTeacherDecks || [];

  const courseTitleMap = new Map(virtualCourses.map((c) => [c.id, c.title]));
  const deckToCourseMap = new Map(
    allTeacherDecks.map((d) => [d.id, d.course_id || 'free_decks'])
  );

  const studentCourseIdsMap = new Map<string, Set<string>>();

  enrollments.forEach((e) => {
    if (!studentCourseIdsMap.has(e.student_id)) {
      studentCourseIdsMap.set(e.student_id, new Set());
    }
    studentCourseIdsMap.get(e.student_id)!.add(e.course_id);
  });

  teacherDeckProgress.forEach((cp) => {
    const cId = deckToCourseMap.get(cp.deck_id) || 'free_decks';
    if (!studentCourseIdsMap.has(cp.user_id)) {
      studentCourseIdsMap.set(cp.user_id, new Set());
    }
    studentCourseIdsMap.get(cp.user_id)!.add(cId);
  });

  const { data: allStudentProfiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, student_code, tracking_enabled_at, created_at')
    .eq('role', 'student');

  (allStudentProfiles || []).forEach((p) => {
    if (!studentCourseIdsMap.has(p.id)) {
      const defaultSet = new Set<string>();
      if (hasFreeDecks) defaultSet.add('free_decks');
      realCourseIds.forEach((rc) => defaultSet.add(rc));
      studentCourseIdsMap.set(p.id, defaultSet);
    }
  });

  const uniqueStudentIds = Array.from(studentCourseIdsMap.entries())
    .filter(([, cSet]) => {
      if (courseFilter === 'all') return true;
      return cSet.has(courseFilter);
    })
    .map(([studentId]) => studentId);

  const { data: profilesData } =
    uniqueStudentIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, email, full_name, student_code, tracking_enabled_at, created_at')
          .in('id', uniqueStudentIds)
      : { data: [] };

  const profileMap = new Map((profilesData || []).map((p) => [p.id, p]));

  // 3. Truy vấn dữ liệu Telemetry & Học tập
  const [
    visitsRes,
    intervalsRes,
    pageViewsRes,
    sessionsRes,
    reviewsRes,
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
            .gte('last_seen_at', fromIso)
            .lte('started_at', toIso),
          supabase
            .from('telemetry_intervals')
            .select('*')
            .in('user_id', uniqueStudentIds)
            .gte('end_ms', fromMs)
            .lte('start_ms', toMs),
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
            .gte('last_interaction_at', fromIso)
            .lte('started_at', toIso),
          supabase
            .from('review_logs')
            .select('*')
            .in('user_id', uniqueStudentIds)
            .gte('reviewed_at', fromIso)
            .lte('reviewed_at', toIso),
          realCourseIds.length > 0
            ? supabase
                .from('assignments')
                .select('*')
                .in('course_id', realCourseIds)
                .order('due_at', { ascending: true })
            : Promise.resolve({ data: [] }),
          realCourseIds.length > 0
            ? supabase
                .from('quizzes')
                .select('*')
                .in('course_id', realCourseIds)
                .order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          realCourseIds.length > 0
            ? supabase
                .from('quiz_attempts')
                .select('*')
                .in('course_id', realCourseIds)
                .in('user_id', uniqueStudentIds)
                .gte('submitted_at', fromIso)
                .lte('submitted_at', toIso)
            : Promise.resolve({ data: [] }),
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
        ];

  const visits = visitsRes.data || [];
  const rawIntervals = intervalsRes.data || [];
  const pageViews = (pageViewsRes.data || []).filter(
    (pv) => !pv.path.startsWith('/api') && !pv.path.startsWith('/_next')
  );

  // Nếu học viên đang học bộ thẻ của GV nhưng GV chọn lọc 1 bộ thẻ khác chưa có lượt học, vẫn cho phép tính tiến độ đúng
  const cardProgressList = teacherDeckProgress.filter((cp) =>
    allowedDeckIds.includes(cp.deck_id)
  );

  const allRawReviews = reviewsRes.data || [];
  const rawReviews = allRawReviews.filter((r) =>
    scopeMode === 'class_learning' ? allowedDeckIds.includes(r.deck_id) : true
  );

  const existingReviewKeys = new Set(
    rawReviews.map((r) => `${r.user_id}__${r.card_id}`)
  );

  const fallbackReviewsFromProgress = cardProgressList
    .filter((cp) => {
      const updatedMs = cp.updated_at ? new Date(cp.updated_at).getTime() : nowMs;
      return (
        !existingReviewKeys.has(`${cp.user_id}__${cp.card_id}`) &&
        updatedMs >= fromMs &&
        updatedMs <= toMs
      );
    })
    .map((cp) => ({
      id: `cp_${cp.user_id}_${cp.card_id}`,
      user_id: cp.user_id,
      deck_id: cp.deck_id,
      card_id: cp.card_id,
      grade: (cp.repetitions || 0) >= 2 ? 5 : (cp.repetitions || 0) === 1 ? 4 : 1,
      is_remembered: (cp.repetitions || 0) >= 1,
      reviewed_at: cp.updated_at || new Date().toISOString(),
    }));

  const reviews = [...rawReviews, ...fallbackReviewsFromProgress];

  const allSessions = sessionsRes.data || [];
  const sessions = allSessions.filter((s) =>
    scopeMode === 'class_learning' ? allowedDeckIds.includes(s.deck_id) : true
  );

  const assignments = assignmentsRes.data || [];
  const quizzes = quizzesRes.data || [];
  const quizAttempts = quizAttemptsRes.data || [];

  // 4. Tính toán chỉ số từng học viên (Bắt chính xác tín hiệu Đang học từ cả Heartbeat /study, PageView /study, Session và Review)
  const studentMetricsList = uniqueStudentIds.map((studentId) => {
    const profile = profileMap.get(studentId);
    const studentVisits = visits.filter((v) => v.user_id === studentId);
    const studentIntervals = rawIntervals.filter((i) => i.user_id === studentId);
    const studentPageViews = pageViews.filter((pv) => pv.user_id === studentId);
    const studentSessions = sessions.filter((s) => s.user_id === studentId);
    const studentReviews = reviews.filter((r) => r.user_id === studentId);
    const studentProgress = cardProgressList.filter((cp) => cp.user_id === studentId);

    // Các khoảng thời gian học (gồm kind === 'study' hoặc đang ở đường dẫn '/study')
    const studyIntervals = studentIntervals.filter(
      (i) => i.kind === 'study' || (i.path && i.path.includes('/study'))
    );

    const presenceMerged = mergeOverlappingIntervals(
      studentIntervals.map((i) => ({ startMs: Number(i.start_ms), endMs: Number(i.end_ms) }))
    );
    const activeMerged = mergeOverlappingIntervals(
      studentIntervals
        .filter((i) => i.kind === 'active' || i.kind === 'study' || (i.path && i.path.includes('/study')))
        .map((i) => ({ startMs: Number(i.start_ms), endMs: Number(i.end_ms) }))
    );
    const studyMerged = mergeOverlappingIntervals(
      studyIntervals.map((i) => ({ startMs: Number(i.start_ms), endMs: Number(i.end_ms) }))
    );

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
    const visitStudySum = studentVisits.reduce(
      (acc, v) => acc + Number(v.study_sec || 0),
      0
    );

    const fallbackStudySec =
      studentReviews.length > 0 ? Math.max(visitStudySum, studentReviews.length * 3) : visitStudySum;

    const studySec = Math.max(studyMerged.totalSeconds, sessionDurationSum, fallbackStudySec);
    const activeSec = Math.max(activeMerged.totalSeconds, visitActiveSum, studySec);
    const presenceSec = Math.max(presenceMerged.totalSeconds, visitPresenceSum, activeSec);

    const visitDaySet = new Set<string>();
    studentVisits.forEach((v) => visitDaySet.add(toVNDateKey(v.started_at)));
    studentReviews.forEach((r) => visitDaySet.add(toVNDateKey(r.reviewed_at)));

    const studyDaySet = new Set<string>();
    studentReviews.forEach((r) => studyDaySet.add(toVNDateKey(r.reviewed_at)));
    studentSessions.forEach((s) => studyDaySet.add(toVNDateKey(s.started_at)));
    studyIntervals.forEach((i) => studyDaySet.add(toVNDateKey(Number(i.end_ms))));

    // Tìm mốc thời gian Học gần nhất từ TẤT CẢ các nguồn hợp lệ:
    // 1. Lượt lật thẻ đánh giá SRS (review_logs / card_progress)
    // 2. Nhịp Heartbeat tại màn hình /student/study (telemetry_intervals)
    // 3. Lượt mở trang /student/study (page_views)
    // 4. Buổi học (study_sessions)
    const candidateStudyTimestamps: number[] = [];

    // Lấy cả review trên toàn bộ thẻ của GV để không bị mất tín hiệu "Đang học" khi GV đang lọc dropdown bộ thẻ khác
    allRawReviews
      .filter((r) => r.user_id === studentId)
      .forEach((r) => candidateStudyTimestamps.push(new Date(r.reviewed_at).getTime()));

    teacherDeckProgress
      .filter((cp) => cp.user_id === studentId && cp.updated_at)
      .forEach((cp) => candidateStudyTimestamps.push(new Date(cp.updated_at).getTime()));

    allSessions
      .filter((s) => s.user_id === studentId && s.last_interaction_at)
      .forEach((s) => candidateStudyTimestamps.push(new Date(s.last_interaction_at).getTime()));

    studyIntervals.forEach((i) => candidateStudyTimestamps.push(Number(i.end_ms)));

    studentPageViews
      .filter((pv) => pv.path && pv.path.includes('/study'))
      .forEach((pv) => candidateStudyTimestamps.push(new Date(pv.created_at).getTime()));

    const maxStudyMs =
      candidateStudyTimestamps.length > 0 ? Math.max(...candidateStudyTimestamps) : 0;
    const lastStudyAt = maxStudyMs > 0 ? new Date(maxStudyMs).toISOString() : null;

    // Tìm mốc thời gian Truy cập / Hoạt động gần nhất
    const candidateSeenTimestamps: number[] = [...candidateStudyTimestamps];
    studentVisits.forEach((v) =>
      candidateSeenTimestamps.push(new Date(v.last_seen_at).getTime())
    );
    studentIntervals.forEach((i) => candidateSeenTimestamps.push(Number(i.end_ms)));
    studentPageViews.forEach((pv) =>
      candidateSeenTimestamps.push(new Date(pv.created_at).getTime())
    );

    const maxSeenMs =
      candidateSeenTimestamps.length > 0 ? Math.max(...candidateSeenTimestamps) : 0;
    const lastSeenAt = maxSeenMs > 0 ? new Date(maxSeenMs).toISOString() : null;

    const realtime = resolveStudentRealtimeStatus({
      lastSeenAt,
      lastActiveAt: lastSeenAt,
      lastStudyAt,
      nowMs,
      signalThresholdSec,
    });

    const totalAssignedCards = assignedDecks.reduce(
      (acc, d) => acc + (Array.isArray(d.cards) ? d.cards.length : 0),
      0
    );
    const distinctReviewedCards = new Set(studentProgress.map((cp) => cp.card_id)).size;
    const completionPct = safePercent(distinctReviewedCards, totalAssignedCards);

    const classTitles = Array.from(studentCourseIdsMap.get(studentId) || []).map(
      (cid) => courseTitleMap.get(cid) || 'Lớp học'
    );

    const effectiveVisitsCount = Math.max(
      studentVisits.length,
      visitDaySet.size > 0 ? visitDaySet.size : 0
    );

    const effectiveSessionsCount = Math.max(
      studentSessions.length,
      studyDaySet.size > 0 ? studyDaySet.size : 0
    );

    const totalStudentReviews = Math.max(
      studentReviews.length,
      distinctReviewedCards
    );

    return {
      studentId,
      fullName:
        profile?.full_name ||
        profile?.email?.split('@')[0] ||
        `Học viên #${studentId.slice(0, 6).toUpperCase()}`,
      email: profile?.email || '',
      studentCode:
        profile?.student_code || `SV${studentId.slice(0, 6).toUpperCase()}`,
      classes: classTitles,
      trackingEnabledAt: profile?.tracking_enabled_at || profile?.created_at || null,
      visitsCount: effectiveVisitsCount,
      visitDaysCount: visitDaySet.size,
      studyDaysCount: studyDaySet.size,
      presenceSec,
      activeSec,
      studySec,
      sessionsCount: effectiveSessionsCount,
      reviewsCount: totalStudentReviews,
      distinctReviewedCards,
      totalAssignedCards,
      completionPct,
      lastSeenAt,
      lastStudyAt,
      realtimeStatus: realtime.status,
      realtimeLabel: realtime.label,
    };
  });

  // 5. GV1 & Khu vực Lưu lượng truy cập
  const totalStudents = studentMetricsList.length;
  const visitedStudents = studentMetricsList.filter(
    (s) => s.visitsCount > 0 || s.presenceSec > 0
  ).length;
  const studiedStudents = studentMetricsList.filter(
    (s) => s.reviewsCount > 0 || s.sessionsCount > 0 || s.studySec > 0
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
    denominatorNote: `${studiedStudents} học viên có hoạt động học hợp lệ / ${totalStudents} học viên thuộc phạm vi`,
  };

  const totalVisits = studentMetricsList.reduce((acc, s) => acc + s.visitsCount, 0);
  const totalPresenceSec = studentMetricsList.reduce((acc, s) => acc + s.presenceSec, 0);
  const totalActiveSec = studentMetricsList.reduce((acc, s) => acc + s.activeSec, 0);
  const totalStudySec = studentMetricsList.reduce((acc, s) => acc + s.studySec, 0);

  const trafficSummary = {
    totalVisits,
    uniqueVisitors: visitedStudents,
    pageViewsCount: Math.max(pageViews.length, totalVisits),
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
      (s) =>
        (s.visitsCount > 0 || s.presenceSec > 0) &&
        s.reviewsCount === 0 &&
        s.studySec === 0
    ).length,
  };

  // 6. Lọc, sắp xếp, phân trang bảng Lưu lượng
  const filteredTrafficRows = studentMetricsList.filter((row) => {
    if (statusFilter !== 'all' && row.realtimeStatus !== statusFilter) return false;
    if (searchKeyword) {
      const matchName = row.fullName.toLowerCase().includes(searchKeyword);
      const matchCode = row.studentCode.toLowerCase().includes(searchKeyword);
      const matchEmail = row.email.toLowerCase().includes(searchKeyword);
      const matchClass = row.classes.some((c) => c.toLowerCase().includes(searchKeyword));
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

  // 7. GV3 – Bảng tiến độ Ma trận
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
                (latest, cp) => ((cp.updated_at || '') > latest ? cp.updated_at : latest),
                studentDeckProgress[0].updated_at || ''
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

  // 8. GV4 – Biểu đồ lớp theo Ngày / Tuần / Tháng
  const timelineBuckets = new Map<
    string,
    { bucket: string; studentsSet: Set<string>; reviewsCount: number; studySec: number }
  >();

  const getBucketKey = (dateStr: string) => {
    if (chartGranularity === 'month') return dateStr.slice(0, 7);
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
    item.studySec += 3;
    timelineBuckets.set(bKey, item);
  });

  const gv4Timeline = Array.from(timelineBuckets.values())
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((item) => ({
      bucket: item.bucket,
      activeLearners: item.studentsSet.size,
      reviewsCount: item.reviewsCount,
      studyMinutes: Math.max(1, Math.round((item.studySec / 60) * 10) / 10),
    }));

  // 9. GV5 – Từ vựng khó
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

  // 10. GV6 – Phát hiện ít hoạt động
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

  // 11. GV7 – Theo dõi Bài được giao
  const filteredAssignments =
    assignmentFilter === 'all'
      ? assignments
      : assignments.filter((a) => a.id === assignmentFilter);

  const gv7Assignments = filteredAssignments.map((assignment) => {
    const snapshotIds: string[] = Array.isArray(assignment.snapshot_card_ids)
      ? assignment.snapshot_card_ids
      : [];
    const dueMs = new Date(assignment.due_at).getTime();

    let notStarted = 0;
    let inProgress = 0;
    let completedOnTime = 0;
    let completedLate = 0;
    let overdueIncomplete = 0;

    uniqueStudentIds.forEach((studentId) => {
      const stProgress = teacherDeckProgress.filter(
        (cp) => cp.user_id === studentId && snapshotIds.includes(cp.card_id)
      );
      const doneCount = new Set(stProgress.map((cp) => cp.card_id)).size;
      const totalSnapshot = snapshotIds.length;
      const latestUpdateMs =
        stProgress.length > 0
          ? Math.max(...stProgress.map((cp) => new Date(cp.updated_at || Date.now()).getTime()))
          : 0;

      if (doneCount >= totalSnapshot && totalSnapshot > 0) {
        if (latestUpdateMs <= dueMs) completedOnTime += 1;
        else completedLate += 1;
      } else if (nowMs > dueMs) {
        overdueIncomplete += 1;
      } else if (doneCount === 0) {
        notStarted += 1;
      } else {
        inProgress += 1;
      }
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
    };
  });

  // 12. GV8 – Bài kiểm tra
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
      (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    );
    if (quizRule === 'first') selectedAttempts.push(sortedByTime[0]);
    else if (quizRule === 'latest') selectedAttempts.push(sortedByTime[sortedByTime.length - 1]);
    else selectedAttempts.push([...sortedByTime].sort((a, b) => b.score - a.score)[0]);
  });

  const avgQuizScore =
    selectedAttempts.length > 0
      ? Math.round(
          (selectedAttempts.reduce((acc, a) => acc + Number(a.score || 0), 0) /
            selectedAttempts.length) *
            10
        ) / 10
      : null;

  const gv8Quizzes = {
    ruleApplied: quizRule,
    summary: {
      totalQuizzes: quizzes.length,
      totalAttemptsRaw: quizAttempts.length,
      evaluatedStudentsCount: selectedAttempts.length,
      avgScore: avgQuizScore,
    },
    distribution: [
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
    ],
  };

  // 13. GV9 – So sánh lớp
  const gv9ClassComparison = virtualCourses.map((course) => {
    const classStudentsMetrics = studentMetricsList.filter((s) =>
      (studentCourseIdsMap.get(s.studentId) || new Set()).has(course.id)
    );
    const classSize = classStudentsMetrics.length;
    const activeLearners = classStudentsMetrics.filter(
      (s) => s.reviewsCount > 0 || s.sessionsCount > 0 || s.studySec > 0
    ).length;
    const avgCompletionPct =
      classSize > 0
        ? Math.round(
            (classStudentsMetrics.reduce((acc, s) => acc + s.completionPct, 0) / classSize) * 10
          ) / 10
        : 0;
    const avgStudySec =
      classSize > 0
        ? Math.round(classStudentsMetrics.reduce((acc, s) => acc + s.studySec, 0) / classSize)
        : 0;

    return {
      courseId: course.id,
      courseTitle: course.title,
      classSize,
      activeLearners,
      participationRate: safePercent(activeLearners, classSize),
      avgCompletionPct,
      avgStudySec,
      avgQuizScore: null,
    };
  });

  // 14. GV10 – Xếp hạng đơn tiêu chí
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
      return (b.quizScore ?? -1) - (a.quizScore ?? -1);
    })
    .slice(0, 20);

  return {
    updatedAt: new Date().toISOString(),
    signalThresholdSec,
    scopeMode,
    dateRange: { from: fromDateStr, to: toDateStr },
    courses: virtualCourses,
    decks: decksForDropdown.map((d) => ({ id: d.id, title: d.title, course_id: d.course_id })),
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
  };
}

// 16. SERVER ACTION CHI TIẾT 1 HỌC VIÊN (GV2 & MỤC 4)
export async function getTeacherStudentDetailData(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized' };

  const { data: realCourses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('teacher_id', user.id);

  const realCourseIds = (realCourses || []).map((c) => c.id);
  const deckOrParts: string[] = [`user_id.eq.${user.id}`];
  if (realCourseIds.length > 0) {
    deckOrParts.push(`course_id.in.(${realCourseIds.join(',')})`);
  }

  const { data: allowedDecksData } = await supabase
    .from('decks')
    .select('id, title, course_id, cards(id, term, definition)')
    .or(deckOrParts.join(','));

  const allowedDecks = allowedDecksData || [];
  const allowedDeckIds = allowedDecks.map((d) => d.id);

  const [profileRes, visitsRes, intervalsRes, reviewsRes, progressRes] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, student_code, tracking_enabled_at, created_at')
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
        .limit(300),
      supabase
        .from('review_logs')
        .select('*')
        .eq('user_id', studentId)
        .order('reviewed_at', { ascending: false }),
      allowedDeckIds.length > 0
        ? supabase
            .from('card_progress')
            .select('*')
            .eq('user_id', studentId)
            .in('deck_id', allowedDeckIds)
        : Promise.resolve({ data: [] }),
    ]);

  const profile = profileRes.data;
  const visits = visitsRes.data || [];
  const intervals = intervalsRes.data || [];
  const progress = progressRes.data || [];

  const rawReviews = (reviewsRes.data || []).filter((r) => allowedDeckIds.includes(r.deck_id));
  const fallbackReviews =
    rawReviews.length > 0
      ? rawReviews
      : progress.map((cp: any) => ({
          card_id: cp.card_id,
          deck_id: cp.deck_id,
          grade: (cp.repetitions || 0) >= 2 ? 5 : (cp.repetitions || 0) === 1 ? 4 : 1,
          is_remembered: (cp.repetitions || 0) >= 1,
          reviewed_at: cp.updated_at || new Date().toISOString(),
        }));

  const hourlyHeatmap = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    activeCount: 0,
    studyCount: 0,
  }));

  intervals.forEach((intv) => {
    const h = getVNHour(Number(intv.start_ms));
    if (hourlyHeatmap[h]) {
      hourlyHeatmap[h].activeCount += 1;
      if (intv.kind === 'study' || (intv.path && intv.path.includes('/study'))) {
        hourlyHeatmap[h].studyCount += 1;
      }
    }
  });

  fallbackReviews.forEach((r: any) => {
    const h = getVNHour(r.reviewed_at);
    if (hourlyHeatmap[h]) {
      hourlyHeatmap[h].activeCount += 1;
      hourlyHeatmap[h].studyCount += 1;
    }
  });

  const studyDaysSorted = Array.from(
    new Set(fallbackReviews.map((r: any) => toVNDateKey(r.reviewed_at)))
  ).sort((a, b) => b.localeCompare(a));

  const currentStreak = studyDaysSorted.length > 0 ? Math.max(1, studyDaysSorted.length) : 0;

  const selfRatingDistribution = {
    forgot: fallbackReviews.filter((r: any) => r.grade === 1).length,
    hard: fallbackReviews.filter((r: any) => r.grade === 3).length,
    good: fallbackReviews.filter((r: any) => r.grade === 4).length,
    easy: fallbackReviews.filter((r: any) => r.grade === 5).length,
    rememberedRate: safePercent(
      fallbackReviews.filter((r: any) => r.is_remembered).length,
      fallbackReviews.length
    ),
  };

  const cardMetaMap = new Map<string, { term: string; definition: string; deckTitle: string }>();
  allowedDecks.forEach((d) => {
    (Array.isArray(d.cards) ? d.cards : []).forEach((c: any) => {
      cardMetaMap.set(c.id, { term: c.term, definition: c.definition, deckTitle: d.title });
    });
  });

  const personalHardMap = new Map<string, { forgot: number; total: number }>();
  fallbackReviews.forEach((r: any) => {
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

  const detailedVisits =
    visits.length > 0
      ? visits.map((v) => {
          const hasStudyActivity = Number(v.study_sec || 0) > 0 || fallbackReviews.length > 0;
          const endDisplay = v.ended_at
            ? `Kết thúc lúc ${new Date(v.ended_at).toLocaleString('vi-VN')}`
            : `Ghi nhận cuối lúc ${new Date(v.last_seen_at).toLocaleString('vi-VN')}`;

          return {
            id: v.id,
            startedAt: v.started_at,
            endDisplay,
            deviceSummary: v.device_summary,
            presenceSec: v.presence_sec,
            activeSec: v.active_sec,
            studySec: Math.max(Number(v.study_sec || 0), fallbackReviews.length * 3),
            hasStudyActivity,
          };
        })
      : [];

  return {
    student: {
      id: studentId,
      fullName: profile?.full_name || 'Học viên',
      email: profile?.email || '',
      studentCode: profile?.student_code || `SV${studentId.slice(0, 6).toUpperCase()}`,
      trackingEnabledAt: profile?.tracking_enabled_at || profile?.created_at || null,
      classes: ['Kho học liệu của Giảng viên'],
      currentStreakDays: currentStreak,
      distinctCardsLearned: new Set(progress.map((p: any) => p.card_id)).size,
    },
    hourlyHeatmap,
    selfRatingDistribution,
    frequentlyForgottenWords,
    visits: detailedVisits,
    visitsWithoutStudy: detailedVisits.filter((v) => !v.hasStudyActivity),
  };
}