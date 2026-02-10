import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize tables
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
        alt_email TEXT,
        date_of_birth DATE,
        home_address TEXT,
        marketing_post INTEGER DEFAULT 0,
        marketing_email INTEGER DEFAULT 0,
        marketing_phone INTEGER DEFAULT 0,
        marketing_sms INTEGER DEFAULT 0,
        kyc_completed INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- LANDLORDS BDM
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
        email_1 TEXT,
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
        status TEXT DEFAULT 'new',
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
        rent_amount REAL NOT NULL,
        status TEXT DEFAULT 'available' CHECK(status IN ('available', 'let', 'maintenance')),
        is_leasehold INTEGER DEFAULT 0,
        leasehold_start_date DATE,
        leasehold_end_date DATE,
        leaseholder_info TEXT,
        proof_of_ownership_received INTEGER DEFAULT 0,
        council_tax_band TEXT,
        service_type TEXT,
        charge_percentage REAL,
        total_charge REAL,
        has_live_tenancy INTEGER DEFAULT 0,
        tenancy_start_date DATE,
        tenancy_type TEXT,
        has_end_date INTEGER DEFAULT 0,
        tenancy_end_date DATE,
        rent_review_date DATE,
        eicr_expiry_date DATE,
        epc_grade TEXT,
        epc_expiry_date DATE,
        has_gas INTEGER DEFAULT 1,
        gas_safety_expiry_date DATE,
        onboarded_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TENANTS
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        title_1 TEXT,
        first_name_1 TEXT,
        last_name_1 TEXT,
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
        tenancy_type TEXT,
        has_end_date INTEGER DEFAULT 0,
        tenancy_end_date DATE,
        monthly_rent REAL,
        emergency_contact TEXT,
        notes TEXT,
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
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'ended', 'terminated')),
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
        reporter_type TEXT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
        status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'cancelled')),
        contractor TEXT,
        contractor_phone TEXT,
        cost REAL,
        resolution_notes TEXT,
        notes TEXT,
        completed_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TASKS
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        assigned_to INTEGER REFERENCES users(id),
        entity_type TEXT,
        entity_id INTEGER,
        due_date DATE,
        follow_up_date DATE,
        task_type TEXT DEFAULT 'manual',
        notes TEXT,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TRANSACTIONS
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        tenancy_id INTEGER NOT NULL REFERENCES tenancies(id),
        type TEXT NOT NULL CHECK(type IN ('payment', 'expense', 'adjustment')),
        amount REAL NOT NULL,
        description TEXT,
        date DATE NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- PROPERTY VIEWINGS
      CREATE TABLE IF NOT EXISTS property_viewings (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        enquiry_id INTEGER REFERENCES tenant_enquiries(id),
        viewer_name TEXT,
        viewer_email TEXT,
        viewer_phone TEXT,
        viewing_date DATE,
        viewing_time TEXT,
        status TEXT DEFAULT 'scheduled',
        feedback TEXT,
        interested INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- DOCUMENTS
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
      CREATE INDEX IF NOT EXISTS idx_tenants_property ON tenants(property_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_property ON maintenance(property_id);
    `);
    console.log('Database initialized');
  } finally {
    client.release();
  }
}

export default pool;
