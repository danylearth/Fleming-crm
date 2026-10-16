// A Rentro landlord's portfolio: list, add (one at a time or by CSV import), edit, and prove ownership.
// Joining with a portfolio never needs a Fleming letting-service agreement, so nothing here calls serviceGate.
import type { Express, Response } from 'express';
import multer from 'multer';
import path from 'path';
import type { PoolClient } from 'pg';
import pool, { query } from './db-pg';
import { findDuplicateProperty, propertyIdentity } from './property-duplicates';
import { rentroAuth, type RentroContext, type RentroRequest } from './rentro-auth';
import { rentroAudit } from './rentro-audit';
import { assertLandlordProperty, InputError, landlordPropertyColumns, landlordPropertyScopeSql, requireLandlord, ScopeError } from './rentro-scope';
import { ownershipStatus } from './rentro-status';
import { deletePrivateFile, detectFileType, newStorageKey, putPrivateFile, sha256 } from './rentro-storage';

export const PROPERTY_TYPES = ['house', 'flat', 'bungalow', 'studio', 'hmo'] as const;
export const OCCUPANCY = ['occupied', 'vacant', 'preparing'] as const;
export const CLAIMED_ROLES = ['owner', 'joint_owner', 'company_director', 'authorised_agent'] as const;
export const EVIDENCE_TYPES = ['Proof of Ownership', 'Land Registry'] as const;
export const IMPORT_LIMIT = 50;

export interface PropertyInput {
  address: string;
  address_line_2: string | null;
  city: string | null;
  postcode: string;
  property_type: typeof PROPERTY_TYPES[number];
  bedrooms: number | null;
  occupancy: typeof OCCUPANCY[number];
  claimed_role: typeof CLAIMED_ROLES[number];
}

const text = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max + 1);

