import fs from 'fs';
import path from 'path';
import pool from './src/db-pg';

async function runMigration() {
  const migrationPath = path.join(__dirname, 'src', 'migrations', 'fix-properties-schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  console.log('🔧 Running migration: fix-properties-schema.sql');
  console.log('   - Adding tenant_id column');
  console.log('   - Adding image_url column');
  console.log('   - Fixing status CHECK constraint to include "to_let"');
  console.log('');

  try {
    await pool.query(sql);
    console.log('✅ Migration completed successfully!');
    console.log('   - Properties table now supports tenant_id');
    console.log('   - Properties table now supports image_url');
    console.log('   - Status can now be: to_let, available, let, maintenance');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
