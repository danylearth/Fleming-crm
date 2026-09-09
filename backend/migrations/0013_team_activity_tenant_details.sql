ALTER TABLE tenants ADD COLUMN IF NOT EXISTS rent_last_reviewed DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS guarantor_authority_to_contact INTEGER NOT NULL DEFAULT 0;
UPDATE tenants SET rent_last_reviewed = tenancy_start_date WHERE rent_last_reviewed IS NULL AND status = 'active' AND tenancy_start_date <= CURRENT_DATE;
CREATE TABLE user_activity_minutes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minute TIMESTAMPTZ NOT NULL,
  page TEXT NOT NULL,
  PRIMARY KEY(user_id, minute)
);
CREATE TABLE permission_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  requested_role TEXT NOT NULL CHECK(requested_role IN ('viewer','staff','manager')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_pending_permission_request ON permission_requests(user_id) WHERE status='pending';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dashboard_dismissed_at TIMESTAMPTZ;
