import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool, { initDb, query, queryOne, insert, run } from './db-pg';
import { generateToken, authMiddleware, AuthRequest, requireRole } from './auth';
import { registerInventoryRoutes } from './inventory-routes';
import { validateTwilioWebhook, normalizeUkPhone as normalizePhone } from './sms';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { startScheduler } from './scheduler-pg';

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Please set DATABASE_URL to your PostgreSQL connection string');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
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
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(cors());
app.use(express.json({
  verify: (req: any, _res, buf) => {
    // Preserve raw body for webhook signature verification (Resend uses svix)
    if (req.originalUrl === '/api/email/webhook') {
      req.rawBody = buf.toString();
    }
  }
}));
app.use(express.urlencoded({ extended: false }));

// Rate limiters for public (unauthenticated) endpoints
const publicSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 submissions per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this IP, please try again later' },
});

const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // 60 reads per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later' },
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Fleming CRM API',
    timestamp: new Date().toISOString(),
    documentation: '/api/health'
  });
});

// Serve static files (disabled in production - frontend deployed separately)
// app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// ============ AUDIT LOGGING ============

async function logAudit(userId: number | undefined, userEmail: string | undefined, action: string, entityType: string, entityId?: number, changes?: any) {
  try {
    await query(
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
    const user = await queryOne('SELECT * FROM users WHERE email = $1 AND is_active = 1', [email]);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    await run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    await logAudit(user.id, user.email, 'login', 'user', user.id);
    
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
    const existing = await queryOne('SELECT COUNT(*) as count FROM users');
    if (parseInt(existing.count) > 0) {
      return res.status(400).json({ error: 'Setup already completed' });
    }
    
    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await query('INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)', 
      [email, hashedPassword, name, 'admin']);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// ============ DASHBOARD ============

app.get('/api/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const stats: any = {};
    
    stats.properties = (await queryOne('SELECT COUNT(*) as c FROM properties')).c;
    stats.propertiesLet = (await queryOne("SELECT COUNT(*) as c FROM properties WHERE status = 'let'")).c;
    stats.landlords = (await queryOne('SELECT COUNT(*) as c FROM landlords')).c;
    stats.tenants = (await queryOne('SELECT COUNT(*) as c FROM tenants')).c;
    stats.activeTenancies = (await queryOne("SELECT COUNT(*) as c FROM tenancies WHERE status = 'active'")).c;
    stats.openMaintenance = (await queryOne("SELECT COUNT(*) as c FROM maintenance WHERE status IN ('open', 'in_progress')")).c;
    
    stats.bdmProspects = (await queryOne("SELECT COUNT(*) as c FROM landlords_bdm WHERE status NOT IN ('onboarded', 'not_interested')")).c;
    stats.enquiries = (await queryOne("SELECT COUNT(*) as c FROM tenant_enquiries WHERE status NOT IN ('rejected', 'converted')")).c;
    
    stats.tasksOverdue = (await queryOne("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date < CURRENT_DATE")).c;
    stats.tasksDueToday = (await queryOne("SELECT COUNT(*) as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date = CURRENT_DATE")).c;
    
    stats.complianceAlerts = await query(`
      SELECT id as property_id, address, 'EICR' as type, eicr_expiry_date as expiry_date
      FROM properties WHERE eicr_expiry_date IS NOT NULL AND eicr_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT id, address, 'EPC', epc_expiry_date FROM properties WHERE epc_expiry_date IS NOT NULL AND epc_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT id, address, 'Gas Safety', gas_safety_expiry_date FROM properties WHERE has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      ORDER BY expiry_date LIMIT 10
    `);
    
    stats.recentMaintenance = await query(`
      SELECT m.*, p.address FROM maintenance m
      JOIN properties p ON p.id = m.property_id
      WHERE m.status IN ('open', 'in_progress')
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               m.created_at DESC LIMIT 5
    `);
    
    stats.recentTasks = await query(`
      SELECT t.id, t.title, t.priority, t.due_date FROM tasks t
      WHERE t.status IN ('pending', 'in_progress')
      ORDER BY t.due_date NULLS LAST, CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
      LIMIT 5
    `);
    
    await logAudit(req.user?.id, req.user?.email, 'view', 'dashboard');
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============ LANDLORDS ============

app.get('/api/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const landlords = await query(`
      SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l ORDER BY l.name
    `);
    res.json(landlords);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlords' });
  }
});

app.post('/api/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    if (!d.name) return res.status(400).json({ error: 'Name is required' });
    const cols = ['name','email','phone','alt_email','date_of_birth','home_address','address',
      'company_number','entity_type','marketing_post','marketing_email','marketing_phone',
      'marketing_sms','kyc_completed','landlord_type','referral_source','notes'];
    const insertCols: string[] = [];
    const insertVals: any[] = [];
    const placeholders: string[] = [];
    let pIdx = 1;
    for (const key of cols) {
      if (key in d && d[key] !== undefined) {
        insertCols.push(key);
        placeholders.push(`$${pIdx++}`);
        insertVals.push(d[key] ?? null);
      }
    }
    const id = await insert(
      `INSERT INTO landlords (${insertCols.join(',')}) VALUES (${placeholders.join(',')})`,
      insertVals
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'landlord', id);
    res.json({ id });
  } catch (err) {
    console.error('Failed to create landlord:', err);
    res.status(500).json({ error: 'Failed to create landlord' });
  }
});

app.get('/api/landlords/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const landlord = await queryOne(`
      SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l WHERE l.id = $1
    `, [id]);
    if (!landlord) return res.status(404).json({ error: 'Landlord not found' });
    
    await logAudit(req.user?.id, req.user?.email, 'view', 'landlord', parseInt(id));
    res.json(landlord);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlord' });
  }
});

app.put('/api/landlords/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed = [
      'name','email','phone','alt_email','date_of_birth','home_address','address',
      'company_number','entity_type','marketing_post','marketing_email','marketing_phone',
      'marketing_sms','kyc_completed','landlord_type','referral_source','notes'
    ];
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(id);
    await run(`UPDATE landlords SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'landlord', parseInt(id), req.body);
    const updated = await queryOne('SELECT * FROM landlords WHERE id = $1', [id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update landlord' });
  }
});

app.delete('/api/landlords/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    await run('UPDATE properties SET landlord_id = NULL WHERE landlord_id = $1', [id]);
    await run('DELETE FROM property_landlords WHERE landlord_id = $1', [id]);
    await run('DELETE FROM directors WHERE landlord_id = $1', [id]);
    await run('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['landlord', id]);
    await run('DELETE FROM landlords WHERE id = $1', [id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'landlord', parseInt(id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete landlord' });
  }
});

app.post('/api/landlords/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    // Delete associated properties first (cascade delete)
    await run(`DELETE FROM properties WHERE landlord_id IN (${placeholders})`, ids);
    // Then delete landlords
    await run(`DELETE FROM landlords WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'landlord', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete landlords' });
  }
});

// Check for duplicate landlords
app.get('/api/landlords/check-duplicates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { email, phone, exclude_id } = req.query;
    const results: any[] = [];

    if (email) {
      // Check landlords
      const landlords = await query(
        'SELECT id, name, email, phone FROM landlords WHERE email = $1 AND id != $2',
        [email, exclude_id || 0]
      );
      landlords.forEach((l: any) => results.push({ ...l, source: 'landlords', match_type: 'email' }));

      // Check tenants
      const tenants = await query(
        'SELECT id, name, email, phone FROM tenants WHERE email = $1 OR email_2 = $1',
        [email]
      );
      tenants.forEach((t: any) => results.push({ ...t, source: 'tenants', match_type: 'email' }));

      // Check enquiries
      const enquiries = await query(
        `SELECT id, first_name_1, last_name_1, email_1 as email, phone_1 as phone
         FROM tenant_enquiries WHERE email_1 = $1 OR email_2 = $1`,
        [email]
      );
      enquiries.forEach((e: any) => results.push({
        ...e,
        name: `${e.first_name_1} ${e.last_name_1}`,
        source: 'tenant_enquiries',
        match_type: 'email'
      }));
    }

    if (phone) {
      const landlords = await query(
        'SELECT id, name, email, phone FROM landlords WHERE phone = $1 AND id != $2',
        [phone, exclude_id || 0]
      );
      landlords.forEach((l: any) => {
        if (!results.find((r: any) => r.source === 'landlords' && r.id === l.id)) {
          results.push({ ...l, source: 'landlords', match_type: 'phone' });
        }
      });

      const tenants = await query(
        'SELECT id, name, email, phone FROM tenants WHERE phone = $1 OR phone_2 = $1',
        [phone]
      );
      tenants.forEach((t: any) => {
        if (!results.find((r: any) => r.source === 'tenants' && r.id === t.id)) {
          results.push({ ...t, source: 'tenants', match_type: 'phone' });
        }
      });

      const enquiries = await query(
        `SELECT id, first_name_1, last_name_1, email_1 as email, phone_1 as phone
         FROM tenant_enquiries WHERE phone_1 = $1 OR phone_2 = $1`,
        [phone]
      );
      enquiries.forEach((e: any) => {
        if (!results.find((r: any) => r.source === 'tenant_enquiries' && r.id === e.id)) {
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

// ============ DIRECTORS ============

// Get all directors (for search functionality)
app.get('/api/directors', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const directors = await query('SELECT * FROM directors ORDER BY name');
    res.json(directors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch directors' });
  }
});

// Get all directors for a landlord
app.get('/api/landlords/:landlordId/directors', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const directors = await query('SELECT * FROM directors WHERE landlord_id = $1 ORDER BY created_at DESC', [req.params.landlordId]);
    res.json(directors);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch directors' });
  }
});

// Create a director
app.post('/api/landlords/:landlordId/directors', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, date_of_birth, role, kyc_completed, notes } = req.body;
    const result = await queryOne(
      `INSERT INTO directors (landlord_id, name, email, phone, date_of_birth, role, kyc_completed, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.params.landlordId, name, email || null, phone || null, date_of_birth || null, role || null, kyc_completed ? 1 : 0, notes || null]
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'director', result.id);
    res.json({ id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create director' });
  }
});

// Update a director
app.put('/api/directors/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, date_of_birth, role, kyc_completed, notes } = req.body;
    await run(
      `UPDATE directors SET name=$1, email=$2, phone=$3, date_of_birth=$4, role=$5, kyc_completed=$6, notes=$7, updated_at=CURRENT_TIMESTAMP
       WHERE id=$8`,
      [name, email || null, phone || null, date_of_birth || null, role || null, kyc_completed ? 1 : 0, notes || null, req.params.id]
    );
    await logAudit(req.user?.id, req.user?.email, 'update', 'director', parseInt(req.params.id as string), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update director' });
  }
});

// Delete a director
app.delete('/api/directors/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await run('DELETE FROM directors WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'director', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete director' });
  }
});

// Get companies where a landlord is a director (by matching name)
app.get('/api/landlords/:landlordId/director-of', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const landlord = await queryOne('SELECT name FROM landlords WHERE id = $1', [req.params.landlordId]);
    if (!landlord) {
      return res.json([]);
    }

    // Find all companies where this landlord's name matches a director's name
    const companies = await query(`
      SELECT l.id, l.name, l.email, l.phone, d.role, d.id as director_id
      FROM directors d
      JOIN landlords l ON d.landlord_id = l.id
      WHERE d.name = $1
      ORDER BY l.name
    `, [landlord.name]);

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch director relationships' });
  }
});

// ============ PROPERTY LANDLORDS (Many-to-Many) ============

