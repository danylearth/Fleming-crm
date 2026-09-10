ALTER TABLE tenants ADD COLUMN IF NOT EXISTS completion_overrides JSONB NOT NULL DEFAULT '{}';
CREATE TABLE rent_reviews (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  tenant_ids INTEGER[] NOT NULL,
  tenancy_start_date DATE NOT NULL,
  old_rent NUMERIC(12,2) NOT NULL,
  new_rent NUMERIC(12,2) NOT NULL CHECK(new_rent > old_rent),
  notice_document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  notice_served_date DATE NOT NULL,
  service_method TEXT NOT NULL,
  last_increase_date DATE,
  effective_date DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','paused','cancelled','applied')),
  status_reason TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX rent_review_one_pending_property ON rent_reviews(property_id) WHERE status IN ('scheduled','paused');
CREATE INDEX rent_reviews_due ON rent_reviews(effective_date) WHERE status='scheduled';
