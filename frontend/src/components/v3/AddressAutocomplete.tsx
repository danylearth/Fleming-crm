interface AddressAutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (place: { address: string; postcode?: string; city?: string }) => void;
  placeholder?: string;
}

export default function AddressAutocomplete({ label, value, onChange, onSelect, placeholder }: AddressAutocompleteProps) {
  // For now, Google Places Autocomplete is not available to new API keys
  // Fallback to a regular input field
  // Users can still use the Postcode autocomplete to get Land Registry addresses

  return (
    <div>
      {label && <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">{label}</label>}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "Enter address manually"}
        className="w-full bg-[var(--bg-input)] border border-[var(--border-input)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-input)] transition-colors"
      />
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Use the postcode field below to auto-fill from Land Registry data
      </p>
    </div>
  );
}
