// src/app/(dashboard)/teacher/page.tsx
import Link from 'next/link';
import { BookOpen, Users, PlusCircle, LayoutDashboard, FileSpreadsheet, Edit3 } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import DeleteDeckButton from '@/components/teacher/DeleteDeckButton';

export default async function TeacherDashboard() {
  const supabase = await createClient();
  
  // 1. Lấy thông tin user (Giảng viên) hiện tại
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Truy vấn danh sách các Bộ từ vựng do chính giảng viên này tạo
  const { data: decks } = await supabase
    .from('decks')
    .select(`
      id, 
      title, 
      description, 
      created_at,
      cards (count)
    `)
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false });

  // 3. Đếm số lượng học viên đã tham gia các khóa học của giảng viên này
  const { data: courses } = await supabase
    .from('courses')
    .select('enrollments(count)')
    .eq('teacher_id', user?.id);

  let totalStudents = 0;
  if (courses) {
    courses.forEach(c => {
      if (c.enrollments && c.enrollments.length > 0) {
        totalStudents += c.enrollments[0].count;
      }
    });
  }

  // 4. Tính toán thống kê bộ bài & thẻ
  const totalDecks = decks?.length || 0;
  let totalCards = 0;
  if (decks) {
    decks.forEach(deck => {
      if (deck.cards && deck.cards.length > 0) {
        totalCards += deck.cards[0].count;
      }
    });
  }

  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Giảng viên';
  const firstName = fullName.split(' ').pop();

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      
      {/* 1. Header & Nút hành động */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Chào giảng viên, {firstName}! 🎓
          </h1>
          <p className="text-gray-500 mt-1 text-lg">
            Hôm nay bạn muốn quản lý khóa học hay biên soạn bộ từ vựng mới?
          </p>
        </div>
        <Link 
          href="/teacher/decks/new" 
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-md hover:shadow-lg"
        >
          <PlusCircle size={20} className="text-white" />
          Tạo bộ từ vựng mới
        </Link>
      </div>

      {/* 2. Thẻ thống kê tổng quan */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between group hover:border-blue-200 transition">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Tổng số bộ từ vựng</p>
            <h3 className="text-3xl font-bold text-gray-900">{totalDecks}</h3>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl text-blue-500 group-hover:scale-110 transition-transform">
            <LayoutDashboard size={28} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between group hover:border-green-200 transition">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Tổng số thẻ từ</p>
            <h3 className="text-3xl font-bold text-gray-900">{totalCards}</h3>
          </div>
          <div className="p-3 bg-green-50 rounded-xl text-green-500 group-hover:scale-110 transition-transform">
            <FileSpreadsheet size={28} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between group hover:border-purple-200 transition">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Lượt học viên đăng ký</p>
            <h3 className="text-3xl font-bold text-gray-900">{totalStudents}</h3>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl text-purple-500 group-hover:scale-110 transition-transform">
            <Users size={28} />
          </div>
        </div>
      </div>

      {/* 3. Danh sách Bộ từ vựng đã tạo */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Bộ từ vựng của bạn</h2>
          <Link href="/teacher/courses" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Quản lý theo khóa học →
          </Link>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {decks && decks.length > 0 ? (
            decks.map((deck) => {
              const cardCount = deck.cards && deck.cards.length > 0 ? deck.cards[0].count : 0;
              
              return (
                <div key={deck.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition flex flex-col justify-between h-full group">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100 text-blue-600">
                        <BookOpen size={24} />
                      </div>
                      
                      {/* Cụm nút thao tác Sửa / Xóa */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link 
                          href={`/teacher/decks/${deck.id}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" 
                          title="Chỉnh sửa từ vựng"
                        >
                          <Edit3 size={18} />
                        </Link>
                        <DeleteDeckButton deckId={deck.id} deckTitle={deck.title} />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1">{deck.title}</h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2">{deck.description || 'Không có mô tả'}</p>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      {cardCount} thẻ
                    </span>
                    <Link 
                      href={`/teacher/decks/${deck.id}`}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition flex items-center gap-1"
                    >
                      Quản lý từ vựng →
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 bg-white p-12 rounded-2xl border border-dashed border-gray-300 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet size={32} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Chưa có bộ từ vựng nào</h3>
              <p className="text-gray-500 mb-6">Bạn chưa tạo bộ từ vựng nào. Hãy thử Import một file Excel nhé!</p>
              <Link 
                href="/teacher/decks/new" 
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
              >
                Tạo bộ đầu tiên
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}