/** UK postcode in its standard form ("E8 1AA"), or null if it isn't one. */
export function ukPostcode(value: unknown): string | null {
  const compact = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function propertyInput(raw: any): PropertyInput {
  const address = text(raw?.address, 200);
  if (address.length < 3 || address.length > 200) throw new InputError('Enter the first line of the address');
  const postcode = ukPostcode(raw?.postcode);
  if (!postcode) throw new InputError('Enter a valid UK postcode');
  const line2 = text(raw?.address_line_2, 200), city = text(raw?.city, 100);
  if (line2.length > 200 || city.length > 100) throw new InputError('That address is too long');
  const type = String(raw?.property_type ?? 'house').trim().toLowerCase();
  if (!(PROPERTY_TYPES as readonly string[]).includes(type)) throw new InputError(`Choose a property type: ${PROPERTY_TYPES.join(', ')}`);
  const bedroomsRaw = raw?.bedrooms;
  const bedrooms = bedroomsRaw === '' || bedroomsRaw == null ? null : Number(bedroomsRaw);
  if (bedrooms !== null && (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 30)) throw new InputError('Bedrooms must be a whole number from 0 to 30');
  const occupancy = String(raw?.occupancy ?? '').trim().toLowerCase();
  if (!(OCCUPANCY as readonly string[]).includes(occupancy)) throw new InputError('Say whether the home is occupied, vacant or being prepared');
  const role = String(raw?.claimed_role ?? 'owner').trim().toLowerCase();
  if (!(CLAIMED_ROLES as readonly string[]).includes(role)) throw new InputError('Choose your role: owner, joint owner, company director or authorised agent');
  return {
    address, address_line_2: line2 || null, city: city || null, postcode,
    property_type: type as PropertyInput['property_type'], bedrooms,
    occupancy: occupancy as PropertyInput['occupancy'], claimed_role: role as PropertyInput['claimed_role'],
  };
}

/** Fleming-facing status for a self-managed home: never 'to_let' or 'available', which mean marketing. */
const selfManagedStatus = (occupancy: string) => occupancy === 'occupied' ? 'let' : null;

/**
 * Adds one home to the landlord's portfolio inside the caller's transaction. An address that matches an
 * existing property is not attached: it is recorded as a claim for staff to review.
 */
export async function addSelfManagedProperty(client: PoolClient, ctx: RentroContext, input: PropertyInput) {
  const landlordId = requireLandlord(ctx)[0];
  const duplicate = await findDuplicateProperty(client, input);
  if (duplicate) {
    const claim = (await client.query(`INSERT INTO rentro_property_claims(duplicate_of_property_id,landlord_id,account_id,claimed_role,submitted_address)
      VALUES($1,$2,$3,$4,$5) RETURNING id`, [duplicate.id, landlordId, ctx.accountId, input.claimed_role, JSON.stringify(input)])).rows[0];
    await client.query(`INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,task_type,due_date)
      VALUES($1,$2,'pending','medium','property',$3,'rentro_authority',CURRENT_DATE)`,
      [`Rentro claim on an existing property — ${duplicate.address}`, `${ctx.name} (${ctx.email}) added this address to their Rentro portfolio as ${input.claimed_role.replace('_', ' ')}. It was not attached. Review the claim in Rentro → Ownership.`, duplicate.id]);
    await rentroAudit(client, ctx, 'create', 'rentro_property_claim', Number(claim.id), { duplicate_of_property_id: duplicate.id });
    return { status: 'duplicate_review' as const, claim_id: Number(claim.id) };
  }
  const property = (await client.query(`INSERT INTO properties(address,address_line_2,city,postcode,property_type,bedrooms,landlord_id,management_mode,occupancy,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,'self_managed',$8,$9) RETURNING id`,
    [input.address, input.address_line_2, input.city, input.postcode, input.property_type, input.bedrooms, landlordId, input.occupancy, selfManagedStatus(input.occupancy)])).rows[0];
  await client.query('INSERT INTO property_landlords(property_id,landlord_id,is_primary) VALUES($1,$2,1)', [property.id, landlordId]);
  await client.query(`INSERT INTO rentro_property_claims(property_id,landlord_id,account_id,claimed_role,submitted_address) VALUES($1,$2,$3,$4,$5)`,
    [property.id, landlordId, ctx.accountId, input.claimed_role, JSON.stringify(input)]);
  await rentroAudit(client, ctx, 'create', 'property', property.id, { management_mode: 'self_managed', occupancy: input.occupancy });
  return { status: 'created' as const, property_id: Number(property.id) };
}

export interface ImportRowResult { row: number; ok: boolean; error?: string; duplicate?: boolean; address?: string }

/** Checks every row; within-file repeats are errors, matches with existing properties are flagged for review. */
export async function previewImport(client: PoolClient, rows: unknown[]): Promise<{ results: ImportRowResult[]; inputs: (PropertyInput | null)[] }> {
  const seen = new Set<string>();
  const results: ImportRowResult[] = [], inputs: (PropertyInput | null)[] = [];
  for (const [i, raw] of rows.entries()) {
    try {
      const input = propertyInput(raw);
      const identity = propertyIdentity(input);
      if (seen.has(identity)) throw new InputError('This address appears more than once in the file');
      seen.add(identity);
      const duplicate = await findDuplicateProperty(client, input);
      results.push({ row: i + 1, ok: true, duplicate: Boolean(duplicate), address: `${input.address}, ${input.postcode}` });
      inputs.push(input);
    } catch (e) {
      if (!(e instanceof InputError)) throw e;
      results.push({ row: i + 1, ok: false, error: e.message });
      inputs.push(null);
    }
  }
  return { results, inputs };
}

export const respond = (res: Response, e: any) => {
  if (e instanceof ScopeError || e instanceof InputError) return res.status(e.status).json({ error: e.message });
  console.error('[rentro]', e);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
};

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>, commit = true): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const evidenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('file');

