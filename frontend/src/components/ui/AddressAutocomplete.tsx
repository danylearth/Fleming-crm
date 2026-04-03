import { useEffect, useRef, useCallback } from 'react';
import { loadPlacesLibrary } from '../../utils/google-places';

interface AddressAutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (place: {
    address: string;
    postcode?: string;
    city?: string;
    street?: string;
    county?: string;
  }) => void;
  placeholder?: string;
}

export default function AddressAutocomplete({ label, value, onChange, onSelect, placeholder }: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onSelectRef = useRef(onSelect);
  const onChangeRef = useRef(onChange);

  // Keep refs current to avoid re-initialising the widget when callbacks change
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const initAutocomplete = useCallback(async () => {
    if (!inputRef.current || autocompleteRef.current) return;

    const ok = await loadPlacesLibrary();
    if (!ok || !inputRef.current) return;

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'gb' },
      fields: ['address_components', 'formatted_address'],
      types: ['address'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.address_components) return;

      const components = place.address_components;
      const get = (type: string) =>
        components.find(c => c.types.includes(type))?.long_name || '';

      const formatted = place.formatted_address || '';

      // Sync React state with the value Google wrote into the input
      onChangeRef.current(formatted);

      onSelectRef.current?.({
        address: formatted,
        postcode: get('postal_code'),
        city: get('postal_town') || get('locality'),
        street: `${get('street_number')} ${get('route')}`.trim(),
        county: get('administrative_area_level_2'),
      });
    });

    autocompleteRef.current = ac;
  }, []);

  useEffect(() => {
    initAutocomplete();
    return () => {
      autocompleteRef.current = null;
    };
  }, [initAutocomplete]);

  return (
    <div>
      {label && <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{label}</label>}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Start typing an address...'}
        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors"
      />
    </div>
  );
}
