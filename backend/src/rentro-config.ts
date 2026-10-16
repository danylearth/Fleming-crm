// Environment switches for Rentro, kept free of route imports so any Rentro module can read them.

export const rentroEnabled = () => process.env.RENTRO_ENABLED === 'true';

/** 'allowlist' (default) only lets addresses in rentro_pilot_allowlist sign up; 'open' lets anyone. */
export const rentroSignupMode = (): 'allowlist' | 'open' => process.env.RENTRO_SIGNUP === 'open' ? 'open' : 'allowlist';

/** Extra exact HTTPS origins for the Rentro front end (e.g. a staging Vercel URL), comma-separated. */
export function rentroAllowedOrigin(origin: string) {
  const allowed = (process.env.RENTRO_ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  return origin.startsWith('https://') && allowed.includes(origin);
}
