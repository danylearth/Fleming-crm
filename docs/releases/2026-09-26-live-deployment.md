# Production release — 26 September 2026

Published the approved CRM, service agreement, bank approval, financial allocation, public signing and layout changes. Login and default CRM sizing are 90%; existing explicit appearance preferences remain respected.

## Deployments

- API release: `sept26-addf8a6c8be6`, healthy at `https://fleming-crm-api.fly.dev/api/health`.
- Fly image: `registry.fly.io/fleming-crm-api:deployment-01M3EBAGTQS4PV5PT38HA5NAJB`.
- Database release migration completed successfully before the rolling machine update.
- CRM: `https://crm.fleminglettings.co.uk`, deployment `https://fleming-portal-nfcq6f0do-danyls-projects-1551df91.vercel.app`.
- Tenant/signing: `https://apply.fleminglettings.co.uk`, deployment `https://tenants-subdomain-7wxbge8fl-danyls-projects-1551df91.vercel.app`.
- Landlord form: `https://landlords.fleminglettings.co.uk`, deployment `https://landlords-subdomain-imlx1edhk-danyls-projects-1551df91.vercel.app`.
- Published to the existing Vercel projects in `danyls-projects-1551df91`; existing domains retained.

## Verification

- Backend build and all 252 tests passed; frontend production build and all 72 tests passed.
- Production API health returned HTTP 200 and the exact release identifier.
- Eleven production assets returned HTTP 200 and SHA-256 matched the release staging files: CRM HTML/JS/CSS, tenant agreement pages and signature assets, landlord HTML and shared form styling/scripts.
- Live login browser verification: computed root font size 14.4px (90%), no horizontal overflow.
- Local browser checks covered service filters/counts, compact sidebar and sending channel selection. Joint agreement PDF layout was visually checked before release.
- No production test records, emails or SMS were created during deployment verification. Authenticated production mutations were not smoke-tested against customer records.

## Release provenance and recovery

The release was deployed from the approved working-tree snapshot in `tmp/release-2026-09-26`, whose manifest records source hashes. No Git commit or push was made. The tenant static Vercel configuration was subsequently updated in source and staging to override an inherited frontend build/install command; the retry succeeded. Local demo fixtures and environment files were excluded from deployment.

Previous Fly image: `registry.fly.io/fleming-crm-api:deployment-01M3CD1XFH435H6TK0HC1BVZH8` (release v65, source `0f6489b83d740171efffd76cf75e9434b6d36f60`). A code rollback does not reverse applied migrations. Vercel retains earlier deployments for rollback.

Earnings to Date uses confirmed receipts and historical agreed fees. Receipts without a recoverable historical fee rate are excluded and flagged, rather than calculated using today's rates.

## UI follow-up

Published deployment `dpl_FqNczaTPV5vsHZfy6mxSzpKK2Atv` to the existing CRM domain after the user's additional review feedback.

- Landlord IDs determine placeholder card colours consistently across dashboard and property details; normalised names provide a fallback.
- Roomier sidebar, larger portfolio selector, Own Portfolio service badge, and removed town filter.
- Tenancy Details now edits only Deposit Scheme, from its own corner action. Rent Review remains the rent-change action. Delete/archive remains admin-only in UI and API. Reactivation label is Reactive Record.
- Tenant notes use compact rows with author/date beneath and deletion at the top-right.
- Contract PDF/email previews and Email/SMS choices share the main contract screen. Admin Override sits immediately before Send; no secondary send screen. No-channel selection disables sending.
- Production build passed. All 74 frontend tests passed before the last send-screen simplification; the final simplification was production-built and browser-checked for channel gating and HTML preview. Production HTML and referenced entry assets match staging.
- No real emails/SMS sent or customer records changed during verification.
