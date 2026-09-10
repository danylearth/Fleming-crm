# September 9 delivery status

Source scope: WhatsApp Chat - CRM (4).zip, including the pt2 090926 and third-doc feedback, Ringwood files and William application/APT pack. Deployment was authorised after verification.

## Implemented and deployed

- [x] Communications All/Email/SMS chips; centred email preview; editable onboarding/tenancy-end SMS; shared public-form typography; consistent record icons and tenancy layout.
- [x] Conditional guarantors, ID upload slots with pending/approved distinction, contact consent, NOK labels, property zero-rendering fix, persistent Features/CCTV, status colours, readable unique record URLs, sidebar identity/logout.
- [x] Administrator-only tenant/property archive/delete controls; shared-file preservation and rollback safety; user access controls, activity metrics, permission queue and working dark mode; dashboard new enquiries and soft clear-recent-tasks.
- [x] Rent Last Reviewed, backfill for current active tenancies, annual reminders; client-landlord and joint APT workflows verified.
- [x] Flemo's five portfolio-aware record lookups and optional speech input; web inventory rooms/photos/notes/completion; interactive maps without a tile API key.

## Live operations completed

- [x] Five tenant corrections; Ringwood bedrooms set to three and historic costs labelled 2023–2024; William created as scheduled tenant #29 for 21 September. Existing occupants retained.
- [x] 42 document links from 34 unique files imported and SHA-256 checked; the import was rerun with zero changes or duplicates: Mathew 9, Zoe 12, William 16, Ringwood property 4, Northwood property 1. New evidence is pending review, not automatically KYC-verified.
- [x] accounts@ is the sole active administrator, named Administrator. admin@ disabled with historical audit preserved.
- [x] Existing Fleming Resend endpoint verified, missing signing secret applied. Controlled accounts-inbox email Delivered; sent/delivered webhooks returned HTTP 200 and CRM recorded Delivered.
- [x] Twilio number's incoming SMS URL changed from the demo reply endpoint to the CRM. Outbound callback base configured. Reviewed seven days of incoming-message history: none to recover. Observed delivery error 30005 is a destination-handset error.

## Remaining dependencies

- [ ] Office to provide Mildred guarantor source form: not found in available archives/live documents.
- [ ] Office to confirm Marcin/Klaudia's end date at 21a Northwood. William remains scheduled and cannot displace active tenants.
- [ ] Real test-mobile reply to verify the corrected Twilio routing with a handset.
- [ ] Bank connection: FreeAgent recommended for the existing accounting workflow; requires provider OAuth setup and business-account consent. Existing TrueLayer code also lacks live client credentials. No live feed is claimed.
- [ ] Native distribution: iOS simulator build finished; replacement Android APK build is queued. Apple signing/store ownership and physical-device acceptance remain outstanding. Expo build dependencies retain advisories.

## Verification and release evidence

- 176 unit tests pass: 135 backend, 41 frontend. 32 real PostgreSQL/HTTP integration scenarios pass, including ID files pending vs rejected, client and joint signing, deletion rollback/shared files, incoming SMS deduplication, permissions/activity and inventory photo access.
- Frontend/API builds, native TypeScript checks and Android/iOS JavaScript exports pass. ESLint: zero errors, two existing hook dependency warnings.
- Browser checks: mobile CRM, desktop public application and tablet maintenance form; authenticated live API checks for team, activity, properties, tenant #29 and all five Flemo queries. Resend delivery independently observed in provider dashboard and CRM database.
- API source release: `670d7f9`; frontend: `406f387` (including the verified light/dark Flemo contrast fix). Public form typography source: `5dd8765`. Production URLs: https://crm.fleminglettings.co.uk, https://apply.fleminglettings.co.uk and https://report.fleminglettings.co.uk.
- Private pre-change database snapshot: 28 tables / 2,220 rows; upload-volume snapshot `vs_MGb7e0wyb9vi2oggoQm`, five-day retention. Imported personal files and credentials are outside source control.
- Android build: https://expo.dev/accounts/danylnucleus/projects/fleming-crm/builds/616368a1-c5a4-4821-9ea1-0d58ca880475
- iOS simulator: https://expo.dev/accounts/danylnucleus/projects/fleming-crm/builds/8cbd8404-66fa-4b79-9f60-30cbc5408977
- Readable seven-page report and reproducible generator are in the workspace's `../reports/` folder. It includes record gaps, Resend/Twilio runbooks, bank-feed advice and native build instructions.
