import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

interface User {
  department?: string; phone?:string;office_extension?:string; finance_access?: boolean;
  last_login?: string;
  avatar_url?: string;
  accent_color?: string;
  appearance?: {font?: string;scale?: number;background?: string};
  id: number;
  email: string;
  name: string;
  role: 'viewer' | 'staff' | 'manager' | 'admin';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; role: string; phone?: string }) => Promise<void>;
  logout: () => void;
  updateUser: (changes: Partial<User>) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    if (token) {
      fetch(`${API_URL}/api/auth/me`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(async res => {
          if (res.ok) {
            const data = await res.json();
            if (data.user && !controller.signal.aborted) setUser(data.user);
          } else if (res.status === 401 || res.status === 403) {
            // Definitive rejection — token is invalid
            localStorage.removeItem('token');
            setToken(null);
          }
          // Other statuses (5xx): keep the token — server hiccup, not an auth failure
        })
        .catch(() => {
          // Network error (backend cold start, offline) — keep the token so a
          // transient blip doesn't permanently log the user out
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else {
      // No token present - immediately mark as not loading
      queueMicrotask(() => setLoading(false));
    }
    return () => controller.abort();
  }, [token]);

  const login = async (email: string, password: string) => {
    let res: Response;
    try { res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    }); } catch { throw new Error('Cannot reach the CRM. Please check your connection and try again.'); }
    if (res.status === 401) throw new Error('Invalid login details');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The CRM is temporarily unavailable. Please try again.');
    localStorage.setItem('fleming-last-activity', String(Date.now()));
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (regData: { email: string; password: string; name: string; role: string; phone?: string }) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('fleming-last-activity', String(Date.now()));
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  useEffect(() => {
    const a=user?.appearance;const root=document.documentElement;
    const fonts:Record<string,string>={lufga:"'Lufga', sans-serif",system:'system-ui, sans-serif',verdana:'Verdana, sans-serif',arial:'Arial, sans-serif',aptos:'Aptos, Calibri, sans-serif',times:'"Times New Roman", serif',comic:'"Comic Sans MS", cursive',georgia:'Georgia, serif',tahoma:'Tahoma, sans-serif',trebuchet:'"Trebuchet MS", sans-serif',courier:'"Courier New", monospace',calibri:'Calibri, sans-serif',cambria:'Cambria, serif',helvetica:'Helvetica, Arial, sans-serif',palatino:'Palatino, serif'};
    root.style.setProperty('--user-font',fonts[a?.font || 'lufga'] || fonts.lufga);
    root.style.fontSize=`${a?.scale || 100}%`;
    root.dataset.appearanceBackground=a?.background || 'default';
    return ()=>{root.style.removeProperty('--user-font');root.style.removeProperty('font-size');delete root.dataset.appearanceBackground;};
  },[user?.appearance]);

  const logout = useCallback(() => {
    localStorage.removeItem('fleming-last-activity');
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    const key = 'fleming-last-activity';
    if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now()));
    const expired = () => Date.now() - Number(localStorage.getItem(key) || 0) >= 10 * 60 * 1000;
    const check = () => {
      if (!localStorage.getItem('token') || expired()) logout();
    };
    const activity = () => {
      if (expired()) { logout(); return; }
      // Only human interaction extends the session; background polling does not.
      if (Date.now() - Number(localStorage.getItem(key)) > 1000) localStorage.setItem(key, String(Date.now()));
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    const timer = window.setInterval(check, 1000);
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('storage', check);
    document.addEventListener('visibilitychange', check);
    check();
    return () => {
      window.clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, activity));
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('storage', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [token, logout]);

  useEffect(() => {
    const color = user?.accent_color || '#a32372';
    document.documentElement.style.setProperty('--accent-orange', color);
    document.documentElement.style.setProperty('--btn-primary-bg', color);
    document.documentElement.style.setProperty('--btn-primary-text', '#ffffff');
  }, [user?.accent_color]);
  const updateUser = (changes: Partial<User>) => setUser(current => current ? { ...current, ...changes } : current);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
