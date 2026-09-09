import type { Express } from 'express';
import pool from './db-pg';
import { authMiddleware, requirePermission, AuthRequest } from './auth';
export const completionKeys = ['authority_to_contact','kyc_primary_id','kyc_secondary_id','kyc_address_verification','kyc_personal_verification','kyc_completed_2','application_forms_completed','proof_of_income','guarantor_kyc_completed','guarantor_deed_received'];
export function registerCompletionRoutes(app: Express) {
  app.put('/api/tenants/:id/completion-overrides', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
    const { key, complete, reason } = req.body || {};
    if (!completionKeys.includes(key) || typeof complete !== 'boolean' || (complete && (typeof reason !== 'string' || !reason.trim() || reason.length > 2000))) return res.status(400).json({ error: 'Choose a checklist item and provide an override reason (up to 2,000 characters)' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = (await client.query('SELECT completion_overrides FROM tenants WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!tenant) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tenant not found' }); }
      const overrides = tenant.completion_overrides || {};
      if (complete) overrides[key] = { reason: reason.trim(), by: req.user?.email, at: new Date().toISOString() };
      else delete overrides[key];
      await client.query('UPDATE tenants SET completion_overrides=$1,updated_at=NOW() WHERE id=$2', [JSON.stringify(overrides), req.params.id]);
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','tenant',$3,$4)", [req.user?.id, req.user?.email, req.params.id, JSON.stringify({ action: 'completion_override', key, complete, reason: complete ? reason.trim() : null })]);
      await client.query('COMMIT'); res.json({ completion_overrides: overrides });
    } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Could not save the completion override' }); } finally { client.release(); }
  });
}
