import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

// Use DATABASE_PATH env var if set (for Render persistent disk), otherwise default to backend/fleming.db
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'fleming.db');
const db = new Database(dbPath);

// Initialize tables - Fleming CRM Full Schema
db.exec(`
  -- ============================================
  -- USERS & AUTH
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  -- ============================================
  -- AUDIT LOG - Track all user actions
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_email TEXT,
    action TEXT NOT NULL CHECK(action IN ('view', 'create', 'update', 'delete', 'login', 'export')),
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    changes TEXT, -- JSON of what changed
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at);

  -- ============================================
  -- LANDLORDS (Onboarded)
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS landlords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Basic info
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    alt_email TEXT,
    date_of_birth DATE,
    home_address TEXT,
    -- Marketing preferences
    marketing_post INTEGER DEFAULT 0,
    marketing_email INTEGER DEFAULT 0,
    marketing_phone INTEGER DEFAULT 0,
    marketing_sms INTEGER DEFAULT 0,
    -- KYC
    kyc_completed INTEGER DEFAULT 0,
    -- Portfolio type
    landlord_type TEXT DEFAULT 'external' CHECK(landlord_type IN ('internal', 'external')),
    -- Notes
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ============================================
  -- LANDLORDS BDM (Business Development - Prospects)
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS landlords_bdm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Basic info
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    -- Status
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'follow_up', 'interested', 'onboarded', 'not_interested')),
    follow_up_date DATE,
    -- Source
    source TEXT, -- how we found them
    -- Notes
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ============================================
  -- TENANT ENQUIRIES (Prospects from website form)
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS tenant_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Applicant 1
    title_1 TEXT,
    first_name_1 TEXT NOT NULL,
    last_name_1 TEXT NOT NULL,
    email_1 TEXT NOT NULL,
    phone_1 TEXT,
    date_of_birth_1 DATE,
    current_address_1 TEXT,
    employment_status_1 TEXT,
    employer_1 TEXT,
    income_1 REAL,
    -- Applicant 2 (joint application)
    is_joint_application INTEGER DEFAULT 0,
    title_2 TEXT,
    first_name_2 TEXT,
    last_name_2 TEXT,
    email_2 TEXT,
    phone_2 TEXT,
    date_of_birth_2 DATE,
    current_address_2 TEXT,
    employment_status_2 TEXT,
    employer_2 TEXT,
    income_2 REAL,
    -- KYC
    kyc_completed_1 INTEGER DEFAULT 0,
    kyc_completed_2 INTEGER DEFAULT 0,
    -- Workflow
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'viewing_booked', 'awaiting_response', 'onboarding', 'rejected', 'converted')),
    follow_up_date DATE,
    viewing_date DATE,
    linked_property_id INTEGER,
    -- Notes
    notes TEXT,
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (linked_property_id) REFERENCES properties(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_enquiries_status ON tenant_enquiries(status);
  CREATE INDEX IF NOT EXISTS idx_enquiries_email ON tenant_enquiries(email_1);
  CREATE INDEX IF NOT EXISTS idx_enquiries_follow_up ON tenant_enquiries(follow_up_date);
  CREATE INDEX IF NOT EXISTS idx_enquiries_viewing ON tenant_enquiries(viewing_date);

  -- ============================================
  -- TENANTS (Onboarded)
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Applicant 1
    title_1 TEXT,
    first_name_1 TEXT NOT NULL,
    last_name_1 TEXT NOT NULL,
    name TEXT NOT NULL, -- Display name (for backwards compat)
    email TEXT,
    phone TEXT,
    date_of_birth_1 DATE,
    -- Applicant 2 (joint tenancy)
    is_joint_tenancy INTEGER DEFAULT 0,
    title_2 TEXT,
    first_name_2 TEXT,
    last_name_2 TEXT,
    email_2 TEXT,
    phone_2 TEXT,
    date_of_birth_2 DATE,
    -- Next of Kin
    nok_name TEXT,
    nok_relationship TEXT,
    nok_phone TEXT,
    nok_email TEXT,
    -- KYC
    kyc_completed_1 INTEGER DEFAULT 0,
    kyc_completed_2 INTEGER DEFAULT 0,
    -- Guarantor
    guarantor_required INTEGER DEFAULT 0,
    guarantor_name TEXT,
    guarantor_address TEXT,
    guarantor_phone TEXT,
    guarantor_email TEXT,
    guarantor_kyc_completed INTEGER DEFAULT 0,
    guarantor_deed_received INTEGER DEFAULT 0,
    -- Application
    holding_deposit_received INTEGER DEFAULT 0,
    holding_deposit_amount REAL,
    holding_deposit_date DATE,
    application_forms_completed INTEGER DEFAULT 0,
    -- Linked property
    property_id INTEGER,
    -- Tenancy details
    tenancy_start_date DATE,
    tenancy_type TEXT CHECK(tenancy_type IN ('AST', 'HMO', 'Rolling', 'Other')),
    has_end_date INTEGER DEFAULT 0,
    tenancy_end_date DATE,
    monthly_rent REAL,
    -- Notes
    notes TEXT,
    emergency_contact TEXT, -- backwards compat
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
  CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
  CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(property_id);
  CREATE INDEX IF NOT EXISTS idx_tenants_end_date ON tenants(tenancy_end_date);

  -- ============================================
  -- PROPERTIES
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    landlord_id INTEGER NOT NULL,
    -- Address
    address TEXT NOT NULL,
    postcode TEXT NOT NULL,
    -- Property details
    property_type TEXT DEFAULT 'house',
    bedrooms INTEGER DEFAULT 1,
    -- Ownership
    is_leasehold INTEGER DEFAULT 0,
    leasehold_start_date DATE,
    leasehold_end_date DATE,
    leaseholder_info TEXT,
    proof_of_ownership_received INTEGER DEFAULT 0,
    council_tax_band TEXT CHECK(council_tax_band IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
    -- Service type
    service_type TEXT CHECK(service_type IN ('rent_collection', 'let_only', 'full_management')),
    charge_percentage REAL, -- for rent_collection and full_management
    total_charge REAL, -- for let_only
    -- Tenancy
    rent_amount REAL NOT NULL,
    has_live_tenancy INTEGER DEFAULT 0,
    tenancy_start_date DATE,
    tenancy_type TEXT CHECK(tenancy_type IN ('AST', 'HMO', 'Rolling', 'Other')),
    has_end_date INTEGER DEFAULT 0,
    tenancy_end_date DATE,
    rent_review_date DATE,
    -- Compliance - EICR
    eicr_expiry_date DATE,
    -- Compliance - EPC
    epc_grade TEXT CHECK(epc_grade IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'None')),
    epc_expiry_date DATE,
    -- Compliance - Gas
    has_gas INTEGER DEFAULT 0,
    gas_safety_expiry_date DATE,
    -- Status
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'let', 'maintenance')),
    onboarded_date DATE,
    -- Notes
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (landlord_id) REFERENCES landlords(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
  CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
  CREATE INDEX IF NOT EXISTS idx_properties_eicr ON properties(eicr_expiry_date);
  CREATE INDEX IF NOT EXISTS idx_properties_epc ON properties(epc_expiry_date);
  CREATE INDEX IF NOT EXISTS idx_properties_gas ON properties(gas_safety_expiry_date);
  CREATE INDEX IF NOT EXISTS idx_properties_tenancy_end ON properties(tenancy_end_date);
  CREATE INDEX IF NOT EXISTS idx_properties_rent_review ON properties(rent_review_date);

  -- ============================================
  -- TENANCIES (Historical record of tenancies)
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS tenancies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    rent_amount REAL NOT NULL,
    deposit_amount REAL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'ended', 'pending')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  -- ============================================
  -- RENT PAYMENTS
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS rent_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    tenant_id INTEGER,
    due_date DATE NOT NULL,
    amount_due REAL NOT NULL,
    amount_paid REAL,
    payment_date DATE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'late', 'partial')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_rent_due ON rent_payments(due_date);
  CREATE INDEX IF NOT EXISTS idx_rent_status ON rent_payments(status);
  CREATE INDEX IF NOT EXISTS idx_rent_property ON rent_payments(property_id);

  -- ============================================
  -- TRANSACTIONS (Legacy - keep for backwards compat)
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenancy_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('rent_due', 'payment', 'deposit', 'fee', 'refund')),
    amount REAL NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- ============================================
  -- MAINTENANCE REQUESTS
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    tenant_id INTEGER,
    landlord_id INTEGER,
    -- Reporter info (from website form)
    reporter_name TEXT,
    reporter_email TEXT,
    reporter_phone TEXT,
    reporter_type TEXT CHECK(reporter_type IN ('tenant', 'landlord', 'agent', 'other')),
    -- Issue details
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT CHECK(category IN ('plumbing', 'electrical', 'heating', 'structural', 'appliance', 'pest', 'garden', 'other')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'awaiting_parts', 'completed', 'closed')),
    -- Resolution
    contractor TEXT,
    contractor_phone TEXT,
    cost REAL,
    resolution_notes TEXT,
    completed_date DATE,
    -- Notes
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (landlord_id) REFERENCES landlords(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance(property_id);
  CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance(status);
  CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON maintenance(priority);

  -- ============================================
  -- TASKS / TO-DO LIST
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Task info
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'archived')),
    -- Assignment (stores user name as TEXT)
    assigned_to TEXT,
    -- Related entity
    entity_type TEXT CHECK(entity_type IN ('property', 'tenant', 'landlord', 'enquiry', 'tenant_enquiry', 'maintenance', 'general')),
    entity_id INTEGER,
    -- Scheduling
    due_date DATE,
    follow_up_date DATE,
    -- Auto-generated task type
    task_type TEXT CHECK(task_type IN ('manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing', 'follow_up', 'viewing', 'document', 'onboarding', 'compliance', 'other')),
    -- Notes
    notes TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks(entity_type, entity_id);

  -- ============================================
  -- DOCUMENTS
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('landlord', 'landlord_bdm', 'tenant', 'tenant_enquiry', 'property', 'maintenance', 'task')),
    entity_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    uploaded_by INTEGER,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);

  -- ============================================
  -- PROPERTY VIEWINGS
  -- ============================================
  
  CREATE TABLE IF NOT EXISTS property_viewings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    enquiry_id INTEGER,
    -- Viewer info
    viewer_name TEXT NOT NULL,
    viewer_email TEXT,
    viewer_phone TEXT,
    -- Scheduling
    viewing_date DATE NOT NULL,
    viewing_time TEXT,
    -- Status
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    -- Outcome
    feedback TEXT,
    interested INTEGER,
    -- Notes
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (enquiry_id) REFERENCES tenant_enquiries(id)
  );
  
  CREATE INDEX IF NOT EXISTS idx_viewings_date ON property_viewings(viewing_date);
  CREATE INDEX IF NOT EXISTS idx_viewings_property ON property_viewings(property_id);

  -- ============================================
  -- AI CONFIGURATION
  -- ============================================

  CREATE TABLE IF NOT EXISTS ai_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migrate audit_log to remove restrictive CHECK constraint (allows note_added, etc.)
const auditSchema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='audit_log'`).get() as any;
if (auditSchema && auditSchema.sql && auditSchema.sql.includes('CHECK')) {
  db.exec(`DROP TABLE IF EXISTS audit_log_new`);
  db.exec(`
    CREATE TABLE audit_log_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      changes TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    INSERT INTO audit_log_new SELECT * FROM audit_log;
    DROP TABLE audit_log;
    ALTER TABLE audit_log_new RENAME TO audit_log;
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_log(created_at);
  `);
}

