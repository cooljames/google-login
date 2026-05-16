import { useAuth } from '../components/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function Landing() {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/board');
    }
  }, [user, navigate]);

  return (
    <div className="bg-surface-container-lowest text-on-surface min-h-screen flex flex-col font-sans">
      <header className="w-full top-0 sticky bg-surface-container-lowest/90 backdrop-blur-sm border-b border-outline-variant z-50">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop h-16 max-w-[1200px] mx-auto">
          <div className="font-headline-sm text-headline-sm font-bold text-primary flex items-center gap-xs">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>widgets</span>
            한글 플랫폼
          </div>
          <nav className="hidden md:flex gap-sm">
            <Link to="/board" className="font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors px-xs py-base rounded">게시판</Link>
            <Link to="/admin" className="font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors px-xs py-base rounded">관리자</Link>
            <Link to="/profile" className="font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors px-xs py-base rounded">프로필</Link>
          </nav>
          <button onClick={login} className="font-label-md text-label-md text-primary hover:bg-surface-container-low transition-colors active:scale-95 duration-200 px-sm py-[8px] rounded border border-transparent hover:border-outline-variant">
            로그인
          </button>
        </div>
      </header>

      <main className="flex-grow w-full max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-xl lg:py-24">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-xl lg:gap-24 items-center">
          {/* Text Content */}
          <div className="flex flex-col gap-lg order-2 lg:order-1 text-center lg:text-left items-center lg:items-start">
            <div className="flex flex-col gap-sm">
              <span className="inline-block px-3 py-1 bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm rounded-full uppercase tracking-widest border border-outline-variant w-fit mx-auto lg:mx-0">
                새로운 시작
              </span>
              <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg leading-[1.2] text-on-surface mt-sm tracking-tight break-keep">
                가장 단순하고 직관적인<br className="hidden md:block" /> 업무의 기준
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[32rem] mt-sm md:mt-md break-keep mx-auto lg:mx-0">
                불필요한 기능은 모두 덜어내고, 오직 당신의 목표 달성에만 집중할 수 있는 깨끗한 환경을 제공합니다. 지금 바로 시작해보세요.
              </p>
            </div>
            
            <button 
              onClick={login} 
              className="mt-xs md:mt-sm px-xl py-[14px] bg-primary text-on-primary font-label-md text-[15px] rounded-DEFAULT hover:bg-primary-container hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-xs"
            >
              무료로 시작하기
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>

          {/* Hero Image */}
          <div className="order-1 lg:order-2 w-full relative">
            <div className="aspect-[4/3] lg:aspect-square w-full rounded-2xl overflow-hidden shadow-lg border border-outline-variant relative">
              <img 
                src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&q=80&w=1200" 
                alt="Clean Minimalist Workspace" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-surface-container-lowest/5 mix-blend-overlay"></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full mt-auto bg-surface border-t border-outline-variant py-[32px]">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-mobile md:px-margin-desktop max-w-[1200px] mx-auto gap-[16px] md:gap-0">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="font-label-md text-label-md font-bold text-on-surface tracking-tight">한글 플랫폼</span>
            <span className="font-body-sm text-body-sm text-outline">© 2024 한글 플랫폼. All rights reserved.</span>
          </div>
          <nav className="flex flex-wrap justify-center gap-[24px]">
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-opacity duration-200">이용약관</a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-opacity duration-200">개인정보처리방침</a>
            <a href="#" className="font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-opacity duration-200">고객센터</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
