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

// Create documents table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('landlord', 'tenant', 'property')),
    entity_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// ============ AUTH ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email) as any;
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name }, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// Create initial admin if none exists
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
    
    stats.properties = (db.prepare('SELECT COUNT(*) as c FROM properties').get() as any).c;
    stats.propertiesLet = (db.prepare("SELECT COUNT(*) as c FROM properties WHERE status = 'let'").get() as any).c;
    stats.landlords = (db.prepare('SELECT COUNT(*) as c FROM landlords').get() as any).c;
    stats.tenants = (db.prepare('SELECT COUNT(*) as c FROM tenants').get() as any).c;
    stats.activeTenancies = (db.prepare("SELECT COUNT(*) as c FROM tenancies WHERE status = 'active'").get() as any).c;
    stats.openMaintenance = (db.prepare("SELECT COUNT(*) as c FROM maintenance WHERE status IN ('open', 'in_progress')").get() as any).c;
    
    // Monthly income (payments this month)
    const incomeResult = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
      WHERE type = 'payment' AND date >= date('now', 'start of month')
    `).get() as any;
    stats.monthlyIncome = incomeResult.total;
    
    // Outstanding rent
    const outstanding = db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN type = 'rent_due' THEN amount ELSE -amount END), 0) as total 
      FROM transactions WHERE type IN ('rent_due', 'payment')
    `).get() as any;
    stats.outstandingRent = Math.max(0, outstanding.total);
    
    // Recent maintenance
    stats.recentMaintenance = db.prepare(`
      SELECT m.*, p.address FROM maintenance m
      JOIN properties p ON p.id = m.property_id
      ORDER BY m.created_at DESC LIMIT 5
    `).all();
    
    res.json(stats);
  } catch (err) {
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
    const { name, email, phone, address, notes } = req.body;
    const stmt = db.prepare('INSERT INTO landlords (name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(name, email || null, phone || null, address || null, notes || null);
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
    res.json(landlord);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch landlord' });
  }
});

app.put('/api/landlords/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, address, notes } = req.body;
    db.prepare('UPDATE landlords SET name=?, email=?, phone=?, address=?, notes=? WHERE id=?')
      .run(name, email, phone, address, notes, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update landlord' });
  }
});

// ============ TENANTS ============

