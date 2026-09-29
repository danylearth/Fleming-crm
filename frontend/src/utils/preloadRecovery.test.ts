import { describe, expect, it, vi } from 'vitest';
import { recoverPreloadError } from './preloadRecovery';

describe('recoverPreloadError', () => {
  it('reloads an outdated route once and suppresses its load error', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const reload = vi.fn();
    const first = new Event('vite:preloadError', { cancelable: true });
    expect(recoverPreloadError(first, storage, reload, 100_000)).toBe(true);
    expect(first.defaultPrevented).toBe(true);
    const second = new Event('vite:preloadError', { cancelable: true });
    expect(recoverPreloadError(second, storage, reload, 100_001)).toBe(false);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(recoverPreloadError(new Event('vite:preloadError'), storage, reload, 161_000)).toBe(true);
  });

  it('leaves the normal error page available when storage is unavailable', () => {
    const reload = vi.fn();
    const event = new Event('vite:preloadError', { cancelable: true });
    expect(recoverPreloadError(event, { getItem: () => { throw new Error('blocked'); }, setItem: vi.fn() }, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
