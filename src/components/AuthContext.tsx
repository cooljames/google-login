import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from '../lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
  loginWithGoogle: () => void;
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
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    // Listen for popup messages
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data.token) localStorage.setItem('auth_token', event.data.token);
        fetchUser();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const login = () => {
    window.location.href = '/auth';
  };

  const loginWithGoogle = async () => {
    try {
      const res = await apiFetch(`/api/auth/url?origin=${encodeURIComponent(window.location.origin)}`);
      const { url } = await res.json();
      if (!url) {
        alert('Set up Google Client ID / Secret first.');
        return;
      }
      const authWindow = window.open(url, 'oauth_popup', 'width=500,height=600');
      if (!authWindow) {
        alert('Please allow popups to login.');
      }
    } catch (e) {
      console.error(e);
      alert('Error fetching OAuth URL');
    }
  };

  const loginWithEmail = async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return data.error || 'Login failed';
      localStorage.setItem('auth_token', data.token);
      fetchUser();
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
      const data = await res.json();
      if (!res.ok) return data.error || 'Registration failed';
      return data.message || 'Registration successful';
    } catch (err) {
      return 'Network error';
    }
  };

  const logout = async () => {
    localStorage.removeItem('auth_token');
    await apiFetch('/api/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithEmail, registerWithEmail, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}
