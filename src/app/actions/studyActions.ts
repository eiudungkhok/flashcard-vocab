// src/app/actions/studyActions.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

// 1. Công thức tính khoảng cách lặp lại (dựa trên thuật toán SuperMemo-2)
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

export interface ReviewTelemetryMeta {
  eventId?: string;
  studySessionId?: string | null;
  visitId?: string | null;
  durationMs?: number | null;
}

// 2. Hàm cập nhật tiến độ học 1 thẻ & Ghi nhận vào bảng review_logs + study_sessions
export async function updateCardProgress(cardId: string, grade: number, meta?: ReviewTelemetryMeta) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Bạn chưa đăng nhập!' };
  }

  const { data: card, error: fetchError } = await supabase
    .from('cards')
    .select('id, deck_id')
    .eq('id', cardId)
    .single();

  if (fetchError || !card) {
    console.error('Lỗi khi lấy thông tin thẻ:', fetchError);
    return { success: false, error: 'Không tìm thấy thẻ' };
  }

  // Lấy tiến độ hiện tại của RIÊNG học viên này trong bảng card_progress
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

  // Lưu tiến độ vào bảng card_progress của riêng học viên
  const { error: upsertError } = await supabase.from('card_progress').upsert(
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
    console.error('Lỗi khi lưu tiến độ cá nhân:', upsertError);
    return { success: false, error: 'Không thể lưu tiến độ học tập' };
  }

  // Ghi nhận vào bảng review_logs (Chống ghi trùng bằng event_id)
  const eventId = meta?.eventId || randomUUID();
  const isRemembered = grade >= 3;
  // Giới hạn thời gian suy nghĩ hợp lệ mỗi thẻ (tối đa 120s để không tính thời gian treo máy)
  const safeDurationMs =
    typeof meta?.durationMs === 'number' && meta.durationMs > 0
      ? Math.min(meta.durationMs, 120_000)
      : null;

  await supabase.from('review_logs').upsert(
    {
      event_id: eventId,
      user_id: user.id,
      study_session_id: meta?.studySessionId || null,
      visit_id: meta?.visitId || null,
      deck_id: card.deck_id,
      card_id: card.id,
      grade,
      is_remembered: isRemembered,
      duration_ms: safeDurationMs,
      interval_before: currentInterval,
      interval_after: interval,
      ease_before: currentEase,
      ease_after: easeFactor,
      reviewed_at: nowIso,
    },
    { onConflict: 'event_id', ignoreDuplicates: true }
  );

  // Đồng bộ thống kê cho buổi học (study_sessions) nếu có
  if (meta?.studySessionId) {
    const { data: sessionLogs } = await supabase
      .from('review_logs')
      .select('card_id, is_remembered')
      .eq('study_session_id', meta.studySessionId)
      .eq('user_id', user.id);

    if (sessionLogs) {
      const uniqueCards = new Set(sessionLogs.map((l) => l.card_id)).size;
      const totalReviews = sessionLogs.length;
      const remembered = sessionLogs.filter((l) => l.is_remembered).length;
      const forgotten = totalReviews - remembered;

      await supabase
        .from('study_sessions')
        .update({
          last_activity_at: nowIso,
          cards_studied_count: uniqueCards,
          reviews_count: totalReviews,
          remembered_count: remembered,
          forgotten_count: forgotten,
        })
        .eq('id', meta.studySessionId)
        .eq('user_id', user.id);
    }
  }

  revalidatePath('/student/study');
  revalidatePath(`/student/decks/${card.deck_id}`);
  revalidatePath('/student');
  revalidatePath('/student/analytics');
  return { success: true };
}

// 3. Hàm Lưu Mục tiêu học tập mỗi ngày của Học viên (HV9)
export async function saveStudentGoal(dailyCardsGoal: number, dailyMinutesGoal: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const cardsGoal = Math.max(1, Math.min(1000, Math.round(dailyCardsGoal)));
  const minutesGoal = Math.max(1, Math.min(720, Math.round(dailyMinutesGoal)));

  const { error } = await supabase.from('student_goals').upsert(
    {
      user_id: user.id,
      daily_cards_goal: cardsGoal,
      daily_minutes_goal: minutesGoal,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('Lỗi lưu mục tiêu:', error);
    return { success: false, error: 'Không thể lưu mục tiêu học tập.' };
  }

  revalidatePath('/student/analytics');
  revalidatePath('/student');
  return { success: true };
}

// 4. Hàm tạo bộ từ vựng mới
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
  if (!user) {
    return { success: false, error: 'Bạn chưa đăng nhập!' };
  }

  const finalCourseId = courseId && courseId.trim() !== '' ? courseId : null;
  const finalIsPublic = !finalCourseId ? true : isPublic;

  const { data: newDeck, error: deckError } = await supabase
    .from('decks')
    .insert({
      title: title,
      description: description,
      user_id: user.id,
      course_id: finalCourseId,
      is_public: finalIsPublic,
    })
    .select('id')
    .single();

  if (deckError || !newDeck) {
    console.error('Lỗi tạo bộ từ vựng:', deckError);
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
    console.error('Lỗi tạo thẻ:', cardsError);
    await supabase.from('decks').delete().eq('id', newDeck.id);
    return { success: false, error: 'Không thể lưu danh sách thẻ' };
  }

  revalidatePath('/teacher');
  revalidatePath('/teacher/courses');
  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}