// Cleanup leftover migration tables from any previous failed run
db.exec(`DROP TABLE IF EXISTS properties_new`);
db.exec(`DROP TABLE IF EXISTS audit_log_new`);

// Migrate properties to allow expanded status values (to_let, let_agreed, full_management, rent_collection)
// Check if the table schema has a CHECK constraint on status
const propSchema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='properties'`).get() as any;
if (propSchema && propSchema.sql && propSchema.sql.includes('CHECK')) {
  // Table has CHECK constraints — recreate without them
  db.pragma('foreign_keys = OFF');
  db.exec(`DROP TABLE IF EXISTS properties_new`);
  db.exec(`
    CREATE TABLE properties_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      landlord_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      postcode TEXT NOT NULL,
      property_type TEXT DEFAULT 'house',
      bedrooms INTEGER DEFAULT 1,
      is_leasehold INTEGER DEFAULT 0,
      leasehold_start_date DATE,
      leasehold_end_date DATE,
      leaseholder_info TEXT,
      proof_of_ownership_received INTEGER DEFAULT 0,
      council_tax_band TEXT,
      service_type TEXT,
      charge_percentage REAL,
      total_charge REAL,
      rent_amount REAL NOT NULL,
      has_live_tenancy INTEGER DEFAULT 0,
      tenancy_start_date DATE,
      tenancy_type TEXT,
      has_end_date INTEGER DEFAULT 0,
      tenancy_end_date DATE,
      rent_review_date DATE,
      eicr_expiry_date DATE,
      epc_grade TEXT,
      epc_expiry_date DATE,
      has_gas INTEGER DEFAULT 0,
      gas_safety_expiry_date DATE,
      status TEXT DEFAULT 'to_let',
      onboarded_date DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (landlord_id) REFERENCES landlords(id)
    );
    INSERT INTO properties_new SELECT * FROM properties;
    DROP TABLE properties;
    ALTER TABLE properties_new RENAME TO properties;
    CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
    CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
    CREATE INDEX IF NOT EXISTS idx_properties_eicr ON properties(eicr_expiry_date);
    CREATE INDEX IF NOT EXISTS idx_properties_epc ON properties(epc_expiry_date);
    CREATE INDEX IF NOT EXISTS idx_properties_gas ON properties(gas_safety_expiry_date);
    CREATE INDEX IF NOT EXISTS idx_properties_tenancy_end ON properties(tenancy_end_date);
    CREATE INDEX IF NOT EXISTS idx_properties_rent_review ON properties(rent_review_date);
  `);
  db.pragma('foreign_keys = ON');
  // Update old status values to new ones
  try { db.prepare(`UPDATE properties SET status = 'to_let' WHERE status = 'available'`).run(); } catch (e2) {}
  try { db.prepare(`UPDATE properties SET status = 'let_agreed' WHERE status = 'let'`).run(); } catch (e2) {}
}

// Also migrate tenants table to remove tenancy_type CHECK constraint
try {
  db.prepare(`UPDATE tenants SET tenancy_type = NULL WHERE tenancy_type = ''`).run();
} catch (e) {}

// Migrations for existing databases
try {
  db.exec(`ALTER TABLE landlords ADD COLUMN landlord_type TEXT DEFAULT 'external' CHECK(landlord_type IN ('internal', 'external'))`);
} catch (e) {
  // Column already exists — safe to ignore
}

try {
  db.exec(`ALTER TABLE tenant_enquiries ADD COLUMN viewing_with TEXT`);
} catch (e) {
  // Column already exists
}

// Sprint 2: Structured proof of income
for (const col of ['income_amount TEXT', 'income_employer TEXT', 'income_contract_type TEXT']) {
  try { db.exec(`ALTER TABLE tenants ADD COLUMN ${col}`); } catch (e) {}
}

// Sprint 2: KYC breakdown (Primary ID, Secondary ID, Address verification, Personal verification)
for (const col of ['kyc_primary_id INTEGER DEFAULT 0', 'kyc_secondary_id INTEGER DEFAULT 0', 'kyc_address_verification INTEGER DEFAULT 0', 'kyc_personal_verification INTEGER DEFAULT 0']) {
  try { db.exec(`ALTER TABLE tenants ADD COLUMN ${col}`); } catch (e) {}
}

// Sprint 2: Renting requirements on enquiries
try { db.exec(`ALTER TABLE tenant_enquiries ADD COLUMN renting_requirements TEXT`); } catch (e) {}

// Sprint 2: Permanent address flag on enquiries
try { db.exec(`ALTER TABLE tenant_enquiries ADD COLUMN is_permanent_address INTEGER DEFAULT 0`); } catch (e) {}

// Sprint 2: Onboarding checklist fields
for (const col of ['authority_to_contact INTEGER DEFAULT 0', 'proof_of_income TEXT', 'deposit_scheme TEXT']) {
  try { db.exec(`ALTER TABLE tenants ADD COLUMN ${col}`); } catch (e) {}
}

// Sprint 2: Tenant status and move-in date
try { db.exec(`ALTER TABLE tenants ADD COLUMN status TEXT DEFAULT 'active'`); } catch (e) {}
try { db.exec(`ALTER TABLE tenants ADD COLUMN move_in_date DATE`); } catch (e) {}

// Sprint 3: Landlord referral source
try { db.exec(`ALTER TABLE landlords ADD COLUMN referral_source TEXT`); } catch (e) {}

// Sprint 3: Property expenses table
db.exec(`
  CREATE TABLE IF NOT EXISTS property_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    expense_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id)
  );
