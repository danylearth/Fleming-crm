ALTER TABLE properties
ADD COLUMN IF NOT EXISTS key_colour_code TEXT;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check
CHECK(task_type IN ('manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end', 'rent_review', 'nok_missing', 'follow_up', 'viewing', 'handover', 'maintenance', NULL));

ALTER TABLE tenant_enquiries
ADD COLUMN IF NOT EXISTS handover_with_landlord INTEGER DEFAULT 0;