// 5. Hàm Cập nhật thông tin Bộ từ vựng
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

  if (error) {
    console.error('Lỗi cập nhật bộ từ vựng:', error);
    return { success: false, error: 'Không thể cập nhật thông tin bộ từ vựng.' };
  }

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath('/teacher');
  revalidatePath('/teacher/courses');
  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}

// 6. Hàm Xóa Bộ từ vựng
export async function deleteDeck(deckId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  await supabase.from('cards').delete().eq('deck_id', deckId);

  const { error } = await supabase.from('decks').delete().eq('id', deckId).eq('user_id', user.id);

  if (error) {
    console.error('Lỗi xóa bộ từ vựng:', error);
    return { success: false, error: 'Không thể xóa bộ từ vựng.' };
  }

  revalidatePath('/teacher');
  revalidatePath('/teacher/courses');
  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}

// 7. Hàm Thêm 1 thẻ từ vựng lẻ vào Bộ từ vựng
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

  if (error) {
    console.error('Lỗi thêm thẻ:', error);
    return { success: false, error: 'Không thể thêm từ vựng mới.' };
  }

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath('/teacher');
  revalidatePath('/student/explore');
  return { success: true };
}

// 8. Hàm Chỉnh sửa nội dung 1 thẻ từ vựng
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

  if (error) {
    console.error('Lỗi cập nhật thẻ:', error);
    return { success: false, error: 'Không thể lưu thay đổi cho từ vựng này.' };
  }

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath(`/student/decks/${deckId}`);
  return { success: true };
}

// 9. Hàm Xóa 1 thẻ từ vựng lẻ
export async function deleteCard(cardId: string, deckId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase.from('cards').delete().eq('id', cardId);

  if (error) {
    console.error('Lỗi xóa thẻ:', error);
    return { success: false, error: 'Không thể xóa từ vựng này.' };
  }

  revalidatePath(`/teacher/decks/${deckId}`);
  revalidatePath('/teacher');
  revalidatePath('/student/explore');
  return { success: true };
}

// 10. Hàm tạo Khóa học mới
export async function createNewCourse(title: string, description: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Bạn chưa đăng nhập!' };
  }

  const { error } = await supabase.from('courses').insert({
    title: title,
    description: description,
    teacher_id: user.id,
  });

  if (error) {
    console.error('Lỗi tạo khóa học:', error);
    return { success: false, error: 'Không thể tạo khóa học' };
  }

  revalidatePath('/teacher/courses');
  revalidatePath('/student/explore');
  return { success: true };
}

// 11. Hàm Chỉnh sửa thông tin Khóa học
export async function updateCourse(courseId: string, title: string, description: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'Bạn chưa đăng nhập!' };

  const { error } = await supabase
    .from('courses')
    .update({
      title: title,
      description: description,
    })
    .eq('id', courseId)
    .eq('teacher_id', user.id);

  if (error) {
    console.error('Lỗi cập nhật khóa học:', error);
    return { success: false, error: 'Không thể cập nhật khóa học.' };
  }

  revalidatePath(`/teacher/courses/${courseId}`);
  revalidatePath('/teacher/courses');
  revalidatePath('/student/explore');
  return { success: true };
}

// 12. Hàm Xóa Khóa học
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

  if (error) {
    console.error('Lỗi xóa khóa học:', error);
    return { success: false, error: 'Không thể xóa khóa học này.' };
  }

  revalidatePath('/teacher/courses');
  revalidatePath('/teacher');
  revalidatePath('/student/explore');
  return { success: true };
}

// 13. Hàm Đăng ký Khóa học (dành cho Học viên)
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
    console.error('Lỗi đăng ký khóa học:', error);
    return { success: false, error: 'Không thể đăng ký tham gia.' };
  }

  revalidatePath('/student/explore');
  revalidatePath('/student');
  return { success: true };
}