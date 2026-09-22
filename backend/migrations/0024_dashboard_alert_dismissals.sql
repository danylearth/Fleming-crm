CREATE TABLE IF NOT EXISTS dashboard_alert_dismissals (
 alert_key TEXT PRIMARY KEY,
 cleared_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
 cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE property_policies ADD COLUMN IF NOT EXISTS cost_included_in_service_charge BOOLEAN NOT NULL DEFAULT FALSE;
