# Agreement redesign review — 29 September 2026

Status: implemented and previewed locally with fictional records. This agreement redesign has not been deployed. Earlier credit-check fixes were released as `crm29-credit-upload-9`; their release record is in `2026-09-29-onboarding-bank-layout.md`.

## Implemented

- Yellow active tenancy agreement stage after both applicants' credit checks are complete; refresh joint compliance status on stage entry, focus and periodic refresh.
- Contract & Tenancy Particulars summary with landlord, both tenants, service type, fees and landlord-to-tenants signing diagram.
- Separate Agreement Particulars, Landlords Details and Payment Account Confirmation sections, with responsive layouts.
- Address defaults from the company registered address or individual home address. “Is there a different correspondence address?” reveals an optional override, used in the generated APT without changing the landlord master record.
- Read-only advisory payment wording selected automatically by agreement service type. Full-management/rent-collection text: “Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments continue to be paid into the client money account.”
- Company account details pop-out shows the business and client-money accounts from company settings, with CMP number and Close control.
- Suggested future-payment account comes from company settings for management/collection, and landlord records for let-only. Changing the account requires an extra confirmation; it applies to this agreement only and does not modify master bank records.
- Compliance upload/replacement and expiry update save directly to the property in one database transaction. Previous files remain in document history. Identical current uploads are reused. Expiry-only corrections are supported.
- Property audit records staff identity, uploaded/replaced document, old/new expiry, linked enquiry, and Tenant onboarding / Tenancy Agreement origin. The enquiry/property relationship is validated before recording the origin.

## Payment routing and own-portfolio review

- Latest user correction: let-only initial rent and holding deposit go to Fleming Lettings client money; future rent goes directly to the confirmed landlord account. Both the advisory and generated APT use that route.
- Full management and rent collection use the client money account for initial and ongoing payments.
- Own-portfolio APTs use the company business account. The simplified onboarding view shows this advisory and omits landlord details and the landlord-first signing diagram.
- Client APT bank-name/account-name fields now follow the confirmed account, including explicitly confirmed agreement-only overrides.
- Own-portfolio and full-management previews requested for user review before publishing this redesign. No production deployment of this redesign has occurred yet.

## Validation

- Frontend and backend production builds passed. Backend: 566 tests passed across 95 files. Frontend: 102 tests passed across 26 files.
- Focused property compliance, payment confirmation, client details, credit submission and application review tests passed. Added regression coverage for audit attribution and rejecting an unrelated onboarding enquiry.
- Fictional browser previews exercise upload/save feedback, separate-address toggle, account override confirmation, company-account pop-out, and mobile/tablet layout.
- Screenshots use fictional people and example bank details. No agreement was issued, signed or emailed and no bank transaction was made during preview checks.

## Git backup scope

All pending tracked application changes and new source modules, migrations, tests, public forms, assets, release notes and selected review screenshots are included in the evening checkpoint. Private environment files, local database/runtime data, client uploads, temporary release snapshots and unreviewed generated documents remain local.

## Correspondence-address verification

- Generated and extracted text from six fictional PDFs: individual and company, each with default, override and reverted addresses. All six used the expected contract address and left source data unchanged.
- These PDF checks also confirmed client-money initial payments and landlord subsequent rent for let-only, and client-money payments for full management.
- Browser checks confirmed the optional field appears, saves, survives reload, and disappears after switching back and saving; the home-address field retained its original value.
- Let-only review screenshots show the corrected advisory and landlord future-payment account.
