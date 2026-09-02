import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pool, { initDb, query, queryOne, insert, run } from './db-pg';
import { generateToken, authMiddleware, AuthRequest, requireRole, requirePermission } from './auth';
import { registerInventoryRoutes } from './inventory-routes';
import { SMS_FROM, validateTwilioWebhook, normalizeUkPhone as normalizePhone } from './sms';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { startScheduler } from './scheduler-pg';
import { coerceImportValue } from './import-utils';
import { applicationFormIssues, isValidEmail, isValidUkMobile, normalizePropertyTypes } from './public-form-validation';
import { generateCompletedApplicationPdf } from './application-pdf';
import {
  bankDetailsForRoute,
  generateTenancyAgreementPdf,
  resolveAgreementType,
  resolvePaymentRoute,
} from './tenancy-agreement-pdf';
import { normalizePropertyAddress } from './email';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { propertyCompliance } from './property-compliance';

// Validate required environment variables
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Please set DATABASE_URL to your PostgreSQL connection string');
  process.exit(1);
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Error tracking — activates only when a SENTRY_DSN is configured
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  logger.info('Sentry error tracking enabled');
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Behind Railway/Fly/Vercel there is exactly one proxy hop; without this,
// express-rate-limit v8 either throws per-request or buckets all clients
// on the proxy IP.
app.set('trust proxy', 1);

// Ensure uploads directory exists — UPLOADS_PATH points at the persistent
// volume in production; the local fallback is ephemeral
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads');
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

function signatureDataBytes(dataUrl: string): Uint8Array {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Signature must be a PNG image');
  return Uint8Array.from(Buffer.from(match[1], 'base64'));
}

function escapeHtmlText(value: unknown): string {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] || character));
}

