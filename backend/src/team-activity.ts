import {dashboardAlerts} from './dashboard-alerts';
import type { Express } from 'express';
import pool, { query } from './db-pg';
import { AuthRequest, authMiddleware, requireRole } from './auth';

export function registerTeamActivityRoutes(app: Express) {
  app.post('/api/dashboard/clear-alerts', authMiddleware, requireRole('admin'), async(req:AuthRequest,res)=>{
    const client=await pool.connect();
    try{
      const alerts=await dashboardAlerts();
      const maintenance=await query("SELECT id FROM maintenance WHERE status IN ('open','in_progress')");
      const keys=[...alerts.map(a=>a.alert_key),...maintenance.map(m=>'maintenance:'+m.id)];
      await client.query('BEGIN');
      const changed=await client.query('INSERT INTO dashboard_alert_dismissals(alert_key,cleared_by) SELECT unnest($1::text[]),$2 ON CONFLICT DO NOTHING RETURNING alert_key',[keys,req.user!.id]);
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,changes) VALUES($1,$2,'update','dashboard',$3)",[req.user!.id,req.user!.email,JSON.stringify({action:'clear_alerts',keys:changed.rows.map(r=>r.alert_key)})]);
      await client.query('COMMIT');res.json({cleared:changed.rowCount});
    }catch{await client.query('ROLLBACK');res.status(500).json({error:'Could not clear dashboard alerts'});}finally{client.release();}
  });

  app.post('/api/tasks/clear-recent', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const changed = await client.query('UPDATE tasks SET dashboard_dismissed_at=NOW() WHERE dashboard_dismissed_at IS NULL RETURNING id');
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,changes) VALUES($1,$2,'update','task',$3)", [req.user!.id,req.user!.email,JSON.stringify({ action: 'clear_recent_tasks', ids: changed.rows.map(r => r.id) })]);
      await client.query('COMMIT'); res.json({ cleared: changed.rowCount });
    } catch { await client.query('ROLLBACK'); res.status(500).json({ error: 'Could not clear recent tasks' }); } finally { client.release(); }
  });

  app.post('/api/activity/heartbeat', authMiddleware, async (req: AuthRequest, res) => {
    const { page, navigation } = req.body || {};
    if (typeof page !== 'string' || page.length > 240 || !/^\/[a-zA-Z0-9/_.%~-]*$/.test(page)) return res.status(400).json({ error: 'Invalid page' });
    try {
      await query("INSERT INTO user_activity_minutes(user_id,minute,page) VALUES($1,date_trunc('minute',NOW()),$2) ON CONFLICT(user_id,minute) DO UPDATE SET page=EXCLUDED.page", [req.user!.id, page]);
      if (navigation === true) await query("INSERT INTO audit_log(user_id,user_email,action,entity_type,changes) VALUES($1,$2,'view','page',$3)", [req.user!.id, req.user!.email, JSON.stringify({ page })]);
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Could not record activity' }); }
  });
  app.get('/api/team-activity',authMiddleware,requireRole('admin'),async(_req,res)=>{
    res.json(await query(`SELECT u.id,u.name,u.email,u.department,u.is_active,
      COUNT(a.minute) FILTER(WHERE a.minute>=date_trunc('day',NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')::int AS today_minutes,
      ROUND(COUNT(a.minute) FILTER(WHERE a.minute>=NOW()-INTERVAL '7 days')/7.0,1) AS week_daily_average,
      ROUND(COUNT(a.minute) FILTER(WHERE a.minute>=NOW()-INTERVAL '30 days')/30.0,1) AS month_daily_average
      FROM users u LEFT JOIN user_activity_minutes a ON a.user_id=u.id AND a.minute>=NOW()-INTERVAL '30 days' GROUP BY u.id ORDER BY u.name`));
  });
  app.get('/api/users/:id/activity', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: 'Invalid activity offset' });
    try {
      const [usage, changes, pages] = await Promise.all([
        query(`SELECT COUNT(*) FILTER (WHERE minute >= date_trunc('day',NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')::int AS today_minutes,
          ROUND(COUNT(*) FILTER (WHERE minute >= NOW()-INTERVAL '7 days')/7.0,1) AS week_daily_average,
          ROUND(COUNT(*) FILTER (WHERE minute >= NOW()-INTERVAL '30 days')/30.0,1) AS month_daily_average,
          MIN(minute) AS tracked_since FROM user_activity_minutes WHERE user_id=$1`, [req.params.id]),
        query('SELECT id,action,entity_type,entity_id,changes,created_at FROM audit_log WHERE user_id=$1 ORDER BY id DESC LIMIT 201 OFFSET $2', [req.params.id, offset]),
        query('SELECT minute,page FROM user_activity_minutes WHERE user_id=$1 ORDER BY minute DESC LIMIT 100', [req.params.id]),
      ]);
      res.json({ usage: usage[0], changes: changes.slice(0,200), pages, next_offset: changes.length > 200 ? offset + 200 : null });
    } catch { res.status(500).json({ error: 'Could not load activity' }); }
  });
  app.get('/api/permission-requests', authMiddleware, async (req: AuthRequest, res) => {
    try {
      res.json(await query(`SELECT p.*,u.name,u.email FROM permission_requests p JOIN users u ON u.id=p.user_id ${req.user!.role === 'admin' ? '' : 'WHERE p.user_id=$1'} ORDER BY p.created_at DESC LIMIT 100`, req.user!.role === 'admin' ? [] : [req.user!.id]));
    } catch { res.status(500).json({ error: 'Could not load permission requests' }); }
  });
  app.post('/api/permission-requests', authMiddleware, async (req: AuthRequest, res) => {
    const { requested_role, reason } = req.body || {};
    if (!['viewer','staff','manager'].includes(requested_role) || requested_role === req.user!.role || typeof reason !== 'string' || !reason.trim() || reason.length > 2000) return res.status(400).json({ error: 'Choose a different role and explain why it is needed (up to 2,000 characters)' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = (await client.query('INSERT INTO permission_requests(user_id,requested_role,reason) VALUES($1,$2,$3) RETURNING *',[req.user!.id,requested_role,reason.trim()])).rows[0];
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'create','permission_request',$3,$4)",[req.user!.id,req.user!.email,result.id,JSON.stringify({ requested_role, reason: reason.trim() })]);
      await client.query('COMMIT'); res.status(201).json(result);
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(err.code === '23505' ? 409 : 500).json({ error: err.code === '23505' ? 'You already have a pending request' : 'Could not save request' });
    } finally { client.release(); }
  });
  app.put('/api/permission-requests/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
    const { status } = req.body || {};
    if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'Choose approve or reject' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const request = (await client.query('SELECT * FROM permission_requests WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
      if (!request || request.status !== 'pending') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Request is no longer pending' }); }
      const target = (await client.query('SELECT role,is_active FROM users WHERE id=$1 FOR UPDATE',[request.user_id])).rows[0];
      if (status === 'approved' && (!target?.is_active || target.role === 'admin' || request.user_id === req.user!.id)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot change an administrator, inactive account, or your own permissions through this queue' }); }
      if (status === 'approved') await client.query('UPDATE users SET role=$1 WHERE id=$2',[request.requested_role,request.user_id]);
      await client.query('UPDATE permission_requests SET status=$1,reviewed_by=$2,reviewed_at=NOW() WHERE id=$3',[status,req.user!.id,request.id]);
      await client.query("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,'update','user',$3,$4)",[req.user!.id,req.user!.email,request.user_id,JSON.stringify({ permission_request: request.id, status, previous_role: target?.role, requested_role: request.requested_role })]);
      await client.query('COMMIT'); res.json({ success: true });
    } catch { await client.query('ROLLBACK'); res.status(500).json({ error: 'Could not review request' }); } finally { client.release(); }
  });
}
