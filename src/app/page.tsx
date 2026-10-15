// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { 
  BookOpen, 
  Sparkles, 
  ArrowRight, 
  Globe, 
  Brain, 
  Zap, 
  Volume2, 
  RotateCw, 
  Sun, 
  Moon, 
  Palette,
  GraduationCap,
  CheckCircle2
} from 'lucide-react';

type ThemeKey = 'light' | 'dark' | 'ocean' | 'royal';

const THEMES: Record<ThemeKey, {
  name: string;
  bg: string;
  navBg: string;
  cardBg: string;
  textMain: string;
  textSub: string;
  accentBg: string;
  accentText: string;
  badgeBg: string;
}> = {
  light: {
    name: 'Sáng',
    bg: 'bg-slate-50',
    navBg: 'bg-white/80 border-slate-200',
    cardBg: 'bg-white border-slate-200/80 shadow-sm',
    textMain: 'text-slate-900',
    textSub: 'text-slate-600',
    accentBg: 'bg-blue-600 hover:bg-blue-700 text-white',
    accentText: 'text-blue-600',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  dark: {
    name: 'Tối',
    bg: 'bg-slate-950',
    navBg: 'bg-slate-900/80 border-slate-800',
    cardBg: 'bg-slate-900 border-slate-800 shadow-lg',
    textMain: 'text-white',
    textSub: 'text-slate-400',
    accentBg: 'bg-indigo-500 hover:bg-indigo-600 text-white',
    accentText: 'text-indigo-400',
    badgeBg: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
  },
  ocean: {
    name: 'Đại dương',
    bg: 'bg-cyan-950',
    navBg: 'bg-cyan-900/70 border-cyan-800',
    cardBg: 'bg-cyan-900/60 border-cyan-800 shadow-lg',
    textMain: 'text-cyan-50',
    textSub: 'text-cyan-200/80',
    accentBg: 'bg-teal-400 hover:bg-teal-300 text-slate-950',
    accentText: 'text-teal-300',
    badgeBg: 'bg-teal-950/80 text-teal-300 border-teal-700',
  },
  royal: {
    name: 'Ngân hà',
    bg: 'bg-indigo-950',
    navBg: 'bg-indigo-900/70 border-indigo-800',
    cardBg: 'bg-indigo-900/50 border-indigo-800 shadow-lg',
    textMain: 'text-white',
    textSub: 'text-indigo-200',
    accentBg: 'bg-amber-400 hover:bg-amber-300 text-slate-950',
    accentText: 'text-amber-300',
    badgeBg: 'bg-indigo-900 text-amber-300 border-indigo-700',
  }
};

const DEMO_CARDS = [
  {
    term: 'Serendipity',
    phonetic: '/ˌser.ənˈdɪp.ə.ti/',
    definition: 'Sự tình cờ may mắn',
    example: 'Finding this learning platform was pure serendipity.'
  },
  {
    term: 'Resilience',
    phonetic: '/rɪˈzɪl.jəns/',
    definition: 'Khả năng phục hồi, sự kiên cường',
    example: 'Consistency and resilience are keys to mastering vocabulary.'
  },
  {
    term: 'Eloquent',
    phonetic: '/ˈel.ə.kwənt/',
    definition: 'Có tài hùng biện, lưu loát',
    example: 'She gave an eloquent speech in English.'
  }
];

export default function LandingPage() {
  const [theme, setTheme] = useState<ThemeKey>('light');
  const [isFlipped, setIsFlipped] = useState(false);
  const [demoIndex, setDemoIndex] = useState(0);
  const [targetHref, setTargetHref] = useState('/login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    const savedTheme = localStorage.getItem('flashlearn_theme') as ThemeKey;
    if (savedTheme && THEMES[savedTheme]) {
      setTheme(savedTheme);
    }

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        const role = user.user_metadata?.role;
        setTargetHref(role === 'teacher' ? '/teacher' : '/student');
      }
    };
    checkUser();
  }, [supabase]);

  const handleChangeTheme = (newTheme: ThemeKey) => {
    setTheme(newTheme);
    localStorage.setItem('flashlearn_theme', newTheme);
  };

  const speakDemoWord = (e: React.MouseEvent, word: string) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const nextDemoCard = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
    setDemoIndex((prev) => (prev + 1) % DEMO_CARDS.length);
  };

  const t = THEMES[theme];
  const currentDemo = DEMO_CARDS[demoIndex];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${t.bg} ${t.textMain} flex flex-col justify-between`}>
      
      {/* 1. Thanh điều hướng & Bộ đổi Theme */}
      <header className={`sticky top-0 z-30 backdrop-blur-md border-b transition-colors duration-300 ${t.navBg}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight">
            <div className={`p-2 rounded-xl ${t.accentBg}`}>
              <BookOpen size={22} />
            </div>
            <span>FlashLearn</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Nút chuyển đổi Theme */}
            <div className={`flex items-center gap-1 p-1 rounded-xl border ${t.cardBg}`}>
              <button
                type="button"
                onClick={() => handleChangeTheme('light')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                  theme === 'light' ? 'bg-blue-600 text-white' : `${t.textSub} hover:opacity-80`
                }`}
                title="Giao diện Sáng"
              >
                <Sun size={15} />
                <span className="hidden sm:inline">Sáng</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeTheme('dark')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                  theme === 'dark' ? 'bg-indigo-500 text-white' : `${t.textSub} hover:opacity-80`
                }`}
                title="Giao diện Tối"
              >
                <Moon size={15} />
                <span className="hidden sm:inline">Tối</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeTheme('ocean')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                  theme === 'ocean' ? 'bg-teal-400 text-slate-950' : `${t.textSub} hover:opacity-80`
                }`}
                title="Theme Đại dương"
              >
                <Palette size={15} />
                <span className="hidden sm:inline">Đại dương</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeTheme('royal')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                  theme === 'royal' ? 'bg-amber-400 text-slate-950' : `${t.textSub} hover:opacity-80`
                }`}
                title="Theme Ngân hà"
              >
                <Sparkles size={15} />
                <span className="hidden sm:inline">Ngân hà</span>
              </button>
            </div>

            <Link
              href={targetHref}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition shadow-sm ${t.accentBg}`}
            >
              {isLoggedIn ? 'Vào trang học tập' : 'Đăng nhập'}
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section & Thẻ Flashcard Tương tác */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20 space-y-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Cột trái: Giới thiệu & Nút tham gia web */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border ${t.badgeBg}`}>
              <Sparkles size={14} />
              <span>Nền tảng học từ vựng thông minh với thuật toán SRS</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
              Chinh phục từ vựng <br />
              <span className={t.accentText}>nhanh gấp 5 lần</span> mỗi ngày
            </h1>

            <p className={`text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed ${t.textSub}`}>
              Hệ thống Flashcard thông minh tự động tính toán thời điểm bạn sắp quên để nhắc ôn tập. Kết nối trực tiếp giữa kho học liệu của Giảng viên và lộ trình cá nhân của Học viên.
            </p>

            {/* Cụm nút bấm tham gia web */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Link
                href={targetHref}
                className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2.5 transition transform hover:scale-105 shadow-lg ${t.accentBg}`}
              >
                <span>{isLoggedIn ? 'Tiếp tục lộ trình học' : 'Tham gia học ngay'}</span>
                <ArrowRight size={20} />
              </Link>

              <Link
                href={isLoggedIn ? '/student/explore' : '/register'}
                className={`w-full sm:w-auto px-7 py-4 rounded-2xl font-bold text-base border transition flex items-center justify-center gap-2 ${t.cardBg} hover:opacity-90`}
              >
                <Globe size={19} className={t.accentText} />
                <span>{isLoggedIn ? 'Khám phá kho từ vựng' : 'Tạo tài khoản miễn phí'}</span>
              </Link>
            </div>

            <div className={`pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-xs font-semibold ${t.textSub}`}>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className={t.accentText} /> Lộ trình SRS riêng biệt
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className={t.accentText} /> Phát âm chuẩn bản xứ
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className={t.accentText} /> Import Excel trong 3 giây
              </span>
            </div>
          </div>

          {/* Cột phải: Thẻ Flashcard dùng thử trực tiếp */}
          <div className="lg:col-span-5">
            <div 
              onClick={() => setIsFlipped(!isFlipped)}
              className={`rounded-3xl p-7 border-2 cursor-pointer transition-all duration-300 select-none min-h-80 flex flex-col justify-between ${t.cardBg}`}
            >
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span className={t.accentText}>
                  {isFlipped ? 'Mặt sau • Định nghĩa' : `Thẻ mẫu ${demoIndex + 1}/${DEMO_CARDS.length} • Chạm để lật`}
                </span>
                <span className={`flex items-center gap-1 ${t.textSub}`}>
                  <RotateCw size={14} /> Lật thẻ
                </span>
              </div>

              {!isFlipped ? (
                <div className="my-auto py-8 text-center space-y-4">
                  <h2 className="text-4xl font-black tracking-tight">{currentDemo.term}</h2>
                  <p className={`font-mono text-base ${t.textSub}`}>{currentDemo.phonetic}</p>
                  <div>
                    <button
                      type="button"
                      onClick={(e) => speakDemoWord(e, currentDemo.term)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border ${t.badgeBg}`}
                    >
                      <Volume2 size={16} /> Nghe phát âm thử
                    </button>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-8 text-center space-y-4">
                  <p className={`text-xs font-bold uppercase ${t.textSub}`}>{currentDemo.term}</p>
                  <h3 className={`text-2xl sm:text-3xl font-extrabold ${t.accentText}`}>
                    {currentDemo.definition}
                  </h3>
                  <p className={`text-sm italic px-4 ${t.textSub}`}>
                    "{currentDemo.example}"
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-500/20 text-xs">
                <span className={t.textSub}>Bấm vào thẻ để xem nghĩa</span>
                <button
                  type="button"
                  onClick={nextDemoCard}
                  className={`font-bold hover:underline ${t.accentText}`}
                >
                  Đổi từ khác →
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* 3. Khu vực 3 Tính năng cốt lõi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`p-6 rounded-2xl border transition ${t.cardBg}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border ${t.badgeBg}`}>
              <Brain size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">Lặp lại ngắt quãng (SRS)</h3>
            <p className={`text-sm leading-relaxed ${t.textSub}`}>
              Tự động phân tích mức độ ghi nhớ của từng từ vựng để lên lịch ôn tập cá nhân hóa cho riêng bạn.
            </p>
          </div>

          <div className={`p-6 rounded-2xl border transition ${t.cardBg}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border ${t.badgeBg}`}>
              <GraduationCap size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">Kết nối Giảng viên & Học viên</h3>
            <p className={`text-sm leading-relaxed ${t.textSub}`}>
              Tham gia các khóa học chuyên sâu từ giảng viên hoặc tự do khám phá kho từ vựng cộng đồng hoàn toàn miễn phí.
            </p>
          </div>

          <div className={`p-6 rounded-2xl border transition ${t.cardBg}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border ${t.badgeBg}`}>
              <Zap size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2">Tạo thẻ siêu tốc bằng Excel</h3>
            <p className={`text-sm leading-relaxed ${t.textSub}`}>
              Nhập hàng trăm thẻ từ vựng, phiên âm và ví dụ chỉ với một thao tác kéo thả file Excel đơn giản.
            </p>
          </div>
        </div>
      </main>

      {/* 4. Footer */}
      <footer className={`border-t py-6 text-center text-xs ${t.navBg} ${t.textSub}`}>
        © 2026 FlashLearn — Nền tảng học từ vựng thông minh bằng phương pháp Lặp lại ngắt quãng.
      </footer>
    </div>
  );
}