// Get all landlords for a property
app.get('/api/properties/:propertyId/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const landlords = await query(`
      SELECT l.*, pl.is_primary, pl.ownership_percentage, pl.ownership_entity_type, pl.id as link_id
      FROM property_landlords pl
      JOIN landlords l ON pl.landlord_id = l.id
      WHERE pl.property_id = $1
      ORDER BY pl.is_primary DESC, l.name
    `, [req.params.propertyId]);
    res.json(landlords);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property landlords' });
  }
});

// Add landlord to property
app.post('/api/properties/:propertyId/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { landlord_id, is_primary, ownership_percentage, ownership_entity_type } = req.body;

    // If setting as primary, unset other primary landlords
    if (is_primary) {
      await run('UPDATE property_landlords SET is_primary = 0 WHERE property_id = $1', [req.params.propertyId]);
    }

    const result = await queryOne(`
      INSERT INTO property_landlords (property_id, landlord_id, is_primary, ownership_percentage, ownership_entity_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [req.params.propertyId, landlord_id, is_primary ? 1 : 0, ownership_percentage || null, ownership_entity_type || 'individual']);

    await logAudit(req.user?.id, req.user?.email, 'create', 'property_landlord', result.id, { property_id: req.params.propertyId, landlord_id });
    res.json({ id: result.id, success: true });
  } catch (err: any) {
    if (err.message && err.message.includes('duplicate key')) {
      res.status(400).json({ error: 'This landlord is already linked to this property' });
    } else {
      res.status(500).json({ error: 'Failed to add landlord to property' });
    }
  }
});

// Update property landlord link (e.g., change primary status)
// Create property-landlord link (alternative to POST /api/properties/:propertyId/landlords)
app.post('/api/property-landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, landlord_id, is_primary, ownership_percentage, ownership_entity_type } = req.body;
    if (is_primary) {
      await run('UPDATE property_landlords SET is_primary = 0 WHERE property_id = $1', [property_id]);
    }
    const result = await queryOne(`
      INSERT INTO property_landlords (property_id, landlord_id, is_primary, ownership_percentage, ownership_entity_type)
      VALUES ($1, $2, $3, $4, $5) RETURNING id
    `, [property_id, landlord_id, is_primary ? 1 : 0, ownership_percentage || null, ownership_entity_type || 'individual']);

    // Also update properties.landlord_id if setting as primary
    if (is_primary) {
      await run('UPDATE properties SET landlord_id = $1 WHERE id = $2', [landlord_id, property_id]);
    }

    await logAudit(req.user?.id, req.user?.email, 'create', 'property_landlord', result.id, { property_id, landlord_id });
    res.json({ id: result.id, success: true });
  } catch (err: any) {
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(400).json({ error: 'This landlord is already linked to this property' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to link property to landlord' });
  }
});

app.put('/api/property-landlords/:linkId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { is_primary, ownership_percentage, ownership_entity_type } = req.body;
    const link = await queryOne('SELECT * FROM property_landlords WHERE id = $1', [req.params.linkId]);

    if (!link) return res.status(404).json({ error: 'Link not found' });

    // If setting as primary, unset other primary landlords for this property
    if (is_primary) {
      await run('UPDATE property_landlords SET is_primary = 0 WHERE property_id = $1', [link.property_id]);
    }

    await run(`
      UPDATE property_landlords
      SET is_primary = $1, ownership_percentage = $2, ownership_entity_type = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [is_primary ? 1 : 0, ownership_percentage || null, ownership_entity_type || 'individual', req.params.linkId]);

    await logAudit(req.user?.id, req.user?.email, 'update', 'property_landlord', parseInt(req.params.linkId as string), { is_primary, ownership_percentage, ownership_entity_type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property landlord link' });
  }
});

// Remove landlord from property
app.delete('/api/property-landlords/:linkId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await run('DELETE FROM property_landlords WHERE id = $1', [req.params.linkId]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'property_landlord', parseInt(req.params.linkId as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove landlord from property' });
  }
});

// ============ LANDLORDS BDM ============

app.get('/api/landlords-bdm', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const prospects = await query(`SELECT * FROM landlords_bdm ORDER BY created_at DESC`);
    res.json(prospects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlords BDM' });
  }
});

app.post('/api/landlords-bdm', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone, address, status, follow_up_date, source, notes } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const id = await insert(
      'INSERT INTO landlords_bdm (name, email, phone, address, status, follow_up_date, source, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [name, email || null, phone || null, address || null, status || 'new', follow_up_date || null, source || null, notes || null]
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'landlords_bdm', id, req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create landlord BDM' });
  }
});

app.get('/api/landlords-bdm/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const prospect = await queryOne('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id as string]);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    res.json(prospect);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prospect' });
  }
});

app.put('/api/landlords-bdm/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const allowed = ['name', 'email', 'phone', 'address', 'status', 'follow_up_date', 'source', 'notes'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE landlords_bdm SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'landlords_bdm', parseInt(req.params.id as string), d);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prospect' });
  }
});

app.post('/api/landlords-bdm/:id/convert', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const prospect = await queryOne('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id as string]);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    if (prospect.status === 'onboarded') return res.status(400).json({ error: 'Prospect already converted' });

    const { landlord_type } = req.body || {};

    const landlordId = await insert(
      'INSERT INTO landlords (name, email, phone, address, notes, landlord_type, referral_source) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [prospect.name, prospect.email, prospect.phone, prospect.address, prospect.notes, landlord_type || 'external', prospect.source]
    );
    await run("UPDATE landlords_bdm SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id as string]);

    await logAudit(req.user?.id, req.user?.email, 'create', 'landlord', landlordId, { converted_from_bdm: parseInt(req.params.id as string) });
    await logAudit(req.user?.id, req.user?.email, 'update', 'landlords_bdm', parseInt(req.params.id as string), { converted_to_landlord: landlordId });

    res.json({ landlord_id: landlordId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert prospect' });
  }
});

app.post('/api/landlords-bdm/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await run(`DELETE FROM landlords_bdm WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'landlord_bdm', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete landlords BDM' });
  }
});

// ============ TENANT ENQUIRIES ============

app.get('/api/tenant-enquiries', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiries = await query(`
      SELECT te.*, p.address as property_address FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      ORDER BY te.created_at DESC
    `);
    res.json(enquiries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
});

// Public endpoint for landlord enquiry form submissions (no auth required)
app.post('/api/public/landlord-enquiries', publicSubmitLimiter, async (req, res) => {
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
      // Company details (if Limited Company)
      company_name,
      company_number,
      company_address,
      // Additional
      additionalNotes,
      marketingConsent,
      marketing_preferences
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
    const recentSubmissions = await query(`
      SELECT id FROM landlords_bdm
      WHERE email = $1
      AND created_at > NOW() - INTERVAL '24 hours'
      LIMIT 1
    `, [email]);

    if (recentSubmissions.length > 0) {
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

    if (registration_type === 'Limited Company' && (company_name || company_number)) {
      notes += `=== COMPANY DETAILS ===\n`;
      notes += `Company Name: ${company_name || 'N/A'}\n`;
      notes += `Company Number: ${company_number || 'N/A'}\n`;
      if (company_address) notes += `Registered Address: ${company_address}\n`;
      notes += `\n`;
    }

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
      if (tenancyType) notes += `Tenancy Type: ${tenancyType}\n`;
      if (currentManagement) notes += `Current Management: ${currentManagement}\n`;
      if (lengthOfLet) notes += `Length of Let: ${lengthOfLet} months\n`;
      if (monthlyRentalIncome) notes += `Monthly Rental Income: £${monthlyRentalIncome}\n`;
      if (consideringRentIncrease) {
        notes += `Considering Rent Increase: ${consideringRentIncrease}\n`;
        if (consideringRentIncrease === 'Yes' && newRentAmount) {
          notes += `New Rent Amount: £${newRentAmount}\n`;
        }
      }
      notes += `\n`;
    }

    if (lookingForNewTenant) {
      notes += `=== TENANT SOURCING ===\n`;
      notes += `Looking for New Tenant: ${lookingForNewTenant}\n`;
      if (lookingForNewTenant === 'Yes' && newTenantReason) {
        notes += `Reason: ${newTenantReason}\n`;
      }
      notes += `\n`;
    }

    notes += `=== COMPLIANCE CERTIFICATES ===\n`;
    notes += `EPC: ${epcCertificate || 'Not provided'}\n`;
    notes += `EICR: ${eicrCertificate || 'Not provided'}\n`;
    notes += `Gas Safety: ${gasCertificate || 'Not provided'}\n\n`;

    if (additionalNotes) {
      notes += `=== ADDITIONAL NOTES ===\n`;
      notes += `${additionalNotes}\n\n`;
    }

    notes += `=== MARKETING ===\n`;
    notes += `Marketing Preferences: ${marketing_preferences || (marketingConsent === 'on' ? 'Yes' : 'None')}\n`;

    // Get client IP for audit
    const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    notes += `\nForm submitted from IP: ${client_ip}\n`;
    notes += `Submission date: ${new Date().toISOString()}\n`;

    // Insert into landlords_bdm table
    const result = await query(`
      INSERT INTO landlords_bdm (
        name, email, phone, address, status, source, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      `${firstName} ${surname}`,
      email,
      phone,
      `${address}, ${postcode}`,
      'new',
      'Website Enquiry Form',
      notes
    ]);

    console.log(`[LANDLORD ENQUIRY] New submission from ${firstName} ${surname} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Landlord enquiry submitted successfully',
      enquiry_id: result[0].id
    });

  } catch (error) {
    console.error('[LANDLORD ENQUIRY ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your enquiry. Please try again or contact us directly.'
    });
  }
});

