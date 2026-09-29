ALTER TABLE tenant_enquiries ADD COLUMN holding_deposit_manual_amount NUMERIC(12,2);
ALTER TABLE tenant_enquiries ADD COLUMN holding_deposit_manual_date TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN holding_deposit_bank_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN holding_deposit_bank_date TEXT;
ALTER TABLE tenant_enquiries ADD COLUMN deposit_application_ready_at TIMESTAMPTZ;
UPDATE tenant_enquiries SET holding_deposit_manual_amount=COALESCE(holding_deposit_received_amount,holding_deposit_amount,0),holding_deposit_manual_date=holding_deposit_received_date WHERE holding_deposit_received=1;
