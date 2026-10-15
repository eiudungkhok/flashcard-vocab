// src/app/(dashboard)/student/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { Play, Clock, BookOpen, GraduationCap, Flame, Globe, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StudentDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Học viên';
  const firstName = fullName.split(' ').pop();

  // 1. Lấy toàn bộ tiến độ học tập của RIÊNG tài khoản học viên này từ bảng card_progress
  const { data: myProgress } = user
    ? await supabase
        .from('card_progress')
        .select('card_id, deck_id, next_review')
        .eq('user_id', user.id)
    : { data: [] };

  const progressMap = new Map(
    (myProgress || []).map(item => [item.card_id, item.next_review])
  );

  // Danh sách các bộ từ vựng mà tài khoản này đã từng lật thẻ học
  const studiedDeckIds = Array.from(
    new Set((myProgress || []).map(item => item.deck_id))
  );

  // 2. Lấy ID các khóa học mà học viên này đã đăng ký
  const { data: enrollments } = user
    ? await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', user.id)
    : { data: [] };

  const enrolledCourseIds = enrollments?.map(e => e.course_id) || [];

  // 3. Truy vấn các Bộ từ vựng của riêng học viên này:
  // Gồm: (Bộ tự tạo) HOẶC (Bộ thuộc khóa học đã đăng ký) HOẶC (Bộ tự do đã học trong card_progress)
  const orConditions: string[] = [];
  if (user?.id) {
    orConditions.push(`user_id.eq.${user.id}`);
  }
  if (enrolledCourseIds.length > 0) {
    orConditions.push(`course_id.in.(${enrolledCourseIds.join(',')})`);
  }
  if (studiedDeckIds.length > 0) {
    orConditions.push(`id.in.(${studiedDeckIds.join(',')})`);
  }

  const { data: decks } = orConditions.length > 0
    ? await supabase
        .from('decks')
        .select(`
          id, 
          title, 
          description,
          course_id,
          is_public,
          courses (title)
        `)
        .or(orConditions.join(','))
    : { data: [] };

  const deckIds = decks?.map(d => d.id) || [];

  // 4. Lấy danh sách thẻ thuộc các bộ từ vựng trên
  const { data: allCards } = deckIds.length > 0
    ? await supabase
        .from('cards')
        .select('id, deck_id')
        .in('deck_id', deckIds)
    : { data: [] };

  const now = new Date().toISOString();

  // Kiểm tra thẻ đến hạn DỰA HOÀN TOÀN VÀO BẢNG card_progress CỦA HỌC VIÊN NÀY
  const isCardDue = (cardId: string) => {
    const nextReview = progressMap.get(cardId);
    return !nextReview || nextReview <= now;
  };

  // Đếm tổng số thẻ đến hạn hôm nay của học viên này
  const totalCardsDue = allCards?.filter(card => isCardDue(card.id)).length || 0;

  // Ghép số thẻ đến hạn vào từng bộ từ vựng
  const decksWithStats = decks?.map(deck => {
    const deckCards = allCards?.filter(card => card.deck_id === deck.id) || [];
    const dueCards = deckCards.filter(card => isCardDue(card.id)).length;
    
    return {
      ...deck,
      totalCards: deckCards.length,
      dueCards: dueCards
    };
  }) || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* Lời chào & Thống kê nhanh */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-linear-to-r from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-lg">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Chào {firstName}! Sẵn sàng học từ vựng chưa? 🚀
          </h1>
          <p className="text-blue-100 text-lg opacity-90">
            Duy trì thói quen lật Flashcard mỗi ngày để não bộ ghi nhớ sâu nhé.
          </p>
        </div>
        
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 flex items-center gap-4 min-w-50">
          <div className="bg-orange-500/20 p-3 rounded-full text-orange-300">
            <Flame size={28} className="animate-pulse" />
          </div>
          <div>
            <p className="text-blue-100 text-sm font-medium">Cần ôn tập hôm nay</p>
            <h2 className="text-3xl font-black text-white">{totalCardsDue} <span className="text-lg font-medium opacity-80">từ</span></h2>
          </div>
        </div>
      </div>

      {/* Danh sách Bộ từ vựng của tôi */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <BookOpen size={24} className="text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Bộ từ vựng của bạn ({decksWithStats.length})</h2>
          </div>
          <Link href="/student/explore" className="text-sm font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg transition">
            Khám phá thêm từ vựng
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {decksWithStats.length > 0 ? (
            decksWithStats.map((deck) => {
              const isDue = deck.dueCards > 0;
              
              const courseTitle = Array.isArray(deck.courses) 
                ? deck.courses[0]?.title 
                : (deck.courses as any)?.title;
              
              return (
                <div key={deck.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition flex flex-col h-full relative overflow-hidden group">
                  {/* Tag Khóa học hoặc Tag Tự do */}
                  {courseTitle ? (
                    <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-600 text-[10px] font-bold px-3 py-1.5 rounded-bl-xl border-b border-l border-indigo-100 flex items-center gap-1">
                      <GraduationCap size={12} /> {courseTitle}
                    </div>
                  ) : (
                    <div className="absolute top-0 right-0 bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1.5 rounded-bl-xl border-b border-l border-green-100 flex items-center gap-1">
                      <Globe size={12} /> Tự do
                    </div>
                  )}

                  <div className="flex-1 mt-2">
                    <Link href={`/student/decks/${deck.id}`}>
                      <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
                        {deck.title}
                      </h3>
                    </Link>
                    <p className="text-sm text-gray-500 mb-6 line-clamp-2">
                      {deck.description || 'Chưa có mô tả.'}
                    </p>
                  </div>

                  {/* Trạng thái học tập */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link 
                        href={`/student/decks/${deck.id}`}
                        className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Xem {deck.totalCards} từ
                      </Link>
                      {isDue ? (
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                          <Clock size={12} /> {deck.dueCards} cần ôn
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                          <CheckCircle2 size={12} /> Đã ôn xong
                        </span>
                      )}
                    </div>

                    <Link 
                      href={`/student/study?deck=${deck.id}`}
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-transform hover:scale-110 ${isDue ? 'bg-orange-500 text-white shadow-orange-200 shadow-lg' : 'bg-blue-100 text-blue-600'}`}
                      title={isDue ? 'Ôn tập ngay' : 'Học tự do'}
                    >
                      <Play size={18} className="ml-1" />
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full p-12 bg-white rounded-3xl border border-dashed border-gray-300 text-center flex flex-col items-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                <BookOpen size={40} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Bạn chưa có bộ từ vựng nào</h3>
              <p className="text-gray-500 mb-6 max-w-md">Hãy vào Thư viện Khám phá để chọn học các bộ từ vựng tự do hoặc tham gia khóa học của giảng viên nhé.</p>
              <Link 
                href="/student/explore" 
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-md"
              >
                Khám phá ngay
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}