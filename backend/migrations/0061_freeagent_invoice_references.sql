ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS freeagent_invoice_reference TEXT;
ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS freeagent_invoice_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS rent_freeagent_invoice_url ON rent_payments(freeagent_invoice_url) WHERE freeagent_invoice_url IS NOT NULL;
