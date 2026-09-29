CREATE TABLE IF NOT EXISTS chat_conversations (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('direct','department','live','whatsapp')),
 title TEXT NOT NULL, department TEXT, direct_key TEXT UNIQUE,
 visitor_name TEXT, visitor_email TEXT, visitor_phone TEXT, visitor_token_hash TEXT UNIQUE,
 assigned_to INTEGER REFERENCES users(id), entity_type TEXT, entity_id INTEGER,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_customer_message_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_department ON chat_conversations(department) WHERE kind='department';
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_whatsapp ON chat_conversations(visitor_phone) WHERE kind='whatsapp';
CREATE TABLE IF NOT EXISTS chat_members (
 conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, last_read_id BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE IF NOT EXISTS chat_messages (
 id BIGSERIAL PRIMARY KEY,conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
 sender_id INTEGER REFERENCES users(id),sender_name TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',
 client_id UUID NOT NULL,provider_id TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'sent',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(conversation_id,client_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_message_conversation ON chat_messages(conversation_id,id);
CREATE TABLE IF NOT EXISTS chat_files (
 id UUID PRIMARY KEY,conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
 message_id BIGINT REFERENCES chat_messages(id),uploaded_by INTEGER NOT NULL REFERENCES users(id),
 filename TEXT NOT NULL,original_name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_presence (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
