// src/app/(dashboard)/teacher/analytics/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Activity,
  Users,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  RefreshCw,
  Filter,
  Eye,
  Award,
  Layers,
  BarChart3,
  PlusCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { formatDurationVN, toVNDateKey } from '@/utils/analytics/timeEngine';
import {
  createAssignmentWithSnapshot,
  createQuizFromDeck,
  getTeacherAnalyticsData,
  getTeacherStudentDetailData,
} from '@/app/actions/studyActions';

type TabKey =
  | 'traffic'
  | 'matrix_chart'
  | 'words_alert'
  | 'assign_quiz'
  | 'compare_rank';

export default function TeacherAnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('traffic');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [scopeMode, setScopeMode] = useState<'class_learning' | 'website'>('class_learning');
  const [courseId, setCourseId] = useState<string>('all');
  const [deckId, setDeckId] = useState<string>('all');
  const [assignmentId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Lấy ngày chuẩn theo múi giờ Việt Nam GMT+7 (Khắc phục lỗi lùi 1 ngày về 20/10 khi mở lúc 6h sáng 21/10)
  const [fromDate, setFromDate] = useState<string>(() =>
    toVNDateKey(Date.now() - 29 * 86400000)
  );
  const [toDate, setToDate] = useState<string>(() => toVNDateKey(Date.now()));

  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [quizRule, setQuizRule] = useState<'highest' | 'latest' | 'first'>('highest');
  const [rankingMetric, setRankingMetric] = useState<'completion' | 'study_days' | 'quiz_score'>('completion');
  const [inactiveDays, setInactiveDays] = useState<number>(3);
  const [signalThresholdSec, setSignalThresholdSec] = useState<number>(60);

  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('lastSeenAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({
    courseId: '',
    deckId: '',
    title: '',
    dueAt: '',
  });
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizForm, setQuizForm] = useState({
    courseId: '',
    deckId: '',
    title: '',
  });

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await getTeacherAnalyticsData({
        scopeMode,
        courseId,
        deckId,
        assignmentId,
        status: statusFilter,
        from: fromDate,
        to: toDate,
        granularity,
        quizRule,
        rankingMetric,
        inactiveDays,
        signalThresholdSec,
        search,
        sortBy,
        sortOrder,
        page,
        pageSize,
      });

      if (res && !('error' in res)) {
        setData(res);
      }
    } catch (e) {
      console.error('Lỗi tải thống kê giảng viên:', e);
    } finally {
      setLoading(false);
    }
  }, [
    scopeMode,
    courseId,
    deckId,
    assignmentId,
    statusFilter,
    fromDate,
    toDate,
    granularity,
    quizRule,
    rankingMetric,
    inactiveDays,
    signalThresholdSec,
    search,
    sortBy,
    sortOrder,
    page,
    pageSize,
  ]);

  useEffect(() => {
    fetchDashboard();
    const timer = setInterval(fetchDashboard, 30000);
    return () => clearInterval(timer);
  }, [fetchDashboard]);

  const openStudentModal = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setLoadingDetail(true);
    setStudentDetail(null);
    try {
      const res = await getTeacherStudentDetailData(studentId);
      if (res && !('error' in res)) {
        setStudentDetail(res);
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleExportReport = (format: 'xlsx' | 'csv' | 'pdf') => {
    if (!data) return;

    if (format === 'pdf') {
      window.print();
      return;
    }

    const rowsForExport = (data.trafficTable?.rows || []).map((r: any, idx: number) => ({
      STT: idx + 1,
      'Họ tên': r.fullName,
      'Mã sinh viên': r.studentCode,
      Lớp: (r.classes || []).join(', '),
      'Số lượt truy cập': r.visitsCount,
      'Số ngày truy cập': r.visitDaysCount,
      'Thời gian truy cập (giây)': r.presenceSec,
      'Thời gian hoạt động (giây)': r.activeSec,
      'Thời gian học (giây)': r.studySec,
      'Số buổi học': r.sessionsCount,
      'Số lượt ôn': r.reviewsCount,
      'Tiến độ bộ thẻ (%)': r.completionPct,
      'Lần truy cập gần nhất': r.lastSeenAt
        ? new Date(r.lastSeenAt).toLocaleString('vi-VN')
        : 'Chưa ghi nhận',
      'Lần học gần nhất': r.lastStudyAt
        ? new Date(r.lastStudyAt).toLocaleString('vi-VN')
        : 'Chưa ghi nhận',
      'Trạng thái tín hiệu': r.realtimeLabel,
    }));

    const wb = XLSX.utils.book_new();
    const wsTraffic = XLSX.utils.json_to_sheet(rowsForExport);
    XLSX.utils.book_append_sheet(wb, wsTraffic, 'Luu_Luong_Hoc_Vien');

    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(wsTraffic);
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bao_Cao_Giang_Vien_${fromDate}_${toDate}.csv`;
      a.click();
      return;
    }

    const wsClassCompare = XLSX.utils.json_to_sheet(
      (data.gv9ClassComparison || []).map((c: any) => ({
        'Tên lớp': c.courseTitle,
        'Quy mô lớp': c.classSize,
        'Số HV có học': c.activeLearners,
        'Tỷ lệ tham gia (%)': c.participationRate,
        'Tiến độ TB (%)': c.avgCompletionPct,
        'Thời gian học TB (giây)': c.avgStudySec,
        'Điểm KT TB': c.avgQuizScore ?? 'Chưa có',
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsClassCompare, 'So_Sanh_Lop');

    XLSX.writeFile(wb, `Bao_Cao_Thong_Ke_Giang_Vien_${fromDate}_${toDate}.xlsx`);
  };

  const renderStatusBadge = (status: string, label: string) => {
    if (status === 'studying') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
          <span className="w-2 h-2 rounded-full bg-green-600 animate-ping" />
          {label}
        </span>
      );
    }
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          {label}
        </span>
      );
    }
    if (status === 'idle') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        {label}
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="min-h-96 flex flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 size={34} className="animate-spin text-blue-600" />
        <p className="font-semibold text-sm">Đang tổng hợp dữ liệu thống kê & lưu lượng lớp học...</p>
      </div>
    );
  }

  const ov = data?.gv1Overview || {};
  const tf = data?.trafficSummary || {};

  return (
    <div className="space-y-8 pb-16 animate-in fade-in duration-300">
      
      {/* 1. HEADER & CỤM NÚT XUẤT BÁO CÁO (GV11) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">
            <ShieldCheck size={16} />
            <span>Kiểm soát quyền truy cập theo Lớp phụ trách • Múi giờ chuẩn GMT+7</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
            Dashboard Thống Kê & Lưu Lượng Học Viên
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Cập nhật gần nhất lúc:{' '}
            <strong>
              {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('vi-VN') : '--:--'}
            </strong>{' '}
            (Tự động làm mới mỗi 30s • Trạng thái phản ánh tín hiệu gần nhất trong ngưỡng {signalThresholdSec}s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={fetchDashboard}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
          >
            <RefreshCw size={15} /> Làm mới ngay
          </button>
          <button
            type="button"
            onClick={() => handleExportReport('xlsx')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <FileSpreadsheet size={15} /> Xuất Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => handleExportReport('csv')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <FileText size={15} /> Xuất CSV
          </button>
          <button
            type="button"
            onClick={() => handleExportReport('pdf')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            <Printer size={15} /> Xuất PDF
          </button>
        </div>
      </div>

      {/* 2. THANH BỘ LỌC TÁCH BIỆT PHẠM VI SỐ LIỆU */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-blue-600" />
            <span className="font-bold text-sm text-gray-800">Chế độ Phạm vi Số liệu:</span>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-gray-100 border border-gray-200">
            <button
              type="button"
              onClick={() => {
                setScopeMode('class_learning');
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                scopeMode === 'class_learning'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📚 Hoạt động học của lớp (Tính trên các bộ thẻ của Giảng viên)
            </button>
            <button
              type="button"
              onClick={() => {
                setScopeMode('website');
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                scopeMode === 'website'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              🌐 Hoạt động trên website (Toàn bộ truy cập của học viên thuộc lớp)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Lớp phụ trách</label>
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setDeckId('all');
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold bg-white"
            >
              <option value="all">Tất cả lớp phụ trách ({data?.courses?.length || 0})</option>
              {(data?.courses || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Bộ thẻ được giao</label>
            <select
              value={deckId}
              onChange={(e) => {
                setDeckId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold bg-white"
            >
              <option value="all">Tất cả bộ thẻ ({data?.decks?.length || 0})</option>
              {(data?.decks || []).map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Trạng thái tín hiệu</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold bg-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="studying">🟢 Đang học</option>
              <option value="active">🔵 Đang hoạt động</option>
              <option value="idle">🟡 Không hoạt động</option>
              <option value="offline">⚪ Không có tín hiệu gần đây</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Từ ngày</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Đến ngày</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Ngưỡng còn tín hiệu (giây)</label>
            <input
              type="number"
              min={15}
              max={300}
              value={signalThresholdSec}
              onChange={(e) => setSignalThresholdSec(Number(e.target.value) || 60)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold"
            />
          </div>
        </div>
      </div>

      {/* 3. GV1 – TỔNG QUAN LỚP */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            GV1 – Tổng quan lớp phụ trách
          </h2>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Quy tắc mẫu số: {ov.denominatorNote || 'Đếm học viên duy nhất thuộc lớp'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Tổng học viên</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{ov.totalStudents || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Không cộng trùng đa lớp</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Có truy cập</p>
            <p className="text-2xl font-black text-blue-600 mt-1">{ov.visitedStudents || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Có tín hiệu vào website</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Có học hợp lệ</p>
            <p className="text-2xl font-black text-green-600 mt-1">{ov.studiedStudents || 0}</p>
            <p className="text-[11px] text-green-700 font-semibold mt-1">
              Tỷ lệ tham gia: {ov.participationRate || 0}%
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Chưa học</p>
            <p className="text-2xl font-black text-orange-600 mt-1">{ov.notStudiedStudents || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Chưa có lượt ôn hợp lệ</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Tổng lượt ôn thẻ</p>
            <p className="text-2xl font-black text-indigo-600 mt-1">{ov.totalReviews || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Lượt đánh giá SRS</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <p className="text-xs font-bold text-gray-400 uppercase">Bộ thẻ được giao</p>
            <p className="text-2xl font-black text-purple-600 mt-1">{ov.assignedDecksCount || 0}</p>
            <p className="text-[11px] text-gray-500 mt-1">Thuộc lớp phụ trách</p>
          </div>
        </div>
      </section>

      {/* 4. THANH CHUYỂN ĐỔI CÁC PHÂN KHU CHỨC NĂNG */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 print:hidden">
        {[
          { key: 'traffic', label: '🌐 Lưu lượng truy cập & Danh sách Học viên (Mục 3 & GV2)' },
          { key: 'matrix_chart', label: '📊 Bảng tiến độ & Biểu đồ lớp (GV3 & GV4)' },
          { key: 'words_alert', label: '⚠️ Từ vựng khó & Cảnh báo ít hoạt động (GV5 & GV6)' },
          { key: 'assign_quiz', label: '📝 Giao bài (Snapshot) & Bài kiểm tra (GV7 & GV8)' },
          { key: 'compare_rank', label: '🏆 So sánh lớp & Bảng xếp hạng (GV9 & GV10)' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as TabKey)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: KHU VỰC LƯU LƯỢNG TRUY CẬP HỌC VIÊN */}
      {activeTab === 'traffic' && (
        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-md space-y-4">
            <div>
              <h3 className="text-lg font-extrabold flex items-center gap-2">
                <Activity size={20} className="text-teal-400" />
                Khu vực Lưu lượng truy cập & Thời gian sử dụng của Học viên
              </h3>
              <p className="text-xs text-slate-400">
                Đã hợp nhất thời gian chồng lấn đa tab/thiết bị và loại trừ API, tài nguyên tĩnh, heartbeat khỏi lượt xem trang.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">1. Số lượt truy cập (Visits)</p>
                <p className="text-2xl font-black text-white mt-1">{tf.totalVisits || 0}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">2. Số HV truy cập duy nhất</p>
                <p className="text-2xl font-black text-teal-300 mt-1">{tf.uniqueVisitors || 0}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">3. Lượt xem trang (Page Views)</p>
                <p className="text-2xl font-black text-blue-300 mt-1">{tf.pageViewsCount || 0}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">4. Đang có tín hiệu hoạt động</p>
                <p className="text-2xl font-black text-sky-400 mt-1">{tf.recentlyActiveUsers || 0}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">5. Đang có tín hiệu học</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{tf.recentlyStudyingUsers || 0}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">6. Tổng thời gian truy cập</p>
                <p className="text-xl font-black text-white mt-1">{formatDurationVN(tf.totalPresenceSec || 0)}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">7. Tổng thời gian hoạt động</p>
                <p className="text-xl font-black text-blue-300 mt-1">{formatDurationVN(tf.totalActiveSec || 0)}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">8. Tổng thời gian học thực tế</p>
                <p className="text-xl font-black text-emerald-400 mt-1">{formatDurationVN(tf.totalStudySec || 0)}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-slate-700">
                <p className="text-[11px] text-slate-400 font-semibold">9. Thời lượng TB / lượt truy cập</p>
                <p className="text-xl font-black text-amber-300 mt-1">{formatDurationVN(tf.avgVisitDurationSec || 0)}</p>
              </div>
              <div className="bg-slate-800/90 p-4 rounded-2xl border border-rose-700/70">
                <p className="text-[11px] text-rose-300 font-semibold">10. Có truy cập nhưng chưa học</p>
                <p className="text-2xl font-black text-rose-400 mt-1">{tf.visitedButNoStudyUsers || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">
                  Bảng theo dõi Lưu lượng & Hoạt động từng Học viên ({data?.trafficTable?.total || 0})
                </h3>
                <p className="text-xs text-gray-500">
                  Bấm vào từng học viên để xem biểu đồ truy cập, lịch hoạt động theo giờ và danh sách các lượt vào web chi tiết.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Tìm tên, mã SV, lớp..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-xs font-semibold bg-white"
                >
                  <option value="lastSeenAt">Sắp xếp: Truy cập gần nhất</option>
                  <option value="lastStudyAt">Sắp xếp: Học gần nhất</option>
                  <option value="studySec">Sắp xếp: Thời gian học</option>
                  <option value="presenceSec">Sắp xếp: Thời gian truy cập</option>
                  <option value="visitsCount">Sắp xếp: Số lượt truy cập</option>
                  <option value="reviewsCount">Sắp xếp: Số lượt ôn</option>
                </select>

                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white hover:bg-gray-100"
                >
                  {sortOrder === 'asc' ? '↑ Tăng' : '↓ Giảm'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase border-b border-gray-200">
                    <th className="p-3 font-bold">Họ tên</th>
                    <th className="p-3 font-bold">Mã SV</th>
                    <th className="p-3 font-bold">Lớp</th>
                    <th className="p-3 font-bold text-center">Số lượt truy cập</th>
                    <th className="p-3 font-bold text-center">Số ngày truy cập</th>
                    <th className="p-3 font-bold">Thời gian truy cập</th>
                    <th className="p-3 font-bold">Thời gian hoạt động</th>
                    <th className="p-3 font-bold">Thời gian học</th>
                    <th className="p-3 font-bold text-center">Số buổi học</th>
                    <th className="p-3 font-bold text-center">Số lượt ôn</th>
                    <th className="p-3 font-bold">Lần truy cập gần nhất</th>
                    <th className="p-3 font-bold">Lần học gần nhất</th>
                    <th className="p-3 font-bold text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.trafficTable?.rows || []).length > 0 ? (
                    data.trafficTable.rows.map((row: any) => (
                      <tr
                        key={row.studentId}
                        onClick={() => openStudentModal(row.studentId)}
                        className="hover:bg-blue-50/50 transition cursor-pointer"
                      >
                        <td className="p-3 font-bold text-blue-600 hover:underline flex items-center gap-1.5">
                          <Eye size={14} /> {row.fullName}
                        </td>
                        <td className="p-3 font-mono font-semibold text-gray-700">{row.studentCode}</td>
                        <td className="p-3 text-gray-600">{(row.classes || []).join(', ')}</td>
                        <td className="p-3 text-center font-bold">{row.visitsCount}</td>
                        <td className="p-3 text-center font-semibold">{row.visitDaysCount}</td>
                        <td className="p-3 text-gray-700">{formatDurationVN(row.presenceSec)}</td>
                        <td className="p-3 text-blue-700 font-semibold">{formatDurationVN(row.activeSec)}</td>
                        <td className="p-3 text-emerald-700 font-bold">{formatDurationVN(row.studySec)}</td>
                        <td className="p-3 text-center font-semibold">{row.sessionsCount}</td>
                        <td className="p-3 text-center font-bold text-indigo-600">{row.reviewsCount}</td>
                        <td className="p-3 text-gray-500">
                          {row.lastSeenAt
                            ? new Date(row.lastSeenAt).toLocaleString('vi-VN')
                            : 'Chưa ghi nhận'}
                        </td>
                        <td className="p-3 text-gray-500">
                          {row.lastStudyAt
                            ? new Date(row.lastStudyAt).toLocaleString('vi-VN')
                            : 'Chưa ghi nhận'}
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(row.realtimeStatus, row.realtimeLabel)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={13} className="p-8 text-center text-gray-400">
                        Không có học viên nào khớp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
              <span className="text-gray-500 font-medium">
                Trang {page} / {Math.max(1, Math.ceil((data?.trafficTable?.total || 0) / pageSize))} (Tổng{' '}
                {data?.trafficTable?.total || 0} học viên duy nhất)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-gray-300 rounded-lg bg-white disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  disabled={page * pageSize >= (data?.trafficTable?.total || 0)}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 border border-gray-300 rounded-lg bg-white disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GV3 & GV4 */}
      {activeTab === 'matrix_chart' && (
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-600" />
                  GV4 – Biểu đồ hoạt động học của lớp
                </h3>
                <p className="text-xs text-gray-500">
                  Số học viên có học, tổng lượt ôn và số phút học thực tế theo khoảng thời gian
                </p>
              </div>
              <div className="inline-flex p-1 bg-gray-100 rounded-xl">
                {(['day', 'week', 'month'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      granularity === g ? 'bg-blue-600 text-white' : 'text-gray-600'
                    }`}
                  >
                    {g === 'day' ? 'Theo Ngày' : g === 'week' ? 'Theo Tuần' : 'Theo Tháng'}
                  </button>
                ))}
              </div>
            </div>

            {(data?.gv4Timeline || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 uppercase border-b">
                      <th className="p-3">Mốc thời gian</th>
                      <th className="p-3">Số học viên có học</th>
                      <th className="p-3">Số lượt ôn thẻ</th>
                      <th className="p-3">Thời gian học (phút)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.gv4Timeline.map((item: any) => (
                      <tr key={item.bucket} className="hover:bg-gray-50">
                        <td className="p-3 font-bold text-gray-800">{item.bucket}</td>
                        <td className="p-3 font-semibold text-blue-600">{item.activeLearners} học viên</td>
                        <td className="p-3 font-semibold text-indigo-600">{item.reviewsCount} lượt</td>
                        <td className="p-3 font-semibold text-emerald-600">{item.studyMinutes} phút</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400 text-sm">
                Chưa có dữ liệu lượt ôn trong khoảng thời gian này.
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Layers size={20} className="text-indigo-600" />
                GV3 – Ma trận Tiến độ (Học viên × Bộ thẻ được giao)
              </h3>
              <p className="text-xs text-gray-500">
                Tiến độ tính bằng số thẻ KHÁC NHAU đã ôn / Tổng số thẻ của bộ bài.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase border-b">
                    <th className="p-3 font-bold">Học viên</th>
                    <th className="p-3 font-bold">Mã SV</th>
                    {(data?.gv3ProgressMatrix?.decks || []).map((d: any) => (
                      <th key={d.id} className="p-3 font-bold text-center">
                        {d.title} ({d.totalCards} thẻ)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.gv3ProgressMatrix?.students || []).map((st: any) => (
                    <tr key={st.studentId} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">{st.fullName}</td>
                      <td className="p-3 font-mono text-gray-600">{st.studentCode}</td>
                      {(st.cells || []).map((cell: any) => (
                        <td key={cell.deckId} className="p-3 text-center">
                          <div className="inline-flex flex-col items-center p-2 rounded-xl bg-gray-50 border border-gray-200 min-w-28">
                            <span className="font-extrabold text-blue-600">
                              {cell.reviewedDistinct}/{cell.totalCards} ({cell.completionPct}%)
                            </span>
                            <span className="text-[10px] font-semibold text-gray-500 mt-0.5">
                              {cell.status === 'completed'
                                ? '✅ Hoàn thành'
                                : cell.status === 'in_progress'
                                ? '⏳ Đang học'
                                : '⚪ Chưa bắt đầu'}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GV5 & GV6 */}
      {activeTab === 'words_alert' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">
                GV5 – Xếp hạng Từ vựng khó trong lớp
              </h3>
              <p className="text-xs text-gray-500">
                Xếp theo tỷ lệ đánh giá “Chưa nhớ”, kèm số lượt đánh giá và số học viên đã ôn.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase border-b">
                    <th className="p-3">Từ vựng</th>
                    <th className="p-3">Bộ thẻ</th>
                    <th className="p-3 text-center">Tỷ lệ Chưa nhớ</th>
                    <th className="p-3 text-center">Lượt đánh giá</th>
                    <th className="p-3 text-center">Số HV đã ôn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.gv5HardWords || []).length > 0 ? (
                    data.gv5HardWords.map((w: any) => (
                      <tr key={w.cardId} className="hover:bg-gray-50">
                        <td className="p-3">
                          <p className="font-bold text-gray-900">{w.term}</p>
                          <p className="text-gray-500">{w.definition}</p>
                        </td>
                        <td className="p-3 text-gray-600">{w.deckTitle}</td>
                        <td className="p-3 text-center">
                          <span className="px-2.5 py-1 rounded-full font-bold bg-red-50 text-red-600">
                            {w.unrememberedRate}%
                          </span>
                        </td>
                        <td className="p-3 text-center font-semibold">{w.totalEvaluations}</td>
                        <td className="p-3 text-center font-semibold">{w.uniqueStudentsCount} HV</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400">
                        Chưa có dữ liệu đánh giá thẻ.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-amber-500" />
                  GV6 – Phát hiện Học viên ít hoạt động
                </h3>
                <p className="text-xs text-gray-500">
                  Phân biệt rõ nhóm “Có truy cập nhưng chưa học” với nhóm “Không truy cập”
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span>Ngưỡng ngày:</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={inactiveDays}
                  onChange={(e) => setInactiveDays(Number(e.target.value) || 3)}
                  className="w-16 px-2 py-1 border rounded-lg font-bold text-center"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase border-b">
                    <th className="p-3">Học viên</th>
                    <th className="p-3">Phân loại cảnh báo</th>
                    <th className="p-3">Truy cập gần nhất</th>
                    <th className="p-3">Học gần nhất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.gv6InactiveList || []).length > 0 ? (
                    data.gv6InactiveList.map((st: any) => (
                      <tr key={st.studentId} className="hover:bg-gray-50">
                        <td className="p-3">
                          <p className="font-bold text-gray-900">{st.fullName}</p>
                          <p className="font-mono text-gray-500">{st.studentCode}</p>
                        </td>
                        <td className="p-3">
                          <span className="inline-block px-2.5 py-1 rounded-lg font-bold bg-amber-50 text-amber-700">
                            {st.reasonLabel}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500">
                          {st.lastSeenAt
                            ? new Date(st.lastSeenAt).toLocaleDateString('vi-VN')
                            : 'Chưa truy cập'}
                        </td>
                        <td className="p-3 text-gray-500">
                          {st.lastStudyAt
                            ? new Date(st.lastStudyAt).toLocaleDateString('vi-VN')
                            : 'Chưa học'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-green-600 font-semibold">
                        🎉 Tất cả học viên đều đang duy trì hoạt động học tập tốt!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GV7 & GV8 */}
      {activeTab === 'assign_quiz' && (
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">
                  GV7 – Theo dõi Bài được giao (Có chốt Snapshot thẻ lúc giao)
                </h3>
                <p className="text-xs text-gray-500">
                  Phân loại: Chưa bắt đầu, Đang làm, Hoàn thành đúng hạn, Hoàn thành muộn, Chưa hoàn thành quá hạn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
              >
                <PlusCircle size={15} /> Giao bài tập mới
              </button>
            </div>

            {(data?.gv7Assignments || []).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.gv7Assignments.map((asg: any) => (
                  <div key={asg.id} className="p-4 rounded-2xl border border-gray-200 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                          {asg.courseTitle} • Snapshot {asg.snapshotCount} thẻ
                        </span>
                        <h4 className="font-bold text-gray-900 text-base mt-1">{asg.title}</h4>
                      </div>
                      <span className="text-xs text-gray-500 font-medium">
                        Hạn: {new Date(asg.dueAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-gray-50">
                        <p className="font-black text-gray-700">{asg.notStarted}</p>
                        <p className="text-[10px] text-gray-500">Chưa làm</p>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-50">
                        <p className="font-black text-blue-700">{asg.inProgress}</p>
                        <p className="text-[10px] text-blue-600">Đang làm</p>
                      </div>
                      <div className="p-2 rounded-lg bg-green-50">
                        <p className="font-black text-green-700">{asg.completedOnTime}</p>
                        <p className="text-[10px] text-green-600">Đúng hạn</p>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50">
                        <p className="font-black text-amber-700">{asg.completedLate}</p>
                        <p className="text-[10px] text-amber-600">Nộp muộn</p>
                      </div>
                      <div className="p-2 rounded-lg bg-red-50">
                        <p className="font-black text-red-700">{asg.overdueIncomplete}</p>
                        <p className="text-[10px] text-red-600">Quá hạn</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400 text-sm">
                Chưa có bài tập nào được giao. Hãy bấm "Giao bài tập mới" để chốt Snapshot thẻ cho lớp.
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">
                  GV8 – Thống kê Bài kiểm tra
                </h3>
                <p className="text-xs text-gray-500">
                  Quy tắc lấy điểm đang áp dụng thống nhất: <strong>{quizRule === 'first' ? 'Lần làm đầu tiên' : quizRule === 'latest' ? 'Lần làm gần nhất' : 'Điểm cao nhất'}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={quizRule}
                  onChange={(e) => setQuizRule(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white"
                >
                  <option value="highest">Quy tắc: Lấy điểm cao nhất</option>
                  <option value="first">Quy tắc: Lấy lần làm đầu tiên</option>
                  <option value="latest">Quy tắc: Lấy lần làm gần nhất</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowQuizModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
                >
                  <PlusCircle size={15} /> Tạo bài kiểm tra
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                <p className="text-xs text-indigo-600 font-bold">Điểm trung bình</p>
                <p className="text-2xl font-black text-indigo-900 mt-1">
                  {data?.gv8Quizzes?.summary?.avgScore ?? 'Chưa có'}
                </p>
              </div>
              {(data?.gv8Quizzes?.distribution || []).map((d: any) => (
                <div key={d.range} className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-xs text-gray-500 font-bold">{d.range}</p>
                  <p className="text-xl font-black text-gray-900 mt-1">{d.count} HV</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: GV9 & GV10 */}
      {activeTab === 'compare_rank' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-extrabold text-gray-900">
                GV9 – So sánh giữa các Lớp phụ trách
              </h3>
              <p className="text-xs text-gray-500">
                Hiển thị quy mô từng lớp và các chỉ số bình quân trên cùng khoảng thời gian ({fromDate} đến {toDate})
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase border-b">
                    <th className="p-3">Lớp học</th>
                    <th className="p-3 text-center">Quy mô</th>
                    <th className="p-3 text-center">Tỷ lệ tham gia</th>
                    <th className="p-3 text-center">Tiến độ TB</th>
                    <th className="p-3 text-center">TG học TB/HV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.gv9ClassComparison || []).map((c: any) => (
                    <tr key={c.courseId} className="hover:bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">{c.courseTitle}</td>
                      <td className="p-3 text-center font-semibold">{c.classSize} HV</td>
                      <td className="p-3 text-center font-bold text-blue-600">{c.participationRate}%</td>
                      <td className="p-3 text-center font-bold text-indigo-600">{c.avgCompletionPct}%</td>
                      <td className="p-3 text-center text-emerald-700 font-semibold">
                        {formatDurationVN(c.avgStudySec)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                  <Award size={20} className="text-amber-500" />
                  GV10 – Bảng xếp hạng Học viên
                </h3>
                <p className="text-xs text-gray-500">
                  Giữ riêng từng tiêu chí độc lập; không coi mở web lâu là học tốt.
                </p>
              </div>
              <select
                value={rankingMetric}
                onChange={(e) => setRankingMetric(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white"
              >
                <option value="completion">Tiêu chí 1: Tỷ lệ hoàn thành bộ thẻ</option>
                <option value="study_days">Tiêu chí 2: Số ngày học hợp lệ</option>
                <option value="quiz_score">Tiêu chí 3: Điểm bài kiểm tra</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase border-b">
                    <th className="p-3 w-12 text-center">Hạng</th>
                    <th className="p-3">Học viên</th>
                    <th className="p-3">Mã SV</th>
                    <th className="p-3 text-right">Kết quả theo tiêu chí</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(data?.gv10Ranking || []).map((r: any, idx: number) => (
                    <tr key={r.studentId} className="hover:bg-gray-50">
                      <td className="p-3 text-center font-black text-blue-600">#{idx + 1}</td>
                      <td className="p-3 font-bold text-gray-900">{r.fullName}</td>
                      <td className="p-3 font-mono text-gray-500">{r.studentCode}</td>
                      <td className="p-3 text-right font-extrabold text-indigo-700">
                        {rankingMetric === 'completion'
                          ? `${r.completionPct}% (${r.distinctReviewedCards}/${r.totalAssignedCards} thẻ)`
                          : rankingMetric === 'study_days'
                          ? `${r.studyDaysCount} ngày học`
                          : r.quizScore !== null
                          ? `${r.quizScore} / 10 điểm`
                          : 'Chưa làm KT'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT 1 HỌC VIÊN (GV2 + MỤC 4) */}
      {selectedStudentId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">
                  GV2 & Mục 4 – Chi tiết Học tập & Lượt truy cập Học viên
                </h2>
                {studentDetail?.student && (
                  <p className="text-xs text-gray-500 mt-1">
                    <strong>{studentDetail.student.fullName}</strong> ({studentDetail.student.studentCode}) • Bật theo dõi từ:{' '}
                    {studentDetail.student.trackingEnabledAt
                      ? new Date(studentDetail.student.trackingEnabledAt).toLocaleDateString('vi-VN')
                      : 'Chưa ghi nhận'}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentId(null)}
                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {loadingDetail ? (
              <div className="py-16 text-center text-gray-500">
                <Loader2 size={28} className="animate-spin mx-auto mb-2 text-blue-600" />
                Đang tải chi tiết lượt truy cập và tiến độ của học viên...
              </div>
            ) : studentDetail ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-blue-50">
                    <p className="text-xs font-bold text-blue-600">Chuỗi ngày học (Streak)</p>
                    <p className="text-2xl font-black text-blue-900 mt-1">
                      {studentDetail.student.currentStreakDays} ngày
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-50">
                    <p className="text-xs font-bold text-emerald-600">Thẻ khác nhau đã thuộc/ôn</p>
                    <p className="text-2xl font-black text-emerald-900 mt-1">
                      {studentDetail.student.distinctCardsLearned} thẻ
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-indigo-50">
                    <p className="text-xs font-bold text-indigo-600">Tỷ lệ tự đánh giá Nhớ</p>
                    <p className="text-2xl font-black text-indigo-900 mt-1">
                      {studentDetail.selfRatingDistribution?.rememberedRate || 0}%
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-50">
                    <p className="text-xs font-bold text-rose-600">Lượt truy cập không học</p>
                    <p className="text-2xl font-black text-rose-900 mt-1">
                      {studentDetail.visitsWithoutStudy?.length || 0} lượt
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-2">
                  <h4 className="text-xs font-bold uppercase text-gray-700">
                    Lịch hoạt động theo khung giờ trong ngày (GMT+7)
                  </h4>
                  <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 pt-2">
                    {(studentDetail.hourlyHeatmap || []).map((h: any) => (
                      <div key={h.hour} className="flex flex-col items-center gap-1">
                        <div
                          className={`w-full h-8 rounded ${
                            h.studyCount > 0
                              ? 'bg-emerald-500'
                              : h.activeCount > 0
                              ? 'bg-blue-400'
                              : 'bg-gray-200'
                          }`}
                          title={`${h.hour}h: ${h.activeCount} nhịp hoạt động, ${h.studyCount} nhịp học`}
                        />
                        <span className="text-[9px] text-gray-500">{h.hour}h</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-sm text-gray-900">
                    Danh sách các Lượt truy cập gần nhất
                  </h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-100 text-gray-600 border-b">
                          <th className="p-3">Bắt đầu</th>
                          <th className="p-3">Kết thúc / Ghi nhận cuối</th>
                          <th className="p-3">Thiết bị</th>
                          <th className="p-3">TG Truy cập</th>
                          <th className="p-3">TG Hoạt động</th>
                          <th className="p-3">TG Học</th>
                          <th className="p-3">Đánh giá lượt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(studentDetail.visits || []).map((v: any) => (
                          <tr key={v.id} className="hover:bg-gray-50">
                            <td className="p-3 font-medium">
                              {new Date(v.startedAt).toLocaleString('vi-VN')}
                            </td>
                            <td className="p-3 text-gray-600">{v.endDisplay}</td>
                            <td className="p-3 text-gray-600">{v.deviceSummary}</td>
                            <td className="p-3">{formatDurationVN(v.presenceSec)}</td>
                            <td className="p-3 text-blue-600 font-semibold">
                              {formatDurationVN(v.activeSec)}
                            </td>
                            <td className="p-3 text-emerald-700 font-bold">
                              {formatDurationVN(v.studySec)}
                            </td>
                            <td className="p-3">
                              {v.hasStudyActivity ? (
                                <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 font-bold">
                                  Có học tập
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">
                                  Truy cập nhưng chưa học
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL GIAO BÀI TẬP MỚI (GV7) */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-extrabold text-lg">Giao bài tập mới (Kèm Snapshot thẻ)</h3>
            <select
              value={assignForm.courseId}
              onChange={(e) => setAssignForm({ ...assignForm, courseId: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            >
              <option value="">-- Chọn lớp phụ trách --</option>
              {(data?.courses || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <select
              value={assignForm.deckId}
              onChange={(e) => setAssignForm({ ...assignForm, deckId: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            >
              <option value="">-- Chọn bộ thẻ --</option>
              {(data?.decks || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Tiêu đề bài giao..."
              value={assignForm.title}
              onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            />
            <input
              type="datetime-local"
              value={assignForm.dueAt}
              onChange={(e) => setAssignForm({ ...assignForm, dueAt: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await createAssignmentWithSnapshot(assignForm);
                  if (res.success) {
                    setShowAssignModal(false);
                    fetchDashboard();
                  } else {
                    alert(res.error);
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                Xác nhận Giao bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TẠO BÀI KIỂM TRA MỚI (GV8) */}
      {showQuizModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-extrabold text-lg">Tạo Bài kiểm tra từ Bộ thẻ</h3>
            <select
              value={quizForm.courseId}
              onChange={(e) => setQuizForm({ ...quizForm, courseId: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            >
              <option value="">-- Chọn lớp phụ trách --</option>
              {(data?.courses || []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            <select
              value={quizForm.deckId}
              onChange={(e) => setQuizForm({ ...quizForm, deckId: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            >
              <option value="">-- Chọn bộ thẻ --</option>
              {(data?.decks || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Tên bài kiểm tra..."
              value={quizForm.title}
              onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
              className="w-full p-2.5 border rounded-xl text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowQuizModal(false)}
                className="px-4 py-2 bg-gray-100 rounded-xl text-xs font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await createQuizFromDeck(quizForm);
                  if (res.success) {
                    setShowQuizModal(false);
                    fetchDashboard();
                  } else {
                    alert(res.error);
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold"
              >
                Tạo đề kiểm tra
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}