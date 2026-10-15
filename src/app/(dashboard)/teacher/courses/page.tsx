// src/app/(dashboard)/teacher/courses/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { PlusCircle, Book, Users, GraduationCap, Layout, ArrowRight } from 'lucide-react';

export default async function TeacherCoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Lấy danh sách khóa học, đếm số lượng bộ từ vựng (decks) và học viên (enrollments)
  const { data: courses } = await supabase
    .from('courses')
    .select(`
      id, title, description, created_at,
      decks (count),
      enrollments (count)
    `)
    .eq('teacher_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Khóa học</h1>
          <p className="text-gray-500 text-sm mt-1">Tạo và quản lý các khóa học từ vựng của bạn</p>
        </div>
        <Link 
          href="/teacher/courses/new" 
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm"
        >
          <PlusCircle size={20} />
          Thêm khóa học mới
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
        {courses && courses.length > 0 ? (
          courses.map((course) => {
            const deckCount = course.decks?.[0]?.count || 0;
            const studentCount = course.enrollments?.[0]?.count || 0;

            return (
              <div key={course.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition flex flex-col group">
                <div className="h-2 bg-blue-500 w-full"></div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <GraduationCap size={24} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2 flex-1 mb-6">
                    {course.description || 'Chưa có mô tả khóa học.'}
                  </p>
                  
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-100 mb-4">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium bg-gray-50 px-3 py-1.5 rounded-lg">
                      <Layout size={14} className="text-blue-500" />
                      {deckCount} bộ từ vựng
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium bg-gray-50 px-3 py-1.5 rounded-lg">
                      <Users size={14} className="text-green-500" />
                      {studentCount} học viên
                    </div>
                  </div>

                  <Link 
                    href={`/teacher/courses/${course.id}`}
                    className="w-full py-2.5 bg-blue-50 text-blue-600 font-semibold text-sm rounded-xl hover:bg-blue-600 hover:text-white transition flex items-center justify-center gap-2"
                  >
                    Quản lý khóa học
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full bg-white p-12 rounded-2xl border border-dashed border-gray-300 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center mb-4">
              <Book size={32} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Chưa có khóa học nào</h3>
            <p className="text-gray-500 mb-6">Bạn hãy tạo một khóa học để đóng gói các bộ từ vựng cho học viên nhé.</p>
            <Link 
              href="/teacher/courses/new" 
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
            >
              Tạo khóa học đầu tiên
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}