import pool, { initDb } from './db-pg';
import fs from 'fs';
import path from 'path';

// Release-step migration runner (fly.toml [deploy] release_command).
// 1. initDb() applies the idempotent baseline schema.
// 2. Any backend/migrations/*.sql not yet recorded in schema_migrations is
//    applied in filename order, each inside its own transaction.
// Name new files like 0001_add_foo.sql — never edit an applied file.
async function migrate() {
  await initDb();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const dir = path.join(__dirname, '../migrations');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort() : [];

  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (done.rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  await pool.end();
}

migrate()
  .then(() => { console.log('[migrate] up to date'); process.exit(0); })
  .catch((err) => { console.error('[migrate] failed:', err); process.exit(1); });
