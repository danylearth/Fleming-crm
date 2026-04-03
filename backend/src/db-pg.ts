import { Pool } from 'pg';
import { runInventoryMigration } from './db-inventory-migration';

// Use DATABASE_URL from environment (Railway/Render provides this)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
        role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'manager', 'staff', 'viewer')),
        department TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        last_password_change TIMESTAMP
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
        address TEXT,
        company_number TEXT,
        entity_type TEXT DEFAULT 'individual' CHECK(entity_type IN ('individual', 'company', 'trust')),
        marketing_post INTEGER DEFAULT 0,
        marketing_email INTEGER DEFAULT 0,
        marketing_phone INTEGER DEFAULT 0,
        marketing_sms INTEGER DEFAULT 0,
        kyc_completed INTEGER DEFAULT 0,
        landlord_type TEXT DEFAULT 'external' CHECK(landlord_type IN ('internal', 'external')),
        referral_source TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- DIRECTORS (Company Directors/Contact Persons)
      CREATE TABLE IF NOT EXISTS directors (
        id SERIAL PRIMARY KEY,
        landlord_id INTEGER NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        date_of_birth DATE,
        role TEXT,
        kyc_completed INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_directors_landlord ON directors(landlord_id);
      CREATE INDEX IF NOT EXISTS idx_directors_name ON directors(name);

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
        viewing_with TEXT,
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
        status TEXT DEFAULT 'to_let' CHECK(status IN ('to_let', 'available', 'let', 'maintenance')),
        onboarded_date DATE,
        notes TEXT,
        amenities TEXT,
        tenant_id INTEGER,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- PROPERTY LANDLORDS (Many-to-Many Junction Table)
      CREATE TABLE IF NOT EXISTS property_landlords (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        landlord_id INTEGER NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
        is_primary INTEGER DEFAULT 0,
        ownership_percentage REAL,
        ownership_entity_type TEXT DEFAULT 'individual' CHECK(ownership_entity_type IN ('individual', 'company')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(property_id, landlord_id)
      );

      CREATE INDEX IF NOT EXISTS idx_property_landlords_property ON property_landlords(property_id);
      CREATE INDEX IF NOT EXISTS idx_property_landlords_landlord ON property_landlords(landlord_id);

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
        nok_address TEXT,
        nok_2_name TEXT,
        nok_2_relationship TEXT,
        nok_2_phone TEXT,
        nok_2_email TEXT,
        nok_2_address TEXT,
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
        assigned_to TEXT,
        entity_type TEXT CHECK(entity_type IN ('property', 'tenant', 'landlord', 'enquiry', 'tenant_enquiry', 'landlord_bdm', 'maintenance', 'general', NULL)),
        entity_id INTEGER,
        due_date DATE,
        follow_up_date DATE,
        task_type TEXT CHECK(task_type IN ('manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing', 'follow_up', 'viewing', NULL)),
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
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        applicant_number INTEGER DEFAULT 1
      );

      -- PROPERTY EXPENSES
      CREATE TABLE IF NOT EXISTS property_expenses (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id),
        description TEXT NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        expense_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- TRANSACTIONS
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        tenancy_id INTEGER NOT NULL REFERENCES tenancies(id),
        type TEXT NOT NULL CHECK(type IN ('rent_due', 'payment', 'deposit', 'fee', 'refund')),
        amount NUMERIC(10,2) NOT NULL,
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

      -- SMS MESSAGES
      CREATE TABLE IF NOT EXISTS sms_messages (
        id SERIAL PRIMARY KEY,
        enquiry_id INTEGER REFERENCES tenant_enquiries(id),
        to_phone TEXT NOT NULL,
        from_phone TEXT,
        message_body TEXT NOT NULL,
        direction TEXT DEFAULT 'outbound',
        status TEXT DEFAULT 'queued',
        twilio_sid TEXT,
        error_message TEXT,
        sent_by INTEGER REFERENCES users(id),
        sent_by_email TEXT,
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
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nok_address TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nok_2_name TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nok_2_relationship TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nok_2_phone TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nok_2_email TEXT;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nok_2_address TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Sprint 5: Onboarding & application form fields
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS holding_deposit_requested INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS holding_deposit_received INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS holding_deposit_amount REAL;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS security_deposit_amount REAL;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS monthly_rent_agreed REAL;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_form_token TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_form_sent INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_form_completed INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS onboarding_email_sent_at TIMESTAMP;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_ni_number TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_previous_address_1 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_previous_address_2 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_years_at_current INTEGER;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_years_at_previous INTEGER;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_landlord_ref_name TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_landlord_ref_phone TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_landlord_ref_email TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_ref_name TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_ref_phone TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_ref_email TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_bank_name TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_bank_sort_code TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_bank_account_number TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_name TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_phone TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_relationship TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_address TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_2_name TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_2_phone TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_2_relationship TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_next_of_kin_2_address TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_signature TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_signed_at TIMESTAMP;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_declaration_agreed INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS holding_deposit_received_date TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS holding_deposit_received_amount REAL;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS id_primary_verified_1 INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS id_secondary_verified_1 INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS id_primary_verified_2 INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS id_secondary_verified_2 INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS bank_statements_received INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS source_of_funds_verified INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS employment_check_completed INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_address TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_contact TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_years_of_service TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_pay_frequency TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_other_income REAL;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_tax_years TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS credit_check_completed INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS credit_score TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS credit_check_date TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_has_employer_ref INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_ref_employee_id TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_employer_ref_consent INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_has_landlord_ref INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_landlord_ref_property_address TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_landlord_ref_consent INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_further_info TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_holding_deposit INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_info_accurate INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_gdpr INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_enquiries INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_documents INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_credit_check INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_terms INTEGER DEFAULT 0;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS app_decl_marketing INTEGER DEFAULT 0;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Sprint 4: Add assigned_to to property_viewings
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE property_viewings ADD COLUMN IF NOT EXISTS assigned_to TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Sprint 6: Add applicant_number to documents for joint applicant support
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE documents ADD COLUMN IF NOT EXISTS applicant_number INTEGER DEFAULT 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    console.log('Database initialized');

    // Migrate existing property landlord relationships
    const migrateResult = await client.query(`
      SELECT COUNT(*) as count FROM property_landlords
    `);
    if (parseInt(migrateResult.rows[0].count) === 0) {
      console.log('[Migration] Migrating existing property landlord relationships...');
      await client.query(`
        INSERT INTO property_landlords (property_id, landlord_id, is_primary, ownership_entity_type)
        SELECT id, landlord_id, 1, 'individual'
        FROM properties
        WHERE landlord_id IS NOT NULL
        ON CONFLICT (property_id, landlord_id) DO NOTHING
      `);
      const countResult = await client.query(`SELECT COUNT(*) as count FROM property_landlords`);
      console.log(`[Migration] Migrated ${countResult.rows[0].count} property-landlord relationships.`);
    }

    // Add ownership_entity_type column if it doesn't exist
    const columnCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'property_landlords' AND column_name = 'ownership_entity_type'
    `);
    if (columnCheck.rows.length === 0) {
      console.log('[Migration] Adding ownership_entity_type column to property_landlords...');
      await client.query(`
        ALTER TABLE property_landlords
        ADD COLUMN ownership_entity_type TEXT DEFAULT 'individual'
        CHECK(ownership_entity_type IN ('individual', 'company'))
      `);
      console.log('[Migration] ownership_entity_type column added successfully.');
    }

    // Add company_number column to landlords table if it doesn't exist
    const companyNumberCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'landlords' AND column_name = 'company_number'
    `);
    if (companyNumberCheck.rows.length === 0) {
      console.log('[Migration] Adding company_number column to landlords...');
      await client.query(`ALTER TABLE landlords ADD COLUMN company_number TEXT`);

      // Extract company numbers from notes
      const landlordsWithCompanyInNotes = await client.query(`
        SELECT id, notes FROM landlords WHERE notes LIKE '%Company Number:%'
      `);

      for (const landlord of landlordsWithCompanyInNotes.rows) {
        const match = landlord.notes.match(/Company Number:\s*([^\n]+)/i);
        if (match) {
          const companyNumber = match[1].trim();
          await client.query('UPDATE landlords SET company_number = $1 WHERE id = $2', [companyNumber, landlord.id]);

          // Clean the company number from notes
          const cleanedNotes = landlord.notes.replace(/Company Number:\s*[^\n]+\n?/i, '').trim();
          await client.query('UPDATE landlords SET notes = $1 WHERE id = $2', [cleanedNotes || null, landlord.id]);
        }
      }

      console.log(`[Migration] Extracted company numbers from ${landlordsWithCompanyInNotes.rows.length} landlord notes.`);
    }

    // Add tenant_id and image_url columns to properties table
    const tenantIdCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'properties' AND column_name = 'tenant_id'
    `);
    if (tenantIdCheck.rows.length === 0) {
      console.log('[Migration] Adding tenant_id column to properties...');
      await client.query(`ALTER TABLE properties ADD COLUMN tenant_id INTEGER REFERENCES tenants(id)`);
      console.log('[Migration] tenant_id column added successfully.');
    }

    const imageUrlCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'properties' AND column_name = 'image_url'
    `);
    if (imageUrlCheck.rows.length === 0) {
      console.log('[Migration] Adding image_url column to properties...');
      await client.query(`ALTER TABLE properties ADD COLUMN image_url TEXT`);
      console.log('[Migration] image_url column added successfully.');
    }

    // Fix properties status CHECK constraint to include 'to_let'
    try {
      console.log('[Migration] Updating properties status constraint to include "to_let"...');
      await client.query(`ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check`);
      await client.query(`
        ALTER TABLE properties
        ADD CONSTRAINT properties_status_check
        CHECK (status IN ('to_let', 'available', 'let', 'maintenance'))
      `);
      await client.query(`ALTER TABLE properties ALTER COLUMN status SET DEFAULT 'to_let'`);
      console.log('[Migration] Properties status constraint updated successfully.');
    } catch (err) {
      console.log('[Migration] Status constraint may already be updated:', err);
    }

    // Add missing columns to landlords table
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS alt_email TEXT;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS date_of_birth DATE;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS home_address TEXT;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'individual';
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS marketing_post INTEGER DEFAULT 0;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS marketing_email INTEGER DEFAULT 0;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS marketing_phone INTEGER DEFAULT 0;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS marketing_sms INTEGER DEFAULT 0;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS kyc_completed INTEGER DEFAULT 0;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS landlord_type TEXT DEFAULT 'external';
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS referral_source TEXT;
        ALTER TABLE landlords ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Add viewing_with column to tenant_enquiries if missing
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS viewing_with TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Add new form fields to tenant_enquiries
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS nationality_1 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS postcode_1 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS years_at_address_1 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS contract_type_1 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS nationality_2 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS contract_type_2 TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS preferred_tenancy_type TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS preferred_property_type TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS preferred_bedrooms TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS preferred_parking TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS max_rent REAL;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS marketing_preferences TEXT;
        ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS joint_partner_id INTEGER REFERENCES tenant_enquiries(id);
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Migrate existing joint records: split _2 fields into separate linked enquiry records
    await client.query(`
      DO $$
      DECLARE
        rec RECORD;
        new_id INTEGER;
      BEGIN
        FOR rec IN
          SELECT * FROM tenant_enquiries
          WHERE is_joint_application = 1
            AND first_name_2 IS NOT NULL
            AND first_name_2 != ''
            AND joint_partner_id IS NULL
        LOOP
          INSERT INTO tenant_enquiries (
            title_1, first_name_1, last_name_1, email_1, phone_1, date_of_birth_1,
            current_address_1, employment_status_1, employer_1, income_1,
            nationality_1, contract_type_1,
            kyc_completed_1, id_primary_verified_1, id_secondary_verified_1,
            is_joint_application, joint_partner_id,
            linked_property_id, status, follow_up_date, viewing_date, viewing_with,
            notes, rejection_reason, source,
            holding_deposit_requested, holding_deposit_received, holding_deposit_amount,
            security_deposit_amount, monthly_rent_agreed,
            preferred_tenancy_type, preferred_property_type, preferred_bedrooms,
            preferred_parking, max_rent,
            created_at, updated_at
          ) VALUES (
            rec.title_2, rec.first_name_2, rec.last_name_2, rec.email_2, rec.phone_2, rec.date_of_birth_2,
            rec.current_address_2, rec.employment_status_2, rec.employer_2, rec.income_2,
            rec.nationality_2, rec.contract_type_2,
            rec.kyc_completed_2, rec.id_primary_verified_2, rec.id_secondary_verified_2,
            1, rec.id,
            rec.linked_property_id, rec.status, rec.follow_up_date, rec.viewing_date, rec.viewing_with,
            rec.notes, rec.rejection_reason, rec.source,
            rec.holding_deposit_requested, rec.holding_deposit_received, rec.holding_deposit_amount,
            rec.security_deposit_amount, rec.monthly_rent_agreed,
            rec.preferred_tenancy_type, rec.preferred_property_type, rec.preferred_bedrooms,
            rec.preferred_parking, rec.max_rent,
            rec.created_at, CURRENT_TIMESTAMP
          ) RETURNING id INTO new_id;

          UPDATE tenant_enquiries SET joint_partner_id = new_id WHERE id = rec.id;
        END LOOP;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Add archived column to directors if missing
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE directors ADD COLUMN IF NOT EXISTS archived INTEGER DEFAULT 0;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Fix tasks table: drop FK on assigned_to, change to TEXT, fix CHECK constraints
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
        ALTER TABLE tasks ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::TEXT;
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    await client.query(`
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_entity_type_check;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD CONSTRAINT tasks_entity_type_check CHECK(entity_type IN ('property', 'tenant', 'landlord', 'enquiry', 'tenant_enquiry', 'landlord_bdm', 'maintenance', 'general', NULL));
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);
    await client.query(`
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
    `);
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check CHECK(task_type IN ('manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing', 'follow_up', 'viewing', NULL));
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$;
    `);

    // Fix audit_log action CHECK constraint to include all actions
    await client.query(`
      ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
    `);

    // Run inventory migration
    await runInventoryMigration(pool);
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