// Public endpoint for external form submissions (no auth required)
app.post('/api/public/tenant-enquiries', publicSubmitLimiter, async (req, res) => {
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
      property_id,
      // New fields from updated form
      contract_type,
      contract_type2,
      additional_notes,
      marketing_preferences,
      has_property_interest
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

    // Determine if joint application
    const is_joint = registration_type === 'Joint' ? 1 : 0;

    // Get client IP for audit
    const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Only store user's additional notes - structured data goes into proper columns
    let notes = '';
    if (additional_notes) {
      notes = additional_notes;
    }
    if (marketing_preferences) {
      notes += (notes ? '\n\n' : '') + `Marketing preferences: ${marketing_preferences}`;
    }

    // Extract Applicant 2 data before building primary record (will go into separate linked record)
    const app2RawFields: Record<string, any> = {
      first_name_1: FirstName2 || null,
      last_name_1: Surname2 || null,
      email_1: form_email2 || null,
      phone_1: contactNumber2 || null,
      current_address_1: address2 || null,
      postcode_1: Postcode2 || null,
      years_at_address_1: yearofaddress2 || null,
      date_of_birth_1: dob2 || null,
      nationality_1: Nationality2 || null,
      employment_status_1: EmploymentStatus2 || null,
      employer_1: job_title2 || null,
      income_1: AnnualSalary2 ? parseFloat(AnnualSalary2) : null,
      contract_type_1: contract_type2 || null,
    };

    // Map form fields to database columns — primary record (Applicant 1 only)
    const data: any = {
      first_name_1: FirstName,
      last_name_1: Surname,
      email_1: form_email,
      phone_1: contactNumber,
      current_address_1: address || null,
      postcode_1: Postcode || null,
      years_at_address_1: yearofaddress || null,
      nationality_1: Nationality || null,
      date_of_birth_1: dob || null,
      employment_status_1: EmploymentStatus || null,
      employer_1: job_title || null,
      income_1: AnnualSalary ? parseFloat(AnnualSalary) : null,
      contract_type_1: contract_type || null,
      is_joint_application: is_joint,
      preferred_tenancy_type: tenancylookingfor || null,
      preferred_property_type: typeofproperty || null,
      preferred_bedrooms: noofbedrooms || null,
      preferred_parking: roadparking || null,
      max_rent: rent_max ? parseFloat(rent_max) : null,
      marketing_preferences: marketing_preferences || null,
      linked_property_id: property_id ? parseInt(property_id) : null,
      notes: notes || null,
      status: 'new'
    };

    const values: any[] = [];
    const placeholders: string[] = [];
    const cols: string[] = [];

    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        cols.push(key);
        placeholders.push(`$${idx++}`);
        values.push(value);
      }
    }

    const id = await insert(
      `INSERT INTO tenant_enquiries (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );

    // If joint application, create a separate linked record for Applicant 2
    let partnerId: number | null = null;
    if (is_joint && app2RawFields.first_name_1) {
      const partnerData: Record<string, any> = {
        ...app2RawFields,
        is_joint_application: 1,
        joint_partner_id: id,
        linked_property_id: data.linked_property_id || null,
        preferred_tenancy_type: data.preferred_tenancy_type || null,
        preferred_property_type: data.preferred_property_type || null,
        preferred_bedrooms: data.preferred_bedrooms || null,
        preferred_parking: data.preferred_parking || null,
        max_rent: data.max_rent || null,
        notes: data.notes || null,
        status: 'new'
      };

      const pCols: string[] = [];
      const pPlaceholders: string[] = [];
      const pValues: any[] = [];
      let pIdx = 1;
      for (const [key, value] of Object.entries(partnerData)) {
        if (value !== null && value !== undefined && value !== '') {
          pCols.push(key);
          pPlaceholders.push(`$${pIdx++}`);
          pValues.push(value);
        }
      }

      partnerId = await insert(
        `INSERT INTO tenant_enquiries (${pCols.join(', ')}) VALUES (${pPlaceholders.join(', ')})`,
        pValues
      );

      // Link primary record back to partner
      await run('UPDATE tenant_enquiries SET joint_partner_id = $1 WHERE id = $2', [partnerId, id]);
    }

    res.json({
      enquiry_id: id,
      partner_enquiry_id: partnerId,
      reference: `ENQ-${id}`,
      success: true,
      message: 'Enquiry submitted successfully'
    });
  } catch (err) {
    console.error('Public enquiry submission error:', err);
    res.status(500).json({
      error: 'Failed to submit enquiry',
      details: err instanceof Error ? err.message : String(err)
    });
  }
});

// PUBLIC ENDPOINT - Upload documents for a tenant enquiry (no auth)
app.post('/api/public/tenant-enquiries/:id/documents', publicSubmitLimiter, upload.array('documents', 10), async (req, res) => {
  try {
    const enquiryId = req.params.id;
    const enquiry = await queryOne('SELECT id FROM tenant_enquiries WHERE id = $1', [enquiryId]);
    if (!enquiry) {
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    for (const file of files) {
      await insert(
        'INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['tenant_enquiry', enquiryId, 'supporting_document', file.filename, file.originalname, file.mimetype, file.size, 'public_form']
      );
    }
    res.json({ success: true, message: `${files.length} document(s) uploaded` });
  } catch (err) {
    console.error('Public document upload error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Internal authenticated endpoint
app.post('/api/tenant-enquiries', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;

    // Applicant 1 fields for primary record
    const primaryFields = [
      'title_1', 'first_name_1', 'last_name_1', 'email_1', 'phone_1',
      'date_of_birth_1', 'current_address_1', 'employment_status_1',
      'employer_1', 'income_1', 'nationality_1', 'contract_type_1',
      'is_joint_application', 'linked_property_id', 'notes', 'status'
    ];

    const values: any[] = [];
    const placeholders: string[] = [];
    const cols: string[] = [];

    let idx = 1;
    for (const field of primaryFields) {
      if (field in d && d[field] !== '' && d[field] !== null) {
        cols.push(field);
        placeholders.push(`$${idx++}`);
        values.push(d[field]);
      }
    }

    // Ensure required fields
    if (!cols.includes('first_name_1')) {
      return res.status(400).json({ error: 'First name is required' });
    }
    if (!cols.includes('last_name_1')) {
      return res.status(400).json({ error: 'Last name is required' });
    }
    if (!cols.includes('email_1')) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!cols.includes('status')) {
      cols.push('status');
      placeholders.push(`$${idx++}`);
      values.push('new');
    }

    const id = await insert(
      `INSERT INTO tenant_enquiries (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );

    // If joint application with Applicant 2 data, create a linked partner record
    let partnerId: number | null = null;
    if (d.is_joint_application && d.first_name_2) {
      const app2FieldMap: Record<string, string> = {
        title_2: 'title_1', first_name_2: 'first_name_1', last_name_2: 'last_name_1',
        email_2: 'email_1', phone_2: 'phone_1', date_of_birth_2: 'date_of_birth_1',
        current_address_2: 'current_address_1', employment_status_2: 'employment_status_1',
        employer_2: 'employer_1', income_2: 'income_1', nationality_2: 'nationality_1',
        contract_type_2: 'contract_type_1'
      };

      const partnerData: Record<string, any> = {
        is_joint_application: 1,
        joint_partner_id: id,
        linked_property_id: d.linked_property_id || null,
        status: d.status || 'new'
      };
      for (const [srcKey, dstKey] of Object.entries(app2FieldMap)) {
        if (srcKey in d && d[srcKey] !== '' && d[srcKey] !== null) {
          partnerData[dstKey] = d[srcKey];
        }
      }

      const pCols: string[] = [];
      const pPlaceholders: string[] = [];
      const pValues: any[] = [];
      let pIdx = 1;
      for (const [key, value] of Object.entries(partnerData)) {
        if (value !== null && value !== undefined && value !== '') {
          pCols.push(key);
          pPlaceholders.push(`$${pIdx++}`);
          pValues.push(value);
        }
      }

      partnerId = await insert(
        `INSERT INTO tenant_enquiries (${pCols.join(', ')}) VALUES (${pPlaceholders.join(', ')})`,
        pValues
      );

      await run('UPDATE tenant_enquiries SET joint_partner_id = $1 WHERE id = $2', [partnerId, id]);
    }

    await logAudit(req.user?.id, req.user?.email, 'create', 'tenant_enquiry', id, d);
    res.json({ id, partner_id: partnerId });
  } catch (err) {
    console.error('Enquiry creation error:', err);
    res.status(500).json({ error: 'Failed to create enquiry' });
  }
});

