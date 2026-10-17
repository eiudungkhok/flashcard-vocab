// src/app/(dashboard)/student/analytics/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { 
  BarChart3, 
  Clock, 
  Brain, 
  Flame, 
  CheckCircle2, 
  BookOpen, 
  Monitor, 
  Calendar,
  ArrowUpRight,
  Loader2
} from 'lucide-react';

function formatDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds <= 0) return '0 phút';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  if (minutes > 0) return `${minutes} phút ${seconds} giây`;
  return `${seconds} giây`;
}

export default function StudentAnalyticsPage() {
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [telemetry, setTelemetry] = useState<any>({
    totalSec: 0,
    studySec: 0,
    daily: {},
    lastDevice: 'Desktop',
  });
  const [allProgress, setAllProgress] = useState<any[]>([]);
  const [decks, setDecks] = useState<any[]>([]);
  const [cardsMap, setCardsMap] = useState<Record<string, any>>({});

  useEffect(() => {
    // 1. Đọc thời gian học thực tế từ trình duyệt và tự động cập nhật mỗi 5 giây
    const loadLocalTelemetry = () => {
      try {
        const raw = localStorage.getItem('flashlearn_telemetry_stats');
        if (raw) {
          setTelemetry(JSON.parse(raw));
        }
      } catch (e) {}
    };

    loadLocalTelemetry();
    const timer = setInterval(loadLocalTelemetry, 5000);

    // 2. Tải dữ liệu tiến độ SRS từ Supabase
    const fetchAnalyticsData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data: progressList } = await supabase
          .from('card_progress')
          .select('card_id, deck_id, interval, ease_factor, repetitions, next_review, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        const progress = progressList || [];
        setAllProgress(progress);

        const studiedDeckIds = Array.from(new Set(progress.map((p: any) => p.deck_id)));
        const studiedCardIds = progress.map((p: any) => p.card_id);

        if (studiedDeckIds.length > 0) {
          const { data: decksData } = await supabase
            .from('decks')
            .select('id, title, cards(count)')
            .in('id', studiedDeckIds);
          setDecks(decksData || []);
        }

        if (studiedCardIds.length > 0) {
          const { data: recentCardsData } = await supabase
            .from('cards')
            .select('id, term, definition, deck_id')
            .in('id', studiedCardIds.slice(0, 10));

          const mapObj: Record<string, any> = {};
          (recentCardsData || []).forEach((c: any) => {
            mapObj[c.id] = c;
          });
          setCardsMap(mapObj);
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu thống kê:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalyticsData();

    return () => clearInterval(timer);
  }, [supabase]);

  // Tính toán các chỉ số hiển thị
  const todayVN = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const todayStudySec = Number(telemetry.daily?.[todayVN] || 0);
  const totalActiveSec = Number(telemetry.totalSec || 0);

  const totalLearnedCards = allProgress.length;
  const masteredCards = allProgress.filter(
    (p) => (p.repetitions || 0) >= 2 || (p.interval || 0) >= 6
  ).length;
  const learningCards = totalLearnedCards - masteredCards;

  const studiedDeckIds = Array.from(new Set(allProgress.map((p) => p.deck_id)));
  const deckMap = new Map(decks.map((d) => [d.id, d]));

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() + 7 * 3600 * 1000 - (6 - i) * 86400000);
    const dateKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const seconds = Number(telemetry.daily?.[dateKey] || 0);
    return { dateKey, label, seconds };
  });

  const maxDailySec = Math.max(...last7Days.map((d) => d.seconds), 60);

  if (isLoading) {
    return (
      <div className="min-h-96 flex flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 size={32} className="animate-spin text-blue-600" />
        <p className="text-sm font-semibold">Đang tải dữ liệu thống kê học tập...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
            <BarChart3 size={32} className="text-blue-600" />
            Thống kê tiến độ học tập
          </h1>
          <p className="text-gray-500 mt-1">
            Theo dõi thời gian trực tuyến, mức độ ghi nhớ từ vựng (SRS) và lịch sử lật thẻ của riêng bạn
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-xl border border-gray-200 shadow-sm text-xs font-semibold text-gray-600">
          <Monitor size={16} className="text-blue-600" />
          <span>Thiết bị gần nhất: <strong>{telemetry.lastDevice || 'Desktop'}</strong></span>
        </div>
      </div>

      {/* 4 Thẻ Thống kê Tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Thời gian học hôm nay</p>
            <h3 className="text-2xl font-black text-gray-900">{formatDuration(todayStudySec)}</h3>
            <p className="text-xs text-blue-600 font-medium mt-2">Tổng tích lũy: {formatDuration(totalActiveSec)}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Tổng từ đã học</p>
            <h3 className="text-2xl font-black text-gray-900">{totalLearnedCards} từ</h3>
            <p className="text-xs text-gray-500 font-medium mt-2">Trên {studiedDeckIds.length} bộ từ vựng</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <BookOpen size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Đã nhớ vững (Mastered)</p>
            <h3 className="text-2xl font-black text-green-600">{masteredCards} từ</h3>
            <p className="text-xs text-gray-500 font-medium mt-2">Chu kỳ ôn tập ≥ 6 ngày</p>
          </div>
          <div className="p-3 bg-green-50 text-green-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Đang củng cố</p>
            <h3 className="text-2xl font-black text-orange-600">{learningCards} từ</h3>
            <p className="text-xs text-gray-500 font-medium mt-2">Cần lặp lại ngắn hạn</p>
          </div>
          <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
            <Flame size={24} />
          </div>
        </div>
      </div>

      {/* Biểu đồ Thời gian học 7 ngày gần nhất & Tiến độ theo Bộ từ vựng */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Cột 1: Biểu đồ 7 ngày */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
              <Calendar size={20} className="text-blue-600" />
              Thời gian hoạt động 7 ngày qua
            </h2>
            <p className="text-xs text-gray-500 mb-6">Cập nhật theo thời gian thực khi bạn mở trang học tập</p>
          </div>

          <div className="h-52 flex items-end justify-between gap-3 pt-6 px-2 border-b border-gray-100">
            {last7Days.map((day) => {
              const heightPercent = Math.max(Math.round((day.seconds / maxDailySec) * 100), day.seconds > 0 ? 12 : 4);
              const minutes = Math.floor(day.seconds / 60);

              return (
                <div key={day.dateKey} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="text-[11px] font-bold text-blue-600">
                    {day.seconds > 0 ? (minutes > 0 ? `${minutes}p` : `${day.seconds}s`) : ''}
                  </span>
                  <div 
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full max-w-10 rounded-t-xl transition-all duration-500 ${
                      day.seconds > 0 ? 'bg-blue-600' : 'bg-gray-100'
                    }`}
                    title={`${day.label}: ${formatDuration(day.seconds)}`}
                  />
                  <span className="text-[11px] font-medium text-gray-500 pb-2">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cột 2: Tiến độ thuộc từ theo từng Bộ từ vựng */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
            <Brain size={20} className="text-indigo-600" />
            Tiến độ theo Bộ từ vựng
          </h2>
          <p className="text-xs text-gray-500 mb-6">Tỷ lệ từ vựng bạn đã lật học trong từng bộ bài</p>

          <div className="space-y-4">
            {decks.length > 0 ? (
              decks.map((deck: any) => {
                const totalCardsInDeck = deck.cards?.[0]?.count || 1;
                const learnedInDeck = allProgress.filter((p) => p.deck_id === deck.id).length;
                const percent = Math.min(Math.round((learnedInDeck / totalCardsInDeck) * 100), 100);

                return (
                  <div key={deck.id} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <Link 
                        href={`/student/decks/${deck.id}`}
                        className="font-bold text-gray-800 hover:text-blue-600 transition flex items-center gap-1"
                      >
                        {deck.title} <ArrowUpRight size={14} />
                      </Link>
                      <span className="text-xs font-bold text-gray-500">
                        {learnedInDeck}/{totalCardsInDeck} từ ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${percent}%` }}
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-gray-400 text-sm">
                Bạn chưa lật thẻ bộ từ vựng nào. Hãy vào mục Ôn tập để bắt đầu ghi nhận dữ liệu!
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bảng lịch sử các thẻ từ vựng vừa ôn tập gần đây */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h2 className="font-bold text-gray-800">Hoạt động lật thẻ gần đây</h2>
          <Link href="/student/study" className="text-xs font-bold text-blue-600 hover:underline">
            Tiếp tục ôn tập →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="p-4 font-semibold">Từ vựng</th>
                <th className="p-4 font-semibold">Định nghĩa</th>
                <th className="p-4 font-semibold">Bộ từ vựng</th>
                <th className="p-4 font-semibold text-center">Chu kỳ nhớ (SRS)</th>
                <th className="p-4 font-semibold text-right">Cập nhật lúc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allProgress.slice(0, 10).map((item) => {
                const cardInfo = cardsMap[item.card_id];
                const deckInfo = deckMap.get(item.deck_id);
                if (!cardInfo) return null;

                return (
                  <tr key={item.card_id} className="hover:bg-gray-50 transition text-sm">
                    <td className="p-4 font-bold text-gray-900">{cardInfo.term}</td>
                    <td className="p-4 text-blue-700 font-medium">{cardInfo.definition}</td>
                    <td className="p-4 text-gray-500">{deckInfo?.title || 'Bộ từ vựng'}</td>
                    <td className="p-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700">
                        {item.interval || 1} ngày
                      </span>
                    </td>
                    <td className="p-4 text-right text-xs text-gray-400">
                      {item.updated_at ? new Date(item.updated_at).toLocaleString('vi-VN') : '-'}
                    </td>
                  </tr>
                );
              })}

              {allProgress.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 text-sm">
                    Chưa có lịch sử lật thẻ nào được ghi nhận.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}