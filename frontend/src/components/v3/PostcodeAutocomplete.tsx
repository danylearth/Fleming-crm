import { useState, useEffect, useRef } from 'react';
import { useGovernmentAPIs } from '../../hooks/useGovernmentAPIs';
import { Search, MapPin, Loader2, CheckCircle2 } from 'lucide-react';

interface PostcodeAutocompleteProps {
  value: string;
  onChange: (postcode: string) => void;
  onSelect?: (postcodeData: any) => void;
  onAddressSelect?: (address: string) => void;
  showDropdownOnAddress?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function PostcodeAutocomplete({
  value,
  onChange,
  onSelect,
  onAddressSelect,
  showDropdownOnAddress = false,
  label = 'Postcode',
  placeholder = 'Enter postcode',
  required = false,
  className = ''
}: PostcodeAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [validated, setValidated] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [showAddresses, setShowAddresses] = useState(false);
  const { loading, autocompletePostcode, lookupPostcode, fetchPricePaid } = useGovernmentAPIs();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setShowAddresses(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autocomplete as user types
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (value.length >= 2) {
      setValidated(false);
      debounceTimer.current = setTimeout(async () => {
        const results = await autocompletePostcode(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [value]);

  const handleSelect = async (postcode: string) => {
    onChange(postcode);
    setShowSuggestions(false);
    setSuggestions([]);

    // Validate and get full postcode data
    const postcodeData = await lookupPostcode(postcode);
    if (postcodeData) {
      setValidated(true);
      if (onSelect) {
        onSelect(postcodeData);
      }
    }

    // Fetch addresses from Land Registry if callback provided
    if (onAddressSelect) {
      console.log('Fetching addresses for postcode:', postcode);
      const priceData = await fetchPricePaid(postcode);
      console.log('Land Registry data:', priceData);
      if (priceData && priceData.length > 0) {
        // Get unique addresses
        const uniqueAddresses = [...new Set(priceData.map((item: any) => item.address))];
        console.log('Unique addresses:', uniqueAddresses);
        setAddresses(uniqueAddresses);
        setShowAddresses(true);
      } else {
        console.log('No addresses found for postcode');
        // Show dropdown with "no addresses" message
        setAddresses([]);
        setShowAddresses(true);
      }
    }
  };

  const handleAddressSelect = (address: string) => {
    if (onAddressSelect) {
      onAddressSelect(address);
    }
    setShowAddresses(false);
    setAddresses([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.toUpperCase());
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div ref={wrapperRef} className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          required={required}
          className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors"
        />

        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] animate-spin" />
        )}

        {validated && !loading && (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
            {suggestions.map((postcode, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(postcode)}
                className="w-full px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors
                         flex items-center gap-2 border-b border-[var(--border-subtle)] last:border-0 text-sm text-[var(--text-secondary)]"
              >
                <MapPin className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                <span className="font-medium">{postcode}</span>
              </button>
            ))}
          </div>
        )}

        {/* Address Dropdown (after postcode selection) - only show if not using address field positioning */}
        {showAddresses && !showDropdownOnAddress && (
          <div className="absolute z-50 w-[400px] mt-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
            <div className="px-4 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)]">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                {addresses.length > 0 ? 'Select an address:' : 'No addresses found'}
              </p>
            </div>
            {addresses.length > 0 ? (
              addresses.map((address, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAddressSelect(address)}
                  className="w-full px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors
                           border-b border-[var(--border-subtle)] last:border-0 text-sm text-[var(--text-secondary)]"
                >
                  <span className="font-medium">{address}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-[var(--text-muted)]">
                No recent property sales found for this postcode in the Land Registry database. You can still enter the address manually above.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Address Dropdown positioned on address field */}
      {showAddresses && showDropdownOnAddress && (
        <div className="absolute z-[9999] left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto" style={{ top: '-110px' }}>
          <div className="px-4 py-2 bg-[var(--bg-subtle)] border-b border-[var(--border-subtle)]">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              {addresses.length > 0 ? 'Select an address:' : 'No addresses found'}
            </p>
          </div>
          {addresses.length > 0 ? (
            addresses.map((address, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAddressSelect(address)}
                className="w-full px-4 py-2.5 text-left hover:bg-[var(--bg-hover)] transition-colors
                         border-b border-[var(--border-subtle)] last:border-0 text-sm text-[var(--text-secondary)]"
              >
                <span className="font-medium">{address}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-[var(--text-muted)]">
              No recent property sales found for this postcode in the Land Registry database. You can still enter the address manually above.
            </div>
          )}
        </div>
      )}

      {validated && (
        <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Postcode validated
        </p>
      )}
    </div>
  );
}
