// src/app/(dashboard)/teacher/courses/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createNewCourse } from '@/app/actions/studyActions';
import { Save, Loader2, ArrowLeft, BookOpen } from 'lucide-react';
import Link from 'next/link';

export default function CreateCoursePage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Vui lòng nhập tên khóa học!");
      return;
    }

    setIsSaving(true);
    const response = await createNewCourse(title, description);
    setIsSaving(false);

    if (response.success) {
      alert("🎉 Đã tạo khóa học thành công!");
      router.push('/teacher/courses'); // Quay lại trang danh sách khóa học
      router.refresh();
    } else {
      alert("❌ Lỗi: " + response.error);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/teacher/courses" className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Tạo Khóa học mới</h1>
      </div>

      <form onSubmit={handleSave} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 space-y-6">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
            <BookOpen size={40} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Tên khóa học <span className="text-red-500">*</span></label>
          <input 
            type="text" 
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="VD: Tiếng Anh Giao Tiếp K1..."
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Mô tả khóa học</label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition min-h-30"
            placeholder="Giới thiệu ngắn về mục tiêu của khóa học này..."
          />
        </div>

        <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
          <Link 
            href="/teacher/courses"
            className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition"
          >
            Hủy bỏ
          </Link>
          <button 
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
            {isSaving ? 'Đang tạo...' : 'Tạo khóa học'}
          </button>
        </div>
      </form>
    </div>
  );
}