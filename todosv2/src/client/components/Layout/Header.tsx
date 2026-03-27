import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

interface HeaderProps {
  onMenuClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b sticky top-0 z-40">
      <div className="px-4 lg:px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2 lg:space-x-4">
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <Link to="/" className="flex items-center space-x-2">
            <h1 className="text-xl lg:text-2xl font-bold text-gray-800">TodosV2</h1>
            <span className="text-xs lg:text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded hidden sm:inline">
              v2.0.0
            </span>
          </Link>
        </div>
        
        <div className="flex items-center space-x-2 lg:space-x-4">
          {user ? (
            <>
              <div className="text-sm text-gray-600 hidden sm:block">
                Welcome, <span className="font-semibold">{user.username}</span>
              </div>
              <button
                onClick={logout}
                className="px-3 lg:px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors hidden lg:inline"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-3 lg:px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-3 lg:px-4 py-2 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors hidden sm:inline"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;