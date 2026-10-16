-- A Rentro landlord's portfolio: self-managed properties, their claimed role on each, and the ownership
-- evidence staff verify before tenants can be linked or a home marketed.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS occupancy TEXT;
DO $$ BEGIN
  ALTER TABLE properties ADD CONSTRAINT properties_occupancy_check CHECK (occupancy IN ('occupied','vacant','preparing'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rentro_property_claims (
 id BIGSERIAL PRIMARY KEY,
 -- NULL when the address matched an existing property: nothing is attached until staff decide.
 property_id INTEGER REFERENCES properties(id),
 duplicate_of_property_id INTEGER REFERENCES properties(id),
 landlord_id INTEGER NOT NULL REFERENCES landlords(id),
 account_id UUID NOT NULL REFERENCES customer_accounts(id),
 claimed_role TEXT NOT NULL CHECK (claimed_role IN ('owner','joint_owner','company_director','authorised_agent')),
 authority_status TEXT NOT NULL DEFAULT 'unverified' CHECK (authority_status IN ('unverified','submitted','verified','rejected')),
 evidence_document_id INTEGER REFERENCES documents(id),
 submitted_address JSONB NOT NULL,
 reviewed_by INTEGER REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 review_notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (property_id IS NOT NULL OR duplicate_of_property_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS rentro_property_claims_property ON rentro_property_claims(property_id, landlord_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rentro_property_claims_review ON rentro_property_claims(authority_status) WHERE authority_status IN ('submitted','unverified');

-- Customer-facing documents. NULL visibility means the rule-based default in rentro-scope.ts;
-- origin keeps imported history apart from activity recorded in Rentro.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS customer_visibility TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'crm';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by_account UUID REFERENCES customer_accounts(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS claimed_expiry_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS check_outcome TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'local';
DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_customer_visibility_check CHECK (customer_visibility IN ('staff','landlord','landlord_tenant'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_origin_check CHECK (origin IN ('crm','rentro_upload','rentro_import'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_check_outcome_check CHECK (check_outcome IN ('satisfactory','unsatisfactory'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_storage_backend_check CHECK (storage_backend IN ('local','supabase'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
