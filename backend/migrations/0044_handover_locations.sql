ALTER TABLE departments ADD COLUMN office_address TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_enquiries ADD COLUMN handover_location_type TEXT NOT NULL DEFAULT 'property';
ALTER TABLE tenant_enquiries ADD COLUMN handover_location_address TEXT;
