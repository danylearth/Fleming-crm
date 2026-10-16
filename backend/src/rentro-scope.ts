// The only place that decides which CRM records a Rentro customer may see or change. Routes ask here
// first; a record outside the caller's scope is reported as not found (404), never as forbidden.
import type { PoolClient } from 'pg';
import { queryOne } from './db-pg';
import type { RentroContext } from './rentro-auth';

/** Properties a landlord owns: primary landlord, or a co-owner through property_landlords. `$n` is an int[] of landlord ids. */
export const landlordPropertyScopeSql = (param = '$1', alias = 'p') =>
  `(${alias}.landlord_id = ANY(${param}::int[]) OR EXISTS (SELECT 1 FROM property_landlords pl WHERE pl.property_id = ${alias}.id AND pl.landlord_id = ANY(${param}::int[])))`;

/** Columns a landlord may read on their own properties. Never SELECT * for customers. */
export const LANDLORD_PROPERTY_FIELDS = [
  'id', 'address', 'address_line_2', 'city', 'postcode', 'property_type', 'bedrooms', 'occupancy', 'management_mode',
  'has_gas', 'eicr_expiry_date', 'epc_expiry_date', 'gas_safety_expiry_date',
] as const;
export const landlordPropertyColumns = (alias = 'p') => LANDLORD_PROPERTY_FIELDS.map(f => `${alias}.${f}`).join(', ');

export class ScopeError extends Error {
  constructor(public status: 403 | 404, message: string) { super(message); }
}

/** A customer's input was not acceptable; the message is safe to show them. */
export class InputError extends Error {
  status: 400 | 403 | 409 = 400;
  constructor(message: string, status: 400 | 403 | 409 = 400) { super(message); this.status = status; }
}

/** The caller's landlord ids, or a 403 when the account has no active landlord role. */
export function requireLandlord(ctx: RentroContext): number[] {
  if (!ctx.landlordIds.length) {
    const pending = ctx.roles.some(r => r.role === 'landlord' && r.status === 'pending_link');
    throw new ScopeError(403, pending
      ? 'Fleming is connecting your account to your landlord record. We will email you when it is ready.'
      : 'This needs a landlord account.');
  }
  return ctx.landlordIds;
}

type Db = Pick<PoolClient, 'query'>;

/** The property row if the caller owns it, otherwise a 404. Optionally requires verified authority. */
export async function assertLandlordProperty(ctx: RentroContext, propertyId: unknown, options: { authority?: 'verified'; db?: Db } = {}) {
  const landlordIds = requireLandlord(ctx);
  const id = Number(propertyId);
  if (!Number.isInteger(id) || id <= 0) throw new ScopeError(404, 'Property not found');
  const sql = `SELECT ${landlordPropertyColumns('p')},
      (SELECT authority_status FROM rentro_property_claims c WHERE c.property_id = p.id AND c.landlord_id = ANY($1::int[]) ORDER BY c.id DESC LIMIT 1) AS authority_status
    FROM properties p WHERE p.id = $2 AND p.archived_at IS NULL AND ${landlordPropertyScopeSql('$1', 'p')}`;
  const row = options.db ? (await options.db.query(sql, [landlordIds, id])).rows[0] : await queryOne(sql, [landlordIds, id]);
  if (!row) throw new ScopeError(404, 'Property not found');
  // Fleming-operated homes already went through Fleming's own ownership checks.
  if (options.authority === 'verified' && row.management_mode === 'self_managed' && row.authority_status !== 'verified')
    throw new ScopeError(403, 'Fleming needs to verify your ownership of this home first.');
  return row;
}
