import fs from 'fs';
import path from 'path';
import pool from './db-pg';

async function runMigration() {
  const migrationPath = path.join(__dirname, 'migrations', 'add-tenant-enquiry-form-fields.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  console.log('Running migration: add-tenant-enquiry-form-fields.sql');

  try {
    await pool.query(sql);
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration();
