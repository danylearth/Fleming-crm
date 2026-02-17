import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import db from './db';
import { generateToken, authMiddleware, AuthRequest } from './auth';

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
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
            kyc_completed, notes } = req.body;
    
    // Duplicate check
    if (email || phone) {
      const existing = db.prepare('SELECT id FROM landlords WHERE email = ? OR phone = ?').get(email, phone);
      if (existing) return res.status(400).json({ error: 'Duplicate email or phone number' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO landlords (name, email, phone, alt_email, date_of_birth, home_address,
        marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(name, email || null, phone || null, alt_email || null, date_of_birth || null, 
      home_address || null, marketing_post ? 1 : 0, marketing_email ? 1 : 0, marketing_phone ? 1 : 0, 
      marketing_sms ? 1 : 0, kyc_completed ? 1 : 0, notes || null);
    
    logAudit(req.user?.id, req.user?.email, 'create', 'landlord', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create landlord' });
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
    const { name, email, phone, alt_email, date_of_birth, home_address,
            marketing_post, marketing_email, marketing_phone, marketing_sms,
            kyc_completed, notes } = req.body;
    
    db.prepare(`
      UPDATE landlords SET name=?, email=?, phone=?, alt_email=?, date_of_birth=?, home_address=?,
        marketing_post=?, marketing_email=?, marketing_phone=?, marketing_sms=?,
        kyc_completed=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(name, email, phone, alt_email, date_of_birth, home_address,
      marketing_post ? 1 : 0, marketing_email ? 1 : 0, marketing_phone ? 1 : 0, marketing_sms ? 1 : 0,
      kyc_completed ? 1 : 0, notes, req.params.id);
    
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
    
    // Create landlord
    const result = db.prepare(`
      INSERT INTO landlords (name, email, phone, home_address, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(prospect.name, prospect.email, prospect.phone, prospect.address, prospect.notes);
    
    // Update BDM status
    db.prepare("UPDATE landlords_bdm SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(req.params.id);
    
    logAudit(req.user?.id, req.user?.email, 'update', 'landlord_bdm', parseInt(req.params.id), { converted_to: result.lastInsertRowid });
    res.json({ landlord_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert prospect' });
  }
});

// ============ TENANT ENQUIRIES ============

app.get('/api/tenant-enquiries', authMiddleware, (req: AuthRequest, res) => {
  try {
    const enquiries = db.prepare(`
      SELECT te.*, p.address as property_address FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
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
      SELECT te.*, p.address as property_address FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
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
    
    db.prepare(`
      UPDATE tenant_enquiries SET
        title_1=?, first_name_1=?, last_name_1=?, email_1=?, phone_1=?, date_of_birth_1=?, 
        current_address_1=?, employment_status_1=?, employer_1=?, income_1=?,
        is_joint_application=?, title_2=?, first_name_2=?, last_name_2=?, email_2=?, phone_2=?, 
        date_of_birth_2=?, current_address_2=?, employment_status_2=?, employer_2=?, income_2=?,
        kyc_completed_1=?, kyc_completed_2=?, status=?, follow_up_date=?, viewing_date=?, 
        linked_property_id=?, notes=?, rejection_reason=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      data.title_1, data.first_name_1, data.last_name_1, data.email_1, data.phone_1,
      data.date_of_birth_1, data.current_address_1, data.employment_status_1, data.employer_1, data.income_1,
      data.is_joint_application ? 1 : 0, data.title_2, data.first_name_2, data.last_name_2,
      data.email_2, data.phone_2, data.date_of_birth_2, data.current_address_2,
      data.employment_status_2, data.employer_2, data.income_2,
      data.kyc_completed_1 ? 1 : 0, data.kyc_completed_2 ? 1 : 0, data.status, data.follow_up_date,
      data.viewing_date, data.linked_property_id, data.notes, data.rejection_reason, req.params.id
    );
    
    logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', parseInt(req.params.id), data);
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

// ============ TENANTS ============

app.get('/api/tenants', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenants = db.prepare(`
      SELECT t.*, p.address as property_address
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
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
      data.email || null, data.phone || null, data.notes || null, data.property_id || null);
    
    logAudit(req.user?.id, req.user?.email, 'create', 'tenant', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

app.get('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenant = db.prepare(`
      SELECT t.*, p.address as property_address
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
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
        guarantor_required=?, guarantor_name=?, guarantor_address=?, guarantor_phone=?, guarantor_email=?,
        guarantor_kyc_completed=?, guarantor_deed_received=?,
        holding_deposit_received=?, holding_deposit_amount=?, holding_deposit_date=?, application_forms_completed=?,
        property_id=?, tenancy_start_date=?, tenancy_type=?, has_end_date=?, tenancy_end_date=?, monthly_rent=?,
        notes=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      name, data.title_1, data.first_name_1, data.last_name_1, data.email, data.phone, data.date_of_birth_1,
      data.is_joint_tenancy ? 1 : 0, data.title_2, data.first_name_2, data.last_name_2, data.email_2, data.phone_2, data.date_of_birth_2,
      data.nok_name, data.nok_relationship, data.nok_phone, data.nok_email,
      data.kyc_completed_1 ? 1 : 0, data.kyc_completed_2 ? 1 : 0,
      data.guarantor_required ? 1 : 0, data.guarantor_name, data.guarantor_address, data.guarantor_phone, data.guarantor_email,
      data.guarantor_kyc_completed ? 1 : 0, data.guarantor_deed_received ? 1 : 0,
      data.holding_deposit_received ? 1 : 0, data.holding_deposit_amount, data.holding_deposit_date, data.application_forms_completed ? 1 : 0,
      data.property_id, data.tenancy_start_date, data.tenancy_type, data.has_end_date ? 1 : 0, data.tenancy_end_date, data.monthly_rent,
      data.notes, req.params.id
    );
    
    logAudit(req.user?.id, req.user?.email, 'update', 'tenant', parseInt(req.params.id), data);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

app.delete('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
    logAudit(req.user?.id, req.user?.email, 'delete', 'tenant', parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete tenant' }); }
});

// ============ PROPERTIES ============

app.get('/api/properties', authMiddleware, (req: AuthRequest, res) => {
  try {
    const properties = db.prepare(`
      SELECT p.*, l.name as landlord_name,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant
      FROM properties p
      JOIN landlords l ON l.id = p.landlord_id
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

app.get('/api/properties/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const property = db.prepare(`
      SELECT p.*, l.name as landlord_name, l.phone as landlord_phone, l.email as landlord_email,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant,
        (SELECT t.id FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_id
      FROM properties p
      JOIN landlords l ON l.id = p.landlord_id
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
      data.landlord_id, data.address, data.postcode, data.property_type, data.bedrooms, data.rent_amount, data.status,
      data.is_leasehold ? 1 : 0, data.leasehold_start_date, data.leasehold_end_date, data.leaseholder_info,
      data.proof_of_ownership_received ? 1 : 0, data.council_tax_band, data.service_type, data.charge_percentage, data.total_charge,
      data.has_live_tenancy ? 1 : 0, data.tenancy_start_date, data.tenancy_type, data.has_end_date ? 1 : 0, data.tenancy_end_date,
      data.rent_review_date, data.eicr_expiry_date, data.epc_grade, data.epc_expiry_date,
      data.has_gas ? 1 : 0, data.gas_safety_expiry_date, data.onboarded_date, data.notes, req.params.id
    );
    
    logAudit(req.user?.id, req.user?.email, 'update', 'property', parseInt(req.params.id), data);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update property' });
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
      SELECT t.*, u.name as assigned_to_name FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.id = ?
    `).get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

app.post('/api/tasks', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type } = req.body;
    const stmt = db.prepare(`
      INSERT INTO tasks (title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(title, description, priority || 'medium', assigned_to, entity_type, entity_id, due_date, task_type || 'manual');
    
    logAudit(req.user?.id, req.user?.email, 'create', 'task', result.lastInsertRowid as number);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { title, description, priority, status, assigned_to, due_date, follow_up_date, notes } = req.body;
    const completed_at = status === 'completed' ? new Date().toISOString() : null;
    
    db.prepare(`
      UPDATE tasks SET title=?, description=?, priority=?, status=?, assigned_to=?, 
        due_date=?, follow_up_date=?, notes=?, completed_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(title, description, priority, status, assigned_to, due_date, follow_up_date, notes, completed_at, req.params.id);
    
    logAudit(req.user?.id, req.user?.email, 'update', 'task', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
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
      SELECT m.*, p.address, l.name as landlord_name
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
      data.property_id, data.tenant_id, data.landlord_id, data.reporter_name, data.reporter_email, data.reporter_phone,
      data.reporter_type, data.title, data.description, data.category, data.priority || 'medium'
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

app.post('/api/property-viewings', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes } = req.body;
    const stmt = db.prepare(`
      INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes);
    
    // If linked to enquiry, update enquiry status
    if (enquiry_id) {
      db.prepare("UPDATE tenant_enquiries SET status = 'viewing_booked', viewing_date = ? WHERE id = ?")
        .run(viewing_date, enquiry_id);
    }
    
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
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

// ============ USERS (Admin) ============

app.get('/api/users', authMiddleware, (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const users = db.prepare('SELECT id, email, name, role, is_active, created_at, last_login FROM users').all();
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

// SPA fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Fleming CRM running on http://localhost:${PORT}`);
});
