CREATE TABLE landlord_service_agreements (
 id SERIAL PRIMARY KEY, property_id INTEGER NOT NULL REFERENCES properties(id), landlord_id INTEGER NOT NULL REFERENCES landlords(id),
 service_type TEXT NOT NULL CHECK(service_type IN ('let_only','rent_collection','full_management')),
 setup_fee NUMERIC(6,2) NOT NULL CHECK(setup_fee BETWEEN 0 AND 100), monthly_fee NUMERIC(6,2) NOT NULL CHECK(monthly_fee BETWEEN 0 AND 100),
 payment_route TEXT NOT NULL CHECK(payment_route IN ('landlord','fleming_client_money')),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','signed','void')),
 token TEXT NOT NULL UNIQUE, details JSONB NOT NULL, bank_details JSONB NOT NULL,
 filename TEXT NOT NULL, source_filename TEXT, signed_filename TEXT, issued_at TIMESTAMPTZ, signed_at TIMESTAMPTZ, signer_name TEXT,
 signature TEXT, signature_ip TEXT, signature_user_agent TEXT, bank_changed BOOLEAN NOT NULL DEFAULT FALSE,
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_sent_at TIMESTAMPTZ,
 delivery_status TEXT, delivery_error TEXT
);
CREATE UNIQUE INDEX one_current_service_agreement ON landlord_service_agreements(property_id) WHERE status IN ('draft','issued','signed');
ALTER TABLE landlord_bank_details ADD COLUMN landlord_approved_at TIMESTAMPTZ;
ALTER TABLE landlord_bank_details ADD COLUMN landlord_approved_name TEXT;
CREATE TABLE ons_rent_cache (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id),payload JSONB NOT NULL,fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),source_url TEXT NOT NULL);

ALTER TABLE property_policy_allocations ADD COLUMN sum_insured NUMERIC(14,2) CHECK(sum_insured>=0);
