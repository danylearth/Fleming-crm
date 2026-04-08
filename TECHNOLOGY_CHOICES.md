# Technology Choices

> These choices were made during API Discovery and inform the implementation plan.

## Selected Technologies

### Deployment (Backend): Railway
- **Why**: Already in use, auto-deploys on git push, PostgreSQL included
- **SDK**: None (git-based deployment)
- **API Key**: N/A (configured via Railway dashboard)
- **Key Features**: Auto-deploy, managed PostgreSQL, health checks, restart policy
- **Config**: `railway.json`

### Deployment (Frontend): Vercel
- **Why**: Already in use for static frontend hosting
- **SDK**: `vercel` CLI
- **API Key**: N/A (configured via Vercel dashboard)
- **Key Features**: Static hosting, environment variables, preview deployments
- **Config**: `vercel.json`

### Database: PostgreSQL (production) / SQLite (development)
- **Why**: Dual-database architecture already in place; PostgreSQL for Railway production, SQLite for fast local dev
- **SDK**: `pg` (PostgreSQL), `better-sqlite3` (SQLite dev only)
- **Key Features**: Separate entry points (`index-pg.ts` / `index.ts`), auto-seeding, migration scripts

### Authentication: JWT + bcryptjs
- **Why**: Already implemented, lightweight, no external auth service needed
- **SDK**: `jsonwebtoken`, `bcryptjs`
- **Key Features**: 7-day tokens, role hierarchy (admin/manager/staff/viewer), middleware-based

### Email: Resend
- **Why**: Already integrated with delivery tracking via webhooks
- **SDK**: `resend` v6.9.3
- **API Key**: `RESEND_API_KEY` (configured in Railway)
- **Key Features**: Transactional email, delivery status webhooks (svix HMAC-SHA256), bounce/open tracking

### SMS: Twilio
- **Why**: Already integrated with inbound/outbound, delivery status, templates
- **SDK**: `twilio` v5.5.1
- **API Key**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (configured in Railway)
- **Key Features**: Outbound SMS, inbound webhook, delivery status callbacks, simulates if env vars missing

### Government APIs (UK)
- **Why**: Domain-specific integrations already built for property management
- **Services**: Land Registry (free), Postcodes.io (free), EPC Lookup (free key), Companies House (free key), Council Tax (paid)
- **API Keys**: `EPC_API_KEY`, `COMPANIES_HOUSE_API_KEY`, `COUNCIL_TAX_API_KEY` (optional)

## No New Services Required

This release is a full-platform UAT and bug-fix sprint. No new external APIs, SDKs, or services are needed. All existing integrations are already configured and operational. The work involves:
1. Verifying the deployment build pipeline works after recent fixes
2. Testing every CRUD endpoint and UI flow
3. Fixing regressions introduced by the Railway deployment fix changes
4. Ensuring kanban board status changes reflect correctly

## Environment Variables Summary

| Variable | Service | Status |
|----------|---------|--------|
| DATABASE_URL | Railway PostgreSQL | ✅ Configured in Railway |
| JWT_SECRET | Auth | ✅ Configured in Railway |
| UPLOADS_PATH | File uploads | ✅ Configured in Railway |
| VITE_API_URL | Frontend → Backend | ✅ Configured in Vercel |
| RESEND_API_KEY | Resend Email | ✅ Configured in Railway |
| RESEND_WEBHOOK_SECRET | Resend Webhooks | ✅ Configured in Railway |
| BASE_URL | Webhook callbacks | ✅ Configured in Railway |
| TWILIO_ACCOUNT_SID | Twilio SMS | ✅ Configured in Railway |
| TWILIO_AUTH_TOKEN | Twilio SMS | ✅ Configured in Railway |
| TWILIO_PHONE_NUMBER | Twilio SMS | ✅ Configured in Railway |
| EPC_API_KEY | EPC Lookup | ⏳ Optional |
| COMPANIES_HOUSE_API_KEY | Companies House | ⏳ Optional |
| COUNCIL_TAX_API_KEY | Council Tax | ⏳ Optional |
| VITE_GOOGLE_PLACES_API_KEY | Google Places | ⏳ Optional |
