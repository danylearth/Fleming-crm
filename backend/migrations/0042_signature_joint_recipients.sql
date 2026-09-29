ALTER TABLE signature_recipients ADD COLUMN IF NOT EXISTS recipient_slot TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE signature_recipients DROP CONSTRAINT IF EXISTS signature_recipients_request_id_entity_type_entity_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS signature_recipients_person ON signature_recipients(request_id,entity_type,entity_id,recipient_slot);
