import type { Express } from 'express';
import pool, { queryOne, insert } from './db-pg';
import { authMiddleware, requirePermission, AuthRequest } from './auth';
import { tenancyEndEmail, normalizePropertyAddress, sendEmail, OUTBOUND_EMAIL_ADDRESS } from './email';
import { sendSms, normalizeUkPhone, SMS_FROM } from './sms';
import { dateOnly } from './tenant-lifecycle';
import { syncTenantLifecycle } from './tenant-lifecycle-db';

export function validEndDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function registerTenancyEndRoutes(app: Express) {
  app.post('/api/tenants/:id/tenancy-end', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
    const endDate = req.body?.end_date;
    if (!validEndDate(endDate)) return res.status(400).json({ error: 'Choose a valid tenancy end date' });
    const notes = String(req.body?.notes || '').trim();
    if (notes.length > 10000) return res.status(400).json({ error: 'Internal notes must be under 10,000 characters' });
    const client = await pool.connect();
    let lockId: number | null = null;
    try {
      await client.query('BEGIN');
      // Serialize scheduling and message retries for this tenancy, including either joint tenant.
      const original = (await client.query('SELECT * FROM tenants WHERE id=$1', [req.params.id])).rows[0];
      if (!original) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tenant not found' }); }
      lockId = original.property_id || original.id;
      await client.query('SELECT pg_advisory_lock(909, $1::int)', [lockId]);
      const tenants = (await client.query(`SELECT * FROM tenants WHERE id=$1 OR (id=$2 AND property_id=$3) ORDER BY id FOR UPDATE`,
        [original.id, original.linked_tenant_id || null, original.property_id])).rows;
      if (tenants.some(t => t.status === 'inactive')) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This tenancy is already archived' }); }
      if (tenants.some(t => dateOnly(t.tenancy_start_date) > endDate)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'The end date cannot be before the tenancy start date' }); }
      const property = (await client.query('SELECT address, postcode FROM properties WHERE id=$1', [original.property_id])).rows[0];
      if (!property) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Link a property before scheduling the tenancy end' }); }
      const previews = tenants.map(t => ({ tenant_id: t.id, name: t.name, to: t.email, phone: t.phone,
        ...tenancyEndEmail(t.first_name_1 || String(t.name).split(' ')[0], normalizePropertyAddress(property.address, property.postcode), endDate) }));
      if (!req.body.send_email) previews.forEach(p => { p.sms = p.sms.replace(' Further details have been sent you via email.', ''); });
      const smsEdits = req.body.sms_messages || {};
      if (typeof smsEdits !== 'object' || Array.isArray(smsEdits) || Object.entries(smsEdits).some(([id,value]) => !tenants.some(t => String(t.id) === id) || typeof value !== 'string' || !value.trim() || value.length > 1600)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Each SMS must belong to this tenancy and contain 1–1,600 characters' }); }
      previews.forEach(p => { if (smsEdits[p.tenant_id]) p.sms = smsEdits[p.tenant_id].trim(); });
      if (req.body.preview_only === true) { await client.query('ROLLBACK'); return res.json({ previews }); }
      if (req.body.send_email && previews.some(p => !p.to)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Every linked tenant needs an email address to send email confirmations' }); }
      if (req.body.send_sms && previews.some(p => !p.phone)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Every linked tenant needs a phone number to send SMS confirmations' }); }
      for (const tenant of tenants) {
        let previousNotes: any[] = [];
        try { const parsed = JSON.parse(tenant.notes || '[]'); if (Array.isArray(parsed)) previousNotes = parsed; } catch { if (tenant.notes) previousNotes = [{ id: 'legacy', text: tenant.notes, author: 'System', created_at: new Date().toISOString() }]; }
        if (notes && !previousNotes.some(n => n.text === notes && n.tenancy_end_date === endDate)) previousNotes.push({ id: `tenancy-end-${Date.now()}`, text: notes, author: req.user?.email || 'Staff', created_at: new Date().toISOString(), tenancy_end_date: endDate });
        await client.query('UPDATE tenants SET has_end_date=1, tenancy_end_date=$1, notes=$2, updated_at=NOW() WHERE id=$3', [endDate, JSON.stringify(previousNotes), tenant.id]);
        await client.query(`INSERT INTO audit_log (user_id,user_email,action,entity_type,entity_id,changes) VALUES ($1,$2,'update','tenant',$3,$4)`, [req.user?.id, req.user?.email, tenant.id, JSON.stringify({ action: 'schedule_tenancy_end', end_date: endDate })]);
      }
      await client.query('COMMIT');
      const failures: string[] = [];
      for (const preview of previews) {
        let emailConfirmed = !req.body.send_email;
        if (req.body.send_email) {
          const sent = await queryOne(`SELECT id FROM email_messages WHERE entity_type='tenant' AND entity_id=$1 AND template='tenancy_end' AND body_html=$2 AND status IN ('sent','delivered','opened','clicked') LIMIT 1`, [preview.tenant_id, preview.html]);
          if (sent) emailConfirmed = true;
          else {
            const result = await sendEmail({ to: preview.to, subject: preview.subject, html: preview.html });
            await insert(`INSERT INTO email_messages (resend_id,entity_type,entity_id,to_email,from_email,subject,template,body_html,status,sent_by,sent_by_email,error_message) VALUES ($1,'tenant',$2,$3,$4,$5,'tenancy_end',$6,$7,$8,$9,$10)`,
              [result.id || null, preview.tenant_id, preview.to, OUTBOUND_EMAIL_ADDRESS, preview.subject, preview.html, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', req.user?.id, req.user?.email, result.error || null]);
            emailConfirmed = result.success && !result.simulated;
            if (!result.success || result.simulated) failures.push(`Email to ${preview.name}: ${result.error || 'simulated; no real email sent'}`);
          }
        }
        if (req.body.send_sms) {
          const message = emailConfirmed ? preview.sms : preview.sms.replace(' Further details have been sent you via email.', '');
          const phone = normalizeUkPhone(preview.phone);
          const sent = await queryOne(`SELECT id FROM sms_messages WHERE entity_type='tenant' AND entity_id=$1 AND message_body=$2 AND status IN ('sent','delivered','queued','accepted') LIMIT 1`, [preview.tenant_id, message]);
          if (!sent) {
            const result = await sendSms({ to: phone, body: message });
            await insert(`INSERT INTO sms_messages (entity_type,entity_id,to_phone,from_phone,message_body,status,twilio_sid,error_message,sent_by,sent_by_email) VALUES ('tenant',$1,$2,$3,$4,$5,$6,$7,$8,$9)`, [preview.tenant_id, phone, SMS_FROM || null, message, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', result.sid || null, result.error || null, req.user?.id, req.user?.email]);
            if (!result.success || result.simulated) failures.push(`SMS to ${preview.name}: ${result.error || 'simulated; no real SMS sent'}`);
          }
        }
      }
      await syncTenantLifecycle();
      res.json({ success: true, scheduled: tenants.map(t => t.id), failures });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Tenancy end scheduling failed', error);
      res.status(500).json({ error: 'Could not complete tenancy-end scheduling. Refresh the record before retrying.' });
    } finally {
      if (lockId !== null) await client.query('SELECT pg_advisory_unlock(909, $1::int)', [lockId]).catch(() => {});
      client.release();
    }
  });
}
