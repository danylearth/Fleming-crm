ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_portal_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_portal_username TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_portal_password_encrypted TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_portal_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_portal_username TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_portal_password_encrypted TEXT;
