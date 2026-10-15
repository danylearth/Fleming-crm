/** Keep a UK postcode once, at the end, including older duplicated addresses. */
export function normalizePropertyAddress(address: string, postcode?: string | null, city?: string | null): string {
  let cleanAddress = String(address || '').trim().replace(/,\s*$/, '');
  const trailingPostcode = cleanAddress.match(/\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i)?.[0];
  const cleanPostcode = String(postcode || trailingPostcode || '').trim();
  if (cleanPostcode) {
    const escaped = cleanPostcode.replace(/\s/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suffix = new RegExp('(?:^|[\\s,]+)' + escaped.split('').join('\\s*') + '$', 'i');
    while (suffix.test(cleanAddress)) cleanAddress = cleanAddress.replace(suffix, '').trim().replace(/,\s*$/, '');
  }
  if (city?.trim() && !cleanAddress.split(',').some(part => part.trim().toLowerCase() === city.trim().toLowerCase())) {
    cleanAddress = [cleanAddress, city.trim()].filter(Boolean).join(', ');
  }
  return [cleanAddress, cleanPostcode].filter(Boolean).join(', ');
}
