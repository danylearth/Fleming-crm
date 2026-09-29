export const localEmailAsset = (value: string) => !/^(https?:\/\/|data:|#|\{\{)/i.test(value.trim());
export function emailAssetReferences(html: string): string[] {
  const refs = [...html.matchAll(/\b(?:src|background)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  refs.push(...[...html.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)].map(match => match[1]));
  return [...new Set(refs.filter(Boolean))];
}
export function replaceEmailAsset(html: string, source: string, url: string): string {
  return html.replace(/(\b(?:src|background)\s*=\s*["'])([^"']+)(["'])/gi, (all, start, value, end) => value === source ? start + url + end : all)
    .replace(/(url\(\s*["']?)([^)'"\s]+)(["']?\s*\))/gi, (all, start, value, end) => value === source ? start + url + end : all);
}
export function matchEmailAsset(reference: string, htmlPath: string, paths: string[]): string | undefined {
  const clean = (value: string) => { try { return decodeURIComponent(value.split(/[?#]/)[0]).replaceAll('\\', '/').replace(/^cid:/i, ''); } catch { return value; } };
  const normalise = (value: string) => { const parts: string[] = []; for (const part of value.split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); } return parts.join('/'); };
  const ref = clean(reference), expected = normalise(htmlPath.slice(0, htmlPath.lastIndexOf('/') + 1) + ref);
  const exact = paths.find(path => normalise(path) === expected || normalise(path) === normalise(ref));
  if (exact) return exact;
  const matches = paths.filter(path => path.split('/').at(-1)?.toLowerCase() === ref.split('/').at(-1)?.toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}
