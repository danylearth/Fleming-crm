# Migrations

Applied in filename order by `src/migrate.ts`, which runs as the Fly release
step before new machines start. Each file runs once, inside a transaction, and
is recorded in `schema_migrations`.

- Name files `0001_short_description.sql`, `0002_...` etc.
- Never edit a file after it has been applied anywhere — add a new one.
- The idempotent baseline schema lives in `src/db-pg.ts` (`initDb`), which the
  runner executes first.
