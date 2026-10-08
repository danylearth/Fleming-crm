-- Dated applications and billing profiles retain the previous joint tenancy
-- when an existing person continues under a new agreement.
CREATE TABLE tenancy_changeovers (
 id SERIAL PRIMARY KEY,
 enquiry_id INTEGER NOT NULL UNIQUE REFERENCES tenant_enquiries(id),
 agreement_id INTEGER NOT NULL UNIQUE REFERENCES tenancy_agreements(id),
 property_id INTEGER NOT NULL REFERENCES properties(id),
 continuing_tenant_ids INTEGER[] NOT NULL,
 previous_tenant_ids INTEGER[] NOT NULL,
 start_date DATE NOT NULL,
 previous_end_date DATE NOT NULL,
 previous_snapshot JSONB NOT NULL,
 next_snapshot JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active')),
 created_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 activated_at TIMESTAMPTZ,
 CHECK(previous_end_date=start_date-1)
);
CREATE INDEX tenancy_changeover_due ON tenancy_changeovers(start_date) WHERE status='scheduled';
CREATE TABLE tenancy_billing_profiles (
 id SERIAL PRIMARY KEY,
 property_id INTEGER NOT NULL REFERENCES properties(id),
 tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 tenant_ids INTEGER[] NOT NULL,
 start_date DATE NOT NULL,
 end_date DATE,
 monthly_rent NUMERIC(12,2) NOT NULL CHECK(monthly_rent>0),
 rent_due_day INTEGER NOT NULL CHECK(rent_due_day BETWEEN 1 AND 31),
 invoice_source JSONB NOT NULL,
 changeover_id INTEGER REFERENCES tenancy_changeovers(id),
 UNIQUE(property_id,tenant_id,start_date),
 CHECK(end_date IS NULL OR end_date>=start_date)
);
ALTER TABLE rent_payments ADD COLUMN tenancy_profile_id INTEGER REFERENCES tenancy_billing_profiles(id);
CREATE INDEX rent_payment_tenancy_profile ON rent_payments(tenancy_profile_id);

ALTER TABLE tenant_enquiries ADD COLUMN existing_tenancy_application BOOLEAN NOT NULL DEFAULT FALSE;
