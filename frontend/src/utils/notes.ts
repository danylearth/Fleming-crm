// Sort a copy so displaying notes never changes their stored order or identity.
export function newestNotesFirst<T extends { created_at?: string | null }>(notes: readonly T[]): T[] {
  const timestamp = (note: T) => {
    const value = Date.parse(note.created_at || '');
    return Number.isFinite(value) ? value : -Infinity;
  };
  return [...notes].sort((a, b) => timestamp(b) - timestamp(a));
}
