import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { cn } from '../lib/utils';

export default function Layout() {
  const { user, login, logout } = useAuth();
  const location = useLocation();

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
            한글 플랫폼
          </Link>
          
          <div className="hidden md:flex items-center gap-md h-full">
            <Link to="/board" className={cn("font-label-md text-label-md transition-colors active:scale-95 duration-200 h-full flex items-center px-3", location.pathname === '/board' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-surface-container-low')}>게시판</Link>
            {user?.role === 'admin' && (
              <Link to="/admin" className={cn("font-label-md text-label-md transition-colors active:scale-95 duration-200 h-full flex items-center px-3", location.pathname === '/admin' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-surface-container-low')}>관리자</Link>
            )}
            <Link to="/profile" className={cn("font-label-md text-label-md transition-colors active:scale-95 duration-200 h-full flex items-center px-3", location.pathname === '/profile' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:bg-surface-container-low')}>프로필</Link>
          </div>
          
          <div className="flex items-center gap-sm">
            <div className="relative hidden sm:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-body-md">search</span>
              <input type="text" placeholder="검색..." className="pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT focus:border-primary focus:ring-0 font-body-sm text-body-sm text-on-surface w-48 placeholder:text-outline transition-colors outline-none" />
            </div>
            {user ? (
              <button onClick={logout} className="font-label-md text-label-md text-primary dark:text-primary-fixed-dim hover:bg-surface-container-low dark:hover:bg-secondary-fixed-variant transition-colors active:scale-95 duration-200 py-2 px-4 rounded-DEFAULT">
                로그아웃
              </button>
            ) : (
               <button onClick={login} className="font-label-md text-label-md text-primary dark:text-primary-fixed-dim hover:bg-surface-container-low dark:hover:bg-secondary-fixed-variant transition-colors active:scale-95 duration-200 py-2 px-4 rounded-DEFAULT">
                로그인
              </button>
            )}
          </div>
        </div>
      </nav>

      <Outlet />

      <footer className="bg-surface-container dark:bg-surface-dim w-full mt-auto border-t border-outline-variant dark:border-outline">
        <div className="flex flex-col md:flex-row justify-between items-center py-lg px-margin-desktop max-w-[1200px] mx-auto gap-md md:gap-0">
          <div className="font-label-md text-label-md font-bold text-on-surface">
            © 2024 한글 플랫폼. All rights reserved.
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
