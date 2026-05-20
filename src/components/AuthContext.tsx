import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch, setToken } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: string;
  isEmailVerified?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  loginWithGoogle: () => Promise<string | null>;
  loginWithNaver: () => Promise<string | null>;
  loginWithKakao: () => Promise<string | null>;
  loginWithEmail: (email: string, password: string) => Promise<string | null>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<string | null>;
  logout: () => void;
  refreshUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const res = await apiFetch('/api/me');
      if (res.ok) {
        const text = await res.text();
        if (text) {
          setUser(JSON.parse(text));
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('fetchUser error:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check if there is a token in the URL (from OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      try {
        localStorage.setItem('auth_token', urlToken);
      } catch (e) {}
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    fetchUser();

    // Listen for popup OAuth messages — only accept from same origin
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.token) {
          setToken(event.data.token);
        }
        fetchUser();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const login = () => {
    window.location.href = '/auth';
  };

  const loginWithProvider = async (provider: 'google' | 'naver' | 'kakao'): Promise<string | null> => {
    const providerNames: Record<string, string> = {
      google: '구글',
      naver: '네이버',
      kakao: '카카오'
    };
    const providerName = providerNames[provider] || provider;

    try {
      // 팝업 차단을 우회하기 위해 비동기 호출 전에 창을 먼저 엽니다.
      const w = 500;
      const h = 600;
      const left = window.screen.width / 2 - w / 2;
      const top = window.screen.height / 2 - h / 2;
      const popup = window.open('', 'oauth_popup', `width=${w},height=${h},top=${top},left=${left}`);

      const res = await apiFetch(`/api/auth/url?provider=${provider}&origin=${encodeURIComponent(window.location.origin)}`);
      const text = await res.text();
      
      if (!res.ok) {
        if (popup) popup.close();
        try {
          const data = JSON.parse(text);
          return data.error || `${providerName} 로그인 설정이 완료되지 않았습니다.`;
        } catch (e) {
          return '서버 에러가 발생했습니다. (500)';
        }
      }

      if (!text) {
        if (popup) popup.close();
        return '서버로부터 응답이 없습니다.';
      }
      
      const data = JSON.parse(text);
      
      if (!data.url) {
        if (popup) popup.close();
        return `${providerName} 로그인 URL을 생성할 수 없습니다.`;
      }
      
      if (popup) {
        popup.location.href = data.url;
      } else {
        // 팝업이 여전히 차단된 경우 현재 창에서 이동
        window.location.href = data.url;
      }
      return null;
    } catch (e) {
      console.error(`Error fetching OAuth URL for ${provider}:`, e);
      return `${providerName} 로그인 초기화 중 네트워크 오류가 발생했습니다.`;
    }
  };

  const loginWithGoogle = () => loginWithProvider('google');
  const loginWithNaver = () => loginWithProvider('naver');
  const loginWithKakao = () => loginWithProvider('kakao');


  const loginWithEmail = async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return `Server error (Login): ${text.substring(0, 100)}`;
      }
      
      if (!res.ok) return data.error || 'Login failed';
      setToken(data.token);
      await fetchUser();
      return null;
    } catch (err) {
      return 'Network error';
    }
  };

  const registerWithEmail = async (email: string, password: string, name: string): Promise<string | null> => {
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        return `Server error (Register): ${text.substring(0, 100)}`;
      }
      
      if (!res.ok) return data.error || 'Registration failed';
      
      if (data.token) {
        setToken(data.token);
        await fetchUser();
      }
      
      return data.message || 'Registration successful';
    } catch (err) {
      return 'Network error';
    }
  };

  const logout = async () => {
    setToken(null);
    await apiFetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithNaver, loginWithKakao, loginWithEmail, registerWithEmail, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}
