# Agreement redesign review — 29 September 2026

Status: implemented and previewed locally with fictional records. This agreement redesign has not been deployed. Earlier credit-check fixes were released as `crm29-credit-upload-9`; their release record is in `2026-09-29-onboarding-bank-layout.md`.

## Implemented

- Yellow active tenancy agreement stage after both applicants' credit checks are complete; refresh joint compliance status on stage entry, focus and periodic refresh.
- Contract & Tenancy Particulars summary with landlord, both tenants, service type, fees and landlord-to-tenants signing diagram.
- Separate Agreement Particulars, Landlords Details and Payment Account Confirmation sections, with responsive layouts.
- Optional separate service address; matching addresses use one field and a checkbox.
- Editable payment instructions saved with the onboarding agreement details. Full-management/rent-collection text: “Initial rental payment and holding deposit is paid into Fleming Lettings client money account. Future payments continue to be paid into the client money account.”
- Company account details pop-out shows the business and client-money accounts from company settings, with CMP number and Close control.
- Suggested future-payment account comes from company settings for management/collection, and landlord records for let-only. Changing the account requires an extra confirmation; it applies to this agreement only and does not modify master bank records.
- Compliance upload/replacement and expiry update save directly to the property in one database transaction. Previous files remain in document history. Identical current uploads are reused. Expiry-only corrections are supported.
- Property audit records staff identity, uploaded/replaced document, old/new expiry, linked enquiry, and Tenant onboarding / Tenancy Agreement origin. The enquiry/property relationship is validated before recording the origin.

## Agreement wording follow-up

- User asked to pause changes to generated agreement payment wording. No payment clauses in the APT templates were edited in this redesign.
- Existing rent-collection/full-management APT clause was inspected: it already directs all rent, the initial payment with deposit, and the holding-deposit reference to the client money account, consistent with the user's correction.
- Review **let-only** APT initial-payment wording later: the requested onboarding text describes the company account initially and the landlord account subsequently; the existing generated template still describes client money for the initial payment. Resolve this with the user before changing the contract wording.
- Editable onboarding instructions are saved for review; they do not overwrite APT clauses while that review is paused.

## Validation

- Frontend and backend production builds passed.
- Focused property compliance, payment confirmation, client details, credit submission and application review tests passed. Added regression coverage for audit attribution and rejecting an unrelated onboarding enquiry.
- Fictional browser previews exercise upload/save feedback, separate-address toggle, account override confirmation, company-account pop-out, and mobile/tablet layout.
- Screenshots use fictional people and example bank details. No agreement was issued, signed or emailed and no bank transaction was made during preview checks.

## Git backup scope

All pending tracked application changes and new source modules, migrations, tests, public forms, assets, release notes and selected review screenshots are included in the evening checkpoint. Private environment files, local database/runtime data, client uploads, temporary release snapshots and unreviewed generated documents remain local.
