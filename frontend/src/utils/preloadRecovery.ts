// An open dashboard can still reference an earlier deployment's lazy route files.
// Reload once to fetch the current entry point; never loop on a persistent failure.
export function recoverPreloadError(event: Event, storage: Pick<Storage, 'getItem' | 'setItem'>, reload: () => void, now = Date.now()): boolean {
  const key = 'fleming-preload-reload';
  try {
    const previous = Number(storage.getItem(key));
    if (previous && now - previous < 60_000) return false;
    storage.setItem(key, String(now));
  } catch {
    return false;
  }
  event.preventDefault();
  reload();
  return true;
}
