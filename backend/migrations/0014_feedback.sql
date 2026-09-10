CREATE TABLE feedback_tickets (
 id SERIAL PRIMARY KEY,
 client_id UUID NOT NULL UNIQUE,
 created_by INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('bug','feature','data','question')),
 priority TEXT NOT NULL CHECK(priority IN ('normal','high','low')),
 page_path TEXT NOT NULL,
 anchor JSONB,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','in_progress','blocked','completed')),
 revision INTEGER NOT NULL DEFAULT 1,
 claim_token UUID,
 claimed_until TIMESTAMPTZ,
 run_id TEXT,
 resolution TEXT,
 verification TEXT,
 release TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX feedback_queue ON feedback_tickets(status,updated_at);
CREATE TABLE feedback_messages (
 id SERIAL PRIMARY KEY,
 ticket_id INTEGER NOT NULL REFERENCES feedback_tickets(id),
 client_id UUID NOT NULL UNIQUE,
 author_id INTEGER REFERENCES users(id),
 author_name TEXT NOT NULL,
 is_agent BOOLEAN NOT NULL DEFAULT FALSE,
 body TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE feedback_files (
 id SERIAL PRIMARY KEY,
 ticket_id INTEGER NOT NULL REFERENCES feedback_tickets(id),
 message_id INTEGER NOT NULL REFERENCES feedback_messages(id),
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 26214400),
 sha256 TEXT NOT NULL,
 content BYTEA NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX feedback_messages_ticket ON feedback_messages(ticket_id,id);
CREATE INDEX feedback_files_ticket ON feedback_files(ticket_id,id);
CREATE TABLE feedback_notifications (
 id SERIAL PRIMARY KEY,
 ticket_id INTEGER NOT NULL REFERENCES feedback_tickets(id),
 revision INTEGER NOT NULL,
 to_email TEXT NOT NULL,
 subject TEXT NOT NULL,
 html TEXT NOT NULL,
 resend_id TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 first_attempt_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(ticket_id,revision)
);
