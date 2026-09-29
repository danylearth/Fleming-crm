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

export function formatCardAddress(address?: string | null, postcode?: string | null): string {
  const rawAddress=String(address||'').trim();
  const postcodePattern=/\b(?:GIR\s*0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
  const rawPostcode=String(postcode||'').trim()||rawAddress.match(postcodePattern)?.[0]||'';
  const compactPostcode=rawPostcode.toUpperCase().replace(/\s/g,'');
  const displayPostcode=compactPostcode.length>3?`${compactPostcode.slice(0,-3)} ${compactPostcode.slice(-3)}`:compactPostcode;
  const lines=rawAddress.replace(postcodePattern,'').split(/,|\n/).map(line=>line.trim()).filter(Boolean);
  const number=/^\d+[A-Z]?(?:\s*[-/]\s*\d+[A-Z]?)?\b/i;
  let house=lines[0]?.match(number)?.[0]||lines[0]||'';
  if(/^(?:flat|apartment|unit)\s+\S+$/i.test(house)){
    const building=lines[1]?.match(number)?.[0];
    if(building)house+=`, ${building}`;
  }
  return [house,displayPostcode].filter(Boolean).join(' - ');
}
