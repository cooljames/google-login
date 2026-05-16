import React, { useState } from 'react';
import { useAuth } from '../components/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';

export default function Auth() {
  const { user, loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (user) {
    return <Navigate to="/board" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    if (!email) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    if (!isLogin && !name) {
      setError('이름을 입력해주세요.');
      return;
    }

    if (isLogin) {
      const err = await loginWithEmail(email, password);
      if (err) setError(err);
      else navigate('/board');
    } else {
      const result = await registerWithEmail(email, password, name);
      if (result && result.includes('Registration successful')) {
        navigate('/board');
      } else if (result) {
        setError(result);
      } else {
        navigate('/board');
      }
    }
  };

  return (
    <div className="w-full flex-1 min-h-[80vh] flex flex-col items-center justify-center bg-surface-container-lowest overflow-hidden">
      <div className="w-full max-w-[400px] px-6 sm:px-8 py-10 bg-surface rounded-2xl shadow-md border border-outline-variant">
        <h2 className="mb-8 text-center text-3xl font-bold tracking-tight text-on-surface">
          {isLogin ? '로그인' : '회원가입'}
        </h2>
        
        {error && (
          <div className="bg-error-container text-on-error-container p-3 mb-6 rounded text-sm text-center break-words">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-primary-container text-on-primary-container p-3 mb-6 rounded text-sm text-center break-words">
            {message}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-outline-variant px-3 py-2 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-1">이메일 주소</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-outline-variant px-3 py-2 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-outline-variant px-3 py-2 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-container hover:text-on-primary-container transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              {isLogin ? '로그인' : '계정 만들기'}
            </button>
          </div>
        </form>

        <div className="mt-8 mb-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-surface px-3 text-on-surface-variant text-xs">또는</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={async () => {
                const err = await loginWithGoogle();
                if (err) setError(err);
              }}
              className="w-full flex items-center justify-center gap-3 py-2 px-4 border border-outline-variant rounded-md shadow-sm bg-surface text-sm font-medium text-on-surface hover:bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36365H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z" fill="#4285F4"/>
                <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z" fill="#34A853"/>
                <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
                <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
              </svg>
              Google로 시작하기
            </button>
          </div>
        </div>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setMessage('');
            }}
            className="text-sm font-medium text-primary hover:underline"
          >
            {isLogin ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}

