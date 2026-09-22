CREATE TABLE IF NOT EXISTS auth_challenge_uses (signature_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS auth_challenge_expiry ON auth_challenge_uses(expires_at);
