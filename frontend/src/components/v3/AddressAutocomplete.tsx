import { useEffect, useRef, useState } from 'react';

interface AddressAutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (place: { address: string; postcode?: string; city?: string }) => void;
  placeholder?: string;
}

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

export default function AddressAutocomplete({ label, value, onChange, onSelect, placeholder }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load Google Maps script if API key is available
  useEffect(() => {
    if (!API_KEY || (window as any).google?.maps?.places) {
      if ((window as any).google?.maps?.places) setScriptLoaded(true);
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) { setScriptLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize autocomplete
  useEffect(() => {
    if (!scriptLoaded || !inputRef.current || autocompleteRef.current) return;
    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'gb' },
      types: ['address'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.formatted_address) return;
      onChange(place.formatted_address);
      if (onSelect) {
        const components = place.address_components || [];
        const postcode = components.find(c => c.types.includes('postal_code'))?.long_name;
        const city = components.find(c => c.types.includes('postal_town'))?.long_name
          || components.find(c => c.types.includes('locality'))?.long_name;
        onSelect({ address: place.formatted_address, postcode, city });
      }
    });
    autocompleteRef.current = ac;
  }, [scriptLoaded]);

  return (
    <div>
      {label && <label className="block text-xs text-[var(--text-muted)] mb-1.5">{label}</label>}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || (API_KEY ? 'Start typing an address...' : 'Enter address')}
        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-orange-500/50 transition-colors"
      />
    </div>
  );
}
