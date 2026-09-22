# Latest WhatsApp feedback — 22 September 2026

Reviewed the two previously unhandled feedback documents (21 September late night and 22 September 11:22), their supplied HTML/image/tenancy templates, and the 12:17–12:22 chat additions. The private source checklist traces 151 paragraphs/chat items, including examples and document separators.

## Changes

- Accounts: administrator-approved password reset requests, manager account requests with a selected approver, 48-hour single-use account links, activation before first login, password-change confirmations, archived users, role icons and finance-access controls. Uses the supplied email designs and image assets.
- Flemo: the office shares the existing administrator ChatGPT connection; requesting users retain their own CRM data permissions. Only administrators can manage the connection.
- Records: expanding notes with the Add button inside, compact scrolling documents with an explicit category choice, Land Registry label decoding, separate service badges and Property Financials, and a Closed state for client properties. Unlinked-tenant assignment checks occupancy and ownership before saving.
- Landlords: read-only bank details with Update Details, digit formatting, preserved drafts, approval after changes and dated green approval cards. Company identity and director details flow through client agreements; alternative tenancy bank details preserve the master record.
- Dashboard/financials/marketing: wider pipeline, stage and due-time visibility, task ordering/priority colours, calendar counts under each name, selected-year costs, clearer bank allocation fields, campaign names/history and revised composer/file controls. Existing bulk SMS and record communication logging verified.
- Applications: aligned public forms; structured, editable rejection reasons; correct notification controls; monthly default; retained signatures allow resubmission. Browser checks cover desktop/mobile and actual revision submission.
- Agreements: supplied Let Only/rent-collection templates selected by service; Arial and cleaned drafting highlights; company signatories; landlord and tenant delivery choices/previews; inline signing validation. Let Only future rent uses the landlord account while initial rent/deposit requests use Fleming client money. Final receipt records the chosen date and sends selected notifications to joint applicants. Let Only fee totals retain the issued agreement's fee and service snapshot.

## Production records

- Sam and Robert granted administrator access; Administrator retained; Marie and Danyl remain staff; redundant admin remains archived.
- Protector policy 778329-9, 1 April 2026–31 March 2027, linked to both Northwood properties with costs included in service charge. Two underlying files stored once and linked to both records; no added premium expense. Existing Intact quotation retained. Current cover summary excludes terrorism.
- Specified rent allocations and the expired test tenancy were already completed; verified without repeating them. Julia/Katie's bank receipt is £850, despite £800 in the feedback text.
- Corrected the explicitly identified landlord phone number.

## Verification

159 backend unit tests, 46 frontend unit tests, 73 HTTP/PostgreSQL integration scenarios, and six dedicated account-access scenarios passed. Backend/frontend builds passed. Lint: zero errors, one existing Tenants hook warning. Browser checks cover invitations, bank formatting/save/approval, draft persistence, marketing HTML previews, responsive forms and rejected application resubmission. Client PDF text, company/joint signatures and rendered pages checked.

Provider delivery failures remain visible to the office. Automated tests use local databases and no real provider credentials; they do not prove delivery to a real inbox. Email clients can still impose their own dark-mode colours.

No bulk photo uploads. Existing automation remains paused. Previous office follow-ups (full Eclipse EICR, missing ID and unresolved bank allocation decisions) remain separate from this implementation release.
