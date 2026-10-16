-- Rentro customer accounts. Identities, passwords, email verification and sessions live in Supabase Auth;
-- the CRM keeps the account under the same id and decides which records it may see (customer_roles).
CREATE TABLE IF NOT EXISTS customer_accounts (
 id UUID PRIMARY KEY,
 email TEXT NOT NULL,
 name TEXT NOT NULL,
 phone TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
 terms_version TEXT NOT NULL,
 terms_accepted_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_email ON customer_accounts(lower(email));

-- What an account is to the CRM. A landlord whose email matches an existing CRM landlord waits as
-- pending_link until staff connect them; Rentro never links itself to an existing record.
CREATE TABLE IF NOT EXISTS customer_roles (
 id BIGSERIAL PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES customer_accounts(id),
 role TEXT NOT NULL CHECK (role IN ('landlord','tenant','applicant')),
 landlord_id INTEGER REFERENCES landlords(id),
 tenant_id INTEGER REFERENCES tenants(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_link','revoked')),
 granted_via TEXT NOT NULL CHECK (granted_via IN ('signup','invitation','staff')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_at TIMESTAMPTZ,
 revoked_by INTEGER REFERENCES users(id),
 CHECK (
   (role = 'landlord' AND tenant_id IS NULL AND (landlord_id IS NOT NULL OR status <> 'active'))
   OR (role = 'tenant' AND landlord_id IS NULL AND (tenant_id IS NOT NULL OR status <> 'active'))
   OR (role = 'applicant' AND landlord_id IS NULL AND tenant_id IS NULL)
 )
);
CREATE INDEX IF NOT EXISTS customer_roles_account ON customer_roles(account_id) WHERE status <> 'revoked';
CREATE UNIQUE INDEX IF NOT EXISTS customer_roles_one_account_per_landlord ON customer_roles(landlord_id) WHERE role = 'landlord' AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS customer_roles_one_open_role ON customer_roles(account_id, role) WHERE status <> 'revoked' AND role IN ('landlord','applicant');

CREATE TABLE IF NOT EXISTS rentro_pilot_allowlist (
 email TEXT PRIMARY KEY CHECK (email = lower(email)),
 note TEXT,
 added_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_notification_prefs (
 account_id UUID PRIMARY KEY REFERENCES customer_accounts(id),
 email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 lead_days INTEGER[] NOT NULL DEFAULT '{60,30,14,7}',
 overdue_repeat_days INTEGER NOT NULL DEFAULT 7 CHECK (overdue_repeat_days BETWEEN 1 AND 30)
);

ALTER TABLE landlords ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm';
DO $$ BEGIN
  ALTER TABLE landlords ADD CONSTRAINT landlords_source_check CHECK (source IN ('crm','rentro'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS customer_account_id UUID;
CREATE INDEX IF NOT EXISTS audit_log_customer_account ON audit_log(customer_account_id) WHERE customer_account_id IS NOT NULL;
