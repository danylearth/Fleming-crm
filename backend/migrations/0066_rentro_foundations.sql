-- Rentro landlords can manage properties themselves. Fleming's schedulers, billing and dashboard
-- only act on properties Fleming operates (see backend/src/fleming-operated.ts).
-- Every existing property is Fleming-operated; nothing changes for current records.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS management_mode TEXT NOT NULL DEFAULT 'fleming';
DO $$ BEGIN
  ALTER TABLE properties ADD CONSTRAINT properties_management_mode_check CHECK (management_mode IN ('fleming', 'self_managed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_properties_self_managed ON properties(id) WHERE management_mode = 'self_managed';
