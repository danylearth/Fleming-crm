import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool, { initDb } from './db-postgres';
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

async function logAudit(userId: number | undefined, userEmail: string | undefined, action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, userEmail || null, action, entityType, entityId || null, changes ? JSON.stringify(changes) : null]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// ============ AUTH ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = 1', [email]);
    const user = result.rows[0];
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    logAudit(user.id, user.email, 'login', 'user', user.id);
    
    const token = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const existing = await pool.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(existing.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }
    
    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)', [email, hashedPassword, name, 'admin']);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Setup failed' });
  }
});

// ============ DASHBOARD ============

app.get('/api/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const stats: any = {};
    
    stats.properties = (await pool.query('SELECT COUNT(*) as c FROM properties')).rows[0].c;
    stats.propertiesLet = (await pool.query("SELECT COUNT(*) as c FROM properties WHERE status = 'let'")).rows[0].c;
    stats.landlords = (await pool.query('SELECT COUNT(*) as c FROM landlords')).rows[0].c;
    stats.tenants = (await pool.query('SELECT COUNT(*) as c FROM tenants')).rows[0].c;
    stats.activeTenancies = (await pool.query("SELECT COUNT(*) as c FROM tenancies WHERE status = 'active'")).rows[0].c;
    stats.openMaintenance = (await pool.query("SELECT COUNT(*) as c FROM maintenance WHERE status IN ('open', 'in_progress')")).rows[0].c;
    
    // BDM Pipeline
    stats.bdmProspects = (await pool.query("SELECT COUNT(*) as c FROM landlords_bdm WHERE status NOT IN ('onboarded', 'not_interested')")).rows[0].c;
    stats.bdmNew = (await pool.query("SELECT COUNT(*) as c FROM landlords_bdm WHERE status = 'new'")).rows[0].c;
    stats.bdmContacted = (await pool.query("SELECT COUNT(*) as c FROM landlords_bdm WHERE status = 'contacted'")).rows[0].c;
    stats.bdmInterested = (await pool.query("SELECT COUNT(*) as c FROM landlords_bdm WHERE status = 'interested'")).rows[0].c;
    
    // Enquiries
    stats.enquiries = (await pool.query("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status NOT IN ('rejected', 'converted')")).rows[0].c;
    stats.enquiriesNew = (await pool.query("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'new'")).rows[0].c;
    stats.enquiriesViewing = (await pool.query("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'viewing_booked'")).rows[0].c;
    stats.enquiriesOnboarding = (await pool.query("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status = 'onboarding'")).rows[0].c;
    
    // Financial
    const income = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'payment' AND date >= date_trunc('month', CURRENT_DATE)");
    stats.monthlyIncome = income.rows[0].total;
    
    const outstanding = await pool.query("SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) as total FROM rent_payments WHERE status IN ('pending', 'partial')");
    stats.outstandingRent = outstanding.rows[0].total;
    
    // Tasks
    stats.tasksOverdue = (await pool.query("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date < CURRENT_DATE")).rows[0].c;
    stats.tasksDueToday = (await pool.query("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date = CURRENT_DATE")).rows[0].c;
    stats.tasksUpcoming = (await pool.query("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date > CURRENT_DATE AND due_date <= CURRENT_DATE + INTERVAL '7 days'")).rows[0].c;
    
    // Compliance alerts
    const complianceResult = await pool.query(`
      SELECT id as property_id, address, 
        CASE 
          WHEN eicr_expiry_date <= CURRENT_DATE + INTERVAL '14 days' THEN 'EICR'
          WHEN epc_expiry_date <= CURRENT_DATE + INTERVAL '14 days' THEN 'EPC'
          WHEN has_gas = 1 AND gas_safety_expiry_date <= CURRENT_DATE + INTERVAL '14 days' THEN 'Gas Safety'
        END as type,
        CASE 
          WHEN eicr_expiry_date < CURRENT_DATE OR epc_expiry_date < CURRENT_DATE OR gas_safety_expiry_date < CURRENT_DATE THEN 'expired'
          ELSE 'expiring'
        END as status
      FROM properties WHERE 
        eicr_expiry_date <= CURRENT_DATE + INTERVAL '14 days' OR
        epc_expiry_date <= CURRENT_DATE + INTERVAL '14 days' OR
        (has_gas = 1 AND gas_safety_expiry_date <= CURRENT_DATE + INTERVAL '14 days')
      LIMIT 10
    `);
    stats.complianceAlerts = complianceResult.rows;
    
    // Recent maintenance
    const maintenance = await pool.query(`
      SELECT m.*, p.address FROM maintenance m
      JOIN properties p ON p.id = m.property_id
      WHERE m.status IN ('open', 'in_progress')
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               m.created_at DESC LIMIT 5
    `);
    stats.recentMaintenance = maintenance.rows;
    
    // Recent tasks
    const tasks = await pool.query(`
      SELECT id, title, priority, due_date, COALESCE(entity_type || ' #' || entity_id, '') as related_to
      FROM tasks WHERE status IN ('pending', 'in_progress')
      ORDER BY CASE WHEN due_date < CURRENT_DATE THEN 0 ELSE 1 END, due_date NULLS LAST
      LIMIT 5
    `);
    stats.recentTasks = tasks.rows;
    
    logAudit(req.user?.id, req.user?.email, 'view', 'dashboard');
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============ LANDLORDS ============

app.get('/api/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l ORDER BY l.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlords' });
  }
});

