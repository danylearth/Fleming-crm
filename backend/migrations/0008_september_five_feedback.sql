ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_issued_by TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_email TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_phone TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_reference TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasehold_notes TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS has_management_company INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_name TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_email TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_phone TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_reference TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_company_notes TEXT;

ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS is_recurring INTEGER DEFAULT 0;
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS recurrence_frequency TEXT;
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS receipt_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE properties
SET has_management_company = 1
WHERE LOWER(address) LIKE '16 vine close%'
   OR LOWER(address) LIKE '21a northwood park road%'
   OR LOWER(address) LIKE '22a northwood park road%'
   OR LOWER(address) LIKE '3 eclipse house%';

UPDATE tenants
SET status = 'active', has_end_date = 0, tenancy_end_date = NULL, updated_at = CURRENT_TIMESTAMP
WHERE LOWER(name) = 'dawn harker';

UPDATE properties p
SET has_live_tenancy = 1,
    tenant_id = t.id,
    tenancy_type = 'Assured Periodic Tenancy',
    updated_at = CURRENT_TIMESTAMP
FROM tenants t
WHERE LOWER(t.name) = 'dawn harker'
  AND t.property_id = p.id;

UPDATE tenants tenant
SET tenancy_type = 'Assured Periodic Tenancy', updated_at = CURRENT_TIMESTAMP
FROM properties property
JOIN landlords landlord ON landlord.id = property.landlord_id
WHERE tenant.property_id = property.id
  AND landlord.landlord_type = 'internal'
  AND (tenant.tenancy_type IS NULL OR tenant.tenancy_type = 'AST');

UPDATE properties property
SET tenancy_type = 'Assured Periodic Tenancy', updated_at = CURRENT_TIMESTAMP
FROM landlords landlord
WHERE landlord.id = property.landlord_id
  AND landlord.landlord_type = 'internal'
  AND property.has_live_tenancy = 1
  AND (property.tenancy_type IS NULL OR property.tenancy_type = 'AST');

-- Convert the cost figures preserved from the supplied portfolio workbook into
-- reportable expenses. Original notes remain untouched as an audit trail.
WITH parsed AS (
  SELECT id, (regexp_match(notes, 'Purchase price: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS amount
  FROM properties
)
INSERT INTO property_expenses (property_id, description, amount, category, expense_date)
SELECT id, 'Property purchase', REPLACE(amount, ',', '')::NUMERIC, 'property_purchase', NULL
FROM parsed
WHERE amount IS NOT NULL AND REPLACE(amount, ',', '')::NUMERIC > 0
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=parsed.id AND expense.description='Property purchase');

WITH parsed AS (
  SELECT id,
    (regexp_match(notes, 'Purchase price: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS purchase_amount,
    (regexp_match(notes, 'Total purchase price: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS total_amount
  FROM properties
)
INSERT INTO property_expenses (property_id, description, amount, category, expense_date)
SELECT id, 'Purchase costs and fees',
  REPLACE(total_amount, ',', '')::NUMERIC - REPLACE(purchase_amount, ',', '')::NUMERIC,
  'purchase_costs', NULL
FROM parsed
WHERE purchase_amount IS NOT NULL AND total_amount IS NOT NULL
  AND REPLACE(total_amount, ',', '')::NUMERIC > REPLACE(purchase_amount, ',', '')::NUMERIC
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=parsed.id AND expense.description='Purchase costs and fees');

WITH parsed AS (
  SELECT id, (regexp_match(notes, 'Refurbishment cost: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS amount
  FROM properties
)
INSERT INTO property_expenses (property_id, description, amount, category, expense_date)
SELECT id, 'Refurbishment', REPLACE(amount, ',', '')::NUMERIC, 'refurbishment', NULL
FROM parsed
WHERE amount IS NOT NULL AND REPLACE(amount, ',', '')::NUMERIC > 0
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=parsed.id AND expense.description='Refurbishment');

WITH parsed AS (
  SELECT id, (regexp_match(notes, 'Annual service charge: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS amount
  FROM properties
)
INSERT INTO property_expenses (property_id, description, amount, category, expense_date, is_recurring, recurrence_frequency)
SELECT id, 'Annual service charge', REPLACE(amount, ',', '')::NUMERIC, 'service_charge', NULL, 1, 'annually'
FROM parsed
WHERE amount IS NOT NULL AND REPLACE(amount, ',', '')::NUMERIC > 0
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=parsed.id AND expense.description='Annual service charge');

WITH parsed AS (
  SELECT id, (regexp_match(notes, 'Annual ground rent: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS amount
  FROM properties
)
INSERT INTO property_expenses (property_id, description, amount, category, expense_date, is_recurring, recurrence_frequency)
SELECT id, 'Annual ground rent', REPLACE(amount, ',', '')::NUMERIC, 'ground_rent', NULL, 1, 'annually'
FROM parsed
WHERE amount IS NOT NULL AND REPLACE(amount, ',', '')::NUMERIC > 0
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=parsed.id AND expense.description='Annual ground rent');

WITH parsed AS (
  SELECT id, (regexp_match(notes, 'Annual operating costs: £([0-9,]+(?:\.[0-9]{1,2})?)', 'i'))[1] AS amount
  FROM properties
)
INSERT INTO property_expenses (property_id, description, amount, category, expense_date, is_recurring, recurrence_frequency)
SELECT id, 'Annual operating costs', REPLACE(amount, ',', '')::NUMERIC, 'communal_charge', NULL, 1, 'annually'
FROM parsed
WHERE amount IS NOT NULL AND REPLACE(amount, ',', '')::NUMERIC > 0
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=parsed.id AND expense.description='Annual operating costs');

INSERT INTO property_expenses (property_id, description, amount, category, expense_date)
SELECT property.id, 'Property purchase', 75000, 'property_purchase', DATE '2025-02-21'
FROM properties property
WHERE LOWER(property.address) LIKE '4a cavalier circus%'
  AND NOT EXISTS (SELECT 1 FROM property_expenses expense WHERE expense.property_id=property.id AND expense.description='Property purchase');
