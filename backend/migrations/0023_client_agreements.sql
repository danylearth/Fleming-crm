CREATE TABLE landlord_bank_details (
 landlord_id INTEGER PRIMARY KEY REFERENCES landlords(id) ON DELETE CASCADE,
 account_name TEXT NOT NULL DEFAULT '',
 sort_code TEXT NOT NULL DEFAULT '',
 account_number TEXT NOT NULL DEFAULT '',
 bank_name TEXT NOT NULL DEFAULT '',
 approved_at TIMESTAMPTZ,
 approved_by INTEGER REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tenant_enquiries ADD COLUMN client_agreement_details JSONB;
