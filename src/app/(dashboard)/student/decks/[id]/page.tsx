// src/app/(dashboard)/student/decks/[id]/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { ArrowLeft, Play, BookOpen, Clock, CheckCircle2, GraduationCap, Globe } from 'lucide-react';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentDeckDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Lấy thông tin bộ từ vựng
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select(`
      id,
      title,
      description,
      courses (title)
    `)
    .eq('id', id)
    .single();

  if (deckError || !deck) {
    return notFound();
  }

  // 2. Lấy danh sách từ vựng của bộ này
  const { data: cards } = await supabase
    .from('cards')
    .select('id, term, phonetic, definition, example')
    .eq('deck_id', id)
    .order('created_at', { ascending: true });

  // 3. Lấy tiến độ học của RIÊNG tài khoản học viên này đối với bộ từ vựng này
  const { data: myProgress } = user
    ? await supabase
        .from('card_progress')
        .select('card_id, next_review')
        .eq('user_id', user.id)
        .eq('deck_id', id)
    : { data: [] };

  const progressMap = new Map(
    (myProgress || []).map(item => [item.card_id, item.next_review])
  );

  const now = new Date().toISOString();
  const isCardDue = (cardId: string) => {
    const nextReview = progressMap.get(cardId);
    return !nextReview || nextReview <= now;
  };

  const totalCards = cards?.length || 0;
  const dueCards = cards?.filter(c => isCardDue(c.id)).length || 0;

  const courseTitle = Array.isArray(deck.courses)
    ? deck.courses[0]?.title
    : (deck.courses as any)?.title;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      
      {/* Header & Nút bắt đầu học */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex items-start gap-4">
          <Link 
            href="/student"
            className="p-2.5 bg-gray-50 border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-200 rounded-xl transition mt-1"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            {courseTitle ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full mb-2">
                <GraduationCap size={14} /> {courseTitle}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-50 text-green-700 px-2.5 py-1 rounded-full mb-2">
                <Globe size={14} /> Bộ từ vựng tự do
              </span>
            )}
            <h1 className="text-2xl font-extrabold text-gray-900">{deck.title}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {deck.description || 'Hãy xem qua danh sách từ vựng bên dưới trước khi bắt đầu lật thẻ.'}
            </p>
          </div>
        </div>

        <Link 
          href={dueCards > 0 ? `/student/study?deck=${deck.id}` : `/student/study?deck=${deck.id}&mode=all`}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-md whitespace-nowrap"
        >
          <Play size={18} />
          {dueCards > 0 ? `Lật thẻ ôn ngay (${dueCards} từ)` : `Học tự do (${totalCards} từ)`}
        </Link>
      </div>

      {/* Bảng danh sách từ vựng */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-bold text-gray-800 flex items-center gap-2">
            <BookOpen size={18} className="text-blue-600" />
            Danh sách từ vựng ({totalCards} từ)
          </h2>
          {dueCards > 0 ? (
            <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
              {dueCards} từ đến hạn ôn tập
            </span>
          ) : (
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full">
              Đã ôn xong hôm nay
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="p-4 font-semibold w-14 text-center">STT</th>
                <th className="p-4 font-semibold w-1/5">Từ vựng</th>
                <th className="p-4 font-semibold w-1/6">Phiên âm</th>
                <th className="p-4 font-semibold w-1/4">Định nghĩa</th>
                <th className="p-4 font-semibold">Ví dụ</th>
                <th className="p-4 font-semibold w-36 text-center">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cards && cards.length > 0 ? (
                cards.map((card, index) => {
                  const cardDue = isCardDue(card.id);
                  return (
                    <tr key={card.id} className="hover:bg-gray-50 transition">
                      <td className="p-4 text-center text-gray-400 font-medium">{index + 1}</td>
                      <td className="p-4 font-bold text-gray-900">{card.term}</td>
                      <td className="p-4 text-gray-500 font-mono text-sm">{card.phonetic || '-'}</td>
                      <td className="p-4 text-blue-700 font-medium">{card.definition}</td>
                      <td className="p-4 text-gray-600 text-sm italic">{card.example || '-'}</td>
                      <td className="p-4 text-center">
                        {cardDue ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full">
                            <Clock size={12} /> Cần ôn
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={12} /> Đã nhớ
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    Chưa có từ vựng nào trong bộ này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}