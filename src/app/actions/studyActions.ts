// src/app/actions/studyActions.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

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

// 2. Cập nhật tiến độ thẻ SRS + Ghi nhận Buổi học (study_sessions) & Lượt ôn (review_logs) dùng chung
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

  // Upsert tiến độ thẻ cá nhân
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

  // Tìm hoặc tạo Buổi học (study_sessions) trong 30 phút gần nhất cho bộ thẻ này
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
        duration_sec: 10,
      })
      .select('id')
      .single();
    sessionId = newSession?.id || null;
  }

  // Ghi log lượt ôn vào review_logs (phục vụ thống kê cả Học viên & Giảng viên)
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

  revalidatePath(`/student/decks/${card.deck_id}`);
  revalidatePath('/student/analytics');
  revalidatePath('/student');
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

// 9. Tạo Khóa học (Lớp học)
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
  return { success: true };
}

// 13. GIẢNG VIÊN GIAO BÀI TẬP (Tự động chốt Snapshot danh sách thẻ tại thời điểm giao)
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

  // Kiểm tra quyền sở hữu lớp của giảng viên
  const { data: course } = await supabase
    .from('courses')
    .select('id, teacher_id')
    .eq('id', payload.courseId)
    .eq('teacher_id', user.id)
    .maybeSingle();

  if (!course) {
    return { success: false, error: 'Bạn không có quyền giao bài cho lớp này!' };
  }

  // Lấy danh sách ID thẻ tại đúng thời điểm giao (Snapshot)
  const { data: deckCards } = await supabase
    .from('cards')
    .select('id')
    .eq('deck_id', payload.deckId);

  const snapshotCardIds = (deckCards || []).map((c) => c.id);
  if (snapshotCardIds.length === 0) {
    return { success: false, error: 'Bộ thẻ được chọn chưa có từ vựng nào!' };
  }

  const { error } = await supabase.from('assignments').insert({
    course_id: payload.courseId,
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

// 14. GIẢNG VIÊN TẠO BÀI KIỂM TRA TRẮC NGHIỆM TỪ BỘ THẺ (Có Snapshot câu hỏi)
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

  const { data: course } = await supabase
    .from('courses')
    .select('id, teacher_id')
    .eq('id', payload.courseId)
    .eq('teacher_id', user.id)
    .maybeSingle();

  if (!course) {
    return { success: false, error: 'Bạn không có quyền tạo bài kiểm tra cho lớp này!' };
  }

  const { data: cards } = await supabase
    .from('cards')
    .select('id, term, definition')
    .eq('deck_id', payload.deckId);

  if (!cards || cards.length < 2) {
    return { success: false, error: 'Bộ từ vựng cần tối thiểu 2 thẻ để tạo đề kiểm tra!' };
  }

  // Tạo Snapshot câu hỏi trắc nghiệm từ danh sách thẻ tại thời điểm tạo
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
    course_id: payload.courseId,
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

// 15. HỌC VIÊN NỘP BÀI KIỂM TRA
export async function submitQuizAttempt(payload: {
  quizId: string;
  answers: { card_id: string; selected: string }[];
  durationSec: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Chưa đăng nhập!' };

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('id, course_id, snapshot_questions')
    .eq('id', payload.quizId)
    .single();

  if (!quiz) return { success: false, error: 'Không tìm thấy bài kiểm tra!' };

  const questions: any[] = Array.isArray(quiz.snapshot_questions) ? quiz.snapshot_questions : [];
  let correctCount = 0;

  const gradedAnswers = questions.map((q) => {
    const found = payload.answers.find((a) => a.card_id === q.card_id);
    const selected = found?.selected || '';
    const isCorrect = selected === q.correct_definition;
    if (isCorrect) correctCount += 1;
    return {
      card_id: q.card_id,
      term: q.term,
      selected,
      correct_definition: q.correct_definition,
      is_correct: isCorrect,
    };
  });

  const totalQuestions = Math.max(1, questions.length);
  const score = Math.round((correctCount / totalQuestions) * 100) / 10; // Thang điểm 10

  const { error } = await supabase.from('quiz_attempts').insert({
    quiz_id: quiz.id,
    course_id: quiz.course_id,
    user_id: user.id,
    score,
    correct_count: correctCount,
    total_questions: totalQuestions,
    answers: gradedAnswers,
    duration_sec: payload.durationSec,
    submitted_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: 'Không thể nộp bài kiểm tra.' };

  revalidatePath('/student');
  revalidatePath('/teacher/analytics');
  return { success: true, score, correctCount, totalQuestions };
}