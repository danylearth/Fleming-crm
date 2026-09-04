ALTER TABLE tenants ADD COLUMN IF NOT EXISTS current_address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS previous_address TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_form_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_enquiries_application_form_slug
  ON tenant_enquiries(application_form_slug) WHERE application_form_slug IS NOT NULL;

UPDATE tenants SET
  kyc_primary_id = 1,
  kyc_secondary_id = 1,
  kyc_address_verification = 1,
  kyc_personal_verification = 1
WHERE kyc_completed_1 = 1;

UPDATE tenants t SET
  current_address = COALESCE(t.current_address, te.current_address_1),
  previous_address = COALESCE(t.previous_address, te.app_previous_address_1),
  application_forms_completed = CASE WHEN te.application_form_completed = 1 THEN 1 ELSE t.application_forms_completed END,
  authority_to_contact = CASE WHEN te.app_declaration_agreed = 1 THEN 1 ELSE t.authority_to_contact END,
  proof_of_income = CASE WHEN te.income_1 IS NOT NULL THEN 1 ELSE t.proof_of_income END,
  income_amount = COALESCE(t.income_amount, te.income_1::TEXT),
  income_employer = COALESCE(t.income_employer, te.employer_1),
  income_contract_type = COALESCE(t.income_contract_type, te.contract_type_1),
  income_frequency = CASE WHEN te.income_1 IS NOT NULL THEN 'annual' ELSE t.income_frequency END
FROM tenant_enquiries te
WHERE LOWER(t.email) = LOWER(te.email_1) AND te.status = 'converted';

UPDATE properties SET has_gas = 0, gas_safety_expiry_date = NULL, updated_at = NOW()
WHERE LOWER(TRIM(address)) IN (
  '25 wealden hatch', '29 wealden hatch', '4a cavalier circus', '2a cavalier circus'
);
