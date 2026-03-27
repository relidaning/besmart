import React from 'react';
import { NavLink } from 'react-router-dom';

interface MobileBottomNavProps {
  currentPath: string;
}

const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentPath }) => {
  // Reordered tabs: Todos first, then Finished Todos, Categories, Dashboard last
  const navItems = [
    { path: '/todos', label: 'Todos', icon: '📝', isActive: (path: string) => 
      path === '/todos' || (path.startsWith('/todos') && path !== '/todos/finished') },
    { path: '/todos/finished', label: 'Finished', icon: '✅', isActive: (path: string) => 
      path === '/todos/finished' },
    { path: '/categories', label: 'Categories', icon: '📁', isActive: (path: string) => 
      path.startsWith('/categories') },
    { path: '/dashboard', label: 'Dashboard', icon: '📊', isActive: (path: string) => 
      path === '/dashboard' },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = item.isActive(currentPath);
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`
                flex flex-col items-center justify-center
                w-full h-full
                transition-colors duration-200
                ${isActive 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }
              `}
            >
              <span className="text-xl mb-1">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;