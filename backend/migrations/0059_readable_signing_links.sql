ALTER TABLE signature_recipients ADD COLUMN IF NOT EXISTS signing_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS signature_recipients_signing_slug_idx ON signature_recipients(signing_slug) WHERE signing_slug IS NOT NULL;
