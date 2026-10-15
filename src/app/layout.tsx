import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hệ thống Flashcard',
  description: 'Ứng dụng học từ vựng tiếng Anh',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}