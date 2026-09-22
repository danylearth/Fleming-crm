ALTER TABLE landlords ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMPTZ;
UPDATE landlords l SET kyc_approved_at=(SELECT MAX(a.created_at) FROM audit_log a WHERE a.entity_type='landlord' AND a.entity_id=l.id AND a.action='update' AND a.changes::text LIKE '%"kyc_completed":true%') WHERE l.kyc_completed=1 AND l.kyc_approved_at IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_setup_required BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS account_requests (
 id SERIAL PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('reset','create')), user_id INTEGER REFERENCES users(id),
 email TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', requested_by INTEGER REFERENCES users(id), approver_id INTEGER REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), decided_at TIMESTAMPTZ, decided_by INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_requests_pending ON account_requests(kind,LOWER(email)) WHERE status='pending';
CREATE TABLE IF NOT EXISTS account_tokens (
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('invite','reset')),
 expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check CHECK(status IN ('to_let','available','let','let_agreed','full_management','rent_collection','maintenance','closed'));
