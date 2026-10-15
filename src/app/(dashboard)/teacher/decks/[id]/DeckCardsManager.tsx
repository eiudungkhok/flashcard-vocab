// src/app/(dashboard)/teacher/decks/[id]/DeckCardsManager.tsx
'use client';

import { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  Edit3, 
  Check, 
  X, 
  Settings, 
  Globe, 
  Lock, 
  Save 
} from 'lucide-react';
import { 
  addCardToDeck, 
  deleteCard, 
  updateCard, 
  updateDeckInfo, 
  deleteDeck 
} from '@/app/actions/studyActions';
import { useRouter } from 'next/navigation';

interface Card {
  id: string;
  term: string;
  phonetic?: string;
  definition: string;
  example?: string;
}

interface Course {
  id: string;
  title: string;
}

interface DeckInfo {
  id: string;
  title: string;
  description?: string;
  course_id?: string | null;
  is_public?: boolean;
}

export default function DeckCardsManager({ 
  deck, 
  cards, 
  courses 
}: { 
  deck: DeckInfo; 
  cards: Card[]; 
  courses: Course[];
}) {
  const router = useRouter();

  // --- STATE CHỈNH SỬA THÔNG TIN BỘ TỪ VỰNG ---
  const [isEditingDeck, setIsEditingDeck] = useState(false);
  const [deckTitle, setDeckTitle] = useState(deck.title);
  const [deckDesc, setDeckDesc] = useState(deck.description || '');
  const [selectedCourse, setSelectedCourse] = useState(deck.course_id || '');
  const [isPublic, setIsPublic] = useState(Boolean(deck.is_public));
  const [isSavingDeck, setIsSavingDeck] = useState(false);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);

  // --- STATE THÊM THẺ MỚI ---
  const [term, setTerm] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [definition, setDefinition] = useState('');
  const [example, setExample] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // --- STATE CHỈNH SỬA TỪNG THẺ TRỰC TIẾP (INLINE EDIT) ---
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState('');
  const [editPhonetic, setEditPhonetic] = useState('');
  const [editDefinition, setEditDefinition] = useState('');
  const [editExample, setEditExample] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 1. Lưu thông tin Bộ từ vựng
  const handleSaveDeckInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckTitle.trim()) {
      alert('Tên bộ từ vựng không được để trống!');
      return;
    }

    setIsSavingDeck(true);
    const res = await updateDeckInfo(deck.id, {
      title: deckTitle,
      description: deckDesc,
      courseId: selectedCourse || null,
      isPublic: isPublic
    });
    setIsSavingDeck(false);

    if (res.success) {
      setIsEditingDeck(false);
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  // 2. Xóa toàn bộ Bộ từ vựng
  const handleDeleteDeck = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn bộ từ vựng "${deck.title}" không?`)) return;

    setIsDeletingDeck(true);
    const res = await deleteDeck(deck.id);
    setIsDeletingDeck(false);

    if (res.success) {
      router.push('/teacher');
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  // 3. Thêm thẻ từ vựng mới
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim() || !definition.trim()) {
      alert('Vui lòng nhập Từ vựng và Định nghĩa!');
      return;
    }

    setIsAdding(true);
    const res = await addCardToDeck(deck.id, { term, phonetic, definition, example });
    setIsAdding(false);

    if (res.success) {
      setTerm('');
      setPhonetic('');
      setDefinition('');
      setExample('');
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  // 4. Bắt đầu sửa 1 thẻ
  const startEditCard = (card: Card) => {
    setEditingCardId(card.id);
    setEditTerm(card.term);
    setEditPhonetic(card.phonetic || '');
    setEditDefinition(card.definition);
    setEditExample(card.example || '');
  };

  // 5. Lưu thẻ đang sửa
  const handleSaveCard = async (cardId: string) => {
    if (!editTerm.trim() || !editDefinition.trim()) {
      alert('Từ vựng và Định nghĩa không được để trống!');
      return;
    }

    setIsSavingCard(true);
    const res = await updateCard(cardId, deck.id, {
      term: editTerm,
      phonetic: editPhonetic,
      definition: editDefinition,
      example: editExample
    });
    setIsSavingCard(false);

    if (res.success) {
      setEditingCardId(null);
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  // 6. Xóa 1 thẻ
  const handleDeleteCard = async (cardId: string, cardTerm: string) => {
    if (!window.confirm(`Xóa từ vựng "${cardTerm}" khỏi bộ này?`)) return;

    setDeletingId(cardId);
    const res = await deleteCard(cardId, deck.id);
    setDeletingId(null);

    if (res.success) {
      router.refresh();
    } else {
      alert('❌ ' + res.error);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* KHỐI 1: THÔNG TIN & CÀI ĐẶT BỘ TỪ VỰNG */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        {!isEditingDeck ? (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Mô tả bộ từ vựng</h3>
              <p className="text-gray-700 text-sm">
                {deck.description || 'Chưa có mô tả cho bộ từ vựng này.'}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditingDeck(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-100 transition"
              >
                <Settings size={16} />
                Chỉnh sửa bộ từ vựng
              </button>
              <button
                type="button"
                onClick={handleDeleteDeck}
                disabled={isDeletingDeck}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-semibold text-sm hover:bg-red-100 transition disabled:opacity-50"
              >
                {isDeletingDeck ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Xóa bộ này
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveDeckInfo} className="space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Settings size={18} className="text-blue-600" />
                Chỉnh sửa thông tin Bộ từ vựng
              </h3>
              <button
                type="button"
                onClick={() => setIsEditingDeck(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Tên bộ từ vựng *</label>
                <input
                  type="text"
                  required
                  value={deckTitle}
                  onChange={(e) => setDeckTitle(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Thuộc Khóa học</label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="">-- Bộ bài tự do (Không thuộc khóa nào) --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      📚 {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Mô tả chi tiết</label>
              <textarea
                value={deckDesc}
                onChange={(e) => setDeckDesc(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-20"
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                {isPublic ? <Globe size={16} className="text-green-600" /> : <Lock size={16} className="text-gray-500" />}
                Công khai bộ từ vựng cho toàn hệ thống
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingDeck(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeck}
                  className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {isSavingDeck ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* KHỐI 2: THÊM NHANH 1 TỪ VỰNG MỚI */}
      <form onSubmit={handleAddCard} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-4">
        <h3 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
          <Plus size={18} className="text-blue-600" />
          Thêm từ vựng mới vào bộ này
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            required
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Từ vựng (VD: Algorithm) *"
            className="px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            value={phonetic}
            onChange={(e) => setPhonetic(e.target.value)}
            placeholder="Phiên âm (VD: /ˈælɡərɪðəm/)"
            className="px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            required
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Định nghĩa (VD: Thuật toán) *"
            className="px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="Ví dụ câu..."
              className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={isAdding}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition flex items-center gap-1 shrink-0 disabled:opacity-50"
            >
              {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Thêm
            </button>
          </div>
        </div>
      </form>

      {/* KHỐI 3: BẢNG DANH SÁCH & CHỈNH SỬA TRỰC TIẾP TỪNG THẺ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="font-bold text-gray-800">Danh sách thẻ từ vựng ({cards.length})</h2>
          <span className="text-xs text-gray-500">Bấm biểu tượng cây bút để sửa trực tiếp từng từ</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
                <th className="p-4 font-semibold w-14 text-center">STT</th>
                <th className="p-4 font-semibold w-1/5">Từ vựng (Term)</th>
                <th className="p-4 font-semibold w-1/6">Phiên âm</th>
                <th className="p-4 font-semibold w-1/4">Định nghĩa</th>
                <th className="p-4 font-semibold">Ví dụ</th>
                <th className="p-4 font-semibold w-28 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cards.length > 0 ? (
                cards.map((card, index) => {
                  const isEditingThisRow = editingCardId === card.id;

                  return (
                    <tr key={card.id} className={isEditingThisRow ? 'bg-blue-50/40' : 'hover:bg-gray-50 transition'}>
                      <td className="p-4 text-center text-gray-400 font-medium">{index + 1}</td>

                      {isEditingThisRow ? (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editTerm}
                              onChange={(e) => setEditTerm(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editPhonetic}
                              onChange={(e) => setEditPhonetic(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editDefinition}
                              onChange={(e) => setEditDefinition(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editExample}
                              onChange={(e) => setEditExample(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveCard(card.id)}
                                disabled={isSavingCard}
                                className="p-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition disabled:opacity-50"
                                title="Lưu lại"
                              >
                                {isSavingCard ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCardId(null)}
                                className="p-1.5 bg-gray-200 text-gray-600 hover:bg-gray-300 rounded-lg transition"
                                title="Hủy"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 font-bold text-gray-900">{card.term}</td>
                          <td className="p-4 text-gray-500 font-mono text-sm">{card.phonetic || '-'}</td>
                          <td className="p-4 text-blue-700 font-medium">{card.definition}</td>
                          <td className="p-4 text-gray-600 text-sm italic">{card.example || '-'}</td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditCard(card)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="Sửa từ vựng này"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCard(card.id, card.term)}
                                disabled={deletingId === card.id}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                                title="Xóa từ vựng này"
                              >
                                {deletingId === card.id ? (
                                  <Loader2 size={16} className="animate-spin text-red-600" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    Bộ từ vựng này chưa có thẻ nào. Hãy thêm từ vựng ở khung bên trên!
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