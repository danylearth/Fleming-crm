// Staff tools for Rentro (CRM → Rentro page): review proof of ownership and claims on existing
// addresses, link sign-ups that match an existing landlord, and manage the pilot allowlist.
// Staff routes only: the global guard requires staff for writes, and every read adds the same check.
import type { Express, Response } from 'express';
import pool, { query, queryOne } from './db-pg';
import { authMiddleware, requirePermission, type AuthRequest } from './auth';
import { readPrivateFile, type StorageBackend } from './rentro-storage';

const staff = [authMiddleware, requirePermission('staff')] as const;

async function staffAudit(db: { query: (...a: any[]) => Promise<any> }, req: AuthRequest, action: string, entityType: string, entityId: number | null, changes: Record<string, unknown>) {
  await db.query('INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5,$6)',
    [req.user!.id, req.user!.email, action, entityType, entityId, JSON.stringify({ rentro: true, ...changes })]);
}

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

export function registerRentroAdmin(app: Express) {
  /** Claims waiting for a decision: uploaded evidence, and addresses that matched an existing property. */
  app.get('/api/rentro-admin/ownership', ...staff, async (_req, res) => {
    const rows = await query(`SELECT c.id, c.property_id, c.duplicate_of_property_id, c.claimed_role, c.authority_status, c.created_at, c.submitted_address,
        a.name AS account_name, a.email AS account_email, l.id AS landlord_id, l.name AS landlord_name,
        p.address, p.postcode, dp.address AS duplicate_address, dp.postcode AS duplicate_postcode, dl.name AS duplicate_owner,
        d.id AS document_id, d.doc_type, d.original_name, d.uploaded_at
      FROM rentro_property_claims c
      JOIN customer_accounts a ON a.id = c.account_id
      JOIN landlords l ON l.id = c.landlord_id
      LEFT JOIN properties p ON p.id = c.property_id
      LEFT JOIN properties dp ON dp.id = c.duplicate_of_property_id
      LEFT JOIN landlords dl ON dl.id = dp.landlord_id
      LEFT JOIN documents d ON d.id = c.evidence_document_id
      WHERE (c.property_id IS NOT NULL AND c.authority_status = 'submitted')
         OR (c.property_id IS NULL AND c.authority_status IN ('unverified','submitted'))
      ORDER BY c.created_at`);
    res.json(rows.map(r => ({ ...r, kind: r.property_id ? 'evidence' : 'existing_address' })));
  });

  /**
   * verified / rejected. For evidence, the document's review follows the decision. For an existing address,
   * "verified" links the landlord to that property as a co-owner; staff must have confirmed it with the owner on record.
   */
  app.post('/api/rentro-admin/ownership/:id/decision', ...staff, async (req: AuthRequest, res) => {
    const decision = req.body?.decision, notes = String(req.body?.notes || '').trim().slice(0, 1000);
    if (!['verified', 'rejected'].includes(decision)) return fail(res, 400, 'Choose verified or rejected');
    if (decision === 'rejected' && !notes) return fail(res, 400, 'Say what the landlord needs to do differently');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const claim = (await client.query('SELECT * FROM rentro_property_claims WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!claim) { await client.query('ROLLBACK'); return fail(res, 404, 'Claim not found'); }
      const open = claim.property_id ? claim.authority_status === 'submitted' : ['unverified', 'submitted'].includes(claim.authority_status);
      if (!open) { await client.query('ROLLBACK'); return fail(res, 409, 'This claim has already been decided'); }
      let propertyId = claim.property_id;
      if (!propertyId && decision === 'verified') {
        propertyId = claim.duplicate_of_property_id;
        await client.query('INSERT INTO property_landlords(property_id,landlord_id,is_primary) VALUES($1,$2,0) ON CONFLICT (property_id,landlord_id) DO NOTHING', [propertyId, claim.landlord_id]);
        if ((await client.query('SELECT 1 FROM rentro_property_claims WHERE property_id=$1 AND landlord_id=$2', [propertyId, claim.landlord_id])).rowCount) {
          await client.query('ROLLBACK'); return fail(res, 409, 'This landlord already has a claim on that property');
        }
        await client.query('UPDATE rentro_property_claims SET property_id=$2 WHERE id=$1', [claim.id, propertyId]);
      }
      await client.query('UPDATE rentro_property_claims SET authority_status=$2,reviewed_by=$3,reviewed_at=NOW(),review_notes=$4 WHERE id=$1',
        [claim.id, decision, req.user!.id, notes || null]);
      if (claim.evidence_document_id)
        await client.query("UPDATE documents SET review_status=$2,review_notes=$3,reviewed_by=$4,reviewed_at=NOW() WHERE id=$1",
          [claim.evidence_document_id, decision === 'verified' ? 'approved' : 'rejected', notes || null, req.user!.id]);
      const taskProperty = claim.property_id || claim.duplicate_of_property_id;
      await client.query("UPDATE tasks SET status='completed',completed_at=NOW() WHERE task_type='rentro_authority' AND entity_type='property' AND entity_id=$1 AND status IN ('pending','in_progress')", [taskProperty]);
      await staffAudit(client, req, 'update', 'rentro_property_claim', Number(claim.id), { decision, property_id: propertyId });
      await client.query('COMMIT');
      res.json({ id: Number(claim.id), authority_status: decision, property_id: propertyId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  /** The evidence file itself, for review. Only documents uploaded through Rentro. */
  app.get('/api/rentro-admin/documents/:id/file', ...staff, async (req, res) => {
    const doc = await queryOne("SELECT filename,original_name,mime_type,storage_backend FROM documents WHERE id=$1 AND origin IN ('rentro_upload','rentro_import')", [req.params.id]);
    if (!doc) return fail(res, 404, 'Document not found');
    try {
      const data = await readPrivateFile({ backend: doc.storage_backend as StorageBackend, key: doc.filename });
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${String(doc.original_name).replace(/[^\w .()-]/g, '_')}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(data);
    } catch {
      fail(res, 404, 'The file could not be found in storage');
    }
  });

  /** Accounts waiting for staff to link them to an existing CRM landlord. */
  app.get('/api/rentro-admin/accounts', ...staff, async (_req, res) => {
    res.json(await query(`SELECT a.id, a.name, a.email, a.status, a.created_at,
        COALESCE(json_agg(json_build_object('role',r.role,'status',r.status,'landlord_id',r.landlord_id)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles,
        (SELECT json_agg(json_build_object('id',l.id,'name',l.name)) FROM landlords l WHERE lower(l.email)=lower(a.email)) AS matching_landlords
      FROM customer_accounts a LEFT JOIN customer_roles r ON r.account_id=a.id AND r.status<>'revoked'
      GROUP BY a.id ORDER BY a.created_at DESC LIMIT 500`));
  });

  app.post('/api/rentro-admin/accounts/:id/link-landlord', ...staff, async (req: AuthRequest, res) => {
    const landlordId = Number(req.body?.landlord_id);
    if (!Number.isInteger(landlordId)) return fail(res, 400, 'Choose the landlord to link');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account = (await client.query('SELECT id,email FROM customer_accounts WHERE id=$1', [req.params.id])).rows[0];
      const landlord = (await client.query('SELECT id,email FROM landlords WHERE id=$1', [landlordId])).rows[0];
      if (!account || !landlord) { await client.query('ROLLBACK'); return fail(res, 404, 'Account or landlord not found'); }
      if (String(landlord.email || '').toLowerCase() !== account.email.toLowerCase()) { await client.query('ROLLBACK'); return fail(res, 409, 'The landlord record has a different email. Update it first if this is the same person.'); }
      const role = (await client.query("UPDATE customer_roles SET landlord_id=$2,status='active',granted_via='staff' WHERE account_id=$1 AND role='landlord' AND status='pending_link' RETURNING id", [account.id, landlordId])).rows[0];
      if (!role) { await client.query('ROLLBACK'); return fail(res, 409, 'This account is not waiting to be linked'); }
      await client.query("UPDATE tasks SET status='completed',completed_at=NOW() WHERE task_type='rentro_authority' AND entity_type='landlord' AND entity_id=$1 AND status IN ('pending','in_progress')", [landlordId]);
      await staffAudit(client, req, 'update', 'customer_account', null, { account_id: account.id, linked_landlord_id: landlordId });
      await client.query('COMMIT');
      res.json({ linked: true });
    } catch (e) {
      await client.query('ROLLBACK');
      if ((e as any)?.code === '23505') return fail(res, 409, 'That landlord is already linked to another Rentro account');
      throw e;
    } finally {
      client.release();
    }
  });

  app.get('/api/rentro-admin/allowlist', ...staff, async (_req, res) => {
    res.json(await query('SELECT w.email, w.note, w.created_at, u.name AS added_by FROM rentro_pilot_allowlist w LEFT JOIN users u ON u.id=w.added_by ORDER BY w.created_at DESC'));
  });

  app.post('/api/rentro-admin/allowlist', ...staff, async (req: AuthRequest, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254) return fail(res, 400, 'Enter a valid email address');
    await pool.query('INSERT INTO rentro_pilot_allowlist(email,note,added_by) VALUES($1,$2,$3) ON CONFLICT (email) DO NOTHING', [email, String(req.body?.note || '').slice(0, 200) || null, req.user!.id]);
    await staffAudit(pool, req, 'create', 'rentro_allowlist', null, { email });
    res.status(201).json({ email });
  });

  app.delete('/api/rentro-admin/allowlist/:email', ...staff, async (req: AuthRequest, res) => {
    const email = String(req.params.email || '').toLowerCase();
    await pool.query('DELETE FROM rentro_pilot_allowlist WHERE email=$1', [email]);
    await staffAudit(pool, req, 'delete', 'rentro_allowlist', null, { email });
    res.json({ removed: email });
  });
}