export function registerRentroPortfolio(app: Express) {
  app.get('/api/rentro/portfolio', rentroAuth, async (req: RentroRequest, res) => {
    try {
      const ctx = req.rentro!, landlordIds = requireLandlord(ctx);
      const homes = await query(`SELECT ${landlordPropertyColumns('p')}, c.claimed_role, c.authority_status, c.review_notes
        FROM properties p
        LEFT JOIN LATERAL (SELECT claimed_role,authority_status,review_notes FROM rentro_property_claims c WHERE c.property_id=p.id AND c.landlord_id=ANY($1::int[]) ORDER BY c.id DESC LIMIT 1) c ON TRUE
        WHERE p.archived_at IS NULL AND ${landlordPropertyScopeSql('$1', 'p')} ORDER BY p.address, p.id`, [landlordIds]);
      const pending = await query(`SELECT id, submitted_address, claimed_role, created_at FROM rentro_property_claims
        WHERE landlord_id=ANY($1::int[]) AND property_id IS NULL AND authority_status<>'rejected' ORDER BY id`, [landlordIds]);
      res.json({
        homes: homes.map(h => ({ ...h, ownership: ownershipStatus(h.authority_status, h.management_mode, h.review_notes), review_notes: undefined })),
        checking: pending.map(p => ({ claim_id: Number(p.id), address: `${p.submitted_address.address}, ${p.submitted_address.postcode}`, claimed_role: p.claimed_role,
          note: 'This address is already on Fleming’s records. Fleming will check it and add it to your portfolio.' })),
      });
    } catch (e) { respond(res, e); }
  });

  app.post('/api/rentro/properties', rentroAuth, async (req: RentroRequest, res) => {
    try {
      const ctx = req.rentro!;
      requireLandlord(ctx);
      const input = propertyInput(req.body);
      const result = await inTransaction(client => addSelfManagedProperty(client, ctx, input));
      res.status(result.status === 'created' ? 201 : 202).json(result);
    } catch (e) { respond(res, e); }
  });

  app.post('/api/rentro/properties/import', rentroAuth, async (req: RentroRequest, res) => {
    try {
      const ctx = req.rentro!;
      requireLandlord(ctx);
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Add at least one home to import' });
      if (rows.length > IMPORT_LIMIT) return res.status(400).json({ error: `Import up to ${IMPORT_LIMIT} homes at a time` });
      if (req.body.confirm !== true) {
        const { results } = await inTransaction(client => previewImport(client, rows), false);
        return res.json({ rows: results, ready: results.every(r => r.ok) });
      }
      const outcome = await inTransaction(async client => {
        const { results, inputs } = await previewImport(client, rows);
        if (!results.every(r => r.ok)) return { results, created: null };
        const created = [];
        for (const input of inputs) created.push(await addSelfManagedProperty(client, ctx, input!));
        await rentroAudit(client, ctx, 'import', 'property', null, { rows: rows.length });
        return { results, created };
      });
      if (!outcome.created) return res.status(400).json({ error: 'Fix the highlighted rows, then import again', rows: outcome.results, ready: false });
      res.status(201).json({
        created: outcome.created.filter(r => r.status === 'created').length,
        duplicate_review: outcome.created.filter(r => r.status === 'duplicate_review').length,
      });
    } catch (e) { respond(res, e); }
  });

  app.get('/api/rentro/properties/:id', rentroAuth, async (req: RentroRequest, res) => {
    try {
      const home = await assertLandlordProperty(req.rentro!, req.params.id);
      res.json({ ...home, ownership: ownershipStatus(home.authority_status, home.management_mode) });
    } catch (e) { respond(res, e); }
  });

  app.put('/api/rentro/properties/:id', rentroAuth, async (req: RentroRequest, res) => {
    try {
      const ctx = req.rentro!;
      const result = await inTransaction(async client => {
        const home = await assertLandlordProperty(ctx, req.params.id, { db: client });
        if (home.management_mode !== 'self_managed') throw new InputError('Fleming manages this home. Message Fleming to change its details.', 409);
        const merged = propertyInput({ ...home, claimed_role: 'owner', ...req.body, address: home.address, postcode: home.postcode, city: home.city, address_line_2: home.address_line_2 });
        await client.query('UPDATE properties SET property_type=$2,bedrooms=$3,occupancy=$4,status=$5,updated_at=NOW() WHERE id=$1',
          [home.id, merged.property_type, merged.bedrooms, merged.occupancy, selfManagedStatus(merged.occupancy)]);
        await rentroAudit(client, ctx, 'update', 'property', home.id, { property_type: merged.property_type, bedrooms: merged.bedrooms, occupancy: merged.occupancy });
        return { id: home.id, property_type: merged.property_type, bedrooms: merged.bedrooms, occupancy: merged.occupancy };
      });
      res.json(result);
    } catch (e) { respond(res, e); }
  });

  app.post('/api/rentro/properties/:id/authority', rentroAuth, (req, res, next) => evidenceUpload(req, res, err => err
    ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Upload a file up to 10 MB' : 'Upload one file' })
    : next()), async (req: RentroRequest, res) => {
    try {
      const ctx = req.rentro!;
      const home = await assertLandlordProperty(ctx, req.params.id);
      if (home.management_mode !== 'self_managed') return res.status(409).json({ error: 'Fleming already holds the ownership records for this home.' });
      if (home.authority_status === 'verified') return res.status(409).json({ error: 'Your ownership of this home is already verified.' });
      const docType = String(req.body?.doc_type || 'Proof of Ownership');
      if (!(EVIDENCE_TYPES as readonly string[]).includes(docType)) return res.status(400).json({ error: 'Choose Proof of Ownership or Land Registry' });
      const file = (req as any).file as { buffer: Buffer; size: number; originalname: string } | undefined;
      if (!file) return res.status(400).json({ error: 'Choose a file to upload' });
      const type = detectFileType(file.buffer);
      if (!type) return res.status(400).json({ error: 'Upload a PDF, JPG or PNG' });
      const stored = await putPrivateFile(newStorageKey(`properties/${home.id}`, type.ext), file.buffer, type.mime);
      try {
        const doc = await inTransaction(async client => {
          const original = path.basename(String(file.originalname || `evidence.${type.ext}`)).replace(/[^\w .()-]/g, '_').slice(0, 200);
          const row = (await client.query(`INSERT INTO documents(entity_type,entity_id,doc_type,filename,original_name,mime_type,size,review_status,origin,uploaded_by_account,customer_visibility,sha256,storage_backend)
            VALUES('property',$1,$2,$3,$4,$5,$6,'pending','rentro_upload',$7,'landlord',$8,$9) RETURNING id`,
            [home.id, docType, stored.key, original, type.mime, file.size, ctx.accountId, sha256(file.buffer), stored.backend])).rows[0];
          await client.query(`UPDATE rentro_property_claims SET authority_status='submitted',evidence_document_id=$3,reviewed_at=NULL,reviewed_by=NULL,review_notes=NULL
            WHERE property_id=$1 AND landlord_id=ANY($2::int[])`, [home.id, ctx.landlordIds, row.id]);
          await client.query(`INSERT INTO tasks(title,description,status,priority,entity_type,entity_id,task_type,due_date)
            SELECT $1,$2,'pending','medium','property',$3,'rentro_authority',CURRENT_DATE
            WHERE NOT EXISTS(SELECT 1 FROM tasks WHERE task_type='rentro_authority' AND entity_type='property' AND entity_id=$3 AND status IN ('pending','in_progress'))`,
            [`Verify Rentro ownership — ${home.address}`, `${ctx.name} uploaded ${docType} for this self-managed home. Review it in Rentro → Ownership.`, home.id]);
          await rentroAudit(client, ctx, 'upload', 'document', Number(row.id), { property_id: home.id, doc_type: docType });
          return row;
        });
        res.status(201).json({ document_id: Number(doc.id), ownership: ownershipStatus('submitted', 'self_managed') });
      } catch (e) {
        await deletePrivateFile(stored);
        throw e;
      }
    } catch (e) { respond(res, e); }
  });
}
