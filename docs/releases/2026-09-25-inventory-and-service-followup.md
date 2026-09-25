# 25 September: inventory plan and service-contract follow-up

## Service contracts

- Client property creation now continues into contract preparation from both Properties and the landlord record. Staff review fees, create a draft, preview its email and explicitly issue it.
- Existing Let Only, Rent Collection and Full Management HTML/Word templates are retained.
- Missing or unapproved master bank details no longer prevent drafting. Existing values are proposed to the landlord; missing values must be completed before signing. All signing requests still require explicit bank confirmation and valid bank fields on the server.
- Bank edits clear the checkbox and invalidate the signature preview. A changed generated-signature name clears that signature. Confirmed alternatives remain scoped to the property agreement; other properties' bank details are not overwritten.
- The service signing page and tenancy signing page share `signing-layout.css`, using the same logo, purple/pink header, panels, controls and green signing action. The service form includes generated/drawn signatures and document zoom. Unique random agreement tokens remain in use.
- Landlord Properties rows show contract draft/issued/viewed/completed status, with completed contracts in green. Contract actions open from the property row; the separate landlord Service Contracts section is removed. Property records retain their contract actions.
- Signed PDFs are linked to both landlord/property records using one underlying file and display name `Service Contract - SERVICE TYPE - Full property address.pdf`.
- Migration `0034_service_agreement_viewed.sql` adds the first signing-link view time. Apply it before deploying the updated API. Existing agreements have no invented historical view date.

## Other deliverables

- Inventory functionality/planning report: `docs/reviews/mobile-inventory-plan-2026-09-25.md`. Emailed to accounts@fleminglettings.co.uk through the configured email service; provider accepted the message. Delivery receipt is retained locally, outside this release note.
- Seven supplied inventory template/source/preview files saved unchanged and hash-verified under `docs/templates/inventory/2026-09-25-originals/`. These are future implementation references, not active template replacements.
- Saved-note widths and right-aligned deletion corrected on landlord/tenant enquiry detail pages.
- Interactive MTD demonstration created separately with fictional data, record classification, owner shares, approval gates and a simulated submission receipt. No real MTD provider or HMRC submission is connected.

## Verification and release status

- Backend and frontend builds passed; frontend still reports the existing Leaflet image resolution warnings.
- Twelve focused service-contract/PDF tests passed, covering all service types, blank/pre-filled bank data, mandatory confirmation and identical signed-file naming/linking on both records.
- Signing page browser checks used fictional local data at 320, 390, 768 and 1024 pixel widths. No horizontal page overflow; bank inputs retain 16px text. Verified preview gating, bank-edit confirmation reset, generated-name signature reset and contained PDF zoom. These are browser viewport checks, not physical-device certification.
- MTD prototype classification and simulated submission flow tested in the browser.
- Changes remain local. No client contract was sent or signed during testing; no production migration or deployment was performed.
