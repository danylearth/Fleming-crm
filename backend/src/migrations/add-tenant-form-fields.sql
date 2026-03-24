-- Add missing fields for tenant enquiry form
-- Run date: 2026-03-24

-- Add address/location fields for applicant 1
ALTER TABLE tenant_enquiries ADD COLUMN postcode_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN years_at_address_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN nationality_1 TEXT;

-- Add employment fields for applicant 1
ALTER TABLE tenant_enquiries ADD COLUMN job_title_1 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN annual_salary_1 REAL;

-- Add address/location fields for applicant 2
ALTER TABLE tenant_enquiries ADD COLUMN postcode_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN years_at_address_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN nationality_2 TEXT;

-- Add employment fields for applicant 2
ALTER TABLE tenant_enquiries ADD COLUMN job_title_2 TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN annual_salary_2 REAL;

-- Add property requirement fields
ALTER TABLE tenant_enquiries ADD COLUMN preferred_tenancy_type TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN reason_for_renting TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN property_type TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN bedrooms INTEGER;
ALTER TABLE tenant_enquiries ADD COLUMN parking_required TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN monthly_rent_budget REAL;

-- Add metadata fields
ALTER TABLE tenant_enquiries ADD COLUMN form_submission_ip TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN form_version TEXT;
