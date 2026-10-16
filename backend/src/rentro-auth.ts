// Every Rentro route runs behind rentroAuth. The browser signs in with Supabase Auth and sends the access
// token; we verify it against the project's published keys and load the CRM account and its roles.
// A Supabase token is not a staff JWT (different signer), so it can never reach staff routes.
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { query, queryOne } from './db-pg';
import { supabaseIssuer } from './rentro-supabase';

export interface RentroRole { role: 'landlord' | 'tenant' | 'applicant'; status: 'active' | 'pending_link'; landlord_id: number | null; tenant_id: number | null }
export interface RentroContext {
  accountId: string;
  email: string;
  name: string;
  roles: RentroRole[];
  /** Only active roles grant access to records. */
  landlordIds: number[];
  tenantIds: number[];
}
export type RentroRequest = Request & { rentro?: RentroContext };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let keySet: JWTVerifyGetKey | null = null;
/** Tests verify against a local key set instead of the project's JWKS endpoint. */
export function useRentroKeySet(keys: JWTVerifyGetKey | null) { keySet = keys; }
const keys = () => keySet ||= createRemoteJWKSet(new URL(`${supabaseIssuer()}/.well-known/jwks.json`));

/** The Supabase user id behind a valid, signed-in (not anonymous) access token. */
export async function verifyRentroToken(token: string): Promise<{ userId: string; email: string }> {
  const { payload } = await jwtVerify(token, keys(), {
    issuer: supabaseIssuer(),
    audience: 'authenticated',
    algorithms: ['ES256', 'RS256', 'EdDSA'],
  });
  if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) throw new Error('Token has no user');
  if (payload.role !== 'authenticated' || payload.is_anonymous === true) throw new Error('Token is not a signed-in user');
  return { userId: payload.sub, email: String(payload.email || '') };
}

export async function loadRentroContext(userId: string): Promise<RentroContext | null> {
  const account = await queryOne("SELECT id,email,name FROM customer_accounts WHERE id=$1 AND status='active'", [userId]);
  if (!account) return null;
  const roles: RentroRole[] = await query(
    "SELECT role,status,landlord_id,tenant_id FROM customer_roles WHERE account_id=$1 AND status IN ('active','pending_link') ORDER BY id",
    [userId],
  );
  const active = roles.filter(r => r.status === 'active');
  return {
    accountId: account.id,
    email: account.email,
    name: account.name,
    roles,
    landlordIds: active.filter(r => r.role === 'landlord' && r.landlord_id).map(r => Number(r.landlord_id)),
    tenantIds: active.filter(r => r.role === 'tenant' && r.tenant_id).map(r => Number(r.tenant_id)),
  };
}

export async function rentroAuth(req: RentroRequest, res: Response, next: NextFunction) {
  const token = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/.exec(String(req.headers.authorization || ''))?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in to continue' });
  let userId: string;
  try {
    ({ userId } = await verifyRentroToken(token));
  } catch {
    return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  }
  const context = await loadRentroContext(userId);
  if (!context) return res.status(403).json({ error: 'This account is not active. Contact Fleming Lettings.' });
  req.rentro = context;
  next();
}