async function finaliseTenancyAgreement(agreementId: number): Promise<void> {
  const agreement = await queryOne('SELECT * FROM tenancy_agreements WHERE id = $1', [agreementId]);
  if (!agreement?.tenant_signature || (agreement.requires_landlord_signature && !agreement.landlord_signature)) return;
  const sourcePath = path.join(uploadsDir, agreement.filename);
  const pdf = await PDFDocument.load(fs.readFileSync(sourcePath));
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Electronic Signature Certificate', { x: 52, y: 780, size: 20, font: bold, color: rgb(0.15, 0.03, 0.23) });
  page.drawText('Fleming Lettings and Developments UK Limited', { x: 52, y: 750, size: 11, font, color: rgb(0.35, 0.35, 0.35) });
  let y = 690;
  const drawSignature = async (role: string, name: string, signedAt: string, signature: string) => {
    page.drawText(`${role}: ${name}`, { x: 52, y, size: 13, font: bold, color: rgb(0.15, 0.03, 0.23) });
    page.drawText(`Signed: ${new Date(signedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}`, { x: 52, y: y - 22, size: 10, font });
    const image = await pdf.embedPng(signatureDataBytes(signature));
    const scaled = image.scaleToFit(220, 90);
    page.drawImage(image, { x: 52, y: y - 125, width: scaled.width, height: scaled.height });
    y -= 180;
  };
  await drawSignature('Tenant', agreement.tenant_signature_name, agreement.tenant_signed_at, agreement.tenant_signature);
  if (agreement.requires_landlord_signature) {
    await drawSignature('Landlord', agreement.landlord_signature_name, agreement.landlord_signed_at, agreement.landlord_signature);
  }
  page.drawText(`Agreement reference: FL-TA-${agreement.id}`, { x: 52, y: 80, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  const bytes = await pdf.save();
  const signedFilename = `signed-tenancy-agreement-${agreement.id}-${Date.now()}.pdf`;
  fs.writeFileSync(path.join(uploadsDir, signedFilename), bytes);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE tenancy_agreements SET status = 'completed', signed_filename = $1, completed_at = NOW() WHERE id = $2`, [signedFilename, agreement.id]);
    const entities: Array<[string, number]> = [['tenant_enquiry', agreement.enquiry_id]];
    if (agreement.property_id) entities.push(['property', agreement.property_id]);
    if (agreement.tenant_id) entities.push(['tenant', agreement.tenant_id]);
    for (const [entityType, entityId] of entities) {
      await client.query(`
        INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, review_status)
        VALUES ($1, $2, 'Signed Tenancy Agreement', $3, $4, 'application/pdf', $5, 'approved')
      `, [entityType, entityId, signedFilename, `Signed ${agreement.original_name}`, bytes.length]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    try { fs.unlinkSync(path.join(uploadsDir, signedFilename)); } catch { /* cleanup only */ }
    throw error;
  } finally {
    client.release();
  }
}

app.use(helmet());

// Structured request logging; health-check probes excluded to keep logs readable
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/api/health' },
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // curl, mobile apps, etc.
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return callback(null, true);
    if (origin === 'https://fleminglettings.co.uk' || origin.endsWith('.fleminglettings.co.uk')) return callback(null, true);
    if (origin === 'https://fleming-portal.vercel.app') return callback(null, true); // exact — no *.vercel.app wildcard
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
// Bulk imports need more than Express's 100KB default. Authenticate before
// accepting the larger body so unauthenticated callers cannot consume it.
app.use('/api/import', authMiddleware, express.json({ limit: '2mb' }));

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

const publicDocumentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many document requests from this IP, please try again later' },
});

// Public form input hygiene — these values end up rendered in the staff CRM,
// so strip HTML tags and control chars and cap the length at the door.
function sanitizePublicStrings(value: any): any {
  if (typeof value === 'string') {
    return value
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim()
      .slice(0, 2000);
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizePublicStrings);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value).slice(0, 250)) value[key] = sanitizePublicStrings(value[key]);
  }
  return value;
}

const PUBLIC_APPLICATION_DOCUMENT_TYPES = [
  'Primary Identification',
  'Secondary Identification',
  'Proof of Income or Employment',
  'Bank Statements',
  'Other Financial Document',
] as const;

function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!dmy) return trimmed;
  const [, day, month, year] = dmy;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Pagination for list endpoints: ?limit= (default 500, max 1000) and ?offset=
function pageParams(req: express.Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ''), 10) || 500, 1), 1000);
  const offset = Math.max(parseInt(String(req.query.offset ?? ''), 10) || 0, 0);
  return { limit, offset };
}

async function linkedEntityIds(entityType: string, entityId: number): Promise<number[]> {
  if (entityType !== 'tenant_enquiry') return [entityId];
  const record = await queryOne(
    'SELECT id, joint_partner_id FROM tenant_enquiries WHERE id = $1',
    [entityId]
  );
  return record ? [...new Set([record.id, record.joint_partner_id].filter(Boolean))] as number[] : [entityId];
}

// "£30,000" / "30,000" → 30000; anything non-numeric → null (never NaN into REAL columns)
function parsePublicNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value).replace(/[£$€,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

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

// Brute-force protection: keyed on IP + submitted email so one attacker IP
// can't lock out the office, and one email can't be hammered from one IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Too many login attempts, please try again later' },
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
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
    const cnt = (row: any) => Number(row.c);

    const properties = cnt(await queryOne('SELECT COUNT(*)::integer as c FROM properties'));
    const propertiesLet = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM properties WHERE status = 'let'"));
    const landlords = cnt(await queryOne('SELECT COUNT(*)::integer as c FROM landlords'));
    const tenants = cnt(await queryOne('SELECT COUNT(*)::integer as c FROM tenants'));
    const activeTenancies = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM tenancies WHERE status = 'active'"));
    const openMaintenance = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM maintenance WHERE status IN ('open', 'in_progress')"));
    const bdmProspects = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM landlords_bdm WHERE status NOT IN ('onboarded', 'not_interested')"));
    const activeEnquiries = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM tenant_enquiries WHERE status NOT IN ('rejected', 'converted')"));
    const tasksOverdue = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date < CURRENT_DATE"));
    const tasksDueToday = cnt(await queryOne("SELECT COUNT(*)::integer as c FROM tasks WHERE status IN ('pending', 'in_progress') AND due_date = CURRENT_DATE"));

    const complianceAlerts = await query(`
      SELECT id, address as property_address, 'EICR' as type, eicr_expiry_date as expiry_date
      FROM properties WHERE eicr_expiry_date IS NOT NULL AND eicr_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT id, address as property_address, 'EPC', epc_expiry_date FROM properties WHERE epc_expiry_date IS NOT NULL AND epc_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      UNION ALL
      SELECT id, address as property_address, 'Gas Safety', gas_safety_expiry_date FROM properties WHERE has_gas = 1 AND gas_safety_expiry_date IS NOT NULL AND gas_safety_expiry_date <= CURRENT_DATE + INTERVAL '14 days'
      ORDER BY expiry_date LIMIT 10
    `);

    const recentMaintenance = await query(`
      SELECT m.id, m.description, m.status, m.priority, COALESCE(p.address, 'Unknown property') as property_address
      FROM maintenance m
      LEFT JOIN properties p ON p.id = m.property_id
      WHERE m.status IN ('open', 'in_progress')
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
               m.created_at DESC LIMIT 5
    `);

    const recentTasks = await query(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date FROM tasks t
      WHERE t.status IN ('pending', 'in_progress')
      ORDER BY t.due_date NULLS LAST, CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
      LIMIT 5
    `);

    await logAudit(req.user?.id, req.user?.email, 'view', 'dashboard');
    res.json({
      stats: {
        properties,
        properties_let: propertiesLet,
        landlords,
        tenants,
        active_tenancies: activeTenancies,
        open_maintenance: openMaintenance,
        bdm_prospects: bdmProspects,
        active_enquiries: activeEnquiries,
        tasks_overdue: tasksOverdue,
        tasks_due_today: tasksDueToday,
      },
      complianceAlerts,
      recentMaintenance,
      recentTasks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============ LANDLORDS ============

app.get('/api/landlords', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { limit, offset } = pageParams(req);
    const landlords = await query(`
      SELECT l.*, (SELECT COUNT(*) FROM properties p WHERE p.landlord_id = l.id) as property_count
      FROM landlords l ORDER BY l.name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
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
    const intFields = ['marketing_post','marketing_email','marketing_phone','marketing_sms','kyc_completed'];
    const insertCols: string[] = [];
    const insertVals: any[] = [];
    const placeholders: string[] = [];
    let pIdx = 1;
    for (const key of cols) {
      if (key in d && d[key] !== undefined) {
        insertCols.push(key);
        placeholders.push(`$${pIdx++}`);
        insertVals.push(intFields.includes(key) ? (d[key] ? 1 : 0) : (d[key] ?? null));
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

// Check for duplicate landlords (must be above :id route)
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
    const intFields = ['marketing_post','marketing_email','marketing_phone','marketing_sms','kyc_completed'];
    const nullableDateFields = ['date_of_birth'];
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(
          intFields.includes(key) ? (d[key] ? 1 : 0) :
          nullableDateFields.includes(key) && d[key] === '' ? null : d[key]
        );
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

app.delete('/api/landlords/:id', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    // properties.landlord_id is NOT NULL — a landlord with properties cannot be deleted
    const owned = await queryOne('SELECT COUNT(*)::int AS count FROM properties WHERE landlord_id = $1', [id]);
    if (owned && owned.count > 0) {
      return res.status(409).json({ error: `Landlord owns ${owned.count} propert${owned.count === 1 ? 'y' : 'ies'} — delete or reassign them first` });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE maintenance SET landlord_id = NULL WHERE landlord_id = $1', [id]);
      await client.query('DELETE FROM property_landlords WHERE landlord_id = $1', [id]);
      await client.query('DELETE FROM directors WHERE landlord_id = $1', [id]);
      await client.query('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['landlord', id]);
      await client.query('DELETE FROM landlords WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
    await logAudit(req.user?.id, req.user?.email, 'delete', 'landlord', parseInt(id));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete landlord:', err);
    res.status(500).json({ error: 'Failed to delete landlord' });
  }
});

app.post('/api/landlords/bulk-delete', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    // properties.landlord_id is NOT NULL — landlords with properties cannot be deleted
    const owned = await queryOne(`SELECT COUNT(*)::int AS count FROM properties WHERE landlord_id IN (${placeholders})`, ids);
    if (owned && owned.count > 0) {
      return res.status(409).json({ error: `Selection includes landlords owning ${owned.count} propert${owned.count === 1 ? 'y' : 'ies'} — delete or reassign them first` });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE maintenance SET landlord_id = NULL WHERE landlord_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM property_landlords WHERE landlord_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM directors WHERE landlord_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM documents WHERE entity_type = 'landlord' AND entity_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM landlords WHERE id IN (${placeholders})`, ids);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    for (const id of ids) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'landlord', id);
    }

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk delete landlords' });
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

// Get all directors for a landlord (supports ?archived=true/false filter)
app.get('/api/landlords/:landlordId/directors', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { archived } = req.query;
    let sql = 'SELECT * FROM directors WHERE landlord_id = $1';
    const params: any[] = [req.params.landlordId];
    if (archived === 'true') {
      sql += ' AND archived = 1';
    } else if (archived === 'false') {
      sql += ' AND archived = 0';
    }
    sql += ' ORDER BY created_at DESC';
    const directors = await query(sql, params);
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
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of ['name', 'email', 'phone', 'date_of_birth', 'role', 'kyc_completed', 'notes']) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(key === 'kyc_completed' ? (d[key] ? 1 : 0) : d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push('updated_at=CURRENT_TIMESTAMP');
    values.push(req.params.id);
    await run(`UPDATE directors SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'director', parseInt(req.params.id as string), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update director' });
  }
});

// Archive a director (soft-delete)
app.delete('/api/directors/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await run('UPDATE directors SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'archive', 'director', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to archive director' });
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

    // Sync properties.landlord_id when adding a primary landlord
    if (is_primary) {
      await run('UPDATE properties SET landlord_id = $1 WHERE id = $2', [landlord_id, req.params.propertyId]);
    }

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
      SET is_primary = $1, ownership_percentage = $2, ownership_entity_type = $3
      WHERE id = $4
    `, [is_primary ? 1 : 0, ownership_percentage || null, ownership_entity_type || 'individual', req.params.linkId]);

    // Sync properties.landlord_id when changing primary
    if (is_primary) {
      await run('UPDATE properties SET landlord_id = $1 WHERE id = $2', [link.landlord_id, link.property_id]);
    }

    await logAudit(req.user?.id, req.user?.email, 'update', 'property_landlord', parseInt(req.params.linkId as string), { is_primary, ownership_percentage, ownership_entity_type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update property landlord link' });
  }
});

// Remove landlord from property
app.delete('/api/property-landlords/:linkId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const link = await queryOne('SELECT * FROM property_landlords WHERE id = $1', [req.params.linkId]);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const alternatives = await query(
      'SELECT * FROM property_landlords WHERE property_id = $1 AND id <> $2 ORDER BY is_primary DESC, id ASC',
      [link.property_id, link.id]
    );
    if (link.is_primary && alternatives.length === 0) {
      return res.status(409).json({ error: 'Assign another landlord before removing the property’s only landlord' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM property_landlords WHERE id = $1', [link.id]);
      if (link.is_primary) {
        const replacement = alternatives[0];
        await client.query(
          'UPDATE property_landlords SET is_primary = CASE WHEN id = $1 THEN 1 ELSE 0 END WHERE property_id = $2',
          [replacement.id, link.property_id]
        );
        await client.query('UPDATE properties SET landlord_id = $1 WHERE id = $2', [replacement.landlord_id, link.property_id]);
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
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
    await logAudit(req.user?.id, req.user?.email, 'create', 'landlord_bdm', id, req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create landlord BDM' });
  }
});

app.get('/api/landlords-bdm/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const prospect = await queryOne('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id as string]);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    await logAudit(req.user?.id, req.user?.email, 'view', 'landlord_bdm', parseInt(req.params.id as string));
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
    const bdmId = parseInt(req.params.id as string);
    // Fetch old record to detect status change
    const oldRecord = await queryOne('SELECT status FROM landlords_bdm WHERE id = $1', [bdmId]);
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    await run(`UPDATE landlords_bdm SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'landlord_bdm', bdmId, d);
    if (d.status && oldRecord && d.status !== oldRecord.status) {
      await logAudit(req.user?.id, req.user?.email, 'status_changed', 'landlord_bdm', bdmId, { from: oldRecord.status, to: d.status });
    }
    const updated = await queryOne('SELECT * FROM landlords_bdm WHERE id = $1', [req.params.id]);
    res.json(updated);
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

    // Use transaction to prevent orphaned landlord if BDM status update fails
    const client = await pool.connect();
    let landlordId: number;
    try {
      await client.query('BEGIN');
      const insertResult = await client.query(
        'INSERT INTO landlords (name, email, phone, address, notes, landlord_type, referral_source) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [prospect.name, prospect.email, prospect.phone, prospect.address, prospect.notes, landlord_type || 'external', prospect.source]
      );
      landlordId = insertResult.rows[0].id;
      await client.query("UPDATE landlords_bdm SET status = 'onboarded', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id as string]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit(req.user?.id, req.user?.email, 'create', 'landlord', landlordId, { converted_from_bdm: parseInt(req.params.id as string) });
    await logAudit(req.user?.id, req.user?.email, 'update', 'landlord_bdm', parseInt(req.params.id as string), { converted_to_landlord: landlordId });

    res.json({ landlord_id: landlordId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to convert prospect' });
  }
});

app.post('/api/landlords-bdm/bulk-delete', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
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
    const { limit, offset } = pageParams(req);
    const enquiries = await query(`
      SELECT te.*, p.address as property_address,
        EXISTS (
          SELECT 1 FROM tenancy_agreements ta
          WHERE ta.enquiry_id = te.id AND ta.status = 'completed'
        ) AS tenancy_agreement_completed
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      ORDER BY te.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    // Bank details, NI numbers and signatures are detail-view data — never ship
    // them in the list payload (the detail route requires a specific id)
    const SENSITIVE = ['app_bank_name', 'app_bank_sort_code', 'app_bank_account_number', 'app_ni_number', 'app_signature'];
    for (const row of enquiries) {
      for (const key of SENSITIVE) delete row[key];
    }
    res.json(enquiries);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch enquiries' });
  }
});

// Public endpoint for landlord enquiry form submissions (no auth required)
app.post('/api/public/landlord-enquiries', publicSubmitLimiter, async (req, res) => {
  try {
    sanitizePublicStrings(req.body);
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
        error: 'Please enter a valid email address.'
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
    sanitizePublicStrings(req.body);
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

    if (!isValidEmail(form_email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address.'
      });
    }
    if (!isValidUkMobile(contactNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid UK mobile number' });
    }

    // Determine if joint application
    const is_joint = registration_type === 'Joint' ? 1 : 0;
    if (is_joint && !isValidEmail(form_email2)) {
      return res.status(400).json({ success: false, error: 'Invalid second applicant email address' });
    }
    if (is_joint && !isValidUkMobile(contactNumber2)) {
      return res.status(400).json({ success: false, error: 'Invalid second applicant UK mobile number' });
    }
    const incomeStatuses = ['Full-Time Employed', 'Part-Time Employed', 'Self-Employed', 'Retired'];
    if (incomeStatuses.includes(EmploymentStatus) && !String(job_title || '').trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required' });
    }
    if (incomeStatuses.includes(EmploymentStatus) && !parsePublicNumber(AnnualSalary)) {
      return res.status(400).json({ success: false, error: 'Annual income is required' });
    }
    if (is_joint && incomeStatuses.includes(EmploymentStatus2) && !String(job_title2 || '').trim()) {
      return res.status(400).json({ success: false, error: 'Job title is required for the second applicant' });
    }
    if (is_joint && incomeStatuses.includes(EmploymentStatus2) && !parsePublicNumber(AnnualSalary2)) {
      return res.status(400).json({ success: false, error: 'Annual income is required for the second applicant' });
    }
    const preferredPropertyTypes = normalizePropertyTypes(typeofproperty);
    if (!preferredPropertyTypes) {
      return res.status(400).json({ success: false, error: 'Please select at least one property type' });
    }

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
      income_1: parsePublicNumber(AnnualSalary2),
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
      income_1: parsePublicNumber(AnnualSalary),
      contract_type_1: contract_type || null,
      is_joint_application: is_joint,
      preferred_tenancy_type: tenancylookingfor || null,
      preferred_property_type: preferredPropertyTypes,
      preferred_bedrooms: noofbedrooms || null,
      preferred_parking: roadparking || null,
      max_rent: parsePublicNumber(rent_max),
      marketing_preferences: marketing_preferences || null,
      linked_property_id: Number.isInteger(parseInt(property_id)) ? parseInt(property_id) : null,
      notes: notes || null,
      // Secret the form echoes back to authorise document uploads for this enquiry.
      // Staff onboarding reuses this token so previously issued links remain valid.
      application_form_token: crypto.randomBytes(24).toString('hex'),
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

    // Fire-and-forget confirmation email to the applicant — must never delay
    // or fail the submission response
    (async () => {
      const { sendEmail, enquiryConfirmationEmail } = require('./email');
      let propertyAddress: string | null = null;
      if (data.linked_property_id) {
        const prop = await queryOne('SELECT address FROM properties WHERE id = $1', [data.linked_property_id]);
        propertyAddress = prop?.address || null;
      }
      const applicantNames = [FirstName, is_joint ? FirstName2 : null].filter(Boolean).join(' and ');
      const content = enquiryConfirmationEmail(applicantNames, `ENQ-${id}`, propertyAddress);
      const result = await sendEmail({
        to: data.email_1,
        subject: content.subject,
        html: content.html,
      });
      await insert(`
        INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, status, sent_by, sent_by_email)
        VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'enquiry_confirmation', $6, NULL, NULL)
      `, [result.id || null, id, data.email_1, 'contact@tenancies.fleminglettings.co.uk', content.subject,
          result.simulated ? 'simulated' : (result.success ? 'sent' : 'failed')]);
    })().catch(err => console.error('Enquiry confirmation email failed:', err));

    res.json({
      enquiry_id: id,
      partner_enquiry_id: partnerId,
      reference: `ENQ-${id}`,
      upload_token: data.application_form_token,
      success: true,
      message: 'Enquiry submitted successfully'
    });
  } catch (err) {
    console.error('Public enquiry submission error:', err);
    res.status(500).json({ error: 'Failed to submit enquiry' });
  }
});

// PUBLIC ENDPOINT - Upload documents for a tenant enquiry (no auth)
app.post('/api/public/tenant-enquiries/:id/documents', publicSubmitLimiter, upload.array('documents', 10), async (req, res) => {
  // Multer has already written the files to disk by the time we run — on any
  // rejection, unlink them so unauthenticated requests can't fill the volume
  const discardUploadedFiles = () => {
    for (const file of (req.files as Express.Multer.File[]) || []) {
      try { fs.unlinkSync(file.path); } catch {}
    }
  };
  try {
    const enquiryId = req.params.id;
    const enquiry = await queryOne('SELECT id, application_form_token FROM tenant_enquiries WHERE id = $1', [enquiryId]);
    if (!enquiry) {
      discardUploadedFiles();
      return res.status(404).json({ error: 'Enquiry not found' });
    }
    // Enquiry IDs are sequential — require the per-enquiry secret issued at submission
    const providedToken = (req.query.token || req.body?.token) as string | undefined;
    if (!providedToken || !enquiry.application_form_token || providedToken !== enquiry.application_form_token) {
      discardUploadedFiles();
      return res.status(403).json({ error: 'Invalid or missing upload token' });
    }
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    for (const file of files) {
      await insert(
        'INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['tenant_enquiry', enquiryId, 'supporting_document', file.filename, file.originalname, file.mimetype, file.size, null]
      );
    }
    res.json({ success: true, message: `${files.length} document(s) uploaded` });
  } catch (err) {
    discardUploadedFiles();
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
      'date_of_birth_1', 'current_address_1', 'postcode_1', 'years_at_address_1',
      'employment_status_1', 'employer_1', 'income_1', 'nationality_1', 'contract_type_1',
      'is_joint_application', 'linked_property_id', 'notes', 'status',
      'preferred_tenancy_type', 'preferred_property_type', 'preferred_bedrooms',
      'max_rent', 'preferred_parking', 'marketing_preferences'
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
    if (!enquiry.holding_deposit_received) return res.status(409).json({ error: 'Confirm the holding deposit before conversion' });
    if (enquiry.application_review_status !== 'approved') return res.status(409).json({ error: 'Approve the application and documents before conversion' });
    if (!enquiry.credit_check_completed) return res.status(409).json({ error: 'Complete the credit check before conversion' });
    const creditReport = await queryOne(`
      SELECT id FROM documents
      WHERE entity_type = 'tenant_enquiry' AND entity_id = $1 AND doc_type = 'Credit Check Report'
      LIMIT 1
    `, [req.params.id]);
    if (!creditReport) return res.status(409).json({ error: 'Upload the credit check report before conversion' });
    const completedAgreement = await queryOne(`SELECT id, signed_filename, original_name FROM tenancy_agreements WHERE enquiry_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`, [req.params.id]);
    if (!completedAgreement) return res.status(409).json({ error: 'Complete the tenancy agreement before conversion' });
    if (!enquiry.balance_payment_received) return res.status(409).json({ error: 'Confirm the final balance before conversion' });
    if (!enquiry.handover_date || !enquiry.handover_assigned_to) return res.status(409).json({ error: 'Schedule the tenancy handover before conversion' });

    const { property_id, tenancy_start_date, tenancy_type, monthly_rent } = req.body;
    const name = `${enquiry.first_name_1} ${enquiry.last_name_1}`;
    const isJoint = !!enquiry.joint_partner_id;

    // Use transaction to prevent orphaned tenant records if status update fails
    const client = await pool.connect();
    let tenantId: number;
    let partnerTenantId: number | null = null;
    try {
      await client.query('BEGIN');

      // Create tenant record for this applicant — copy onboarding data collected during pipeline
      const hasGuarantor = !!(enquiry.app_guarantor_name || enquiry.app_guarantor_phone || enquiry.app_guarantor_email);
      const tenantResult = await client.query(`
        INSERT INTO tenants (
          title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
          is_joint_tenancy, kyc_completed_1, property_id, tenancy_start_date, tenancy_type, monthly_rent,
          holding_deposit_received, holding_deposit_amount, holding_deposit_date,
          nok_name, nok_relationship, nok_phone, nok_address,
          nok_2_name, nok_2_relationship, nok_2_phone, nok_2_address,
          guarantor_required, guarantor_name, guarantor_phone, guarantor_email, guarantor_address,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
        RETURNING id
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
      tenantId = tenantResult.rows[0].id;
      const nextOfKin = enquiry.app_form_data || {};
      await client.query('UPDATE tenants SET nok_email = $1, nok_address = $2 WHERE id = $3', [
        nextOfKin.next_of_kin_email || null,
        [nextOfKin.next_of_kin_address || enquiry.app_next_of_kin_address, nextOfKin.next_of_kin_postcode].filter(Boolean).join(', ') || null,
        tenantId,
      ]);

      await client.query('UPDATE tenancy_agreements SET tenant_id = $1 WHERE id = $2', [tenantId, completedAgreement.id]);
      if (completedAgreement.signed_filename) {
        const signedPath = path.join(uploadsDir, completedAgreement.signed_filename);
        const signedSize = fs.existsSync(signedPath) ? fs.statSync(signedPath).size : null;
        await client.query(`
          INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, review_status)
          VALUES ('tenant', $1, 'Signed Tenancy Agreement', $2, $3, 'application/pdf', $4, 'approved')
        `, [tenantId, completedAgreement.signed_filename, `Signed ${completedAgreement.original_name}`, signedSize]);
      }

      // Sync property.tenant_id so the property shows its new tenant (mirrors PUT /api/tenants sync)
      if (property_id) {
        await client.query('UPDATE properties SET tenant_id = $1 WHERE id = $2', [tenantId, property_id]);
      }

      await client.query("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);

      // If joint application with linked partner, convert partner too
      if (isJoint) {
        const partnerResult = await client.query('SELECT * FROM tenant_enquiries WHERE id = $1', [enquiry.joint_partner_id]);
        const partner = partnerResult.rows[0];
        if (partner && partner.status !== 'converted') {
          const partnerName = `${partner.first_name_1} ${partner.last_name_1}`;
          const partnerHasGuarantor = !!(partner.app_guarantor_name || partner.app_guarantor_phone || partner.app_guarantor_email);
          const partnerTenantResult = await client.query(`
            INSERT INTO tenants (
              title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1,
              is_joint_tenancy, kyc_completed_1, property_id, tenancy_start_date, tenancy_type, monthly_rent,
              holding_deposit_received, holding_deposit_amount, holding_deposit_date,
              nok_name, nok_relationship, nok_phone, nok_address,
              nok_2_name, nok_2_relationship, nok_2_phone, nok_2_address,
              guarantor_required, guarantor_name, guarantor_phone, guarantor_email, guarantor_address,
              notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
            RETURNING id
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
          partnerTenantId = partnerTenantResult.rows[0].id;
          const partnerNextOfKin = partner.app_form_data || {};
          await client.query('UPDATE tenants SET nok_email = $1, nok_address = $2 WHERE id = $3', [
            partnerNextOfKin.next_of_kin_email || null,
            [partnerNextOfKin.next_of_kin_address || partner.app_next_of_kin_address, partnerNextOfKin.next_of_kin_postcode].filter(Boolean).join(', ') || null,
            partnerTenantId,
          ]);

          await client.query("UPDATE tenant_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [enquiry.joint_partner_id]);
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Audit logging outside transaction (non-critical)
    await logAudit(req.user?.id, req.user?.email, 'create', 'tenant', tenantId, { converted_from_enquiry: parseInt(req.params.id as string) });
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', parseInt(req.params.id as string), { converted_to_tenant: tenantId });
    if (partnerTenantId) {
      await logAudit(req.user?.id, req.user?.email, 'create', 'tenant', partnerTenantId, { converted_from_enquiry: enquiry.joint_partner_id });
      await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiry.joint_partner_id, { converted_to_tenant: partnerTenantId });
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
    if (d.status === 'awaiting_response' && oldRecord?.status !== 'awaiting_response' && !('follow_up_return_status' in d)) {
      d.follow_up_return_status = oldRecord?.status || 'new';
    }
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed = ['title_1','first_name_1','last_name_1','email_1','phone_1','date_of_birth_1','current_address_1','postcode_1','years_at_address_1','employment_status_1','employer_1','income_1','nationality_1','contract_type_1','is_joint_application','title_2','first_name_2','last_name_2','email_2','phone_2','date_of_birth_2','current_address_2','employment_status_2','employer_2','income_2','nationality_2','contract_type_2','kyc_completed_1','kyc_completed_2','status','follow_up_date','follow_up_return_status','viewing_date','viewing_with','linked_property_id','notes','rejection_reason','holding_deposit_requested','holding_deposit_received','holding_deposit_amount','holding_deposit_received_date','holding_deposit_received_amount','security_deposit_amount','monthly_rent_agreed','application_form_token','application_form_sent','application_form_completed','id_primary_verified_1','id_secondary_verified_1','id_primary_verified_2','id_secondary_verified_2','bank_statements_received','source_of_funds_verified','employment_check_completed','credit_check_completed','credit_score','credit_check_date','onboarding_step','joint_partner_id','preferred_tenancy_type','preferred_property_type','preferred_bedrooms','max_rent','preferred_parking','marketing_preferences'];
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
    const syncFields = ['status','follow_up_date','follow_up_return_status','viewing_date','viewing_with','linked_property_id','notes','rejection_reason'];
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

async function deleteTenantEnquiries(requestedIds: number[]): Promise<number[]> {
  const client = await pool.connect();
  let filenames: string[] = [];
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      'SELECT id, status FROM tenant_enquiries WHERE id = ANY($1::int[]) FOR UPDATE',
      [requestedIds]
    );
    if (selected.rows.some((row: any) => row.status === 'converted')) {
      throw new Error('Converted enquiries cannot be deleted');
    }
    const ids = selected.rows.map((row: any) => Number(row.id));
    if (ids.length === 0) {
      await client.query('ROLLBACK');
      return [];
    }

    const documents = await client.query(
      "SELECT filename FROM documents WHERE entity_type = 'tenant_enquiry' AND entity_id = ANY($1::int[])",
      [ids]
    );
    filenames = documents.rows.map((row: any) => row.filename).filter(Boolean);

    await client.query('UPDATE tenant_enquiries SET joint_partner_id = NULL WHERE joint_partner_id = ANY($1::int[])', [ids]);
    await client.query('DELETE FROM property_viewings WHERE enquiry_id = ANY($1::int[])', [ids]);
    await client.query(
      "DELETE FROM sms_messages WHERE enquiry_id = ANY($1::int[]) OR (entity_type = 'tenant_enquiry' AND entity_id = ANY($1::int[]))",
      [ids]
    );
    await client.query("DELETE FROM email_messages WHERE entity_type = 'tenant_enquiry' AND entity_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM tasks WHERE entity_type = 'tenant_enquiry' AND entity_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM documents WHERE entity_type = 'tenant_enquiry' AND entity_id = ANY($1::int[])", [ids]);
    await client.query('DELETE FROM tenant_enquiries WHERE id = ANY($1::int[])', [ids]);
    await client.query('COMMIT');

    for (const filename of filenames) {
      const filePath = path.join(uploadsDir, filename);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        console.error(`Failed to remove deleted enquiry file ${filename}:`, err);
      }
    }
    return ids;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

app.delete('/api/tenant-enquiries/:id', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid enquiry id' });
    const deletedIds = await deleteTenantEnquiries([id]);
    if (deletedIds.length === 0) return res.status(404).json({ error: 'Enquiry not found' });
    await logAudit(req.user?.id, req.user?.email, 'delete', 'tenant_enquiry', id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    if (err instanceof Error && err.message === 'Converted enquiries cannot be deleted') {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to delete enquiry' });
  }
});

app.post('/api/tenant-enquiries/bulk-delete', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const ids: number[] = Array.isArray(req.body.ids)
      ? [...new Set<number>(req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))]
      : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }
    const deletedIds = await deleteTenantEnquiries(ids);
    for (const id of deletedIds) {
      await logAudit(req.user?.id, req.user?.email, 'bulk_delete', 'tenant_enquiry', id);
    }
    res.json({ success: true, deleted: deletedIds.length });
  } catch (err) {
    console.error(err);
    if (err instanceof Error && err.message === 'Converted enquiries cannot be deleted') {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to bulk delete tenant enquiries' });
  }
});

app.post('/api/tenant-enquiries/bulk-update', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];
    const status = String(req.body.status || '');
    const allowedStatuses = ['new', 'viewing_booked', 'awaiting_response', 'onboarding', 'rejected'];
    if (ids.length === 0 || !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Valid ids and status are required' });
    }

    const selected = await query(
      'SELECT id, joint_partner_id FROM tenant_enquiries WHERE id = ANY($1::int[])',
      [ids]
    );
    const expandedIds = [...new Set(selected.flatMap((row: any) => [row.id, row.joint_partner_id].filter(Boolean)))];
    await run(
      `UPDATE tenant_enquiries
       SET status = $1,
           rejection_reason = CASE WHEN $1 = 'rejected' THEN $2 ELSE rejection_reason END,
           follow_up_date = CASE WHEN $1 = 'awaiting_response' THEN follow_up_date ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3::int[])`,
      [status, req.body.rejection_reason || null, expandedIds]
    );
    for (const enquiryId of expandedIds) {
      await logAudit(req.user?.id, req.user?.email, 'status_changed', 'tenant_enquiry', enquiryId, { to: status, bulk: true });
    }
    res.json({ success: true, updated: expandedIds.length });
  } catch (err) {
    console.error('Bulk enquiry update failed:', err);
    res.status(500).json({ error: 'Failed to update enquiries' });
  }
});

// ============ TENANTS ============

