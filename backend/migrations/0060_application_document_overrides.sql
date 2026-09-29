ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_document_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
