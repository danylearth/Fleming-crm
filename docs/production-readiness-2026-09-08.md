# CRM release — 8 September 2026

Based on the supplied September 7 feedback documents and the previously committed CRM feedback branch (`9b4c94e`). Historical destructive instructions in the WhatsApp archive were not executed.

## Changes

- Generate Fleming-owned agreements from the supplied Word contract, retaining its clauses, letterhead and tables. Populate individual tenants, dates, property, payment details and contributor disclosure; append compliance documents and an electronic signature certificate.
- Use unique 128-bit applicant link suffixes. Require affirmative signing consent and a valid PNG. Make signatures immutable and finalisation transactional under simultaneous signing.
- Require both joint applicants to complete application review and credit checks. Convert both applicants atomically, link their records, use the signed start date, and attach the signed agreement to both tenants and their property.
- Backfill unambiguous existing joint pairs. Move address history migration into a one-time migration.
- Preserve handover drafts during background refresh, show the branded email preview, use the supplied SMS wording, validate dates, and update one calendar appointment when rescheduling.
- End browser sessions after ten minutes without human activity. Block viewer writes centrally, prevent sensitive API caching, and redact public capability URLs from request logs.
- Count joint rent once per property. Correct Financials payment field mapping and show load failures. Calculate occupancy from active tenancies.
- Restore Apple/Google map artwork in emails, add deposit document categories, and correct maintenance emergency contact labels.
- Upgrade deployed runtime to Node 24; update vulnerable dependencies, including the official SheetJS distribution. Include LibreOffice in the API image and allow 1 GB memory for document rendering.

## Verification

- 131 backend and 38 frontend tests pass.
- 16 real HTTP/PostgreSQL integration scenarios pass on an isolated, empty local database; migrations run twice. Includes concurrent signatures/conversions, authorisation, document ownership, joint stage progression, handover rescheduling, financial totals and maintenance uploads.
- Frontend and backend production builds pass. Frontend lint: zero errors, two existing dependency warnings.
- Both npm dependency audits report zero vulnerabilities.
- Browser checks cover login, nine CRM routes, session expiration, mobile login, completed/invalid signing links, and mobile maintenance prefill/photo submission, and handover draft preservation after tab focus. Test fixtures have no live provider credentials.
- The supplied contract and generated signature certificate were rendered and visually inspected. The integration fixture's two compliance pages are intentionally blank test PDFs.

Run integration tests with Node 24, a new empty local PostgreSQL database whose name starts with `fleming_crm_test`, and LibreOffice installed:

```sh
cd backend
TEST_DATABASE_URL=postgres://USER@127.0.0.1:PORT/fleming_crm_test npm run test:integration
```

## Release safeguards

- Previous API image: `registry.fly.io/fleming-crm-api:deployment-01M1XM3MCVJW0JGHR70SQSQD2W`.
- Pre-release upload volume snapshot: `vs_0RGnGjZRzP5ahNmvxRa1` (created; five-day retention).
- Consistent pre-release data snapshot of all 27 public tables and column metadata saved privately outside the repository. This is a data snapshot, not a complete PostgreSQL schema dump.
- API remains a single machine because uploads use a machine-local persistent volume.
- Correct production projects: `fleming-portal` (CRM) and `tenants-subdomain` (public forms).

## Operational items requiring account configuration

- Resend sending credentials exist, but `RESEND_WEBHOOK_SECRET` is absent. The restricted sending key cannot manage webhooks (provider returns 401). Configure a signed webhook to `/api/email/webhook` and install its signing secret to enable delivered/opened/bounced status updates. No real emails were sent during verification.
- Twilio account is active and full. Carrier delivery was not tested by sending real SMS.
- Barclays/Open Banking remains unavailable until TrueLayer client credentials and account consent are configured; the interface keeps connection disabled while credentials are missing.

These external configuration items prevent describing every integration as fully operational.

## Deployment results

- Code release: `19cc88d`, branch `codex/crm-production-readiness`.
- CRM: https://crm.fleminglettings.co.uk — Vercel `dpl_58JGQFJeVWcGeKvNZpaDeFd49cU2`.
- Public forms: https://apply.fleminglettings.co.uk and https://report.fleminglettings.co.uk — Vercel `dpl_5WAqqyRNKqnhjZ3ehjrA1LcQiu6k`.
- The reporting domain root now redirects to its maintenance form instead of the static application index.
- API image: `registry.fly.io/fleming-crm-api:deployment-01M215M82KNYBWAKB314Z17CXF`; machine `d891e57df37178`, London, 1 GB. Health reports release `19cc88d` and a working database query.
- The previous host could not allocate more memory. Its services were cordoned and the machine stopped before forking the upload volume. New volume: `vol_4y8qjm8gke63671r`. Original encrypted volume `vol_vgng79o2n8lqw684` retained for rollback; old machine retired after the replacement passed health checks.
- Live verification found zero missing document files and eight reciprocal tenant links (four joint pairs). A synthetic agreement also rendered successfully inside the deployed Linux image without database writes or sending messages.
- Both supplied deposit PDFs were matched to the intended tenant/property, verified by SHA-256, and linked to each record (four document links; two files). No historical bulk re-import was performed: 74 previously supplied filenames already matched existing records.
- Production browser checks passed on mobile for CRM login, invalid signing links, and the maintenance domain, with no JavaScript errors or broken images.

Rollback: use the previous image with the current volume for a code-only rollback; the schema changes are additive. If a storage rollback is necessary, first stop incoming writes and reconcile post-release uploads before attaching the retained original volume. Do not run two API machines against independent upload copies.
