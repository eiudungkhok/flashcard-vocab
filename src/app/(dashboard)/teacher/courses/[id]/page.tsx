// src/app/(dashboard)/teacher/courses/[id]/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { ArrowLeft, PlusCircle, BookOpen, Users, GraduationCap, Calendar, Globe, Lock, Mail } from 'lucide-react';
import { notFound } from 'next/navigation';
import CourseEditSection from './CourseEditSection';
import DeleteDeckButton from '@/components/teacher/DeleteDeckButton';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TeacherCourseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Lấy thông tin chi tiết khóa học
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title, description, created_at, teacher_id')
    .eq('id', id)
    .single();

  if (courseError || !course || !user || course.teacher_id !== user.id) {
    return notFound();
  }

  // 2. Lấy danh sách các bộ từ vựng thuộc khóa học này
  const { data: decks } = await supabase
    .from('decks')
    .select(`
      id,
      title,
      description,
      is_public,
      created_at,
      cards (count)
    `)
    .eq('course_id', id)
    .order('created_at', { ascending: false });

  // 3. Lấy danh sách học viên đã đăng ký khóa học này
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('id, student_id, joined_at')
    .eq('course_id', id)
    .order('joined_at', { ascending: false });

  // 4. Lấy thông tin Họ tên & Email của học viên từ bảng profiles vừa tạo
  const studentIds = enrollments?.map(e => e.student_id) || [];
  const { data: studentProfiles } = studentIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds)
    : { data: [] };

  const profileMap = new Map(
    (studentProfiles || []).map(p => [p.id, p])
  );

  const totalDecks = decks?.length || 0;
  const totalStudents = enrollments?.length || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* Nút quay lại & Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/teacher/courses" 
            className="p-2.5 bg-white border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-200 rounded-xl transition shadow-sm"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-sm text-blue-600 font-semibold mb-1">
              <GraduationCap size={16} />
              <span>Chi tiết khóa học</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">{course.title}</h1>
          </div>
        </div>

        <Link 
          href={`/teacher/decks/new?courseId=${course.id}`}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm"
        >
          <PlusCircle size={20} />
          Thêm bộ từ vựng vào khóa này
        </Link>
      </div>

      {/* Khu vực Sửa / Xóa Khóa học & Thống kê */}
      <CourseEditSection 
        courseId={course.id}
        initialTitle={course.title}
        initialDescription={course.description || ''}
        totalDecks={totalDecks}
        totalStudents={totalStudents}
      />

      {/* Bố cục 2 cột: Danh sách Bộ từ vựng (2 phần) & Danh sách Học viên (1 phần) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Cột trái: Các bộ từ vựng trong khóa */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen size={22} className="text-blue-600" />
              Các bộ từ vựng trong khóa ({totalDecks})
            </h2>
          </div>

          {decks && decks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {decks.map((deck) => {
                const cardCount = deck.cards?.[0]?.count || 0;
                return (
                  <div key={deck.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:border-blue-300 transition flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                          <BookOpen size={20} />
                        </div>
                        <div className="flex items-center gap-2">
                          {deck.is_public ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200">
                              <Globe size={12} /> Công khai
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                              <Lock size={12} /> Nội bộ khóa
                            </span>
                          )}
                          <DeleteDeckButton deckId={deck.id} deckTitle={deck.title} />
                        </div>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">{deck.title}</h3>
                      <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                        {deck.description || 'Không có mô tả.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                        {cardCount} từ vựng
                      </span>
                      <Link 
                        href={`/teacher/decks/${deck.id}`}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition"
                      >
                        Sửa & Quản lý từ →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center">
              <p className="text-gray-500 mb-4">Khóa học này hiện chưa có bộ từ vựng nào.</p>
              <Link 
                href={`/teacher/decks/new?courseId=${course.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition text-sm"
              >
                <PlusCircle size={18} />
                Tạo bộ từ vựng đầu tiên
              </Link>
            </div>
          )}
        </div>

        {/* Cột phải: Danh sách Học viên đã tham gia */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-green-600" />
            Học viên tham gia ({totalStudents})
          </h2>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {enrollments && enrollments.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {enrollments.map((enrollment, index) => {
                  const joinDate = new Date(enrollment.joined_at).toLocaleDateString('vi-VN');
                  const profile = profileMap.get(enrollment.student_id);
                  const studentName = profile?.full_name || `Học viên #${enrollment.student_id.slice(0, 6).toUpperCase()}`;
                  const studentEmail = profile?.email || '';

                  return (
                    <div key={enrollment.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center text-sm shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{studentName}</p>
                          {studentEmail && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                              <Mail size={11} /> {studentEmail}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <Calendar size={11} /> Tham gia: {joinDate}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                Chưa có học viên nào đăng ký khóa học này.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}