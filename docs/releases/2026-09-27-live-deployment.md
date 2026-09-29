# CRM release — 27 September 2026

Production CRM: https://crm.fleminglettings.co.uk

## Deployments

- Backend release: `crm27-ac21f834af04`.
- Fly image: `registry.fly.io/fleming-crm-api:deployment-01M3H1NT2VQZZGBSKAGVS8ZJK1`.
- Frontend deployment: `dpl_A4fxaH86L29HrmqPr6Wp3HidsriG`.
- Frontend URL: https://fleming-portal-i895d9bvu-danyls-projects-1551df91.vercel.app
- Snapshot manifest: `tmp/release-2026-09-27-signer-style/manifest.json`.

## Changes

Signature requests have their own card below Send SMS on tenant and landlord records. The form restricts recipients to connected people and includes editable document name, email subject, message, and a branded email preview. History shows document, sent date, recipient stages, and completed PDF downloads; completed PDFs also appear in Documents. The recipient page now follows the service-contract design and supports typed or drawn signatures and a document preview before confirmation.

Onboarding uses consistent completed/approved states and action panels. Credit report controls have consistent sizing and labels. Client tenancy agreements track all landlords and tenants, requiring every landlord to sign before tenant invitations are sent. Service contract previews, blank optional fields, rent payment actions, and enquiry workflow refinements are included.

## Validation

- Backend full suite: 306 tests in 58 files passed.
- Frontend full suite: 81 tests in 19 files passed.
- Actual signature-route workflow tests: 2 passed; targeted backend follow-up: 31 tests passed.
- Backend and final frontend production builds passed.
- Browser checks covered record cards, email previews, approved onboarding stages, credit controls, all-party signing status, service contract previews, and applying a draft signature to the document preview.
- At 10:38 UTC, the production HTML, entry JavaScript/CSS, and enquiry/tenant/landlord bundles returned HTTP 200 and matched the release manifest SHA256 hashes. The same-origin API health endpoint reported `crm27-ac21f834af04`.
- Verification results: `tmp/live-verification-2026-09-27.json`.
- One explicitly authorised fictional test email was sent to accounts@fleminglettings.co.uk; the user supplied a screenshot of the received email. Subject: `TEST ONLY — Fleming signature request email preview`. Provider ID: `01a0e216-dcad-76cc-bde0-913f01869ff0`.

## Boundaries

Local test pages use fictional data and light mode. Their signing links require the local test server. Production verification was read-only; no customer documents were signed or messages sent as part of that verification. Canopy remains pending provider credentials/setup; the manual credit report workflow remains available. Ten-recipient certificate layout was not visually verified. Existing Leaflet build warnings remain.

## Signing and finance follow-up, verified 27 September

The afternoon release `crm27-29d293bd878c` was verified again at 20:33 UTC against its staging hashes. The backend and both public-form source trees still match that deployed snapshot. This release includes the combined Rent Payments & Invoices view, green paid rows, searchable/expandable property earnings, HTML folder/assets upload workflow, signature-request list and action styling, per-recipient field colours, field duplication and keyboard movement, optional email preview, APT-style signing layout and live field preview, meeting form consistency, and import source information confined to notes.

Verification evidence: `tmp/live-signing-finance-verification.json`. Earlier production data changes have result records in `tmp/test-cleanup-result.json` and `tmp/landlord-enquiry-opt-in-result.json`; the latter updated 79 enquiry records while preserving two existing permission choices.

## Final layout deployment, 21:36 BST

- Published the remaining calendar and tenancy action layout changes to https://crm.fleminglettings.co.uk.
- Deployment: `dpl_G9upzLeCih8zmzixiTD3xbyaNuDy`, ready and aliased to the existing production domain.
- Calendar columns use equal shrinkable tracks; header and time grid reserve matching scrollbar space.
- End Tenancy, Rent Review and Delete / Archive share one action row.
- Production frontend build passed; all 85 frontend tests in 20 files passed before the final scrollbar-gutter-only adjustment, which passed the production build.
- Fifteen live checks passed: the CRM entry assets and relevant page bundles matched the release hashes, the API returned healthy with release `crm27-29d293bd878c`, and tenant/landlord signing form files remained identical to the earlier verified production release.
- Release snapshot: `tmp/release-2026-09-27-final-layout/manifest.json`.
- Verification evidence: `tmp/live-final-layout-verification.json`.
- No demonstration data, promotional prototypes or secrets were included. No Git commit or push was made; deployment used the reviewed working-tree build.

Canopy automated requests/early indicators/monthly billing and MTD/HMRC submissions remain proposed integrations. Their promotional screens are examples, not deployed production services. Activation requires provider access, agreed terms and the remaining implementation and validation.


## Final report regression check

Fresh backend regression run: all 372 tests in 67 files passed with the installed Arial fonts and LibreOffice configured. An outdated test expecting the former tenancy-action label was updated to check the current End Tenancy action. This was a test-only change and did not alter deployed production logic. Evidence: `tmp/backend-daily-report-tests-final.log`.
