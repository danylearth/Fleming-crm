import type { Express } from 'express';
import pool, { query } from './db-pg';
import { authMiddleware, requirePermission, AuthRequest } from './auth';
import { dateOnly } from './tenant-lifecycle';

export const ukToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T12:00:00Z`), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10);
}
export function validateRentDates(start: string, served: unknown, effective: unknown, last: unknown, today = ukToday()): string | null {
  if (!validDate(start)) return 'Record the tenancy start date first';
  if (!validDate(served) || !validDate(effective) || (last && !validDate(last))) return 'Enter valid notice, effective and previous increase dates';
  if (served < '2026-05-01' || served > today) return 'This workflow records Form 4A notices already served from 1 May 2026';
  if (effective < today) return 'The effective date cannot be in the past';
  if (effective < addMonths(served, 2)) return 'Allow at least two calendar months after service';
  if (effective < addMonths(start, 12)) return 'The increase must be at least 12 months after this monthly tenancy began';
  if (last && (String(last) < start || String(last) > today || effective < addMonths(String(last), 12))) return 'Check the previous increase date and allow at least 12 months between increases';
  const expected = addMonths(start, (Number(effective.slice(0,4))-Number(start.slice(0,4)))*12 + Number(effective.slice(5,7))-Number(start.slice(5,7)));
  if (effective !== expected) return 'The new rent must start on the first day of a monthly tenancy period';
  return null;
}

// The row lock serializes automatic application, pause/cancel and concurrent page reads.
export async function applyDueRentReviews(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const due = (await client.query("SELECT * FROM rent_reviews WHERE status='scheduled' AND effective_date <= (NOW() AT TIME ZONE 'Europe/London')::date ORDER BY id FOR UPDATE SKIP LOCKED")).rows;
    for (const review of due) {
      const tenants = (await client.query('SELECT * FROM tenants WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [review.tenant_ids])).rows;
      const invalid = tenants.length !== review.tenant_ids.length || tenants.some(t => t.property_id !== review.property_id || (t.status || 'active') !== 'active' || dateOnly(t.tenancy_start_date) !== dateOnly(review.tenancy_start_date) || (t.has_end_date && dateOnly(t.tenancy_end_date) < ukToday()) || Number(t.monthly_rent) !== Number(review.old_rent));
      if (invalid) {
        await client.query("UPDATE rent_reviews SET status='paused',status_reason='Tenancy or rent changed since scheduling. Staff review required.',updated_at=NOW() WHERE id=$1", [review.id]);
      } else {
        await client.query('UPDATE tenants SET monthly_rent=$1,updated_at=NOW() WHERE id=ANY($2::int[])', [review.new_rent, review.tenant_ids]);
        await client.query('UPDATE properties SET rent_amount=$1,updated_at=NOW() WHERE id=$2', [review.new_rent, review.property_id]);
        await client.query("UPDATE tenancies SET rent_amount=$1 WHERE tenant_id=ANY($2::int[]) AND property_id=$3 AND status='active'", [review.new_rent, review.tenant_ids, review.property_id]);
        // Preserve receipts, partial payments, historic and bespoke/prorated charges.
        await client.query(`UPDATE rent_payments SET amount_due=$1 WHERE property_id=$2 AND tenant_id=ANY($3::int[])
          AND due_date >= $4 AND COALESCE(amount_paid,0)=0 AND status IN ('pending','late') AND ROUND(amount_due::numeric,2)=$5`, [review.new_rent, review.property_id, review.tenant_ids, review.effective_date, review.old_rent]);
        await client.query("UPDATE rent_reviews SET status='applied',applied_at=NOW(),updated_at=NOW() WHERE id=$1", [review.id]);
      }
      for (const id of review.tenant_ids) await client.query("INSERT INTO audit_log(user_email,action,entity_type,entity_id,changes) VALUES ('System','update','tenant',$1,$2)", [id, JSON.stringify({ action: invalid ? 'rent_increase_paused' : 'rent_increase_applied', review_id: review.id, old_rent: review.old_rent, new_rent: review.new_rent, effective_date: dateOnly(review.effective_date) })]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

export function registerRentReviewRoutes(app: Express) {
  app.get('/api/tenants/:id/rent-reviews', authMiddleware, async (req, res) => {
    await applyDueRentReviews();
    res.json(await query('SELECT r.*,d.original_name AS notice_name FROM rent_reviews r JOIN documents d ON d.id=r.notice_document_id WHERE $1::int=ANY(r.tenant_ids) ORDER BY r.created_at DESC', [req.params.id]));
  });
  app.post('/api/tenants/:id/rent-reviews', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
    const b = req.body || {}, rent = Number(b.new_rent);
    if (!Number.isFinite(rent) || rent <= 0 || rent > 1000000 || Math.abs(rent*100 - Math.round(rent*100)) > .00001) return res.status(400).json({ error: 'Enter a valid monthly rent with no more than two decimal places' });
    if (b.confirmed !== true) return res.status(400).json({ error: 'Confirm monthly tenancy, notice service, rent history and no outstanding challenge' });
    if (!['in_person','post','email','other_agreed'].includes(b.service_method) || !Number.isInteger(b.notice_document_id)) return res.status(400).json({ error: 'Upload the signed Form 4A and select the service method' });
    if (b.last_increase_date && !validDate(b.last_increase_date)) return res.status(400).json({ error: 'Enter a valid previous increase date' });
    if (typeof b.notes !== 'string' || !b.notes.trim() || b.notes.length > 10000) return res.status(400).json({ error: 'Record service evidence and any tenant acknowledgement (up to 10,000 characters)' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const original = (await client.query('SELECT * FROM tenants WHERE id=$1', [req.params.id])).rows[0];
      if (!original?.property_id) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Link an active tenant and property first' }); }
      await client.query('SELECT pg_advisory_xact_lock(910,$1::int)', [original.property_id]);
      const tenants = (await client.query('SELECT * FROM tenants WHERE id=$1 OR (id=$2 AND property_id=$3) ORDER BY id FOR UPDATE', [original.id, original.linked_tenant_id || null, original.property_id])).rows;
      const ids = tenants.map(t => t.id);
      const applied = (await client.query("SELECT MAX(effective_date) AS last_date FROM rent_reviews WHERE tenant_ids && $1::int[] AND status='applied'", [ids])).rows[0];
      const last = [b.last_increase_date || '', dateOnly(applied.last_date)].sort()[1] || '';
      const error = validateRentDates(dateOnly(original.tenancy_start_date), b.notice_served_date, b.effective_date, last);
      if (error || tenants.some(t => t.property_id !== original.property_id || (t.status || 'active') !== 'active' || !Number(t.monthly_rent) || Number(t.monthly_rent) !== Number(original.monthly_rent) || dateOnly(t.tenancy_start_date) !== dateOnly(original.tenancy_start_date) || (t.has_end_date && dateOnly(t.tenancy_end_date) < b.effective_date))) { await client.query('ROLLBACK'); return res.status(400).json({ error: error || 'Linked tenants must share an active tenancy and current rent through the effective date' }); }
      if (rent <= Number(original.monthly_rent)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'The new rent must exceed the current monthly rent' }); }
      const doc = (await client.query("SELECT id FROM documents WHERE id=$1 AND entity_type='tenant' AND entity_id=ANY($2::int[]) AND mime_type='application/pdf' AND review_status='approved'", [b.notice_document_id, ids])).rows[0];
      if (!doc) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Use an approved PDF notice uploaded to this tenancy' }); }
      const review = (await client.query(`INSERT INTO rent_reviews(property_id,tenant_ids,tenancy_start_date,old_rent,new_rent,notice_document_id,notice_served_date,service_method,last_increase_date,effective_date,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [original.property_id, ids, original.tenancy_start_date, original.monthly_rent, rent, doc.id, b.notice_served_date, b.service_method, last || null, b.effective_date, b.notes.trim(), req.user?.email || 'Staff'])).rows[0];
      for (const id of ids) await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','tenant',$3,$4)", [req.user?.id, req.user?.email, id, JSON.stringify({ action: 'rent_increase_scheduled', review_id: review.id, new_rent: rent, effective_date: b.effective_date })]);
      await client.query('COMMIT'); res.json(review);
    } catch (e: any) { await client.query('ROLLBACK'); if (e.code === '23505') return res.status(409).json({ error: 'This tenancy already has a scheduled or paused rent increase' }); console.error('Rent review failed', e); res.status(500).json({ error: 'Could not save the rent review' }); } finally { client.release(); }
  });
  app.patch('/api/rent-reviews/:id', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
    const { status, reason } = req.body || {};
    if (!['paused','cancelled','scheduled'].includes(status) || typeof reason !== 'string' || !reason.trim() || reason.length > 2000) return res.status(400).json({ error: 'Choose a status and give a reason (up to 2,000 characters)' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const review = (await client.query('SELECT * FROM rent_reviews WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!review || ['applied','cancelled'].includes(review.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only pending rent increases can be changed' }); }
      if (status === 'scheduled' && (req.body.confirmed !== true || dateOnly(review.effective_date) < ukToday())) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Confirm the original notice remains valid with no outstanding challenge. A past effective date needs a new reviewed record.' }); }
      await client.query('UPDATE rent_reviews SET status=$1,status_reason=$2,updated_at=NOW() WHERE id=$3', [status, reason.trim(), review.id]);
      for (const id of review.tenant_ids) await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','tenant',$3,$4)", [req.user?.id, req.user?.email, id, JSON.stringify({ action: 'rent_increase_status', review_id: review.id, status, reason })]);
      await client.query('COMMIT'); res.json({ success: true });
    } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Could not update the rent review' }); } finally { client.release(); }
  });
}
