ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_kind_check;
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_kind_check CHECK(kind IN ('direct','group','department','live','whatsapp'));
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS cleared_through_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
