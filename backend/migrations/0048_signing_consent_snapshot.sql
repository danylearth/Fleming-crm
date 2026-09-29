ALTER TABLE signature_recipients ADD COLUMN IF NOT EXISTS consent_snapshot JSONB;
-- Historical signatures retain their original evidence; do not backfill acceptance.
