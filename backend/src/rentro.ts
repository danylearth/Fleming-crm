// Rentro: the landlord and tenant app. Its customer API lives under /api/rentro/* with its own
// authentication (Supabase Auth, never the staff JWT). While RENTRO_ENABLED is not 'true', every Rentro
// route is a 404.
import type { Express } from 'express';
import { rentroEnabled, rentroSignupMode } from './rentro-config';
import { registerRentroAccounts } from './rentro-accounts';
import { registerRentroPortfolio } from './rentro-portfolio';

export { rentroEnabled, rentroSignupMode, rentroAllowedOrigin } from './rentro-config';

/** Routes reachable without a Rentro session. Every other /api/rentro route must use rentroAuth. */
export const RENTRO_PUBLIC_ROUTES = ['GET /api/rentro/status', 'GET /api/rentro/signup-challenge', 'POST /api/rentro/signup'];

export function registerRentro(app: Express) {
  // Registered before any Rentro route, so switching the flag off hides all of them.
  app.use('/api/rentro', (_req, res, next) => rentroEnabled() ? next() : res.status(404).json({ error: 'Not found' }));
  app.get('/api/rentro/status', (_req, res) => res.json({ enabled: true, signup: rentroSignupMode() }));
  registerRentroAccounts(app);
  registerRentroPortfolio(app);
}
