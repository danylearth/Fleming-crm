-- Created only for newly completed requests; no retrospective mail-out.
CREATE TABLE IF NOT EXISTS signature_completion_emails (
 recipient_id BIGINT PRIMARY KEY REFERENCES signature_recipients(id),
 to_email TEXT NOT NULL, subject TEXT NOT NULL, body_html TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','simulated')),
 attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ,
 resend_id TEXT, last_error TEXT
);
CREATE INDEX IF NOT EXISTS signature_completion_emails_pending
 ON signature_completion_emails(next_attempt_at) WHERE status='pending';
