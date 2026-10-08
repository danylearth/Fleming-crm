ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS guarantor_required BOOLEAN;
CREATE TABLE IF NOT EXISTS guarantor_verifications (
 id SERIAL PRIMARY KEY, enquiry_id INTEGER NOT NULL UNIQUE REFERENCES tenant_enquiries(id),
 name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft', token_hash TEXT UNIQUE, expires_at TIMESTAMPTZ,
 form JSONB NOT NULL DEFAULT '{}', checks JSONB NOT NULL DEFAULT '{}', signature JSONB,
 review_notes TEXT, submitted_at TIMESTAMPTZ, verified_at TIMESTAMPTZ, verified_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS guarantor_verification_files (
 id SERIAL PRIMARY KEY, verification_id INTEGER NOT NULL REFERENCES guarantor_verifications(id),
 category TEXT NOT NULL, filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
 sha256 TEXT NOT NULL, size INTEGER NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending',
 current BOOLEAN NOT NULL DEFAULT TRUE, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guarantor_files_verification ON guarantor_verification_files(verification_id);