app.get('/api/tenants', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenants = db.prepare(`
      SELECT t.*,
        (SELECT p.address FROM tenancies tn JOIN properties p ON p.id = tn.property_id 
         WHERE tn.tenant_id = t.id AND tn.status = 'active' LIMIT 1) as current_property
      FROM tenants t ORDER BY t.name
    `).all();
    res.json(tenants);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

app.post('/api/tenants', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, emergency_contact, notes } = req.body;
    const stmt = db.prepare('INSERT INTO tenants (name, email, phone, emergency_contact, notes) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(name, email || null, phone || null, emergency_contact || null, notes || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

app.get('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const tenant = db.prepare(`
      SELECT t.*,
        (SELECT p.address FROM tenancies tn JOIN properties p ON p.id = tn.property_id 
         WHERE tn.tenant_id = t.id AND tn.status = 'active' LIMIT 1) as current_property
      FROM tenants t WHERE t.id = ?
    `).get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

app.put('/api/tenants/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { name, email, phone, emergency_contact, notes } = req.body;
    db.prepare('UPDATE tenants SET name=?, email=?, phone=?, emergency_contact=?, notes=? WHERE id=?')
      .run(name, email, phone, emergency_contact, notes, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// ============ PROPERTIES ============

app.get('/api/properties', authMiddleware, (req: AuthRequest, res) => {
  try {
    const properties = db.prepare(`
      SELECT p.*, l.name as landlord_name,
        (SELECT t.name FROM tenancies tn JOIN tenants t ON t.id = tn.tenant_id 
         WHERE tn.property_id = p.id AND tn.status = 'active' LIMIT 1) as current_tenant
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
    const { landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, notes } = req.body;
    const stmt = db.prepare(`
      INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(landlord_id, address, postcode, property_type || 'house', bedrooms || 1, rent_amount, status || 'available', notes || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create property' });
  }
});

app.get('/api/properties/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const property = db.prepare(`
      SELECT p.*, l.name as landlord_name, l.phone as landlord_phone, l.email as landlord_email,
        (SELECT t.name FROM tenancies tn JOIN tenants t ON t.id = tn.tenant_id 
         WHERE tn.property_id = p.id AND tn.status = 'active' LIMIT 1) as current_tenant,
        (SELECT tn.id FROM tenancies tn WHERE tn.property_id = p.id AND tn.status = 'active' LIMIT 1) as current_tenancy_id
      FROM properties p
      JOIN landlords l ON l.id = p.landlord_id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

app.put('/api/properties/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, notes } = req.body;
    db.prepare(`
      UPDATE properties SET landlord_id=?, address=?, postcode=?, property_type=?, bedrooms=?, rent_amount=?, status=?, notes=? 
      WHERE id=?
    `).run(landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, notes, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// ============ TENANCIES ============

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
    
    // Update property status
    db.prepare("UPDATE properties SET status = 'let' WHERE id = ?").run(property_id);
    
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tenancy' });
  }
});

// ============ TRANSACTIONS ============

app.get('/api/transactions', authMiddleware, (req: AuthRequest, res) => {
  try {
    const transactions = db.prepare(`
      SELECT tr.*, p.address, t.name as tenant_name
      FROM transactions tr
      JOIN tenancies tn ON tn.id = tr.tenancy_id
      JOIN properties p ON p.id = tn.property_id
      JOIN tenants t ON t.id = tn.tenant_id
      ORDER BY tr.date DESC, tr.created_at DESC
      LIMIT 100
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
      INSERT INTO transactions (tenancy_id, type, amount, description, date, created_by) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(tenancy_id, type, amount, description || null, date, req.user!.id);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction' });
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
    const { property_id, reported_by, title, description, priority } = req.body;
    const stmt = db.prepare(`
      INSERT INTO maintenance (property_id, reported_by, title, description, priority) 
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(property_id, reported_by || null, title, description, priority || 'medium');
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create maintenance request' });
  }
});

app.put('/api/maintenance/:id', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { status, contractor, cost, notes } = req.body;
    db.prepare(`
      UPDATE maintenance SET status=?, contractor=?, cost=?, notes=?, updated_at=CURRENT_TIMESTAMP 
      WHERE id=?
    `).run(status, contractor || null, cost || null, notes || null, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update maintenance' });
  }
});

// ============ DOCUMENTS ============

// Document types by entity
const DOC_TYPES = {
  landlord: ['ID', 'Proof of Address', 'Bank Details', 'Tax Documents', 'Other'],
  tenant: ['ID', 'Proof of Address', 'Employment Reference', 'Previous Landlord Reference', 'Right to Rent', 'Credit Check', 'Other'],
  property: ['Gas Safety Certificate', 'EPC', 'EICR', 'Proof of Ownership', 'Insurance', 'Floor Plan', 'Photos', 'Inventory', 'Other']
};

app.get('/api/documents/types/:entityType', authMiddleware, (req: AuthRequest, res) => {
  const types = DOC_TYPES[req.params.entityType as keyof typeof DOC_TYPES];
  if (!types) return res.status(400).json({ error: 'Invalid entity type' });
  res.json(types);
});

app.get('/api/documents/:entityType/:entityId', authMiddleware, (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const docs = db.prepare(`
      SELECT id, doc_type, original_name, mime_type, size, uploaded_at 
      FROM documents WHERE entity_type = ? AND entity_id = ? 
      ORDER BY uploaded_at DESC
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
      INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(entityType, entityId, doc_type, file.filename, file.originalname, file.mimetype, file.size);
    
    res.json({ 
      id: result.lastInsertRowid,
      doc_type,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size
    });
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
    
    // Delete file
    const filePath = path.join(uploadsDir, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    
    // Delete record
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// SPA fallback
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Fleming Portal running on http://localhost:${PORT}`);
});
