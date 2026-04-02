import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import db from './db';
import { generateToken, authMiddleware, AuthRequest, requireRole } from './auth';
import aiRouter from './ai/chat';
import { startScheduler } from './scheduler';

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists (use UPLOADS_PATH env var for persistent disk on Render)
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// ============ AUDIT LOGGING ============

function logAudit(userId: number | undefined, userEmail: string | undefined, action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    db.prepare(`
      INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId || null, userEmail || null, action, entityType, entityId || null, changes ? JSON.stringify(changes) : null);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ============ AUTH ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
    const user = stmt.get(email) as any;

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    logAudit(user.id, user.email, 'login', 'user', user.id);

    const token = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const existing = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
    if (existing.count > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)');
    stmt.run(email, hashedPassword, name, 'admin');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Setup failed' });
  }
});

// ============ USER MANAGEMENT (Admin-only) ============

// Get all users
app.get('/api/users', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
  try {
    const users = db.prepare('SELECT id, email, name, role, department, is_active, created_at, last_login FROM users ORDER BY created_at DESC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user (admin only)
app.post('/api/users', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const { email, name, role, department } = req.body;

    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Email, name, and role are required' });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const stmt = db.prepare('INSERT INTO users (email, password, name, role, department, last_password_change) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    const result = stmt.run(email, hashedPassword, name, role, department || null);

    logAudit(req.user?.id, req.user?.email, 'create', 'user', result.lastInsertRowid as number, { email, name, role, department });

    res.json({
      id: result.lastInsertRowid,
      email,
      name,
      role,
      department,
      tempPassword // Return temp password only on creation
    });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only, or self for profile fields)
app.put('/api/users/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, role, department, is_active } = req.body;
    const isSelf = req.user?.id === userId;
    const isAdmin = req.user?.role === 'admin';

    // Only admin can update other users or change role
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Only admin can change role or is_active
    if ((role || is_active !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can change role or active status' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (email && isAdmin) { updates.push('email = ?'); params.push(email); }
    if (role && isAdmin) { updates.push('role = ?'); params.push(role); }
    if (department !== undefined) { updates.push('department = ?'); params.push(department); }
    if (is_active !== undefined && isAdmin) { updates.push('is_active = ?'); params.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(userId);
    const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);

    logAudit(req.user?.id, req.user?.email, 'update', 'user', userId, { name, email, role, department, is_active });

    const updated = db.prepare('SELECT id, email, name, role, department, is_active, created_at, last_login FROM users WHERE id = ?').get(userId);
    res.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset user password (admin only)
app.put('/api/users/:id/reset-password', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Generate new temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const stmt = db.prepare('UPDATE users SET password = ?, last_password_change = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(hashedPassword, userId);

    logAudit(req.user?.id, req.user?.email, 'update', 'user', userId, { action: 'password_reset' });

    res.json({ tempPassword });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Change own password
app.put('/api/auth/password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify old password
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, last_password_change = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, req.user!.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'user', req.user!.id, { action: 'password_change' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Delete/deactivate user (admin only)
app.delete('/api/users/:id', authMiddleware, requireRole('admin'), (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent deleting yourself
    if (req.user?.id === userId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Soft delete - just deactivate
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
    logAudit(req.user?.id, req.user?.email, 'delete', 'user', userId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// ============ DASHBOARD ============

app.get('/api/dashboard', authMiddleware, (req: AuthRequest, res) => {
  try {
    const stats: any = {};

    // Basic counts
    stats.properties = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
    stats.propertiesLet = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE status = 'let'").get() as any).c;
    stats.landlords = (db.prepare('SELECT COUNT(*) as c FROM landlords').get() as any).c;
    stats.tenants = (db.prepare('SELECT COUNT(*) as c FROM tenants').get() as any).c;
    stats.activeTenancies = (db.prepare("SELECT COUNT(*) as c FROM tenancies WHERE status = 'active'").get() as any).c;
    stats.openMaintenance = (db.prepare("SELECT COUNT(*) as c FROM maintenance WHERE status IN ('open', 'in_progress')").get() as any).c;

    // BDM Pipeline counts
    stats.bdmProspects = (db.prepare("SELECT COUNT(*) as c FROM landlords_bdm WHERE status NOT IN ('onboarded', 'not_interested')").get() as any).c;
    stats.bdmNew = (db.prepare("SELECT COUNT(*) as c FROM landlords_bdm WHERE status = 'new'").get() as any).c;
    stats.bdmContacted = (db.prepare("SELECT COUNT(*) as c FROM landlords_bdm WHERE status = 'contacted'").get() as any).c;
    stats.bdmInterested = (db.prepare("SELECT COUNT(*) as c FROM landlords_bdm WHERE status = 'interested'").get() as any).c;

    // Enquiries pipeline counts
    stats.enquiries = (db.prepare("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status NOT IN ('rejected', 'converted')").get() as any).c;
    stats.enquiriesNew = (db.prepare("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'new'").get() as any).c;
    stats.enquiriesViewing = (db.prepare("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'viewing_booked'").get() as any).c;
    stats.enquiriesOnboarding = (db.prepare("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'onboarding'").get() as any).c;

    // Monthly income
    const incomeResult = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE type = 'payment' AND date >= date('now', 'start of month')
    `).get() as any;
    stats.monthlyIncome = incomeResult.total;

    // Outstanding rent (pending rent payments)
    const outstandingResult = db.prepare(`
      SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) as total 
      FROM rent_payments WHERE status IN ('pending', 'partial')
    `).get() as any;
    stats.outstandingRent = outstandingResult.total;

    // Tasks counts
    const today = new Date().toISOString().split('T')[0];
    stats.tasksOverdue = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date < date('now')").get() as any).c;
    stats.tasksDueToday = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date = date('now')").get() as any).c;
    stats.tasksUpcoming = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date > date('now') AND due_date <= date('now', '+7 days')").get() as any).c;

    // Compliance alerts (detailed)
    stats.complianceAlerts = db.prepare(`
      SELECT id as property_id, address, 
        CASE 
          WHEN eicr_expiry_date IS NOT NULL AND eicr_expiry_date < date('now') THEN 'EICR'
          WHEN eicr_expiry_date IS NOT NULL AND eicr_expiry_date <= date('now', '+14 days') THEN 'EICR'
          WHEN epc_expiry_date IS NOT NULL AND epc_expiry_date < date('now') THEN 'EPC'
          WHEN epc_expiry_date IS NOT NULL AND epc_expiry_date <= date('now', '+14 days') THEN 'EPC'
          WHEN has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date < date('now') THEN 'Gas Safety'
          WHEN has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date <= date('now', '+14 days') THEN 'Gas Safety'
          ELSE 'Unknown'
        END as type,
        COALESCE(
          CASE 
            WHEN eicr_expiry_date IS NOT NULL AND eicr_expiry_date <= date('now', '+14 days') THEN eicr_expiry_date
            WHEN epc_expiry_date IS NOT NULL AND epc_expiry_date <= date('now', '+14 days') THEN epc_expiry_date
            WHEN has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date <= date('now', '+14 days') THEN gas_safety_expiry_date
          END, ''
        ) as expiry_date,
        CASE 
          WHEN eicr_expiry_date IS NOT NULL AND eicr_expiry_date < date('now') THEN 'expired'
          WHEN epc_expiry_date IS NOT NULL AND epc_expiry_date < date('now') THEN 'expired'
          WHEN has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date < date('now') THEN 'expired'
          ELSE 'expiring'
        END as status
      FROM properties WHERE 
        (eicr_expiry_date IS NOT NULL AND eicr_expiry_date <= date('now', '+14 days')) OR
        (epc_expiry_date IS NOT NULL AND epc_expiry_date <= date('now', '+14 days')) OR
        (has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date <= date('now', '+14 days'))
      ORDER BY 
        CASE 
          WHEN eicr_expiry_date < date('now') OR epc_expiry_date < date('now') OR gas_safety_expiry_date < date('now') THEN 0
          ELSE 1
        END,
        COALESCE(eicr_expiry_date, epc_expiry_date, gas_safety_expiry_date)
      LIMIT 10
    `).all();

    // Recent maintenance
    stats.recentMaintenance = db.prepare(`
      SELECT m.*, p.address FROM maintenance m
      JOIN properties p ON p.id = m.property_id
      WHERE m.status IN ('open', 'in_progress')
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               m.created_at DESC LIMIT 5
    `).all();

    // Recent tasks
    stats.recentTasks = db.prepare(`
      SELECT t.id, t.title, t.priority, t.due_date, 
        COALESCE(t.entity_type || ' #' || t.entity_id, '') as related_to
      FROM tasks t
      WHERE t.status IN ('pending', 'in_progress')
      ORDER BY 
        CASE WHEN t.due_date < date('now') THEN 0 ELSE 1 END,
        t.due_date NULLS LAST,
        CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
      LIMIT 5
    `).all();

    logAudit(req.user?.id, req.user?.email, 'view', 'dashboard');
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============ LANDLORDS ============

app.get('/api/landlords', authMiddleware, (req: AuthRequest, res) => {
  try {
    const landlords = db.prepare(`
      SELECT l.*, 
        (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l ORDER BY l.name
    `).all();
    res.json(landlords);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlords' });
  }
});

app.post('/api/landlords', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, alt_email, date_of_birth, home_address,
      marketing_post, marketing_email, marketing_phone, marketing_sms,
      kyc_completed, notes, landlord_type } = req.body;

    // Duplicate check
    if (email || phone) {
      const existing = db.prepare('SELECT id FROM landlords WHERE email = ? OR phone = ?').get(email, phone);
      if (existing) return res.status(400).json({ error: 'Duplicate email or phone number' });
    }

    const stmt = db.prepare(`
      INSERT INTO landlords (name, email, phone, alt_email, date_of_birth, home_address,
        marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, notes, landlord_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email || null, phone || null, alt_email || null, date_of_birth || null,
      home_address || null, marketing_post ? 1 : 0, marketing_email ? 1 : 0, marketing_phone ? 1 : 0,
      marketing_sms ? 1 : 0, kyc_completed ? 1 : 0, notes || null, landlord_type || 'external');

    logAudit(req.user?.id, req.user?.email, 'create', 'landlord', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create landlord' });
  }
});

// Check for duplicate landlords (must be before /:id route)
app.get('/api/landlords/check-duplicates', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { email, phone, exclude_id } = req.query;
    const results: any[] = [];

    if (email) {
      // Check landlords
      const landlordByEmail = db.prepare(
        'SELECT id, name, email, phone FROM landlords WHERE email = ? AND id != ?'
      ).all(email, exclude_id || 0) as any[];
      landlordByEmail.forEach(l => results.push({ ...l, source: 'landlords', match_type: 'email' }));

      // Check tenants
      const tenantByEmail = db.prepare(
        'SELECT id, name, email, phone FROM tenants WHERE email = ? OR email_2 = ?'
      ).all(email, email) as any[];
      tenantByEmail.forEach(t => results.push({ ...t, source: 'tenants', match_type: 'email' }));

      // Check enquiries
      const enqByEmail = db.prepare(
        'SELECT id, first_name_1, last_name_1, email_1 as email, phone_1 as phone FROM tenant_enquiries WHERE email_1 = ? OR email_2 = ?'
      ).all(email, email) as any[];
      enqByEmail.forEach(e => results.push({
        ...e,
        name: `${e.first_name_1} ${e.last_name_1}`,
        source: 'tenant_enquiries',
        match_type: 'email'
      }));
    }

    if (phone) {
      const landlordByPhone = db.prepare(
        'SELECT id, name, email, phone FROM landlords WHERE phone = ? AND id != ?'
      ).all(phone, exclude_id || 0) as any[];
      landlordByPhone.forEach(l => {
        if (!results.find(r => r.source === 'landlords' && r.id === l.id)) {
          results.push({ ...l, source: 'landlords', match_type: 'phone' });
        }
      });

      const tenantByPhone = db.prepare(
        'SELECT id, name, email, phone FROM tenants WHERE phone = ? OR phone_2 = ?'
      ).all(phone, phone) as any[];
      tenantByPhone.forEach(t => {
        if (!results.find(r => r.source === 'tenants' && r.id === t.id)) {
          results.push({ ...t, source: 'tenants', match_type: 'phone' });
        }
      });

      const enqByPhone = db.prepare(
        'SELECT id, first_name_1, last_name_1, email_1 as email, phone_1 as phone FROM tenant_enquiries WHERE phone_1 = ? OR phone_2 = ?'
      ).all(phone, phone) as any[];
      enqByPhone.forEach(e => {
        if (!results.find(r => r.source === 'tenant_enquiries' && r.id === e.id)) {
          results.push({
            ...e,
            name: `${e.first_name_1} ${e.last_name_1}`,
            source: 'tenant_enquiries',
            match_type: 'phone'
          });
        }
      });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

app.get('/api/landlords/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const landlord = db.prepare(`
      SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l WHERE l.id = ?
    `).get(req.params.id);
    if (!landlord) return res.status(404).json({ error: 'Landlord not found' });

    logAudit(req.user?.id, req.user?.email, 'view', 'landlord', parseInt(req.params.id));
    res.json(landlord);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlord' });
  }
});

app.put('/api/landlords/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, alt_email, date_of_birth, home_address, company_number,
      marketing_post, marketing_email, marketing_phone, marketing_sms,
      kyc_completed, notes, landlord_type, referral_source } = req.body;

    db.prepare(`
      UPDATE landlords SET name=?, email=?, phone=?, alt_email=?, date_of_birth=?, home_address=?, company_number=?,
        marketing_post=?, marketing_email=?, marketing_phone=?, marketing_sms=?,
        kyc_completed=?, notes=?, landlord_type=?, referral_source=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(name, email, phone, alt_email, date_of_birth, home_address, company_number || null,
      marketing_post ? 1 : 0, marketing_email ? 1 : 0, marketing_phone ? 1 : 0, marketing_sms ? 1 : 0,
      kyc_completed ? 1 : 0, notes, landlord_type || 'external', referral_source || null, req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'landlord', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update landlord' });
  }
});