app.get('/api/tenant-enquiries/check-duplicates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { email, phone, exclude_id } = req.query;
    const results: any[] = [];

    // Get the joint partner ID so we can exclude it from duplicate results
    let excludePartnerIds: number[] = [];
    if (exclude_id) {
      const currentEnquiry = await queryOne('SELECT joint_partner_id FROM tenant_enquiries WHERE id = $1', [exclude_id]);
      if (currentEnquiry?.joint_partner_id) {
        excludePartnerIds.push(currentEnquiry.joint_partner_id);
      }
      // Also check if this record IS a partner (someone else points to us)
      const pointingToUs = await queryOne('SELECT id FROM tenant_enquiries WHERE joint_partner_id = $1', [exclude_id]);
      if (pointingToUs) {
        excludePartnerIds.push(pointingToUs.id);
      }
    }
    const excludeIds = [Number(exclude_id) || 0, ...excludePartnerIds];

    if (email) {
      const tenantByEmail = await query('SELECT id, name, email, phone, property_id FROM tenants WHERE email = $1 OR email_2 = $1', [email]);
      tenantByEmail.forEach((t: any) => results.push({ ...t, source: 'tenant', match: 'email' }));

      const landlordByEmail = await query('SELECT id, name, email, phone FROM landlords WHERE email = $1', [email]);
      landlordByEmail.forEach((l: any) => results.push({ ...l, source: 'landlord', match: 'email' }));

      const enqByEmail = await query(
        `SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE email_1 = $1 AND id != ALL($2::int[])`,
        [email, excludeIds]
      );
      enqByEmail.forEach((e: any) => results.push({ ...e, name: `${e.first_name_1} ${e.last_name_1}`, source: 'enquiry', match: 'email' }));
    }

    if (phone) {
      const tenantByPhone = await query('SELECT id, name, email, phone, property_id FROM tenants WHERE phone = $1 OR phone_2 = $1', [phone]);
      tenantByPhone.forEach((t: any) => {
        if (!results.find(r => r.source === 'tenant' && r.id === t.id)) results.push({ ...t, source: 'tenant', match: 'phone' });
      });

      const landlordByPhone = await query('SELECT id, name, email, phone FROM landlords WHERE phone = $1', [phone]);
      landlordByPhone.forEach((l: any) => {
        if (!results.find(r => r.source === 'landlord' && r.id === l.id)) results.push({ ...l, source: 'landlord', match: 'phone' });
      });

      const enqByPhone = await query(
        `SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE phone_1 = $1 AND id != ALL($2::int[])`,
        [phone, excludeIds]
      );
      enqByPhone.forEach((e: any) => {
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

app.post('/api/tenant-enquiries/:id/convert', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiry = await queryOne('SELECT * FROM tenant_enquiries WHERE id = $1', [req.params.id]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (enquiry.status === 'converted') return res.status(400).json({ error: 'Enquiry already converted' });

    const { property_id, tenancy_start_date, tenancy_type, monthly_rent } = req.body;
    const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;
    const isJoint = !!enquiry.joint_partner_id;

    // Create tenant record for this applicant — copy onboarding data collected during pipeline
    const hasGuarantor = !!(enquiry.app_guarantor_name || enquiry.app_guarantor_phone || enquiry.app_guarantor_email);
    const tenantId = await insert(`
      INSERT INTO tenants (
        title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
        is_joint_tenancy, kyc_completed_1, property_id, tenancy_start_date, tenancy_type, monthly_rent,
        holding_deposit_received, holding_deposit_amount, holding_deposit_date,
        nok_name, nok_relationship, nok_phone, nok_address,
        nok_2_name, nok_2_relationship, nok_2_phone, nok_2_address,
        guarantor_required, guarantor_name, guarantor_phone, guarantor_email, guarantor_address,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
    `, [
      enquiry.title_1, enquiry.first_name_1, enquiry.last_name_1, name, enquiry.email_1, enquiry.phone_1,
      enquiry.date_of_birth_1, isJoint ? 1 : 0, enquiry.kyc_completed_1,
      property_id, tenancy_start_date, tenancy_type, monthly_rent || enquiry.monthly_rent_agreed,
      enquiry.holding_deposit_received || 0, enquiry.holding_deposit_amount || null, enquiry.holding_deposit_received_date || null,
      enquiry.app_next_of_kin_name || null, enquiry.app_next_of_kin_relationship || null, enquiry.app_next_of_kin_phone || null, enquiry.app_next_of_kin_address || null,
      enquiry.app_next_of_kin_2_name || null, enquiry.app_next_of_kin_2_relationship || null, enquiry.app_next_of_kin_2_phone || null, enquiry.app_next_of_kin_2_address || null,
      hasGuarantor ? 1 : 0, enquiry.app_guarantor_name || null, enquiry.app_guarantor_phone || null, enquiry.app_guarantor_email || null, enquiry.app_guarantor_address || null,
      enquiry.notes || null
    ]);

    await run("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'create', 'tenant', tenantId, { converted_from_enquiry: parseInt(req.params.id as string) });
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', parseInt(req.params.id as string), { converted_to_tenant: tenantId });

    // If joint application with linked partner, convert partner too
    let partnerTenantId: number | null = null;
    if (isJoint) {
      const partner = await queryOne('SELECT * FROM tenant_enquiries WHERE id = $1', [enquiry.joint_partner_id]);
      if (partner && partner.status !== 'converted') {
        const partnerName = `${partner.first_name_1} ${partner.last_name_1}`;
        const partnerHasGuarantor = !!(partner.app_guarantor_name || partner.app_guarantor_phone || partner.app_guarantor_email);
        partnerTenantId = await insert(`
          INSERT INTO tenants (
            title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
            is_joint_tenancy, kyc_completed_1, property_id, tenancy_start_date, tenancy_type, monthly_rent,
            holding_deposit_received, holding_deposit_amount, holding_deposit_date,
            nok_name, nok_relationship, nok_phone, nok_address,
            nok_2_name, nok_2_relationship, nok_2_phone, nok_2_address,
            guarantor_required, guarantor_name, guarantor_phone, guarantor_email, guarantor_address,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
        `, [
          partner.title_1, partner.first_name_1, partner.last_name_1, partnerName, partner.email_1, partner.phone_1,
          partner.date_of_birth_1, 1, partner.kyc_completed_1,
          property_id, tenancy_start_date, tenancy_type, monthly_rent || partner.monthly_rent_agreed,
          partner.holding_deposit_received || 0, partner.holding_deposit_amount || null, partner.holding_deposit_received_date || null,
          partner.app_next_of_kin_name || null, partner.app_next_of_kin_relationship || null, partner.app_next_of_kin_phone || null, partner.app_next_of_kin_address || null,
          partner.app_next_of_kin_2_name || null, partner.app_next_of_kin_2_relationship || null, partner.app_next_of_kin_2_phone || null, partner.app_next_of_kin_2_address || null,
          partnerHasGuarantor ? 1 : 0, partner.app_guarantor_name || null, partner.app_guarantor_phone || null, partner.app_guarantor_email || null, partner.app_guarantor_address || null,
          partner.notes || null
        ]);

        await run("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [enquiry.joint_partner_id]);
        await logAudit(req.user?.id, req.user?.email, 'create', 'tenant', partnerTenantId!, { converted_from_enquiry: enquiry.joint_partner_id });
        await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiry.joint_partner_id, { converted_to_tenant: partnerTenantId });
      }
    }

    res.json({ tenant_id: tenantId, partner_tenant_id: partnerTenantId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert enquiry' });
  }
});

app.get('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiry = await queryOne(`
      SELECT te.*, p.address as property_address,
        jp.first_name_1 as partner_first_name, jp.last_name_1 as partner_last_name,
        jp.email_1 as partner_email, jp.status as partner_status
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      LEFT JOIN tenant_enquiries jp ON jp.id = te.joint_partner_id
      WHERE te.id = $1
    `, [req.params.id as string]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    await logAudit(req.user?.id, req.user?.email, 'view', 'tenant_enquiry', parseInt(req.params.id as string));
    res.json(enquiry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiry' });
  }
});

app.put('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const enquiryId = parseInt(req.params.id as string);
    // Fetch old record to detect status and onboarding field changes
    const oldRecord = await queryOne(`SELECT * FROM tenant_enquiries WHERE id=$1`, [enquiryId]);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed = ['title_1','first_name_1','last_name_1','email_1','phone_1','date_of_birth_1','current_address_1','employment_status_1','employer_1','income_1','nationality_1','contract_type_1','is_joint_application','title_2','first_name_2','last_name_2','email_2','phone_2','date_of_birth_2','current_address_2','employment_status_2','employer_2','income_2','nationality_2','contract_type_2','kyc_completed_1','kyc_completed_2','status','follow_up_date','viewing_date','viewing_with','linked_property_id','notes','rejection_reason','renting_requirements','is_permanent_address','holding_deposit_requested','holding_deposit_received','holding_deposit_amount','holding_deposit_received_date','holding_deposit_received_amount','security_deposit_amount','monthly_rent_agreed','application_form_token','application_form_sent','application_form_completed','id_primary_verified_1','id_secondary_verified_1','id_primary_verified_2','id_secondary_verified_2','bank_statements_received','source_of_funds_verified','employment_check_completed','credit_check_completed','credit_score','credit_check_date','onboarding_step','joint_partner_id'];
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE tenant_enquiries SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    // Audit logging: detect status change
    if (d.status && oldRecord && d.status !== oldRecord.status) {
      await logAudit(req.user?.id, req.user?.email, 'status_changed', 'tenant_enquiry', enquiryId, { from: oldRecord.status, to: d.status });
    }
    // Audit logging: capture onboarding field changes with old/new values
    if (oldRecord) {
      const onboardingFields = ['holding_deposit_requested','holding_deposit_received','holding_deposit_amount','holding_deposit_received_date','holding_deposit_received_amount','security_deposit_amount','monthly_rent_agreed','application_form_sent','application_form_completed','id_primary_verified_1','id_secondary_verified_1','id_primary_verified_2','id_secondary_verified_2','bank_statements_received','source_of_funds_verified','employment_check_completed','credit_check_completed','credit_score','credit_check_date','onboarding_step'];
      const fieldChanges: Record<string, { from: any; to: any }> = {};
      for (const key of onboardingFields) {
        if (key in d) {
          const oldVal = oldRecord[key] ?? null;
          const newVal = d[key] ?? null;
          if (String(oldVal) !== String(newVal)) {
            fieldChanges[key] = { from: oldVal, to: newVal };
          }
        }
      }
      if (Object.keys(fieldChanges).length > 0) {
        await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, fieldChanges);
      } else {
        await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, d);
      }
    } else {
      await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, d);
    }
    // Sync shared fields to joint partner record if linked
    const syncFields = ['status','follow_up_date','viewing_date','viewing_with','linked_property_id','notes','rejection_reason'];
    const syncData: Record<string, any> = {};
    for (const key of syncFields) {
      if (key in d) syncData[key] = d[key];
    }
    if (Object.keys(syncData).length > 0 && oldRecord?.joint_partner_id) {
      const sFields: string[] = [];
      const sValues: any[] = [];
      let sIdx = 1;
      for (const [key, value] of Object.entries(syncData)) {
        sFields.push(`${key}=$${sIdx++}`);
        sValues.push(value);
      }
      sFields.push('updated_at=CURRENT_TIMESTAMP');
      sValues.push(oldRecord.joint_partner_id);
      await run(`UPDATE tenant_enquiries SET ${sFields.join(', ')} WHERE id=$${sIdx}`, sValues);
    }

    const updated = await queryOne(`
      SELECT te.*, p.address as property_address,
        jp.first_name_1 as partner_first_name, jp.last_name_1 as partner_last_name,
        jp.email_1 as partner_email, jp.status as partner_status
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      LEFT JOIN tenant_enquiries jp ON jp.id = te.joint_partner_id
      WHERE te.id=$1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

app.post('/api/tenant-enquiries/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await run(`DELETE FROM tenant_enquiries WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'tenant_enquiry', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete tenant enquiries' });
  }
});

// ============ TENANTS ============

app.get('/api/tenants', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenants = await query(`
      SELECT t.*, p.address as property_address FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id ORDER BY t.name
    `);
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

app.post('/api/tenants', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const name = d.name || `${d.first_name_1 || ''} ${d.last_name_1 || ''}`.trim();
    const id = await insert(`
      INSERT INTO tenants (
        name, title_1, first_name_1, last_name_1, email, phone, date_of_birth_1,
        is_joint_tenancy, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2,
        nok_name, nok_relationship, nok_phone, nok_email,
        kyc_completed_1, kyc_completed_2,
        guarantor_required, guarantor_name, guarantor_address, guarantor_phone, guarantor_email,
        guarantor_kyc_completed, guarantor_deed_received,
        holding_deposit_received, holding_deposit_amount, holding_deposit_date,
        application_forms_completed, authority_to_contact, proof_of_income, deposit_scheme,
        property_id, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date,
        monthly_rent, notes, emergency_contact
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42
      )
    `, [
      name,
      d.title_1 || null, d.first_name_1 || name, d.last_name_1 || '',
      d.email || null, d.phone || null, d.date_of_birth_1 || null,
      d.is_joint_tenancy || 0,
      d.title_2 || null, d.first_name_2 || null, d.last_name_2 || null,
      d.email_2 || null, d.phone_2 || null, d.date_of_birth_2 || null,
      d.nok_name || null, d.nok_relationship || null, d.nok_phone || null, d.nok_email || null,
      d.kyc_completed_1 || 0, d.kyc_completed_2 || 0,
      d.guarantor_required || 0, d.guarantor_name || null, d.guarantor_address || null,
      d.guarantor_phone || null, d.guarantor_email || null,
      d.guarantor_kyc_completed || 0, d.guarantor_deed_received || 0,
      d.holding_deposit_received || 0, d.holding_deposit_amount || null, d.holding_deposit_date || null,
      d.application_forms_completed || 0, d.authority_to_contact || 0, d.proof_of_income || 0, d.deposit_scheme || null,
      d.property_id || null, d.tenancy_start_date || null, d.tenancy_type || null,
      d.has_end_date || 0, d.tenancy_end_date || null,
      d.monthly_rent || null, d.notes || null, d.emergency_contact || null
    ]);
    await logAudit(req.user?.id, req.user?.email, 'create', 'tenant', id);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

app.get('/api/tenants/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenant = await queryOne(`
      SELECT t.*, p.address as property_address FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id WHERE t.id = $1
    `, [req.params.id as string]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    await logAudit(req.user?.id, req.user?.email, 'view', 'tenant', parseInt(req.params.id as string));
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

app.put('/api/tenants/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    if (d.first_name_1 && d.last_name_1 && !d.name) {
      d.name = `${d.first_name_1} ${d.last_name_1}`;
    }
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed = [
      'name','title_1','first_name_1','last_name_1','email','phone','date_of_birth_1',
      'is_joint_tenancy','title_2','first_name_2','last_name_2','email_2','phone_2','date_of_birth_2',
      'nok_name','nok_relationship','nok_phone','nok_email','nok_address',
      'nok_2_name','nok_2_relationship','nok_2_phone','nok_2_email','nok_2_address',
      'kyc_completed_1','kyc_completed_2',
      'guarantor_required','guarantor_name','guarantor_address','guarantor_phone','guarantor_email',
      'guarantor_kyc_completed','guarantor_deed_received',
      'holding_deposit_received','holding_deposit_amount','holding_deposit_date',
      'application_forms_completed','authority_to_contact','proof_of_income','deposit_scheme',
      'property_id','tenancy_start_date','tenancy_type','has_end_date','tenancy_end_date',
      'monthly_rent','notes','emergency_contact'
    ];
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE tenants SET ${fields.join(', ')} WHERE id=$${idx}`, values);

    // Sync property.tenant_id when tenant changes property
    if ('property_id' in d) {
      // Remove tenant_id from old property
      await run('UPDATE properties SET tenant_id = NULL WHERE tenant_id = $1', [req.params.id]);
      // Set tenant_id on new property
      if (d.property_id) {
        await run('UPDATE properties SET tenant_id = $1 WHERE id = $2', [req.params.id, d.property_id]);
      }
    }

    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant', parseInt(req.params.id as string), req.body);
    const updated = await queryOne(`
      SELECT t.*, p.address as property_address FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id WHERE t.id=$1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

app.post('/api/tenants/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    // Update properties to remove tenant references
    await run(`UPDATE properties SET has_live_tenancy = 0, tenancy_start_date = NULL WHERE id IN (SELECT property_id FROM tenants WHERE id IN (${placeholders}))`, ids);
    // Delete tenants
    const result = await run(`DELETE FROM tenants WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'tenant', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete tenants' });
  }
});

// ============ PROPERTIES ============

// Public endpoint to get available properties for enquiry form
// Public duplicate check for enquiry forms
app.get('/api/public/check-duplicates', publicReadLimiter, async (req, res) => {
  try {
    const { email, phone } = req.query;
    if (!email && !phone) {
      return res.json({ duplicates: [] });
    }

    const duplicates: any[] = [];

    // Check tenant enquiries
    if (email) {
      const emailMatches = await query(
        `SELECT id, first_name_1, last_name_1, 'tenant_enquiry' as source, 'email' as match_type FROM tenant_enquiries WHERE email_1 = $1`,
        [email]
      );
      duplicates.push(...emailMatches);
    }
    if (phone) {
      const phoneMatches = await query(
        `SELECT id, first_name_1, last_name_1, 'tenant_enquiry' as source, 'phone' as match_type FROM tenant_enquiries WHERE phone_1 = $1`,
        [phone]
      );
      duplicates.push(...phoneMatches);
    }

    // Check tenants
    if (email) {
      const tenantEmail = await query(
        `SELECT id, name, 'tenant' as source, 'email' as match_type FROM tenants WHERE email = $1`,
        [email]
      );
      duplicates.push(...tenantEmail);
    }

    res.json({ duplicates });
  } catch (err) {
    console.error('Public duplicate check error:', err);
    res.json({ duplicates: [] }); // Fail open - don't block submissions
  }
});

// PUBLIC ENDPOINT - Companies House search (for landlord enquiry form)
app.get('/api/public/companies-house/search', publicReadLimiter, async (req, res) => {
  try {
    const q = (req.query.query as string || '').trim();
    if (!q || q.length < 3) return res.status(400).json({ error: 'Query must be at least 3 characters' });

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      return res.status(501).json({ error: 'Companies House API key not configured' });
    }

    const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`;
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
    res.json(data);
  } catch (err) {
    console.error('Public Companies House search error:', err);
    res.status(500).json({ error: 'Failed to search Companies House' });
  }
});

app.get('/api/public/properties', publicReadLimiter, async (req, res) => {
  try {
    console.log('[Public Properties] Fetching properties with status: to_let, available');
    // First get ALL properties to debug
    const allProps = await query(`SELECT p.id, p.address, p.status FROM properties p`);
    console.log(`[Public Properties] Total properties in DB: ${allProps.length}`, allProps);

    const properties = await query(`
      SELECT p.id, p.address, p.postcode, p.property_type, p.bedrooms, p.rent_amount, p.status
      FROM properties p
      WHERE LOWER(REPLACE(p.status, ' ', '_')) IN ('to_let', 'available') OR LOWER(p.status) IN ('to let', 'to_let', 'available')
      ORDER BY p.address
    `);
    console.log(`[Public Properties] Found ${properties.length} properties with status filter`);
    res.json(properties);
  } catch (err) {
    console.error('[Public Properties] Error:', err);
    res.status(500).json({ error: 'Failed to fetch properties', details: err instanceof Error ? err.message : String(err) });
  }
});

// ============ PUBLIC APPLICATION FORM (DocuSign-lite) ============

// GET form data by token (public - no auth)
app.get('/api/public/application-form/:token', publicReadLimiter, async (req, res) => {
  try {
    const enquiry = await queryOne(`
      SELECT te.*, p.address as property_address, p.postcode as property_postcode, p.rent_amount
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      WHERE te.application_form_token = $1
    `, [req.params.token]);
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
    console.error('Error fetching application form:', err);
    res.status(500).json({ error: 'Failed to load form' });
  }
});

// POST submit completed form (public - no auth)
app.post('/api/public/application-form/:token', publicSubmitLimiter, async (req, res) => {
  try {
    const enquiry = await queryOne('SELECT id, application_form_completed FROM tenant_enquiries WHERE application_form_token = $1', [req.params.token]);
    if (!enquiry) return res.status(404).json({ error: 'Form not found' });
    if (enquiry.application_form_completed) return res.status(410).json({ error: 'Already submitted' });

    const {
      app_ni_number, app_previous_address_1, app_previous_address_2,
      app_years_at_current, app_years_at_previous,
      app_has_landlord_ref, app_landlord_ref_name, app_landlord_ref_phone, app_landlord_ref_email,
      app_landlord_ref_property_address, app_landlord_ref_consent,
      app_has_employer_ref, app_employer_ref_name, app_employer_ref_phone, app_employer_ref_email,
      app_employer_ref_employee_id, app_employer_ref_consent,
      app_bank_name, app_bank_sort_code, app_bank_account_number,
      app_next_of_kin_name, app_next_of_kin_phone, app_next_of_kin_relationship, app_next_of_kin_address,
      app_next_of_kin_2_name, app_next_of_kin_2_phone, app_next_of_kin_2_relationship, app_next_of_kin_2_address,
      app_guarantor_name, app_guarantor_phone, app_guarantor_email, app_guarantor_address,
      app_signature, app_declaration_agreed,
      // Also allow updating basic info
      current_address_1, date_of_birth_1, employer_1, income_1, employment_status_1,
      // Employment detail fields
      app_employer_address, app_employer_contact, app_years_of_service,
      app_pay_frequency, app_other_income, app_tax_years,
      // Further information and individual declarations
      app_further_info,
      app_decl_holding_deposit, app_decl_info_accurate, app_decl_gdpr,
      app_decl_enquiries, app_decl_documents, app_decl_credit_check,
      app_decl_terms, app_decl_marketing,
    } = req.body;

    await run(`
      UPDATE tenant_enquiries SET
        app_ni_number=$1, app_previous_address_1=$2, app_previous_address_2=$3,
        app_years_at_current=$4, app_years_at_previous=$5,
        app_has_landlord_ref=$6, app_landlord_ref_name=$7, app_landlord_ref_phone=$8, app_landlord_ref_email=$9,
        app_landlord_ref_property_address=$10, app_landlord_ref_consent=$11,
        app_has_employer_ref=$12, app_employer_ref_name=$13, app_employer_ref_phone=$14, app_employer_ref_email=$15,
        app_employer_ref_employee_id=$16, app_employer_ref_consent=$17,
        app_bank_name=$18, app_bank_sort_code=$19, app_bank_account_number=$20,
        app_next_of_kin_name=$21, app_next_of_kin_phone=$22, app_next_of_kin_relationship=$23, app_next_of_kin_address=$24,
        app_next_of_kin_2_name=$25, app_next_of_kin_2_phone=$26, app_next_of_kin_2_relationship=$27, app_next_of_kin_2_address=$28,
        app_signature=$29, app_signed_at=NOW(), app_declaration_agreed=$30,
        application_form_completed=1,
        current_address_1=$31,
        date_of_birth_1=$32,
        employer_1=$33,
        income_1=$34,
        employment_status_1=$35,
        app_employer_address=$37, app_employer_contact=$38,
        app_years_of_service=$39, app_pay_frequency=$40,
        app_other_income=$41, app_tax_years=$42,
        app_further_info=$43,
        app_decl_holding_deposit=$44, app_decl_info_accurate=$45, app_decl_gdpr=$46,
        app_decl_enquiries=$47, app_decl_documents=$48, app_decl_credit_check=$49,
        app_decl_terms=$50, app_decl_marketing=$51,
        app_guarantor_name=$52, app_guarantor_phone=$53, app_guarantor_email=$54, app_guarantor_address=$55
      WHERE application_form_token=$36
    `, [
      app_ni_number || null, app_previous_address_1 || null, app_previous_address_2 || null,
      app_years_at_current || null, app_years_at_previous || null,
      app_has_landlord_ref ? 1 : 0, app_landlord_ref_name || null, app_landlord_ref_phone || null, app_landlord_ref_email || null,
      app_landlord_ref_property_address || null, app_landlord_ref_consent ? 1 : 0,
      app_has_employer_ref ? 1 : 0, app_employer_ref_name || null, app_employer_ref_phone || null, app_employer_ref_email || null,
      app_employer_ref_employee_id || null, app_employer_ref_consent ? 1 : 0,
      app_bank_name || null, app_bank_sort_code || null, app_bank_account_number || null,
      app_next_of_kin_name || null, app_next_of_kin_phone || null, app_next_of_kin_relationship || null, app_next_of_kin_address || null,
      app_next_of_kin_2_name || null, app_next_of_kin_2_phone || null, app_next_of_kin_2_relationship || null, app_next_of_kin_2_address || null,
      app_signature || null, app_declaration_agreed ? 1 : 0,
      current_address_1 || null, date_of_birth_1 || null, employer_1 || null,
      income_1 || null, employment_status_1 || null, req.params.token,
      app_employer_address || null, app_employer_contact || null,
      app_years_of_service || null, app_pay_frequency || null,
      app_other_income || null, app_tax_years || null,
      app_further_info || null,
      app_decl_holding_deposit ? 1 : 0, app_decl_info_accurate ? 1 : 0, app_decl_gdpr ? 1 : 0,
      app_decl_enquiries ? 1 : 0, app_decl_documents ? 1 : 0, app_decl_credit_check ? 1 : 0,
      app_decl_terms ? 1 : 0, app_decl_marketing ? 1 : 0,
      app_guarantor_name || null, app_guarantor_phone || null, app_guarantor_email || null, app_guarantor_address || null,
    ]);

    // Log activity
    await run(`
      INSERT INTO audit_log (user_email, action, entity_type, entity_id, changes)
      VALUES ($1, $2, $3, $4, $5)
    `, ['tenant-self-service', 'update', 'tenant_enquiry', enquiry.id, JSON.stringify({ action: 'application_form_completed' })]);

    res.json({ success: true, message: 'Application submitted successfully' });
  } catch (err) {
    console.error('Error submitting application form:', err);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

app.get('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const properties = await query(`
      SELECT p.*, l.name as landlord_name,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant
      FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id ORDER BY p.address
    `);
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

app.post('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const id = await insert(`
      INSERT INTO properties (
        landlord_id, address, postcode, property_type, bedrooms,
        is_leasehold, leasehold_start_date, leasehold_end_date, leaseholder_info,
        proof_of_ownership_received, council_tax_band, service_type,
        charge_percentage, total_charge, rent_amount,
        has_live_tenancy, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date,
        rent_review_date, eicr_expiry_date, epc_grade, epc_expiry_date,
        has_gas, gas_safety_expiry_date, status, onboarded_date, notes, amenities,
        tenant_id, image_url
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      )
    `, [
      d.landlord_id, d.address, d.postcode, d.property_type || 'house', d.bedrooms || 1,
      d.is_leasehold ? 1 : 0, d.leasehold_start_date || null, d.leasehold_end_date || null, d.leaseholder_info || null,
      d.proof_of_ownership_received ? 1 : 0, d.council_tax_band || null, d.service_type || null,
      d.charge_percentage || null, d.total_charge || null, d.rent_amount || 0,
      d.has_live_tenancy ? 1 : 0, d.tenancy_start_date || null, d.tenancy_type || null,
      d.has_end_date ? 1 : 0, d.tenancy_end_date || null,
      d.rent_review_date || null, d.eicr_expiry_date || null, d.epc_grade || null, d.epc_expiry_date || null,
      d.has_gas ? 1 : 0, d.gas_safety_expiry_date || null, d.status || 'to_let',
      d.onboarded_date || null, d.notes || null, d.amenities || null,
      d.tenant_id || null, d.image_url || null
    ]);
    await logAudit(req.user?.id, req.user?.email, 'create', 'property', id);
    res.json({ id });
  } catch (err) {
    console.error('Property creation error:', err);
    res.status(500).json({
      error: 'Failed to create property',
      details: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
  }
});

app.get('/api/properties/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const property = await queryOne(`
      SELECT p.*, l.name as landlord_name, l.phone as landlord_phone, l.email as landlord_email,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant,
        (SELECT t.id FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_id,
        (SELECT t.email FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_email,
        (SELECT t.phone FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_phone
      FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id WHERE p.id = $1
    `, [req.params.id as string]);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    await logAudit(req.user?.id, req.user?.email, 'view', 'property', parseInt(req.params.id as string));
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

app.put('/api/properties/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const boolFields = ['has_gas','is_leasehold','proof_of_ownership_received','has_live_tenancy','has_end_date'];
    const allowed = [
      'landlord_id','address','postcode','property_type','bedrooms',
      'is_leasehold','leasehold_start_date','leasehold_end_date','leaseholder_info',
      'proof_of_ownership_received','council_tax_band','service_type',
      'charge_percentage','total_charge','rent_amount',
      'has_live_tenancy','tenancy_start_date','tenancy_type','has_end_date','tenancy_end_date',
      'rent_review_date','eicr_expiry_date','epc_grade','epc_expiry_date',
      'has_gas','gas_safety_expiry_date','status','onboarded_date','notes','amenities','tenant_id'
    ];
    for (const key of allowed) {
      if (key in d) {
        let val = d[key];
        if (boolFields.includes(key)) val = val ? 1 : 0;
        fields.push(`${key}=$${idx++}`);
        values.push(val);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE properties SET ${fields.join(', ')} WHERE id=$${idx}`, values);

    // Sync tenant.property_id when tenant_id changes on a property
    if ('tenant_id' in d) {
      // Unlink any tenant previously linked to this property
      await run('UPDATE tenants SET property_id = NULL WHERE property_id = $1', [req.params.id]);
      // Link the new tenant to this property
      if (d.tenant_id) {
        await run('UPDATE tenants SET property_id = $1 WHERE id = $2', [req.params.id, d.tenant_id]);
      }
    }

    await logAudit(req.user?.id, req.user?.email, 'update', 'property', parseInt(req.params.id as string), req.body);
    const updated = await queryOne(`
      SELECT p.*, l.name as landlord_name, l.phone as landlord_phone, l.email as landlord_email,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant,
        (SELECT t.id FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_id
      FROM properties p JOIN landlords l ON l.id = p.landlord_id WHERE p.id = $1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

app.post('/api/properties/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    // Update tenants to remove property references
    await run(`UPDATE tenants SET property_id = NULL WHERE property_id IN (${placeholders})`, ids);
    // Update maintenance records to remove property references (or delete them if cascading is preferred)
    await run(`DELETE FROM maintenance WHERE property_id IN (${placeholders})`, ids);
    // Update rent payments to remove property references
    await run(`DELETE FROM rent_payments WHERE property_id IN (${placeholders})`, ids);
    // Delete tasks linked to these properties
    await run(`DELETE FROM tasks WHERE entity_type = 'property' AND entity_id IN (${placeholders})`, ids);
    // Delete documents linked to these properties
    await run(`DELETE FROM documents WHERE entity_type = 'property' AND entity_id IN (${placeholders})`, ids);
    // Delete properties
    const result = await run(`DELETE FROM properties WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'property', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete properties' });
  }
});

// ============ TASKS ============

app.get('/api/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT t.*, u.name as assigned_to_name FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to';
    if (status === 'active') sql += " WHERE t.status IN ('pending', 'in_progress')";
    sql += ' ORDER BY t.due_date NULLS LAST';
    const tasks = await query(sql);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type } = req.body;
    const id = await insert(
      'INSERT INTO tasks (title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [title, description, priority || 'medium', assigned_to, entity_type, entity_id, due_date, task_type || 'manual']
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const allowed = ['title', 'description', 'priority', 'status', 'assigned_to', 'due_date', 'notes', 'entity_type', 'entity_id'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(d[key]);
      }
    }
    // Auto-set completed_at when status changes to completed
    if (d.status === 'completed') {
      fields.push(`completed_at=$${idx++}`);
      values.push(new Date().toISOString());
    } else if ('status' in d && d.status !== 'completed') {
      fields.push(`completed_at=$${idx++}`);
      values.push(null);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE tasks SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'task', parseInt(req.params.id as string), d);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.get('/api/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (result.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    await logAudit(req.user?.id, req.user?.email, 'view', 'task', parseInt(req.params.id as string));
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

app.delete('/api/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    // Delete associated documents first
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['task', req.params.id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.file_name);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    await run('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['task', req.params.id]);

    // Delete the task
    await run('DELETE FROM tasks WHERE id = $1', [req.params.id]);

    await logAudit(req.user?.id, req.user?.email, 'delete', 'task', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.post('/api/tasks/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await run(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'task', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete tasks' });
  }
});

// ============ MAINTENANCE ============

app.get('/api/maintenance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const requests = await query(`
      SELECT m.*, p.address, l.name as landlord_name FROM maintenance m
      JOIN properties p ON p.id = m.property_id JOIN landlords l ON l.id = p.landlord_id
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, m.created_at DESC
    `);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch maintenance' });
  }
});

app.post('/api/maintenance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const id = await insert(
      'INSERT INTO maintenance (property_id, title, description, category, priority) VALUES ($1, $2, $3, $4, $5)',
      [d.property_id, d.title, d.description, d.category, d.priority || 'medium']
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create maintenance' });
  }
});

app.get('/api/maintenance/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT * FROM maintenance WHERE id = $1', [req.params.id]);
    if (result.length === 0) {
      return res.status(404).json({ error: 'Maintenance request not found' });
    }
    await logAudit(req.user?.id, req.user?.email, 'view', 'maintenance', parseInt(req.params.id as string));
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch maintenance request' });
  }
});

app.put('/api/maintenance/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const allowed = ['status', 'contractor', 'cost', 'resolution_notes', 'title', 'description', 'property_id', 'priority', 'reported_by', 'category'];
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE maintenance SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'maintenance', parseInt(req.params.id as string), d);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update maintenance' });
  }
});

app.post('/api/maintenance/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await run(`DELETE FROM maintenance WHERE id IN (${placeholders})`, ids);

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'maintenance', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete maintenance requests' });
  }
});

// ============ DOCUMENTS ============

const DOC_TYPES: Record<string, string[]> = {
  landlord: ['Primary Identification', 'Address Identification', 'Proof of Funds', 'Proof of Ownership', 'Other'],
  tenant: ['Primary Identification', 'Address Identification', 'Application Form(s)', 'Bank Statements', 'Other'],
  tenant_enquiry: ['Primary ID', 'Secondary ID', 'Address ID', 'Application Form(s)', 'Other'],
  property: ['Gas Safety Certificate', 'EPC', 'EICR', 'Proof of Ownership', 'Insurance', 'Other'],
};

app.get('/api/documents/types/:entityType', authMiddleware, (req: AuthRequest, res) => {
  const types = DOC_TYPES[req.params.entityType as string] || ['Other'];
  res.json(types);
});

app.get('/api/documents/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const applicantNumber = req.query.applicant_number ? parseInt(req.query.applicant_number as string) : undefined;
    let sql = 'SELECT id, doc_type, original_name, mime_type, size, uploaded_at FROM documents WHERE entity_type = $1 AND entity_id = $2';
    const params: any[] = [req.params.entityType, req.params.entityId];
    if (applicantNumber !== undefined) {
      sql += ' AND applicant_number = $3';
      params.push(applicantNumber);
    }
    sql += ' ORDER BY uploaded_at DESC';
    const docs = await query(sql, params);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/documents/:entityType/:entityId', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { doc_type, applicant_number } = req.body;
    const appNum = applicant_number ? parseInt(applicant_number) : 1;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const id = await insert(
      'INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by, applicant_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [entityType, entityId, doc_type, file.filename, file.originalname, file.mimetype, file.size, req.user?.id, appNum]
    );
    await logAudit(req.user?.id, req.user?.email, 'document_upload', entityType as string, parseInt(entityId as string), { doc_type, original_name: file.originalname, size: file.size, applicant_number: appNum });
    res.json({ id, doc_type, original_name: file.originalname });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.get('/api/documents/download/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const doc = await queryOne('SELECT * FROM documents WHERE id = $1', [req.params.id as string]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
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
    const doc = await queryOne('SELECT * FROM documents WHERE id = $1', [req.params.id as string]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    const filePath = path.join(uploadsDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await run('DELETE FROM documents WHERE id = $1', [req.params.id as string]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ============ TENANCIES & RENT PAYMENTS ============

app.get('/api/tenancies', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenancies = await query(`
      SELECT tn.*, p.address, t.name as tenant_name FROM tenancies tn
      JOIN properties p ON p.id = tn.property_id JOIN tenants t ON t.id = tn.tenant_id
      ORDER BY tn.start_date DESC
    `);
    res.json(tenancies);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenancies' });
  }
});

app.post('/api/tenancies', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    if (!d.property_id || !d.tenant_id || !d.start_date || !d.rent_amount) {
      return res.status(400).json({ error: 'property_id, tenant_id, start_date, and rent_amount are required' });
    }
    const id = await insert(
      'INSERT INTO tenancies (property_id, tenant_id, start_date, end_date, rent_amount, deposit_amount, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [d.property_id, d.tenant_id, d.start_date, d.end_date || null, d.rent_amount, d.deposit_amount || null, 'active', d.notes || null]
    );
    await run("UPDATE properties SET status = 'let' WHERE id = $1", [d.property_id]);
    await logAudit(req.user?.id, req.user?.email, 'create', 'tenancy', id, { property_id: d.property_id, tenant_id: d.tenant_id, start_date: d.start_date, rent_amount: d.rent_amount });
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create tenancy' });
  }
});

app.get('/api/rent-payments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const payments = await query(`
      SELECT rp.*, p.address, t.name as tenant_name FROM rent_payments rp
      JOIN properties p ON p.id = rp.property_id LEFT JOIN tenants t ON t.id = rp.tenant_id
      ORDER BY rp.due_date DESC
    `);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rent payments' });
  }
});

app.post('/api/rent-payments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    if (!d.property_id || !d.due_date || !d.amount_due) {
      return res.status(400).json({ error: 'property_id, due_date, and amount_due are required' });
    }
    const id = await insert(
      'INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, status) VALUES ($1, $2, $3, $4, $5)',
      [d.property_id, d.tenant_id || null, d.due_date, d.amount_due, 'pending']
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'rent_payment', id);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create rent payment' });
  }
});

app.put('/api/rent-payments/:id/pay', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const payment = await queryOne('SELECT * FROM rent_payments WHERE id = $1', [req.params.id as string]);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const amountPaid = d.amount_paid || payment.amount_due;
    const paymentDate = d.payment_date || new Date().toISOString().split('T')[0];
    const newStatus = amountPaid < payment.amount_due ? 'partial' : 'paid';

    await run(
      'UPDATE rent_payments SET amount_paid=$1, payment_date=$2, status=$3 WHERE id=$4',
      [amountPaid, paymentDate, newStatus, req.params.id]
    );
    await logAudit(req.user?.id, req.user?.email, 'update', 'rent_payment', parseInt(req.params.id as string), { status: newStatus, amount_paid: amountPaid });
    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to mark payment as paid' });
  }
});

// ============ USERS ============

app.get('/api/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const users = await query('SELECT id, email, name, role, department, is_active, created_at, last_login FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const { email, name, role, department } = req.body;
    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Email, name, and role are required' });
    }
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    const id = await insert(
      'INSERT INTO users (email, password, name, role, department, last_password_change) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [email, hashedPassword, name, role, department || null]
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'user', id, { email, name, role, department });
    res.json({ id, email, name, role, department, tempPassword });
  } catch (err: any) {
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id as string);
    const { name, email, role, department, is_active } = req.body;
    const isSelf = req.user?.id === userId;
    const isAdmin = req.user?.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    if ((role || is_active !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can change role or active status' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (name) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (email && isAdmin) { updates.push(`email = $${paramIdx++}`); params.push(email); }
    if (role && isAdmin) { updates.push(`role = $${paramIdx++}`); params.push(role); }
    if (department !== undefined) { updates.push(`department = $${paramIdx++}`); params.push(department); }
    if (is_active !== undefined && isAdmin) { updates.push(`is_active = $${paramIdx++}`); params.push(is_active); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(userId);
    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);

    await logAudit(req.user?.id, req.user?.email, 'update', 'user', userId, { name, email, role, department, is_active });
    const updated = await queryOne('SELECT id, email, name, role, department, is_active, created_at, last_login FROM users WHERE id = $1', [userId]);
    res.json(updated);
  } catch (err: any) {
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.put('/api/users/:id/reset-password', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id as string);
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await run('UPDATE users SET password = $1, last_password_change = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, userId]);
    await logAudit(req.user?.id, req.user?.email, 'update', 'user', userId, { action: 'password_reset' });
    res.json({ tempPassword });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.delete('/api/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.id as string);
    if (req.user?.id === userId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }
    await run('UPDATE users SET is_active = 0 WHERE id = $1', [userId]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'user', userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

app.put('/api/auth/password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user!.id]);
    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await run('UPDATE users SET password = $1, last_password_change = CURRENT_TIMESTAMP WHERE id = $2', [hashedPassword, req.user!.id]);
    await logAudit(req.user?.id, req.user?.email, 'update', 'user', req.user!.id, { action: 'password_change' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============ DELETE ENDPOINTS ============

app.delete('/api/tenants/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    // Clean up property references before deleting
    await run('UPDATE properties SET has_live_tenancy = 0, tenancy_start_date = NULL, tenant_id = NULL WHERE tenant_id = $1', [id]);
    // Delete associated documents
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['tenant', id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await run('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['tenant', id]);
    // Delete associated tasks
    await run("DELETE FROM tasks WHERE entity_type = 'tenant' AND entity_id = $1", [id]);
    await run('DELETE FROM tenants WHERE id = $1', [id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'tenant', parseInt(id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

app.delete('/api/properties/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['property', req.params.id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await run('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['property', req.params.id]);
    await run('DELETE FROM tasks WHERE entity_type = $1 AND entity_id = $2', ['property', req.params.id]);
    await run('DELETE FROM maintenance WHERE property_id = $1', [req.params.id]);
    await run('DELETE FROM rent_payments WHERE property_id = $1', [req.params.id]);
    await run('UPDATE tenants SET property_id = NULL WHERE property_id = $1', [req.params.id]);
    await run('DELETE FROM property_landlords WHERE property_id = $1', [req.params.id]);
    await run('DELETE FROM properties WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'property', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete property:', err);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// ============ DIRECTOR REINSTATEMENT ============

app.post('/api/directors/:id/reinstate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await run('UPDATE directors SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'reinstate', 'director', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reinstate director' });
  }
});

// ============ LANDLORD PROPERTIES ============

app.get('/api/landlords/:landlordId/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const properties = await query(`
      SELECT p.*, pl.is_primary, pl.ownership_percentage, pl.ownership_entity_type
      FROM properties p
      INNER JOIN property_landlords pl ON p.id = pl.property_id
      WHERE pl.landlord_id = $1
      ORDER BY pl.is_primary DESC, p.address ASC
    `, [req.params.landlordId]);
    res.json(properties);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// ============ TENANT NOTES ============

app.patch('/api/tenants/:id/notes', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { notes } = req.body;
    await run('UPDATE tenants SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [notes, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// ============ PROPERTY EXPENSES ============

app.get('/api/property-expenses/:propertyId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const expenses = await query('SELECT * FROM property_expenses WHERE property_id = $1 ORDER BY expense_date DESC, created_at DESC', [req.params.propertyId]);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/property-expenses', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, description, amount, category, expense_date } = req.body;
    const id = await insert(
      'INSERT INTO property_expenses (property_id, description, amount, category, expense_date) VALUES ($1, $2, $3, $4, $5)',
      [property_id, description, amount, category || 'other', expense_date || null]
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

app.delete('/api/property-expenses/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await run('DELETE FROM property_expenses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// ============ PROPERTY VIEWINGS ============

app.get('/api/property-viewings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const viewings = await query(`
      SELECT v.*, p.address FROM property_viewings v
      JOIN properties p ON p.id = v.property_id
      ORDER BY v.viewing_date DESC
    `);
    res.json(viewings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch viewings' });
  }
});

app.post('/api/property-viewings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to, send_sms, sms_message } = req.body;
    const viewingId = await insert(`
      INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [property_id, enquiry_id || null, viewer_name, viewer_email || null, viewer_phone || null, viewing_date, viewing_time || null, notes || null, assigned_to || null]);

    if (enquiry_id) {
      await run("UPDATE tenant_enquiries SET status = 'viewing_booked', viewing_date = $1 WHERE id = $2", [viewing_date, enquiry_id]);
    }

    const property = await queryOne('SELECT address FROM properties WHERE id = $1', [property_id]);
    const taskTitle = `Property Viewing: ${viewer_name}`;
    const taskDescription = `Conduct property viewing at ${property?.address || 'Unknown Property'}\nTime: ${viewing_time || 'Not specified'}\nContact: ${viewer_phone || viewer_email}`;

    await insert(`
      INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
      VALUES ($1, $2, 'pending', 'high', 'tenant_enquiry', $3, 'viewing', $4, $5)
    `, [taskTitle, taskDescription, enquiry_id || null, viewing_date, assigned_to || req.user?.name || null]);

    await logAudit(req.user?.id, req.user?.email, 'create', 'property_viewing', viewingId, { viewer_name, viewing_date, property_id });
    res.json({ id: viewingId });

    // Send SMS fire-and-forget after response — Twilio API call is slow and shouldn't block the user
    if (send_sms && viewer_phone && sms_message) {
      const { sendSms, normalizeUkPhone } = require('./sms');
      const normalizedPhone = normalizeUkPhone(viewer_phone);
      sendSms({ to: normalizedPhone, body: sms_message })
        .then(async (smsResult: { success: boolean; sid?: string; error?: string }) => {
          try {
            await insert(`
              INSERT INTO sms_messages (enquiry_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              enquiry_id || null, normalizedPhone, process.env.TWILIO_PHONE_NUMBER || null,
              sms_message, smsResult.success ? 'sent' : 'failed', smsResult.sid || null,
              smsResult.error || null, req.user?.id || null, req.user?.email || null
            ]);
            await logAudit(req.user?.id, req.user?.email, 'sms_sent', 'tenant_enquiry', enquiry_id || 0, { to_phone: normalizedPhone, message: sms_message.substring(0, 100) });
          } catch (dbErr) {
            console.error('[SMS] Failed to log SMS to database:', dbErr);
          }
        })
        .catch((err: any) => console.error('[SMS] Fire-and-forget SMS failed:', err));
    }
  } catch (err) {
    console.error('Error creating viewing:', err);
    res.status(500).json({ error: 'Failed to create viewing' });
  }
});

app.put('/api/property-viewings/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { status, feedback, interested, notes } = req.body;
    await run(`
      UPDATE property_viewings SET status=$1, feedback=$2, interested=$3, notes=$4 WHERE id=$5
    `, [status, feedback, interested ? 1 : 0, notes, req.params.id]);
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

    // Generate unique token for application form
    const token = require('crypto').randomBytes(24).toString('hex');
    const applicationFormUrl = `https://apply.fleminglettings.co.uk/onboarding/${token}`;

    // Update enquiry with financial details and token
    await run(`
      UPDATE tenant_enquiries SET
        monthly_rent_agreed=$1, security_deposit_amount=$2, holding_deposit_amount=$3,
        application_form_token=$4, application_form_sent=1, holding_deposit_requested=1,
        onboarding_email_sent_at=NOW(), status='onboarding'
      WHERE id=$5
    `, [monthly_rent, security_deposit, holding_deposit, token, enquiryId]);

    // Get enquiry + property details for email
    const enquiry = await queryOne(`
      SELECT te.*, p.address as property_address, p.postcode as property_postcode
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      WHERE te.id = $1
    `, [enquiryId]);

    if (enquiry) {
      const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
      const address = [enquiry.property_address, enquiry.property_postcode].filter(Boolean).join(', ');

      // Send email and log to email_messages
      const { sendEmail } = require('./email');
      const { holdingDepositRequestEmail } = require('./email');
      const emailContent = holdingDepositRequestEmail(name, address, monthly_rent, security_deposit, holding_deposit, applicationFormUrl);
      const emailResult = await sendEmail({
        to: enquiry.email_1,
        subject: emailContent.subject,
        html: emailContent.html,
        from: 'Fleming Lettings Accounts <accounts@fleminglettings.co.uk>',
      });
      await insert(`
        INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, status, sent_by, sent_by_email)
        VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'holding_deposit_request', $6, $7, $8)
      `, [emailResult.id || null, enquiryId, enquiry.email_1, 'accounts@fleminglettings.co.uk', emailContent.subject, emailResult.success ? 'sent' : 'failed', req.user?.id || null, req.user?.email || null]);

      // Create follow-up task
      if (follow_up_date) {
        await insert(`
          INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
          VALUES ($1, $2, 'pending', 'high', 'tenant_enquiry', $3, 'follow_up', $4, $5)
        `, [
          `Holding deposit follow-up: ${name}`,
          `Check if holding deposit of £${holding_deposit} has been received for ${address}`,
          enquiryId, follow_up_date, req.user?.name || null,
        ]);
      }

      await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, {
        action: 'holding_deposit_requested', monthly_rent, security_deposit, holding_deposit,
      });

      await logAudit(req.user?.id, req.user?.email, 'email_sent', 'tenant_enquiry', enquiryId, {
        to: enquiry.email_1,
        subject: emailContent.subject,
      });
    }

    res.json({ success: true, token, applicationFormUrl });
  } catch (err) {
    console.error('Error requesting holding deposit:', err);
    res.status(500).json({ error: 'Failed to send holding deposit request' });
  }
});

// Send tenancy application email (editable preview)
app.post('/api/tenant-enquiries/:id/send-application-email', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const { subject, body_html } = req.body;
    if (!subject || !body_html) return res.status(400).json({ error: 'subject and body_html required' });

    const enquiry = await queryOne(`SELECT email_1, first_name_1, last_name_1 FROM tenant_enquiries WHERE id = $1`, [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (!enquiry.email_1) return res.status(400).json({ error: 'Enquiry has no email address' });

    const { sendEmail } = require('./email');
    const emailResult = await sendEmail({
      to: enquiry.email_1,
      subject,
      html: body_html,
      from: 'Fleming Lettings Accounts <accounts@fleminglettings.co.uk>',
    });
    await insert(`
      INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, status, sent_by, sent_by_email)
      VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'tenancy_application', $6, $7, $8)
    `, [emailResult.id || null, enquiryId, enquiry.email_1, 'accounts@fleminglettings.co.uk', subject, emailResult.success ? 'sent' : 'failed', req.user?.id || null, req.user?.email || null]);

    await logAudit(req.user?.id, req.user?.email, 'email_sent', 'tenant_enquiry', enquiryId, {
      to: enquiry.email_1, subject, template: 'tenancy_application',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error sending application email:', err);
    res.status(500).json({ error: 'Failed to send application email' });
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
    const smsId = await insert(`
      INSERT INTO sms_messages (enquiry_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      enquiry_id || null, normalizedPhone, process.env.TWILIO_PHONE_NUMBER || null,
      message_body, smsResult.success ? 'sent' : 'failed', smsResult.sid || null,
      smsResult.error || null, req.user?.id || null, req.user?.email || null
    ]);
    if (enquiry_id) {
      await logAudit(req.user?.id, req.user?.email, 'sms_sent', 'tenant_enquiry', enquiry_id, { to_phone: normalizedPhone, message: message_body.substring(0, 100) });
    }
    res.json({ id: smsId, success: smsResult.success, twilio_sid: smsResult.sid });
  } catch (err) {
    console.error('Error sending SMS:', err);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// Twilio delivery status webhook (validated via X-Twilio-Signature)
app.post('/api/sms/status', validateTwilioWebhook, async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;
    if (!MessageSid || !MessageStatus) {
      return res.status(400).send('Missing MessageSid or MessageStatus');
    }
    await run(
      'UPDATE sms_messages SET status = $1, error_message = CASE WHEN $2::text IS NOT NULL AND $2::text != \'0\' THEN COALESCE(error_message, \'\') || \' ErrorCode:\' || $2::text ELSE error_message END WHERE twilio_sid = $3',
      [MessageStatus, ErrorCode || null, MessageSid]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Error processing SMS status webhook:', err);
    res.sendStatus(500);
  }
});

// Twilio inbound SMS webhook (validated via X-Twilio-Signature)
app.post('/api/sms/inbound', validateTwilioWebhook, async (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;
    if (!From || !Body) {
      return res.status(400).send('Missing From or Body');
    }

    // Try to match sender phone to an existing enquiry, tenant, or landlord
    const normalizedFrom = normalizePhone(From);
    let enquiryId: number | null = null;

    // Check tenant_enquiries first (most likely source of inbound SMS)
    const enquiry = await queryOne(
      `SELECT id FROM tenant_enquiries WHERE phone_1 = $1 OR phone_1 = $2 ORDER BY created_at DESC LIMIT 1`,
      [From, normalizedFrom]
    );
    if (enquiry) {
      enquiryId = enquiry.id;
    }

    await insert(`
      INSERT INTO sms_messages (enquiry_id, to_phone, from_phone, message_body, direction, status, twilio_sid)
      VALUES ($1, $2, $3, $4, 'inbound', 'received', $5)
    `, [enquiryId, process.env.TWILIO_PHONE_NUMBER || null, From, Body, MessageSid || null]);

    if (enquiryId) {
      await logAudit(undefined, undefined, 'sms_received', 'tenant_enquiry', enquiryId, {
        from_phone: From, message: Body.substring(0, 100)
      });
    }

    // Return empty TwiML response (no auto-reply)
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err) {
    console.error('Error processing inbound SMS:', err);
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

app.get('/api/sms/enquiry/:enquiryId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const messages = await query('SELECT * FROM sms_messages WHERE enquiry_id = $1 ORDER BY created_at DESC', [req.params.enquiryId]);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

// ============ EMAIL DELIVERY TRACKING ============

// Resend webhook for email delivery events (validated via svix signature)
app.post('/api/email/webhook', async (req: any, res) => {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    // Verify webhook signature if secret is configured
    if (webhookSecret && req.rawBody) {
      const svixId = req.headers['svix-id'] as string;
      const svixTimestamp = req.headers['svix-timestamp'] as string;
      const svixSignature = req.headers['svix-signature'] as string;

      if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(403).json({ error: 'Missing svix headers' });
      }

      // Reject stale webhooks (>5 minutes old) to prevent replay attacks
      const timestamp = parseInt(svixTimestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestamp) > 300) {
        return res.status(403).json({ error: 'Webhook timestamp too old' });
      }

      // Compute HMAC-SHA256 signature (svix format: whsec_ prefix + base64 secret)
      const secretBytes = Buffer.from(webhookSecret.replace('whsec_', ''), 'base64');
      const signaturePayload = `${svixId}.${svixTimestamp}.${req.rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', secretBytes)
        .update(signaturePayload)
        .digest('base64');

      const signatures = svixSignature.split(' ');
      const isValid = signatures.some((sig: string) => {
        const parts = sig.split(',');
        return parts[0] === 'v1' && parts[1] === expectedSignature;
      });

      if (!isValid) {
        console.warn('[RESEND] Invalid webhook signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }

    const { type, data } = req.body;
    if (!type || !data?.email_id) {
      return res.status(400).json({ error: 'Missing type or email_id' });
    }

    const resendId = data.email_id;

    // Map Resend event types to status updates
    switch (type) {
      case 'email.sent':
        await run('UPDATE email_messages SET status = $1 WHERE resend_id = $2', ['sent', resendId]);
        break;
      case 'email.delivered':
        await run('UPDATE email_messages SET status = $1 WHERE resend_id = $2', ['delivered', resendId]);
        break;
      case 'email.delivery_delayed':
        await run('UPDATE email_messages SET status = $1 WHERE resend_id = $2', ['delayed', resendId]);
        break;
      case 'email.bounced':
        await run('UPDATE email_messages SET status = $1, bounced_at = NOW(), error_message = $2 WHERE resend_id = $3',
          ['bounced', data.bounce?.message || 'Hard bounce', resendId]);
        break;
      case 'email.complained':
        await run('UPDATE email_messages SET status = $1, error_message = $2 WHERE resend_id = $3',
          ['complained', 'Marked as spam by recipient', resendId]);
        break;
      case 'email.opened':
        await run('UPDATE email_messages SET opened_at = COALESCE(opened_at, NOW()) WHERE resend_id = $1', [resendId]);
        break;
      case 'email.clicked':
        await run('UPDATE email_messages SET clicked_at = COALESCE(clicked_at, NOW()) WHERE resend_id = $1', [resendId]);
        break;
      case 'email.failed':
        await run('UPDATE email_messages SET status = $1, error_message = $2 WHERE resend_id = $3',
          ['failed', data.reason || 'Send failed', resendId]);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error processing email webhook:', err);
    res.sendStatus(500);
  }
});

// Get email history for an entity
app.get('/api/email/entity/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const messages = await query(
      'SELECT * FROM email_messages WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC',
      [entityType, entityId]
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email history' });
  }
});

// ============ AUDIT LOG ============

app.get('/api/audit-log', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { entity_type, entity_id, user_id, limit: limitParam = '100' } = req.query;
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (entity_type) { sql += ` AND entity_type = $${paramIdx++}`; params.push(entity_type); }
    if (entity_id) { sql += ` AND entity_id = $${paramIdx++}`; params.push(entity_id); }
    if (user_id) { sql += ` AND user_id = $${paramIdx++}`; params.push(user_id); }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
    params.push(limitParam);

    const logs = await query(sql, params);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

app.get('/api/activity/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const limit = Number(req.query.limit) || 50;
    const logs = await query(
      'SELECT * FROM audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3',
      [entityType, entityId, limit]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

app.post('/api/activity', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { action, entity_type, entity_id, changes } = req.body;
    await logAudit(req.user?.id, req.user?.email, action, entity_type, entity_id, changes);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// ============ TRANSACTIONS ============

app.get('/api/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const transactions = await query('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.post('/api/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { tenancy_id, type, amount, description, date } = req.body;
    const id = await insert(
      'INSERT INTO transactions (tenancy_id, type, amount, description, date, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [tenancy_id, type, amount, description || null, date, req.user?.id || null]
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// ============ DATA EXPORT ============

app.get('/api/export/:entityType', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { entityType } = req.params;
    let data;

    switch (entityType) {
      case 'landlords':
        data = await query('SELECT name, email, phone, address FROM landlords');
        break;
      case 'landlords_bdm':
        data = await query('SELECT name, email, phone, address, status FROM landlords_bdm');
        break;
      case 'tenants':
        data = await query('SELECT name, email, phone FROM tenants');
        break;
      case 'properties':
        data = await query('SELECT address, postcode, rent_amount, status FROM properties');
        break;
      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }

    await logAudit(req.user?.id, req.user?.email, 'export', entityType);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export data' });
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
      console.error('EPC API error:', response.status);
      return res.status(response.status).json({ error: 'EPC API error' });
    }

    const text = await response.text();
    if (!text || text.length === 0) return res.json([]);

    const data = JSON.parse(text);
    const results = (data.rows || []).map((r: any) => ({
      address: r.address,
      postcode: r.postcode,
      current_rating: r['current-energy-rating'],
      potential_rating: r['potential-energy-rating'],
      current_efficiency: r['current-energy-efficiency'],
      property_type: r['property-type'],
      inspection_date: r['inspection-date'],
      lodgement_date: r['lodgement-date'],
      certificate_number: r['lmk-key'],
    }));

    await logAudit(req.user?.id, req.user?.email, 'view', 'epc_lookup');
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

    const apiKey = process.env.COUNCIL_TAX_API_KEY;
    if (!apiKey) return res.status(501).json({ error: 'Council Tax API key not configured' });

    const url = `https://www.counciltaxfinder.com/api/?postcode=${encodeURIComponent(postcode)}&key=${apiKey}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) return res.status(response.status).json({ error: 'Council Tax API error' });

    const data: any = await response.json();
    const results = Array.isArray(data) ? data.map((r: any) => ({
      address: r.address,
      band: r.band,
      council: r.council,
      annualTax: r.annual_tax,
      monthlyTax: r.monthly_tax,
    })) : [];

    await logAudit(req.user?.id, req.user?.email, 'view', 'council_tax_lookup');
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

    const cleanPostcode = postcode.replace(/\s/g, '').toUpperCase();
    const url = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?_pageSize=20&propertyAddress.postcode=${encodeURIComponent(cleanPostcode)}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Land Registry API error' });
    }

    const data: any = await response.json();
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

    await logAudit(req.user?.id, req.user?.email, 'view', 'land_registry_lookup');
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

    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Postcode not found' });
      return res.status(response.status).json({ error: 'Postcodes.io API error' });
    }

    const data: any = await response.json();
    if (data.status === 200 && data.result) {
      res.json({
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
      });
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
    const q = (req.query.query as string || '').trim();
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(q)}/autocomplete`;
    const response = await fetch(url);

    if (!response.ok) return res.json({ result: [] });

    const data: any = await response.json();
    res.json({ result: data.result || [] });
  } catch (err) {
    console.error('Postcodes.io autocomplete error:', err);
    res.status(500).json({ error: 'Failed to autocomplete postcode' });
  }
});

// ============ COMPANIES HOUSE ============

app.get('/api/companies-house/search', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const q = (req.query.query as string || '').trim();
    if (!q) return res.status(400).json({ error: 'Company name or number required' });

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) return res.status(501).json({ error: 'Companies House API key not configured' });

    const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) return res.status(response.status).json({ error: 'Companies House API error' });

    const data: any = await response.json();
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

    await logAudit(req.user?.id, req.user?.email, 'view', 'companies_house_search');
    res.json(results);
  } catch (err) {
    console.error('Companies House error:', err);
    res.status(500).json({ error: 'Failed to search Companies House' });
  }
});

app.get('/api/companies-house/company/:companyNumber', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyNumber = req.params.companyNumber as string;
    if (!companyNumber) return res.status(400).json({ error: 'Company number required' });

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) return res.status(501).json({ error: 'Companies House API key not configured' });

    const url = `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Company not found' });
      return res.status(response.status).json({ error: 'Companies House API error' });
    }

    const data: any = await response.json();
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

    await logAudit(req.user?.id, req.user?.email, 'view', 'companies_house_detail', undefined, { company_number: companyNumber });
    res.json(result);
  } catch (err) {
    console.error('Companies House error:', err);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

// ============ INVENTORY ROUTES ============
registerInventoryRoutes(app, authMiddleware);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// SPA fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Start server
async function start() {
  try {
    await initDb();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Fleming CRM (PostgreSQL) running on port ${PORT}`);
      console.log(`Health check available at http://0.0.0.0:${PORT}/api/health`);
      startScheduler();
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
