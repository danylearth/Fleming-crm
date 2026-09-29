# Onboarding layout and holding-deposit bank payments

Published 29 September 2026. User authorised production deployment throughout this task. Guarantor prototype remains excluded and test-only.

CRM production deployment: `fleming-portal-1wd1hn6e2-danyls-projects-1551df91.vercel.app`, aliased to `crm.fleminglettings.co.uk`. Entry: `/assets/index-1mfOanE_.js`. All 77 current build JS/CSS files matched live bytes. Public service agreement, completion and application pages also matched their previously deployed release files.

API production release: `crm29-holding-bank-layout-4`, healthy on Fly. Deployment used the existing isolated `tmp/release-2026-09-29-service-save/backend` snapshot, adding only updated `bank-reconciliation.ts` and new `holding-deposit-matches.ts` to the previously verified production snapshot.

Changes:
- Consistent viewport-sized onboarding dialog, compact joint panels, purple joint-application pill, compact named link cards and full-width named tracking bubbles.
- Matched amount/date label fonts, 40px inputs, 10px corners; title-case medium-weight Confirm Payment.
- Larger, semibold Continue actions in enquiry cards and table.
- All authenticated CRM users can see matching incoming GBP bank transactions and assign one specifically to the holding deposit. Matching uses the expected/outstanding deposit amount or a full applicant name, including the joint partner. The general bank-feed route retains finance restrictions.
- Assignment revalidates availability and the enquiry match under row locks, fixes the allocation purpose and joint participants server-side, audits the allocation, and uses the existing shared progress calculation. Bank allocations and reversals refresh joint onboarding state. Onboarding polls every 15 seconds and on focus; partial payments remain pending.

Validation: frontend and backend builds passed; 18 focused matching, route access, stale allocation, joint allocation and deposit calculation tests passed. At 1280x720, both Jamie's and Casey's populated local fixture views had 463px panel client/scroll heights (no internal scrolling), and the wizard retained its 686px inner height across stages. No live bank payment was assigned and no client email was sent during verification.

Evidence: `tmp/holding-deposit-bank-tests.log`, `tmp/holding-bank-live-verification.json`, `tmp/contract-final-preview/onboarding-final-fit.png`.

## Final application and joint-review release

Published 29 September 2026, verified at 16:50 UTC. CRM deployment `dpl_EWyWaDdPyE8xgyUiUN4maTNXRRwN` (`fleming-portal-dvazbh2mq-danyls-projects-1551df91.vercel.app`), entry `/assets/index-Tvnz71BF.js`. Public forms deployment `dpl_ByDK3Fjd1qsr2TCpABcY7Sq1BKZx` (`tenants-subdomain-9p4p8oabc-danyls-projects-1551df91.vercel.app`). API `crm29-joint-review-7`, final image `deployment-01M3Q137J5R9MNVA7G4XPKP8C2`. Landlord spacing release `dpl_GCpzxhP9C8BDAQBG5hpEUtinXUHS` remains live and byte-verified.

- Application pages, tenancy information, next of kin, compact spacing, purple subsection headings, joint-applicant DOB prefill, wording, read-only grey rent/deposit amounts, document guide bubbles and GOV.UK share-code link updated as requested. All pencil edit icons removed following the user's final correction.
- Signature dialogs centred in the viewport; ink cropped with padding and displayed without distorting its aspect ratio across the shared public/CRM editors.
- All eight onboarding navigation buttons are 52px high. Every stage uses identical header padding, independent of approval state.
- Joint application review uses separate equal-width applicant panels. Individual answer sections and supporting documents have separate review decisions; approved rows turn green. Existing overall approvals remain respected. Approved answers are locked in the public UI and protected in draft/submit handlers; partial approvals survive resubmission. Approved declarations retain their original signatures.
- Joint completion produces one ready-for-review notification after both applicants submit. New revisions generate a fresh notification key even if the other applicant is approved. Dismissal cannot reveal an older duplicate. Dashboard pipeline shows Ready for Review even when a future follow-up date exists.
- Production form deployment now pins its own Vercel configuration explicitly and verifies both short and `/onboarding/` routes. This fixes the earlier deployment configuration mix-up that sent Jamie's link to initial registration.

Validation: 20 focused backend tests, 12 frontend pipeline/review tests and 8 public-form/signature tests passed; both builds passed. Local browser checks confirmed equal-width joint panels, isolated per-applicant section approvals, green approved rows, locked reopened fields and identical stage heading coordinates. 89 live release checks passed, including every current CRM JS/CSS asset, both exact Jamie/Casey short links, public signing assets, landlord HTML and API health. Read-only production check returned exactly one joint ready-for-review notification with both fictional applicants submitted. No live application approval, signature, email or bank transaction was performed during verification.

