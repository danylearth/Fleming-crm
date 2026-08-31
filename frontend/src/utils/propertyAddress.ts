export function formatPropertyAddress(address?: string | null, postcode?: string | null): string {
  const cleanAddress = String(address || '').trim().replace(/,\s*$/, '');
  const cleanPostcode = String(postcode || '').trim();
  if (!cleanPostcode) return cleanAddress;
  const compactAddress = cleanAddress.replace(/\s/g, '').toLowerCase();
  const compactPostcode = cleanPostcode.replace(/\s/g, '').toLowerCase();
  return compactAddress.endsWith(compactPostcode) ? cleanAddress : `${cleanAddress}, ${cleanPostcode}`;
}
