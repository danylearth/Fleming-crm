type LinkAgreement = { id: number; token: string; details?: { landlord_name?: string; signatory_name?: string; property_address?: string } };
const slug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function serviceSigningUrl(agreement: LinkAgreement): string {
  const details = agreement.details || {};
  // Preserve legacy/nonstandard tokens rather than generating an unusable link.
  if (!/^[a-f0-9]{64}$/i.test(agreement.token || '')) return `https://apply.fleminglettings.co.uk/service-agreement.html?token=${encodeURIComponent(agreement.token || '')}`;
  const name = slug(details.signatory_name || details.landlord_name || 'landlord').slice(0, 32).replace(/-$/, '');
  const address = details.property_address || '';
  const number = address.match(/^\s*(\d+[a-z]?)/i)?.[1] || '';
  const postcode = address.match(/\b([a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2})\s*$/i)?.[1].replace(/\s/g, '') || '';
  // The database ID ensures uniqueness; 128 random bits protect public signing access.
  const code = Buffer.from(agreement.token.slice(0, 32), 'hex').toString('base64url');
  return `https://apply.fleminglettings.co.uk/${[name, slug(number), slug(postcode), `contract${agreement.id}`, code].filter(Boolean).join('-')}`;
}

export function parseServiceSigningSlug(value: string): { id: number; tokenPrefix: string } | null {
  const match = value.match(/-contract([1-9]\d*)-([A-Za-z0-9_-]{22})$/);
  if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
  const bytes = Buffer.from(match[2], 'base64url');
  if (bytes.length !== 16 || bytes.toString('base64url') !== match[2]) return null;
  return { id: Number(match[1]), tokenPrefix: bytes.toString('hex') };
}
