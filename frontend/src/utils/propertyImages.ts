function placeholder(width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#252525"/><path d="M${width * 0.3} ${height * 0.58}L${width * 0.5} ${height * 0.34}L${width * 0.7} ${height * 0.58}V${height * 0.78}H${width * 0.3}Z" fill="#404040"/><rect x="${width * 0.46}" y="${height * 0.61}" width="${width * 0.09}" height="${height * 0.17}" fill="#252525"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Uses an uploaded property image first, otherwise the property's real Street View. */
export function getPropertyImage(
  _id: number,
  width = 400,
  height = 240,
  address?: string,
  imageUrl?: string | null,
): string {
  if (imageUrl) return imageUrl;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
  if (apiKey && address) {
    const size = `${Math.min(width, 640)}x${Math.min(height, 640)}`;
    return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}`;
  }

  return placeholder(width, height);
}
