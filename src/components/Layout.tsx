import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { cn } from '../lib/utils';
import { useState, useRef, useEffect } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setIsDropdownOpen(false);
    navigate('/');
  };

  if (location.pathname === '/') {
    // Landing page has a different layout/header per instructions
    return <Outlet />;
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md antialiased">
      <nav className="bg-surface-container-lowest dark:bg-inverse-surface w-full top-0 sticky border-b border-outline-variant dark:border-outline z-50">
        <div className="flex justify-between items-center w-full px-margin-desktop h-16 max-w-[1200px] mx-auto">
          <Link to="/" className="font-headline-sm text-headline-sm font-bold text-primary dark:text-inverse-primary tracking-tight flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>widgets</span>
            구글 로그인 게시판
          </Link>

          <div className="hidden md:flex items-center gap-md h-full">
            <Link to="/board" className={cn("font-label-md text-label-md transition-colors active:scale-95 duration-200 h-full flex items-center px-3", location.pathname === '/board' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-surface-container-low')}>게시판</Link>
            {user?.role === 'admin' && (
              <Link to="/admin" className={cn("font-label-md text-label-md transition-colors active:scale-95 duration-200 h-full flex items-center px-3", location.pathname === '/admin' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-surface-container-low')}>관리자</Link>
            )}
            <Link to="/profile" className={cn("font-label-md text-label-md transition-colors active:scale-95 duration-200 h-full flex items-center px-3", location.pathname === '/profile' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-surface-container-low')}>프로필</Link>
          </div>

          <div className="flex items-center gap-sm">

            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-center bg-surface-container"
                  aria-label="사용자 메뉴"
                >
                  {user.picture ? (
                    <img src={user.picture} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-label-lg text-on-surface">{user.name?.charAt(0).toUpperCase()}</span>
                  )}
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg py-sm z-50 overflow-hidden flex flex-col">
                    <div className="px-md py-sm border-b border-outline-variant mb-sm">
                      <p className="font-label-md text-on-surface truncate">{user.name}</p>
                      <p className="font-body-sm text-on-surface-variant truncate">{user.email}</p>
                    </div>
                    <Link 
                      to="/profile" 
                      className="px-md py-sm font-body-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-sm"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <span className="material-symbols-outlined text-[20px]">person</span>
                      프로필
                    </Link>
                    {user?.role === 'admin' && (
                      <Link 
                        to="/admin" 
                        className="px-md py-sm font-body-md text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-sm"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                        관리자
                      </Link>
                    )}
                    <button 
                      onClick={handleLogout}
                      className="w-full text-left px-md py-sm font-body-md text-error hover:bg-error-container hover:text-on-error-container transition-colors flex items-center gap-sm"
                    >
                      <span className="material-symbols-outlined text-[20px]">logout</span>
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/auth" className="font-label-md text-label-md text-primary dark:text-primary-fixed-dim hover:bg-surface-container-low dark:hover:bg-secondary-fixed-variant transition-colors active:scale-95 duration-200 py-2 px-4 rounded-DEFAULT">
                로그인
              </Link>
            )}
          </div>
        </div>
      </nav>

      <Outlet />

      <footer className="bg-surface-container dark:bg-surface-dim w-full mt-auto border-t border-outline-variant dark:border-outline">
        <div className="flex flex-col md:flex-row justify-between items-center py-lg px-margin-desktop max-w-[1200px] mx-auto gap-md md:gap-0">
          <div className="font-label-md text-label-md font-bold text-on-surface">
            © 2024 구글 로그인 게시판. All rights reserved.
          </div>
          <div className="flex flex-wrap justify-center gap-md">
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-opacity duration-200">이용약관</a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-opacity duration-200">개인정보처리방침</a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary dark:hover:text-primary-fixed-dim transition-opacity duration-200">고객센터</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
