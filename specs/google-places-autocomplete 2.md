# Google Places Autocomplete

## Overview

Address autocomplete widget for UK addresses using the Google Maps JavaScript API Places library. Provides real-time address suggestions as users type, restricted to UK results. Used in property, landlord, and tenant forms throughout Fleming CRM.

The existing `AddressAutocomplete.tsx` component is currently a stub (plain text input). This spec covers replacing it with a working Google Places integration.

## Two API Approaches

Google offers two generations of Places Autocomplete:

### 1. Legacy: `google.maps.places.Autocomplete` (Widget)
- Attaches to an existing `<input>` element
- Uses `componentRestrictions: { country: 'gb' }` to restrict to UK
- Fires `place_changed` event
- Uses `fields` array to control billing (only pay for requested data)

### 2. New: `PlaceAutocompleteElement` (Web Component)
- Custom HTML element `<gmp-placeautocomplete>`
- Uses `includedRegionCodes: ['gb']` to restrict to UK
- Fires `gmp-placeselect` event
- Requires `v: "beta"` or `v: "weekly"` API version

**Recommendation:** Use the **legacy Autocomplete widget** for now — it's stable, well-documented, and compatible with React controlled inputs. The new Web Component approach has styling/integration challenges with React.

## Installation

### Option A: NPM Loader (Recommended for React/Vite)

```bash
npm install @googlemaps/js-api-loader
```

### Option B: Script Tag

```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"></script>
```

## Configuration

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `VITE_GOOGLE_PLACES_API_KEY` | Frontend `.env` | Google Maps API key with Places API enabled |

> **Note:** This env var is already referenced in the CLAUDE.md and may already exist in Vercel dashboard settings.

### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Places API** and **Maps JavaScript API**
3. Create an API key
4. Restrict the key:
   - **Application restrictions:** HTTP referrers (web)
   - **Allowed referrers:** `localhost:*`, `fleming-portal.vercel.app`, `*.fleminglettings.co.uk`
   - **API restrictions:** Places API, Maps JavaScript API

## Key Patterns

### Loading the API with `@googlemaps/js-api-loader`

```typescript
import { Loader } from '@googlemaps/js-api-loader';

const loader = new Loader({
  apiKey: import.meta.env.VITE_GOOGLE_PLACES_API_KEY,
  version: 'weekly',
  libraries: ['places'],
});

// Load once, reuse everywhere
let placesLibLoaded = false;

export async function loadPlacesLibrary(): Promise<void> {
  if (placesLibLoaded) return;
  await loader.importLibrary('places');
  placesLibLoaded = true;
}
```

### React Component: Address Autocomplete (Legacy Widget)

```typescript
import { useEffect, useRef } from 'react';
import { loadPlacesLibrary } from '../utils/google-places';

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

export default function AddressAutocomplete({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;

    let mounted = true;

    async function init() {
      await loadPlacesLibrary();
      if (!mounted || !inputRef.current) return;

      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'gb' },
        fields: ['address_components', 'formatted_address'],
        types: ['address'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;

        const components = place.address_components;
        const get = (type: string) =>
          components.find(c => c.types.includes(type))?.long_name || '';

        onSelect?.({
          address: place.formatted_address || '',
          postcode: get('postal_code'),
          city: get('postal_town') || get('locality'),
          street: `${get('street_number')} ${get('route')}`.trim(),
          county: get('administrative_area_level_2'),
        });
      });

      autocompleteRef.current = autocomplete;
    }

    init();

    return () => {
      mounted = false;
      // Google Autocomplete doesn't have a destroy method;
      // removing the input element cleans up the widget
    };
  }, [onSelect]);

  return (
    <div>
      {label && (
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5 font-medium">
          {label}
        </label>
      )}
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
```

### Extracting UK Address Components

UK addresses from Google Places use these `address_component` types:

```typescript
// Mapping Google address_component types to UK address fields
const UK_ADDRESS_MAPPING = {
  street_number: 'House/flat number',
  route: 'Street name',
  locality: 'Town (fallback)',
  postal_town: 'Town/city (preferred for UK)',
  administrative_area_level_2: 'County',
  administrative_area_level_1: 'Country (England/Scotland/Wales/NI)',
  country: 'Country (United Kingdom)',
  postal_code: 'Postcode',
  subpremise: 'Flat/unit number',
};
```

### Restricting to UK Only

```typescript
// Legacy widget
const autocomplete = new google.maps.places.Autocomplete(input, {
  componentRestrictions: { country: 'gb' },  // ISO 3166-1 alpha-2
});

// New PlaceAutocompleteElement (if migrating later)
const pac = new google.maps.places.PlaceAutocompleteElement({
  includedRegionCodes: ['gb'],
});
```

### Restricting to Address-Type Results Only

```typescript
const autocomplete = new google.maps.places.Autocomplete(input, {
  types: ['address'],  // Only street addresses, not businesses/cities
});
```

## API Reference