app.post('/api/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, alt_email, date_of_birth, home_address, 
            marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, notes } = req.body;
    
    if (email || phone) {
      const existing = await pool.query('SELECT id FROM landlords WHERE email = $1 OR phone = $2', [email, phone]);
      if (existing.rows.length > 0) return res.status(400).json({ error: 'Duplicate email or phone' });
    }
    
    const result = await pool.query(`
      INSERT INTO landlords (name, email, phone, alt_email, date_of_birth, home_address,
        marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
    `, [name, email, phone, alt_email, date_of_birth, home_address,
        marketing_post ? 1 : 0, marketing_email ? 1 : 0, marketing_phone ? 1 : 0, marketing_sms ? 1 : 0, kyc_completed ? 1 : 0, notes]);
    
    logAudit(req.user?.id, req.user?.email, 'create', 'landlord', result.rows[0].id);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create landlord' });
  }
});

app.get('/api/landlords/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l WHERE l.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlord' });
  }
});

app.put('/api/landlords/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, alt_email, date_of_birth, home_address,
            marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, notes } = req.body;
    
    await pool.query(`
      UPDATE landlords SET name=$1, email=$2, phone=$3, alt_email=$4, date_of_birth=$5, home_address=$6,
        marketing_post=$7, marketing_email=$8, marketing_phone=$9, marketing_sms=$10, kyc_completed=$11, notes=$12,
        updated_at=CURRENT_TIMESTAMP WHERE id=$13
    `, [name, email, phone, alt_email, date_of_birth, home_address,
        marketing_post ? 1 : 0, marketing_email ? 1 : 0, marketing_phone ? 1 : 0, marketing_sms ? 1 : 0, kyc_completed ? 1 : 0, notes, req.params.id]);
    
    logAudit(req.user?.id, req.user?.email, 'update', 'landlord', parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update landlord' });
  }
});

// ============ LANDLORDS BDM ============

app.get('/api/landlords-bdm', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM landlords_bdm ORDER BY 
        CASE status WHEN 'follow_up' THEN 1 WHEN 'new' THEN 2 WHEN 'contacted' THEN 3 WHEN 'interested' THEN 4 ELSE 5 END,
        follow_up_date NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlords BDM' });
  }
});

app.post('/api/landlords-bdm', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, address, status, follow_up_date, source, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO landlords_bdm (name, email, phone, address, status, follow_up_date, source, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [name, email, phone, address, status || 'new', follow_up_date, source, notes]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create prospect' });
  }
});

app.get('/api/landlords-bdm/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prospect' });
  }
});

app.put('/api/landlords-bdm/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, address, status, follow_up_date, source, notes } = req.body;
    await pool.query(`
      UPDATE landlords_bdm SET name=$1, email=$2, phone=$3, address=$4, status=$5, follow_up_date=$6, source=$7, notes=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9
    `, [name, email, phone, address, status, follow_up_date, source, notes, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prospect' });
  }
});

