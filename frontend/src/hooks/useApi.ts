import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '';

// Mutation invalidation is retained for multipart callers. Normal GETs are
// deliberately fresh: CRM users expect a navigation/action to show saved data.
const cache = new Map<string, { data: unknown; ts: number }>();
const DATA_UPDATED_EVENT = 'fleming:data-updated';
const DATA_UPDATED_STORAGE_KEY = 'fleming-data-updated-at';

// Call this after any mutation so next GET re-fetches
export function invalidateCache(endpointPrefix?: string) {
  if (!endpointPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(endpointPrefix)) cache.delete(key);
  }
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(DATA_UPDATED_STORAGE_KEY, String(Date.now())); } catch { /* Storage can be unavailable. */ }
    window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
  }
}

export function useApi() {
  const { token, logout } = useAuth();
  const [dataRevision, setDataRevision] = useState(0);

  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefresh < 100) return;
      lastRefresh = now;
      setDataRevision(value => value + 1);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DATA_UPDATED_STORAGE_KEY) refresh();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(DATA_UPDATED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(DATA_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Memoized so effects depending on the api object don't re-run every render
  return useMemo(() => {
  void dataRevision;
  const request = async (endpoint: string, options: RequestInit = {}) => {
    if (token && Date.now() - Number(localStorage.getItem('fleming-last-activity') || Date.now()) >= 10 * 60 * 1000) {
      logout();
      throw new Error('Session expired — please sign in again');
    }
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      // Definitive: token invalid/expired — clear session; ProtectedRoute redirects to /login
      logout();
      throw new Error('Session expired — please sign in again');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const get = async (endpoint: string) => {
    return request(endpoint);
  };

  const mutate = async (endpoint: string, options: RequestInit, invalidate?: string) => {
    const data = await request(endpoint, options);
    // Invalidate related cache entries after any write
    if (invalidate) invalidateCache(invalidate);
    else {
      // Derive the base path from endpoint to invalidate e.g. POST /api/tasks → clear /api/tasks
      const base = endpoint.replace(/\/\d+$/, '');
      invalidateCache(base);
    }
    return data;
  };

  return {
    get,
    post: (endpoint: string, body: Record<string, unknown>, invalidate?: string) =>
      mutate(endpoint, { method: 'POST', body: JSON.stringify(body) }, invalidate),
    put: (endpoint: string, body: Record<string, unknown>) =>
      mutate(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (endpoint: string, body: Record<string, unknown>) =>
      mutate(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (endpoint: string) =>
      mutate(endpoint, { method: 'DELETE' }),
  };
  }, [token, logout, dataRevision]);
}
