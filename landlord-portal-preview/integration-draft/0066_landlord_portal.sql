CREATE TABLE IF NOT EXISTS landlord_portal_accounts (
 id UUID PRIMARY KEY, landlord_id INTEGER UNIQUE REFERENCES landlords(id), bdm_id INTEGER UNIQUE REFERENCES landlords_bdm(id),
 email TEXT NOT NULL UNIQUE, password_hash TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
 chat_id UUID REFERENCES chat_conversations(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(landlord_id IS NOT NULL OR bdm_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS landlord_portal_tokens (
 token_hash TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES landlord_portal_accounts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('session','invite','preview')), expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS landlord_portal_requests (
 id SERIAL PRIMARY KEY, account_id UUID NOT NULL REFERENCES landlord_portal_accounts(id),
 kind TEXT NOT NULL CHECK(kind IN('bank_change')), details JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS landlord_portal_tokens_account ON landlord_portal_tokens(account_id);
