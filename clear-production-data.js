#!/usr/bin/env node

/**
 * Clear Production Data Script
 *
 * This script removes all demo data from the production database
 * while preserving the admin user account.
 *
 * WARNING: This will permanently delete all data except the admin user!
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function clearData() {
  const client = await pool.connect();

  try {
    console.log('🗑️  Starting data cleanup...\n');

    await client.query('BEGIN');

    // Delete in order to respect foreign key constraints
    const tables = [
      'audit_log',
      'documents',
      'rent_payments',
      'tasks',
      'maintenance',
      'tenants',
      'tenant_enquiries',
      'properties',
      'landlords',
      'landlords_bdm'
    ];

    for (const table of tables) {
      const result = await client.query(`DELETE FROM ${table}`);
      console.log(`✅ Cleared ${table}: ${result.rowCount} rows deleted`);
    }

    // Keep only the admin user (ID = 1)
    const userResult = await client.query(`DELETE FROM users WHERE id != 1`);
    console.log(`✅ Cleared users (kept admin): ${userResult.rowCount} rows deleted`);

    await client.query('COMMIT');

    console.log('\n✨ Database cleanup complete!');
    console.log('\n📊 Remaining data:');
    console.log('   - 1 admin user (admin@fleming.com)');
    console.log('   - All demo landlords, properties, tenants, etc. removed');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error clearing data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

clearData()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
