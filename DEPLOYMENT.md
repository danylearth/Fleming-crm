# Fleming CRM — Deployment

This is the single source of truth for how Fleming CRM is deployed and operated.
Older `DEPLOY-*.md` / `*-STATUS.md` / `*-TEST-RESULTS.md` docs have been deleted;
if you find advice elsewhere that contradicts this file, this file wins.

## Production topology

| Piece | Where | Notes |
|---|---|---|
| API | Fly.io app `fleming-crm-api` → https://fleming-crm-api.fly.dev | Region `lhr`. **One machine by design** — uploads live on a per-machine volume. |
| Database | Supabase project `fleming-crm` (ref `sycbsgnqnhmnxksagbuh`), Postgres 17, London | Connect via session pooler `aws-1-eu-west-2.pooler.supabase.com:5432`, user `postgres.sycbsgnqnhmnxksagbuh`. TLS verified against the pinned CA in `backend/supabase-ca.crt`. |
| Uploads | Fly volume `uploads_data` mounted at `/data` | `UPLOADS_PATH=/data/uploads`. Scaling beyond 1 machine requires moving uploads to object storage first. |
| Staff portal | Vercel project `fleming-portal` → https://fleming-portal.vercel.app | Built from repo root (`vercel.json`), `VITE_API_URL` set in Vercel project env. |
| Tenant form | Vercel project `tenants-subdomain` → https://apply.fleminglettings.co.uk | Static HTML in `tenants-subdomain/`. `/onboarding/:token` rewrites to `application.html`. |
| Landlord form | Vercel project `landlords-subdomain` → https://landlords.fleminglettings.co.uk | Static HTML in `landlords-subdomain/`. |
| Uptime | `.github/workflows/uptime.yml` | Probes health + public routes every 30 min; a failing run emails repo admins. |

Railway and Render are **dead** — old apps 404 and their configs have been removed from the repo.

## Deploying

### Backend (Fly)

```bash
cd backend
flyctl deploy --remote-only
```

The Docker build compiles TypeScript (`npx tsc`, fails on type errors). Before new
machines start, Fly runs the release step `node dist/migrate.js`, which applies the
idempotent baseline schema (`initDb`) plus any un-applied `backend/migrations/*.sql`
(tracked in `schema_migrations`). Add schema changes as numbered migration files —
never edit an applied file.

Secrets (set once, via `flyctl secrets set -a fleming-crm-api KEY=value`):
`DATABASE_URL`, `JWT_SECRET`, plus optional integrations (`RESEND_API_KEY`,
`TWILIO_*`, `EPC_API_KEY`, `COMPANIES_HOUSE_API_KEY`, `COUNCIL_TAX_API_KEY`,
`SENTRY_DSN`). `PORT`, `NODE_ENV`, `UPLOADS_PATH` come from `fly.toml [env]`.

### Frontend + forms (Vercel)

```bash
npx vercel --prod --yes                      # portal (run from repo root)
cd tenants-subdomain && npx vercel --prod    # tenant form
cd landlords-subdomain && npx vercel --prod  # landlord form
```

The portal reads `VITE_API_URL` from Vercel project env (Production). If the API
URL ever changes, update it there **and** redeploy — the value is baked into the
bundle at build time. The static forms have the API URL inline in their HTML.

## Verifying a deploy

```bash
curl https://fleming-crm-api.fly.dev/api/health
./smoke-test.sh https://fleming-crm-api.fly.dev <admin-email> <admin-password>
```

The public enquiry endpoints answer `400` (not 404/500) to an empty POST — that's
what the uptime workflow asserts.

## Local development

```bash
# Postgres must be running locally; create + seed the dev database once:
createdb fleming_dev
cd backend && npm install
cp .env.example .env   # or create .env with DATABASE_URL + JWT_SECRET
npm run seed:dev       # demo data, admin@fleming.com/admin123 (dev only)
npm run dev            # API on :3001

cd frontend && npm install && npm run dev   # Vite on :5173, proxies /api to :3001
```

There is no SQLite backend any more — dev and production run the same code
(`src/index-pg.ts`) against Postgres.

## Operational notes

- **First admin user** on an empty database: `POST /api/auth/setup` with
  `{email, password, name}`.
- **JWTs** expire after 24 h; deactivating a user or changing their password
  invalidates existing tokens immediately.
- **Rate limits**: login 10/15 min per IP+email; public form POSTs 10/15 min per IP.
- **Deletes**: landlords with properties return 409 (reassign or delete the
  properties first). Entity deletes/exports need the `manager` role.
- **Backups**: Supabase manages database backups (dashboard → Database → Backups).
  The uploads volume has Fly's daily snapshots (5-day retention).
