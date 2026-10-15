// src/components/flashcard/FlashcardPlayer.tsx
'use client';

import { useState, useEffect } from "react";
import { Volume2 } from "lucide-react";

export interface Flashcard {
  id: string;
  term: string;
  phonetic: string;
  definition: string;
  example: string;
}

interface Props {
  card: Flashcard;
  onRate: (grade: number) => void;
}

export default function FlashcardPlayer({ card, onRate }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);

  // Reset trạng thái lật khi chuyển sang thẻ mới
  useEffect(() => {
    setIsFlipped(false);
  }, [card]);

  // Lắng nghe sự kiện bàn phím
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
      if (isFlipped) {
        if (e.key === "1") onRate(1);
        if (e.key === "2") onRate(2);
        if (e.key === "3") onRate(3);
        if (e.key === "4") onRate(4);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, onRate]);

  // Hàm phát âm tiếng Anh
  const playAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    const utterance = new SpeechSynthesisUtterance(card.term);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
      {/* Khung thẻ lật */}
      <div className="w-full perspective-1000 h-96">
        <div 
          className={`relative w-full h-full transition-transform duration-500 transform-style-3d cursor-pointer ${isFlipped ? "rotate-y-180" : ""}`}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Mặt trước */}
          <div className="absolute inset-0 backface-hidden bg-white shadow-lg border border-gray-200 rounded-3xl flex flex-col items-center justify-center p-8">
            <button 
              onClick={playAudio} 
              className="absolute top-6 right-6 p-3 bg-gray-100 text-gray-500 rounded-full hover:bg-blue-100 hover:text-blue-600 transition"
              title="Phát âm"
            >
              <Volume2 size={24} />
            </button>
            <h2 className="text-5xl font-extrabold text-gray-800 mb-4">{card.term}</h2>
            <p className="text-xl text-gray-500 font-medium">/{card.phonetic}/</p>
            <p className="absolute bottom-8 text-sm text-gray-400 animate-pulse">
              Chạm hoặc nhấn <kbd className="px-2 py-1 bg-gray-100 rounded text-gray-600 font-mono">Space</kbd> để lật thẻ
            </p>
          </div>

          {/* Mặt sau */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 bg-blue-50 shadow-lg border border-blue-100 rounded-3xl flex flex-col p-8 overflow-y-auto">
             <div className="flex-grow flex flex-col justify-center text-center">
                <h3 className="text-3xl font-bold text-blue-700 mb-6">{card.definition}</h3>
                <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm mx-auto max-w-lg w-full">
                  <p className="text-gray-700 text-lg italic">"{card.example}"</p>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Các nút đánh giá (Chỉ hiện khi đã lật thẻ) */}
      <div className={`mt-8 w-full grid grid-cols-4 gap-4 transition-opacity duration-300 ${isFlipped ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button onClick={() => onRate(1)} className="flex flex-col items-center bg-white border border-red-200 text-red-600 py-4 rounded-xl shadow-sm hover:bg-red-50 hover:border-red-300 transition group">
          <span className="text-lg font-bold">Quên</span>
          <span className="text-xs text-red-400 mt-1 font-mono group-hover:text-red-500">Phím 1</span>
        </button>
        <button onClick={() => onRate(2)} className="flex flex-col items-center bg-white border border-orange-200 text-orange-600 py-4 rounded-xl shadow-sm hover:bg-orange-50 hover:border-orange-300 transition group">
          <span className="text-lg font-bold">Khó</span>
          <span className="text-xs text-orange-400 mt-1 font-mono group-hover:text-orange-500">Phím 2</span>
        </button>
        <button onClick={() => onRate(3)} className="flex flex-col items-center bg-white border border-green-200 text-green-600 py-4 rounded-xl shadow-sm hover:bg-green-50 hover:border-green-300 transition group">
          <span className="text-lg font-bold">Nhớ</span>
          <span className="text-xs text-green-400 mt-1 font-mono group-hover:text-green-500">Phím 3</span>
        </button>
        <button onClick={() => onRate(4)} className="flex flex-col items-center bg-white border border-blue-200 text-blue-600 py-4 rounded-xl shadow-sm hover:bg-blue-50 hover:border-blue-300 transition group">
          <span className="text-lg font-bold">Dễ</span>
          <span className="text-xs text-blue-400 mt-1 font-mono group-hover:text-blue-500">Phím 4</span>
        </button>
      </div>
    </div>
  );
}