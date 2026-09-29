ALTER TABLE settings_phone_challenges
  ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'phone'
  CHECK (delivery_method IN ('phone','email'));