app.get('/api/tenants', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { limit, offset } = pageParams(req);
    const tenants = await query(`
      SELECT t.*, p.address as property_address, p.landlord_id as property_landlord_id, l.name as property_landlord_name
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      ORDER BY t.name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
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
        nok_name, nok_relationship, nok_phone, nok_email, nok_address,
        nok_2_name, nok_2_relationship, nok_2_phone, nok_2_email, nok_2_address,
        kyc_completed_1, kyc_completed_2,
        kyc_primary_id, kyc_secondary_id, kyc_address_verification, kyc_personal_verification,
        guarantor_required, guarantor_name, guarantor_address, guarantor_phone, guarantor_email,
        guarantor_kyc_completed, guarantor_deed_received,
        holding_deposit_received, holding_deposit_amount, holding_deposit_date,
        application_forms_completed, authority_to_contact, proof_of_income, deposit_scheme,
        income_amount, income_employer, income_contract_type,
        property_id, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date,
        monthly_rent, notes, emergency_contact, status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
        $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56
      )
    `, [
      name,
      d.title_1 || null, d.first_name_1 || name, d.last_name_1 || '',
      d.email || null, d.phone || null, d.date_of_birth_1 || null,
      d.is_joint_tenancy ? 1 : 0,
      d.title_2 || null, d.first_name_2 || null, d.last_name_2 || null,
      d.email_2 || null, d.phone_2 || null, d.date_of_birth_2 || null,
      d.nok_name || null, d.nok_relationship || null, d.nok_phone || null, d.nok_email || null, d.nok_address || null,
      d.nok_2_name || null, d.nok_2_relationship || null, d.nok_2_phone || null, d.nok_2_email || null, d.nok_2_address || null,
      d.kyc_completed_1 ? 1 : 0, d.kyc_completed_2 ? 1 : 0,
      d.kyc_primary_id ? 1 : 0, d.kyc_secondary_id ? 1 : 0, d.kyc_address_verification ? 1 : 0, d.kyc_personal_verification ? 1 : 0,
      d.guarantor_required ? 1 : 0, d.guarantor_name || null, d.guarantor_address || null,
      d.guarantor_phone || null, d.guarantor_email || null,
      d.guarantor_kyc_completed ? 1 : 0, d.guarantor_deed_received ? 1 : 0,
      d.holding_deposit_received ? 1 : 0, d.holding_deposit_amount || null, d.holding_deposit_date || null,
      d.application_forms_completed ? 1 : 0, d.authority_to_contact ? 1 : 0, d.proof_of_income ? 1 : 0, d.deposit_scheme || null,
      d.income_amount || null, d.income_employer || null, d.income_contract_type || null,
      d.property_id || null, d.tenancy_start_date || null, d.tenancy_type || null,
      d.has_end_date ? 1 : 0, d.tenancy_end_date || null,
      d.monthly_rent || null, d.notes || null, d.emergency_contact || null, d.status || 'active'
    ]);
    // Sync property.tenant_id when tenant is created with a property
    if (d.property_id) {
      await run('UPDATE properties SET tenant_id = $1 WHERE id = $2', [id, d.property_id]);
    }
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
      SELECT t.*, p.address as property_address, p.landlord_id as property_landlord_id, l.name as property_landlord_name
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE t.id = $1
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
      'kyc_primary_id','kyc_secondary_id','kyc_address_verification','kyc_personal_verification',
      'guarantor_required','guarantor_name','guarantor_address','guarantor_phone','guarantor_email',
      'guarantor_kyc_completed','guarantor_deed_received',
      'holding_deposit_received','holding_deposit_amount','holding_deposit_date',
      'application_forms_completed','authority_to_contact','proof_of_income','deposit_scheme',
      'income_amount','income_employer','income_contract_type','income_frequency',
      'property_id','tenancy_start_date','tenancy_type','has_end_date','tenancy_end_date',
      'monthly_rent','notes','emergency_contact','status'
    ];
    const boolFields = [
      'is_joint_tenancy','kyc_completed_1','kyc_completed_2',
      'kyc_primary_id','kyc_secondary_id','kyc_address_verification','kyc_personal_verification',
      'guarantor_required','guarantor_kyc_completed','guarantor_deed_received',
      'holding_deposit_received','application_forms_completed','authority_to_contact',
      'proof_of_income','has_end_date'
    ];
    const nullableDateFields = [
      'date_of_birth_1','date_of_birth_2','holding_deposit_date',
      'tenancy_start_date','tenancy_end_date'
    ];
    const nullableNumberFields = ['holding_deposit_amount','income_amount','property_id','monthly_rent'];
    for (const key of allowed) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(
          boolFields.includes(key) ? (d[key] ? 1 : 0) :
          (nullableDateFields.includes(key) || nullableNumberFields.includes(key)) && d[key] === '' ? null : d[key]
        );
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push(`updated_at=CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    // Use transaction for tenant update + property sync
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE tenants SET ${fields.join(', ')} WHERE id=$${idx}`, values);

      // Sync property.tenant_id when tenant changes property
      if ('property_id' in d) {
        await client.query('UPDATE properties SET tenant_id = NULL WHERE tenant_id = $1', [req.params.id]);
        if (d.property_id) {
          await client.query('UPDATE properties SET tenant_id = $1 WHERE id = $2', [req.params.id, d.property_id]);
        }
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant', parseInt(req.params.id as string), req.body);
    const updated = await queryOne(`
      SELECT t.*, p.address as property_address, p.landlord_id as property_landlord_id, l.name as property_landlord_name
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE t.id=$1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

app.post('/api/tenants/bulk-delete', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    // Delete physical files first (best-effort)
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const documents = await query(`SELECT * FROM documents WHERE entity_type = 'tenant' AND entity_id::INTEGER IN (${placeholders})`, ids);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Clear tenant references on properties
      await client.query(`UPDATE properties SET has_live_tenancy = 0, tenancy_start_date = NULL, tenant_id = NULL WHERE tenant_id::INTEGER IN (${placeholders})`, ids);
      await client.query(`UPDATE maintenance SET tenant_id = NULL WHERE tenant_id IN (${placeholders})`, ids);
      // Delete associated documents, tasks, tenancies, rent_payments
      await client.query(`DELETE FROM documents WHERE entity_type = 'tenant' AND entity_id::INTEGER IN (${placeholders})`, ids);
      await client.query(`DELETE FROM tasks WHERE entity_type = 'tenant' AND entity_id::INTEGER IN (${placeholders})`, ids);
      await client.query(`DELETE FROM rent_payments WHERE tenant_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM tenancies WHERE tenant_id IN (${placeholders})`, ids);
      // Delete tenants
      await client.query(`DELETE FROM tenants WHERE id IN (${placeholders})`, ids);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

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
    const { email } = req.query;
    if (!email) {
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
    const properties = await query(`
      SELECT p.id, p.address, p.postcode, p.property_type, p.bedrooms, p.rent_amount, p.status
      FROM properties p
      WHERE p.status IN ($1, $2, $3)
      ORDER BY p.address
    `, ['to_let', 'To Let', 'available']);
    res.json(properties);
  } catch (err) {
    console.error('[Public Properties] Error:', err);
    res.status(500).json({ error: 'Failed to fetch properties' });
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
    if (enquiry.status === 'converted') return res.status(410).json({ error: 'This application is now closed', completed: true });
    // Track form views
    await run(`
      UPDATE tenant_enquiries SET
        application_form_first_viewed_at = COALESCE(application_form_first_viewed_at, NOW()),
        application_form_last_viewed_at = NOW(),
        application_form_views = COALESCE(application_form_views, 0) + 1
      WHERE id = $1
    `, [enquiry.id]);
    const documents = await query(`
      SELECT id, doc_type, original_name, size, uploaded_at, COALESCE(review_status, 'pending') AS review_status, review_notes
      FROM documents
      WHERE entity_type = 'tenant_enquiry' AND entity_id = $1
      ORDER BY uploaded_at DESC
    `, [enquiry.id]);
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
      app_form_data: enquiry.app_form_data || {},
      app_signature_name: enquiry.app_signature_name || null,
      application_form_completed: !!enquiry.application_form_completed,
      application_review_status: enquiry.application_review_status || 'pending',
      application_review_notes: enquiry.application_review_notes || null,
      documents,
    });
  } catch (err) {
    console.error('Error fetching application form:', err);
    res.status(500).json({ error: 'Failed to load form' });
  }
});

// Applicants upload their own evidence through the same unguessable application token.
app.post('/api/public/application-form/:token/documents', publicDocumentLimiter, upload.single('file'), async (req, res) => {
  const uploadedPath = req.file ? path.join(uploadsDir, req.file.filename) : null;
  try {
    const enquiry = await queryOne(
      'SELECT id, status FROM tenant_enquiries WHERE application_form_token = $1',
      [req.params.token]
    );
    if (!enquiry || enquiry.status === 'converted') {
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(enquiry ? 410 : 404).json({ error: enquiry ? 'This application is now closed' : 'Form not found' });
    }
    const docType = String(req.body.doc_type || '');
    if (!PUBLIC_APPLICATION_DOCUMENT_TYPES.includes(docType as any)) {
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Invalid document type' });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a PDF, image, or Word document to upload' });
    const approvedDocument = await queryOne(`
      SELECT id FROM documents
      WHERE entity_type = 'tenant_enquiry' AND entity_id = $1 AND doc_type = $2 AND review_status = 'approved'
      LIMIT 1
    `, [enquiry.id, docType]);
    if (approvedDocument) {
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(409).json({ error: 'This document category has already been approved and is locked' });
    }

    const id = await insert(`
      INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, applicant_number, review_status)
      VALUES ('tenant_enquiry', $1, $2, $3, $4, $5, $6, 1, 'pending')
    `, [enquiry.id, docType, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]);
    await run(`
      UPDATE tenant_enquiries SET application_review_status = 'pending', application_review_notes = NULL
      WHERE id = $1
    `, [enquiry.id]);
    await run(`
      INSERT INTO audit_log (user_email, action, entity_type, entity_id, changes)
      VALUES ('tenant-self-service', 'document_upload', 'tenant_enquiry', $1, $2)
    `, [enquiry.id, JSON.stringify({ document_id: id, doc_type: docType, original_name: req.file.originalname, size: req.file.size })]);
    res.json({ id, doc_type: docType, original_name: req.file.originalname, review_status: 'pending' });
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    console.error('Error uploading application document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.delete('/api/public/application-form/:token/documents/:documentId', publicDocumentLimiter, async (req, res) => {
  try {
    const enquiry = await queryOne(
      'SELECT id, status FROM tenant_enquiries WHERE application_form_token = $1',
      [req.params.token]
    );
    if (!enquiry) return res.status(404).json({ error: 'Form not found' });
    if (enquiry.status === 'converted') return res.status(410).json({ error: 'This application is now closed' });
    const document = await queryOne(`
      SELECT * FROM documents
      WHERE id = $1 AND entity_type = 'tenant_enquiry' AND entity_id = $2
    `, [req.params.documentId, enquiry.id]);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    if (document.review_status === 'approved') {
      return res.status(409).json({ error: 'Approved documents are locked and cannot be removed' });
    }
    await run('DELETE FROM documents WHERE id = $1', [document.id]);
    const filePath = path.join(uploadsDir, document.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await run(`
      UPDATE tenant_enquiries SET application_review_status = 'pending', application_review_notes = NULL
      WHERE id = $1
    `, [enquiry.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting application document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Save an incomplete application against its stable token so the applicant can resume later.
app.post('/api/public/application-form/:token/draft', publicSubmitLimiter, async (req, res) => {
  try {
    sanitizePublicStrings(req.body);
    const formData = req.body?.app_form_data;
    if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
      return res.status(400).json({ error: 'Application details are required' });
    }
    for (const key of ['current_address_postcode', 'previous_address_postcode', 'next_of_kin_postcode']) {
      if (typeof formData[key] === 'string') formData[key] = formData[key].trim().toUpperCase();
    }
    if (typeof formData.ni_number === 'string') {
      const compactNi = formData.ni_number.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
      formData.ni_number = [compactNi.slice(0, 2), compactNi.slice(2, 4), compactNi.slice(4, 6), compactNi.slice(6, 8), compactNi.slice(8)]
        .filter(Boolean).join(' ');
    }
    for (const key of ['gross_annual_income', 'current_monthly_rent', 'self_employed_annual_income', 'contractor_annual_income', 'guarantor_annual_income']) {
      if (typeof formData[key] === 'string') formData[key] = formData[key].replace(/,/g, '');
    }
    const enquiry = await queryOne(
      'SELECT id, status FROM tenant_enquiries WHERE application_form_token = $1',
      [req.params.token]
    );
    if (!enquiry) return res.status(404).json({ error: 'Form not found' });
    if (enquiry.status === 'converted') return res.status(410).json({ error: 'This application is now closed' });
    await run(
      'UPDATE tenant_enquiries SET app_form_data = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(formData), enquiry.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving application draft:', err);
    res.status(500).json({ error: 'Draft could not be saved' });
  }
});

// POST submit completed form (public - no auth)
app.post('/api/public/application-form/:token', publicSubmitLimiter, async (req, res) => {
  try {
    const rawSignature = typeof req.body?.app_signature === 'string' && req.body.app_signature.startsWith('data:image/png;base64,')
      ? req.body.app_signature.slice(0, 750_000)
      : null;
    if (req.body) delete req.body.app_signature;
    sanitizePublicStrings(req.body);
    const enquiry = await queryOne(`
      SELECT te.id, te.status, te.application_form_completed, te.application_review_status,
        te.app_signature, te.app_signature_name,
        p.address AS property_address, p.postcode AS property_postcode
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      WHERE te.application_form_token = $1
    `, [req.params.token]);
    if (!enquiry) return res.status(404).json({ error: 'Form not found' });
    if (enquiry.status === 'converted') return res.status(410).json({ error: 'This application is now closed' });

    const formData = req.body?.app_form_data;
    if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
      return res.status(400).json({ error: 'Application details are required' });
    }
    for (const key of ['current_address_postcode', 'previous_address_postcode', 'next_of_kin_postcode']) {
      if (typeof formData[key] === 'string') formData[key] = formData[key].trim().toUpperCase();
    }
    if (typeof formData.ni_number === 'string') {
      const compactNi = formData.ni_number.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9);
      formData.ni_number = [compactNi.slice(0, 2), compactNi.slice(2, 4), compactNi.slice(4, 6), compactNi.slice(6, 8), compactNi.slice(8)]
        .filter(Boolean).join(' ');
    }
    for (const key of ['gross_annual_income', 'current_monthly_rent', 'self_employed_annual_income', 'contractor_annual_income', 'guarantor_annual_income']) {
      if (typeof formData[key] === 'string') formData[key] = formData[key].replace(/,/g, '');
    }
    const missing = applicationFormIssues(formData);
    if (missing.length) return res.status(400).json({ error: 'Please complete all mandatory fields', missing_fields: missing });

    const declarationKeys = [
      'declaration_holding_deposit', 'declaration_info_accurate', 'declaration_privacy',
      'declaration_enquiries', 'declaration_documents', 'declaration_credit_check', 'declaration_terms',
    ];
    const missingDeclarations = declarationKeys.filter((key) => formData[key] !== true);
    if (missingDeclarations.length) {
      return res.status(400).json({ error: 'Please agree to all mandatory declarations', missing_fields: missingDeclarations });
    }
    const isRevision = enquiry.application_form_completed && enquiry.application_review_status === 'changes_requested';
    const signatureName = String(req.body?.app_signature_name || enquiry.app_signature_name || '').trim();
    const effectiveSignature = rawSignature || (isRevision ? enquiry.app_signature : null);
    if (!signatureName) return res.status(400).json({ error: 'Please type your full legal name' });
    if (!effectiveSignature) return res.status(400).json({ error: 'Please add or generate your signature' });

    const documents = await query(
      `SELECT DISTINCT doc_type FROM documents
       WHERE entity_type = 'tenant_enquiry' AND entity_id = $1 AND COALESCE(review_status, 'pending') <> 'rejected'`,
      [enquiry.id]
    );
    const uploadedTypes = new Set(documents.map((document: any) => document.doc_type));
    const requiredDocumentTypes = ['Primary Identification', 'Secondary Identification', 'Bank Statements'];
    if (!['Student', 'Unemployed'].includes(formData.employment_status)) requiredDocumentTypes.push('Proof of Income or Employment');
    const missingDocuments = requiredDocumentTypes.filter((docType) => !uploadedTypes.has(docType));
    if (missingDocuments.length) {
      return res.status(400).json({ error: 'Please upload the required supporting documents', missing_documents: missingDocuments });
    }

    const currentAddress = [formData.current_address_line_1, formData.current_address_city, formData.current_address_postcode]
      .filter(Boolean).join(', ');
    const previousAddress = [formData.previous_address_line_1, formData.previous_address_city, formData.previous_address_postcode]
      .filter(Boolean).join(', ') || null;

    const submittedAt = new Date();
    const applicantName = `${formData.first_name} ${formData.last_name}`.trim();
    const propertyAddress = normalizePropertyAddress(enquiry.property_address, enquiry.property_postcode)
      || String(formData.property_address || 'Not specified');
    const completedPdf = await generateCompletedApplicationPdf({
      enquiryId: enquiry.id,
      applicantName,
      propertyAddress,
      submittedAt,
      formData,
      signatureName,
      signatureDataUrl: effectiveSignature,
    });
    const completedPdfFilename = `completed-application-${enquiry.id}-${Date.now()}.pdf`;
    const completedPdfPath = path.join(uploadsDir, completedPdfFilename);
    fs.writeFileSync(completedPdfPath, completedPdf);

    const client = await pool.connect();
    let previousCompletedDocuments: Array<{ filename: string }> = [];
    try {
      await client.query('BEGIN');
      await client.query(`
      UPDATE tenant_enquiries SET
        app_form_data=$1::jsonb, app_signature_name=$2,
        app_signature_ip=CASE WHEN $52 THEN app_signature_ip ELSE $3 END,
        app_signature_user_agent=CASE WHEN $52 THEN app_signature_user_agent ELSE $4 END,
        app_signature=$5, app_signed_at=CASE WHEN $52 THEN app_signed_at ELSE NOW() END,
        app_revision=COALESCE(app_revision, 0) + 1,
        first_name_1=$6, last_name_1=$7, email_1=$8, phone_1=$9, date_of_birth_1=$10,
        current_address_1=$11, postcode_1=$12, employment_status_1=$13, employer_1=$14, income_1=$15,
        app_ni_number=$16, app_previous_address_1=$17, app_years_at_current=$18,
        app_has_landlord_ref=$19, app_landlord_ref_name=$20, app_landlord_ref_phone=$21,
        app_landlord_ref_email=$22, app_landlord_ref_property_address=$23, app_landlord_ref_consent=$24,
        app_has_employer_ref=$25, app_employer_ref_name=$26, app_employer_ref_phone=$27,
        app_employer_ref_email=$28, app_employer_ref_employee_id=$29, app_employer_ref_consent=$30,
        app_bank_name=$31, app_bank_sort_code=$32, app_bank_account_number=$33,
        app_next_of_kin_name=$34, app_next_of_kin_phone=$35, app_next_of_kin_relationship=$36, app_next_of_kin_address=$37,
        app_guarantor_name=$38, app_guarantor_phone=$39, app_guarantor_email=$40, app_guarantor_address=$41,
        app_further_info=$42, app_decl_holding_deposit=$43, app_decl_info_accurate=$44,
        app_decl_gdpr=$45, app_decl_enquiries=$46, app_decl_documents=$47,
        app_decl_credit_check=$48, app_decl_terms=$49, app_decl_marketing=$50,
        app_declaration_agreed=1, application_form_completed=1,
        application_review_status='pending', application_review_notes=NULL,
        application_reviewed_at=NULL, application_reviewed_by=NULL
      WHERE application_form_token=$51
    `, [
      JSON.stringify(formData), signatureName, req.ip || null, req.get('user-agent') || null, effectiveSignature,
      formData.first_name, formData.last_name, formData.email, formData.phone,
      normalizeDateInput(formData.date_of_birth), currentAddress, formData.current_address_postcode,
      formData.employment_status, formData.employer_name || formData.business_name || null,
      formData.gross_annual_income, formData.ni_number, previousAddress, formData.years_at_current_address,
      formData.has_landlord_reference ? 1 : 0, formData.landlord_reference_name || null,
      formData.landlord_reference_phone || null, formData.landlord_reference_email || null,
      formData.landlord_reference_property || null, formData.landlord_reference_consent ? 1 : 0,
      formData.has_employer_reference ? 1 : 0, formData.employer_reference_name || null,
      formData.employer_reference_phone || null, formData.employer_reference_email || null,
      formData.employee_reference || null, formData.employer_reference_consent ? 1 : 0,
      formData.bank_account_name, formData.bank_sort_code, formData.bank_account_number,
      formData.next_of_kin_name, formData.next_of_kin_phone, formData.next_of_kin_relationship, formData.next_of_kin_address,
      formData.guarantor_name || null, formData.guarantor_phone || null,
      formData.guarantor_email || null, formData.guarantor_address || null,
      formData.supporting_information || null, 1, 1, 1, 1, 1, 1, 1,
      formData.marketing_consent ? 1 : 0, req.params.token, isRevision,
    ]);

      const previousDocumentsResult = await client.query(`
        SELECT filename FROM documents
        WHERE entity_type = 'tenant_enquiry' AND entity_id = $1 AND doc_type = 'Completed Tenancy Application'
      `, [enquiry.id]);
      previousCompletedDocuments = previousDocumentsResult.rows;
      await client.query(`
        DELETE FROM documents
        WHERE entity_type = 'tenant_enquiry' AND entity_id = $1 AND doc_type = 'Completed Tenancy Application'
      `, [enquiry.id]);
      await client.query(`
        INSERT INTO documents
          (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, applicant_number, review_status)
        VALUES ('tenant_enquiry', $1, 'Completed Tenancy Application', $2, $3, 'application/pdf', $4, 1, 'approved')
      `, [enquiry.id, completedPdfFilename, `Completed Tenancy Application - ${applicantName}.pdf`, completedPdf.length]);
      await client.query(`
        INSERT INTO audit_log (user_email, action, entity_type, entity_id, changes)
        VALUES ($1, $2, $3, $4, $5)
      `, ['tenant-self-service', 'update', 'tenant_enquiry', enquiry.id, JSON.stringify({
        action: enquiry.application_form_completed ? 'application_form_revised' : 'application_form_completed',
        completed_application_pdf: completedPdfFilename,
        ip: req.ip || null,
      })]);
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      if (fs.existsSync(completedPdfPath)) fs.unlinkSync(completedPdfPath);
      throw transactionError;
    } finally {
      client.release();
    }
    for (const previousDocument of previousCompletedDocuments) {
      const previousPath = path.join(uploadsDir, previousDocument.filename);
      try {
        if (fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
      } catch (cleanupError) {
        console.error('Old completed application PDF could not be removed:', cleanupError);
      }
    }

    if (!enquiry.application_form_completed) {
      await insert(`
        INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date)
        VALUES ($1, $2, 'pending', 'high', 'tenant_enquiry', $3, 'manual', CURRENT_DATE)
      `, [
        `Review completed application: ${formData.first_name} ${formData.last_name}`.trim(),
        'The applicant has completed and signed their tenancy application. Review the submitted answers and supporting documents.',
        enquiry.id,
      ]);
      (async () => {
        const { sendEmail, applicationConfirmationEmail, OUTBOUND_EMAIL_ADDRESS } = require('./email');
        const content = applicationConfirmationEmail(String(formData.first_name || '').trim());
        const result = await sendEmail({ to: formData.email, subject: content.subject, html: content.html });
        await insert(`
          INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
          VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'application_confirmation', $6, $7, NULL, NULL, $8)
        `, [result.id || null, enquiry.id, formData.email, OUTBOUND_EMAIL_ADDRESS, content.subject, content.html,
          result.simulated ? 'simulated' : (result.success ? 'sent' : 'failed'), result.error || null]);
      })().catch(err => console.error('Application confirmation email failed:', err));
    }

    res.json({ success: true, message: enquiry.application_form_completed ? 'Application updated successfully' : 'Application submitted successfully' });
  } catch (err) {
    console.error('Error submitting application form:', err);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Public tenancy agreement signing. The unguessable token identifies both the
// agreement and whether the signer is the tenant or landlord.
app.get('/api/public/tenancy-agreements/:token', publicReadLimiter, async (req, res) => {
  try {
    const agreement = await queryOne(`
      SELECT ta.id, ta.original_name, ta.agreement_type, ta.status, ta.issued_at,
        ta.tenant_signature_name, ta.landlord_signature_name, ta.landlord_signed_at,
        CASE WHEN ta.tenant_token = $1 THEN 'tenant' ELSE 'landlord' END AS signer_role,
        te.first_name_1, te.last_name_1, p.address, p.postcode
      FROM tenancy_agreements ta
      JOIN tenant_enquiries te ON te.id = ta.enquiry_id
      LEFT JOIN properties p ON p.id = ta.property_id
      WHERE ta.tenant_token = $1 OR ta.landlord_token = $1
    `, [req.params.token]);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (agreement.status === 'void') return res.status(410).json({ error: 'This agreement has been replaced by a newer version' });
    if (agreement.signer_role === 'tenant' && agreement.agreement_type === 'client' && !agreement.landlord_signed_at) {
      return res.status(409).json({ error: 'The landlord must sign this agreement before the tenant can review it' });
    }
    res.json({ ...agreement, property_address: normalizePropertyAddress(agreement.address, agreement.postcode) });
  } catch (err) {
    console.error('Agreement lookup failed:', err);
    res.status(500).json({ error: 'Agreement could not be loaded' });
  }
});

app.get('/api/public/tenancy-agreements/:token/pdf', publicReadLimiter, async (req, res) => {
  try {
    const agreement = await queryOne(`
      SELECT original_name, filename, signed_filename, agreement_type, landlord_signed_at,
        CASE WHEN tenant_token = $1 THEN 'tenant' ELSE 'landlord' END AS signer_role
      FROM tenancy_agreements
      WHERE tenant_token = $1 OR landlord_token = $1
    `, [req.params.token]);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (agreement.signer_role === 'tenant' && agreement.agreement_type === 'client' && !agreement.landlord_signed_at) {
      return res.status(409).json({ error: 'The landlord must sign this agreement before the tenant can review it' });
    }
    const filename = agreement.signed_filename || agreement.filename;
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Agreement file is unavailable' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${String(agreement.original_name).replace(/["\r\n]/g, '_')}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Agreement download failed:', err);
    res.status(500).json({ error: 'Agreement could not be downloaded' });
  }
});

app.post('/api/public/tenancy-agreements/:token/sign', publicSubmitLimiter, async (req, res) => {
  try {
    const signatureName = String(req.body?.signature_name || '').trim();
    const signature = String(req.body?.signature || '');
    if (!signatureName) return res.status(400).json({ error: 'Type your full legal name' });
    try { signatureDataBytes(signature); } catch { return res.status(400).json({ error: 'Add or generate your signature' }); }
    if (signature.length > 750_000) return res.status(413).json({ error: 'Signature image is too large' });
    const agreement = await queryOne(`
      SELECT *, CASE WHEN tenant_token = $1 THEN 'tenant' ELSE 'landlord' END AS signer_role
      FROM tenancy_agreements WHERE tenant_token = $1 OR landlord_token = $1
    `, [req.params.token]);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
    if (agreement.status === 'void') return res.status(410).json({ error: 'This agreement has been replaced by a newer version' });
    if (agreement.status === 'completed') return res.status(409).json({ error: 'This agreement has already been completed' });
    if (agreement.signer_role === 'landlord' && !agreement.requires_landlord_signature) return res.status(403).json({ error: 'Landlord signature is not required' });
    const role = agreement.signer_role;
    if (role === 'tenant' && agreement.requires_landlord_signature && !agreement.landlord_signed_at) {
      return res.status(409).json({ error: 'The landlord must sign before the tenant' });
    }
    if (agreement[`${role}_signed_at`]) return res.status(409).json({ error: `The ${role} signature has already been recorded` });
    await run(`
      UPDATE tenancy_agreements SET
        ${role}_signature = $1, ${role}_signature_name = $2, ${role}_signed_at = NOW(),
        ${role}_signature_ip = $3, ${role}_signature_user_agent = $4,
        status = CASE WHEN $5 = 'tenant' THEN 'tenant_signed' ELSE status END
      WHERE id = $6
    `, [signature, signatureName, req.ip || null, req.get('user-agent') || null, role, agreement.id]);
    let deliveryWarning: string | null = null;
    if (role === 'landlord') {
      try {
        const delivery = await sendTenantAgreementDelivery(agreement.id);
        const failures = Object.values(delivery).filter((result: any) => result?.success === false);
        if (failures.length) deliveryWarning = 'The landlord signature was saved, but one or more tenant messages failed';
      } catch (deliveryError) {
        deliveryWarning = deliveryError instanceof Error ? deliveryError.message : 'The tenant signing link could not be sent';
        console.error('Deferred tenant agreement delivery failed:', deliveryError);
      }
    }
    await finaliseTenancyAgreement(agreement.id);
    const updated = await queryOne('SELECT status FROM tenancy_agreements WHERE id = $1', [agreement.id]);
    await insert(`
      INSERT INTO audit_log (user_email, action, entity_type, entity_id, changes)
      VALUES ($1, 'update', 'tenant_enquiry', $2, $3)
    `, [`${role}-self-service`, agreement.enquiry_id, JSON.stringify({ action: 'tenancy_agreement_signed', role, agreement_id: agreement.id })]);
    res.json({ success: true, status: updated.status, delivery_warning: deliveryWarning });
  } catch (err) {
    console.error('Agreement signing failed:', err);
    res.status(500).json({ error: 'Agreement could not be signed' });
  }
});

app.get('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { limit, offset } = pageParams(req);
    const properties = await query(`
      SELECT p.*, l.name as landlord_name,
        (SELECT t.name FROM tenants t WHERE t.property_id = p.id LIMIT 1) as current_tenant
      FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id ORDER BY p.address
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json(properties);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

