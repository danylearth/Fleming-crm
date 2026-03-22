import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Property {
  id: number;
  address: string;
  postcode: string;
  status: string;
  rent_amount?: number;
  lat?: number;
  lng?: number;
}

// UK postcode area approximate coords (fallback when no lat/lng)
const POSTCODE_COORDS: Record<string, [number, number]> = {
  'B': [52.48, -1.89], 'BA': [51.38, -2.36], 'BB': [53.75, -2.48],
  'BD': [53.79, -1.75], 'BH': [50.72, -1.88], 'BL': [53.58, -2.43],
  'BN': [50.84, -0.14], 'BR': [51.41, 0.05], 'BS': [51.45, -2.58],
  'CB': [52.20, 0.12], 'CF': [51.48, -3.18], 'CH': [53.19, -2.89],
  'CM': [51.73, 0.47], 'CO': [51.89, 0.90], 'CR': [51.37, -0.10],
  'CT': [51.28, 1.08], 'CV': [52.41, -1.51], 'CW': [53.10, -2.44],
  'DA': [51.44, 0.21], 'DE': [52.92, -1.47], 'DN': [53.52, -1.13],
  'DT': [50.71, -2.44], 'DY': [52.51, -2.08], 'E': [51.55, -0.05],
  'EC': [51.52, -0.09], 'EH': [55.95, -3.19], 'EN': [51.65, -0.08],
  'EX': [50.72, -3.53], 'GL': [51.86, -2.24], 'GU': [51.24, -0.77],
  'HA': [51.58, -0.33], 'HD': [53.64, -1.78], 'HG': [54.00, -1.54],
  'HP': [51.75, -0.74], 'HR': [52.06, -2.72], 'HU': [53.74, -0.33],
  'IG': [51.56, 0.07], 'IP': [52.06, 1.15], 'KT': [51.38, -0.30],
  'L': [53.41, -2.98], 'LA': [54.05, -2.80], 'LE': [52.63, -1.13],
  'LL': [53.12, -3.83], 'LN': [53.23, -0.54], 'LS': [53.80, -1.55],
  'LU': [51.88, -0.42], 'M': [53.48, -2.24], 'ME': [51.37, 0.52],
  'MK': [52.04, -0.76], 'N': [51.57, -0.10], 'NE': [54.98, -1.61],
  'NG': [52.95, -1.15], 'NN': [52.24, -0.90], 'NP': [51.59, -2.99],
  'NR': [52.63, 1.30], 'NW': [51.55, -0.17], 'OL': [53.54, -2.10],
  'OX': [51.75, -1.26], 'PE': [52.57, -0.24], 'PL': [50.37, -4.14],
  'PO': [50.80, -1.09], 'PR': [53.76, -2.70], 'RG': [51.45, -1.00],
  'RH': [51.17, -0.19], 'RM': [51.57, 0.18], 'S': [53.38, -1.47],
  'SA': [51.62, -3.94], 'SE': [51.49, -0.06], 'SG': [51.90, -0.20],
  'SK': [53.39, -2.16], 'SL': [51.51, -0.65], 'SM': [51.37, -0.17],
  'SN': [51.56, -1.78], 'SO': [50.90, -1.40], 'SP': [51.07, -1.80],
  'SR': [54.91, -1.38], 'SS': [51.54, 0.71], 'ST': [52.98, -2.18],
  'SW': [51.46, -0.17], 'SY': [52.71, -2.75], 'TA': [51.02, -3.10],
  'TF': [52.68, -2.49], 'TN': [51.13, 0.26], 'TQ': [50.46, -3.53],
  'TR': [50.26, -5.05], 'TS': [54.57, -1.23], 'TW': [51.45, -0.34],
  'UB': [51.55, -0.45], 'W': [51.51, -0.18], 'WA': [53.39, -2.59],
  'WC': [51.52, -0.12], 'WD': [51.66, -0.40], 'WF': [53.68, -1.50],
  'WN': [53.55, -2.63], 'WR': [52.19, -2.22], 'WS': [52.58, -1.98],
  'WV': [52.59, -2.13], 'YO': [53.96, -1.08],
};

// Simple deterministic hash function for property ID
function hashPropertyId(id: number): number {
  // Use property ID to generate consistent "random" offset
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return x - Math.floor(x); // Returns value between 0 and 1
}

