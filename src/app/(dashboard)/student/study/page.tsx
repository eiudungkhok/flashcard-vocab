// src/app/(dashboard)/student/study/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import StudyClient from './StudyClient';
import { ArrowLeft, RotateCcw, CheckCircle2, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ deck?: string; mode?: string }>;
}

export default async function StudyPage({ searchParams }: PageProps) {
  const { deck: deckId, mode } = await searchParams;
  const isPracticeAll = mode === 'all';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  // Lấy toàn bộ tiến độ học của RIÊNG học viên này từ bảng card_progress
  const { data: myProgress } = user
    ? await supabase
        .from('card_progress')
        .select('card_id, deck_id, next_review')
        .eq('user_id', user.id)
    : { data: [] };

  const progressMap = new Map(
    (myProgress || []).map(item => [item.card_id, item.next_review])
  );

  const studiedDeckIds = Array.from(
    new Set((myProgress || []).map(item => item.deck_id))
  );

  const isCardDue = (cardId: string) => {
    const nextReview = progressMap.get(cardId);
    return !nextReview || nextReview <= now;
  };

  let deckTitle = 'Ôn tập từ vựng hôm nay';
  let allDeckCards: any[] = [];
  let cardsToStudy: any[] = [];

  if (deckId) {
    // Trường hợp 1: Học 1 bộ từ vựng cụ thể
    const { data: deck } = await supabase
      .from('decks')
      .select('id, title')
      .eq('id', deckId)
      .single();

    if (deck) {
      deckTitle = deck.title;
    }

    const { data: fetchedCards } = await supabase
      .from('cards')
      .select('id, deck_id, term, phonetic, definition, example')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true });

    allDeckCards = fetchedCards || [];

    if (isPracticeAll) {
      cardsToStudy = allDeckCards;
    } else {
      cardsToStudy = allDeckCards.filter(c => isCardDue(c.id));
    }
  } else {
    // Trường hợp 2: Bấm "Ôn tập hôm nay" từ menu (Tổng hợp cả Khóa học & Bộ từ tự do đã học)
    const { data: enrollments } = user
      ? await supabase
          .from('enrollments')
          .select('course_id')
          .eq('student_id', user.id)
      : { data: [] };

    const enrolledCourseIds = enrollments?.map(e => e.course_id) || [];

    const orConditions: string[] = [];
    if (user?.id) orConditions.push(`user_id.eq.${user.id}`);
    if (enrolledCourseIds.length > 0) orConditions.push(`course_id.in.(${enrolledCourseIds.join(',')})`);
    if (studiedDeckIds.length > 0) orConditions.push(`id.in.(${studiedDeckIds.join(',')})`);

    const { data: decks } = orConditions.length > 0
      ? await supabase.from('decks').select('id').or(orConditions.join(','))
      : { data: [] };

    const deckIds = decks?.map(d => d.id) || [];

    if (deckIds.length > 0) {
      const { data: fetchedCards } = await supabase
        .from('cards')
        .select('id, deck_id, term, phonetic, definition, example')
        .in('deck_id', deckIds);

      allDeckCards = fetchedCards || [];
      cardsToStudy = allDeckCards.filter(c => isCardDue(c.id));
    }
  }

  // Màn hình 1: Bộ từ vựng có thẻ, nhưng học viên ĐÃ ÔN HẾT các thẻ đến hạn hôm nay
  if (allDeckCards.length > 0 && cardsToStudy.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12 animate-in fade-in duration-500">
        <div className="bg-white p-10 rounded-3xl shadow-sm border border-green-100 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-5">
            <CheckCircle2 size={44} />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
            Tuyệt vời! Bạn đã ôn hết từ vựng hôm nay 🎉
          </h2>
          <p className="text-gray-500 mb-8 max-w-md">
            Tất cả <strong>{allDeckCards.length} từ vựng</strong> trong phần này đều đã được ghi nhớ và lên lịch ôn tập cho những ngày tới.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/student"
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition flex items-center gap-2"
            >
              <ArrowLeft size={18} />
              Về trang Tổng quan
            </Link>

            {deckId && (
              <Link
                href={`/student/study?deck=${deckId}&mode=all`}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-md"
              >
                <RotateCcw size={18} />
                Học tự do (Lật lại toàn bộ {allDeckCards.length} thẻ)
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Màn hình 2: Bộ từ vựng thực sự trống
  if (allDeckCards.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12 animate-in fade-in duration-500">
        <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-200 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-5">
            <BookOpen size={40} />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
            Chưa có thẻ từ vựng nào
          </h2>
          <p className="text-gray-500 mb-8 max-w-md">
            Hiện tại chưa có từ vựng nào trong mục này. Hãy khám phá thêm các khóa học hoặc bộ từ vựng công khai nhé!
          </p>
          <div className="flex gap-4">
            <Link
              href="/student"
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition"
            >
              Quay lại Dashboard
            </Link>
            <Link
              href="/student/explore"
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
            >
              Khám phá từ vựng
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Màn hình 3: Giao diện Lật thẻ Flashcard chính
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link 
            href={deckId ? `/student/decks/${deckId}` : '/student'}
            className="p-2.5 bg-white border border-gray-200 text-gray-600 hover:text-blue-600 rounded-xl transition shadow-sm"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900">{deckTitle}</h1>
            <p className="text-xs font-semibold text-blue-600">
              {isPracticeAll ? '🔄 Chế độ Học tự do (Ôn toàn bộ thẻ)' : '⚡ Chế độ Lặp lại ngắt quãng (SRS)'}
            </p>
          </div>
        </div>
      </div>

      <StudyClient cards={cardsToStudy} />
    </div>
  );
}