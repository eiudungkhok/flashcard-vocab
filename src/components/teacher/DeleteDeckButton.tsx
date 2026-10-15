// src/components/teacher/DeleteDeckButton.tsx
'use client';

import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteDeck } from '@/app/actions/studyActions';
import { useRouter } from 'next/navigation';

export default function DeleteDeckButton({ deckId, deckTitle }: { deckId: string; deckTitle: string }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    const confirmed = window.confirm(`Bạn có chắc chắn muốn xóa bộ từ vựng "${deckTitle}" cùng toàn bộ thẻ bên trong không?`);
    if (!confirmed) return;

    setIsDeleting(true);
    const res = await deleteDeck(deckId);
    setIsDeleting(false);

    if (res.success) {
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
      title="Xóa bộ từ vựng"
    >
      {isDeleting ? <Loader2 size={18} className="animate-spin text-red-600" /> : <Trash2 size={18} />}
    </button>
  );
}