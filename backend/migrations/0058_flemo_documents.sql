CREATE TABLE IF NOT EXISTS ai_document_uploads (
 id UUID PRIMARY KEY,
 user_id INTEGER NOT NULL REFERENCES users(id),
 filename TEXT NOT NULL,
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',
 document_id INTEGER REFERENCES documents(id)
);
CREATE INDEX IF NOT EXISTS ai_document_uploads_owner ON ai_document_uploads(user_id,expires_at);
