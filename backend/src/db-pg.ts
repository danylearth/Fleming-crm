import { Pool } from 'pg';

// Use DATABASE_URL from environment (Render provides this)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false
});

// Initialize tables - PostgreSQL Schema
export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- USERS & AUTH
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );

      -- AUDIT LOG
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        user_email TEXT,
        action TEXT NOT NULL CHECK(action IN ('view', 'create', 'update', 'delete', 'login', 'export')),
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        changes TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- LANDLORDS
      CREATE TABLE IF NOT EXISTS landlords (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- LANDLORDS BDM (Prospects)
      CREATE TABLE IF NOT EXISTS landlords_bdm (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'follow_up', 'interested', 'onboarded', 'not_interested')),
        follow_up_date DATE,
        source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TENANT ENQUIRIES
      CREATE TABLE IF NOT EXISTS tenant_enquiries (
        id SERIAL PRIMARY KEY,
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
        kyc_completed_1 INTEGER DEFAULT 0,
        kyc_completed_2 INTEGER DEFAULT 0,
        status TEXT DEFAULT 'new' CHECK(status IN ('new', 'viewing_booked', 'awaiting_response', 'onboarding', 'rejected', 'converted')),
        follow_up_date DATE,
        viewing_date DATE,
        linked_property_id INTEGER,
        notes TEXT,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- PROPERTIES
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        landlord_id INTEGER NOT NULL REFERENCES landlords(id),
        address TEXT NOT NULL,
        postcode TEXT NOT NULL,
        property_type TEXT DEFAULT 'house',
        bedrooms INTEGER DEFAULT 1,
        is_leasehold INTEGER DEFAULT 0,
        leasehold_start_date DATE,
        leasehold_end_date DATE,
        leaseholder_info TEXT,
        proof_of_ownership_received INTEGER DEFAULT 0,
        council_tax_band TEXT CHECK(council_tax_band IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', NULL)),
        service_type TEXT CHECK(service_type IN ('rent_collection', 'let_only', 'full_management', NULL)),
        charge_percentage REAL,
        total_charge REAL,
        rent_amount REAL NOT NULL DEFAULT 0,
        has_live_tenancy INTEGER DEFAULT 0,
        tenancy_start_date DATE,
        tenancy_type TEXT CHECK(tenancy_type IN ('AST', 'HMO', 'Rolling', 'Other', NULL)),
        has_end_date INTEGER DEFAULT 0,
        tenancy_end_date DATE,
        rent_review_date DATE,
        eicr_expiry_date DATE,
        epc_grade TEXT CHECK(epc_grade IN ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'None', NULL)),
        epc_expiry_date DATE,
        has_gas INTEGER DEFAULT 0,
        gas_safety_expiry_date DATE,
        status TEXT DEFAULT 'available' CHECK(status IN ('available', 'let', 'maintenance')),
        onboarded_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TENANTS
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        title_1 TEXT,
        first_name_1 TEXT NOT NULL,
        last_name_1 TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        date_of_birth_1 DATE,
        is_joint_tenancy INTEGER DEFAULT 0,
        title_2 TEXT,
        first_name_2 TEXT,
        last_name_2 TEXT,
        email_2 TEXT,
        phone_2 TEXT,
        date_of_birth_2 DATE,
        nok_name TEXT,
        nok_relationship TEXT,
        nok_phone TEXT,
        nok_email TEXT,
        kyc_completed_1 INTEGER DEFAULT 0,
        kyc_completed_2 INTEGER DEFAULT 0,
        guarantor_required INTEGER DEFAULT 0,
        guarantor_name TEXT,
        guarantor_address TEXT,
        guarantor_phone TEXT,
        guarantor_email TEXT,
        guarantor_kyc_completed INTEGER DEFAULT 0,
        guarantor_deed_received INTEGER DEFAULT 0,
        holding_deposit_received INTEGER DEFAULT 0,
        holding_deposit_amount REAL,
        holding_deposit_date DATE,
        application_forms_completed INTEGER DEFAULT 0,
        property_id INTEGER REFERENCES properties(id),
        tenancy_start_date DATE,
        tenancy_type TEXT CHECK(tenancy_type IN ('AST', 'HMO', 'Rolling', 'Other', NULL)),
        has_end_date INTEGER DEFAULT 0,
        tenancy_end_date DATE,
        monthly_rent REAL,
        notes TEXT,
        emergency_contact TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TENANCIES
      CREATE TABLE IF NOT EXISTS tenancies (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        tenant_id INTEGER NOT NULL REFERENCES tenants(id),
        start_date DATE NOT NULL,
        end_date DATE,
        rent_amount REAL NOT NULL,
        deposit_amount REAL,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'ended', 'pending')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- RENT PAYMENTS
      CREATE TABLE IF NOT EXISTS rent_payments (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        tenant_id INTEGER REFERENCES tenants(id),
        due_date DATE NOT NULL,
        amount_due REAL NOT NULL,
        amount_paid REAL,
        payment_date DATE,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'late', 'partial')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- MAINTENANCE
      CREATE TABLE IF NOT EXISTS maintenance (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        tenant_id INTEGER REFERENCES tenants(id),
        landlord_id INTEGER REFERENCES landlords(id),
        reporter_name TEXT,
        reporter_email TEXT,
        reporter_phone TEXT,
        reporter_type TEXT CHECK(reporter_type IN ('tenant', 'landlord', 'agent', 'other', NULL)),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT CHECK(category IN ('plumbing', 'electrical', 'heating', 'structural', 'appliance', 'pest', 'garden', 'other', NULL)),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'awaiting_parts', 'completed', 'closed')),
        contractor TEXT,
        contractor_phone TEXT,
        cost REAL,
        resolution_notes TEXT,
        completed_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TASKS
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'archived')),
        assigned_to INTEGER REFERENCES users(id),
        entity_type TEXT CHECK(entity_type IN ('property', 'tenant', 'landlord', 'enquiry', 'maintenance', 'general', NULL)),
        entity_id INTEGER,
        due_date DATE,
        follow_up_date DATE,
        task_type TEXT CHECK(task_type IN ('manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing', 'follow_up', NULL)),
        notes TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- DOCUMENTS
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('landlord', 'landlord_bdm', 'tenant', 'tenant_enquiry', 'property', 'maintenance')),
        entity_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- PROPERTY VIEWINGS
      CREATE TABLE IF NOT EXISTS property_viewings (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        enquiry_id INTEGER REFERENCES tenant_enquiries(id),
        viewer_name TEXT NOT NULL,
        viewer_email TEXT,
        viewer_phone TEXT,
        viewing_date DATE NOT NULL,
        viewing_time TEXT,
        status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
        feedback TEXT,
        interested INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
      CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
      CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(property_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance(property_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
    `);

    // ============ MIGRATIONS ============
    // Safe migrations using DO blocks — idempotent, won't fail if already applied

    // Add new tenant columns
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deposit_scheme TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS authority_to_contact INTEGER DEFAULT 0;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS proof_of_income INTEGER DEFAULT 0;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Update properties status constraint to new values
    await client.query(`
      DO $$ BEGIN
        -- Update existing data to new status values
        UPDATE properties SET status = 'to_let' WHERE status = 'available';
        UPDATE properties SET status = 'full_management' WHERE status = 'maintenance';
        UPDATE properties SET status = 'let_agreed' WHERE status = 'let';
        -- Drop old constraint and add new one
        ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
        ALTER TABLE properties ADD CONSTRAINT properties_status_check
          CHECK(status IN ('to_let', 'let_agreed', 'full_management', 'rent_collection'));
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// Query helper - returns rows
export async function query(sql: string, params: any[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// Get single row
export async function queryOne(sql: string, params: any[] = []) {
  const result = await pool.query(sql, params);
  return result.rows[0];
}

// Insert and return id
export async function insert(sql: string, params: any[] = []) {
  const result = await pool.query(sql + ' RETURNING id', params);
  return result.rows[0]?.id;
}

// Run (update/delete) and return affected count
export async function run(sql: string, params: any[] = []) {
  const result = await pool.query(sql, params);
  return result.rowCount;
}

export default pool;
