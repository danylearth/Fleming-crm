ALTER TABLE users ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gas_safety_commissioned_date DATE;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_form_last_saved_at TIMESTAMP;
CREATE TABLE IF NOT EXISTS property_policies (
 id SERIAL PRIMARY KEY,
 policy_type TEXT NOT NULL CHECK(policy_type IN ('rent_protection','buildings')),
 policy_number TEXT,
 annual_cost NUMERIC(12,2) NOT NULL CHECK(annual_cost>=0),
 commencement_date DATE NOT NULL,
 expiry_date DATE NOT NULL CHECK(expiry_date>=commencement_date),
 broker_name TEXT, broker_phone TEXT, broker_email TEXT,
 created_by INTEGER REFERENCES users(id),
 created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS property_policy_allocations (
 policy_id INTEGER NOT NULL REFERENCES property_policies(id) ON DELETE CASCADE,
 property_id INTEGER NOT NULL REFERENCES properties(id),
 allocated_cost NUMERIC(12,2) NOT NULL CHECK(allocated_cost>=0),
 PRIMARY KEY(policy_id,property_id)
);
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS policy_id INTEGER REFERENCES property_policies(id);
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS coverage_start DATE;
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS coverage_end DATE;
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS payee TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS property_expenses_policy_once ON property_expenses(policy_id,property_id) WHERE policy_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ai_action_requests (
 id UUID PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 payload JSONB NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMP NOT NULL DEFAULT NOW()+INTERVAL '30 minutes',
 claimed_at TIMESTAMP
);
ALTER TABLE inventories ADD COLUMN IF NOT EXISTS signed_document BOOLEAN NOT NULL DEFAULT FALSE;
