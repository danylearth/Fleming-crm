# CRM feedback release â€” 25 September 2026

## Changes

- Property cards cycle through distinct colours; compact dashboard alerts and grouped team tasks.
- Land Registry and average rents appear together. Client landlord statistics describe service types and managed occupancy.
- Property-created applicants enter the tenant enquiry/onboarding workflow.
- Record sections have local edit/save/cancel controls and activity change details.
- Tenant completion no longer requires Authority to Contact.
- Financial assignment categories remove duplicate deposit choices; property labels include city and postcode; security deposits support multiple tenants/enquiries at one property without multiplying the payment.
- Inspections use required condition questions with optional attachments, a 3/6/12/annual schedule, and an explicitly attributed historical Good baseline through 25 September.
- Marketing contacts are grouped by channel destination, with source audiences retained. Queued messages show a popup with View Report. The contact column is labelled Contact Details.
- Templates and signatures retain the original compact 600px email presentation, explicit brand colours, and correct character encoding. Marketing unsubscribe links remain in marketing messages; operational messages do not acquire that footer.
- Landlord enquiry records show all named public form fields, including joint owners, company information, property, tenancy, certificates and submitted consent. A coverage test guards form parity.
- Landlord enquiries can convert directly from New, schedule assigned follow-ups or meetings, and send confirmation emails/SMS. Booking retries are idempotent. Future follow-ups leave the active view until due and remain accessible through filters/search.
- Office Address is available for both landlord and tenant enquiry bookings: Creative Industries Centre, Wolverhampton Science Park, WV10 9TG.
- The Making Tax Digital review panel has been removed; the notes were separately emailed as requested.

## Verification

- Frontend production build and 72 tests passed.
- Backend production build and 193 tests passed. The Windows check uses installed Arial/LibreOffice paths.
- Final focused backend regression checks passed after email presentation fixes.
- Migrations 0031, 0032 and 0033 applied successfully to the local demo database.
- Local appointment integration check passed validation, office location, task creation, progression and idempotent retry with messaging disabled.
- Recipient review of the first 25 tests identified enlarged mobile layouts. Removed shared table-width/layout overrides, retained original template sizing, restored side-by-side signatures, and upgraded saved presentation blocks. All 25 revised previews retain a 600px canvas and naturally sized buttons at a 390px browser viewport. Backend build and 11 focused tests passed. Four compact-v2 samples were accepted by the provider for iPhone review; actual mail-client display remains to be confirmed.

## Release requirements

Deploy the backend through the existing Fly.io configuration, whose release command applies migrations, then publish the frontend to its existing Vercel project with its production API setting. Verify the live API health, booking UI, inspection form, record edits and marketing report popup.

This branch does not contain production credentials, personal identity documents, local database copies, or email delivery receipts. The new Fly.io account is signed in but has no apps or access to the existing production organisation. Vercel login verification and existing project access remain pending; production publication has not occurred.
