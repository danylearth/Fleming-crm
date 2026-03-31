import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool, { initDb, query, queryOne, insert, run } from './db-pg';
import { generateToken, authMiddleware, AuthRequest, requireRole } from './auth';
import { registerInventoryRoutes } from './inventory-routes';

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
app.use(express.json());

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
    const id = await insert(
      'INSERT INTO landlords_bdm (name, email, phone, address, status, follow_up_date, source, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [name, email || null, phone || null, address || null, status || 'new', follow_up_date || null, source || null, notes || null]
    );
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
    const { name, email, phone, address, status, follow_up_date, source, notes } = req.body;
    await run('UPDATE landlords_bdm SET name=$1, email=$2, phone=$3, address=$4, status=$5, follow_up_date=$6, source=$7, notes=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9',
      [name, email, phone, address, status, follow_up_date, source, notes, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prospect' });
  }
});

app.post('/api/landlords-bdm/:id/convert', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const prospect = await queryOne('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id as string]);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const landlordId = await insert(
      'INSERT INTO landlords (name, email, phone, address, notes) VALUES ($1, $2, $3, $4, $5)',
      [prospect.name, prospect.email, prospect.phone, prospect.address, prospect.notes]
    );
    await run("UPDATE landlords_bdm SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id as string]);

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
app.post('/api/public/tenant-enquiries', async (req, res) => {
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

    // Determine if joint application
    const is_joint = registration_type === 'Joint' ? 1 : 0;

    // Get client IP for audit
    const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Build notes with additional fields
    let notes = '=== PROPERTY REQUIREMENTS ===\n';
    if (tenancylookingfor) notes += `Tenancy Type: ${tenancylookingfor}\n`;
    if (typeofproperty) notes += `Property Type: ${typeofproperty}\n`;
    if (noofbedrooms) notes += `Bedrooms: ${noofbedrooms}\n`;
    if (roadparking) notes += `Parking: ${roadparking}\n`;
    if (rent_max) notes += `Max Rent: £${rent_max}/month\n`;
    if (reasonforrenting) notes += `Reason: ${reasonforrenting}\n`;
    notes += '\n=== APPLICANT 1 DETAILS ===\n';
    if (address) notes += `Address: ${address}\n`;
    if (Postcode) notes += `Postcode: ${Postcode}\n`;
    if (yearofaddress) notes += `Years at address: ${yearofaddress}\n`;
    if (Nationality) notes += `Nationality: ${Nationality}\n`;
    if (job_title) notes += `Job Title: ${job_title}\n`;
    if (AnnualSalary) notes += `Annual Salary: £${AnnualSalary}\n`;
    if (is_joint && FirstName2) {
      notes += '\n=== APPLICANT 2 DETAILS ===\n';
      if (address2) notes += `Address: ${address2}\n`;
      if (Postcode2) notes += `Postcode: ${Postcode2}\n`;
      if (yearofaddress2) notes += `Years at address: ${yearofaddress2}\n`;
      if (Nationality2) notes += `Nationality: ${Nationality2}\n`;
      if (job_title2) notes += `Job Title: ${job_title2}\n`;
      if (AnnualSalary2) notes += `Annual Salary: £${AnnualSalary2}\n`;
    }
    notes += `\n=== FORM METADATA ===\n`;
    notes += `Submitted from IP: ${client_ip}\n`;
    notes += `Submission date: ${new Date().toISOString()}\n`;

    // Map form fields to database columns (only columns that exist in schema)
    const data: any = {
      first_name_1: FirstName,
      last_name_1: Surname,
      email_1: form_email,
      phone_1: contactNumber,
      current_address_1: address || null,
      date_of_birth_1: dob || null,
      employment_status_1: EmploymentStatus || null,
      employer_1: job_title || null,
      income_1: AnnualSalary ? parseFloat(AnnualSalary) : null,
      is_joint_application: is_joint,
      first_name_2: FirstName2 || null,
      last_name_2: Surname2 || null,
      email_2: form_email2 || null,
      phone_2: contactNumber2 || null,
      current_address_2: address2 || null,
      date_of_birth_2: dob2 || null,
      employment_status_2: EmploymentStatus2 || null,
      employer_2: job_title2 || null,
      income_2: AnnualSalary2 ? parseFloat(AnnualSalary2) : null,
      linked_property_id: property_id ? parseInt(property_id) : null,
      notes: notes,
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

    res.json({
      enquiry_id: id,
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

// Internal authenticated endpoint
app.post('/api/tenant-enquiries', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const fields = [
      'title_1', 'first_name_1', 'last_name_1', 'email_1', 'phone_1',
      'date_of_birth_1', 'current_address_1', 'employment_status_1',
      'employer_1', 'income_1', 'is_joint_application',
      'title_2', 'first_name_2', 'last_name_2', 'email_2', 'phone_2',
      'date_of_birth_2', 'current_address_2', 'employment_status_2',
      'employer_2', 'income_2', 'linked_property_id', 'notes', 'status'
    ];

    const values: any[] = [];
    const placeholders: string[] = [];
    const cols: string[] = [];

    let idx = 1;
    for (const field of fields) {
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

    await logAudit(req.user?.id, req.user?.email, 'create', 'tenant_enquiry', id, d);
    res.json({ id });
  } catch (err) {
    console.error('Enquiry creation error:', err);
    res.status(500).json({ error: 'Failed to create enquiry' });
  }
});

app.get('/api/tenant-enquiries/check-duplicates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { email, phone, exclude_id } = req.query;
    const results: any[] = [];

    if (email) {
      const tenantByEmail = await query('SELECT id, name, email, phone, property_id FROM tenants WHERE email = $1 OR email_2 = $1', [email]);
      tenantByEmail.forEach((t: any) => results.push({ ...t, source: 'tenant', match: 'email' }));

      const landlordByEmail = await query('SELECT id, name, email, phone FROM landlords WHERE email = $1', [email]);
      landlordByEmail.forEach((l: any) => results.push({ ...l, source: 'landlord', match: 'email' }));

      const enqByEmail = await query(
        'SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE (email_1 = $1 OR email_2 = $1) AND id != $2',
        [email, exclude_id || 0]
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
        'SELECT id, first_name_1, last_name_1, email_1, phone_1, status FROM tenant_enquiries WHERE (phone_1 = $1 OR phone_2 = $1) AND id != $2',
        [phone, exclude_id || 0]
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

    const { property_id, tenancy_start_date, tenancy_type, monthly_rent } = req.body;
    const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;

    const tenantId = await insert(`
      INSERT INTO tenants (
        title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
        is_joint_tenancy, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2,
        kyc_completed_1, kyc_completed_2, property_id, tenancy_start_date, tenancy_type, monthly_rent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    `, [
      enquiry.title_1, enquiry.first_name_1, enquiry.last_name_1, name, enquiry.email_1, enquiry.phone_1,
      enquiry.date_of_birth_1, enquiry.is_joint_application, enquiry.title_2, enquiry.first_name_2,
      enquiry.last_name_2, enquiry.email_2, enquiry.phone_2, enquiry.date_of_birth_2,
      enquiry.kyc_completed_1, enquiry.kyc_completed_2, property_id, tenancy_start_date, tenancy_type, monthly_rent
    ]);

    await run("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', parseInt(req.params.id as string), { converted_to_tenant: tenantId });
    res.json({ tenant_id: tenantId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert enquiry' });
  }
});

app.get('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiry = await queryOne(`
      SELECT te.*, p.address as property_address FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id WHERE te.id = $1
    `, [req.params.id as string]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    res.json(enquiry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiry' });
  }
});

app.put('/api/tenant-enquiries/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed = ['title_1','first_name_1','last_name_1','email_1','phone_1','date_of_birth_1','current_address_1','employment_status_1','employer_1','income_1','is_joint_application','title_2','first_name_2','last_name_2','email_2','phone_2','date_of_birth_2','current_address_2','employment_status_2','employer_2','income_2','kyc_completed_1','kyc_completed_2','status','follow_up_date','viewing_date','viewing_with','linked_property_id','notes','rejection_reason'];
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
    const updated = await queryOne(`SELECT te.*, p.address as property_address FROM tenant_enquiries te LEFT JOIN properties p ON p.id = te.linked_property_id WHERE te.id=$1`, [req.params.id]);
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
      'nok_name','nok_relationship','nok_phone','nok_email',
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
app.get('/api/public/properties', async (req, res) => {
  try {
    console.log('[Public Properties] Fetching properties with status: to_let, available');
    // First get ALL properties to debug
    const allProps = await query(`SELECT p.id, p.address, p.status FROM properties p`);
    console.log(`[Public Properties] Total properties in DB: ${allProps.length}`, allProps);

    const properties = await query(`
      SELECT p.id, p.address, p.postcode, p.property_type, p.bedrooms, p.rent_amount, p.status
      FROM properties p
      WHERE p.status = 'to_let' OR p.status = 'available'
      ORDER BY p.address
    `);
    console.log(`[Public Properties] Found ${properties.length} properties with status filter`);
    res.json(properties);
  } catch (err) {
    console.error('[Public Properties] Error:', err);
    res.status(500).json({ error: 'Failed to fetch properties', details: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const properties = await query(`
      SELECT p.*, l.name as landlord_name,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant
      FROM properties p JOIN landlords l ON l.id = p.landlord_id ORDER BY p.address
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
        (SELECT t.id FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant_id
      FROM properties p JOIN landlords l ON l.id = p.landlord_id WHERE p.id = $1
    `, [req.params.id as string]);
    if (!property) return res.status(404).json({ error: 'Property not found' });
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
    const { title, description, priority, status, assigned_to, due_date, notes } = req.body;
    const completed_at = status === 'completed' ? new Date().toISOString() : null;
    await run('UPDATE tasks SET title=$1, description=$2, priority=$3, status=$4, assigned_to=$5, due_date=$6, notes=$7, completed_at=$8, updated_at=CURRENT_TIMESTAMP WHERE id=$9',
      [title, description, priority, status, assigned_to, due_date, notes, completed_at, req.params.id]);
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
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch task' });
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
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch maintenance request' });
  }
});

app.put('/api/maintenance/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    await run('UPDATE maintenance SET status=$1, contractor=$2, cost=$3, resolution_notes=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5',
      [d.status, d.contractor, d.cost, d.resolution_notes, req.params.id]);
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
  property: ['Gas Safety Certificate', 'EPC', 'EICR', 'Proof of Ownership', 'Insurance', 'Other'],
};

app.get('/api/documents/types/:entityType', authMiddleware, (req: AuthRequest, res) => {
  const types = DOC_TYPES[req.params.entityType as string] || ['Other'];
  res.json(types);
});

app.get('/api/documents/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const docs = await query(
      'SELECT id, doc_type, original_name, mime_type, size, uploaded_at FROM documents WHERE entity_type = $1 AND entity_id = $2 ORDER BY uploaded_at DESC',
      [req.params.entityType, req.params.entityId]
    );
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/documents/:entityType/:entityId', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { doc_type } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    
    const id = await insert(
      'INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [entityType, entityId, doc_type, file.filename, file.originalname, file.mimetype, file.size, req.user?.id]
    );
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
    await run('DELETE FROM tenants WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'tenant', parseInt(req.params.id as string));
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
    const { property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to } = req.body;
    const viewingId = await insert(`
      INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [property_id, enquiry_id || null, viewer_name, viewer_email || null, viewer_phone || null, viewing_date, viewing_time || null, notes || null]);

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
    const url = `http://landregistry.data.gov.uk/data/ppi/transaction-record.json?_pageSize=20&propertyAddress.postcode=${encodeURIComponent(cleanPostcode)}`;

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
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
