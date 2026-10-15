// src/components/layout/Navbar.tsx
'use client';

import { useState, useEffect } from 'react';
import { Menu, Bell, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

interface NavbarProps {
  onMenuClick?: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const [userName, setUserName] = useState<string>('Đang tải...');
  const [userRole, setUserRole] = useState<'student' | 'teacher'>('student');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const fullName = user.user_metadata?.full_name;
        if (fullName) {
          setUserName(fullName);
        } else {
          setUserName(user.email?.split('@')[0] || 'Tài khoản');
        }
        
        // Cập nhật chức danh
        setUserRole(user.user_metadata?.role || 'student');
      }
    };
    
    fetchUser();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden transition"
        >
          <Menu size={24} />
        </button>
        <h2 className="text-xl font-extrabold text-blue-600 hidden sm:block">Flashcard System</h2>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 text-gray-400 hover:text-blue-600 transition relative">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        
        <div className="h-8 w-px bg-gray-200 mx-2"></div>

        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <p className="text-sm font-bold text-gray-700">{userName}</p>
            <p className="text-xs text-blue-500 font-semibold uppercase tracking-wider">
              {userRole === 'teacher' ? 'Giảng viên' : 'Học viên'}
            </p>
          </div>
          
          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold shadow-sm border ${userRole === 'teacher' ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>
            {userName !== 'Đang tải...' ? userName.charAt(0).toUpperCase() : '?'}
          </div>
          
          <button 
            onClick={handleLogout}
            title="Đăng xuất"
            className="ml-2 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}