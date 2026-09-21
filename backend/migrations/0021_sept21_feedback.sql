UPDATE rent_tracking_settings SET chasers_enabled=FALSE;
ALTER TABLE bank_feed_allocations DROP CONSTRAINT bank_feed_allocations_kind_check;
ALTER TABLE bank_feed_allocations ADD CONSTRAINT bank_feed_allocations_kind_check CHECK(kind IN ('rent','deposit','holding_deposit','expense','maintenance','financial','income'));
ALTER TABLE bank_feed_allocations ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE bank_feed_allocations ADD COLUMN category TEXT;
ALTER TABLE bank_feed_allocations ADD COLUMN notes TEXT;
ALTER TABLE bank_feed_allocations ADD COLUMN reversed_at TIMESTAMP;
ALTER TABLE rent_payments ADD COLUMN bank_base_paid NUMERIC(12,2);
ALTER TABLE rent_payments ADD COLUMN bank_base_opening NUMERIC(12,2);
ALTER TABLE rent_payments ADD COLUMN bank_base_date DATE;
-- Existing bank allocations replaced opening balances in the original release.
UPDATE rent_payments r SET bank_base_paid=r.amount_paid,bank_base_opening=r.opening_balance_amount+(SELECT SUM(a.amount) FROM bank_feed_allocations a WHERE a.rent_payment_id=r.id),bank_base_date=NULL
WHERE EXISTS(SELECT 1 FROM bank_feed_allocations a WHERE a.rent_payment_id=r.id);
ALTER TABLE marketing_campaigns ADD COLUMN message_format TEXT NOT NULL DEFAULT 'text' CHECK(message_format IN ('text','html'));
CREATE TABLE marketing_recipient_links (
 recipient_id INTEGER NOT NULL REFERENCES marketing_recipients(id),entity_type TEXT NOT NULL,entity_id INTEGER NOT NULL,
 PRIMARY KEY(recipient_id,entity_type,entity_id)
);
INSERT INTO marketing_recipient_links SELECT id,entity_type,entity_id FROM marketing_recipients;
-- Office instruction applies to existing email records; explicit prior opt-outs are retained.
INSERT INTO marketing_permissions(channel,destination,allowed,evidence,unsubscribe_token)
SELECT 'email',email,TRUE,'Office instruction in feedback dated 21 September 2026: existing records opted in to email marketing',gen_random_uuid()
FROM (SELECT DISTINCT lower(trim(email)) email FROM (
 SELECT email FROM tenants UNION ALL SELECT email FROM landlords UNION ALL SELECT email FROM landlords_bdm UNION ALL SELECT email_1 FROM tenant_enquiries
) contacts WHERE email LIKE '%@%.%') emails
ON CONFLICT(channel,destination) DO NOTHING;
ALTER TABLE landlords_bdm ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE landlords_bdm ADD COLUMN IF NOT EXISTS company_number TEXT;
-- A contractual payment day can precede the tenancy anniversary (e.g. the 5th for a tenancy starting on the 6th).
ALTER TABLE tenants ADD COLUMN rent_due_day INTEGER CHECK(rent_due_day BETWEEN 1 AND 31);
ALTER TABLE documents DROP CONSTRAINT documents_entity_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_entity_type_check CHECK(entity_type IN ('landlord','landlord_bdm','tenant','tenant_enquiry','property','maintenance','task','bank_transaction'));

CREATE UNIQUE INDEX tasks_inventory_tenancy_unique ON tasks(entity_id,due_date) WHERE task_type='inventory_due' AND entity_type='tenant';
CREATE UNIQUE INDEX tasks_active_insurance_unique ON tasks(entity_id) WHERE task_type='insurance_renewal' AND entity_type='property' AND status IN ('pending','in_progress');

UPDATE landlords_bdm SET entity_type='company',company_number=COALESCE(company_number,intake_data->>'company_number') WHERE intake_data->>'registration_type'='Limited Company';
