CREATE TABLE IF NOT EXISTS property_service_overrides (
 id SERIAL PRIMARY KEY, property_id INTEGER NOT NULL REFERENCES properties(id),landlord_id INTEGER NOT NULL REFERENCES landlords(id),service_type TEXT NOT NULL,
 reason TEXT NOT NULL,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS property_service_overrides_lookup ON property_service_overrides(property_id,landlord_id,service_type) WHERE revoked_at IS NULL;
