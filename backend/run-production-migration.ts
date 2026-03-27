// Run migration on production database
// This script connects to the Railway PostgreSQL database and runs the schema migration
import pool from './src/db-pg';

async function runMigration() {
  console.log('🔧 Running migration on production database...');
  console.log('');

  try {
    // Step 1: Drop the existing CHECK constraint
    console.log('1. Dropping old status CHECK constraint...');
    await pool.query(`
      ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
    `);
    console.log('   ✅ Old constraint dropped');

    // Step 2: Add tenant_id column
    console.log('2. Adding tenant_id column...');
    await pool.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
    `);
    console.log('   ✅ tenant_id column added');

    // Step 3: Add image_url column
    console.log('3. Adding image_url column...');
    await pool.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);
    console.log('   ✅ image_url column added');

    // Step 4: Add new CHECK constraint
    console.log('4. Adding new status CHECK constraint...');
    await pool.query(`
      ALTER TABLE properties
      ADD CONSTRAINT properties_status_check
      CHECK (status IN ('to_let', 'available', 'let', 'maintenance'));
    `);
    console.log('   ✅ New constraint added (includes "to_let")');

    // Step 5: Update default
    console.log('5. Updating default status...');
    await pool.query(`
      ALTER TABLE properties
      ALTER COLUMN status SET DEFAULT 'to_let';
    `);
    console.log('   ✅ Default status set to "to_let"');

    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('   - Properties table now supports tenant_id');
    console.log('   - Properties table now supports image_url');
    console.log('   - Status can now be: to_let, available, let, maintenance');
    console.log('   - Default status is now: to_let');
  } catch (error: any) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    console.error('');
    if (error.message.includes('already exists')) {
      console.log('💡 This migration may have already been applied.');
      console.log('   Checking current schema...');

      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'properties'
        AND column_name IN ('tenant_id', 'image_url');
      `);

      console.log('   Columns found:', result.rows.map((r: any) => r.column_name).join(', ') || 'none');
    }
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
