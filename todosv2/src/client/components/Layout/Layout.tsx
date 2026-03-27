import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <div className="flex flex-1">
        {/* Sidebar - hidden on mobile, shown when sidebarOpen is true */}
        <div className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          fixed lg:sticky
          inset-y-0 left-0 z-50
          w-64 lg:w-64
          transition-transform duration-300 ease-in-out
          lg:top-0 lg:h-screen
        `}>
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
        
        {/* Main content */}
        <main className="flex-1 p-4 lg:p-6 w-full lg:w-[calc(100%-16rem)] pb-16 lg:pb-6">
          <Outlet />
        </main>
      </div>
      
      {/* Mobile bottom navigation */}
      <MobileBottomNav currentPath={location.pathname} />
    </div>
  );
};

export default Layout;