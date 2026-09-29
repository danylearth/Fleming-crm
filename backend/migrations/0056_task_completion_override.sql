ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_override_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_override_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_override_by INTEGER REFERENCES users(id);
