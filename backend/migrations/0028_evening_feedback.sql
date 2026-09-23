CREATE TABLE departments (id SERIAL PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100), created_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX departments_name_unique ON departments(LOWER(name));
INSERT INTO departments(name) SELECT DISTINCT ON (LOWER(TRIM(department))) TRIM(department) FROM users WHERE NULLIF(TRIM(department),'') IS NOT NULL ORDER BY LOWER(TRIM(department)),TRIM(department);
UPDATE users u SET department=d.name FROM departments d WHERE LOWER(TRIM(u.department))=LOWER(d.name);
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN office_extension TEXT;
ALTER TABLE property_expenses ADD COLUMN excluded_from_costs BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE property_expenses e SET excluded_from_costs=TRUE WHERE EXISTS(SELECT 1 FROM bank_feed_allocations a WHERE a.expense_id=e.id AND (a.kind IN ('deposit','holding_deposit') OR a.category IN ('Security Deposit Payments In','Security Deposit Payments Out')));
ALTER TABLE inventories ADD COLUMN applies_to_tenancy_start_date DATE;