app.delete('/api/landlords/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    db.prepare('UPDATE properties SET landlord_id = NULL WHERE landlord_id = ?').run(req.params.id);
    db.prepare('DELETE FROM landlords WHERE id = ?').run(req.params.id);
    logAudit(req.user?.id, req.user?.email, 'delete', 'landlord', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete landlord' }); }
});

app.post('/api/landlords/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    // Unlink properties instead of deleting them (to avoid cascade issues)
    db.prepare(`UPDATE properties SET landlord_id = NULL WHERE landlord_id IN (${placeholders})`).run(...ids);
    // Then delete landlords
    db.prepare(`DELETE FROM landlords WHERE id IN (${placeholders})`).run(...ids);

    for (const id of ids) {
      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'landlord', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete landlords' });
  }
});

// ============ DIRECTORS ============

// Get all directors (for search functionality)
app.get('/api/directors', authMiddleware, (req: AuthRequest, res) => {
  try {
    const directors = db.prepare('SELECT * FROM directors ORDER BY name').all();
    res.json(directors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch directors' });
  }
});

// Get all directors for a landlord
app.get('/api/landlords/:landlordId/directors', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { archived } = req.query;
    const archivedFilter = archived === 'true' ? 1 : 0;
    const directors = db.prepare('SELECT * FROM directors WHERE landlord_id = ? AND archived = ? ORDER BY created_at DESC').all(req.params.landlordId, archivedFilter);
    res.json(directors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch directors' });
  }
});

// Create a director
app.post('/api/landlords/:landlordId/directors', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, date_of_birth, role, kyc_completed, notes } = req.body;
    const stmt = db.prepare(`
      INSERT INTO directors (landlord_id, name, email, phone, date_of_birth, role, kyc_completed, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.params.landlordId,
      name,
      email || null,
      phone || null,
      date_of_birth || null,
      role || null,
      kyc_completed ? 1 : 0,
      notes || null
    );
    logAudit(req.user?.id, req.user?.email, 'create', 'director', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create director' });
  }
});

// Update a director
app.put('/api/directors/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, date_of_birth, role, kyc_completed, notes } = req.body;
    db.prepare(`
      UPDATE directors SET name=?, email=?, phone=?, date_of_birth=?, role=?, kyc_completed=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name, email || null, phone || null, date_of_birth || null, role || null, kyc_completed ? 1 : 0, notes || null, req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'director', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update director' });
  }
});

// Delete a director
app.delete('/api/directors/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    // Archive instead of delete
    db.prepare('UPDATE directors SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    logAudit(req.user?.id, req.user?.email, 'archive', 'director', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to archive director' });
  }
});

// Reinstate an archived director
app.post('/api/directors/:id/reinstate', authMiddleware, (req: AuthRequest, res) => {
  try {
    db.prepare('UPDATE directors SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    logAudit(req.user?.id, req.user?.email, 'reinstate', 'director', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reinstate director' });
  }
});