function getCoords(property: Property): [number, number] | null {
  if (property.lat && property.lng) return [property.lat, property.lng];
  if (!property.postcode) return null;
  const pc = property.postcode.toUpperCase().replace(/\s/g, '');
  // Try 2-letter prefix first, then 1-letter
  const prefix2 = pc.substring(0, 2);
  const prefix1 = pc.substring(0, 1);
  const base = POSTCODE_COORDS[prefix2] || POSTCODE_COORDS[prefix1];

  // Use property ID for deterministic offset
  const hash1 = hashPropertyId(property.id);
  const hash2 = hashPropertyId(property.id + 1000); // Different seed for lat/lng

  if (!base) return [51.5 + hash1 * 0.1 - 0.05, -0.1 + hash2 * 0.1 - 0.05]; // London fallback
  // Add small deterministic offset so pins don't stack but stay consistent
  return [base[0] + (hash1 - 0.5) * 0.02, base[1] + (hash2 - 0.5) * 0.02];
}

// Custom gradient marker
function createMarkerIcon(status: string, isHighlighted: boolean, isOtherHighlighted: boolean) {
  const opacity = isOtherHighlighted ? '0.3' : '1';
  const scale = isHighlighted ? '1.2' : '1';
  const boxShadow = isHighlighted ? '0 6px 24px rgba(249,115,22,0.6)' : '0 4px 12px rgba(249,115,22,0.3)';
  const borderWidth = isHighlighted ? '3px' : '2px';

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #f97316, #ec4899);
      display: flex; align-items: center; justify-content: center;
      box-shadow: ${boxShadow};
      border: ${borderWidth} solid rgba(255,255,255,0.2);
      opacity: ${opacity};
      transform: scale(${scale});
      transition: all 0.2s ease;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

interface PropertyMapProps {
  properties: Property[];
  onPropertyClick?: (id: number) => void;
  highlightedPropertyId?: number | null;
  className?: string;
  height?: string;
}

export default function PropertyMap({ properties, onPropertyClick, highlightedPropertyId = null, className = '', height = '100%' }: PropertyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [53.0, -1.5], // UK center
      zoom: 6,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    // Zoom control on right
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear existing markers
    map.eachLayer(layer => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });
    markersRef.current.clear();

    const bounds: L.LatLngTuple[] = [];
    const isAnyHighlighted = highlightedPropertyId !== null;

    properties.forEach(prop => {
      const coords = getCoords(prop);
      if (!coords) return;
      bounds.push(coords);

      const isHighlighted = highlightedPropertyId === prop.id;
      const isOtherHighlighted = isAnyHighlighted && !isHighlighted;

      const marker = L.marker(coords, { icon: createMarkerIcon(prop.status, isHighlighted, isOtherHighlighted) });
      marker.bindPopup(`
        <div style="font-family: Lufga, sans-serif; min-width: 160px;">
          <strong style="font-size: 13px;">${prop.address}</strong>
          <br/><span style="color: #888; font-size: 11px;">${prop.postcode || ''}</span>
          ${prop.rent_amount ? `<br/><span style="color: #f97316; font-weight: 600; font-size: 12px;">£${prop.rent_amount.toLocaleString()}/mo</span>` : ''}
          <br/><span style="font-size: 11px; text-transform: capitalize; color: #aaa;">${prop.status || ''}</span>
        </div>
      `, { className: 'dark-popup' });

      if (onPropertyClick) {
        marker.on('click', () => onPropertyClick(prop.id));
      }

      marker.addTo(map);
      markersRef.current.set(prop.id, marker);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [properties, onPropertyClick, highlightedPropertyId]);

  return (
    <>
      <style>{`
        .dark-popup .leaflet-popup-content-wrapper {
          background: #232323;
          color: #fff;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .dark-popup .leaflet-popup-tip { background: #232323; }
        .leaflet-control-zoom a {
          background: #232323 !important;
          color: #fff !important;
          border-color: rgba(255,255,255,0.08) !important;
        }
        .leaflet-control-zoom a:hover { background: #2a2a2a !important; }
        .custom-marker { background: none !important; border: none !important; }
      `}</style>
      <div ref={mapRef} className={className} style={{ height, width: '100%' }} />
    </>
  );
}