Evidence: `tmp/onboarding-release-verification.json`, `tmp/joint-review-api-check.json`, `tmp/joint-review-fly-final.log`, `tmp/joint-review-crm-vercel.log`, `tmp/joint-review-public-vercel.log`, `tmp/contract-final-preview/joint-review-approved-section.png`.

## Review refinements, joint credit checks and responsive follow-up

Published 29 September 2026 following the user's explicit request to push the changes for review on the test records. Final CRM deployment: `fleming-portal-ltlllhadb-danyls-projects-1551df91.vercel.app`, entry `/assets/index-KMoZGySM.js`. Final tenant form deployment: `tenants-subdomain-21wo2z6l4-danyls-projects-1551df91.vercel.app`. API release: `crm29-review-credit-8`; additive migration `0060_application_document_overrides.sql` applied and verified.

- Joint credit checks show independent named applicant panels with manual score/rating, report upload, reference and additional details. Shared styled dropdowns and normal section headings are used. Both applicants must complete the credit stage before it counts as complete; missing or stale partner data cannot satisfy that requirement. Canopy automation is not enabled by this release.
- Review sections compact when approved; section controls are equal size and aligned to the right. Missing mandatory document types can be explicitly overridden with audit logging. Existing rejected documents still require resolution. Rejections suppress application approval and promote the change request action.
- The tenant update page lists rejected items and their saved free-text reasons, with Click to Add buttons, the paperwork emoji in the heading and Review and Submit ✅. Approved answers remain locked.
- Compact notes and right-aligned application approval, grouped income values, two-letter initials, purple joint badges, short hyphenated addresses and raised Continue buttons are included. Card date/property text and icons are enlarged to 12px.
- Dashboard pipeline names omit honorifics, enquiry types stay on one line, Last Agent replaces Previous Agent, and the shortened compliance heading fits beside its filter. Sidebar spacing accommodates all navigation items at the tested desktop height.
- Phone layouts use full-width answer content and touch-sized actions. Joint review and credit panels stack with natural height on phones/tablets. Tenant update buttons expand to full width on small phones.

Validation: frontend/backend builds and focused frontend, backend and public-form tests passed. Browser checks covered 390x844 phone, 820x1180 tablet and desktop layouts. Final 89 live checks passed, including byte matches for the current CRM build and public forms, both fictional applicant shortlinks and API health. Read-only production checks confirmed records 83/84 remain application-approved with credit checks incomplete. No live credit result, application decision, email or payment was submitted during verification.

Evidence: `tmp/review-credit-release-verification.json`, `tmp/review-credit-api-verification.log`, `tmp/contract-final-preview/sign-off-images.md`.

## Credit upload fix and compact controls

Published 29 September 2026. CRM: `fleming-portal-6b7wucqyy-danyls-projects-1551df91.vercel.app`, entry `/assets/index-Dz3RIvPX.js`. API: `crm29-credit-upload-9`, healthy.

- Fixed a multipart upload crash in the service-agreement middleware: `req.body` is not populated before Multer runs. The guard now uses an empty-body fallback and validates the enquiry's stored property, preserving the service-agreement requirement.
- Manual credit completion requires a non-negative whole numeric score and a report; rating alone cannot enable saving. Enforced in the UI and API.
- Credit score and rating use matching 44px controls, regular-weight text and aligned labels. Rating and bankruptcy use the same compact dropdown style as application review. File selection has an aligned custom display, purple selected state, filename and Ready to save wording; completed reports remain green.
- Removed duplicate instructions and the requested action-box sentence. Reduced panel spacing and placed the action heading/button on one row where space permits. Default desktop panels have no internal scrolling; expanded details and narrow displays retain one parent scroll for accessibility.
- Stage headings and applicant names match Application Review exactly in measured desktop coordinates. Sidebar labels reduced from 17px to 16px; enquiry card names moved 8px nearer the avatar, with optically centred initials.

Validation: frontend build passed; 3 frontend and 8 backend tests passed. Backend tests exercised the actual extracted service guard and credit save handler with multipart data, a mocked database transaction, rating-only rejection and service-agreement denial. No live credit result was submitted. Remote API build and deployment passed. Browser checks at 1536x864 measured both panel client/scroll heights as 542px and the parent as 608px (no overflow). Score/rating controls were both 44px high, aligned, 16px and weight 400. Phone width 390px had no horizontal overflow. All 89 live release checks passed.

Evidence: `tmp/credit-compact-release-verification.json`, `tmp/credit-upload-fix-fly.log`, `tmp/credit-compact-vercel.log`, `tmp/contract-final-preview/credit-check-compact-upload-ready.png`, `tmp/contract-final-preview/enquiry-card-centred-initials-close-name.png`.