app.post('/api/landlords-bdm/:id/convert', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const prospect = (await pool.query('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id])).rows[0];
    if (!prospect) return res.status(404).json({ error: 'Not found' });
    
    const result = await pool.query(`
      INSERT INTO landlords (name, email, phone, home_address, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [prospect.name, prospect.email, prospect.phone, prospect.address, prospect.notes]);
    
    await pool.query("UPDATE landlords_bdm SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    res.json({ landlord_id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert' });
  }
});

// ============ TENANT ENQUIRIES ============

app.get('/api/tenant-enquiries', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT te.*, p.address as property_address FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      ORDER BY CASE te.status WHEN 'viewing_booked' THEN 1 WHEN 'onboarding' THEN 2 WHEN 'new' THEN 3 ELSE 4 END,
        te.viewing_date NULLS LAST, te.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
});

app.post('/api/tenant-enquiries', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const result = await pool.query(`
      INSERT INTO tenant_enquiries (title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1,
        current_address_1, employment_status_1, employer_1, income_1, is_joint_application, title_2, first_name_2,
        last_name_2, email_2, phone_2, date_of_birth_2, current_address_2, employment_status_2, employer_2, income_2, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id
    `, [d.title_1, d.first_name_1, d.last_name_1, d.email_1, d.phone_1, d.date_of_birth_1, d.current_address_1,
        d.employment_status_1, d.employer_1, d.income_1, d.is_joint_application ? 1 : 0, d.title_2, d.first_name_2,
        d.last_name_2, d.email_2, d.phone_2, d.date_of_birth_2, d.current_address_2, d.employment_status_2, d.employer_2, d.income_2, d.notes]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create enquiry' });
  }
});

app.get('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT te.*, p.address as property_address FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id WHERE te.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiry' });
  }
});

app.put('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    await pool.query(`
      UPDATE tenant_enquiries SET title_1=$1, first_name_1=$2, last_name_1=$3, email_1=$4, phone_1=$5,
        date_of_birth_1=$6, current_address_1=$7, employment_status_1=$8, employer_1=$9, income_1=$10,
        is_joint_application=$11, title_2=$12, first_name_2=$13, last_name_2=$14, email_2=$15, phone_2=$16,
        date_of_birth_2=$17, current_address_2=$18, employment_status_2=$19, employer_2=$20, income_2=$21,
        kyc_completed_1=$22, kyc_completed_2=$23, status=$24, follow_up_date=$25, viewing_date=$26,
        linked_property_id=$27, notes=$28, rejection_reason=$29, updated_at=CURRENT_TIMESTAMP WHERE id=$30
    `, [d.title_1, d.first_name_1, d.last_name_1, d.email_1, d.phone_1, d.date_of_birth_1, d.current_address_1,
        d.employment_status_1, d.employer_1, d.income_1, d.is_joint_application ? 1 : 0, d.title_2, d.first_name_2,
        d.last_name_2, d.email_2, d.phone_2, d.date_of_birth_2, d.current_address_2, d.employment_status_2,
        d.employer_2, d.income_2, d.kyc_completed_1 ? 1 : 0, d.kyc_completed_2 ? 1 : 0, d.status, d.follow_up_date,
        d.viewing_date, d.linked_property_id, d.notes, d.rejection_reason, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

app.post('/api/tenant-enquiries/:id/convert', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiry = (await pool.query('SELECT * FROM tenant_enquiries WHERE id = $1', [req.params.id])).rows[0];
    if (!enquiry) return res.status(404).json({ error: 'Not found' });
    
    const { property_id, tenancy_start_date, tenancy_type, monthly_rent } = req.body;
    const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;
    
    const result = await pool.query(`
      INSERT INTO tenants (title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
        is_joint_tenancy, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2,
        kyc_completed_1, kyc_completed_2, property_id, tenancy_start_date, tenancy_type, monthly_rent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id
    `, [enquiry.title_1, enquiry.first_name_1, enquiry.last_name_1, name, enquiry.email_1, enquiry.phone_1,
        enquiry.date_of_birth_1, enquiry.is_joint_application, enquiry.title_2, enquiry.first_name_2,
        enquiry.last_name_2, enquiry.email_2, enquiry.phone_2, enquiry.date_of_birth_2,
        enquiry.kyc_completed_1, enquiry.kyc_completed_2, property_id, tenancy_start_date, tenancy_type, monthly_rent]);
    
    await pool.query("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    res.json({ tenant_id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert' });
  }
});

// ============ TENANTS ============

app.get('/api/tenants', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, p.address as property_address FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id ORDER BY t.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

app.post('/api/tenants', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const name = d.name || `${d.first_name_1} ${d.last_name_1}`;
    const result = await pool.query(`
      INSERT INTO tenants (name, first_name_1, last_name_1, email, phone, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [name, d.first_name_1 || name, d.last_name_1 || '', d.email, d.phone, d.notes]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

app.get('/api/tenants/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, p.address as property_address FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id WHERE t.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

app.put('/api/tenants/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const name = d.name || `${d.first_name_1} ${d.last_name_1}`;
    await pool.query(`
      UPDATE tenants SET name=$1, title_1=$2, first_name_1=$3, last_name_1=$4, email=$5, phone=$6, date_of_birth_1=$7,
        is_joint_tenancy=$8, title_2=$9, first_name_2=$10, last_name_2=$11, email_2=$12, phone_2=$13, date_of_birth_2=$14,
        nok_name=$15, nok_relationship=$16, nok_phone=$17, nok_email=$18, kyc_completed_1=$19, kyc_completed_2=$20,
        guarantor_required=$21, guarantor_name=$22, guarantor_address=$23, guarantor_phone=$24, guarantor_email=$25,
        guarantor_kyc_completed=$26, guarantor_deed_received=$27, holding_deposit_received=$28, holding_deposit_amount=$29,
        holding_deposit_date=$30, application_forms_completed=$31, property_id=$32, tenancy_start_date=$33, tenancy_type=$34,
        has_end_date=$35, tenancy_end_date=$36, monthly_rent=$37, notes=$38, updated_at=CURRENT_TIMESTAMP WHERE id=$39
    `, [name, d.title_1, d.first_name_1, d.last_name_1, d.email, d.phone, d.date_of_birth_1,
        d.is_joint_tenancy ? 1 : 0, d.title_2, d.first_name_2, d.last_name_2, d.email_2, d.phone_2, d.date_of_birth_2,
        d.nok_name, d.nok_relationship, d.nok_phone, d.nok_email, d.kyc_completed_1 ? 1 : 0, d.kyc_completed_2 ? 1 : 0,
        d.guarantor_required ? 1 : 0, d.guarantor_name, d.guarantor_address, d.guarantor_phone, d.guarantor_email,
        d.guarantor_kyc_completed ? 1 : 0, d.guarantor_deed_received ? 1 : 0, d.holding_deposit_received ? 1 : 0,
        d.holding_deposit_amount, d.holding_deposit_date, d.application_forms_completed ? 1 : 0, d.property_id,
        d.tenancy_start_date, d.tenancy_type, d.has_end_date ? 1 : 0, d.tenancy_end_date, d.monthly_rent, d.notes, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// ============ PROPERTIES ============

app.get('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, l.name as landlord_name,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant
      FROM properties p JOIN landlords l ON l.id = p.landlord_id ORDER BY p.address
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

app.post('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const result = await pool.query(`
      INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status,
        is_leasehold, leasehold_start_date, leasehold_end_date, leaseholder_info, proof_of_ownership_received,
        council_tax_band, service_type, charge_percentage, total_charge, eicr_expiry_date, epc_grade, epc_expiry_date,
        has_gas, gas_safety_expiry_date, rent_review_date, onboarded_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id
    `, [d.landlord_id, d.address, d.postcode, d.property_type || 'house', d.bedrooms || 1, d.rent_amount, d.status || 'available',
        d.is_leasehold ? 1 : 0, d.leasehold_start_date, d.leasehold_end_date, d.leaseholder_info, d.proof_of_ownership_received ? 1 : 0,
        d.council_tax_band, d.service_type, d.charge_percentage, d.total_charge, d.eicr_expiry_date, d.epc_grade, d.epc_expiry_date,
        d.has_gas ? 1 : 0, d.gas_safety_expiry_date, d.rent_review_date, d.onboarded_date, d.notes]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create property' });
  }
});

app.get('/api/properties/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, l.name as landlord_name, l.phone as landlord_phone, l.email as landlord_email,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant,
        (SELECT t.id FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_id
      FROM properties p JOIN landlords l ON l.id = p.landlord_id WHERE p.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

app.put('/api/properties/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    await pool.query(`
      UPDATE properties SET landlord_id=$1, address=$2, postcode=$3, property_type=$4, bedrooms=$5, rent_amount=$6, status=$7,
        is_leasehold=$8, leasehold_start_date=$9, leasehold_end_date=$10, leaseholder_info=$11, proof_of_ownership_received=$12,
        council_tax_band=$13, service_type=$14, charge_percentage=$15, total_charge=$16, has_live_tenancy=$17, tenancy_start_date=$18,
        tenancy_type=$19, has_end_date=$20, tenancy_end_date=$21, rent_review_date=$22, eicr_expiry_date=$23, epc_grade=$24,
        epc_expiry_date=$25, has_gas=$26, gas_safety_expiry_date=$27, onboarded_date=$28, notes=$29, updated_at=CURRENT_TIMESTAMP WHERE id=$30
    `, [d.landlord_id, d.address, d.postcode, d.property_type, d.bedrooms, d.rent_amount, d.status,
        d.is_leasehold ? 1 : 0, d.leasehold_start_date, d.leasehold_end_date, d.leaseholder_info, d.proof_of_ownership_received ? 1 : 0,
        d.council_tax_band, d.service_type, d.charge_percentage, d.total_charge, d.has_live_tenancy ? 1 : 0, d.tenancy_start_date,
        d.tenancy_type, d.has_end_date ? 1 : 0, d.tenancy_end_date, d.rent_review_date, d.eicr_expiry_date, d.epc_grade,
        d.epc_expiry_date, d.has_gas ? 1 : 0, d.gas_safety_expiry_date, d.onboarded_date, d.notes, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// ============ TASKS ============

app.get('/api/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT t.*, u.name as assigned_to_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to`;
    if (status === 'active') query += " WHERE t.status IN ('pending', 'in_progress')";
    query += ` ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.due_date NULLS LAST`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type } = req.body;
    const result = await pool.query(`
      INSERT INTO tasks (title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [title, description, priority || 'medium', assigned_to, entity_type, entity_id, due_date, task_type || 'manual']);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, description, priority, status, assigned_to, due_date, follow_up_date, notes } = req.body;
    const completed_at = status === 'completed' ? new Date().toISOString() : null;
    await pool.query(`
      UPDATE tasks SET title=$1, description=$2, priority=$3, status=$4, assigned_to=$5, due_date=$6,
        follow_up_date=$7, notes=$8, completed_at=$9, updated_at=CURRENT_TIMESTAMP WHERE id=$10
    `, [title, description, priority, status, assigned_to, due_date, follow_up_date, notes, completed_at, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// ============ MAINTENANCE ============

app.get('/api/maintenance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, p.address, l.name as landlord_name FROM maintenance m
      JOIN properties p ON p.id = m.property_id JOIN landlords l ON l.id = p.landlord_id
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, m.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch maintenance' });
  }
});

app.post('/api/maintenance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const result = await pool.query(`
      INSERT INTO maintenance (property_id, tenant_id, landlord_id, reporter_name, reporter_email, reporter_phone,
        reporter_type, title, description, category, priority)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id
    `, [d.property_id, d.tenant_id, d.landlord_id, d.reporter_name, d.reporter_email, d.reporter_phone,
        d.reporter_type, d.title, d.description, d.category, d.priority || 'medium']);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create maintenance' });
  }
});

app.put('/api/maintenance/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const completed_date = d.status === 'completed' ? new Date().toISOString().split('T')[0] : d.completed_date;
    await pool.query(`
      UPDATE maintenance SET status=$1, contractor=$2, contractor_phone=$3, cost=$4, resolution_notes=$5,
        notes=$6, completed_date=$7, updated_at=CURRENT_TIMESTAMP WHERE id=$8
    `, [d.status, d.contractor, d.contractor_phone, d.cost, d.resolution_notes, d.notes, completed_date, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update maintenance' });
  }
});

// ============ TENANCIES ============

app.get('/api/tenancies', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT tn.*, p.address, p.postcode, t.name as tenant_name, t.phone as tenant_phone
      FROM tenancies tn JOIN properties p ON p.id = tn.property_id JOIN tenants t ON t.id = tn.tenant_id
      ORDER BY tn.start_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenancies' });
  }
});

app.post('/api/tenancies', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO tenancies (property_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,'active',$7) RETURNING id
    `, [property_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, notes]);
    await pool.query("UPDATE properties SET status = 'let' WHERE id = $1", [property_id]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenancy' });
  }
});

// ============ TRANSACTIONS ============

app.get('/api/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT tr.*, p.address, t.name as tenant_name FROM transactions tr
      JOIN tenancies tn ON tn.id = tr.tenancy_id JOIN properties p ON p.id = tn.property_id
      JOIN tenants t ON t.id = tn.tenant_id ORDER BY tr.date DESC, tr.created_at DESC LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { tenancy_id, type, amount, description, date } = req.body;
    const result = await pool.query(`
      INSERT INTO transactions (tenancy_id, type, amount, description, date, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
    `, [tenancy_id, type, amount, description, date, req.user!.id]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// ============ RENT PAYMENTS ============

app.get('/api/rent-payments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT rp.*, p.address, t.name as tenant_name FROM rent_payments rp
      JOIN properties p ON p.id = rp.property_id LEFT JOIN tenants t ON t.id = rp.tenant_id
      ORDER BY rp.due_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rent payments' });
  }
});

// ============ PROPERTY VIEWINGS ============

app.get('/api/property-viewings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*, p.address FROM property_viewings v JOIN properties p ON p.id = v.property_id
      ORDER BY v.viewing_date DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch viewings' });
  }
});

app.post('/api/property-viewings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes } = req.body;
    const result = await pool.query(`
      INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes]);
    
    if (enquiry_id) {
      await pool.query("UPDATE tenant_enquiries SET status = 'viewing_booked', viewing_date = $1 WHERE id = $2", [viewing_date, enquiry_id]);
    }
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create viewing' });
  }
});

// ============ DOCUMENTS ============

const DOC_TYPES: Record<string, string[]> = {
  landlord: ['Primary Identification', 'Address Identification', 'Proof of Funds', 'Proof of Ownership', 'Other'],
  landlord_bdm: ['Notes', 'Other'],
  tenant: ['Primary Identification', 'Address Identification', 'Application Form(s)', 'Deed of Guarantee', 'Other'],
  tenant_enquiry: ['Primary Identification', 'Address Identification', 'Application Form(s)', 'Other'],
  property: ['Gas Safety Certificate', 'EPC', 'EICR', 'Proof of Ownership', 'Insurance', 'Floor Plan', 'Photos', 'Other'],
  maintenance: ['Photos', 'Quote', 'Invoice', 'Other']
};

app.get('/api/documents/types/:entityType', authMiddleware, (req: AuthRequest, res) => {
  res.json(DOC_TYPES[req.params.entityType] || []);
});

app.get('/api/documents/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      `SELECT id, doc_type, original_name, mime_type, size, uploaded_at FROM documents WHERE entity_type = $1 AND entity_id = $2 ORDER BY uploaded_at DESC`,
      [req.params.entityType, req.params.entityId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/documents/:entityType/:entityId', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { doc_type } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file' });
    
    const result = await pool.query(`
      INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `, [entityType, entityId, doc_type, file.filename, file.originalname, file.mimetype, file.size, req.user?.id]);
    res.json({ id: result.rows[0].id, doc_type, original_name: file.originalname });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload' });
  }
});

app.get('/api/documents/download/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const doc = result.rows[0];
    const filePath = path.join(uploadsDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download' });
  }
});

app.delete('/api/documents/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const doc = result.rows[0];
    const filePath = path.join(uploadsDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ============ USERS ============

app.get('/api/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const result = await pool.query('SELECT id, email, name, role, is_active, created_at, last_login FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// SPA fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Start server
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Fleming CRM running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
