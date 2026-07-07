import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

interface User {
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
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(async res => {
          if (res.ok) {
            const data = await res.json();
            if (data.user) setUser(data.user);
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
        .finally(() => setLoading(false));
    } else {
      // No token present - immediately mark as not loading
      queueMicrotask(() => setLoading(false));
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
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
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
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
