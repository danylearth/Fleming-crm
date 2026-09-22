ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS source_tenant_id INTEGER REFERENCES tenants(id);
CREATE INDEX IF NOT EXISTS tenant_enquiries_source_tenant ON tenant_enquiries(source_tenant_id);
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS from_email TEXT;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS attachment_ids JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS marketing_files (
 id SERIAL PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('image','attachment')),filename TEXT NOT NULL,original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(kind,filename,original_name)
);
