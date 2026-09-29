ALTER TABLE properties ADD COLUMN IF NOT EXISTS service_setup_fee NUMERIC(7,4) CHECK (service_setup_fee BETWEEN 0 AND 100);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS service_monthly_fee NUMERIC(7,4) CHECK (service_monthly_fee BETWEEN 0 AND 100);
UPDATE properties p SET service_setup_fee=a.setup_fee,service_monthly_fee=a.monthly_fee
FROM (SELECT DISTINCT ON (property_id) property_id,landlord_id,service_type,setup_fee,monthly_fee FROM landlord_service_agreements WHERE status<>'void' ORDER BY property_id,id DESC) a
WHERE p.id=a.property_id AND p.landlord_id=a.landlord_id AND p.service_type=a.service_type AND p.service_setup_fee IS NULL;
UPDATE properties SET service_setup_fee=charge_percentage,service_monthly_fee=0 WHERE service_type='let_only' AND service_setup_fee IS NULL AND charge_percentage BETWEEN 0 AND 100;
UPDATE properties SET service_monthly_fee=charge_percentage WHERE service_type IN ('rent_collection','full_management') AND service_monthly_fee IS NULL AND charge_percentage BETWEEN 0 AND 100;
