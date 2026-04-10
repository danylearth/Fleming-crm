-- Migration: Fix properties table schema
-- Date: 2026-03-27
-- Purpose: Add tenant_id, image_url columns and fix status CHECK constraint to include 'to_let'

-- Step 1: Drop the existing CHECK constraint on status
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;

-- Step 2: Add the new columns if they don't exist
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Step 3: Add the new CHECK constraint with 'to_let' included
ALTER TABLE properties
ADD CONSTRAINT properties_status_check
CHECK (status IN ('to_let', 'available', 'let', 'let_agreed', 'full_management', 'rent_collection', 'maintenance'));

-- Step 4: Update existing properties with 'available' status to 'to_let' if appropriate
-- (This is optional - only if you want to migrate existing data)
-- UPDATE properties SET status = 'to_let' WHERE status = 'available' AND has_live_tenancy = 0;

-- Step 5: Update the default for new rows
ALTER TABLE properties
ALTER COLUMN status SET DEFAULT 'to_let';

-- Done!
SELECT 'Migration completed successfully!' as result;
