import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'fleming.db'));

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
    -- Assignment
    assigned_to INTEGER,
    -- Related entity
    entity_type TEXT CHECK(entity_type IN ('property', 'tenant', 'landlord', 'enquiry', 'maintenance', 'general')),
    entity_id INTEGER,
    -- Scheduling
    due_date DATE,
    follow_up_date DATE,
    -- Auto-generated task type
    task_type TEXT CHECK(task_type IN ('manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing', 'follow_up')),
    -- Notes
    notes TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES users(id)
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
    entity_type TEXT NOT NULL CHECK(entity_type IN ('landlord', 'landlord_bdm', 'tenant', 'tenant_enquiry', 'property', 'maintenance')),
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

// Migrations for existing databases
try {
  db.exec(`ALTER TABLE landlords ADD COLUMN landlord_type TEXT DEFAULT 'external' CHECK(landlord_type IN ('internal', 'external'))`);
} catch (e) {
  // Column already exists — safe to ignore
}

export default db;