app.post('/api/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    if (typeof d.has_gas !== 'boolean') {
      return res.status(400).json({ error: 'Confirm whether the property has a gas connection' });
    }
    const client = await pool.connect();
    let id: number;
    try {
      await client.query('BEGIN');
      const result = await client.query(`
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
        ) RETURNING id
      `, [
        d.landlord_id, d.address, d.postcode, d.property_type || 'house', d.bedrooms || 1,
        d.is_leasehold ? 1 : 0, d.leasehold_start_date || null, d.leasehold_end_date || null, d.leaseholder_info || null,
        d.proof_of_ownership_received ? 1 : 0, d.council_tax_band || null, d.service_type || null,
        d.charge_percentage || null, d.total_charge || null, d.rent_amount || 0,
        d.has_live_tenancy ? 1 : 0, d.tenancy_start_date || null, d.tenancy_type || null,
        d.has_end_date ? 1 : 0, d.tenancy_end_date || null,
        d.rent_review_date || null, d.eicr_expiry_date || null, d.epc_grade || null, d.epc_expiry_date || null,
        d.has_gas ? 1 : 0, d.has_gas ? d.gas_safety_expiry_date || null : null, d.status || 'to_let',
        d.onboarded_date || null, d.notes || null, d.amenities || null,
        d.tenant_id || null, d.image_url || null
      ]);
      id = result.rows[0].id;
      if (d.tenant_id) {
        await client.query('UPDATE tenants SET property_id = $1 WHERE id = $2', [id, d.tenant_id]);
      }
      await client.query(
        'INSERT INTO property_landlords (property_id, landlord_id, is_primary) VALUES ($1, $2, 1) ON CONFLICT (property_id, landlord_id) DO NOTHING',
        [id, d.landlord_id]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit(req.user?.id, req.user?.email, 'create', 'property', id);
    res.json({ id });
  } catch (err) {
    console.error('Property creation error:', err);
    res.status(500).json({ error: 'Failed to create property' });
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
      'has_gas','gas_safety_expiry_date','status','onboarded_date','notes','amenities','tenant_id','image_url'
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
      FROM properties p LEFT JOIN landlords l ON l.id = p.landlord_id WHERE p.id = $1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

app.post('/api/properties/bulk-delete', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE tenants SET property_id = NULL WHERE property_id IN (${placeholders})`, ids);
      await client.query(`UPDATE tenant_enquiries SET linked_property_id = NULL WHERE linked_property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM maintenance WHERE property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM rent_payments WHERE property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM tenancies WHERE property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM property_viewings WHERE property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM property_expenses WHERE property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM tasks WHERE entity_type = 'property' AND entity_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM documents WHERE entity_type = 'property' AND entity_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM property_landlords WHERE property_id IN (${placeholders})`, ids);
      await client.query(`DELETE FROM properties WHERE id IN (${placeholders})`, ids); // inventories cascade
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

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
    const { limit, offset } = pageParams(req);
    let sql = 'SELECT t.*, u.name as assigned_to_name FROM tasks t LEFT JOIN users u ON u.id::TEXT = t.assigned_to';
    if (status === 'active') sql += " WHERE t.status IN ('pending', 'in_progress')";
    sql += ' ORDER BY t.due_date NULLS LAST LIMIT $1 OFFSET $2';
    const tasks = await query(sql, [limit, offset]);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type, status, notes } = req.body;
    const id = await insert(
      'INSERT INTO tasks (title, description, priority, assigned_to, entity_type, entity_id, due_date, task_type, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [title, description, priority || 'medium', assigned_to, entity_type, entity_id, due_date, task_type || 'manual', status || 'pending', notes]
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'task', id, req.body);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const allowed = ['title', 'description', 'priority', 'status', 'assigned_to', 'due_date', 'notes', 'entity_type', 'entity_id', 'follow_up_date', 'task_type'];
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
    const updated = await queryOne('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.get('/api/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT t.*, u.name as assigned_to_name FROM tasks t LEFT JOIN users u ON u.id::TEXT = t.assigned_to WHERE t.id = $1',
      [req.params.id]
    );
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
    const id = req.params.id as string;
    // Delete physical files first (outside transaction — best-effort)
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['task', id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['task', id]);
      await client.query('DELETE FROM tasks WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit(req.user?.id, req.user?.email, 'delete', 'task', parseInt(id));
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

    // Delete physical files first (outside transaction — best-effort)
    for (const id of ids) {
      const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['task', String(id)]);
      for (const doc of documents) {
        const filePath = path.join(uploadsDir, doc.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
      await client.query(`DELETE FROM documents WHERE entity_type = 'task' AND entity_id::INTEGER IN (${placeholders})`, ids);
      await client.query(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

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
    const { limit, offset } = pageParams(req);
    const requests = await query(`
      SELECT m.*, COALESCE(p.address, 'Unknown property') as address, l.name as landlord_name FROM maintenance m
      LEFT JOIN properties p ON p.id = m.property_id LEFT JOIN landlords l ON l.id = p.landlord_id
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, m.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch maintenance' });
  }
});

app.post('/api/maintenance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const id = await insert(
      `INSERT INTO maintenance (property_id, title, description, category, priority, tenant_id, landlord_id, reporter_name, reporter_email, reporter_phone, reporter_type, contractor, contractor_phone, cost, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [d.property_id, d.title, d.description, d.category || null, d.priority || 'medium',
       d.tenant_id || null, d.landlord_id || null, d.reporter_name || null, d.reporter_email || null, d.reporter_phone || null, d.reporter_type || null,
       d.contractor || null, d.contractor_phone || null, d.cost || null, d.notes || null, d.status || 'open']
    );
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create maintenance' });
  }
});

app.get('/api/maintenance/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await query(`
      SELECT m.*, COALESCE(p.address, 'Unknown property') as address, l.name as landlord_name FROM maintenance m
      LEFT JOIN properties p ON p.id = m.property_id LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE m.id = $1
    `, [req.params.id]);
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
    const allowed = ['status', 'contractor', 'contractor_phone', 'cost', 'resolution_notes', 'title', 'description', 'property_id', 'priority', 'category',
      'tenant_id', 'landlord_id', 'reporter_name', 'reporter_email', 'reporter_phone', 'reporter_type', 'completed_date', 'notes'];
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
    const updated = await queryOne(`
      SELECT m.*, COALESCE(p.address, 'Unknown property') as address, l.name as landlord_name FROM maintenance m
      LEFT JOIN properties p ON p.id = m.property_id LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE m.id = $1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update maintenance' });
  }
});

app.delete('/api/maintenance/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    // Delete physical files first (outside transaction — best-effort)
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['maintenance', id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['maintenance', id]);
      await client.query("DELETE FROM tasks WHERE entity_type = 'maintenance' AND entity_id = $1", [id]);
      await client.query('DELETE FROM maintenance WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit(req.user?.id, req.user?.email, 'delete', 'maintenance', parseInt(id));
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete maintenance:', err);
    res.status(500).json({ error: 'Failed to delete maintenance request' });
  }
});

app.post('/api/maintenance/bulk-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    // Delete physical files first (outside transaction — best-effort)
    for (const id of ids) {
      const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['maintenance', String(id)]);
      for (const doc of documents) {
        const filePath = path.join(uploadsDir, doc.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
      await client.query(`DELETE FROM documents WHERE entity_type = 'maintenance' AND entity_id::INTEGER IN (${placeholders})`, ids);
      await client.query(`DELETE FROM tasks WHERE entity_type = 'maintenance' AND entity_id::INTEGER IN (${placeholders})`, ids);
      await client.query(`DELETE FROM maintenance WHERE id IN (${placeholders})`, ids);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

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
  landlord_bdm: ['Primary Identification', 'Address Identification', 'Proof of Funds', 'Other'],
  tenant: ['Primary Identification', 'Address Identification', 'Application Form(s)', 'Bank Statements', 'Other'],
  tenant_enquiry: ['Primary Identification', 'Secondary Identification', 'Proof of Income or Employment', 'Bank Statements', 'Other Financial Document', 'Other'],
  property: ['Gas Safety Certificate', 'EPC', 'EICR', 'Proof of Ownership', 'Insurance', 'Other'],
  maintenance: ['Quote', 'Invoice', 'Photo', 'Report', 'Other'],
  task: ['Supporting Document', 'Other'],
};

app.get('/api/documents/types/:entityType', authMiddleware, (req: AuthRequest, res) => {
  const types = DOC_TYPES[req.params.entityType as string] || ['Other'];
  res.json(types);
});

app.get('/api/documents/download/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const doc = await queryOne('SELECT * FROM documents WHERE id = $1', [req.params.id as string]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(uploadsDir, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${doc.original_name}"`);
    if (doc.mime_type) res.type(doc.mime_type);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download' });
  }
});

