const PLACEHOLDER_COLORS = ['#166534', '#1d4ed8', '#7e22ce', '#b45309', '#be123c', '#0f766e'];
const CLIENT_CARD_COLORS = ['#15803d', '#1d4ed8', '#be185d', '#a16207', '#4b5563', '#795548'];
type CardProperty = {id: number; landlord_id?: number; landlord_name?: string; landlord_type?: string};
const landlordKey = (property: CardProperty) => property.landlord_id != null ? `id:${property.landlord_id}` : property.landlord_name?.trim().toLowerCase().replace(/\s+/g, ' ') || `property:${property.id}`;

/** Build from the full property list so portfolio filters cannot change a landlord's colour. */
export function propertyCardColours(properties: CardProperty[]): Map<number, string> {
  const internal = new Set(properties.filter(p => p.landlord_type === 'internal').map(landlordKey));
  const clients = [...new Set(properties.map(landlordKey).filter(key => !internal.has(key)))].sort((a,b) => a.localeCompare(b, 'en', {numeric:true}));
  const colours = new Map(clients.map((key,index) => [key, CLIENT_CARD_COLORS[index % CLIENT_CARD_COLORS.length]]));
  return new Map(properties.map(property => [property.id, internal.has(landlordKey(property)) ? '#7e22ce' : colours.get(landlordKey(property))!]));
}

function landlordInitials(name?: string): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) || [];
  if (words.length === 0) return 'FL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export function getPropertyPlaceholder(id: number, width: number, height: number, landlordName?: string, landlordId?: number, colour?: string): string {
  const initials = landlordInitials(landlordName);
  const colorKey = landlordId != null ? String(landlordId) : (landlordName?.trim().toLowerCase().replace(/\s+/g, ' ') || String(id));
  const colorIndex = Array.from(colorKey).reduce((sum, char) => sum + char.charCodeAt(0), 0) % PLACEHOLDER_COLORS.length;
  const fontSize = Math.max(24, Math.round(Math.min(width, height) * 0.28));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${colour || PLACEHOLDER_COLORS[colorIndex]}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Uses an uploaded property image first, otherwise the property's real Street View. */
export function getPropertyImage(
  id: number,
  width = 400,
  height = 240,
  address?: string,
  imageUrl?: string | null,
  landlordName?: string,
  landlordId?: number,
  colour?: string,
): string {
  if (imageUrl) {
    if (imageUrl.startsWith('/') && import.meta.env.VITE_API_URL) {
      return `${String(import.meta.env.VITE_API_URL).replace(/\/$/, '')}${imageUrl}`;
    }
    return imageUrl;
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
  if (apiKey && address) {
    const size = `${Math.min(width, 640)}x${Math.min(height, 640)}`;
    return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
  }

  return getPropertyPlaceholder(id, width, height, landlordName, landlordId, colour);
}
