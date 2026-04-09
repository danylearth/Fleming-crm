import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '';

// Module-level cache — survives page navigation, cleared on mutation
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds stale-while-revalidate

function cacheKey(token: string, endpoint: string) {
  return `${token.slice(-8)}:${endpoint}`;
}

// Call this after any mutation so next GET re-fetches
export function invalidateCache(endpointPrefix?: string) {
  if (!endpointPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(endpointPrefix)) cache.delete(key);
  }
}

export function useApi() {
  const { token } = useAuth();

  const request = async (endpoint: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const get = async (endpoint: string): Promise<unknown> => {
    if (!token) return request(endpoint);

    const key = cacheKey(token, endpoint);
    const cached = cache.get(key);
    const now = Date.now();

    if (cached) {
      // Stale-while-revalidate: return cached immediately, refresh in background
      if (now - cached.ts > CACHE_TTL) {
        request(endpoint).then(fresh => cache.set(key, { data: fresh, ts: Date.now() })).catch(() => {});
      }
      return cached.data;
    }

    // Cache miss — fetch, store, return
    const data = await request(endpoint);
    cache.set(key, { data, ts: now });
    return data;
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
    post: (endpoint: string, body: Record<string, unknown>) =>
      mutate(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: (endpoint: string, body: Record<string, unknown>) =>
      mutate(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (endpoint: string, body: Record<string, unknown>) =>
      mutate(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (endpoint: string) =>
      mutate(endpoint, { method: 'DELETE' }),
  };
}
