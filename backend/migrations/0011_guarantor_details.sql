ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_date_of_birth DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_employment_status TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_employer TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_annual_income NUMERIC;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_primary_id INTEGER DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_secondary_id INTEGER DEFAULT 0;
UPDATE tenants t SET
  nok_name=COALESCE(NULLIF(t.nok_name,''),NULLIF(e.app_form_data->>'next_of_kin_name','')),
  nok_relationship=COALESCE(NULLIF(t.nok_relationship,''),NULLIF(e.app_form_data->>'next_of_kin_relationship','')),
  nok_phone=COALESCE(NULLIF(t.nok_phone,''),NULLIF(e.app_form_data->>'next_of_kin_phone','')),
  nok_email=COALESCE(NULLIF(t.nok_email,''),NULLIF(e.app_form_data->>'next_of_kin_email','')),
  nok_address=COALESCE(NULLIF(t.nok_address,''),NULLIF(e.app_form_data->>'next_of_kin_address','')),
  guarantor_employment_status=COALESCE(t.guarantor_employment_status,NULLIF(e.app_form_data->>'guarantor_employment_status',''))
FROM tenant_enquiries e WHERE e.id=t.source_enquiry_id;