app.get('/api/documents/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const applicantNumber = req.query.applicant_number ? parseInt(req.query.applicant_number as string) : undefined;
    let sql = `SELECT id, doc_type, original_name, mime_type, size, uploaded_at,
      COALESCE(review_status, 'pending') AS review_status, review_notes, reviewed_at
      FROM documents WHERE entity_type = $1 AND entity_id = $2`;
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

app.post('/api/documents/:entityType/:entityId', authMiddleware, requirePermission('staff'), upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { doc_type, applicant_number } = req.body;
    const appNum = applicant_number ? parseInt(applicant_number) : 1;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const id = await insert(
      `INSERT INTO documents
       (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by, applicant_number, review_status, reviewed_at, reviewed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', NOW(), $8)`,
      [entityType, entityId, doc_type, file.filename, file.originalname, file.mimetype, file.size, req.user?.id, appNum]
    );
    await logAudit(req.user?.id, req.user?.email, 'document_upload', entityType as string, parseInt(entityId as string), { doc_type, original_name: file.originalname, size: file.size, applicant_number: appNum });
    res.json({ id, doc_type, original_name: file.originalname, review_status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.put('/api/documents/:id/review', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, approved, or rejected' });
    }
    const document = await queryOne('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!document) return res.status(404).json({ error: 'Document not found' });
    await run(`
      UPDATE documents SET review_status = $1, review_notes = $2,
        reviewed_at = CASE WHEN $1 = 'pending' THEN NULL ELSE NOW() END,
        reviewed_by = CASE WHEN $1 = 'pending' THEN NULL ELSE $3::INTEGER END
      WHERE id = $4
    `, [status, req.body.notes || null, req.user?.id || null, document.id]);
    if (document.entity_type === 'tenant_enquiry') {
      await run(`
        UPDATE tenant_enquiries SET application_review_status = 'pending',
          application_review_notes = NULL, application_reviewed_at = NULL, application_reviewed_by = NULL
        WHERE id = $1
      `, [document.entity_id]);
    }
    await logAudit(req.user?.id, req.user?.email, 'document_review', document.entity_type, document.entity_id, {
      document_id: document.id, status, notes: req.body.notes || null,
    });
    res.json({ success: true, status });
  } catch (err) {
    console.error('Failed to review document:', err);
    res.status(500).json({ error: 'Failed to review document' });
  }
});

app.delete('/api/documents/:id', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  try {
    const doc = await queryOne('SELECT * FROM documents WHERE id = $1', [req.params.id as string]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(uploadsDir, doc.filename);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM documents WHERE id = $1', [req.params.id as string]);
      await client.query('COMMIT');
      // Unlink file only after DB commit succeeds
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
    await logAudit(req.user?.id, req.user?.email, 'document_delete', doc.entity_type, doc.entity_id, { doc_type: doc.doc_type, original_name: doc.original_name });
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
      JOIN properties p ON p.id = tn.property_id LEFT JOIN tenants t ON t.id = tn.tenant_id
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
      SELECT rp.*, COALESCE(p.address, 'Unknown property') as address, t.name as tenant_name FROM rent_payments rp
      LEFT JOIN properties p ON p.id = rp.property_id LEFT JOIN tenants t ON t.id = rp.tenant_id
      ORDER BY rp.due_date DESC
    `);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rent payments' });
  }
});

app.get('/api/rent-payments/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await query(`
      SELECT rp.*, p.address, t.name as tenant_name FROM rent_payments rp
      LEFT JOIN properties p ON p.id = rp.property_id LEFT JOIN tenants t ON t.id = rp.tenant_id
      WHERE rp.id = $1
    `, [req.params.id]);
    if (result.length === 0) return res.status(404).json({ error: 'Rent payment not found' });
    await logAudit(req.user?.id, req.user?.email, 'view', 'rent_payment', parseInt(req.params.id as string));
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch rent payment' });
  }
});

app.post('/api/rent-payments', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    if (!d.property_id || !d.due_date || !d.amount_due) {
      return res.status(400).json({ error: 'property_id, due_date, and amount_due are required' });
    }
    const id = await insert(
      'INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, status, notes) VALUES ($1, $2, $3, $4, $5, $6)',
      [d.property_id, d.tenant_id || null, d.due_date, d.amount_due, 'pending', d.notes || null]
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'rent_payment', id);
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create rent payment' });
  }
});

app.put('/api/rent-payments/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const allowed = ['property_id', 'tenant_id', 'due_date', 'amount_due', 'amount_paid', 'payment_date', 'status', 'notes'];
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
    values.push(req.params.id);
    await run(`UPDATE rent_payments SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'rent_payment', parseInt(req.params.id as string), d);
    const updated = await queryOne(`
      SELECT rp.*, p.address, t.name as tenant_name FROM rent_payments rp
      LEFT JOIN properties p ON p.id = rp.property_id LEFT JOIN tenants t ON t.id = rp.tenant_id
      WHERE rp.id = $1
    `, [req.params.id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update rent payment' });
  }
});

app.delete('/api/rent-payments/:id', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const existing = await queryOne('SELECT * FROM rent_payments WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Rent payment not found' });
    await run('DELETE FROM rent_payments WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'rent_payment', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete rent payment' });
  }
});

app.put('/api/rent-payments/:id/pay', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const payment = await queryOne('SELECT * FROM rent_payments WHERE id = $1', [req.params.id as string]);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const amountPaid = d.amount_paid != null ? Number(d.amount_paid) : Number(payment.amount_due);
    const paymentDate = d.payment_date || new Date().toISOString().split('T')[0];
    const newStatus = amountPaid < Number(payment.amount_due) ? 'partial' : 'paid';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE rent_payments SET amount_paid=$1, payment_date=$2, status=$3, notes=COALESCE($4, notes) WHERE id=$5',
        [amountPaid, paymentDate, newStatus, d.notes || null, req.params.id]
      );
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
    await logAudit(req.user?.id, req.user?.email, 'update', 'rent_payment', parseInt(req.params.id as string), { status: newStatus, amount_paid: amountPaid });
    res.json({ success: true, status: newStatus, amount_paid: amountPaid, payment_date: paymentDate });
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

