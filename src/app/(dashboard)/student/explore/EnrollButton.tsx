// src/app/(dashboard)/student/explore/EnrollButton.tsx
'use client';

import { useState } from 'react';
import { enrollInCourse } from '@/app/actions/studyActions';
import { Loader2, Plus, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function EnrollButton({ courseId, isEnrolled }: { courseId: string, isEnrolled: boolean }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  if (isEnrolled) {
    return (
      <button disabled className="w-full py-2.5 bg-green-50 text-green-700 font-semibold text-center rounded-xl flex items-center justify-center gap-2 border border-green-200">
        <Check size={18} /> Đã tham gia
      </button>
    );
  }

  const handleEnroll = async () => {
    setIsLoading(true);
    const res = await enrollInCourse(courseId);
    setIsLoading(false);

    if (res.success) {
      alert("🎉 Đăng ký thành công!");
      router.refresh();
    } else {
      alert("❌ " + res.error);
    }
  };

  return (
    <button 
      onClick={handleEnroll}
      disabled={isLoading}
      className="w-full py-2.5 bg-blue-600 text-white font-semibold text-center rounded-xl hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-70"
    >
      {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
      Tham gia khóa học
    </button>
  );
}