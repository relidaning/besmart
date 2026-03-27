import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { user, logout } = useAuth();
  
  const navigation = [
    { name: 'Todos', href: '/todos', icon: '📝' },
    { name: 'Finished Todos', href: '/todos/finished', icon: '✅' },
    { name: 'Categories', href: '/categories', icon: '📁' },
    { name: 'Statistics', href: '/stats', icon: '📊' },
    { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
  ];

  const handleClick = () => {
    if (onClose && window.innerWidth < 1024) {
      onClose();
    }
  };

  const handleLogout = () => {
    if (onClose && window.innerWidth < 1024) {
      onClose();
    }
    logout();
  };

  return (
    <aside className="w-64 bg-white border-r h-full lg:min-h-[calc(100vh-4rem)]">
      <div className="p-4 border-b lg:hidden flex justify-between items-center">
        <h2 className="font-semibold text-gray-800">Menu</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          aria-label="Close menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4 border-b hidden lg:block">
        <h1 className="text-xl font-bold text-gray-800">TodosV2</h1>
        <p className="text-sm text-gray-600 mt-1">Your productivity assistant</p>
        {user && (
          <div className="mt-2 text-sm text-gray-700">
            👤 {user.username}
          </div>
        )}
      </div>
      
      <nav className="p-4">
        <ul className="space-y-2">
          {navigation.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.href}
                onClick={handleClick}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`
                }
              >
                <span className="text-lg mr-2">{item.icon}</span>
                <span className="text-sm lg:text-base">{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t mt-auto">
        {user && (
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-4 py-3 rounded-lg text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <span className="mr-2">🚪</span>
            <span className="text-sm lg:text-base">Logout</span>
          </button>
        )}
        <div className="text-xs text-gray-500 mt-2 text-center">
          v2.0.0 • {new Date().getFullYear()}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;