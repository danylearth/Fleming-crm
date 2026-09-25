export function formatPropertyAddress(address?: string | null, postcode?: string | null, city?: string | null): string {
  let cleanAddress = String(address || '').trim().replace(/,\s*$/, '');
  const cleanPostcode = String(postcode || '').trim();
  const cleanCity = String(city || '').trim();
  if (cleanCity && !cleanAddress.toLowerCase().includes(cleanCity.toLowerCase())) {
    if (cleanPostcode) {
      const postcodePattern = cleanPostcode.replace(/\s/g, '').split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
      cleanAddress = cleanAddress.replace(new RegExp(`,?\\s*${postcodePattern}$`, 'i'), '').trim();
    }
    cleanAddress = [cleanAddress, cleanCity].filter(Boolean).join(', ');
  }
  if (!cleanPostcode) return cleanAddress;
  const compactAddress = cleanAddress.replace(/\s/g, '').toLowerCase();
  const compactPostcode = cleanPostcode.replace(/\s/g, '').toLowerCase();
  return compactAddress.endsWith(compactPostcode) ? cleanAddress : [cleanAddress, cleanPostcode].filter(Boolean).join(', ');
}
