import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;

let initialized = false;
let loaded = false;

export async function loadPlacesLibrary(): Promise<boolean> {
  if (!apiKey) return false;
  if (loaded) return true;

  if (!initialized) {
    setOptions({ key: apiKey, libraries: ['places'] });
    initialized = true;
  }

  await importLibrary('places');
  loaded = true;
  return true;
}
