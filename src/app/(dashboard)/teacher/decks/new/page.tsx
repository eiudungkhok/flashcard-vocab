// src/app/(dashboard)/teacher/decks/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { UploadCloud, Plus, Save, FileSpreadsheet, Trash2, Download, Loader2, Globe } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';
import { createNewDeck } from '@/app/actions/studyActions';
import { createClient } from '@/utils/supabase/client';

export default function CreateDeckPage() {
  const [activeTab, setActiveTab] = useState<'manual' | 'excel'>('excel');
  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  
  const [courses, setCourses] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [cards, setCards] = useState([{ term: '', phonetic: '', definition: '', example: '' }]);
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const courseIdFromUrl = params.get('courseId');
    if (courseIdFromUrl) {
      setSelectedCourse(courseIdFromUrl);
      setIsPublic(false);
    }

    const fetchCourses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('courses')
          .select('id, title')
          .eq('teacher_id', user.id)
          .order('created_at', { ascending: false });
        
        if (data) setCourses(data);
      }
    };
    fetchCourses();
  }, [supabase]);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourse(courseId);
    // Nếu chọn "Bộ bài tự do", tự động tích chọn Công khai lên kho
    if (!courseId) {
      setIsPublic(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const workbook = XLSX.read(event.target?.result, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const parsedData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      
      const formattedCards = parsedData.slice(1).map(row => ({
        term: row[0] || '',
        phonetic: row[1] || '',
        definition: row[2] || '',
        example: row[3] || ''
      })).filter(card => card.term && card.definition);
      
      setCards(formattedCards);
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const templateData = [
      ["Từ vựng", "Phiên âm", "Định nghĩa", "Ví dụ"],
      ["Database", "/ˈdeɪtəˌbeɪs/", "Cơ sở dữ liệu", "PostgreSQL is an open-source database."],
      ["Framework", "/ˈfreɪmwɜːrk/", "Khuôn khổ phần mềm", "Next.js is a React framework."],
      ["Deploy", "/dɪˈplɔɪ/", "Triển khai phần mềm", "We deploy the app on Vercel."]
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 40 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    XLSX.writeFile(wb, "Flashcard_Template.xlsx");
  };

  const addCardRow = () => {
    setCards([...cards, { term: '', phonetic: '', definition: '', example: '' }]);
  };

  const removeCardRow = (index: number) => {
    setCards(cards.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!deckTitle.trim()) {
      alert("Vui lòng nhập tên bộ từ vựng!");
      return;
    }
    
    const validCards = cards.filter(c => c.term.trim() !== '' && c.definition.trim() !== '');
    
    if (validCards.length === 0) {
      alert("Vui lòng thêm ít nhất 1 thẻ từ vựng hợp lệ!");
      return;
    }

    setIsSaving(true);
    const response = await createNewDeck(deckTitle, deckDescription, validCards, selectedCourse, isPublic);
    setIsSaving(false);

    if (response.success) {
      alert("🎉 Tạo bộ từ vựng thành công!");
      if (selectedCourse) {
        router.push(`/teacher/courses/${selectedCourse}`);
      } else {
        router.push('/teacher');
      }
      router.refresh();
    } else {
      alert("❌ Lỗi: " + response.error);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Tạo bộ từ vựng mới</h1>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
          {isSaving ? 'Đang lưu...' : 'Xuất bản bộ bài'}
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Tên bộ từ vựng <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={deckTitle}
              onChange={(e) => setDeckTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="VD: Từ vựng Bài 1..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Gắn vào Khóa học</label>
            <select
              value={selectedCourse}
              onChange={(e) => handleCourseChange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
            >
              <option value="">-- Bộ bài tự do (Hiển thị trên Kho từ vựng chung) --</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  📚 {course.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Mô tả chi tiết</label>
          <textarea 
            value={deckDescription}
            onChange={(e) => setDeckDescription(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-25"
            placeholder="Mô tả ngắn gọn về bộ từ vựng..."
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input 
            type="checkbox" 
            id="isPublic" 
            checked={!selectedCourse ? true : isPublic} 
            disabled={!selectedCourse}
            onChange={(e) => setIsPublic(e.target.checked)} 
            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer disabled:opacity-60" 
          />
          <label htmlFor="isPublic" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1.5">
            <Globe size={16} className="text-green-600" />
            {!selectedCourse 
              ? 'Bộ từ vựng tự do sẽ tự động hiển thị trên Kho Khám phá cho học viên' 
              : 'Công khai bộ từ vựng này lên Kho chung (Ngoài khóa học cũng học được)'}
          </label>
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-200 pb-2">
        <button 
          onClick={() => setActiveTab('excel')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${activeTab === 'excel' ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <FileSpreadsheet size={18} /> Import từ Excel
        </button>
        <button 
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${activeTab === 'manual' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <Plus size={18} /> Nhập thủ công
        </button>
      </div>

      {activeTab === 'excel' && (
        <div className="space-y-4">
          <div className="bg-green-50/50 border-2 border-dashed border-green-200 rounded-2xl p-10 text-center relative hover:bg-green-50 transition cursor-pointer">
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                <UploadCloud size={32} />
              </div>
              <h3 className="font-bold text-gray-800 text-lg">Kéo thả file Excel hoặc Click để chọn file</h3>
              <p className="text-sm text-gray-500">Hỗ trợ định dạng .xlsx, .csv. Yêu cầu 4 cột: Từ vựng, Phiên âm, Định nghĩa, Ví dụ.</p>
            </div>
          </div>
          
          <div className="flex justify-end">
            <button 
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-green-300 text-green-700 rounded-xl hover:bg-green-50 font-medium text-sm transition shadow-sm"
            >
              <Download size={16} />
              Tải file Excel mẫu
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">Danh sách thẻ ({cards.length})</h3>
          {activeTab === 'manual' && (
            <button onClick={addCardRow} className="text-sm flex items-center gap-1 text-blue-600 font-medium hover:text-blue-800">
              <Plus size={16} /> Thêm 1 dòng
            </button>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-sm text-gray-500 border-b border-gray-200">
                <th className="p-3 font-medium w-16 text-center">STT</th>
                <th className="p-3 font-medium w-1/4">Từ vựng (Term) <span className="text-red-500">*</span></th>
                <th className="p-3 font-medium w-1/5">Phiên âm</th>
                <th className="p-3 font-medium w-1/4">Định nghĩa <span className="text-red-500">*</span></th>
                <th className="p-3 font-medium w-1/4">Ví dụ</th>
                <th className="p-3 font-medium w-16"></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 text-center text-gray-400 font-medium">{index + 1}</td>
                  <td className="p-2"><input type="text" value={card.term} onChange={(e) => { const newCards = [...cards]; newCards[index].term = e.target.value; setCards(newCards); }} className="w-full p-2 border border-gray-200 rounded-lg focus:border-blue-500 outline-none bg-transparent" placeholder="Apple" /></td>
                  <td className="p-2"><input type="text" value={card.phonetic} onChange={(e) => { const newCards = [...cards]; newCards[index].phonetic = e.target.value; setCards(newCards); }} className="w-full p-2 border border-gray-200 rounded-lg focus:border-blue-500 outline-none bg-transparent" placeholder="/ˈæp.əl/" /></td>
                  <td className="p-2"><input type="text" value={card.definition} onChange={(e) => { const newCards = [...cards]; newCards[index].definition = e.target.value; setCards(newCards); }} className="w-full p-2 border border-gray-200 rounded-lg focus:border-blue-500 outline-none bg-transparent" placeholder="Quả táo" /></td>
                  <td className="p-2"><input type="text" value={card.example} onChange={(e) => { const newCards = [...cards]; newCards[index].example = e.target.value; setCards(newCards); }} className="w-full p-2 border border-gray-200 rounded-lg focus:border-blue-500 outline-none bg-transparent" placeholder="I eat an apple." /></td>
                  <td className="p-3 text-center">
                    <button onClick={() => removeCardRow(index)} className="text-gray-400 hover:text-red-500 transition"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}