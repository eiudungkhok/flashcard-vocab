// src/components/layout/DashboardLayout.tsx
'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export interface UserProps {
  name?: string;
  email?: string;
  role?: string;
}

export default function DashboardLayout({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: UserProps | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const NavbarComponent = Navbar as any;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        role={user?.role} 
      />
      <div className="flex-1 flex flex-col min-w-0">
        <NavbarComponent 
          setSidebarOpen={setSidebarOpen} 
          onMenuClick={() => setSidebarOpen(true)} 
          user={user || null} 
        />
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}