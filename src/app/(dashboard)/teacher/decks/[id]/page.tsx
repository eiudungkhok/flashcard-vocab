// src/app/(dashboard)/teacher/decks/[id]/page.tsx
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { ArrowLeft, BookOpen, Globe, Lock, GraduationCap } from 'lucide-react';
import { notFound } from 'next/navigation';
import DeckCardsManager from './DeckCardsManager';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TeacherDeckDetailPage({ params }: PageProps) {
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
      is_public,
      course_id,
      user_id,
      courses (title)
    `)
    .eq('id', id)
    .single();

  if (deckError || !deck || !user || deck.user_id !== user.id) {
    return notFound();
  }

  // 2. Lấy toàn bộ danh sách thẻ từ vựng trong bộ này
  const { data: cards } = await supabase
    .from('cards')
    .select('id, term, phonetic, definition, example')
    .eq('deck_id', id)
    .order('created_at', { ascending: true });

  // 3. Lấy danh sách khóa học của giảng viên để có thể đổi khóa học cho bộ bài
  const { data: teacherCourses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('teacher_id', user.id)
    .order('created_at', { ascending: false });

  const courseTitle = Array.isArray(deck.courses)
    ? deck.courses[0]?.title
    : (deck.courses as any)?.title;

  const backHref = deck.course_id ? `/teacher/courses/${deck.course_id}` : '/teacher';

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      
      {/* Header & Nút quay lại */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link 
            href={backHref}
            className="p-2.5 bg-white border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-200 rounded-xl transition shadow-sm"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {courseTitle && (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                  <GraduationCap size={14} /> {courseTitle}
                </span>
              )}
              {deck.is_public ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-50 text-green-700 px-2.5 py-1 rounded-full">
                  <Globe size={12} /> Công khai
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  <Lock size={12} /> Nội bộ
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">{deck.title}</h1>
          </div>
        </div>

        <div className="bg-blue-50 text-blue-700 px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2">
          <BookOpen size={18} />
          Tổng cộng: {cards?.length || 0} từ vựng
        </div>
      </div>

      {/* Bộ quản lý Sửa thông tin bộ bài + Thêm / Sửa / Xóa từng từ vựng */}
      <DeckCardsManager 
        deck={deck} 
        cards={cards || []} 
        courses={teacherCourses || []} 
      />

    </div>
  );
}