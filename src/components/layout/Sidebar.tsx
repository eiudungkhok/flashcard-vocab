// src/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  BookOpen, 
  LayoutDashboard, 
  Compass, 
  Layers, 
  GraduationCap, 
  PlusCircle, 
  X 
} from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  setIsOpen?: Dispatch<SetStateAction<boolean>>;
  role?: string;
}

export default function Sidebar({ isOpen = false, onClose, setIsOpen, role }: SidebarProps) {
  const pathname = usePathname();
  
  // Nhận diện vai trò qua đường dẫn hoặc qua prop role
  const isTeacher = pathname.startsWith('/teacher') || role === 'teacher';

  const handleClose = () => {
    if (onClose) onClose();
    if (setIsOpen) setIsOpen(false);
  };

  const studentNavItems = [
    { name: 'Tổng quan', href: '/student', icon: LayoutDashboard },
    { name: 'Thư viện khám phá', href: '/student/explore', icon: Compass },
    { name: 'Ôn tập hôm nay', href: '/student/study', icon: Layers },
  ];

  const teacherNavItems = [
    { name: 'Tổng quan', href: '/teacher', icon: LayoutDashboard },
    { name: 'Quản lý khóa học', href: '/teacher/courses', icon: GraduationCap },
    { name: 'Tạo bộ từ vựng', href: '/teacher/decks/new', icon: PlusCircle },
  ];

  const navItems = isTeacher ? teacherNavItems : studentNavItems;

  return (
    <>
      {/* Lớp phủ mờ trên màn hình điện thoại */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={handleClose}
        />
      )}

      <aside 
        className={`fixed top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-200 flex flex-col justify-between transition-transform duration-300 lg:sticky lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Logo Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
            <Link 
              href={isTeacher ? '/teacher' : '/student'} 
              className="flex items-center gap-2.5 text-blue-600 font-extrabold text-xl tracking-tight"
            >
              <BookOpen size={26} />
              <span>FlashLearn</span>
            </Link>
            <button 
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg lg:hidden"
            >
              <X size={20} />
            </button>
          </div>

          {/* Nhãn phân quyền */}
          <div className="px-6 pt-5 pb-2">
            <span className={`inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
              isTeacher ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {isTeacher ? 'Không gian Giảng viên' : 'Không gian Học viên'}
            </span>
          </div>

          {/* Danh sách Menu */}
          <nav className="p-4 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = 
                item.href === '/student' || item.href === '/teacher'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleClose}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon size={20} className={isActive ? 'text-blue-600' : 'text-gray-400'} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 text-xs text-gray-400 font-medium">
          © 2026 FlashLearn App
        </div>
      </aside>
    </>
  );
}