ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id);
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_section_reviews JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS application_changes_sent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_connected_at TIMESTAMP;
ALTER TABLE property_policies ADD COLUMN IF NOT EXISTS insurer TEXT;
ALTER TABLE property_policies ADD COLUMN IF NOT EXISTS broker_company TEXT;
CREATE TABLE marketing_permissions (
 channel TEXT NOT NULL CHECK(channel IN ('email','sms')), destination TEXT NOT NULL,
 allowed BOOLEAN NOT NULL DEFAULT FALSE, evidence TEXT, updated_by INTEGER REFERENCES users(id),
 updated_at TIMESTAMP NOT NULL DEFAULT NOW(), unsubscribe_token UUID NOT NULL UNIQUE,
 PRIMARY KEY(channel,destination)
);
CREATE TABLE marketing_campaigns (
 id UUID PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
 subject TEXT, message TEXT NOT NULL, created_by INTEGER REFERENCES users(id),
 status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMP NOT NULL DEFAULT NOW(), started_at TIMESTAMP
);
CREATE TABLE marketing_recipients (
 id SERIAL PRIMARY KEY, campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id),
 entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, name TEXT, destination TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', error TEXT, provider_id TEXT, sent_at TIMESTAMP,
 UNIQUE(campaign_id,destination)
);

ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN NOT NULL DEFAULT FALSE;
