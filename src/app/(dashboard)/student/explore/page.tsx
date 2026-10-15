// src/app/(dashboard)/student/explore/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { BookOpen, GraduationCap, Globe, Search, X } from 'lucide-react';
import EnrollButton from './EnrollButton';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const keyword = q ? q.trim().toLowerCase() : '';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Lấy tất cả Bộ từ vựng Tự do (course_id IS NULL) hoặc được đánh dấu Công khai (is_public = true)
  const { data: rawPublicDecks } = await supabase
    .from('decks')
    .select('id, title, description, is_public, course_id, cards(count)')
    .or('is_public.eq.true,course_id.is.null')
    .order('created_at', { ascending: false });

  // 2. Lấy danh sách Khóa học
  const { data: rawCourses } = await supabase
    .from('courses')
    .select('id, title, description, teacher_id, decks(count)')
    .order('created_at', { ascending: false });

  // 3. Lấy danh sách các khóa học mà học viên này ĐÃ tham gia
  const { data: myEnrollments } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('student_id', user?.id);

  const enrolledCourseIds = new Set(myEnrollments?.map(e => e.course_id));

  // 4. Lọc theo từ khóa tìm kiếm (nếu có)
  const publicDecks = (rawPublicDecks || []).filter(deck =>
    !keyword ||
    deck.title.toLowerCase().includes(keyword) ||
    (deck.description && deck.description.toLowerCase().includes(keyword))
  );

  const courses = (rawCourses || []).filter(course =>
    !keyword ||
    course.title.toLowerCase().includes(keyword) ||
    (course.description && course.description.toLowerCase().includes(keyword))
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-12">
      
      {/* Header & Thanh tìm kiếm */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Thư viện Khám phá 🌍</h1>
          <p className="text-gray-500 mt-1 text-lg">Tìm kiếm khóa học và các bộ từ vựng tự do trên toàn hệ thống</p>
        </div>

        <form action="/student/explore" method="GET" className="w-full md:w-96 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              name="q"
              defaultValue={q || ''}
              placeholder="Tìm bộ từ vựng hoặc khóa học..."
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            />
            {keyword && (
              <Link
                href="/student/explore"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Xóa tìm kiếm"
              >
                <X size={16} />
              </Link>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition shadow-sm shrink-0"
          >
            Tìm
          </button>
        </form>
      </div>

      {/* Phần 1: Bộ từ vựng Tự do (Public Decks) - Đưa lên đầu để học viên dễ thấy ngay */}
      <section>
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-2">
          <div className="flex items-center gap-2">
            <Globe size={24} className="text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">Kho Từ vựng Tự do ({publicDecks.length})</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {publicDecks.length > 0 ? (
            publicDecks.map((deck) => {
              const cardCount = deck.cards?.[0]?.count || 0;
              return (
                <div key={deck.id} className="bg-white rounded-2xl p-5 shadow-sm border border-green-100 hover:border-green-300 hover:shadow-md transition flex flex-col h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg">
                    TỰ DO
                  </div>
                  <div className="mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-100 text-green-600 mb-3">
                      <BookOpen size={20} />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1 line-clamp-1">{deck.title}</h3>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{deck.description || 'Bộ từ vựng luyện tập tự do'}</p>
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      {cardCount} từ vựng
                    </span>
                  </div>
                  <div className="mt-auto pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
                    <Link 
                      href={`/student/decks/${deck.id}`}
                      className="py-2 bg-gray-100 text-gray-700 font-semibold text-xs text-center rounded-lg hover:bg-gray-200 transition"
                    >
                      Xem từ vựng
                    </Link>
                    <Link 
                      href={`/student/study?deck=${deck.id}`}
                      className="py-2 bg-green-600 text-white font-semibold text-xs text-center rounded-lg hover:bg-green-700 transition"
                    >
                      Học ngay
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
              {keyword ? `Không tìm thấy bộ từ vựng nào khớp với "${q}".` : 'Chưa có bộ từ vựng tự do nào trên kho.'}
            </div>
          )}
        </div>
      </section>

      {/* Phần 2: Khóa học từ Giảng viên */}
      <section>
        <div className="flex items-center gap-2 mb-6 border-b border-gray-200 pb-2 mt-12">
          <GraduationCap size={24} className="text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Danh sách Khóa học ({courses.length})</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.length > 0 ? (
            courses.map((course) => {
              const isEnrolled = enrolledCourseIds.has(course.id);
              const deckCount = course.decks?.[0]?.count || 0;
              return (
                <div key={course.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition flex flex-col h-full">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                        {deckCount} bộ từ vựng
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1">{course.title}</h3>
                    <p className="text-sm text-gray-500 mb-6 line-clamp-3">
                      {course.description || 'Không có mô tả chi tiết.'}
                    </p>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <EnrollButton courseId={course.id} isEnrolled={isEnrolled} />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full p-8 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
              {keyword ? `Không tìm thấy khóa học nào khớp với "${q}".` : 'Hiện tại chưa có khóa học nào trên hệ thống.'}
            </div>
          )}
        </div>
      </section>
      
    </div>
  );
}