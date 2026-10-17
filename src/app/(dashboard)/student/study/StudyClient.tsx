// src/app/(dashboard)/student/study/StudyClient.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { updateCardProgress } from '@/app/actions/studyActions';
import { Volume2, RotateCw, CheckCircle2, ArrowLeft, BarChart3 } from 'lucide-react';
import Link from 'next/link';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const router = useRouter();

  const {
    visitId,
    startStudySession,
    recordStudyInteraction,
    endStudySession,
    getCurrentStudySessionId,
  } = useTelemetry();

  const cardShownPerfRef = useRef<number>(0);
  const sessionStartedRef = useRef<boolean>(false);

  const currentCard = cards[currentIndex];

  useEffect(() => {
    if (typeof window !== 'undefined') {
      cardShownPerfRef.current = performance.now();
    }
  }, [currentIndex]);

  useEffect(() => {
    return () => {
      if (sessionStartedRef.current) {
        endStudySession();
      }
    };
  }, [endStudySession]);

  // Đảm bảo chỉ khởi tạo buổi học khi học viên thực sự có thao tác học (lật thẻ, nghe âm, chấm điểm)
  const ensureActiveStudySession = () => {
    const deckId = currentCard?.deck_id || null;
    if (!sessionStartedRef.current || !getCurrentStudySessionId()) {
      sessionStartedRef.current = true;
      startStudySession(deckId, 'srs');
    } else {
      recordStudyInteraction(deckId);
    }
  };

  const handleFlipCard = () => {
    ensureActiveStudySession();
    setIsFlipped(!isFlipped);
  };

  // Phát âm từ vựng tiếng Anh
  const speakWord = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    ensureActiveStudySession();
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // Xử lý chấm điểm SRS và chuyển qua thẻ tiếp theo
  const handleGrade = async (grade: number) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    ensureActiveStudySession();
    const activeSessionId = getCurrentStudySessionId();
    const elapsedMs =
      typeof window !== 'undefined' && cardShownPerfRef.current > 0
        ? Math.round(performance.now() - cardShownPerfRef.current)
        : null;

    const eventId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${currentCard.id}-${Date.now()}`;

    await updateCardProgress(currentCard.id, grade, {
      eventId,
      studySessionId: activeSessionId,
      visitId: visitId || null,
      durationMs: elapsedMs,
    });

    setIsSubmitting(false);
    setIsFlipped(false);

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      endStudySession();
      sessionStartedRef.current = false;
      setIsCompleted(true);
      router.refresh();
    }
  };

  if (isCompleted) {
    return (
      <div className="bg-white p-10 rounded-3xl shadow-sm border border-green-100 text-center flex flex-col items-center animate-in zoom-in-95 duration-300">
        <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-5">
          <CheckCircle2 size={44} />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
          Hoàn thành buổi học! 🎉
        </h2>
        <p className="text-gray-500 mb-8 max-w-md">
          Bạn vừa ôn tập xong <strong>{cards.length} từ vựng</strong>. Toàn bộ thời gian học và kết quả tự đánh giá đã được ghi nhận vào thống kê cá nhân.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/student"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            Quay về Tổng quan
          </Link>
          <Link
            href="/student/analytics"
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-md"
          >
            <BarChart3 size={18} />
            Xem Thống kê học tập
          </Link>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(((currentIndex + 1) / cards.length) * 100);

  return (
    <div className="space-y-6">
      {/* Thanh tiến độ */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between text-xs font-bold text-gray-500 mb-2">
          <span>Tiến độ buổi học</span>
          <span>
            Thẻ {currentIndex + 1} / {cards.length} ({progressPercent}%)
          </span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Thẻ Flashcard */}
      <div
        onClick={handleFlipCard}
        className="bg-white rounded-3xl shadow-md border-2 border-gray-100 hover:border-blue-200 transition cursor-pointer min-h-80 p-8 flex flex-col justify-between relative select-none"
      >
        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-gray-400">
          <span>{isFlipped ? 'Mặt sau (Định nghĩa)' : 'Mặt trước (Từ vựng)'}</span>
          <span className="flex items-center gap-1 text-blue-500">
            <RotateCw size={14} /> Chạm để lật thẻ
          </span>
        </div>

        {!isFlipped ? (
          <div className="my-auto text-center space-y-4 py-8">
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
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-semibold hover:bg-blue-100 transition"
              >
                <Volume2 size={18} /> Nghe phát âm
              </button>
            </div>
          </div>
        ) : (
          <div className="my-auto text-center space-y-4 py-8 animate-in fade-in duration-200">
            <p className="text-sm font-bold text-gray-400">{currentCard.term}</p>
            <h3 className="text-3xl md:text-4xl font-extrabold text-blue-600">
              {currentCard.definition}
            </h3>
            {currentCard.example && (
              <div className="max-w-lg mx-auto mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-sm text-gray-600 italic">"{currentCard.example}"</p>
              </div>
            )}
          </div>
        )}

        <div className="text-center text-xs text-gray-400">
          {!isFlipped
            ? 'Hãy tự nhẩm nghĩa trong đầu trước khi lật thẻ nhé'
            : 'Tự đánh giá mức độ ghi nhớ của bạn ở bên dưới'}
        </div>
      </div>

      {/* Các nút tự đánh giá SRS */}
      {isFlipped ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in slide-in-from-bottom-2 duration-200">
          <button
            disabled={isSubmitting}
            onClick={() => handleGrade(1)}
            className="p-4 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <span className="text-base">Chưa nhớ (Quên)</span>
            <span className="text-xs font-normal opacity-80">Ôn lại ngày mai</span>
          </button>

          <button
            disabled={isSubmitting}
            onClick={() => handleGrade(3)}
            className="p-4 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <span className="text-base">Đã nhớ (Hơi khó)</span>
            <span className="text-xs font-normal opacity-80">Nhớ mang máng</span>
          </button>

          <button
            disabled={isSubmitting}
            onClick={() => handleGrade(4)}
            className="p-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <span className="text-base">Đã nhớ (Tốt)</span>
            <span className="text-xs font-normal opacity-80">Trả lời đúng</span>
          </button>

          <button
            disabled={isSubmitting}
            onClick={() => handleGrade(5)}
            className="p-4 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-2xl font-bold transition flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <span className="text-base">Đã nhớ (Quá dễ)</span>
            <span className="text-xs font-normal opacity-80">Nhớ ngay lập tức</span>
          </button>
        </div>
      ) : (
        <button
          onClick={handleFlipCard}
          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition shadow-md"
        >
          Lật thẻ xem nghĩa
        </button>
      )}
    </div>
  );
}