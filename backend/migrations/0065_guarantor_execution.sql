-- Each signing attempt preserves its exact source PDF and separate witness evidence.
CREATE TABLE IF NOT EXISTS guarantor_executions (
 id BIGSERIAL PRIMARY KEY,
 verification_id INTEGER NOT NULL REFERENCES guarantor_verifications(id),
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','awaiting_witness','completed','witness_declined','superseded')),
 source_pdf BYTEA NOT NULL,
 source_sha256 TEXT NOT NULL,
 signature_fields JSONB NOT NULL,
 tenancy_snapshot JSONB NOT NULL,
 form_snapshot JSONB NOT NULL,
 guarantor_signature JSONB,
 witness_signature JSONB,
 witness_token_hash TEXT UNIQUE,
 witness_token_encrypted TEXT,
 witness_expires_at TIMESTAMPTZ,
 partially_signed_pdf BYTEA,
 signed_pdf BYTEA,
 signed_sha256 TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 declined_at TIMESTAMPTZ,
 decline_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS guarantor_execution_open ON guarantor_executions(verification_id) WHERE status IN ('prepared','awaiting_witness');
ALTER TABLE guarantor_verifications ADD COLUMN IF NOT EXISTS execution_id BIGINT REFERENCES guarantor_executions(id);
ALTER TABLE guarantor_verifications ADD COLUMN IF NOT EXISTS token_encrypted TEXT;
ALTER TABLE guarantor_verifications ADD COLUMN IF NOT EXISTS workflow JSONB NOT NULL DEFAULT '{}';
ALTER TABLE guarantor_verification_files ADD COLUMN IF NOT EXISTS review_notes TEXT;

CREATE TABLE IF NOT EXISTS guarantor_execution_emails (
 id BIGSERIAL PRIMARY KEY,
 execution_id BIGINT NOT NULL REFERENCES guarantor_executions(id),
 kind TEXT NOT NULL CHECK(kind IN ('witness_request','completed_deed')),
 to_email TEXT NOT NULL,
 subject TEXT NOT NULL,
 body_html TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','simulated','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 resend_id TEXT,
 last_error TEXT,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(execution_id,kind)
);
ALTER TABLE guarantor_execution_emails ADD COLUMN IF NOT EXISTS send_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guarantor_execution_emails ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
