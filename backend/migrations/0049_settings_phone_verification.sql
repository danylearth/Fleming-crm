ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_phone_verified_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS settings_phone_challenges (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('company-settings','trusted-phone','staff-trusted-phone','login')),
  session_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  trusted_phone TEXT,
  code_hashes JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS settings_phone_challenges_user_date ON settings_phone_challenges(user_id,created_at);
CREATE TABLE IF NOT EXISTS trusted_login_devices (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_agent_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS trusted_login_devices_user ON trusted_login_devices(user_id);
-- Supplied by Sam; exact account identity checks prevent assigning by a partial name.
WITH supplied(email,name,phone) AS (VALUES
 ('accounts@fleminglettings.co.uk','Administrator','+441902212331'),
 ('sam@fleminglettings.co.uk','Sam Fleming','+447460874286'),
 ('robert@fleminglettings.co.uk','Robert Fleming','+447817917355'),
 ('marie@fleminglettings.co.uk','Marie Ellis','+447754003068'),
 ('danyl@fleminglettings.co.uk','Danyl Goodall','+447961056812')
), changed AS (
 UPDATE users u SET trusted_phone=s.phone FROM supplied s
 WHERE lower(u.email)=s.email AND u.name=s.name AND u.trusted_phone IS NULL
 RETURNING u.id,u.email,right(u.trusted_phone,4) AS last_four
)
INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes)
SELECT id,email,'update','trusted_phone',id,json_build_object('source','owner-provided initial setup','last_four',last_four,'verified',false)::text FROM changed;
