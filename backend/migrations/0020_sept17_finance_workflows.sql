ALTER TABLE users ADD COLUMN IF NOT EXISTS finance_access BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET finance_access=TRUE WHERE LOWER(email) IN ('sam@fleminglettings.co.uk','robert@fleminglettings.co.uk');
ALTER TABLE rent_payments ADD COLUMN IF NOT EXISTS opening_balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS maintenance_id INTEGER REFERENCES maintenance(id);
CREATE TABLE bank_feed_allocations (
 id SERIAL PRIMARY KEY, bank_transaction_id INTEGER NOT NULL REFERENCES bank_feed_transactions(id),
 kind TEXT NOT NULL CHECK(kind IN ('rent','deposit','expense','maintenance')),
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 rent_payment_id INTEGER REFERENCES rent_payments(id), tenant_id INTEGER REFERENCES tenants(id),
 property_id INTEGER NOT NULL REFERENCES properties(id), expense_id INTEGER REFERENCES property_expenses(id),
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE finance_daily_runs (business_date DATE PRIMARY KEY, completed_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE rent_chaser_deliveries (
 rent_payment_id INTEGER NOT NULL REFERENCES rent_payments(id), channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
 cycle_date DATE NOT NULL, status TEXT NOT NULL DEFAULT 'sending', error TEXT, provider_id TEXT,
 created_at TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY(rent_payment_id,channel,cycle_date)
);
CREATE TABLE rent_tracking_settings (id INTEGER PRIMARY KEY CHECK(id=1),cutover_date DATE,chasers_enabled BOOLEAN NOT NULL DEFAULT FALSE);
INSERT INTO rent_tracking_settings(id) VALUES(1);
