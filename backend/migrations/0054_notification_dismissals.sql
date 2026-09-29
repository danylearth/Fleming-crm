CREATE TABLE IF NOT EXISTS notification_dismissals (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_key)
);
CREATE INDEX IF NOT EXISTS idx_audit_notifications_entity ON audit_log(entity_type,entity_id,created_at DESC,id DESC);
