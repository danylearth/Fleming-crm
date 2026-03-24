-- Migration: Add complete tenant enquiry form fields
-- This extends the tenant_enquiries table to match the Fleming Lettings website form

-- Add all missing fields for Applicant 1
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS postcode_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS years_at_address_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS nationality_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS industry_of_employment_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS job_title_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS years_in_employment_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS annual_salary_1 REAL;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS position_type_1 TEXT; -- contract/fixed/temp/permanent
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS provide_employment_info_1 INTEGER DEFAULT 1;

-- Add missing fields for Applicant 2
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS postcode_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS years_at_address_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS nationality_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS industry_of_employment_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS job_title_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS years_in_employment_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS annual_salary_2 REAL;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS position_type_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS provide_employment_info_2 INTEGER DEFAULT 1;

-- Property Requirements
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS preferred_location TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS bedrooms INTEGER;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS monthly_rent_budget REAL;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS move_in_date DATE;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS property_type TEXT; -- JSON array: house, flat, studio, bungalow
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS has_pets INTEGER DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS pet_details TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS additional_requirements TEXT;

-- Additional Information
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS referral_source TEXT; -- How did you hear about us
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS comments TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS gdpr_consent INTEGER DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS marketing_consent INTEGER DEFAULT 0;

-- Form metadata
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS form_submission_ip TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS form_submission_user_agent TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS form_version TEXT DEFAULT 'v1';

-- Create index for faster searches
CREATE INDEX IF NOT EXISTS idx_tenant_enquiries_move_in_date ON tenant_enquiries(move_in_date);
CREATE INDEX IF NOT EXISTS idx_tenant_enquiries_bedrooms ON tenant_enquiries(bedrooms);
CREATE INDEX IF NOT EXISTS idx_tenant_enquiries_budget ON tenant_enquiries(monthly_rent_budget);
CREATE INDEX IF NOT EXISTS idx_tenant_enquiries_created ON tenant_enquiries(created_at);
