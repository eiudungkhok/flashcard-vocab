'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

// Định nghĩa kiểu dữ liệu cho user
interface UserProps {
  name: string;
  email: string;
  role: string;
}

export default function DashboardLayout({
  children,
  user,
}: {
  children: React.ReactNode;
  user: UserProps | null; // Cập nhật lại kiểu ở đây
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

   return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        role={user?.role} 
      />
      
      <div className="flex flex-col flex-1 w-full min-w-0">
        <Navbar 
          setSidebarOpen={setIsSidebarOpen} 
          user={user} 
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {/* Cấu trúc Max-width cho content để không bị quá rộng trên màn to */}
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
