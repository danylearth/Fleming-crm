ALTER TABLE inventories ADD COLUMN IF NOT EXISTS signed_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventories(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS documents_inventory_entity ON documents(inventory_id,entity_type,entity_id) WHERE inventory_id IS NOT NULL;

ALTER TABLE property_expenses ADD COLUMN IF NOT EXISTS expense_year INTEGER CHECK (expense_year BETWEEN 1900 AND 2200);
