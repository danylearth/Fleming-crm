// Rentro: the landlord and tenant app. Its customer API lives under /api/rentro/* with its own
// authentication (never the staff JWT). While RENTRO_ENABLED is not 'true', every Rentro route is a 404.
import type { Express } from 'express';

export const rentroEnabled = () => process.env.RENTRO_ENABLED === 'true';

/** 'allowlist' (default) only lets addresses in rentro_pilot_allowlist sign up; 'open' lets anyone. */
export const rentroSignupMode = (): 'allowlist' | 'open' => process.env.RENTRO_SIGNUP === 'open' ? 'open' : 'allowlist';

/** Extra exact HTTPS origins for the Rentro front end (e.g. a staging Vercel URL), comma-separated. */
export function rentroAllowedOrigin(origin: string) {
  const allowed = (process.env.RENTRO_ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  return origin.startsWith('https://') && allowed.includes(origin);
}

export function registerRentro(app: Express) {
  // Registered before any Rentro route, so switching the flag off hides all of them.
  app.use('/api/rentro', (_req, res, next) => rentroEnabled() ? next() : res.status(404).json({ error: 'Not found' }));
  app.get('/api/rentro/status', (_req, res) => res.json({ enabled: true, signup: rentroSignupMode() }));
}
