ALTER TABLE tenants ADD COLUMN IF NOT EXISTS security_deposit_amount NUMERIC(10,2);

UPDATE tenants SET tenancy_type = 'Assured Periodic Tenancy'
WHERE tenancy_type IS NULL OR tenancy_type = 'AST';

UPDATE properties SET tenancy_type = 'Assured Periodic Tenancy'
WHERE has_live_tenancy = 1 AND (tenancy_type IS NULL OR tenancy_type = 'AST');

UPDATE tenants t SET security_deposit_amount = COALESCE(
  t.security_deposit_amount,
  NULLIF(ta.agreement_details->>'security_deposit', '')::NUMERIC,
  NULLIF(ta.agreement_details->>'deposit', '')::NUMERIC
)
FROM tenancy_agreements ta
WHERE ta.tenant_id = t.id
  AND ta.status = 'completed'
  AND t.security_deposit_amount IS NULL;