// Get all properties for a landlord (via junction table)
app.get('/api/landlords/:landlordId/properties', authMiddleware, (req: AuthRequest, res) => {
  try {
    const properties = db.prepare(`
      SELECT p.*, pl.is_primary, pl.ownership_percentage, pl.ownership_entity_type
      FROM properties p
      INNER JOIN property_landlords pl ON p.id = pl.property_id
      WHERE pl.landlord_id = ?
      ORDER BY pl.is_primary DESC, p.address ASC
    `).all(req.params.landlordId);
    res.json(properties);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Get companies where a landlord is a director (by matching name)
app.get('/api/landlords/:landlordId/director-of', authMiddleware, (req: AuthRequest, res) => {
  try {
    const landlord = db.prepare('SELECT name FROM landlords WHERE id = ?').get(req.params.landlordId) as { name: string } | undefined;
    if (!landlord) {
      return res.json([]);
    }

    // Find all companies where this landlord's name matches a director's name
    const companies = db.prepare(`
      SELECT l.id, l.name, l.email, l.phone, d.role, d.id as director_id
      FROM directors d
      JOIN landlords l ON d.landlord_id = l.id
      WHERE d.name = ?
      ORDER BY l.name
    `).all(landlord.name);

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch director relationships' });
  }
});

// ============ PROPERTY LANDLORDS (Many-to-Many) ============

// Get all landlords for a property
app.get('/api/properties/:propertyId/landlords', authMiddleware, (req: AuthRequest, res) => {
  try {
    const landlords = db.prepare(`
      SELECT l.*, pl.is_primary, pl.ownership_percentage, pl.ownership_entity_type, pl.id as link_id
      FROM property_landlords pl
      JOIN landlords l ON pl.landlord_id = l.id
      WHERE pl.property_id = ?
      ORDER BY pl.is_primary DESC, l.name
    `).all(req.params.propertyId);
    res.json(landlords);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property landlords' });
  }
});

// Add landlord to property
app.post('/api/properties/:propertyId/landlords', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { landlord_id, is_primary, ownership_percentage, ownership_entity_type } = req.body;

    // If setting as primary, unset other primary landlords
    if (is_primary) {
      db.prepare('UPDATE property_landlords SET is_primary = 0 WHERE property_id = ?').run(req.params.propertyId);
    }

    const stmt = db.prepare(`
      INSERT INTO property_landlords (property_id, landlord_id, is_primary, ownership_percentage, ownership_entity_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.params.propertyId,
      landlord_id,
      is_primary ? 1 : 0,
      ownership_percentage || null,
      ownership_entity_type || 'individual'
    );

    logAudit(req.user?.id, req.user?.email, 'create', 'property_landlord', result.lastInsertRowid as number, { property_id: req.params.propertyId, landlord_id });
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'This landlord is already linked to this property' });
    } else {
      res.status(500).json({ error: 'Failed to add landlord to property' });
    }
  }
});

// Update property landlord link (e.g., change primary status)
app.put('/api/property-landlords/:linkId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { is_primary, ownership_percentage, ownership_entity_type } = req.body;
    const link = db.prepare('SELECT * FROM property_landlords WHERE id = ?').get(req.params.linkId) as any;

    if (!link) return res.status(404).json({ error: 'Link not found' });

    // If setting as primary, unset other primary landlords for this property
    if (is_primary) {
      db.prepare('UPDATE property_landlords SET is_primary = 0 WHERE property_id = ?').run(link.property_id);
    }

    db.prepare(`
      UPDATE property_landlords
      SET is_primary = ?, ownership_percentage = ?, ownership_entity_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(is_primary ? 1 : 0, ownership_percentage || null, ownership_entity_type || 'individual', req.params.linkId);

    logAudit(req.user?.id, req.user?.email, 'update', 'property_landlord', parseInt(req.params.linkId), { is_primary, ownership_percentage, ownership_entity_type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property landlord link' });
  }
});

// Remove landlord from property
app.delete('/api/property-landlords/:linkId', authMiddleware, (req: AuthRequest, res) => {
  try {
    db.prepare('DELETE FROM property_landlords WHERE id = ?').run(req.params.linkId);
    logAudit(req.user?.id, req.user?.email, 'delete', 'property_landlord', parseInt(req.params.linkId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove landlord from property' });
  }
});

// ============ LANDLORDS BDM ============

app.get('/api/landlords-bdm', authMiddleware, (req: AuthRequest, res) => {
  try {
    const prospects = db.prepare(`
      SELECT * FROM landlords_bdm ORDER BY 
        CASE status WHEN 'follow_up' THEN 1 WHEN 'new' THEN 2 WHEN 'contacted' THEN 3 WHEN 'interested' THEN 4 ELSE 5 END,
        follow_up_date NULLS LAST
    `).all();
    res.json(prospects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlords BDM' });
  }
});

app.post('/api/landlords-bdm', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, address, status, follow_up_date, source, notes } = req.body;

    // Duplicate check
    if (email || phone) {
      const existing = db.prepare('SELECT id FROM landlords_bdm WHERE email = ? OR phone = ?').get(email, phone);
      if (existing) return res.status(400).json({ error: 'Duplicate email or phone number' });
    }

    const stmt = db.prepare(`
      INSERT INTO landlords_bdm (name, email, phone, address, status, follow_up_date, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email || null, phone || null, address || null,
      status || 'new', follow_up_date || null, source || null, notes || null);

    logAudit(req.user?.id, req.user?.email, 'create', 'landlord_bdm', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create landlord BDM' });
  }
});

app.get('/api/landlords-bdm/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM landlords_bdm WHERE id = ?').get(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    logAudit(req.user?.id, req.user?.email, 'view', 'landlord_bdm', parseInt(req.params.id));
    res.json(prospect);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prospect' });
  }
});

app.put('/api/landlords-bdm/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, address, status, follow_up_date, source, notes } = req.body;

    db.prepare(`
      UPDATE landlords_bdm SET name=?, email=?, phone=?, address=?, status=?, 
        follow_up_date=?, source=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(name, email, phone, address, status, follow_up_date, source, notes, req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'landlord_bdm', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prospect' });
  }
});

// Convert BDM to Landlord
app.post('/api/landlords-bdm/:id/convert', authMiddleware, (req: AuthRequest, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM landlords_bdm WHERE id = ?').get(req.params.id) as any;
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const { landlord_type } = req.body || {};

    // Create landlord
    const result = db.prepare(`
      INSERT INTO landlords (name, email, phone, home_address, notes, landlord_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(prospect.name, prospect.email, prospect.phone, prospect.address, prospect.notes, landlord_type || 'external');

    // Update BDM status
    db.prepare("UPDATE landlords_bdm SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'landlord_bdm', parseInt(req.params.id), { converted_to: result.lastInsertRowid });
    res.json({ landlord_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert prospect' });
  }
});

app.post('/api/landlords-bdm/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM landlords_bdm WHERE id IN (${placeholders})`).run(...ids);

    for (const id of ids) {
      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'landlord_bdm', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete landlords BDM' });
  }
});

// ============ TENANT ENQUIRIES ============

// PUBLIC ENDPOINT - Get available properties for tenant enquiry form
app.get('/api/public/properties', (req, res) => {
  try {
    const properties = db.prepare(`
      SELECT id, address, postcode, property_type, bedrooms, rent_amount, status
      FROM properties
      WHERE status IN ('to_let', 'available')
      ORDER BY address
    `).all();
    res.json(properties);
  } catch (err) {
    console.error('Error fetching public properties:', err);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// ============ PUBLIC APPLICATION FORM (DocuSign-lite) ============

app.get('/api/public/application-form/:token', (req, res) => {
  try {
    const enquiry = db.prepare(`
      SELECT te.*, p.address as property_address, p.postcode as property_postcode, p.rent_amount
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      WHERE te.application_form_token = ?
    `).get(req.params.token) as any;
    if (!enquiry) return res.status(404).json({ error: 'Form not found or link expired' });
    if (enquiry.application_form_completed) return res.status(410).json({ error: 'This form has already been submitted', completed: true });
    res.json({
      first_name_1: enquiry.first_name_1, last_name_1: enquiry.last_name_1,
      email_1: enquiry.email_1, phone_1: enquiry.phone_1, date_of_birth_1: enquiry.date_of_birth_1,
      current_address_1: enquiry.current_address_1,
      is_joint_application: enquiry.is_joint_application,
      first_name_2: enquiry.first_name_2, last_name_2: enquiry.last_name_2,
      email_2: enquiry.email_2, phone_2: enquiry.phone_2,
      property_address: enquiry.property_address, property_postcode: enquiry.property_postcode,
      monthly_rent_agreed: enquiry.monthly_rent_agreed, holding_deposit_amount: enquiry.holding_deposit_amount,
      security_deposit_amount: enquiry.security_deposit_amount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load form' });
  }
});

app.post('/api/public/application-form/:token', (req, res) => {
  try {
    const enquiry = db.prepare('SELECT id, application_form_completed FROM tenant_enquiries WHERE application_form_token = ?').get(req.params.token) as any;
    if (!enquiry) return res.status(404).json({ error: 'Form not found' });
    if (enquiry.application_form_completed) return res.status(410).json({ error: 'Already submitted' });

    const d = req.body;
    db.prepare(`
      UPDATE tenant_enquiries SET
        app_ni_number=?, app_previous_address_1=?, app_previous_address_2=?,
        app_years_at_current=?, app_years_at_previous=?,
        app_landlord_ref_name=?, app_landlord_ref_phone=?, app_landlord_ref_email=?,
        app_employer_ref_name=?, app_employer_ref_phone=?, app_employer_ref_email=?,
        app_bank_name=?, app_bank_sort_code=?, app_bank_account_number=?,
        app_next_of_kin_name=?, app_next_of_kin_phone=?, app_next_of_kin_relationship=?,
        app_signature=?, app_signed_at=CURRENT_TIMESTAMP, app_declaration_agreed=?,
        application_form_completed=1,
        current_address_1=COALESCE(?, current_address_1),
        date_of_birth_1=COALESCE(?, date_of_birth_1),
        employer_1=COALESCE(?, employer_1),
        income_1=COALESCE(?, income_1),
        employment_status_1=COALESCE(?, employment_status_1)
      WHERE application_form_token=?
    `).run(
      d.app_ni_number || null, d.app_previous_address_1 || null, d.app_previous_address_2 || null,
      d.app_years_at_current || null, d.app_years_at_previous || null,
      d.app_landlord_ref_name || null, d.app_landlord_ref_phone || null, d.app_landlord_ref_email || null,
      d.app_employer_ref_name || null, d.app_employer_ref_phone || null, d.app_employer_ref_email || null,
      d.app_bank_name || null, d.app_bank_sort_code || null, d.app_bank_account_number || null,
      d.app_next_of_kin_name || null, d.app_next_of_kin_phone || null, d.app_next_of_kin_relationship || null,
      d.app_signature || null, d.app_declaration_agreed ? 1 : 0,
      d.current_address_1 || null, d.date_of_birth_1 || null, d.employer_1 || null,
      d.income_1 || null, d.employment_status_1 || null, req.params.token,
    );

    logAudit(null, 'tenant-self-service', 'update', 'tenant_enquiry', enquiry.id, { action: 'application_form_completed' });
    res.json({ success: true, message: 'Application submitted successfully' });
  } catch (err) {
    console.error('Error submitting application form:', err);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// PUBLIC ENDPOINT - No authentication required
// This endpoint receives submissions from the Fleming Lettings public landlord enquiry form
app.post('/api/public/landlord-enquiries', async (req, res) => {
  try {
    const {
      // Registration type
      registration_type,
      // Applicant 1
      firstName,
      surname,
      address,
      postcode,
      yearsAtAddress,
      dob,
      nationality,
      email,
      phone,
      // Applicant 2 (if joint)
      firstName2,
      surname2,
      address2,
      postcode2,
      yearsAtAddress2,
      dob2,
      nationality2,
      email2,
      phone2,
      // Property details
      propertyAddress,
      propertyPostcode,
      bedrooms,
      offroadParking,
      alreadyLet,
      mortgageAttached,
      // If already let
      tenancyType,
      currentManagement,
      lengthOfLet,
      monthlyRentalIncome,
      consideringRentIncrease,
      newRentAmount,
      // Property info
      ownershipStructure,
      propertyCondition,
      lookingForNewTenant,
      newTenantReason,
      // Compliance
      epcCertificate,
      eicrCertificate,
      gasCertificate,
      // Additional
      additionalNotes,
      marketingConsent
    } = req.body;

    // Validation
    if (!firstName || !surname || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: First Name, Surname, Email, and Phone are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    // Check for duplicate submissions (within last 24 hours)
    const recentSubmission = db.prepare(`
      SELECT id FROM landlords_bdm
      WHERE email = ?
      AND created_at > datetime('now', '-24 hours')
      LIMIT 1
    `).get(email);

    if (recentSubmission) {
      return res.status(409).json({
        success: false,
        error: 'A recent enquiry with this email already exists. Please contact us if you need to update your details.'
      });
    }

    // Determine if joint application
    const is_joint = registration_type === 'Joint' ? 1 : 0;

    // Build comprehensive notes field
    let notes = '';

    // Personal details
    notes += `=== LANDLORD DETAILS ===\n`;
    notes += `Registration Type: ${registration_type}\n`;
    notes += `Name: ${firstName} ${surname}\n`;
    notes += `Address: ${address}, ${postcode}\n`;
    notes += `Years at Address: ${yearsAtAddress}\n`;
    notes += `Date of Birth: ${dob}\n`;
    notes += `Nationality: ${nationality}\n`;
    notes += `Contact: ${email} | ${phone}\n\n`;

    if (is_joint) {
      notes += `=== JOINT APPLICANT ===\n`;
      notes += `Name: ${firstName2} ${surname2}\n`;
      notes += `Address: ${address2}, ${postcode2}\n`;
      notes += `Years at Address: ${yearsAtAddress2}\n`;
      notes += `Date of Birth: ${dob2}\n`;
      notes += `Nationality: ${nationality2}\n`;
      notes += `Contact: ${email2} | ${phone2}\n\n`;
    }

    // Property details
    notes += `=== PROPERTY DETAILS ===\n`;
    notes += `Address: ${propertyAddress}, ${propertyPostcode}\n`;
    notes += `Bedrooms: ${bedrooms}\n`;
    notes += `Offroad Parking: ${offroadParking}\n`;
    notes += `Already Let: ${alreadyLet}\n`;
    notes += `Mortgage Attached: ${mortgageAttached}\n`;
    notes += `Ownership Structure: ${ownershipStructure}\n`;
    notes += `Property Condition: ${propertyCondition}\n\n`;

    if (alreadyLet === 'Yes') {
      notes += `=== CURRENT TENANCY ===\n`;
      notes += `Tenancy Type: ${tenancyType}\n`;
      notes += `Current Management: ${currentManagement}\n`;
      notes += `Length of Let: ${lengthOfLet} months\n`;
      notes += `Monthly Rental Income: £${monthlyRentalIncome}\n`;
      notes += `Considering Rent Increase: ${consideringRentIncrease}\n`;
      if (consideringRentIncrease === 'Yes' && newRentAmount) {
        notes += `New Rent Amount: £${newRentAmount}\n`;
      }
      notes += `\n`;
    }

    notes += `=== TENANT SOURCING ===\n`;
    notes += `Looking for New Tenant: ${lookingForNewTenant}\n`;
    if (lookingForNewTenant === 'Yes' && newTenantReason) {
      notes += `Reason: ${newTenantReason}\n`;
    }
    notes += `\n`;

    notes += `=== COMPLIANCE CERTIFICATES ===\n`;
    notes += `EPC: ${epcCertificate}\n`;
    notes += `EICR: ${eicrCertificate}\n`;
    notes += `Gas Safety: ${gasCertificate}\n\n`;

    if (additionalNotes) {
      notes += `=== ADDITIONAL NOTES ===\n`;
      notes += `${additionalNotes}\n\n`;
    }

    notes += `=== MARKETING ===\n`;
    notes += `Marketing Consent: ${marketingConsent === 'on' ? 'Yes' : 'No'}\n`;

    // Get client IP for audit
    const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    notes += `\nForm submitted from IP: ${client_ip}\n`;
    notes += `Submission date: ${new Date().toISOString()}\n`;

    // Insert into landlords_bdm table
    const result = db.prepare(`
      INSERT INTO landlords_bdm (
        name, email, phone, address, status, source, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      `${firstName} ${surname}`,
      email,
      phone,
      `${address}, ${postcode}`,
      'new',
      'Website Enquiry Form',
      notes
    );

    console.log(`[LANDLORD ENQUIRY] New submission from ${firstName} ${surname} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Landlord enquiry submitted successfully',
      enquiry_id: result.lastInsertRowid
    });

  } catch (error) {
    console.error('[LANDLORD ENQUIRY ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your enquiry. Please try again or contact us directly.'
    });
  }
});

// PUBLIC ENDPOINT - No authentication required
// This endpoint receives submissions from the Fleming Lettings public tenant enquiry form
app.post('/api/tenant-enquiries/public', async (req, res) => {
  try {
    const {
      // Registration type
      registration_type,
      // Applicant 1
      FirstName,
      Surname,
      address,
      Postcode,
      yearofaddress,
      dob,
      form_email,
      contactNumber,
      Nationality,
      // Employment
      EmploymentStatus,
      job_title,
      AnnualSalary,
      // Applicant 2 (if joint)
      FirstName2,
      Surname2,
      address2,
      Postcode2,
      yearofaddress2,
      dob2,
      form_email2,
      contactNumber2,
      Nationality2,
      EmploymentStatus2,
      job_title2,
      AnnualSalary2,
      // Property requirements
      tenancylookingfor,
      reasonforrenting,
      typeofproperty,
      noofbedrooms,
      roadparking,
      rent_min,
      rent_max,
      // Property selection
      property_id
    } = req.body;

    // Validation
    if (!FirstName || !Surname || !form_email || !contactNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: First Name, Surname, Email, and Contact Number are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
    }

    // Check for duplicate submissions (within last 24 hours)
    const recentSubmission = db.prepare(`
      SELECT id FROM tenant_enquiries
      WHERE email_1 = ?
      AND created_at > datetime('now', '-24 hours')
      LIMIT 1
    `).get(form_email);

    if (recentSubmission) {
      return res.status(409).json({
        success: false,
        error: 'A recent enquiry with this email already exists. Please contact us if you need to update your details.'
      });
    }

    // Determine if joint application
    const is_joint = registration_type === 'Joint' ? 1 : 0;

    // Get client IP for audit
    const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Insert into database
    const result = db.prepare(`
      INSERT INTO tenant_enquiries (
        first_name_1, last_name_1, email_1, phone_1, current_address_1, postcode_1,
        years_at_address_1, date_of_birth_1, nationality_1, employment_status_1,
        job_title_1, annual_salary_1, income_1,
        is_joint_application,
        first_name_2, last_name_2, email_2, phone_2, current_address_2, postcode_2,
        years_at_address_2, date_of_birth_2, nationality_2, employment_status_2,
        job_title_2, annual_salary_2, income_2,
        preferred_tenancy_type, reason_for_renting, property_type, bedrooms,
        parking_required, monthly_rent_budget,
        linked_property_id, form_submission_ip, form_version, status, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
      )
    `).run(
      // Applicant 1
      FirstName,
      Surname,
      form_email,
      contactNumber,
      address || null,
      Postcode || null,
      yearofaddress || null,
      dob || null,
      Nationality || null,
      EmploymentStatus || null,
      job_title || null,
      AnnualSalary ? parseFloat(AnnualSalary) : null,
      AnnualSalary ? parseFloat(AnnualSalary) : null, // income_1 (same as annual_salary)
      // Joint
      is_joint,
      // Applicant 2
      FirstName2 || null,
      Surname2 || null,
      form_email2 || null,
      contactNumber2 || null,
      address2 || null,
      Postcode2 || null,
      yearofaddress2 || null,
      dob2 || null,
      Nationality2 || null,
      EmploymentStatus2 || null,
      job_title2 || null,
      AnnualSalary2 ? parseFloat(AnnualSalary2) : null,
      AnnualSalary2 ? parseFloat(AnnualSalary2) : null, // income_2
      // Property requirements
      tenancylookingfor || null,
      reasonforrenting || null,
      typeofproperty || null,
      noofbedrooms ? parseInt(noofbedrooms) : null,
      roadparking || null,
      rent_max ? parseFloat(rent_max) : null,
      // Property linking
      property_id ? parseInt(property_id) : null,
      // Metadata
      client_ip,
      'v1',
      'new'
    );

    const enquiryId = result.lastInsertRowid;

    // Log audit
    logAudit(undefined, 'public_form', 'create', 'tenant_enquiry', Number(enquiryId), {
      name: `${FirstName} ${Surname}`,
      email: form_email,
      is_joint
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Thank you! Your enquiry has been received. We will be in touch shortly.',
      enquiry_id: enquiryId,
      reference: `ENQ-${enquiryId}`
    });

  } catch (error: any) {
    console.error('Error creating tenant enquiry:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while submitting your enquiry. Please try again or contact us directly.'
    });
  }
});

app.get('/api/tenant-enquiries', authMiddleware, (req: AuthRequest, res) => {
  try {
    const enquiries = db.prepare(`
      SELECT te.*, p.address as property_address, l.landlord_type FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      ORDER BY 
        CASE te.status WHEN 'viewing_booked' THEN 1 WHEN 'onboarding' THEN 2 WHEN 'awaiting_response' THEN 3 WHEN 'new' THEN 4 ELSE 5 END,
        te.viewing_date NULLS LAST,
        te.follow_up_date NULLS LAST,
        te.created_at DESC
    `).all();
    res.json(enquiries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
});

app.post('/api/tenant-enquiries', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;

    // Duplicate check
    if (data.email_1 || data.phone_1) {
      const existingEnquiry = db.prepare('SELECT id FROM tenant_enquiries WHERE email_1 = ? OR phone_1 = ?').get(data.email_1, data.phone_1);
      const existingTenant = db.prepare('SELECT id FROM tenants WHERE email = ? OR phone = ?').get(data.email_1, data.phone_1);
      if (existingEnquiry || existingTenant) {
        return res.status(400).json({ error: 'Duplicate email or phone number found', existing_type: existingTenant ? 'tenant' : 'enquiry' });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO tenant_enquiries (
        title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1, current_address_1,
        employment_status_1, employer_1, income_1,
        is_joint_application, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2,
        current_address_2, employment_status_2, employer_2, income_2,
        status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.title_1, data.first_name_1, data.last_name_1, data.email_1, data.phone_1,
      data.date_of_birth_1, data.current_address_1, data.employment_status_1, data.employer_1, data.income_1,
      data.is_joint_application ? 1 : 0, data.title_2, data.first_name_2, data.last_name_2,
      data.email_2, data.phone_2, data.date_of_birth_2, data.current_address_2,
      data.employment_status_2, data.employer_2, data.income_2,
      'new', data.notes
    );

    logAudit(req.user?.id, req.user?.email, 'create', 'tenant_enquiry', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create enquiry' });
  }
});

app.get('/api/tenant-enquiries/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const enquiry = db.prepare(`
      SELECT te.*, p.address as property_address, l.landlord_type FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE te.id = ?
    `).get(req.params.id);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    logAudit(req.user?.id, req.user?.email, 'view', 'tenant_enquiry', parseInt(req.params.id));
    res.json(enquiry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiry' });
  }
});

app.put('/api/tenant-enquiries/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const enquiryId = parseInt(req.params.id);

    // Get current enquiry to check for status and onboarding field changes
    const currentEnquiry = db.prepare('SELECT * FROM tenant_enquiries WHERE id = ?').get(enquiryId) as any;
    const statusChanged = currentEnquiry && currentEnquiry.status !== data.status;

    const allowed = ['title_1','first_name_1','last_name_1','email_1','phone_1','date_of_birth_1','current_address_1','employment_status_1','employer_1','income_1','is_joint_application','title_2','first_name_2','last_name_2','email_2','phone_2','date_of_birth_2','current_address_2','employment_status_2','employer_2','income_2','kyc_completed_1','kyc_completed_2','status','follow_up_date','viewing_date','viewing_with','linked_property_id','notes','rejection_reason','renting_requirements','is_permanent_address','holding_deposit_requested','holding_deposit_received','holding_deposit_amount','holding_deposit_received_date','holding_deposit_received_amount','security_deposit_amount','monthly_rent_agreed','application_form_token','application_form_sent','application_form_completed','id_primary_verified_1','id_secondary_verified_1','id_primary_verified_2','id_secondary_verified_2','bank_statements_received','source_of_funds_verified','employment_check_completed','credit_check_completed','credit_score','credit_check_date','onboarding_step'];
    const setClauses: string[] = [];
    const values: any[] = [];
    for (const key of allowed) {
      if (key in data) {
        setClauses.push(`${key}=?`);
        values.push(data[key] ?? null);
      }
    }
    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });
    setClauses.push('updated_at=CURRENT_TIMESTAMP');
    values.push(enquiryId);
    db.prepare(`UPDATE tenant_enquiries SET ${setClauses.join(', ')} WHERE id=?`).run(...values);

    // Create tasks based on status change
    if (statusChanged) {
      const applicantName = `${data.first_name_1} ${data.last_name_1}`;

      // Follow-up task
      if (data.status === 'awaiting_response' && data.follow_up_date) {
        db.prepare(`
          INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
          VALUES (?, ?, 'pending', 'medium', 'tenant_enquiry', ?, 'follow_up', ?, ?)
        `).run(
          `Follow up with ${applicantName}`,
          `Contact tenant enquiry regarding their property search.\nEmail: ${data.email_1}\nPhone: ${data.phone_1 || 'Not provided'}`,
          enquiryId,
          data.follow_up_date,
          req.user?.name || null
        );
      }

      // Onboarding tasks
      if (data.status === 'onboarding') {
        const onboardingTasks = [
          { title: `ID Verification - ${applicantName}`, description: 'Verify photo ID (passport/driving license) for applicant 1', priority: 'high', days: 0 },
          { title: `Right to Rent Check - ${applicantName}`, description: 'Complete Right to Rent check as per UK law', priority: 'high', days: 0 },
          { title: `Reference Check - ${applicantName}`, description: 'Request and verify employment/landlord references', priority: 'high', days: 1 },
          { title: `Credit Check - ${applicantName}`, description: 'Run credit check and affordability assessment', priority: 'medium', days: 1 },
          { title: `Tenancy Agreement - ${applicantName}`, description: 'Prepare and send tenancy agreement for review', priority: 'medium', days: 3 },
        ];

        if (data.is_joint_application && data.first_name_2) {
          onboardingTasks.push(
            { title: `ID Verification - ${data.first_name_2} ${data.last_name_2}`, description: 'Verify photo ID for applicant 2', priority: 'high', days: 0 },
            { title: `Right to Rent Check - ${data.first_name_2} ${data.last_name_2}`, description: 'Complete Right to Rent check for applicant 2', priority: 'high', days: 0 }
          );
        }

        const today = new Date();
        onboardingTasks.forEach(task => {
          const dueDate = new Date(today);
          dueDate.setDate(dueDate.getDate() + task.days);
          db.prepare(`
            INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
            VALUES (?, ?, 'pending', ?, 'tenant_enquiry', ?, 'onboarding', ?, ?)
          `).run(
            task.title,
            task.description,
            task.priority,
            enquiryId,
            dueDate.toISOString().split('T')[0],
            req.user?.name || null
          );
        });
      }
    }

    // Audit logging: capture onboarding field changes with old/new values
    if (currentEnquiry) {
      const onboardingFields = ['holding_deposit_requested','holding_deposit_received','holding_deposit_amount','holding_deposit_received_date','holding_deposit_received_amount','security_deposit_amount','monthly_rent_agreed','application_form_sent','application_form_completed','id_primary_verified_1','id_secondary_verified_1','id_primary_verified_2','id_secondary_verified_2','bank_statements_received','source_of_funds_verified','employment_check_completed','credit_check_completed','credit_score','credit_check_date','onboarding_step'];
      const fieldChanges: Record<string, { from: any; to: any }> = {};
      for (const key of onboardingFields) {
        if (key in data) {
          const oldVal = currentEnquiry[key] ?? null;
          const newVal = data[key] ?? null;
          if (String(oldVal) !== String(newVal)) {
            fieldChanges[key] = { from: oldVal, to: newVal };
          }
        }
      }
      if (Object.keys(fieldChanges).length > 0) {
        if (statusChanged) {
          logAudit(req.user?.id, req.user?.email, 'status_changed', 'tenant_enquiry', enquiryId, { from: currentEnquiry.status, to: data.status });
        }
        logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, fieldChanges);
      } else {
        if (statusChanged) {
          logAudit(req.user?.id, req.user?.email, 'status_changed', 'tenant_enquiry', enquiryId, { from: currentEnquiry.status, to: data.status });
        }
        logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, data);
      }
    } else {
      logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, data);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

// Convert enquiry to tenant
// ── Duplicate check ──
app.get('/api/tenant-enquiries/check-duplicates', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { email, phone, exclude_id } = req.query;
    const results: any[] = [];

    if (email) {
      // Check tenants
      const tenantByEmail = db.prepare('SELECT id, name, email, phone, property_id FROM tenants WHERE email = ? OR email_2 = ?').all(email, email) as any[];
      tenantByEmail.forEach(t => results.push({ ...t, source: 'tenant', match: 'email' }));

      // Check landlords
      const landlordByEmail = db.prepare('SELECT id, name, email, phone FROM landlords WHERE email = ?').all(email) as any[];
      landlordByEmail.forEach(l => results.push({ ...l, source: 'landlord', match: 'email' }));

      // Check other enquiries
      const enqByEmail = db.prepare(
        'SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE (email_1 = ? OR email_2 = ?) AND id != ?'
      ).all(email, email, exclude_id || 0) as any[];
      enqByEmail.forEach(e => results.push({ ...e, name: `${e.first_name_1} ${e.last_name_1}`, source: 'enquiry', match: 'email' }));
    }

    if (phone) {
      const tenantByPhone = db.prepare('SELECT id, name, email, phone, property_id FROM tenants WHERE phone = ? OR phone_2 = ?').all(phone, phone) as any[];
      tenantByPhone.forEach(t => {
        if (!results.find(r => r.source === 'tenant' && r.id === t.id)) results.push({ ...t, source: 'tenant', match: 'phone' });
      });

      const landlordByPhone = db.prepare('SELECT id, name, email, phone FROM landlords WHERE phone = ?').all(phone) as any[];
      landlordByPhone.forEach(l => {
        if (!results.find(r => r.source === 'landlord' && r.id === l.id)) results.push({ ...l, source: 'landlord', match: 'phone' });
      });

      const enqByPhone = db.prepare(
        'SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE (phone_1 = ? OR phone_2 = ?) AND id != ?'
      ).all(phone, phone, exclude_id || 0) as any[];
      enqByPhone.forEach(e => {
        if (!results.find(r => r.source === 'enquiry' && r.id === e.id)) {
          results.push({ ...e, name: `${e.first_name_1} ${e.last_name_1}`, source: 'enquiry', match: 'phone' });
        }
      });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Duplicate check failed' });
  }
});

app.post('/api/tenant-enquiries/:id/convert', authMiddleware, (req: AuthRequest, res) => {
  try {
    const enquiry = db.prepare('SELECT * FROM tenant_enquiries WHERE id = ?').get(req.params.id) as any;
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    const { property_id, tenancy_start_date, tenancy_type, monthly_rent } = req.body;

    // Create tenant
    const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;
    const result = db.prepare(`
      INSERT INTO tenants (
        title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
        is_joint_tenancy, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2,
        kyc_completed_1, kyc_completed_2, property_id, tenancy_start_date, tenancy_type, monthly_rent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      enquiry.title_1, enquiry.first_name_1, enquiry.last_name_1, name, enquiry.email_1, enquiry.phone_1,
      enquiry.date_of_birth_1, enquiry.is_joint_application, enquiry.title_2, enquiry.first_name_2,
      enquiry.last_name_2, enquiry.email_2, enquiry.phone_2, enquiry.date_of_birth_2,
      enquiry.kyc_completed_1, enquiry.kyc_completed_2, property_id, tenancy_start_date, tenancy_type, monthly_rent
    );

    // Update enquiry status
    db.prepare("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', parseInt(req.params.id), { converted_to_tenant: result.lastInsertRowid });
    res.json({ tenant_id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert enquiry' });
  }
});

app.post('/api/tenant-enquiries/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM tenant_enquiries WHERE id IN (${placeholders})`).run(...ids);

    for (const id of ids) {
      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'tenant_enquiry', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete tenant enquiries' });
  }
});

// ============ TENANTS ============

app.get('/api/tenants', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenants = db.prepare(`
      SELECT t.*, p.address as property_address, l.landlord_type
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      ORDER BY t.name
    `).all();
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

app.post('/api/tenants', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    if (!data.property_id) return res.status(400).json({ error: 'Property is required' });
    const name = data.name || `${data.first_name_1} ${data.last_name_1}`;

    // Duplicate check
    if (data.email || data.phone) {
      const existing = db.prepare('SELECT id FROM tenants WHERE email = ? OR phone = ?').get(data.email, data.phone);
      if (existing) return res.status(400).json({ error: 'Duplicate email or phone number' });
    }

    const stmt = db.prepare(`
      INSERT INTO tenants (name, first_name_1, last_name_1, email, phone, notes, property_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, data.first_name_1 || name, data.last_name_1 || '',
      data.email || null, data.phone || null, data.notes || null, data.property_id);

    logAudit(req.user?.id, req.user?.email, 'create', 'tenant', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

app.get('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenant = db.prepare(`
      SELECT t.*, p.address as property_address, l.landlord_type
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    logAudit(req.user?.id, req.user?.email, 'view', 'tenant', parseInt(req.params.id));
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

app.put('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const name = data.name || `${data.first_name_1} ${data.last_name_1}`;

    db.prepare(`
      UPDATE tenants SET
        name=?, title_1=?, first_name_1=?, last_name_1=?, email=?, phone=?, date_of_birth_1=?,
        is_joint_tenancy=?, title_2=?, first_name_2=?, last_name_2=?, email_2=?, phone_2=?, date_of_birth_2=?,
        nok_name=?, nok_relationship=?, nok_phone=?, nok_email=?,
        kyc_completed_1=?, kyc_completed_2=?,
        kyc_primary_id=?, kyc_secondary_id=?, kyc_address_verification=?, kyc_personal_verification=?,
        guarantor_required=?, guarantor_name=?, guarantor_address=?, guarantor_phone=?, guarantor_email=?,
        guarantor_kyc_completed=?, guarantor_deed_received=?,
        holding_deposit_received=?, holding_deposit_amount=?, holding_deposit_date=?, application_forms_completed=?,
        authority_to_contact=?, proof_of_income=?, deposit_scheme=?,
        income_amount=?, income_employer=?, income_contract_type=?,
        property_id=?, tenancy_start_date=?, tenancy_type=?, has_end_date=?, tenancy_end_date=?, monthly_rent=?,
        move_in_date=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      name, data.title_1 || null, data.first_name_1, data.last_name_1, data.email || null, data.phone || null, data.date_of_birth_1 || null,
      data.is_joint_tenancy ? 1 : 0, data.title_2 || null, data.first_name_2 || null, data.last_name_2 || null, data.email_2 || null, data.phone_2 || null, data.date_of_birth_2 || null,
      data.nok_name || null, data.nok_relationship || null, data.nok_phone || null, data.nok_email || null,
      data.kyc_completed_1 ? 1 : 0, data.kyc_completed_2 ? 1 : 0,
      data.kyc_primary_id ? 1 : 0, data.kyc_secondary_id ? 1 : 0, data.kyc_address_verification ? 1 : 0, data.kyc_personal_verification ? 1 : 0,
      data.guarantor_required ? 1 : 0, data.guarantor_name, data.guarantor_address, data.guarantor_phone, data.guarantor_email,
      data.guarantor_kyc_completed ? 1 : 0, data.guarantor_deed_received ? 1 : 0,
      data.holding_deposit_received ? 1 : 0, data.holding_deposit_amount, data.holding_deposit_date, data.application_forms_completed ? 1 : 0,
      data.authority_to_contact ? 1 : 0, data.proof_of_income || null, data.deposit_scheme || null,
      data.income_amount || null, data.income_employer || null, data.income_contract_type || null,
      data.property_id, data.tenancy_start_date || null, data.tenancy_type || null, data.has_end_date ? 1 : 0, data.tenancy_end_date || null, data.monthly_rent || null,
      data.move_in_date || null, data.status || 'active', data.notes, req.params.id
    );

    logAudit(req.user?.id, req.user?.email, 'update', 'tenant', parseInt(req.params.id), data);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Notes-only update for tenants (avoids full PUT validation)
app.patch('/api/tenants/:id/notes', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { notes } = req.body;
    db.prepare('UPDATE tenants SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(notes, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

app.delete('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
    logAudit(req.user?.id, req.user?.email, 'delete', 'tenant', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete tenant' }); }
});

app.post('/api/tenants/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    // Update properties to remove tenant references
    db.prepare(`UPDATE properties SET has_live_tenancy = 0, tenancy_start_date = NULL WHERE id IN (SELECT property_id FROM tenants WHERE id IN (${placeholders}))`).run(...ids);
    // Delete tenants
    db.prepare(`DELETE FROM tenants WHERE id IN (${placeholders})`).run(...ids);

    for (const id of ids) {
      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'tenant', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete tenants' });
  }
});

// ============ PROPERTIES ============

app.get('/api/properties', authMiddleware, (req: AuthRequest, res) => {
  try {
    const properties = db.prepare(`
      SELECT p.*, l.name as landlord_name, l.landlord_type,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant
      FROM properties p
      LEFT JOIN landlords l ON l.id = p.landlord_id
      ORDER BY p.address
    `).all();
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

app.post('/api/properties', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const stmt = db.prepare(`
      INSERT INTO properties (
        landlord_id, address, postcode, property_type, bedrooms, rent_amount, status,
        is_leasehold, leasehold_start_date, leasehold_end_date, leaseholder_info,
        proof_of_ownership_received, council_tax_band, service_type, charge_percentage, total_charge,
        eicr_expiry_date, epc_grade, epc_expiry_date, has_gas, gas_safety_expiry_date,
        rent_review_date, onboarded_date, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.landlord_id, data.address, data.postcode, data.property_type || 'house', data.bedrooms || 1,
      data.rent_amount, data.status || 'available',
      data.is_leasehold ? 1 : 0, data.leasehold_start_date, data.leasehold_end_date, data.leaseholder_info,
      data.proof_of_ownership_received ? 1 : 0, data.council_tax_band, data.service_type,
      data.charge_percentage, data.total_charge,
      data.eicr_expiry_date, data.epc_grade, data.epc_expiry_date,
      data.has_gas ? 1 : 0, data.gas_safety_expiry_date,
      data.rent_review_date, data.onboarded_date, data.notes
    );

    logAudit(req.user?.id, req.user?.email, 'create', 'property', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

// Link property to landlord via junction table
app.post('/api/property-landlords', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { property_id, landlord_id, is_primary, ownership_percentage, ownership_entity_type } = req.body;

    const stmt = db.prepare(`
      INSERT INTO property_landlords (property_id, landlord_id, is_primary, ownership_percentage, ownership_entity_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      property_id,
      landlord_id,
      is_primary ? 1 : 0,
      ownership_percentage || null,
      ownership_entity_type || 'individual'
    );

    logAudit(req.user?.id, req.user?.email, 'create', 'property_landlord_link', result.lastInsertRowid as number, {
      property_id,
      landlord_id,
      ownership_entity_type
    });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    console.error(err);
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'This property is already linked to this landlord' });
    } else {
      res.status(500).json({ error: 'Failed to link property to landlord' });
    }
  }
});

app.get('/api/properties/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const property = db.prepare(`
      SELECT p.*, l.name as landlord_name, l.phone as landlord_phone, l.email as landlord_email, l.landlord_type,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant,
        (SELECT t.id FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_id,
        (SELECT t.email FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_email,
        (SELECT t.phone FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_phone
      FROM properties p
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });

    logAudit(req.user?.id, req.user?.email, 'view', 'property', parseInt(req.params.id));
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

app.put('/api/properties/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    db.prepare(`
      UPDATE properties SET
        landlord_id=?, address=?, postcode=?, property_type=?, bedrooms=?, rent_amount=?, status=?,
        is_leasehold=?, leasehold_start_date=?, leasehold_end_date=?, leaseholder_info=?,
        proof_of_ownership_received=?, council_tax_band=?, service_type=?, charge_percentage=?, total_charge=?,
        has_live_tenancy=?, tenancy_start_date=?, tenancy_type=?, has_end_date=?, tenancy_end_date=?,
        rent_review_date=?, eicr_expiry_date=?, epc_grade=?, epc_expiry_date=?,
        has_gas=?, gas_safety_expiry_date=?, onboarded_date=?, notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      data.landlord_id, data.address, data.postcode, data.property_type || null, data.bedrooms, data.rent_amount, data.status || 'available',
      data.is_leasehold ? 1 : 0, data.leasehold_start_date || null, data.leasehold_end_date || null, data.leaseholder_info || null,
      data.proof_of_ownership_received ? 1 : 0, data.council_tax_band || null, data.service_type || null, data.charge_percentage, data.total_charge,
      data.has_live_tenancy ? 1 : 0, data.tenancy_start_date || null, data.tenancy_type || null, data.has_end_date ? 1 : 0, data.tenancy_end_date || null,
      data.rent_review_date || null, data.eicr_expiry_date || null, data.epc_grade || null, data.epc_expiry_date || null,
      data.has_gas ? 1 : 0, data.gas_safety_expiry_date || null, data.onboarded_date || null, data.notes || null, req.params.id
    );

    logAudit(req.user?.id, req.user?.email, 'update', 'property', parseInt(req.params.id), data);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

app.delete('/api/properties/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    // Delete associated documents first
    const documents = db.prepare('SELECT * FROM documents WHERE entity_type = ? AND entity_id = ?').all('property', req.params.id) as any[];
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    db.prepare('DELETE FROM documents WHERE entity_type = ? AND entity_id = ?').run('property', req.params.id);

    // Delete associated tasks
    db.prepare('DELETE FROM tasks WHERE entity_type = ? AND entity_id = ?').run('property', req.params.id);

    // Delete associated rent payments
    db.prepare('DELETE FROM rent_payments WHERE property_id = ?').run(req.params.id);

    // Update tenants to unlink from this property
    db.prepare('UPDATE tenants SET property_id = NULL WHERE property_id = ?').run(req.params.id);

    // Delete the property
    db.prepare('DELETE FROM properties WHERE id = ?').run(req.params.id);

    logAudit(req.user?.id, req.user?.email, 'delete', 'property', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete property:', err);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// Bulk delete properties
app.post('/api/properties/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    for (const id of ids) {
      // Delete associated documents first
      const documents = db.prepare('SELECT * FROM documents WHERE entity_type = ? AND entity_id = ?').all('property', id) as any[];
      for (const doc of documents) {
        const filePath = path.join(uploadsDir, doc.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      db.prepare('DELETE FROM documents WHERE entity_type = ? AND entity_id = ?').run('property', id);

      // Delete associated tasks
      db.prepare('DELETE FROM tasks WHERE entity_type = ? AND entity_id = ?').run('property', id);

      // Delete associated rent payments
      db.prepare('DELETE FROM rent_payments WHERE property_id = ?').run(id);

      // Update tenants to unlink from this property
      db.prepare('UPDATE tenants SET property_id = NULL WHERE property_id = ?').run(id);

      // Delete the property
      db.prepare('DELETE FROM properties WHERE id = ?').run(id);

      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'property', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Failed to bulk delete properties:', err);
    res.status(500).json({ error: 'Failed to bulk delete properties' });
  }
});

// ============ TASKS ============

app.get('/api/tasks', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT t.*, u.name as assigned_to_name FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
    `;
    if (status === 'active') {
      query += " WHERE t.status IN ('pending', 'in_progress')";
    }
    query += ` ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.due_date NULLS LAST`;

    const tasks = db.prepare(query).all();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.get('/api/tasks/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const task = db.prepare(`
      SELECT t.* FROM tasks t WHERE t.id = ?
    `).get(req.params.id) as any;
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Get related entity details
    let relatedEntity = null;
    if (task.entity_type && task.entity_id) {
      if (task.entity_type === 'property') {
        relatedEntity = db.prepare('SELECT id, address, landlord_id FROM properties WHERE id = ?').get(task.entity_id);
      } else if (task.entity_type === 'landlord') {
        relatedEntity = db.prepare('SELECT id, name, email, phone FROM landlords WHERE id = ?').get(task.entity_id);
      } else if (task.entity_type === 'tenant') {
        relatedEntity = db.prepare('SELECT id, name, email, phone, property_id FROM tenants WHERE id = ?').get(task.entity_id);
      } else if (task.entity_type === 'tenant_enquiry') {
        relatedEntity = db.prepare('SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE id = ?').get(task.entity_id);
      }
    }

    // Get attached documents
    const documents = db.prepare(`
      SELECT * FROM documents
      WHERE entity_type = 'task' AND entity_id = ?
      ORDER BY uploaded_at DESC
    `).all(task.id);

    logAudit(req.user?.id, req.user?.email, 'view', 'task', parseInt(req.params.id));
    res.json({ ...task, relatedEntity, documents });
  } catch (err) {
    console.error('Failed to fetch task:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

app.post('/api/tasks', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type } = req.body;
    console.log('Creating task with body:', req.body);
    const stmt = db.prepare(`
      INSERT INTO tasks (title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(title, description, priority || 'medium', assigned_to, entity_type, entity_id, due_date, task_type || 'manual');

    logAudit(req.user?.id, req.user?.email, 'create', 'task', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Failed to create task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { title, description, priority, status, assigned_to, due_date, follow_up_date, notes, entity_type, entity_id, task_type } = req.body;
    const completed_at = status === 'completed' ? new Date().toISOString() : null;

    db.prepare(`
      UPDATE tasks SET title=?, description=?, priority=?, status=?, assigned_to=?,
        due_date=?, follow_up_date=?, notes=?, completed_at=?, entity_type=?, entity_id=?, task_type=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(title, description, priority, status, assigned_to, due_date, follow_up_date, notes, completed_at, entity_type, entity_id, task_type, req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'task', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    // Delete associated documents first
    const documents = db.prepare('SELECT * FROM documents WHERE entity_type = ? AND entity_id = ?').all('task', req.params.id) as any[];
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.file_name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    db.prepare('DELETE FROM documents WHERE entity_type = ? AND entity_id = ?').run('task', req.params.id);

    // Delete the task
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

    logAudit(req.user?.id, req.user?.email, 'delete', 'task', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Bulk delete tasks
app.post('/api/tasks/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    for (const id of ids) {
      // Delete associated documents first
      const documents = db.prepare('SELECT * FROM documents WHERE entity_type = ? AND entity_id = ?').all('task', id) as any[];
      for (const doc of documents) {
        const filePath = path.join(uploadsDir, doc.file_name);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      db.prepare('DELETE FROM documents WHERE entity_type = ? AND entity_id = ?').run('task', id);

      // Delete the task
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'task', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Failed to bulk delete tasks:', err);
    res.status(500).json({ error: 'Failed to bulk delete tasks' });
  }
});

// ============ RENT PAYMENTS ============

app.get('/api/rent-payments', authMiddleware, (req: AuthRequest, res) => {
  try {
    const payments = db.prepare(`
      SELECT rp.*, p.address, t.name as tenant_name
      FROM rent_payments rp
      JOIN properties p ON p.id = rp.property_id
      LEFT JOIN tenants t ON t.id = rp.tenant_id
      ORDER BY rp.due_date DESC
    `).all();
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rent payments' });
  }
});

app.post('/api/rent-payments', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { property_id, tenant_id, due_date, amount_due } = req.body;
    const stmt = db.prepare(`
      INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(property_id, tenant_id, due_date, amount_due);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create rent payment' });
  }
});

app.put('/api/rent-payments/:id/pay', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { amount_paid, payment_date } = req.body;
    const payment = db.prepare('SELECT * FROM rent_payments WHERE id = ?').get(req.params.id) as any;
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const status = amount_paid >= payment.amount_due ? 'paid' : 'partial';
    db.prepare(`
      UPDATE rent_payments SET amount_paid=?, payment_date=?, status=? WHERE id=?
    `).run(amount_paid, payment_date, status, req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'rent_payment', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// ============ MAINTENANCE ============

app.get('/api/maintenance', authMiddleware, (req: AuthRequest, res) => {
  try {
    const requests = db.prepare(`
      SELECT m.*, p.address, l.name as landlord_name, l.landlord_type
      FROM maintenance m
      JOIN properties p ON p.id = m.property_id
      JOIN landlords l ON l.id = p.landlord_id
      ORDER BY 
        CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        m.created_at DESC
    `).all();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch maintenance' });
  }
});

app.post('/api/maintenance', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const stmt = db.prepare(`
      INSERT INTO maintenance (property_id, tenant_id, landlord_id, reporter_name, reporter_email, reporter_phone,
        reporter_type, title, description, category, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.property_id ?? null, data.tenant_id ?? null, data.landlord_id ?? null,
      data.reporter_name ?? null, data.reporter_email ?? null, data.reporter_phone ?? null,
      data.reporter_type ?? null, data.title ?? null, data.description ?? '', data.category ?? null,
      data.priority || 'medium'
    );

    logAudit(req.user?.id, req.user?.email, 'create', 'maintenance', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create maintenance request' });
  }
});

app.put('/api/maintenance/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const data = req.body;
    const completed_date = data.status === 'completed' ? new Date().toISOString().split('T')[0] : data.completed_date;

    db.prepare(`
      UPDATE maintenance SET status=?, contractor=?, contractor_phone=?, cost=?, resolution_notes=?, 
        notes=?, completed_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(data.status, data.contractor, data.contractor_phone, data.cost, data.resolution_notes,
      data.notes, completed_date, req.params.id);

    logAudit(req.user?.id, req.user?.email, 'update', 'maintenance', parseInt(req.params.id), data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update maintenance' });
  }
});

app.post('/api/maintenance/bulk-delete', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM maintenance WHERE id IN (${placeholders})`).run(...ids);

    for (const id of ids) {
      logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'maintenance', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete maintenance requests' });
  }
});

// ============ PROPERTY EXPENSES ============

app.get('/api/property-expenses/:propertyId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const expenses = db.prepare('SELECT * FROM property_expenses WHERE property_id = ? ORDER BY expense_date DESC, created_at DESC').all(req.params.propertyId);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/property-expenses', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { property_id, description, amount, category, expense_date } = req.body;
    const result = db.prepare(
      'INSERT INTO property_expenses (property_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)'
    ).run(property_id, description, amount, category || 'other', expense_date || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

app.delete('/api/property-expenses/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    db.prepare('DELETE FROM property_expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// ============ PROPERTY VIEWINGS ============

app.get('/api/property-viewings', authMiddleware, (req: AuthRequest, res) => {
  try {
    const viewings = db.prepare(`
      SELECT v.*, p.address FROM property_viewings v
      JOIN properties p ON p.id = v.property_id
      ORDER BY v.viewing_date DESC
    `).all();
    res.json(viewings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch viewings' });
  }
});

app.post('/api/property-viewings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to, send_sms, sms_message } = req.body;
    const stmt = db.prepare(`
      INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to || null);

    // If linked to enquiry, update enquiry status
    if (enquiry_id) {
      db.prepare("UPDATE tenant_enquiries SET status = 'viewing_booked', viewing_date = ? WHERE id = ?")
        .run(viewing_date, enquiry_id);
    }

    // Create a task for the viewing
    const property = db.prepare('SELECT address FROM properties WHERE id = ?').get(property_id) as any;
    const taskTitle = `Property Viewing: ${viewer_name}`;
    const taskDescription = `Conduct property viewing at ${property?.address || 'Unknown Property'}\nTime: ${viewing_time || 'Not specified'}\nContact: ${viewer_phone || viewer_email}`;

    db.prepare(`
      INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
      VALUES (?, ?, 'pending', 'high', 'tenant_enquiry', ?, 'viewing', ?, ?)
    `).run(taskTitle, taskDescription, enquiry_id || null, viewing_date, assigned_to || req.user?.name || null);

    // Send SMS if requested
    if (send_sms && viewer_phone && sms_message) {
      const { sendSms, normalizeUkPhone } = require('./sms');
      const normalizedPhone = normalizeUkPhone(viewer_phone);
      const smsResult = await sendSms({ to: normalizedPhone, body: sms_message });
      db.prepare(`
        INSERT INTO sms_messages (enquiry_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        enquiry_id || null, normalizedPhone, process.env.TWILIO_PHONE_NUMBER || null,
        sms_message, smsResult.success ? 'sent' : 'failed', smsResult.sid || null,
        smsResult.error || null, req.user?.id || null, req.user?.email || null
      );
      logAudit(req.user?.id, req.user?.email, 'sms_sent', 'tenant_enquiry', enquiry_id || 0, { to_phone: normalizedPhone, message: sms_message.substring(0, 100) });
    }

    logAudit(req.user?.id, req.user?.email, 'create', 'property_viewing', Number(result.lastInsertRowid), { viewer_name, viewing_date, property_id });

    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating viewing:', err);
    res.status(500).json({ error: 'Failed to create viewing' });
  }
});

app.put('/api/property-viewings/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { status, feedback, interested, notes } = req.body;
    db.prepare(`
      UPDATE property_viewings SET status=?, feedback=?, interested=?, notes=? WHERE id=?
    `).run(status, feedback, interested ? 1 : 0, notes, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update viewing' });
  }
});

// ============ HOLDING DEPOSIT / ONBOARDING ============

app.post('/api/tenant-enquiries/:id/request-holding-deposit', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { monthly_rent, security_deposit, holding_deposit, follow_up_date } = req.body;
    const enquiryId = Number(req.params.id);

    const token = require('crypto').randomBytes(24).toString('hex');
    const applicationFormUrl = `https://apply.fleminglettings.co.uk/onboarding/${token}`;

    db.prepare(`
      UPDATE tenant_enquiries SET
        monthly_rent_agreed=?, security_deposit_amount=?, holding_deposit_amount=?,
        application_form_token=?, application_form_sent=1, holding_deposit_requested=1,
        onboarding_email_sent_at=CURRENT_TIMESTAMP, status='onboarding'
      WHERE id=?
    `).run(monthly_rent, security_deposit, holding_deposit, token, enquiryId);

    const enquiry = db.prepare(`
      SELECT te.*, p.address as property_address, p.postcode as property_postcode
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      WHERE te.id = ?
    `).get(enquiryId) as any;

    if (enquiry) {
      const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
      const address = [enquiry.property_address, enquiry.property_postcode].filter(Boolean).join(', ');

      const { sendEmail, holdingDepositRequestEmail } = require('./email');
      const emailContent = holdingDepositRequestEmail(name, address, monthly_rent, security_deposit, holding_deposit, applicationFormUrl);
      await sendEmail({
        to: enquiry.email_1,
        subject: emailContent.subject,
        html: emailContent.html,
        from: 'Fleming Lettings Accounts <accounts@fleminglettings.co.uk>',
      });

      if (follow_up_date) {
        db.prepare(`
          INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
          VALUES (?, ?, 'pending', 'high', 'tenant_enquiry', ?, 'follow_up', ?, ?)
        `).run(
          `Holding deposit follow-up: ${name}`,
          `Check if holding deposit of £${holding_deposit} has been received for ${address}`,
          enquiryId, follow_up_date, req.user?.name || null,
        );
      }

      logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, {
        action: 'holding_deposit_requested', monthly_rent, security_deposit, holding_deposit, email_sent_to: enquiry.email_1,
      });
    }

    res.json({ success: true, token, applicationFormUrl });
  } catch (err) {
    console.error('Error requesting holding deposit:', err);
    res.status(500).json({ error: 'Failed to send holding deposit request' });
  }
});

// ============ SMS ============

app.post('/api/sms/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { enquiry_id, to_phone, message_body } = req.body;
    if (!to_phone || !message_body) return res.status(400).json({ error: 'to_phone and message_body required' });
    const { sendSms, normalizeUkPhone } = require('./sms');
    const normalizedPhone = normalizeUkPhone(to_phone);
    const smsResult = await sendSms({ to: normalizedPhone, body: message_body });
    const stmt = db.prepare(`
      INSERT INTO sms_messages (enquiry_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      enquiry_id || null, normalizedPhone, process.env.TWILIO_PHONE_NUMBER || null,
      message_body, smsResult.success ? 'sent' : 'failed', smsResult.sid || null,
      smsResult.error || null, req.user?.id || null, req.user?.email || null
    );
    if (enquiry_id) {
      logAudit(req.user?.id, req.user?.email, 'sms_sent', 'tenant_enquiry', enquiry_id, { to_phone: normalizedPhone, message: message_body.substring(0, 100) });
    }
    res.json({ id: result.lastInsertRowid, success: smsResult.success, twilio_sid: smsResult.sid });
  } catch (err) {
    console.error('Error sending SMS:', err);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

app.get('/api/sms/enquiry/:enquiryId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const messages = db.prepare('SELECT * FROM sms_messages WHERE enquiry_id = ? ORDER BY created_at DESC').all(req.params.enquiryId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

// ============ TENANCIES (Legacy) ============

app.get('/api/tenancies', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenancies = db.prepare(`
      SELECT tn.*, p.address, p.postcode, t.name as tenant_name, t.phone as tenant_phone
      FROM tenancies tn
      JOIN properties p ON p.id = tn.property_id
      JOIN tenants t ON t.id = tn.tenant_id
      ORDER BY tn.start_date DESC
    `).all();
    res.json(tenancies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenancies' });
  }
});

app.post('/api/tenancies', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { property_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, notes } = req.body;
    const stmt = db.prepare(`
      INSERT INTO tenancies (property_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, status, notes) 
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `);
    const result = stmt.run(property_id, tenant_id, start_date, end_date || null, rent_amount, deposit_amount || null, notes || null);
    db.prepare("UPDATE properties SET status = 'let' WHERE id = ?").run(property_id);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenancy' });
  }
});

// ============ TRANSACTIONS (Legacy) ============

app.get('/api/transactions', authMiddleware, (req: AuthRequest, res) => {
  try {
    const transactions = db.prepare(`
      SELECT tr.*, p.address, t.name as tenant_name
      FROM transactions tr
      JOIN tenancies tn ON tn.id = tr.tenancy_id
      JOIN properties p ON p.id = tn.property_id
      JOIN tenants t ON t.id = tn.tenant_id
      ORDER BY tr.date DESC, tr.created_at DESC LIMIT 100
    `).all();
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { tenancy_id, type, amount, description, date } = req.body;
    const stmt = db.prepare(`
      INSERT INTO transactions (tenancy_id, type, amount, description, date, created_by) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(tenancy_id, type, amount, description || null, date, req.user!.id);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// ============ DOCUMENTS ============

const DOC_TYPES: Record<string, string[]> = {
  landlord: ['Primary Identification', 'Address Identification', 'Proof of Funds', 'Application Form(s)', 'Deed of Guarantee', 'Guarantor Forms', 'Bank Statements', 'Council Tax Bill', 'Complaint', 'Compliments', 'Proof of Ownership', 'Mortgage Statement', 'Other'],
  landlord_bdm: ['Notes', 'Other'],
  tenant: ['Primary Identification', 'Address Identification', 'Proof of Funds', 'Application Form(s)', 'Deed of Guarantee', 'Guarantor Forms', 'Bank Statements', 'Council Tax Bill', 'Complaint', 'Compliments', 'Other'],
  tenant_enquiry: ['Primary Identification', 'Address Identification', 'Application Form(s)', 'Other'],
  property: ['Gas Safety Certificate', 'EPC', 'EICR', 'Proof of Ownership', 'Insurance', 'Floor Plan', 'Photos', 'Inventory', 'Mortgage Statement', 'Other'],
  maintenance: ['Photos', 'Quote', 'Invoice', 'Other']
};

app.get('/api/documents/types/:entityType', authMiddleware, (req: AuthRequest, res) => {
  const types = DOC_TYPES[req.params.entityType];
  if (!types) return res.status(400).json({ error: 'Invalid entity type' });
  res.json(types);
});

app.get('/api/documents/:entityType/:entityId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const docs = db.prepare(`
      SELECT id, doc_type, original_name, mime_type, size, uploaded_at 
      FROM documents WHERE entity_type = ? AND entity_id = ? ORDER BY uploaded_at DESC
    `).all(entityType, entityId);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/documents/:entityType/:entityId', authMiddleware, upload.single('file'), (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { doc_type } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!doc_type) return res.status(400).json({ error: 'Document type required' });

    const stmt = db.prepare(`
      INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(entityType, entityId, doc_type, file.filename, file.originalname, file.mimetype, file.size, req.user?.id);

    logAudit(req.user?.id, req.user?.email, 'create', 'document', result.lastInsertRowid as number, { entity_type: entityType, entity_id: entityId });
    res.json({ id: result.lastInsertRowid, doc_type, original_name: file.originalname, mime_type: file.mimetype, size: file.size });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.get('/api/documents/download/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(uploadsDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download document' });
  }
});

app.delete('/api/documents/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id) as any;
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(uploadsDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);

    logAudit(req.user?.id, req.user?.email, 'delete', 'document', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ============ AUDIT LOG ============

app.get('/api/audit-log', authMiddleware, (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { entity_type, entity_id, user_id, limit = 100 } = req.query;
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (entity_type) { query += ' AND entity_type = ?'; params.push(entity_type); }
    if (entity_id) { query += ' AND entity_id = ?'; params.push(entity_id); }
    if (user_id) { query += ' AND user_id = ?'; params.push(user_id); }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const logs = db.prepare(query).all(...params);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Entity activity feed (non-admin, scoped to entity)
app.get('/api/activity/:entityType/:entityId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const limit = Number(req.query.limit) || 50;
    const logs = db.prepare(
      'SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(entityType, entityId, limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Log activity (e.g. note added)
app.post('/api/activity', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { action, entity_type, entity_id, changes } = req.body;
    logAudit(req.user?.id, req.user?.email, action, entity_type, entity_id, changes);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// ============ EPC LOOKUP ============

app.get('/api/epc-lookup', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const postcode = (req.query.postcode as string || '').trim();
    if (!postcode) return res.status(400).json({ error: 'Postcode required' });

    const apiEmail = process.env.EPC_API_EMAIL;
    const apiKey = process.env.EPC_API_KEY;

    if (!apiKey || !apiEmail) {
      return res.status(501).json({ error: 'EPC API credentials not configured' });
    }

    const url = `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=10`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiEmail}:${apiKey}`).toString('base64')}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('EPC API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'EPC API error' });
    }

    const text = await response.text();

    // Handle empty responses
    if (!text || text.length === 0) {
      return res.json([]);
    }

    const data = JSON.parse(text);
    const results = (data.rows || []).map((r: any) => ({
      address: r.address,
      postcode: r.postcode,
      current_rating: r['current-energy-rating'],
      potential_rating: r['potential-energy-rating'],
      current_efficiency: r['current-energy-efficiency'],
      property_type: r['property-type'],
      inspection_date: r['inspection-date'],
      certificate_number: r['lmk-key'],
    }));

    logAudit(req.user?.id, req.user?.email, 'view', 'epc_lookup');
    res.json(results);
  } catch (err) {
    console.error('EPC API error:', err);
    res.status(500).json({ error: 'Failed to fetch EPC data' });
  }
});

// ============ COUNCIL TAX LOOKUP ============

app.get('/api/council-tax-lookup', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const postcode = (req.query.postcode as string || '').trim();
    if (!postcode) return res.status(400).json({ error: 'Postcode required' });

    // Council tax band lookup via CouncilTaxFinder.com API
    const apiKey = process.env.COUNCIL_TAX_API_KEY;
    if (!apiKey) return res.status(501).json({ error: 'Council Tax API key not configured' });

    const url = `https://www.counciltaxfinder.com/api/?postcode=${encodeURIComponent(postcode)}&key=${apiKey}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) return res.status(response.status).json({ error: 'Council Tax API error' });

    const data = await response.json();

    // CouncilTaxFinder returns array of properties with: address, council, band, annual_tax, monthly_tax, council_website
    // Map to our expected format (array with address and band)
    const results = Array.isArray(data) ? data.map((r: any) => ({
      address: r.address,
      band: r.band,
      council: r.council,
      annualTax: r.annual_tax,
      monthlyTax: r.monthly_tax,
    })) : [];

    res.json(results);
  } catch (err) {
    console.error('Council tax lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch council tax data' });
  }
});

// ============ LAND REGISTRY PRICE PAID ============

app.get('/api/land-registry/price-paid', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const postcode = (req.query.postcode as string || '').trim();
    if (!postcode) return res.status(400).json({ error: 'Postcode required' });

    // HM Land Registry Price Paid Data API - Free, Open Government License
    // Using SPARQL endpoint for price paid data
    const cleanPostcode = postcode.replace(/\s/g, '').toUpperCase();
    const url = `http://landregistry.data.gov.uk/data/ppi/transaction-record.json?_pageSize=20&propertyAddress.postcode=${encodeURIComponent(cleanPostcode)}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Land Registry API error' });
    }

    const data = await response.json();
    const results = (data.result?.items || []).map((item: any) => ({
      address: item.propertyAddress?.saon
        ? `${item.propertyAddress.saon} ${item.propertyAddress.paon} ${item.propertyAddress.street}`
        : `${item.propertyAddress?.paon || ''} ${item.propertyAddress?.street || ''}`.trim(),
      postcode: item.propertyAddress?.postcode,
      price: item.pricePaid,
      date: item.transactionDate,
      property_type: item.propertyType?.label,
      estate_type: item.estateType?.label,
      transaction_id: item.transactionId
    }));

    logAudit(req.user?.id, req.user?.email, 'view', 'land_registry_lookup');
    res.json(results);
  } catch (err) {
    console.error('Land Registry error:', err);
    res.status(500).json({ error: 'Failed to fetch Land Registry data' });
  }
});

// ============ POSTCODES.IO ============

app.get('/api/postcode/lookup', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const postcode = (req.query.postcode as string || '').trim();
    if (!postcode) return res.status(400).json({ error: 'Postcode required' });

    // Postcodes.io - Free UK postcode API, no authentication required
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;

    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Postcode not found' });
      }
      return res.status(response.status).json({ error: 'Postcodes.io API error' });
    }

    const data = await response.json();

    if (data.status === 200 && data.result) {
      const result = {
        postcode: data.result.postcode,
        latitude: data.result.latitude,
        longitude: data.result.longitude,
        admin_district: data.result.admin_district,
        admin_ward: data.result.admin_ward,
        parish: data.result.parish,
        parliamentary_constituency: data.result.parliamentary_constituency,
        region: data.result.region,
        country: data.result.country,
        quality: data.result.quality,
        eastings: data.result.eastings,
        northings: data.result.northings,
        outcode: data.result.outcode,
        incode: data.result.incode
      };
      res.json(result);
    } else {
      res.status(404).json({ error: 'Postcode not found' });
    }
  } catch (err) {
    console.error('Postcodes.io error:', err);
    res.status(500).json({ error: 'Failed to lookup postcode' });
  }
});

app.get('/api/postcode/autocomplete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const query = (req.query.query as string || '').trim();
    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    // Postcodes.io autocomplete endpoint
    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(query)}/autocomplete`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.json({ result: [] }); // Return empty array for no results
    }

    const data = await response.json();
    res.json({ result: data.result || [] });
  } catch (err) {
    console.error('Postcodes.io autocomplete error:', err);
    res.status(500).json({ error: 'Failed to autocomplete postcode' });
  }
});

// ============ COMPANIES HOUSE ============

app.get('/api/companies-house/search', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const query = (req.query.query as string || '').trim();
    if (!query) return res.status(400).json({ error: 'Company name or number required' });

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      return res.status(501).json({ error: 'Companies House API key not configured' });
    }

    // Companies House API - Free with registration
    const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=10`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Companies House API error' });
    }

    const data = await response.json();
    const results = (data.items || []).map((item: any) => ({
      company_number: item.company_number,
      company_name: item.title,
      company_status: item.company_status,
      company_type: item.company_type,
      date_of_creation: item.date_of_creation,
      address: item.address ? {
        line_1: item.address.address_line_1,
        line_2: item.address.address_line_2,
        locality: item.address.locality,
        postal_code: item.address.postal_code,
        country: item.address.country
      } : null
    }));

    logAudit(req.user?.id, req.user?.email, 'view', 'companies_house_search');
    res.json(results);
  } catch (err) {
    console.error('Companies House error:', err);
    res.status(500).json({ error: 'Failed to search Companies House' });
  }
});

app.get('/api/companies-house/company/:companyNumber', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyNumber = req.params.companyNumber;
    if (!companyNumber) return res.status(400).json({ error: 'Company number required' });

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      return res.status(501).json({ error: 'Companies House API key not configured' });
    }

    const url = `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ error: 'Company not found' });
      }
      return res.status(response.status).json({ error: 'Companies House API error' });
    }

    const data = await response.json();
    const result = {
      company_number: data.company_number,
      company_name: data.company_name,
      company_status: data.company_status,
      company_type: data.type,
      date_of_creation: data.date_of_creation,
      jurisdiction: data.jurisdiction,
      registered_office_address: data.registered_office_address,
      accounts: data.accounts,
      confirmation_statement: data.confirmation_statement,
      sic_codes: data.sic_codes,
      has_insolvency_history: data.has_insolvency_history,
      has_charges: data.has_charges
    };

    logAudit(req.user?.id, req.user?.email, 'view', 'companies_house_detail', undefined, { company_number: companyNumber });
    res.json(result);
  } catch (err) {
    console.error('Companies House error:', err);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

// ============ USERS (Admin) ============

app.get('/api/users', authMiddleware, (req: AuthRequest, res) => {
  try {
    // Return active users for task assignment (accessible to all authenticated users)
    const users = db.prepare('SELECT id, email, name, role FROM users WHERE is_active = 1').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { email, password, name, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(email, hashedPassword, name, role || 'staff');

    logAudit(req.user?.id, req.user?.email, 'create', 'user', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ============ DATA EXPORT ============

app.get('/api/export/:entityType', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { entityType } = req.params;
    let data;

    switch (entityType) {
      case 'landlords':
        data = db.prepare('SELECT name, email, phone, home_address FROM landlords').all();
        break;
      case 'landlords_bdm':
        data = db.prepare('SELECT name, email, phone, address, status FROM landlords_bdm').all();
        break;
      case 'tenants':
        data = db.prepare('SELECT name, email, phone FROM tenants').all();
        break;
      case 'properties':
        data = db.prepare('SELECT address, postcode, rent_amount, status FROM properties').all();
        break;
      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }

    logAudit(req.user?.id, req.user?.email, 'export', entityType);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ============ AI ASSISTANT ============

app.use('/api/ai', aiRouter);

// SPA fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Fleming CRM running on http://localhost:${PORT}`);
  startScheduler();
});
