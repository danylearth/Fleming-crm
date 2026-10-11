# Witness design reconciliation and responsive UAT — 11 October 2026

## Approved design restored

Reviewed the earlier 1–2 October conversation and approved guarantor prototype before reconciling the production implementation. The approval to publish was recorded on 2 October at 11:09. This release restores the agreed presentation while retaining the production signing, storage and evidence handling.

- Arial, company logo and browser icon; two aligned panels on desktop and a single column on narrow screens.
- “Confirm and Sign 📄”, editable full legal name, optional signing location with “Address or venue”, compact declarations, and equal Generate Signature/Clear controls.
- Only “Sign & Attest”; removed “I cannot attest”. Required declarations and signature validation remain enforced.
- Recorded guarantor signature and actual signing timestamp shown alongside the tenancy particulars from the locked deed snapshot.
- Completed screen uses “Click to View Signed Deed - Document is Locked 🔐”. Existing completed deeds remain immutable.
- PDF preview disposes its PDF.js loading task correctly, renders multiple pages in a scrollable panel, and opens the PDF in a separate tab.
- CRM Refresh sits beside “Invitation & Signing Activity” and does not accidentally open or close that section.

The existing completed-deed delivery rules were exercised in isolated integration tests: guarantor copy, witness flow, tenant confirmation and CRM retention. Existing production signatures, documents and timestamps were not rewritten.

## Bugs found during wider UAT

1. Narrow CRM header controls could squeeze the profile image. Controls now wrap and the image keeps its size; mobile navigation controls also have accessible names.
2. Settings could display an oval profile photo beside a long email address. The photo now keeps its dimensions and the text wraps within the available space.
3. “Which rent reviews are due this month?” entered the individual-property rent lookup. Review questions now remain on the existing review-reminder route. A regression test verifies that this path does not read property balances.
4. The release build reported runtime dependency advisories. Compatible lockfile updates applied: multer 2.4.0, sharp 0.35.5 and its platform packages, proxy-addr 2.0.8, ip-address 10.7.3 and source-map-js 1.2.2. Final runtime audit: zero reported vulnerabilities. Development-tool advisories are outside that runtime result.
5. A document-only application revision could fail when the audit-history query applied a JSON operator to a text column. The query now casts the stored JSON before reading it. The real HTTP/database regression verifies that replacement documents save without changing previously approved answers, review attribution or recorded signatures.

## Test coverage

| Area | Coverage | Result |
| --- | --- | --- |
| Frontend automated suite | 32 files, 126 tests on final release snapshot | Passed |
| Backend automated suite | 698 tests, including actual PDF generation; repeated after dependency patches | Passed |
| Extended HTTP/database regression | 73 scenarios, including document-only resubmission after the final SQL fix | Passed |
| Isolated responsive CRM | 16 screens at 390, 820 and 1440 pixels; 48 screen checks | Passed |
| Portfolio filtering | All / My Portfolio / My Clients at each size; 9 checks | Passed |
| Normal signed-in live CRM | 12 main pages at mobile, tablet and desktop sizes; 36 page checks | Passed |
| Witness signing | All three widths: logo/favicon, declarations, name changes, signature controls, submission, completed reload, two-page PDF, Open PDF, failed-download recovery | Passed with fictional API fixtures |
| CRM signing activity | All three widths: aligned Refresh, refresh while expanded/collapsed, no unintended toggle | Passed with fictional API fixtures |
| Login and reset screens | All three widths: delivery selection, invalid code, back navigation, reset validation and confirmation; remember-device alignment also at 360 pixels | Passed with mocked APIs |
| Tenant public intake | Sole/joint sections at all three sizes, reachable actions and no horizontal overflow | Passed; API mocked |
| Landlord public intake | Sole/joint/company sections at all three sizes, reachable actions and no horizontal overflow | Passed; API mocked |

The 16 CRM screens comprise Dashboard, Properties, Landlords, Tenants, Tenant Enquiries, Landlord Enquiries, Maintenance, Team Calendar, Financials, Marketing, Team and Settings, plus property, landlord, tenant and enquiry detail pages. Checks included uncaught page errors, error boundaries, broken images, repeated portfolio loading, overflowing content and clipped controls. Profile dimensions were checked after the layout fix. Representative screenshots were visually reviewed.

Additional real HTTP/PostgreSQL rehearsals used separate empty local test databases and fictional data:

- Fresh intake: 8 scenarios; fresh onboarding: 15; client service contracts: 16; sole landlord flow: 6; account access: 8.
- Extended regression: 73 scenarios, zero failures, covering role restrictions, joint agreements, signing and conversion, balances, bank allocations, rent schedules, document revisions, marketing permissions, inspections and retained history.
- Guarantor execution, application review and complete journey: evidence uploads, staff permissions, privacy, source-hash/declaration gates, separate witness, immutable PDF, repeat-submit protection, delivery retry and review/credit progression.
- Property workflows: draft changes, sent-application locks, reset invalidation, history retention and client confirmation gates.
- Tenancy changeover and property-creation/fee scenarios: retained history, cancellation, joint billing, idempotency, duplicates and fee validation.
- Guarantor and property workflow suites repeated after runtime dependency updates.

Older integration fixtures were reconciled with the current application: two-factor login, required payment channels/amounts, “Dated Signed” labels, application-sent onboarding status, signed-agreement handover gates and recorded bank verification. Simulated email transport supports explicit failure recipients so success and failure paths remain testable without sending messages.

Final source reconciliation also retained the existing application SMS wording, capitalised delivery status and “Existing Tenant - New Onboarding” pipeline label. The 126 frontend tests and 73 HTTP/database scenarios passed again after those source copies were reconciled; the published signing-activity check and asset comparisons passed again too.

## Verification boundaries

This is responsive browser UAT, not a claim that every physical device/browser combination is bug-free. Edge/Chromium and the normal signed-in in-app browser were used; physical iOS/Safari, Android hardware and the separate Expo app were not tested. Live checks were read-only. Signing, payment progression, deletion and outbound-message tests used isolated data and simulated providers. Real email/SMS delivery, live bank movements and real legal signing were not performed as tests.

The normal live session later returned to sign-in; the completed authenticated checks remain recorded above. Final asset hashes and published login rendering were verified after the responsive release. Backend health is checked separately after publication.

## Releases and evidence

- CRM: `dpl_H17QxzaNnBc96X7giye6LCjD7HTb`, https://crm.fleminglettings.co.uk.
- Public application: `dpl_6YgXmWkV7dUax5DP83ERSb1aHuPe`, https://apply.fleminglettings.co.uk.
- API release: `crm11-witness-uat-4`, image `deployment-01M4NCFC63NY5YV41RZXP67EG9`. Deployment and machine health checks passed; `/api/health` returned HTTP 200 with this release identifier.

Read-only verification of the existing completed Winston test record confirmed the saved guarantor signature, witness completion, signed PDF and frozen landlord/rent/deposit fields. The published CRM and public-form files matched the release snapshot hashes.

Local evidence is under `docs/reviews/2026-10-11/` (ignored screenshots) and `tmp/uat-2026-10-11/` (isolated runner results). No credentials, invitation tokens, actual signed documents or production personal data are included in this release note.
