// src/app/(dashboard)/student/study/StudyClient.tsx
'use client';

import { useState } from 'react';
import { Volume2, RotateCw, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';
import { updateCardProgress } from '@/app/actions/studyActions';
import { useRouter } from 'next/navigation';
import { useTelemetry } from '@/components/analytics/TelemetryProvider';

interface Card {
  id: string;
  deck_id?: string;
  term: string;
  phonetic?: string;
  definition: string;
  example?: string;
}

export default function StudyClient({ cards }: { cards: Card[] }) {
  // Cố định danh sách thẻ của phiên học ngay lúc bắt đầu để không bị xê dịch vị trí khi server cập nhật
  const [sessionCards] = useState<Card[]>(() => cards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const router = useRouter();
  const telemetry = useTelemetry();

  const currentCard = sessionCards[currentIndex];

  // Hàm phát âm từ vựng
  const speakWord = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Xử lý khi học viên bấm chọn mức độ nhớ (Quên / Khó / Nhớ / Dễ)
  const handleGrade = async (grade: number) => {
    if (isSubmitting || !currentCard) return;
    setIsSubmitting(true);

    // Ghi nhận tương tác học tập cho bộ đếm thời gian Telemetry
    if (telemetry?.recordStudyInteraction) {
      telemetry.recordStudyInteraction();
    }

    // Chuyển sang thẻ tiếp theo ngay trên danh sách cố định
    const nextIndex = currentIndex + 1;
    setIsFlipped(false);

    // Lưu tiến độ SRS của thẻ hiện tại lên Supabase
    await updateCardProgress(currentCard.id, grade);

    if (nextIndex < sessionCards.length) {
      setCurrentIndex(nextIndex);
      setIsSubmitting(false);
    } else {
      setIsFinished(true);
      setIsSubmitting(false);
      router.refresh();
    }
  };

  // Màn hình khi đã lật xong toàn bộ thẻ trong phiên học
  if (isFinished || !currentCard) {
    return (
      <div className="bg-white p-10 rounded-3xl shadow-sm border border-green-100 text-center flex flex-col items-center animate-in fade-in duration-500">
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-5">
          <CheckCircle2 size={44} />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
          Hoàn thành phiên ôn tập! 🎉
        </h2>
        <p className="text-gray-500 mb-8 max-w-md">
          Bạn đã lật và đánh giá xong toàn bộ <strong>{sessionCards.length} từ vựng</strong> trong lượt học này.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              router.push('/student');
              router.refresh();
            }}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            Về trang Tổng quan
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentIndex(0);
              setIsFlipped(false);
              setIsFinished(false);
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-md"
          >
            <RefreshCw size={18} />
            Ôn lại lượt này ({sessionCards.length} từ)
          </button>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(((currentIndex + 1) / sessionCards.length) * 100);

  return (
    <div className="space-y-6">
      {/* Thanh tiến trình số lượng thẻ */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center text-sm font-bold text-gray-600 mb-2">
          <span>Tiến độ phiên học</span>
          <span className="text-blue-600">
            Thẻ {currentIndex + 1} / {sessionCards.length} ({progressPercent}%)
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
          />
        </div>
      </div>

      {/* Thẻ Flashcard */}
      <div
        onClick={() => {
          setIsFlipped(!isFlipped);
          if (telemetry?.recordStudyInteraction) {
            telemetry.recordStudyInteraction();
          }
        }}
        className="bg-white rounded-3xl p-8 md:p-12 shadow-md border-2 border-blue-100 hover:border-blue-300 transition-all cursor-pointer min-h-90 flex flex-col justify-between select-none"
      >
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-gray-400">
          <span>{isFlipped ? 'Mặt sau • Nghĩa & Ví dụ' : 'Mặt trước • Từ vựng'}</span>
          <span className="flex items-center gap-1 text-blue-600">
            <RotateCw size={14} /> Bấm vào thẻ để lật
          </span>
        </div>

        {!isFlipped ? (
          <div className="my-auto py-10 text-center space-y-4">
            <h2 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">
              {currentCard.term}
            </h2>
            {currentCard.phonetic && (
              <p className="text-lg text-gray-500 font-mono">{currentCard.phonetic}</p>
            )}
            <div className="pt-2">
              <button
                type="button"
                onClick={(e) => speakWord(e, currentCard.term)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-600 rounded-full font-bold text-sm hover:bg-blue-100 transition"
              >
                <Volume2 size={18} />
                Nghe phát âm
              </button>
            </div>
          </div>
        ) : (
          <div className="my-auto py-8 text-center space-y-5 animate-in fade-in duration-200">
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-400 uppercase">{currentCard.term}</p>
              <h3 className="text-3xl md:text-4xl font-extrabold text-blue-600">
                {currentCard.definition}
              </h3>
            </div>

            {currentCard.example && (
              <div className="max-w-xl mx-auto bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-gray-600 italic text-base">"{currentCard.example}"</p>
              </div>
            )}
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
          {isFlipped
            ? 'Hãy chọn mức độ ghi nhớ của bạn ở các nút bên dưới'
            : 'Hãy thử nhớ nghĩa của từ trước khi bấm lật thẻ'}
        </div>
      </div>

      {/* 4 Nút đánh giá mức độ nhớ (Thuật toán SRS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleGrade(1)}
          className="p-4 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <span className="text-base">Quên luôn</span>
          <span className="text-xs font-normal opacity-80">Ôn lại ngày mai</span>
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleGrade(3)}
          className="p-4 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <span className="text-base">Hơi khó</span>
          <span className="text-xs font-normal opacity-80">Nhắc lại sớm</span>
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleGrade(4)}
          className="p-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <span className="text-base">Đã nhớ</span>
          <span className="text-xs font-normal opacity-80">Đúng lộ trình</span>
        </button>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleGrade(5)}
          className="p-4 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <span className="text-base">Quá dễ</span>
          <span className="text-xs font-normal opacity-80">Giãn cách xa</span>
        </button>
      </div>
    </div>
  );
}