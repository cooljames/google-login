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

    // Listen for popup messages
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.token) {
          try {
            localStorage.setItem('auth_token', event.data.token);
          } catch (e) {
            console.warn('localStorage block in OAUTH:', e);
          }
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

  const loginWithGoogle = async (): Promise<string | null> => {
    try {
      const res = await apiFetch(`/api/auth/url?origin=${encodeURIComponent(window.location.origin)}`);
      const text = await res.text();
      
      if (!res.ok) {
        try {
          const data = JSON.parse(text);
          return data.error || '로그인 설정이 완료되지 않았습니다.';
        } catch (e) {
          return '서버 에러가 발생했습니다. (500)';
        }
      }

      if (!text) return '서버로부터 응답이 없습니다.';
      const data = JSON.parse(text);
      
      if (!data.url) {
        return '구글 로그인 URL을 생성할 수 없습니다.';
      }
      // Use popup for iframes
      const w = 500;
      const h = 600;
      const left = window.screen.width / 2 - w / 2;
      const top = window.screen.height / 2 - h / 2;
      window.open(data.url, 'oauth_popup', `width=${w},height=${h},top=${top},left=${left}`);
      return null;
    } catch (e) {
      console.error('Error fetching OAuth URL:', e);
      return '구글 로그인 초기화 중 네트워크 오류가 발생했습니다.';
    }
  };

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
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithEmail, registerWithEmail, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}
