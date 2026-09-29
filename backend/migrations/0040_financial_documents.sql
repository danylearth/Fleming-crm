CREATE TABLE IF NOT EXISTS financial_documents (
 id BIGSERIAL PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('rent_invoice','landlord_invoice','remittance')),
 source_key TEXT UNIQUE,
 tenant_id INTEGER REFERENCES tenants(id),
 landlord_id INTEGER REFERENCES landlords(id),
 property_id INTEGER REFERENCES properties(id),
 rent_payment_id INTEGER REFERENCES rent_payments(id),
 allocation_id INTEGER REFERENCES bank_feed_allocations(id),
 snapshot JSONB NOT NULL,
 created_by INTEGER REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS financial_documents_tenant ON financial_documents(tenant_id);
CREATE INDEX IF NOT EXISTS financial_documents_landlord ON financial_documents(landlord_id);