### Legacy Autocomplete Widget

| Method / Property | Description | Example |
|---|---|---|
| `new Autocomplete(input, options)` | Create widget attached to input | See pattern above |
| `getPlace()` | Get selected place details | `autocomplete.getPlace()` |
| `setOptions(options)` | Update options after creation | `autocomplete.setOptions({ types: ['address'] })` |
| `setBounds(bounds)` | Set search area bounds | `autocomplete.setBounds(map.getBounds())` |
| `bindTo('bounds', map)` | Bind bounds to map viewport | `autocomplete.bindTo('bounds', map)` |
| `addListener('place_changed', fn)` | Listen for selection | See pattern above |

### AutocompleteOptions

| Option | Type | Description |
|---|---|---|
| `componentRestrictions` | `{ country: string \| string[] }` | Restrict by country code(s) |
| `fields` | `string[]` | Place data fields to return (controls billing) |
| `types` | `string[]` | Filter by place types (`'address'`, `'geocode'`, `'establishment'`) |
| `strictBounds` | `boolean` | If true, only return results within bounds |
| `bounds` | `LatLngBounds` | Bias results to geographic area |

### PlaceAutocompleteElementOptions (New API)

| Option | Type | Description |
|---|---|---|
| `includedRegionCodes` | `string[]` | Restrict by ISO 3166-1 alpha-2 country codes |
| `includedPrimaryTypes` | `string[]` | Filter by place types |
| `locationBias` | `{ radius, center }` | Bias results to area |
| `locationRestriction` | `LatLngBounds` | Hard restrict to bounds |
| `requestedLanguage` | `string` | Language for results |
| `requestedRegion` | `string` | Region bias for formatting |

## Gotchas

1. **`fields` controls billing.** If you don't specify `fields`, Google returns ALL fields and charges for all data types. Always specify only what you need: `['address_components', 'formatted_address']` for address forms.

2. **`postal_town` vs `locality` for UK.** In the UK, `postal_town` is the correct "city" field. `locality` may return a suburb or neighbourhood instead. Always prefer `postal_town` and fall back to `locality`.

3. **React controlled input conflict.** Google Autocomplete takes over the input's value. React's controlled input (`value={state}`) can fight with this. Solutions:
   - Use the input as semi-controlled (set initial value, but don't fight Google's updates)
   - Update your React state in the `place_changed` handler, not on every keystroke after selection
   - Consider using `onSelect` callback to update parent state rather than two-way binding

4. **No destroy method.** The legacy Autocomplete widget has no `.destroy()` or `.remove()` method. If the component unmounts and remounts, you may get duplicate dropdown listeners. Use a ref to track initialization.

5. **Dropdown z-index.** The autocomplete dropdown (`.pac-container`) renders as a direct child of `<body>`. If using modals or dialogs, you may need CSS:
   ```css
   .pac-container {
     z-index: 10000 !important;
   }
   ```

6. **API key restrictions.** The key must have both **Places API** and **Maps JavaScript API** enabled. Places alone is not enough — the JavaScript loader requires Maps JS API.

7. **Country code is `'gb'`, not `'uk'`.** The ISO 3166-1 alpha-2 code for the United Kingdom is `GB`, not `UK`.

8. **Session tokens.** The legacy Autocomplete widget handles session tokens automatically (grouping keystrokes + selection into one billing session). If using the Autocomplete Service directly (`AutocompleteService.getPlacePredictions`), you must manage session tokens yourself.

## Rate Limits & Pricing

| API | Free Tier | Per-request Cost (above free) |
|---|---|---|
| **Autocomplete (per session)** | $200/month credit (~$0.00 for first ~11,500 sessions) | $0.017 per session |
| **Place Details** | Included in $200 credit | $0.017 per call (Basic fields) |

- A "session" = all keystrokes + the final place selection
- The legacy widget manages sessions automatically
- The $200/month free credit covers ~11,500 autocomplete sessions
- **Only requested `fields` are billed** — use `['address_components', 'formatted_address']` to stay in the cheapest "Basic" tier

## Type Definitions

For TypeScript support:

```bash
npm install -D @types/google.maps
```

This provides types for `google.maps.places.Autocomplete`, `PlaceResult`, `AutocompleteOptions`, etc.

## References

- [Places Autocomplete Guide](https://developers.google.com/maps/documentation/javascript/place-autocomplete)
- [PlaceAutocompleteElement (New)](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)
- [Autocomplete Widget Reference](https://developers.google.com/maps/documentation/javascript/reference/places-widget)
- [Place Types](https://developers.google.com/maps/documentation/places/web-service/supported_types)
- [Address Component Types](https://developers.google.com/maps/documentation/javascript/geocoding#GeocodingAddressTypes)
- [@googlemaps/js-api-loader](https://www.npmjs.com/package/@googlemaps/js-api-loader)
- [@types/google.maps](https://www.npmjs.com/package/@types/google.maps)
- [API Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
