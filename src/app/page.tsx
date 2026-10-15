import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold text-blue-600 mb-2">Hệ thống Flashcard</h1>
      <p className="text-gray-500 mb-8">Nền tảng học từ vựng bằng phương pháp lặp lại ngắt quãng</p>
      
      <div className="flex gap-4">
        <Link 
          href="/student" 
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
        >
          Vào Dashboard Học viên
        </Link>
      </div>
    </div>
  );
}