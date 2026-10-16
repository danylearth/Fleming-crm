// Supabase holds Rentro identities (Auth) and private uploads (Storage). The API talks to it with the
// project's secret key; the key never reaches the browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let admin: SupabaseClient | null = null;

export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

export const supabaseUrl = () => {
  if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
  return process.env.SUPABASE_URL.replace(/\/+$/, '');
};

/** The `iss` claim on every access token the project issues. */
export const supabaseIssuer = () => `${supabaseUrl()}/auth/v1`;

export function supabaseAdmin(): SupabaseClient {
  if (!supabaseConfigured()) throw new Error('Supabase is not configured (SUPABASE_URL and SUPABASE_SECRET_KEY)');
  return admin ||= createClient(supabaseUrl(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
