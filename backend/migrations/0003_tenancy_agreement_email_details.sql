ALTER TABLE tenancy_agreements
ADD COLUMN IF NOT EXISTS agreement_details JSONB NOT NULL DEFAULT '{}'::jsonb;
