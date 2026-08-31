ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS balance_due_amount NUMERIC(10,2);
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS balance_payment_requested INTEGER DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS balance_payment_received INTEGER DEFAULT 0;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS balance_payment_received_at TIMESTAMP;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS handover_date DATE;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS handover_time TIME;
ALTER TABLE tenant_enquiries ADD COLUMN IF NOT EXISTS handover_assigned_to TEXT;

CREATE TABLE IF NOT EXISTS tenancy_agreements (
  id SERIAL PRIMARY KEY,
  enquiry_id INTEGER NOT NULL REFERENCES tenant_enquiries(id) ON DELETE CASCADE,
  property_id INTEGER REFERENCES properties(id),
  tenant_id INTEGER REFERENCES tenants(id),
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('internal', 'client')),
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  signed_filename TEXT,
  mime_type TEXT DEFAULT 'application/pdf',
  size INTEGER,
  status TEXT NOT NULL DEFAULT 'issued',
  tenant_token TEXT NOT NULL UNIQUE,
  landlord_token TEXT UNIQUE,
  requires_landlord_signature INTEGER DEFAULT 0,
  tenant_signature TEXT,
  tenant_signature_name TEXT,
  tenant_signed_at TIMESTAMP,
  tenant_signature_ip TEXT,
  tenant_signature_user_agent TEXT,
  landlord_signature TEXT,
  landlord_signature_name TEXT,
  landlord_signed_at TIMESTAMP,
  landlord_signature_ip TEXT,
  landlord_signature_user_agent TEXT,
  created_by INTEGER REFERENCES users(id),
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

ALTER TABLE tenancy_agreements DROP CONSTRAINT IF EXISTS tenancy_agreements_status_check;
ALTER TABLE tenancy_agreements ADD CONSTRAINT tenancy_agreements_status_check
  CHECK (status IN ('issued', 'tenant_signed', 'completed', 'void'));

CREATE INDEX IF NOT EXISTS idx_tenancy_agreements_enquiry ON tenancy_agreements(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_agreements_token ON tenancy_agreements(tenant_token);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check CHECK (
  task_type IN (
    'manual', 'eicr_reminder', 'epc_reminder', 'gas_reminder', 'tenancy_end',
    'rent_review', 'nok_missing', 'follow_up', 'viewing', 'handover', NULL
  )
);
