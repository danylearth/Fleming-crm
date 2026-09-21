ALTER TABLE bank_feed_transactions ADD COLUMN display_name TEXT;
UPDATE landlords_bdm SET status='follow_up',updated_at=NOW() WHERE status='interested';
CREATE TABLE property_inspections (
 id SERIAL PRIMARY KEY,
 property_id INTEGER NOT NULL REFERENCES properties(id),
 tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 tenancy_start_date DATE NOT NULL,
 conducted_by INTEGER NOT NULL REFERENCES users(id),
 inspection_date DATE NOT NULL,
 scheduled_due_date DATE NOT NULL,
 condition TEXT NOT NULL CHECK(condition IN ('bad','needs_repair','good','excellent')),
 document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
 notes TEXT,
 completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_by INTEGER NOT NULL REFERENCES users(id),
 UNIQUE(property_id,tenant_id,tenancy_start_date,inspection_date)
);
CREATE UNIQUE INDEX property_inspection_task ON tasks(entity_id,due_date) WHERE task_type='property_inspection' AND status IN ('pending','in_progress');
