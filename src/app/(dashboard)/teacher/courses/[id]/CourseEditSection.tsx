// src/app/(dashboard)/teacher/courses/[id]/CourseEditSection.tsx
'use client';

import { useState } from 'react';
import { Edit3, Trash2, Save, X, Loader2 } from 'lucide-react';
import { updateCourse, deleteCourse } from '@/app/actions/studyActions';
import { useRouter } from 'next/navigation';

interface CourseProps {
  courseId: string;
  initialTitle: string;
  initialDescription: string;
  totalDecks: number;
  totalStudents: number;
}

export default function CourseEditSection({
  courseId,
  initialTitle,
  initialDescription,
  totalDecks,
  totalStudents
}: CourseProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Tên khóa học không được để trống!');
      return;
    }

    setIsSaving(true);
    const res = await updateCourse(courseId, title, description);
    setIsSaving(false);

    if (res.success) {
      setIsEditing(false);
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa khóa học "${initialTitle}" không? Các bộ từ vựng bên trong sẽ chuyển về trạng thái tự do.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    const res = await deleteCourse(courseId);
    setIsDeleting(false);

    if (res.success) {
      router.push('/teacher/courses');
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
      {!isEditing ? (
        <div className="flex flex-col lg:flex-row justify-between gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Mô tả khóa học</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition"
                >
                  <Edit3 size={14} /> Sửa khóa học
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Xóa khóa học
                </button>
              </div>
            </div>
            <p className="text-gray-700 leading-relaxed">
              {initialDescription || 'Khóa học này chưa có mô tả chi tiết.'}
            </p>
          </div>

          <div className="flex items-center gap-4 border-t lg:border-t-0 lg:border-l border-gray-100 pt-4 lg:pt-0 lg:pl-6 shrink-0">
            <div className="bg-blue-50 px-5 py-3 rounded-xl text-center min-w-30">
              <p className="text-2xl font-black text-blue-600">{totalDecks}</p>
              <p className="text-xs font-semibold text-blue-800">Bộ từ vựng</p>
            </div>
            <div className="bg-green-50 px-5 py-3 rounded-xl text-center min-w-30">
              <p className="text-2xl font-black text-green-600">{totalStudents}</p>
              <p className="text-xs font-semibold text-green-800">Học viên</p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 pb-3">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Edit3 size={18} className="text-blue-600" />
              Chỉnh sửa thông tin Khóa học
            </h3>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Tên khóa học *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Mô tả khóa học</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-25"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Lưu khóa học
            </button>
          </div>
        </form>
      )}
    </div>
  );
}