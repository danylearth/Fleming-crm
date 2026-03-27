import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool, { initDb, query, queryOne, insert, run } from './db-pg';
import { generateToken, authMiddleware, AuthRequest } from './auth';
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
    const { name, email, phone, address, notes, company_number } = req.body;
    const id = await insert(
      'INSERT INTO landlords (name, email, phone, address, notes, company_number) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, email || null, phone || null, address || null, notes || null, company_number || null]
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
    const { name, email, phone, address, notes, company_number } = req.body;
    await run('UPDATE landlords SET name=$1, email=$2, phone=$3, address=$4, notes=$5, company_number=$6 WHERE id=$7',
      [name, email, phone, address, notes, company_number || null, id]);
    await logAudit(req.user?.id, req.user?.email, 'update', 'landlord', parseInt(id), req.body);
    res.json({ success: true });
  } catch (err) {
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
    const allowed = ['title_1','first_name_1','last_name_1','email_1','phone_1','date_of_birth_1','current_address_1','employment_status_1','employer_1','income_1','is_joint_application','title_2','first_name_2','last_name_2','email_2','phone_2','date_of_birth_2','current_address_2','employment_status_2','employer_2','income_2','kyc_completed_1','kyc_completed_2','status','follow_up_date','viewing_date','linked_property_id','notes','rejection_reason'];
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
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const users = await query('SELECT id, email, name, role, is_active, created_at, last_login FROM users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { email, password, name, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = await insert('INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)',
      [email, hashedPassword, name, role || 'staff']);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ============ INVENTORY ROUTES ============
registerInventoryRoutes(app, authMiddleware);

// SPA fallback (disabled in production - frontend deployed separately)
// app.get(/^(?!\/api).*/, (req, res) => {
//   res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
// });

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