app.post('/api/users/setup-fleming-team', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const requestedTeam = [
      { email: 'marie@fleminglettings.co.uk', name: 'Marie Ellis', role: 'staff' },
      { email: 'sam@fleminglettings.co.uk', name: 'Sam Fleming', role: 'staff' },
      { email: 'robert@fleminglettings.co.uk', name: 'Robert Fleming', role: 'staff' },
      { email: 'danyl@fleminglettings.co.uk', name: 'Danyl Goodall', role: 'staff' },
    ];
    const created: Array<{ email: string; name: string; role: string; tempPassword: string }> = [];
    const existing: string[] = [];
    for (const member of requestedTeam) {
      const found = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [member.email]);
      if (found) {
        existing.push(member.email);
        continue;
      }
      const tempPassword = crypto.randomBytes(9).toString('base64url');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const id = await insert(
        `INSERT INTO users (email, password, name, role, department, last_password_change)
         VALUES ($1, $2, $3, $4, 'Lettings', CURRENT_TIMESTAMP)`,
        [member.email, hashedPassword, member.name, member.role]
      );
      await logAudit(req.user?.id, req.user?.email, 'create', 'user', id, { ...member, source: 'requested_team_setup' });
      created.push({ ...member, tempPassword });
    }
    res.json({ created, existing });
  } catch (err) {
    console.error('Fleming team setup failed:', err);
    res.status(500).json({ error: 'Failed to set up the Fleming team' });
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

app.delete('/api/tenants/:id', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id;
    // Delete physical files first (outside transaction — best-effort)
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['tenant', id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Clean up property references
      await client.query('UPDATE properties SET has_live_tenancy = 0, tenancy_start_date = NULL, tenant_id = NULL WHERE tenant_id = $1', [id]);
      await client.query('UPDATE maintenance SET tenant_id = NULL WHERE tenant_id = $1', [id]);
      // Delete associated documents, tasks, tenancies, rent_payments
      await client.query('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['tenant', id]);
      await client.query("DELETE FROM tasks WHERE entity_type = 'tenant' AND entity_id = $1", [id]);
      await client.query('DELETE FROM rent_payments WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM tenancies WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM tenants WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    await logAudit(req.user?.id, req.user?.email, 'delete', 'tenant', parseInt(id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

app.delete('/api/properties/:id', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const documents = await query('SELECT * FROM documents WHERE entity_type = $1 AND entity_id = $2', ['property', req.params.id]);
    for (const doc of documents) {
      const filePath = path.join(uploadsDir, doc.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM documents WHERE entity_type = $1 AND entity_id = $2', ['property', req.params.id]);
      await client.query('DELETE FROM tasks WHERE entity_type = $1 AND entity_id = $2', ['property', req.params.id]);
      await client.query('DELETE FROM maintenance WHERE property_id = $1', [req.params.id]);
      await client.query('DELETE FROM rent_payments WHERE property_id = $1', [req.params.id]);
      await client.query('DELETE FROM tenancies WHERE property_id = $1', [req.params.id]);
      await client.query('DELETE FROM property_viewings WHERE property_id = $1', [req.params.id]);
      await client.query('DELETE FROM property_expenses WHERE property_id = $1', [req.params.id]);
      await client.query('UPDATE tenants SET property_id = NULL WHERE property_id = $1', [req.params.id]);
      await client.query('UPDATE tenant_enquiries SET linked_property_id = NULL WHERE linked_property_id = $1', [req.params.id]);
      await client.query('DELETE FROM property_landlords WHERE property_id = $1', [req.params.id]);
      await client.query('DELETE FROM properties WHERE id = $1', [req.params.id]); // inventories cascade
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
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

// ============ CSV IMPORT ============

const IMPORT_MAX_ROWS = 1000;
// Column whitelists per entity — unknown keys in rows are ignored.
const IMPORT_COLUMNS: Record<string, string[]> = {
  'tenant-enquiries': ['first_name_1', 'last_name_1', 'email_1', 'phone_1', 'date_of_birth_1', 'nationality_1',
    'current_address_1', 'employment_status_1', 'employer_1', 'income_1', 'preferred_tenancy_type',
    'preferred_property_type', 'notes'],
  'landlords': ['name', 'email', 'phone', 'address', 'home_address', 'entity_type', 'company_number'],
  'properties': ['address', 'postcode', 'property_type', 'bedrooms', 'rent_amount', 'notes'],
};
app.post('/api/import/:entity', requirePermission('staff'), async (req: AuthRequest, res) => {
  const entity = req.params.entity as string;
  if (!(entity in IMPORT_COLUMNS)) return res.status(400).json({ error: 'Unknown import entity' });
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'rows array required' });
  if (rows.length > IMPORT_MAX_ROWS) return res.status(400).json({ error: `Too many rows (max ${IMPORT_MAX_ROWS})` });

  const skipped: { row: number; reason: string }[] = [];
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const seen = new Set<string>();

    const insertRow = async (table: string, data: Record<string, any>) => {
      const cols = Object.keys(data);
      await client.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        cols.map(c => data[c])
      );
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const r = rows[i] || {};
      const data: Record<string, any> = {};
      let invalidReason: string | undefined;
      for (const col of IMPORT_COLUMNS[entity]) {
        const coerced = coerceImportValue(col, r[col]);
        if (coerced.error) {
          invalidReason = coerced.error;
          break;
        }
        if (coerced.value !== null) data[col] = coerced.value;
      }
      if (invalidReason) {
        skipped.push({ row: rowNum, reason: invalidReason });
        continue;
      }

      if (entity === 'tenant-enquiries') {
        if (!data.first_name_1 || !data.last_name_1 || !data.email_1) {
          skipped.push({ row: rowNum, reason: 'missing required fields (first name, last name, email)' });
          continue;
        }
        const email = String(data.email_1).toLowerCase();
        const phone = data.phone_1 ? String(data.phone_1) : null;
        if (seen.has(`e:${email}`) || (phone && seen.has(`p:${phone}`))) {
          skipped.push({ row: rowNum, reason: 'duplicate within file' });
          continue;
        }
        const dup = await client.query(
          'SELECT id FROM tenant_enquiries WHERE lower(email_1) = $1 OR ($2::text IS NOT NULL AND phone_1 = $2) LIMIT 1',
          [email, phone]
        );
        if (dup.rows.length) {
          skipped.push({ row: rowNum, reason: `duplicate of existing enquiry #${dup.rows[0].id}` });
          continue;
        }
        seen.add(`e:${email}`);
        if (phone) seen.add(`p:${phone}`);
        await insertRow('tenant_enquiries', { ...data, email_1: email, status: 'new' });
      } else if (entity === 'landlords') {
        if (!data.name) {
          skipped.push({ row: rowNum, reason: 'missing required field (name)' });
          continue;
        }
        const name = String(data.name).toLowerCase();
        const email = data.email ? String(data.email).toLowerCase() : null;
        if (seen.has(`n:${name}`) || (email && seen.has(`e:${email}`))) {
          skipped.push({ row: rowNum, reason: 'duplicate within file' });
          continue;
        }
        const dup = await client.query(
          'SELECT id FROM landlords WHERE lower(name) = $1 OR ($2::text IS NOT NULL AND lower(email) = $2) LIMIT 1',
          [name, email]
        );
        if (dup.rows.length) {
          skipped.push({ row: rowNum, reason: `duplicate of existing landlord #${dup.rows[0].id}` });
          continue;
        }
        seen.add(`n:${name}`);
        if (email) seen.add(`e:${email}`);
        await insertRow('landlords', data);
      } else {
        // properties — resolve landlord by email or exact name; never auto-create
        if (!data.address) {
          skipped.push({ row: rowNum, reason: 'missing required field (address)' });
          continue;
        }
        if (!data.postcode) {
          skipped.push({ row: rowNum, reason: 'missing required field (postcode)' });
          continue;
        }
        const landlordRef = typeof r.landlord === 'string' ? r.landlord.trim() : '';
        if (!landlordRef) {
          skipped.push({ row: rowNum, reason: 'missing required field (landlord)' });
          continue;
        }
        const landlord = await client.query(
          'SELECT id FROM landlords WHERE lower(email) = $1 OR lower(name) = $1 ORDER BY id LIMIT 2',
          [landlordRef.toLowerCase()]
        );
        if (!landlord.rows.length) {
          skipped.push({ row: rowNum, reason: `landlord not found: ${landlordRef}` });
          continue;
        }
        if (landlord.rows.length > 1) {
          skipped.push({ row: rowNum, reason: `ambiguous landlord reference: ${landlordRef}` });
          continue;
        }
        const addrKey = `a:${String(data.address).toLowerCase()}|${String(data.postcode || '').toLowerCase()}`;
        if (seen.has(addrKey)) {
          skipped.push({ row: rowNum, reason: 'duplicate within file' });
          continue;
        }
        const dup = await client.query(
          "SELECT id FROM properties WHERE lower(address) = $1 AND lower(coalesce(postcode, '')) = $2 LIMIT 1",
          [String(data.address).toLowerCase(), String(data.postcode || '').toLowerCase()]
        );
        if (dup.rows.length) {
          skipped.push({ row: rowNum, reason: `duplicate of existing property #${dup.rows[0].id}` });
          continue;
        }
        seen.add(addrKey);
        const propResult = await client.query(
          `INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'to_let') RETURNING id`,
          [landlord.rows[0].id, data.address, data.postcode || null, data.property_type || 'house',
            data.bedrooms || 1, data.rent_amount || 0, data.notes || null]
        );
        await client.query(
          'INSERT INTO property_landlords (property_id, landlord_id, is_primary) VALUES ($1, $2, 1) ON CONFLICT (property_id, landlord_id) DO NOTHING',
          [propResult.rows[0].id, landlord.rows[0].id]
        );
      }
      inserted++;
    }
    await client.query('COMMIT');
  } catch (txErr) {
    await client.query('ROLLBACK');
    console.error('Import failed:', txErr);
    client.release();
    return res.status(500).json({ error: 'Import failed — nothing was imported' });
  }
  client.release();

  await logAudit(req.user?.id, req.user?.email, 'create', `${entity}-import`, undefined, { inserted, skipped: skipped.length });
  res.json({ inserted, skipped });
});

// ============ LANDLORD PROPERTIES ============

app.get('/api/landlords/:landlordId/properties', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const properties = await query(`
      SELECT p.*, pl.id as link_id, pl.is_primary, pl.ownership_percentage, pl.ownership_entity_type
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
      SELECT v.*, COALESCE(v.viewing_location, p.address) AS address FROM property_viewings v
      LEFT JOIN properties p ON p.id = v.property_id
      ORDER BY v.viewing_date DESC
    `);
    res.json(viewings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch viewings' });
  }
});

app.post('/api/property-viewings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { property_id, viewing_location, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to, send_sms, sms_message, send_email } = req.body;
    const customLocation = String(viewing_location || '').trim();
    if (!property_id && !customLocation) return res.status(400).json({ error: 'Choose a property or enter a viewing location' });
    const viewingId = await insert(`
      INSERT INTO property_viewings (property_id, viewing_location, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, notes, assigned_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [property_id || null, customLocation || null, enquiry_id || null, viewer_name, viewer_email || null, viewer_phone || null, viewing_date, viewing_time || null, notes || null, assigned_to || null]);

    if (enquiry_id) {
      await run("UPDATE tenant_enquiries SET status = 'viewing_booked', viewing_date = $1 WHERE id = $2", [viewing_date, enquiry_id]);
    }

    const property = property_id
      ? await queryOne('SELECT address, postcode FROM properties WHERE id = $1', [property_id])
      : null;
    const location = customLocation || normalizePropertyAddress(property?.address, property?.postcode);
    const taskTitle = `Property Viewing: ${viewer_name}`;
    const taskDescription = `Conduct property viewing at ${location}\nTime: ${viewing_time || 'Not specified'}\nContact: ${viewer_phone || viewer_email}`;

    await insert(`
      INSERT INTO tasks (title, description, status, priority, entity_type, entity_id, task_type, due_date, assigned_to)
      VALUES ($1, $2, 'pending', 'high', 'tenant_enquiry', $3, 'viewing', $4, $5)
    `, [taskTitle, taskDescription, enquiry_id || null, viewing_date, assigned_to || req.user?.name || null]);

    await logAudit(req.user?.id, req.user?.email, 'create', 'property_viewing', viewingId, { viewer_name, viewing_date, property_id: property_id || null, viewing_location: customLocation || null });

    let smsDelivery: { success: boolean; status: string; error?: string } | null = null;
    if (send_sms && viewer_phone && sms_message) {
      const { sendSms, normalizeUkPhone } = require('./sms');
      const normalizedPhone = normalizeUkPhone(viewer_phone);
      const smsResult = await sendSms({ to: normalizedPhone, body: sms_message });
      const smsStatus = smsResult.simulated ? 'simulated' : (smsResult.success ? 'sent' : 'failed');
      await insert(`
        INSERT INTO sms_messages (enquiry_id, entity_type, entity_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
        VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        enquiry_id || null, enquiry_id || null, normalizedPhone, SMS_FROM || null,
        sms_message, smsStatus, smsResult.sid || null, smsResult.error || null,
        req.user?.id || null, req.user?.email || null
      ]);
      await logAudit(req.user?.id, req.user?.email, smsResult.success ? 'sms_sent' : 'sms_failed', 'tenant_enquiry', enquiry_id || 0, {
        to_phone: normalizedPhone, message: sms_message.substring(0, 100), error: smsResult.error || null,
      });
      smsDelivery = { success: smsResult.success, status: smsStatus, error: smsResult.error };
    }

    let emailDelivery: { success: boolean; status: string; error?: string } | null = null;
    if (send_email) {
      if (!viewer_email) {
        emailDelivery = { success: false, status: 'failed', error: 'No applicant email address is recorded' };
      } else {
        const { sendEmail, viewingConfirmationEmail, normalizePropertyAddress } = require('./email');
        const address = customLocation || normalizePropertyAddress(property?.address || '', property?.postcode);
        const dateParts = String(viewing_date).split('-');
        const displayDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : viewing_date;
        const dateAndTime = `${displayDate}${viewing_time ? ` at ${viewing_time}` : ''}`;
        const emailContent = viewingConfirmationEmail(viewer_name, address, dateAndTime);
        const emailResult = await sendEmail({
          to: viewer_email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
        const emailStatus = emailResult.simulated ? 'simulated' : (emailResult.success ? 'sent' : 'failed');
        await insert(`
          INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
          VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'viewing_confirmation', $6, $7, $8, $9, $10)
        `, [
          emailResult.id || null, enquiry_id || null, viewer_email, 'contact@tenancies.fleminglettings.co.uk',
          emailContent.subject, emailContent.html, emailStatus, req.user?.id || null,
          req.user?.email || null, emailResult.error || null,
        ]);
        await logAudit(req.user?.id, req.user?.email, emailResult.success ? 'email_sent' : 'email_failed', 'tenant_enquiry', enquiry_id || 0, {
          to: viewer_email, subject: emailContent.subject, error: emailResult.error || null,
        });
        emailDelivery = { success: emailResult.success, status: emailStatus, error: emailResult.error };
      }
    }
    res.json({ id: viewingId, sms: smsDelivery, email: emailDelivery });
  } catch (err) {
    console.error('Error creating viewing:', err);
    res.status(500).json({ error: 'Failed to create viewing' });
  }
});

app.put('/api/property-viewings/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const key of ['status', 'feedback', 'interested', 'notes']) {
      if (key in d) {
        fields.push(`${key}=$${idx++}`);
        values.push(key === 'interested' ? (d[key] ? 1 : 0) : d[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    await run(`UPDATE property_viewings SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update viewing' });
  }
});

// ============ HOLDING DEPOSIT / ONBOARDING ============

app.post('/api/tenant-enquiries/:id/credit-check', authMiddleware, requirePermission('staff'), upload.single('report'), async (req: AuthRequest, res) => {
  const uploadedPath = req.file ? path.join(uploadsDir, req.file.filename) : null;
  try {
    const enquiryId = Number(req.params.id);
    const score = String(req.body.score || '').trim();
    if (!Number.isInteger(enquiryId)) return res.status(400).json({ error: 'Invalid enquiry' });
    if (!score) return res.status(400).json({ error: 'Enter the credit score' });
    if (!req.file) return res.status(400).json({ error: 'Upload the credit check report' });
    const enquiry = await queryOne('SELECT id, application_review_status FROM tenant_enquiries WHERE id = $1', [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (enquiry.application_review_status !== 'approved') {
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(409).json({ error: 'Approve the application before recording the credit check' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO documents (entity_type, entity_id, doc_type, filename, original_name, mime_type, size, uploaded_by, review_status)
        VALUES ('tenant_enquiry', $1, 'Credit Check Report', $2, $3, $4, $5, $6, 'approved')
      `, [enquiryId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user?.id || null]);
      await client.query(`
        UPDATE tenant_enquiries SET credit_check_completed = 1, credit_score = $1,
          credit_check_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [score, enquiryId]);
      await client.query('COMMIT');
    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }
    await logAudit(req.user?.id, req.user?.email, 'credit_check_completed', 'tenant_enquiry', enquiryId, {
      score, report: req.file.originalname,
    });
    res.json({ success: true, score, report: req.file.originalname });
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    console.error('Credit check save failed:', err);
    res.status(500).json({ error: 'Credit check could not be saved' });
  }
});

const AGREEMENT_COMPLIANCE_TYPES = ['EPC', 'EICR', 'Gas Safety Certificate'];

async function loadAgreementCompliance(propertyId: number) {
  const property = await queryOne(`
    SELECT id, has_gas, epc_expiry_date, eicr_expiry_date, gas_safety_expiry_date
    FROM properties WHERE id = $1
  `, [propertyId]);
  if (!property) return null;

  const uploadedDocuments = await query(`
    SELECT doc_type, filename, original_name, mime_type
    FROM documents
    WHERE entity_type = 'property' AND entity_id = $1
      AND doc_type = ANY($2::text[])
      AND COALESCE(review_status, 'approved') = 'approved'
    ORDER BY uploaded_at DESC
  `, [propertyId, AGREEMENT_COMPLIANCE_TYPES]);
  const attachments: Array<{ doc_type: string; filename: string; original_name: string; mime_type: string }> = [];
  const selectedTypes = new Set<string>();
  for (const document of uploadedDocuments) {
    if (selectedTypes.has(document.doc_type)) continue;
    if (!fs.existsSync(path.join(uploadsDir, document.filename))) continue;
    selectedTypes.add(document.doc_type);
    attachments.push(document);
  }

  const compliance = propertyCompliance({ ...property, documents: attachments });
  return { ...compliance, attachments };
}

async function sendTenantAgreementDelivery(
  agreementId: number,
  actor?: { id?: number | null; email?: string | null },
): Promise<Record<string, unknown>> {
  const agreement = await queryOne(`
    SELECT ta.*, te.first_name_1, te.email_1, te.phone_1, p.address, p.postcode
    FROM tenancy_agreements ta
    JOIN tenant_enquiries te ON te.id = ta.enquiry_id
    LEFT JOIN properties p ON p.id = ta.property_id
    WHERE ta.id = $1
  `, [agreementId]);
  if (!agreement || agreement.tenant_delivery_sent_at) return {};
  const delivery: Record<string, unknown> = {};
  const tenantUrl = `https://apply.fleminglettings.co.uk/agreement/${agreement.tenant_token}`;
  const compliance = agreement.property_id ? await loadAgreementCompliance(Number(agreement.property_id)) : null;
  if (!compliance?.ready) throw new Error('Property compliance is no longer complete; the tenant signing link was not sent');
  const attachments = compliance.attachments.map(document => ({
    filename: document.original_name,
    content: fs.readFileSync(path.join(uploadsDir, document.filename)),
    contentType: document.mime_type || undefined,
  }));

  if (agreement.tenant_delivery_email) {
    if (!agreement.email_1) delivery.tenant_email = { success: false, error: 'No tenant email is recorded' };
    else {
      const { sendEmail, brandedEmailHtml, OUTBOUND_EMAIL_ADDRESS } = require('./email');
      const subject = 'Your tenancy agreement is ready to sign';
      const html = brandedEmailHtml('Tenancy Agreement', `
        <p>Hi ${escapeHtmlText(agreement.first_name_1 || 'there')},</p>
        <p>Your tenancy agreement for <strong>${escapeHtmlText(normalizePropertyAddress(agreement.address, agreement.postcode))}</strong> is ready to review and sign.</p>
        <p>The current property compliance documents are attached for your records.</p>
        <p><a href="${tenantUrl}" style="display:inline-block;background:#DC006D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Review and sign agreement</a></p>
      `);
      const result = await sendEmail({ to: agreement.email_1, subject, html, attachments });
      await insert(`INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
        VALUES ($1,'tenant_enquiry',$2,$3,$4,$5,'tenancy_agreement',$6,$7,$8,$9,$10)`, [result.id || null, agreement.enquiry_id, agreement.email_1, OUTBOUND_EMAIL_ADDRESS, subject, html, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', actor?.id || null, actor?.email || null, result.error || null]);
      delivery.tenant_email = result;
    }
  }
  if (agreement.tenant_delivery_sms) {
    if (!agreement.phone_1) delivery.tenant_sms = { success: false, error: 'No tenant phone number is recorded' };
    else {
      const { sendSms, normalizeUkPhone } = require('./sms');
      const smsBody = `Hi ${agreement.first_name_1 || 'there'}, your Fleming Lettings tenancy agreement is ready to review and sign: ${tenantUrl}`;
      const result = await sendSms({ to: normalizeUkPhone(agreement.phone_1), body: smsBody });
      delivery.tenant_sms = result;
      await insert(`INSERT INTO sms_messages (enquiry_id, entity_type, entity_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
        VALUES ($1,'tenant_enquiry',$1,$2,$3,$4,$5,$6,$7,$8,$9)`, [agreement.enquiry_id, normalizeUkPhone(agreement.phone_1), SMS_FROM || null, smsBody, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', result.sid || null, result.error || null, actor?.id || null, actor?.email || null]);
    }
  }
  await run('UPDATE tenancy_agreements SET tenant_delivery_sent_at = NOW() WHERE id = $1', [agreementId]);
  return delivery;
}

app.get('/api/tenant-enquiries/:id/tenancy-agreement-compliance', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiry = await queryOne(`
      SELECT te.linked_property_id, te.monthly_rent_agreed, te.security_deposit_amount,
        te.preferred_parking, te.app_form_data, te.first_name_1, te.last_name_1,
        te.joint_partner_id, jp.first_name_1 AS partner_first_name, jp.last_name_1 AS partner_last_name,
        p.address, p.postcode, p.service_type, p.has_gas, p.amenities,
        l.name AS landlord_name, l.landlord_type, l.email AS landlord_email
      FROM tenant_enquiries te
      LEFT JOIN tenant_enquiries jp ON jp.id = te.joint_partner_id
      LEFT JOIN properties p ON p.id = te.linked_property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE te.id = $1
    `, [req.params.id]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (!enquiry.linked_property_id) return res.json({ ready: false, propertyLinked: false, items: [] });
    const compliance = await loadAgreementCompliance(Number(enquiry.linked_property_id));
    if (!compliance) return res.json({ ready: false, propertyLinked: false, items: [] });
    const agreementType = resolveAgreementType(enquiry.landlord_type);
    const paymentRoute = resolvePaymentRoute(agreementType, enquiry.service_type);
    res.json({
      ready: compliance.ready,
      propertyLinked: true,
      items: compliance.items,
      agreementType,
      serviceType: enquiry.service_type,
      paymentRoute,
      landlordName: enquiry.landlord_name,
      defaults: {
        tenancyStartDate: enquiry.app_form_data?.preferred_start_date || '',
        rent: enquiry.monthly_rent_agreed || '',
        deposit: enquiry.security_deposit_amount || '',
        permittedOccupiers: enquiry.app_form_data?.other_occupants || '',
        sharedFacilities: enquiry.amenities || '',
        parking: enquiry.preferred_parking || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Property compliance could not be loaded' });
  }
});

app.get('/api/tenant-enquiries/:id/tenancy-agreement', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const agreement = await queryOne(`
      SELECT id, agreement_type, original_name, status, issued_at, completed_at,
        requires_landlord_signature, tenant_signed_at, landlord_signed_at
      FROM tenancy_agreements WHERE enquiry_id = $1 ORDER BY issued_at DESC LIMIT 1
    `, [req.params.id]);
    res.json(agreement || null);
  } catch (err) {
    res.status(500).json({ error: 'Agreement status could not be loaded' });
  }
});

app.post('/api/tenant-enquiries/:id/tenancy-agreement', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  let generatedPath: string | null = null;
  try {
    const enquiryId = Number(req.params.id);
    const startDateText = String(req.body.tenancy_start_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateText)) return res.status(400).json({ error: 'Enter the tenancy start date' });
    const tenancyStartDate = new Date(`${startDateText}T12:00:00Z`);
    if (Number.isNaN(tenancyStartDate.getTime()) || tenancyStartDate.toISOString().slice(0, 10) !== startDateText) {
      return res.status(400).json({ error: 'Enter a valid tenancy start date' });
    }

    const enquiry = await queryOne(`
      SELECT te.*, jp.first_name_1 AS partner_first_name, jp.last_name_1 AS partner_last_name,
        jp.email_1 AS partner_email, jp.phone_1 AS partner_phone, jp.current_address_1 AS partner_address,
        p.address, p.postcode, p.service_type, p.has_gas, p.rent_amount, p.amenities,
        l.name AS landlord_name, l.email AS landlord_email, l.phone AS landlord_phone,
        COALESCE(l.home_address, l.address) AS landlord_address, l.landlord_type
      FROM tenant_enquiries te
      LEFT JOIN tenant_enquiries jp ON jp.id = te.joint_partner_id
      LEFT JOIN properties p ON p.id = te.linked_property_id
      LEFT JOIN landlords l ON l.id = p.landlord_id
      WHERE te.id = $1
    `, [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (!enquiry.linked_property_id) return res.status(409).json({ error: 'Link a property before issuing the tenancy agreement' });

    const compliance = await loadAgreementCompliance(Number(enquiry.linked_property_id));
    if (!compliance?.ready) {
      const reasons = compliance?.items.filter(item => !item.ready).map(item => item.reason).filter(Boolean) || [];
      return res.status(409).json({
        error: `Complete the property compliance checks before issuing the agreement${reasons.length ? `: ${reasons.join('; ')}` : ''}`,
        compliance: compliance ? { ready: false, items: compliance.items } : null,
      });
    }

    const agreementType = resolveAgreementType(enquiry.landlord_type);
    if (agreementType === 'client' && !['let_only', 'rent_collection', 'full_management'].includes(enquiry.service_type)) {
      return res.status(409).json({ error: 'Set the property service type before generating the client agreement' });
    }
    const paymentRoute = resolvePaymentRoute(agreementType, enquiry.service_type);
    const requiresLandlord = agreementType === 'client';
    if (requiresLandlord && !enquiry.landlord_email && req.body.send_email === true) {
      return res.status(409).json({ error: 'Add the client landlord email before emailing this agreement' });
    }
    if (requiresLandlord && !enquiry.landlord_address) {
      return res.status(409).json({ error: 'Add the client landlord address before generating this agreement' });
    }

    let bankDetails;
    try {
      bankDetails = bankDetailsForRoute(paymentRoute, {
        sortCode: req.body.landlord_bank_sort_code,
        accountNumber: req.body.landlord_bank_account_number,
        accountName: req.body.landlord_bank_account_name,
        bankName: req.body.landlord_bank_name,
      });
    } catch (bankError) {
      return res.status(400).json({ error: bankError instanceof Error ? bankError.message : 'Enter valid bank details' });
    }

    const rent = Number(req.body.rent || enquiry.monthly_rent_agreed || enquiry.rent_amount || 0);
    const deposit = Number(req.body.deposit || enquiry.security_deposit_amount || 0);
    if (!Number.isFinite(rent) || rent <= 0) return res.status(400).json({ error: 'Enter the monthly rent' });
    if (!Number.isFinite(deposit) || deposit < 0) return res.status(400).json({ error: 'Enter the security deposit' });
    const tenants = [{
      name: [enquiry.title_1, enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' '),
      email: enquiry.email_1,
      phone: enquiry.phone_1,
      address: enquiry.current_address_1,
    }];
    if (enquiry.partner_first_name || enquiry.partner_last_name) {
      tenants.push({
        name: [enquiry.partner_first_name, enquiry.partner_last_name].filter(Boolean).join(' '),
        email: enquiry.partner_email,
        phone: enquiry.partner_phone,
        address: enquiry.partner_address,
      });
    } else if (enquiry.first_name_2 || enquiry.last_name_2) {
      tenants.push({
        name: [enquiry.title_2, enquiry.first_name_2, enquiry.last_name_2].filter(Boolean).join(' '),
        email: enquiry.email_2,
        phone: enquiry.phone_2,
        address: enquiry.current_address_2,
      });
    }
    const paymentReference = `${String(enquiry.address || '').match(/^\s*\d+[A-Za-z]?/)?.[0]?.trim() || 'PROPERTY'} ${String(enquiry.postcode || '').replace(/\s/g, '').toUpperCase()} - ${String(enquiry.last_name_1 || 'TENANT').toUpperCase()}`;
    const pdf = await generateTenancyAgreementPdf({
      enquiryId,
      agreementType,
      serviceType: enquiry.service_type,
      agreementDate: new Date(),
      tenancyStartDate,
      rent,
      deposit,
      propertyAddress: normalizePropertyAddress(enquiry.address, enquiry.postcode),
      hasGas: Boolean(enquiry.has_gas),
      landlord: { name: enquiry.landlord_name, email: enquiry.landlord_email, phone: enquiry.landlord_phone, address: enquiry.landlord_address },
      tenants,
      permittedOccupiers: String(req.body.permitted_occupiers || '').trim() || null,
      sharedFacilities: String(req.body.shared_facilities || enquiry.amenities || '').trim() || null,
      parking: String(req.body.parking || enquiry.preferred_parking || '').trim() || null,
      paymentReference,
      bankDetails,
      paymentRoute,
      complianceDocuments: compliance.items.map(item => item.label),
    });
    const safeProperty = String(enquiry.address || 'property').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
    const filename = `tenancy-agreement-${enquiryId}-${Date.now()}.pdf`;
    const originalName = `Assured Periodic Tenancy - ${safeProperty}.pdf`;
    generatedPath = path.join(uploadsDir, filename);
    fs.writeFileSync(generatedPath, pdf);

    await run(`UPDATE tenancy_agreements SET status = 'void' WHERE enquiry_id = $1 AND status <> 'completed'`, [enquiryId]);
    const tenantToken = crypto.randomBytes(32).toString('hex');
    const landlordToken = requiresLandlord ? crypto.randomBytes(32).toString('hex') : null;
    const sendEmailRequested = req.body.send_email === true;
    const sendSmsRequested = req.body.send_sms === true;
    const agreementId = await insert(`
      INSERT INTO tenancy_agreements (
        enquiry_id, property_id, agreement_type, filename, original_name, mime_type, size,
        tenant_token, landlord_token, requires_landlord_signature, created_by,
        tenant_delivery_email, tenant_delivery_sms
      ) VALUES ($1,$2,$3,$4,$5,'application/pdf',$6,$7,$8,$9,$10,$11,$12)
    `, [enquiryId, enquiry.linked_property_id, agreementType, filename, originalName, pdf.length,
      tenantToken, landlordToken, requiresLandlord ? 1 : 0, req.user?.id || null,
      sendEmailRequested ? 1 : 0, sendSmsRequested ? 1 : 0]);
    generatedPath = null;

    const tenantUrl = `https://apply.fleminglettings.co.uk/agreement/${tenantToken}`;
    const landlordUrl = landlordToken ? `https://apply.fleminglettings.co.uk/agreement/${landlordToken}` : null;
    let delivery: Record<string, unknown> = {};
    if (requiresLandlord && sendEmailRequested && landlordUrl) {
      const { sendEmail, brandedEmailHtml, OUTBOUND_EMAIL_ADDRESS } = require('./email');
      const attachments = compliance.attachments.map(document => ({
        filename: document.original_name,
        content: fs.readFileSync(path.join(uploadsDir, document.filename)),
        contentType: document.mime_type || undefined,
      }));
      const subject = 'Landlord signature required on a tenancy agreement';
      const html = brandedEmailHtml('Tenancy Agreement', `
        <p>Hi ${escapeHtmlText(enquiry.landlord_name || 'there')},</p>
        <p>The tenancy agreement for <strong>${escapeHtmlText(normalizePropertyAddress(enquiry.address, enquiry.postcode))}</strong> is ready for your review and signature.</p>
        <p>After you sign, the tenant will automatically receive their signing link. The current compliance documents are attached.</p>
        <p><a href="${landlordUrl}" style="display:inline-block;background:#DC006D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Review and sign agreement</a></p>
      `);
      const result = await sendEmail({ to: enquiry.landlord_email, subject, html, attachments });
      delivery.landlord_email = result;
      await insert(`INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
        VALUES ($1,'tenant_enquiry',$2,$3,$4,$5,'landlord_tenancy_agreement',$6,$7,$8,$9,$10)`, [result.id || null, enquiryId, enquiry.landlord_email, OUTBOUND_EMAIL_ADDRESS, subject, html, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', req.user?.id || null, req.user?.email || null, result.error || null]);
    } else if (!requiresLandlord) {
      delivery = await sendTenantAgreementDelivery(agreementId, { id: req.user?.id, email: req.user?.email });
    }
    await logAudit(req.user?.id, req.user?.email, 'create', 'tenant_enquiry', enquiryId, {
      action: 'tenancy_agreement_generated', agreement_id: agreementId, agreement_type: agreementType,
      service_type: enquiry.service_type, payment_route: paymentRoute,
    });
    res.json({ success: true, agreement_id: agreementId, tenant_url: tenantUrl, landlord_url: landlordUrl, delivery, agreement_type: agreementType, payment_route: paymentRoute });
  } catch (err) {
    if (generatedPath && fs.existsSync(generatedPath)) fs.unlinkSync(generatedPath);
    console.error('Agreement generation failed:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Tenancy agreement could not be generated' });
  }
});

app.post('/api/tenant-enquiries/:id/request-balance', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const enquiry = await queryOne(`
      SELECT te.*, p.address, p.postcode FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id WHERE te.id = $1
    `, [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    const agreement = await queryOne(`SELECT id FROM tenancy_agreements WHERE enquiry_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1`, [enquiryId]);
    if (!agreement) return res.status(409).json({ error: 'Complete the tenancy agreement before requesting the balance' });
    const balance = Number((Number(enquiry.security_deposit_amount || 0) + Number(enquiry.monthly_rent_agreed || 0) - Number(enquiry.holding_deposit_received_amount || enquiry.holding_deposit_amount || 0)).toFixed(2));
    if (balance <= 0) return res.status(409).json({ error: 'The calculated balance must be greater than zero' });
    await run(`UPDATE tenant_enquiries SET balance_due_amount = $1, balance_payment_requested = 1, updated_at = NOW() WHERE id = $2`, [balance, enquiryId]);
    const delivery: Record<string, unknown> = {};
    if (req.body.send_email === true && enquiry.email_1) {
      const { sendEmail, brandedEmailHtml, OUTBOUND_EMAIL_ADDRESS } = require('./email');
      const subject = `Final tenancy balance - ${normalizePropertyAddress(enquiry.address, enquiry.postcode)}`;
      const html = brandedEmailHtml('Final Balance', `<p>Hi ${escapeHtmlText(enquiry.first_name_1 || 'there')},</p><p>Your tenancy agreement has been completed. The remaining balance is <strong>&pound;${balance.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong>.</p><p>This is your security deposit and first month’s rent, less the holding deposit already received.</p>`);
      const result = await sendEmail({ to: enquiry.email_1, subject, html });
      await insert(`INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
        VALUES ($1,'tenant_enquiry',$2,$3,$4,$5,'final_balance',$6,$7,$8,$9,$10)`, [result.id || null, enquiryId, enquiry.email_1, OUTBOUND_EMAIL_ADDRESS, subject, html, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', req.user?.id || null, req.user?.email || null, result.error || null]);
      delivery.email = result;
    }
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, { action: 'final_balance_requested', amount: balance });
    res.json({ success: true, balance, delivery });
  } catch (err) {
    console.error('Balance request failed:', err);
    res.status(500).json({ error: 'Final balance request could not be saved' });
  }
});

app.post('/api/tenant-enquiries/:id/confirm-balance', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  try {
    const updated = await run(`UPDATE tenant_enquiries SET balance_payment_received = 1, balance_payment_received_at = NOW(), updated_at = NOW() WHERE id = $1 AND balance_payment_requested = 1`, [req.params.id]);
    if (!updated) return res.status(409).json({ error: 'Request the final balance before marking it received' });
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', Number(req.params.id), { action: 'final_balance_received' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Final balance receipt could not be saved' });
  }
});

app.post('/api/tenant-enquiries/:id/schedule-handover', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const handoverDate = String(req.body.handover_date || '');
    const handoverTime = String(req.body.handover_time || '');
    const assignedTo = String(req.body.assigned_to || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(handoverDate) || !/^\d{2}:\d{2}$/.test(handoverTime) || !assignedTo) {
      return res.status(400).json({ error: 'Choose the handover date, time and assigned team member' });
    }
    const enquiry = await queryOne(`SELECT te.*, p.address, p.postcode FROM tenant_enquiries te LEFT JOIN properties p ON p.id = te.linked_property_id WHERE te.id = $1`, [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
    if (!enquiry.balance_payment_received) return res.status(409).json({ error: 'Confirm the final balance before scheduling handover' });
    await run(`UPDATE tenant_enquiries SET handover_date = $1, handover_time = $2, handover_assigned_to = $3, updated_at = NOW() WHERE id = $4`, [handoverDate, handoverTime, assignedTo, enquiryId]);
    await insert(`INSERT INTO tasks (title, description, status, priority, assigned_to, entity_type, entity_id, due_date, task_type)
      VALUES ($1,$2,'pending','high',$3,'tenant_enquiry',$4,$5,'handover')`, [`Tenancy handover: ${enquiry.first_name_1} ${enquiry.last_name_1}`.trim(), `${handoverTime} at ${normalizePropertyAddress(enquiry.address, enquiry.postcode)}`, assignedTo, enquiryId, handoverDate]);
    const delivery: Record<string, unknown> = {};
    if (req.body.send_email === true && enquiry.email_1) {
      const { sendEmail, brandedEmailHtml, OUTBOUND_EMAIL_ADDRESS } = require('./email');
      const subject = 'Your tenancy handover appointment';
      const html = brandedEmailHtml('Tenancy Handover', `<p>Hi ${escapeHtmlText(enquiry.first_name_1 || 'there')},</p><p>Your tenancy handover is booked for <strong>${escapeHtmlText(handoverDate)} at ${escapeHtmlText(handoverTime)}</strong> at ${escapeHtmlText(normalizePropertyAddress(enquiry.address, enquiry.postcode))}.</p>`);
      const result = await sendEmail({ to: enquiry.email_1, subject, html });
      delivery.email = result;
      await insert(`INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
        VALUES ($1,'tenant_enquiry',$2,$3,$4,$5,'tenancy_handover',$6,$7,$8,$9,$10)`, [result.id || null, enquiryId, enquiry.email_1, OUTBOUND_EMAIL_ADDRESS, subject, html, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', req.user?.id || null, req.user?.email || null, result.error || null]);
    }
    if (req.body.send_sms === true && enquiry.phone_1) {
      const { sendSms, normalizeUkPhone } = require('./sms');
      const smsBody = `Hi ${enquiry.first_name_1 || 'there'}, your Fleming Lettings tenancy handover is booked for ${handoverDate} at ${handoverTime}.`;
      const result = await sendSms({ to: normalizeUkPhone(enquiry.phone_1), body: smsBody });
      delivery.sms = result;
      await insert(`INSERT INTO sms_messages (enquiry_id, entity_type, entity_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
        VALUES ($1,'tenant_enquiry',$1,$2,$3,$4,$5,$6,$7,$8,$9)`, [enquiryId, normalizeUkPhone(enquiry.phone_1), SMS_FROM || null, smsBody, result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', result.sid || null, result.error || null, req.user?.id || null, req.user?.email || null]);
    }
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, { action: 'handover_scheduled', handover_date: handoverDate, handover_time: handoverTime, assigned_to: assignedTo });
    res.json({ success: true, delivery });
  } catch (err) {
    console.error('Handover scheduling failed:', err);
    res.status(500).json({ error: 'Handover could not be scheduled' });
  }
});

app.post('/api/tenant-enquiries/:id/application-review', authMiddleware, requirePermission('staff'), async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const status = String(req.body.status || '');
    if (!['pending', 'changes_requested', 'approved'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, changes_requested, or approved' });
    }
    const enquiry = await queryOne(`
      SELECT id, application_form_completed, app_form_data, first_name_1, last_name_1,
        email_1, phone_1, application_form_token, notes
      FROM tenant_enquiries WHERE id = $1
    `, [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    if (status === 'approved') {
      if (!enquiry.application_form_completed) {
        return res.status(409).json({ error: 'The applicant must submit the application before it can be approved' });
      }
      const employmentStatus = enquiry.app_form_data?.employment_status;
      const requiredTypes = ['Primary Identification', 'Secondary Identification', 'Bank Statements'];
      if (!['Student', 'Unemployed'].includes(employmentStatus)) requiredTypes.push('Proof of Income or Employment');
      const approvedDocuments = await query(`
        SELECT DISTINCT doc_type FROM documents
        WHERE entity_type = 'tenant_enquiry' AND entity_id = $1 AND review_status = 'approved'
      `, [enquiryId]);
      const approvedTypes = new Set(approvedDocuments.map((document: any) => document.doc_type));
      const missingDocuments = requiredTypes.filter((docType) => !approvedTypes.has(docType));
      if (missingDocuments.length) {
        return res.status(409).json({ error: 'Approve all required documents first', missing_documents: missingDocuments });
      }
    }

    const internalNotes = String(req.body.notes || '').trim();
    const changesRequired = String(req.body.changes_required || '').trim();
    const sendSmsRequested = req.body.send_sms === true;
    const sendEmailRequested = req.body.send_email === true;
    if (status === 'changes_requested' && !changesRequired) {
      return res.status(400).json({ error: 'Please describe the changes or information required' });
    }

    await run(`
      UPDATE tenant_enquiries SET application_review_status = $1, application_review_notes = $2,
        notes = CASE WHEN $5 = '' THEN notes ELSE CONCAT_WS(E'\n\n', NULLIF(notes, ''), $5) END,
        application_reviewed_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END,
        application_reviewed_by = CASE WHEN $1 = 'approved' THEN $3::INTEGER ELSE NULL END
      WHERE id = $4
    `, [status, changesRequired || internalNotes || null, req.user?.id || null, enquiryId, internalNotes]);
    await logAudit(req.user?.id, req.user?.email, 'application_review', 'tenant_enquiry', enquiryId, {
      status, notes: internalNotes || null, changes_required: changesRequired || null,
    });

    const delivery: Record<string, any> = {};
    if (status === 'changes_requested') {
      const firstName = enquiry.first_name_1 || 'there';
      const applicationUrl = `https://apply.fleminglettings.co.uk/onboarding/${enquiry.application_form_token}`;
      if (sendSmsRequested) {
        if (!enquiry.phone_1) {
          delivery.sms = { success: false, error: 'No applicant phone number is recorded' };
        } else {
          const { sendSms, normalizeUkPhone } = require('./sms');
          const smsBody = `Hi there ${firstName}, thank you for completing your application forms with Fleming Lettings. We have reviewed your application and still require further information or documentation from you. Please click on this link to jump back in: ${applicationUrl}. If you need any help, then please contact our office on 01902 212 415.`;
          const smsResult = await sendSms({ to: normalizeUkPhone(enquiry.phone_1), body: smsBody });
          await insert(`INSERT INTO sms_messages (enquiry_id, entity_type, entity_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
            VALUES ($1, 'tenant_enquiry', $1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            enquiryId, normalizeUkPhone(enquiry.phone_1), SMS_FROM || null, smsBody,
            smsResult.simulated ? 'simulated' : (smsResult.success ? 'sent' : 'failed'), smsResult.sid || null,
            smsResult.error || null, req.user?.id || null, req.user?.email || null,
          ]);
          delivery.sms = { success: smsResult.success, error: smsResult.error };
        }
      }
      if (sendEmailRequested) {
        if (!enquiry.email_1) {
          delivery.email = { success: false, error: 'No applicant email address is recorded' };
        } else {
          const { sendEmail, applicationChangesRequestedEmail, OUTBOUND_EMAIL_ADDRESS } = require('./email');
          const content = applicationChangesRequestedEmail(firstName, changesRequired, applicationUrl);
          const emailResult = await sendEmail({ to: enquiry.email_1, subject: content.subject, html: content.html });
          await insert(`INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
            VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'application_changes_requested', $6, $7, $8, $9, $10)`, [
            emailResult.id || null, enquiryId, enquiry.email_1, OUTBOUND_EMAIL_ADDRESS, content.subject, content.html,
            emailResult.simulated ? 'simulated' : (emailResult.success ? 'sent' : 'failed'), req.user?.id || null,
            req.user?.email || null, emailResult.error || null,
          ]);
          delivery.email = { success: emailResult.success, error: emailResult.error };
        }
      }
    }
    res.json({ success: true, status, delivery });
  } catch (err) {
    console.error('Application review failed:', err);
    res.status(500).json({ error: 'Failed to update application review' });
  }
});

app.post('/api/tenant-enquiries/:id/confirm-holding-deposit', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const amount = Number(req.body.amount);
    const receivedDate = String(req.body.received_date || '');
    const sendEmailRequested = req.body.send_email === true;
    const sendSmsRequested = req.body.send_sms === true;
    if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) {
      return res.status(400).json({ error: 'A valid amount and received date are required' });
    }
    const enquiry = await queryOne('SELECT id, first_name_1, email_1, phone_1, notes FROM tenant_enquiries WHERE id = $1', [enquiryId]);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    let notes: Array<Record<string, string>> = [];
    try {
      const parsed = JSON.parse(enquiry.notes || '[]');
      if (Array.isArray(parsed)) notes = parsed;
    } catch {
      if (enquiry.notes) notes.push({ id: `legacy-${Date.now()}`, text: String(enquiry.notes), author: 'System', created_at: new Date().toISOString() });
    }
    const displayDate = receivedDate.split('-').reverse().join('/');
    notes.push({
      id: `holding-deposit-${Date.now()}`,
      text: `Holding deposit received of £${amount.toLocaleString('en-GB')} on ${displayDate}.`,
      author: 'System',
      created_at: new Date().toISOString(),
    });
    await run(`UPDATE tenant_enquiries SET holding_deposit_received=1,
      holding_deposit_received_date=$1, holding_deposit_received_amount=$2, notes=$3,
      updated_at=CURRENT_TIMESTAMP WHERE id=$4`, [receivedDate, amount, JSON.stringify(notes), enquiryId]);

    const delivery: Record<string, any> = {};
    const firstName = enquiry.first_name_1 || 'there';
    if (sendEmailRequested) {
      if (!enquiry.email_1) {
        delivery.email = { success: false, error: 'No applicant email address is recorded' };
      } else {
        const { sendEmail, holdingDepositReceiptEmail, OUTBOUND_EMAIL_ADDRESS } = require('./email');
        const content = holdingDepositReceiptEmail(firstName, amount, receivedDate);
        const result = await sendEmail({ to: enquiry.email_1, subject: content.subject, html: content.html });
        await insert(`INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
          VALUES ($1,'tenant_enquiry',$2,$3,$4,$5,'holding_deposit_receipt',$6,$7,$8,$9,$10)`, [
          result.id || null, enquiryId, enquiry.email_1, OUTBOUND_EMAIL_ADDRESS, content.subject, content.html,
          result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', req.user?.id || null, req.user?.email || null, result.error || null,
        ]);
        delivery.email = { success: result.success, error: result.error };
      }
    }
    if (sendSmsRequested) {
      if (!enquiry.phone_1) {
        delivery.sms = { success: false, error: 'No applicant phone number is recorded' };
      } else {
        const { sendSms, normalizeUkPhone } = require('./sms');
        const body = `Hi ${firstName}, Fleming Lettings confirms receipt of your holding deposit of £${amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })} on ${displayDate}.`;
        const phone = normalizeUkPhone(enquiry.phone_1);
        const result = await sendSms({ to: phone, body });
        await insert(`INSERT INTO sms_messages (enquiry_id, entity_type, entity_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
          VALUES ($1,'tenant_enquiry',$1,$2,$3,$4,$5,$6,$7,$8,$9)`, [enquiryId, phone, SMS_FROM || null, body,
          result.simulated ? 'simulated' : result.success ? 'sent' : 'failed', result.sid || null, result.error || null, req.user?.id || null, req.user?.email || null]);
        delivery.sms = { success: result.success, error: result.error };
      }
    }
    await logAudit(req.user?.id, req.user?.email, 'update', 'tenant_enquiry', enquiryId, { action: 'holding_deposit_received', amount, date: receivedDate });
    res.json({ success: true, delivery });
  } catch (err) {
    console.error('Holding deposit confirmation failed:', err);
    res.status(500).json({ error: 'Holding deposit could not be confirmed' });
  }
});

app.post('/api/tenant-enquiries/:id/request-holding-deposit', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { monthly_rent, security_deposit, holding_deposit, follow_up_date } = req.body;
    const enquiryId = Number(req.params.id);

    const existing = await queryOne(
      'SELECT application_form_token, joint_partner_id FROM tenant_enquiries WHERE id = $1',
      [enquiryId]
    );
    if (!existing) return res.status(404).json({ error: 'Enquiry not found' });

    // Keep an issued link stable. Rotating this token on every resend made all
    // earlier application emails fail even though the application was active.
    const token = existing.application_form_token || crypto.randomBytes(24).toString('hex');
    const applicationFormUrl = `https://apply.fleminglettings.co.uk/onboarding/${token}`;
    let partnerApplicationFormUrl: string | null = null;

    // Update enquiry with financial details and token
    await run(`
      UPDATE tenant_enquiries SET
        monthly_rent_agreed=$1, security_deposit_amount=$2, holding_deposit_amount=$3,
        application_form_token=$4, status='onboarding'
      WHERE id=$5
    `, [monthly_rent, security_deposit, holding_deposit, token, enquiryId]);

    // Each joint applicant gets a separate stable token so completing one form
    // never expires or completes the other applicant's form.
    if (existing.joint_partner_id) {
      const partner = await queryOne(
        'SELECT application_form_token FROM tenant_enquiries WHERE id = $1',
        [existing.joint_partner_id]
      );
      if (partner) {
        const partnerToken = partner.application_form_token || crypto.randomBytes(24).toString('hex');
        partnerApplicationFormUrl = `https://apply.fleminglettings.co.uk/onboarding/${partnerToken}`;
        await run(`
          UPDATE tenant_enquiries SET
            monthly_rent_agreed=$1, security_deposit_amount=$2, holding_deposit_amount=$3,
            application_form_token=$4, status='onboarding'
          WHERE id=$5
        `, [monthly_rent, security_deposit, holding_deposit, partnerToken, existing.joint_partner_id]);
      }
    }

    // Get enquiry + property details for email
    const enquiry = await queryOne(`
      SELECT te.*, p.address as property_address, p.postcode as property_postcode
      FROM tenant_enquiries te
      LEFT JOIN properties p ON p.id = te.linked_property_id
      WHERE te.id = $1
    `, [enquiryId]);

    if (enquiry) {
      const name = [enquiry.first_name_1, enquiry.last_name_1].filter(Boolean).join(' ');
      const address = normalizePropertyAddress(enquiry.property_address, enquiry.property_postcode);

      // Send email and log to email_messages
      const { sendEmail } = require('./email');
      const { holdingDepositRequestEmail } = require('./email');
      const emailContent = holdingDepositRequestEmail(name, address, monthly_rent, security_deposit, holding_deposit, applicationFormUrl);
      const emailResult = await sendEmail({
        to: enquiry.email_1,
        subject: emailContent.subject,
        html: emailContent.html,
      });
      await insert(`
        INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
        VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'holding_deposit_request', $6, $7, $8, $9, $10)
      `, [emailResult.id || null, enquiryId, enquiry.email_1, 'contact@tenancies.fleminglettings.co.uk', emailContent.subject, emailContent.html, emailResult.simulated ? 'simulated' : (emailResult.success ? 'sent' : 'failed'), req.user?.id || null, req.user?.email || null, emailResult.error || null]);

      if (!emailResult.success) {
        return res.status(502).json({ error: emailResult.error || 'Application email could not be sent' });
      }
      await run(`
        UPDATE tenant_enquiries SET application_form_sent=1, holding_deposit_requested=1, onboarding_email_sent_at=NOW()
        WHERE id=$1
      `, [enquiryId]);

      if (existing.joint_partner_id && partnerApplicationFormUrl) {
        const partner = await queryOne(`
          SELECT te.*, p.address as property_address, p.postcode as property_postcode
          FROM tenant_enquiries te
          LEFT JOIN properties p ON p.id = te.linked_property_id
          WHERE te.id = $1
        `, [existing.joint_partner_id]);
        if (partner?.email_1) {
          const partnerName = [partner.first_name_1, partner.last_name_1].filter(Boolean).join(' ');
          const partnerAddress = normalizePropertyAddress(partner.property_address, partner.property_postcode);
          const partnerContent = holdingDepositRequestEmail(
            partnerName, partnerAddress, monthly_rent, security_deposit, holding_deposit, partnerApplicationFormUrl
          );
          const partnerEmailResult = await sendEmail({
            to: partner.email_1,
            subject: partnerContent.subject,
            html: partnerContent.html,
          });
          await insert(`
            INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
            VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'holding_deposit_request', $6, $7, $8, $9, $10)
          `, [partnerEmailResult.id || null, partner.id, partner.email_1, 'contact@tenancies.fleminglettings.co.uk', partnerContent.subject, partnerContent.html, partnerEmailResult.simulated ? 'simulated' : (partnerEmailResult.success ? 'sent' : 'failed'), req.user?.id || null, req.user?.email || null, partnerEmailResult.error || null]);
          if (!partnerEmailResult.success) {
            return res.status(502).json({ error: partnerEmailResult.error || 'Joint applicant email could not be sent' });
          }
          await run(`
            UPDATE tenant_enquiries SET application_form_sent=1, holding_deposit_requested=1, onboarding_email_sent_at=NOW()
            WHERE id=$1
          `, [partner.id]);
          await logAudit(req.user?.id, req.user?.email, 'email_sent', 'tenant_enquiry', partner.id, {
            to: partner.email_1, subject: partnerContent.subject,
          });
        }
      }

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

    res.json({ success: true, token, applicationFormUrl, partnerApplicationFormUrl, delivery_status: 'accepted' });
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
    });
    await insert(`
      INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
      VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, 'tenancy_application', $6, $7, $8, $9, $10)
    `, [emailResult.id || null, enquiryId, enquiry.email_1, 'contact@tenancies.fleminglettings.co.uk', subject, body_html, emailResult.simulated ? 'simulated' : (emailResult.success ? 'sent' : 'failed'), req.user?.id || null, req.user?.email || null, emailResult.error || null]);

    if (!emailResult.success) {
      return res.status(502).json({ error: emailResult.error || 'Application email could not be sent' });
    }

    await run(`
      UPDATE tenant_enquiries SET application_form_sent=1, onboarding_email_sent_at=NOW()
      WHERE id=$1
    `, [enquiryId]);

    await logAudit(req.user?.id, req.user?.email, 'email_sent', 'tenant_enquiry', enquiryId, {
      to: enquiry.email_1, subject, template: 'tenancy_application',
    });

    res.json({ success: true, provider_id: emailResult.id, delivery_status: emailResult.simulated ? 'simulated' : 'accepted' });
  } catch (err) {
    console.error('Error sending application email:', err);
    res.status(500).json({ error: 'Failed to send application email' });
  }
});

// Send a workflow email and expose it on both records of a joint application.
app.post('/api/tenant-enquiries/:id/send-workflow-email', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const enquiryId = Number(req.params.id);
    const { subject, body_text, template, to_email } = req.body;
    if (!subject || !body_text) return res.status(400).json({ error: 'subject and body_text required' });

    const enquiry = await queryOne(
      'SELECT id, email_1, joint_partner_id FROM tenant_enquiries WHERE id = $1',
      [enquiryId]
    );
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });

    const records = [enquiry];
    if (enquiry.joint_partner_id) {
      const partner = await queryOne(
        'SELECT id, email_1, joint_partner_id FROM tenant_enquiries WHERE id = $1',
        [enquiry.joint_partner_id]
      );
      if (partner) records.push(partner);
    }
    const requestedRecipient = String(to_email || '').trim().toLowerCase();
    if (requestedRecipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedRecipient)) {
      return res.status(400).json({ error: 'Enter a valid tenant email address' });
    }
    const recipients = requestedRecipient
      ? [requestedRecipient]
      : [...new Set(records.map((record: any) => record.email_1).filter(Boolean))];
    if (recipients.length === 0) return res.status(400).json({ error: 'Enquiry has no email address' });

    const escapedBody = String(body_text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      .replace(/\r?\n/g, '<br/>');
    const { sendEmail, brandedEmailHtml } = require('./email');
    const bodyHtml = brandedEmailHtml(template === 'rejection' ? 'Application Update' : 'Enquiry Update', escapedBody);
    const emailResult = await sendEmail({
      to: recipients,
      subject,
      html: bodyHtml,
    });
    const status = emailResult.simulated ? 'simulated' : (emailResult.success ? 'sent' : 'failed');
    for (const record of records) {
      await insert(`
        INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
        VALUES ($1, 'tenant_enquiry', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [emailResult.id || null, record.id, recipients.join(', '), 'contact@tenancies.fleminglettings.co.uk', subject, template || 'workflow', bodyHtml, status, req.user?.id || null, req.user?.email || null, emailResult.error || null]);
      await logAudit(req.user?.id, req.user?.email, emailResult.success ? 'email_sent' : 'email_failed', 'tenant_enquiry', record.id, { to: recipients, subject });
    }
    if (!emailResult.success) return res.status(502).json({ error: emailResult.error || 'Email could not be sent' });
    res.json({ success: true, recipients });
  } catch (err) {
    console.error('Workflow email failed:', err);
    res.status(500).json({ error: 'Failed to send workflow email' });
  }
});

// ============ SMS ============

app.post('/api/sms/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { enquiry_id, entity_type, entity_id, to_phone, message_body } = req.body;
    if (!to_phone || !message_body) return res.status(400).json({ error: 'to_phone and message_body required' });
    const { sendSms, normalizeUkPhone } = require('./sms');
    const normalizedPhone = normalizeUkPhone(to_phone);
    const smsResult = await sendSms({ to: normalizedPhone, body: message_body });
    // Resolve entity type/id — support both legacy enquiry_id and new entity_type/entity_id
    const resolvedEntityType = entity_type || (enquiry_id ? 'tenant_enquiry' : null);
    const resolvedEntityId = entity_id || enquiry_id || null;
    const smsId = await insert(`
      INSERT INTO sms_messages (enquiry_id, entity_type, entity_id, to_phone, from_phone, message_body, status, twilio_sid, error_message, sent_by, sent_by_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      enquiry_id || null, resolvedEntityType, resolvedEntityId, normalizedPhone, SMS_FROM || null,
      message_body, smsResult.simulated ? 'simulated' : (smsResult.success ? 'sent' : 'failed'), smsResult.sid || null,
      smsResult.error || null, req.user?.id || null, req.user?.email || null
    ]);
    if (resolvedEntityType && resolvedEntityId) {
      await logAudit(req.user?.id, req.user?.email, smsResult.success ? 'sms_sent' : 'sms_failed', resolvedEntityType, resolvedEntityId, {
        to_phone: normalizedPhone, message: message_body.substring(0, 100), error: smsResult.error || null,
      });
    }
    if (!smsResult.success) {
      return res.status(502).json({ id: smsId, success: false, error: smsResult.error || 'SMS provider rejected the message' });
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
    const ids = await linkedEntityIds('tenant_enquiry', Number(req.params.enquiryId));
    const messages = await query(
      `SELECT DISTINCT ON (COALESCE(twilio_sid, 'row-' || id::text), message_body, created_at) *
       FROM sms_messages
       WHERE enquiry_id = ANY($1::int[]) OR (entity_type = 'tenant_enquiry' AND entity_id = ANY($1::int[]))
       ORDER BY COALESCE(twilio_sid, 'row-' || id::text), message_body, created_at, id DESC`,
      [ids]
    );
    messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

// Generic SMS history by entity type (for BDM, landlord, tenant pages)
app.get('/api/sms/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const entityType = String(req.params.entityType);
    const ids = await linkedEntityIds(entityType, Number(req.params.entityId));
    const messages = await query(
      'SELECT * FROM sms_messages WHERE entity_type = $1 AND entity_id = ANY($2::int[]) ORDER BY created_at DESC',
      [entityType, ids]
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SMS history' });
  }
});

// Generic email history by entity type (for all record pages)
app.get('/api/email-history/:entityType/:entityId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const entityType = String(req.params.entityType);
    const ids = await linkedEntityIds(entityType, Number(req.params.entityId));
    const messages = await query(
      'SELECT * FROM email_messages WHERE entity_type = $1 AND entity_id = ANY($2::int[]) ORDER BY created_at DESC',
      [entityType, ids]
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email history' });
  }
});

// Generic email send (for BDM, landlord pages)
app.post('/api/email/send-generic', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { entity_type, entity_id, to_email, subject, body_html } = req.body;
    if (!to_email || !subject || !body_html) return res.status(400).json({ error: 'to_email, subject, and body_html required' });
    const { sendEmail } = require('./email');
    const emailResult = await sendEmail({ to: to_email, subject, html: body_html });
    await insert(`
      INSERT INTO email_messages (resend_id, entity_type, entity_id, to_email, from_email, subject, template, body_html, status, sent_by, sent_by_email, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, 'custom', $7, $8, $9, $10, $11)
    `, [emailResult.id || null, entity_type || null, entity_id || null, to_email, 'contact@tenancies.fleminglettings.co.uk', subject, body_html, emailResult.simulated ? 'simulated' : (emailResult.success ? 'sent' : 'failed'), req.user?.id || null, req.user?.email || null, emailResult.error || null]);
    if (entity_type && entity_id) {
      await logAudit(req.user?.id, req.user?.email, emailResult.success ? 'email_sent' : 'email_failed', entity_type, entity_id, {
        to: to_email, subject, error: emailResult.error || null,
      });
    }
    if (!emailResult.success) {
      return res.status(502).json({ success: false, error: emailResult.error || 'Email provider rejected the message' });
    }
    res.json({ success: emailResult.success });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// ============ EMAIL DELIVERY TRACKING ============

// Resend webhook for email delivery events (validated via svix signature)
app.post('/api/email/webhook', async (req: any, res) => {
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

    if (!webhookSecret && process.env.NODE_ENV === 'production') {
      console.error('[RESEND] Webhook validation is not configured in production');
      return res.status(503).json({ error: 'Resend webhook validation is not configured' });
    }

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      if (!req.rawBody) {
        console.error('[RESEND] Raw webhook body is unavailable');
        return res.status(503).json({ error: 'Webhook signature validation is unavailable' });
      }
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
    const entityType = String(req.params.entityType);
    const entityId = Number(req.params.entityId);
    const limit = Number(req.query.limit) || 50;
    const ids = await linkedEntityIds(entityType, entityId);
    const logs = await query(
      'SELECT * FROM audit_log WHERE entity_type = $1 AND entity_id = ANY($2::int[]) ORDER BY created_at DESC LIMIT $3',
      [entityType, ids, limit]
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
    const { limit, offset } = pageParams(req);
    const transactions = await query('SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/transactions/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await queryOne('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (!result) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

app.post('/api/transactions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { tenancy_id, type, amount, description, date } = req.body;
    if (!type || amount == null || !date) {
      return res.status(400).json({ error: 'type, amount, and date are required' });
    }
    const id = await insert(
      'INSERT INTO transactions (tenancy_id, type, amount, description, date, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [tenancy_id || null, type, amount, description || null, date, req.user?.id || null]
    );
    await logAudit(req.user?.id, req.user?.email, 'create', 'transaction', id);
    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

app.put('/api/transactions/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const allowed = ['tenancy_id', 'type', 'amount', 'description', 'date'];
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
    values.push(req.params.id);
    await run(`UPDATE transactions SET ${fields.join(', ')} WHERE id=$${idx}`, values);
    await logAudit(req.user?.id, req.user?.email, 'update', 'transaction', parseInt(req.params.id as string), d);
    const updated = await queryOne('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

app.delete('/api/transactions/:id', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const existing = await queryOne('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });
    await run('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    await logAudit(req.user?.id, req.user?.email, 'delete', 'transaction', parseInt(req.params.id as string));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ============ DATA EXPORT ============

app.get('/api/export/:entityType', authMiddleware, requirePermission('manager'), async (req: AuthRequest, res) => {
  try {
    const { entityType } = req.params;
    let data;

    switch (entityType) {
      case 'landlords':
        data = await query('SELECT name, email, phone, home_address, address FROM landlords');
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

// Bulk postcode → lat/lon for map markers. In-memory cache: coordinates for a
// postcode effectively never change, so each one hits postcodes.io at most once
// per process lifetime.
const postcodeGeoCache = new Map<string, { latitude: number | null; longitude: number | null }>();
app.post('/api/postcode/bulk-geocode', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const postcodes: string[] = Array.isArray(req.body?.postcodes) ? req.body.postcodes.slice(0, 100) : [];
    if (postcodes.length === 0) return res.status(400).json({ error: 'postcodes array required' });

    const result: Record<string, { latitude: number; longitude: number }> = {};
    const missing: string[] = [];
    for (const pc of postcodes) {
      const key = String(pc).trim().toUpperCase();
      const hit = postcodeGeoCache.get(key);
      if (hit) {
        if (hit.latitude != null && hit.longitude != null) result[key] = { latitude: hit.latitude, longitude: hit.longitude };
      } else {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      const response = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: missing }),
      });
      const data: any = await response.json();
      for (const item of data.result || []) {
        const key = String(item.query).trim().toUpperCase();
        const entry = { latitude: item.result?.latitude ?? null, longitude: item.result?.longitude ?? null };
        postcodeGeoCache.set(key, entry);
        if (entry.latitude != null && entry.longitude != null) result[key] = { latitude: entry.latitude, longitude: entry.longitude };
      }
    }

    res.json(result);
  } catch (err) {
    console.error('Bulk geocode error:', err);
    res.status(500).json({ error: 'Failed to geocode postcodes' });
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

// Global error handler — anything thrown/rejected in a route lands here.
// Never leak internals to the caller; full detail goes to the log (and Sentry if configured).
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, 'unhandled route error');
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  if (res.headersSent) return;
  if (err?.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Start server. In production the schema is applied by the release step
// (fly.toml release_command → migrate.ts) before machines boot; in dev the
// server bootstraps its own schema.
async function start() {
  try {
    if (process.env.NODE_ENV !== 'production') {
      await initDb();
    }
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
