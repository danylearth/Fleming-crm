CREATE TABLE IF NOT EXISTS signature_requests (
 id BIGSERIAL PRIMARY KEY, entity_type TEXT NOT NULL CHECK(entity_type IN ('tenant','landlord')),
 entity_id INTEGER NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
 source_pdf BYTEA NOT NULL, source_sha256 TEXT NOT NULL, pages JSONB NOT NULL, fields JSONB NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','completed','cancelled')),
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
 signed_pdf BYTEA, signed_sha256 TEXT
);
CREATE TABLE IF NOT EXISTS signature_recipients (
 id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES signature_requests(id),
 entity_type TEXT NOT NULL CHECK(entity_type IN ('tenant','landlord')),entity_id INTEGER NOT NULL,
 name TEXT NOT NULL,email TEXT NOT NULL,token TEXT NOT NULL UNIQUE,
 signed_at TIMESTAMPTZ,signature BYTEA,signing_ip TEXT,delivery_status TEXT NOT NULL DEFAULT 'not_sent',
 UNIQUE(request_id,entity_type,entity_id)
);