`);

// ============ SEED DATA (only on empty database or FORCE_RESEED) ============
if (process.env.FORCE_RESEED === 'true') {
  console.log('[Seed] FORCE_RESEED detected — wiping and re-seeding...');
  const tables = ['property_viewings', 'property_expenses', 'rent_payments', 'maintenance', 'tasks', 'tenancies', 'tenant_enquiries', 'tenants', 'properties', 'landlords_bdm', 'landlords', 'audit_log', 'documents', 'users'];
  tables.forEach(t => { try { db.exec(`DELETE FROM ${t}`); } catch(e) {} });
}
const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
if (userCount === 0) {
  console.log('[Seed] Empty database detected — seeding comprehensive demo data...');

  // ── Users ──
  const hash1 = bcrypt.hashSync('test123', 10);
  const hash2 = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run('d@planet.earth', hash1, 'Danyl', 'admin');
  db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)').run('admin@fleming.com', hash2, 'Admin', 'admin');

  // ── Landlords (fully populated) ──
  db.prepare(`INSERT INTO landlords (name, email, phone, alt_email, date_of_birth, home_address, marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, landlord_type, notes, referral_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('James MacPherson', 'j.macpherson@email.com', '07700 700100', 'james.mac@outlook.com', '1972-06-15', '18 Bruntsfield Place, Edinburgh EH10 4HN', 1, 1, 1, 0, 1, 'internal', 'Long-standing client. Owns 2 properties in Leith area. Prefers email communication.', 'Website');
  db.prepare(`INSERT INTO landlords (name, email, phone, alt_email, date_of_birth, home_address, marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, landlord_type, notes, referral_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Sarah Henderson', 's.henderson@email.com', '07700 700200', null, '1985-11-22', '42 Comiston Road, Edinburgh EH10 5QN', 0, 1, 1, 1, 1, 'external', 'Lettings client since 2024. Responsive and easy to work with. Has one 3-bed house.', 'Referral');
  db.prepare(`INSERT INTO landlords (name, email, phone, alt_email, date_of_birth, home_address, marketing_post, marketing_email, marketing_phone, marketing_sms, kyc_completed, landlord_type, notes, referral_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Fleming Lettings Ltd', 'office@fleming.com', '0131 555 0100', 'accounts@fleming.com', null, '1 George Street, Edinburgh EH2 2PB', 1, 1, 1, 1, 1, 'internal', 'Company-owned portfolio. 2 properties under full management.', 'Internal');

  // ── Properties (fully populated with compliance, tenancy, charges) ──
  db.prepare(`INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, council_tax_band, service_type, charge_percentage, total_charge, has_live_tenancy, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date, rent_review_date, eicr_expiry_date, epc_grade, epc_expiry_date, has_gas, gas_safety_expiry_date, onboarded_date, proof_of_ownership_received, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(1, '12A Leith Walk, Edinburgh EH6 5DT', 'EH6 5DT', 'flat', 2, 950, 'let_agreed', 'C', 'full_management', 10, 95, 1, '2025-09-01', 'AST', 1, '2026-08-31', '2026-09-01', '2027-03-15', 'C', '2028-01-20', 1, '2026-06-18', '2024-08-15', 1, 'Ground floor flat with private garden. Gas central heating. Recently refurbished kitchen.');
  db.prepare(`INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, council_tax_band, service_type, charge_percentage, total_charge, has_live_tenancy, eicr_expiry_date, epc_grade, epc_expiry_date, has_gas, gas_safety_expiry_date, onboarded_date, proof_of_ownership_received, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(1, '7/3 Easter Road, Edinburgh EH7 5PL', 'EH7 5PL', 'flat', 1, 750, 'to_let', 'B', 'rent_collection', 8, 60, 0, '2026-11-30', 'D', '2027-05-10', 1, '2026-09-22', '2025-01-10', 1, '1st floor flat. Electric heating. Available from April. Close to Meadowbank.');
  db.prepare(`INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, council_tax_band, service_type, charge_percentage, total_charge, has_live_tenancy, tenancy_start_date, tenancy_type, has_end_date, rent_review_date, eicr_expiry_date, epc_grade, epc_expiry_date, has_gas, gas_safety_expiry_date, onboarded_date, proof_of_ownership_received, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(2, '15 Constitution Street, Edinburgh EH6 7BG', 'EH6 7BG', 'house', 3, 1200, 'full_management', 'D', 'full_management', 12, 144, 1, '2025-06-15', 'AST', 0, '2026-06-15', '2026-08-20', 'B', '2029-02-14', 1, '2026-04-05', '2024-06-01', 1, 'Mid-terrace house with driveway. Gas combi boiler. Family-friendly area near the Shore.');
  db.prepare(`INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, council_tax_band, service_type, charge_percentage, total_charge, has_live_tenancy, eicr_expiry_date, epc_grade, epc_expiry_date, has_gas, gas_safety_expiry_date, onboarded_date, proof_of_ownership_received, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(3, '21 Morningside Road, Edinburgh EH10 4DR', 'EH10 4DR', 'flat', 2, 1100, 'to_let', 'C', 'full_management', 10, 110, 0, '2027-01-10', 'C', '2028-06-30', 1, '2026-07-15', '2025-03-20', 1, '2nd floor tenement flat. Period features. Shared garden to rear. Popular Morningside location.');
  db.prepare(`INSERT INTO properties (landlord_id, address, postcode, property_type, bedrooms, rent_amount, status, council_tax_band, service_type, charge_percentage, total_charge, has_live_tenancy, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date, rent_review_date, eicr_expiry_date, epc_grade, epc_expiry_date, has_gas, gas_safety_expiry_date, onboarded_date, proof_of_ownership_received, is_leasehold, leasehold_start_date, leasehold_end_date, leaseholder_info, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(3, '4 Stockbridge Crescent, Edinburgh EH3 5LR', 'EH3 5LR', 'flat', 3, 1400, 'let_agreed', 'E', 'full_management', 10, 140, 1, '2025-11-01', 'AST', 1, '2026-10-31', '2026-11-01', '2026-12-01', 'B', '2029-09-15', 1, '2026-05-20', '2025-01-15', 1, 1, '2020-01-01', '2120-01-01', 'Stockbridge Estates Management Ltd — Factor: 0131 220 4455', 'Premium 3-bed in sought-after Stockbridge. Leasehold with factor. Modern kitchen and en-suite.');

  // ── Tenants (fully populated with NOK, guarantor, KYC, income, deposits) ──
  db.prepare(`INSERT INTO tenants (title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1, property_id, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date, monthly_rent, nok_name, nok_relationship, nok_phone, nok_email, kyc_completed_1, kyc_primary_id, kyc_secondary_id, kyc_address_verification, kyc_personal_verification, holding_deposit_received, holding_deposit_amount, holding_deposit_date, application_forms_completed, income_amount, income_employer, income_contract_type, authority_to_contact, proof_of_income, deposit_scheme, status, move_in_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Ms', 'Emma', 'Wilson', 'Emma Wilson', 'e.wilson@email.com', '07700 800100', '1994-03-18', 1, '2025-09-01', 'AST', 1, '2026-08-31', 950, 'Robert Wilson', 'Father', '07700 800150', 'r.wilson@email.com', 1, 1, 1, 1, 1, 1, 475, '2025-08-15', 1, '32000', 'Scottish Power', 'Permanent', 1, 'Payslips verified', 'SafeDeposits Scotland', 'active', '2025-09-01', 'Excellent tenant. Always pays on time. Works in energy sector.');

  db.prepare(`INSERT INTO tenants (title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1, is_joint_tenancy, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2, property_id, tenancy_start_date, tenancy_type, has_end_date, monthly_rent, nok_name, nok_relationship, nok_phone, nok_email, kyc_completed_1, kyc_completed_2, kyc_primary_id, kyc_secondary_id, kyc_address_verification, kyc_personal_verification, guarantor_required, guarantor_name, guarantor_address, guarantor_phone, guarantor_email, guarantor_kyc_completed, guarantor_deed_received, holding_deposit_received, holding_deposit_amount, holding_deposit_date, application_forms_completed, income_amount, income_employer, income_contract_type, authority_to_contact, proof_of_income, deposit_scheme, status, move_in_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Mr', 'David', 'Brown', 'David Brown', 'd.brown@email.com', '07700 800200', '1988-07-25', 1, 'Ms', 'Lisa', 'Brown', 'l.brown@email.com', '07700 800250', '1990-02-14', 3, '2025-06-15', 'AST', 0, 1200, 'Margaret Brown', 'Mother', '07700 800300', 'm.brown@email.com', 1, 1, 1, 1, 1, 1, 1, 'Ian Brown', '55 Dalkeith Road, Edinburgh EH16 5AA', '07700 800350', 'i.brown@email.com', 1, 1, 1, 600, '2025-05-30', 1, '28000', 'University of Edinburgh', 'Fixed-term', 1, 'Employment contract verified', 'mydeposits Scotland', 'active', '2025-06-15', 'Joint tenancy — David and Lisa Brown. Guarantor in place (Ian Brown). David works at university, Lisa is a freelance designer.');

  db.prepare(`INSERT INTO tenants (title_1, first_name_1, last_name_1, name, email, phone, date_of_birth_1, property_id, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date, monthly_rent, nok_name, nok_relationship, nok_phone, kyc_completed_1, kyc_primary_id, holding_deposit_received, holding_deposit_amount, holding_deposit_date, application_forms_completed, income_amount, income_employer, income_contract_type, deposit_scheme, status, move_in_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Mr', 'Fraser', 'McKenzie', 'Fraser McKenzie', 'f.mckenzie@email.com', '07700 800400', '1996-12-05', 5, '2025-11-01', 'AST', 1, '2026-10-31', 1400, 'Anne McKenzie', 'Mother', '07700 800450', 1, 1, 1, 700, '2025-10-20', 1, '45000', 'Baillie Gifford', 'Permanent', 'SafeDeposits Scotland', 'active', '2025-11-01', 'Young professional in finance. Very tidy tenant. First tenancy with Fleming.');

  // ── Tenant Enquiries (fully populated with employment, income, addresses, viewing dates) ──
  db.prepare(`INSERT INTO tenant_enquiries (title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1, current_address_1, employment_status_1, employer_1, income_1, status, linked_property_id, viewing_date, viewing_with, renting_requirements, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Mr', 'Tom', 'Anderson', 'tom@email.com', '07700 900100', '1991-05-10', '22 Marchmont Crescent, Edinburgh EH9 1HQ', 'Employed', 'Standard Life', 35000, 'viewing_booked', 2, '2026-03-14', 'Danyl', '2 bed flat, pet-friendly, max £800pcm', 'Looking to move from current flatshare. Has a cat. Works in financial services.');

  db.prepare(`INSERT INTO tenant_enquiries (title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1, current_address_1, employment_status_1, employer_1, income_1, is_joint_application, title_2, first_name_2, last_name_2, email_2, phone_2, date_of_birth_2, current_address_2, employment_status_2, employer_2, income_2, status, renting_requirements, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Ms', 'Jenny', 'Liu', 'jenny@email.com', '07700 900200', '1993-08-30', '5 Viewforth, Edinburgh EH10 4JD', 'Employed', 'NHS Lothian', 38000, 1, 'Mr', 'Mark', 'Liu', 'mark.liu@email.com', '07700 900250', '1992-01-15', '5 Viewforth, Edinburgh EH10 4JD', 'Employed', 'Royal Bank of Scotland', 42000, 'new', '3 bed house or large flat, garden preferred, max £1300pcm', 'Joint application with husband Mark. Currently renting in Viewforth, lease ending May. Combined income £80k.');

  db.prepare(`INSERT INTO tenant_enquiries (title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1, current_address_1, employment_status_1, employer_1, income_1, status, follow_up_date, renting_requirements, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Mr', 'Ahmed', 'Hassan', 'ahmed@email.com', '07700 900300', '1997-04-22', '8 Bonnington Road, Edinburgh EH6 5JD', 'Self-employed', 'Hassan Consulting', 30000, 'awaiting_response', '2026-03-15', '1-2 bed flat, central Edinburgh, max £900pcm', 'Self-employed consultant. Sent application form — awaiting completed docs. May need guarantor.');

  db.prepare(`INSERT INTO tenant_enquiries (title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1, current_address_1, employment_status_1, employer_1, income_1, status, linked_property_id, viewing_date, viewing_with, renting_requirements, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('Ms', 'Sophie', 'Taylor', 'sophie@email.com', '07700 900400', '1995-10-08', '31 Causewayside, Edinburgh EH9 1QF', 'Employed', 'University of Edinburgh', 29000, 'viewing_booked', 4, '2026-03-12', 'Admin', '2 bed flat in south Edinburgh, max £1100pcm', 'PhD researcher at UoE. Quiet professional. Viewing Morningside property this week.');

  // ── BDM Prospects (with notes) ──
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, follow_up_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('Patricia Young', 'p.young@email.com', '07700 700444', '33 Corstorphine Road, Edinburgh', 'Gumtree', 'follow_up', '2026-03-10', 'Has 1-bed flat in Corstorphine. Currently self-managing. Interested in full management after bad tenant experience.');
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Andrew Campbell', 'a.campbell@email.com', '07700 700111', '45 Queen Street, Edinburgh', 'Rightmove', 'new', 'Enquired via Rightmove listing. Owns city centre flat. New to lettings.');
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Derek Hamilton', 'd.hamilton@email.com', '07700 700555', '19 Dalry Road, Edinburgh', 'OpenRent', 'new', 'Currently using OpenRent. Unhappy with lack of local support. 2-bed flat.');
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Ravnita Rayo', 'ray123@gmail.com', '079619876123', 'The Willows, Edinburgh', 'Rightmove', 'new', 'Inherited property from parents. First-time landlord. Needs guidance on compliance.');
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, follow_up_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('Claire Robertson', 'c.robertson@email.com', '07700 700222', '12 Dundas Street, Edinburgh', 'Referral', 'contacted', '2026-03-12', 'Referred by James MacPherson. Has 2 properties — looking to switch from current agent. Meeting scheduled.');
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, follow_up_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('Karen Mitchell', 'k.mitchell@email.com', '07700 700666', '27 Gorgie Road, Edinburgh', 'Referral', 'contacted', '2026-03-14', 'Owns HMO property in Gorgie. Currently with another agency but unhappy with fees. Wants a quote.');
  db.prepare(`INSERT INTO landlords_bdm (name, email, phone, address, source, status, follow_up_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('Michael Douglas', 'm.douglas@email.com', '07700 700333', '8 Haymarket Terrace, Edinburgh', 'Website', 'interested', '2026-03-15', 'Very keen to proceed. Has a 2-bed flat near Haymarket station. Wants full management. Sending onboarding pack.');

  // ── Maintenance (with reporter info, categories, contractor details, mixed statuses) ──
  db.prepare(`INSERT INTO maintenance (property_id, tenant_id, landlord_id, reporter_name, reporter_email, reporter_phone, reporter_type, title, description, category, priority, status, contractor, contractor_phone, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(1, 1, 1, 'Emma Wilson', 'e.wilson@email.com', '07700 800100', 'tenant', 'Boiler not heating water', 'Tenant reports no hot water since yesterday morning. Boiler showing E119 error code.', 'heating', 'urgent', 'in_progress', 'Edinburgh Gas Services', '0131 555 1234', 'Engineer visiting tomorrow 9am-12pm. Landlord notified.');
  db.prepare(`INSERT INTO maintenance (property_id, tenant_id, landlord_id, reporter_name, reporter_type, title, description, category, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(3, 2, 2, 'David Brown', 'tenant', 'Leaking kitchen tap', 'Slow drip from kitchen mixer tap. Getting worse over past week.', 'plumbing', 'medium', 'open');
  db.prepare(`INSERT INTO maintenance (property_id, landlord_id, reporter_name, reporter_type, title, description, category, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(4, 3, 'Danyl', 'agent', 'Bedroom window wont close', 'Handle mechanism broken on main bedroom window during inspection. Security concern.', 'structural', 'high', 'open');
  db.prepare(`INSERT INTO maintenance (property_id, tenant_id, landlord_id, reporter_name, reporter_type, title, description, category, priority, status, contractor, contractor_phone, cost, resolution_notes, completed_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(5, 3, 3, 'Fraser McKenzie', 'tenant', 'Dishwasher not draining', 'Built-in dishwasher leaving standing water after cycle. Tried cleaning filter — no improvement.', 'appliance', 'medium', 'completed', 'Appliance Care Edinburgh', '0131 555 5678', 185.00, 'Replaced faulty drain pump. Tested OK — 6 month warranty on part.', '2026-03-05');

  // ── Tasks (mixed priorities, types, statuses) ──
  db.prepare(`INSERT INTO tasks (title, description, priority, status, assigned_to, entity_type, entity_id, due_date, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Chase gas safety certificate', 'Gas safety expires 18 June for 12A Leith Walk. Book engineer ASAP.', 'high', 'pending', 1, 'property', 1, '2026-03-20', 'gas_reminder');
  db.prepare(`INSERT INTO tasks (title, description, priority, status, assigned_to, entity_type, entity_id, due_date, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Rent review — 15 Constitution St', 'Annual rent review due June 2026. Prepare market comparison and contact landlord.', 'medium', 'pending', 1, 'property', 3, '2026-05-15', 'rent_review');
  db.prepare(`INSERT INTO tasks (title, description, priority, status, assigned_to, entity_type, entity_id, due_date, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Follow up with Ahmed Hassan', 'Waiting for completed application and proof of income. Chase if not received.', 'medium', 'in_progress', 2, 'enquiry', 3, '2026-03-15', 'follow_up');
  db.prepare(`INSERT INTO tasks (title, description, priority, status, assigned_to, entity_type, entity_id, due_date, task_type, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Complete KYC for Emma Wilson', 'All documents received and verified. Upload copies to system.', 'low', 'completed', 1, 'tenant', 1, '2026-03-01', 'manual', '2026-02-28 14:30:00');
  db.prepare(`INSERT INTO tasks (title, description, priority, status, assigned_to, entity_type, entity_id, due_date, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Send onboarding pack to Michael Douglas', 'Prospect very keen. Prepare and send full management proposal with fee schedule.', 'high', 'pending', 2, 'landlord', 7, '2026-03-12', 'manual');
  db.prepare(`INSERT INTO tasks (title, description, priority, status, assigned_to, due_date, task_type) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('Quarterly compliance audit', 'Review all property compliance dates — EICR, EPC, gas safety certs. Flag any expiring within 60 days.', 'high', 'pending', 1, '2026-03-31', 'manual');

  // ── Rent payments (mix of paid, pending, late) ──
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(1, 1, '2026-01-01', 950, 950, '2026-01-02', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(1, 1, '2026-02-01', 950, 950, '2026-02-01', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(1, 1, '2026-03-01', 950, 950, '2026-03-03', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, status) VALUES (?, ?, ?, ?, ?)`).run(1, 1, '2026-04-01', 950, 'pending');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(3, 2, '2026-01-01', 1200, 1200, '2026-01-01', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(3, 2, '2026-02-01', 1200, 1200, '2026-02-03', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(3, 2, '2026-03-01', 1200, 800, '2026-03-08', 'partial', 'Tenant paid £800 — balance of £400 expected 15th March.');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(5, 3, '2026-01-01', 1400, 1400, '2025-12-30', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(5, 3, '2026-02-01', 1400, 1400, '2026-02-01', 'paid');
  db.prepare(`INSERT INTO rent_payments (property_id, tenant_id, due_date, amount_due, amount_paid, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(5, 3, '2026-03-01', 1400, 1400, '2026-03-01', 'paid');

  // ── Property expenses ──
  db.prepare(`INSERT INTO property_expenses (property_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)`).run(1, 'Annual boiler service', 120.00, 'maintenance', '2025-11-15');
  db.prepare(`INSERT INTO property_expenses (property_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)`).run(1, 'Smoke alarm battery replacement', 35.00, 'safety', '2026-01-10');
  db.prepare(`INSERT INTO property_expenses (property_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)`).run(3, 'Garden maintenance — hedge trimming', 85.00, 'garden', '2026-02-20');
  db.prepare(`INSERT INTO property_expenses (property_id, description, amount, category, expense_date) VALUES (?, ?, ?, ?, ?)`).run(5, 'Dishwasher repair — drain pump', 185.00, 'maintenance', '2026-03-05');

  // ── Property viewings ──
  db.prepare(`INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, status, feedback, interested, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(2, 1, 'Tom Anderson', 'tom@email.com', '07700 900100', '2026-03-14', '14:00', 'scheduled', null, null, 'Confirmed via email. Key collected from office.');
  db.prepare(`INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, status, feedback, interested, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(4, 4, 'Sophie Taylor', 'sophie@email.com', '07700 900400', '2026-03-12', '11:00', 'scheduled', null, null, 'Meeting at property. Keys in lockbox — code sent to viewer.');
  db.prepare(`INSERT INTO property_viewings (property_id, enquiry_id, viewer_name, viewer_email, viewer_phone, viewing_date, viewing_time, status, feedback, interested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(2, null, 'Mark Stevens', 'mstevens@gmail.com', '07700 111222', '2026-03-08', '10:30', 'completed', 'Liked the flat but felt the kitchen was too small. May reconsider if price drops.', 0);

  console.log('[Seed] Comprehensive demo data created.');
  console.log('[Seed] Login: d@planet.earth / test123  OR  admin@fleming.com / admin123');
}

export default db;
