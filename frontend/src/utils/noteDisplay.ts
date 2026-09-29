/** Read legacy note text without changing its stored value or deletion identity. */
export function noteDisplayText(text: string): string {
  const source = text.trimStart();
  if (!source.startsWith('[')) return text;
  for (let end = source.indexOf(']'); end >= 0; end = source.indexOf(']', end + 1)) {
    try {
      const notes: unknown = JSON.parse(source.slice(0, end + 1));
      if (Array.isArray(notes) && notes.length && notes.every(n => n && typeof n.text === 'string')) {
        return [...notes.map(n => n.text), source.slice(end + 1).trim()].filter(Boolean).join('\n');
      }
    } catch { /* Plain text or a closing bracket inside a note. */ }
  }
  return text;
}
