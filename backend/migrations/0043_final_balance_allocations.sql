ALTER TABLE bank_feed_allocations DROP CONSTRAINT bank_feed_allocations_kind_check;
ALTER TABLE bank_feed_allocations ADD CONSTRAINT bank_feed_allocations_kind_check CHECK(kind IN ('rent','deposit','holding_deposit','final_balance','expense','maintenance','financial','income'));
ALTER TABLE tenant_enquiries ADD COLUMN balance_bank_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN balance_bank_date DATE;
ALTER TABLE tenant_enquiries ADD COLUMN balance_manual_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN balance_manual_date DATE;
UPDATE tenant_enquiries SET balance_manual_amount=COALESCE(balance_due_amount,0),balance_manual_date=balance_payment_received_at::date WHERE balance_payment_received=1;
