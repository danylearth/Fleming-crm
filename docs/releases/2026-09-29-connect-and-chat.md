# CRM release — 29 September 2026

## Live changes

- The header now has a My Account pill linking to Settings.
- Save Appearance has a save icon; Close Task is a red pill.
- Notifications have My Portfolio / My Clients lists, are anchored beneath the bell, and support per-notification clearing and Clear all. Clearing is per user and does not complete the task. New due-date cycles get new notifications.
- The Fleming house launcher opens Flemo AI, Team Chat, Live Chat and WhatsApp. Open sections stack above the house button. Switching retains the selected chat and draft; all sections have Back to menu and minimise controls.
- Direct chat titles show the other participant. Team Chat supports direct messages, private member groups, department/office conversations and authenticated file sharing. Administrators/managers can select any configured department; staff can use their assigned department. Group history is visible only to its members.
- Delete chat clears the user's local conversation history and hides the conversation until a new message arrives. Shared records and customer activity transcripts remain intact. Other participants retain their copies.
- Website support is available through the supplied widget; installation on the public website remains with the website developer. Visitors currently use guest sessions, not tenant/landlord accounts.
- WhatsApp is prepared for +44 7863 747811, subject to Twilio/Meta sender approval and webhook configuration. The initial connection supports incoming conversations and text replies during the 24-hour window. Template initiation and WhatsApp media handling are not yet implemented.
- Flemo uses an exact property lookup for compliance due-date questions before any AI call or document scan. Numeric address matching is retained; unrelated prior questions no longer broaden new searches. Live test for 99 Ringwood Road returned EICR due 4 December 2028, with one relevant link, in 31 ms within the server.
- Current-month rent charges are generated in advance for active tenancies, and eligible ended tenancies are capped at the scheduled end. Joint tenancies count once. Full monthly rent is retained; an end date on the next billing boundary does not begin another month's charge. The final rental period is labelled final. Agreed mid-period endings require an office final-account review rather than automatic prorating.

## Confirmed live record updates

- Tara O'Hanlon: £875 unpaid, due 30 September 2026. Invoice FL-RENT-000003 covers 30 September–30 October 2026; PDF generation verified. No email was sent.
- Diane Reaney: inventory reminder task 101 completed with the user's explicitly authorised family-tenancy exemption. Reason stored in the task, tenant and property activity logs. No signed inventory was fabricated.
- Exactly 78 New landlord enquiries were moved to Contacted on the user's instruction, adding the campaign reason to notes and audit history. Total Contacted: 79. No additional emails were sent and no follow-up dates were invented.
- The HTML sender-routing report was emailed to accounts@fleminglettings.co.uk and delivery confirmed earlier in the session.

## Notice-period check

GOV.UK says two months is the usual notice period and the maximum a landlord can require; shorter written terms/agreements may apply, including older tenancies. The end date normally falls on the rent-due day or the preceding day. Notice does not have to be served on the billing day. The CRM does not assert that every tenancy has an unconditional two-month minimum.

Sources: https://www.gov.uk/assured-periodic-tenancies-tenants/how-to-end-your-tenancy and https://www.gov.uk/assured-periodic-tenancies-tenants/ending-a-tenancy-that-started-before-1-may-2026

## Validation

Backend and frontend builds passed. Focused tests cover rent due-date/final-period boundaries, exact property matching, notification lifecycle and user-specific dismissal, private/group access, upload validation and per-user chat deletion. Browser checks used fictional local records for group creation, messages, draft preservation, switching, deletion and notification clearing. Live read-only checks verified new routes, anonymous chat rejection, asset hashes and backend release identity.

Website installation and connection instructions: `docs/website-live-chat.md`.

## Follow-up fixes

- Corrected the notification count badge, using the configured accent colour and a visible border. Individual clear controls use red bin icons.
- Team contact search matches names and departments. A separate searchable office/department picker includes configured offices. Group membership can also be searched.
- Campaign history uses compact rows, puts delivery counts and percentage results on the same row, and scrolls within a 360px list.
- Joint rent invoices use both linked tenants' names for the same property and tenancy start. One existing rent-payment source key still produces one invoice. Both tenant records can list that shared invoice.
- Current-month charges receive a saved invoice automatically, including already-paid charges. Saved invoices display their due date. This does not send an email or create another rent charge.
- Invoice recipient address positioning follows the height of the names so long joint names do not overlap the address.
- Financial checks: 15 tests passed across invoice and rent-scheduling tests, including joint recipients, unchanged amounts, date boundaries and repeated invoice generation.

## Final production verification

Release `crm29-joint-invoices-a49ce9a63d` is healthy; production frontend hashes match the staged build. The prior communications API checks confirmed clearable notifications, direct names Marie Ellis / Sam Fleming, and Administration / Head Office / Wolverhampton Office choices.

Both Woodberry tenant records list the same September invoice `FL-RENT-000010`, £1,100 due 5 September 2026, addressed to Mathew Woodberry & Zoe Woodberry. June invoice `FL-RENT-000004` was corrected with an audit entry; its live PDF text includes both names. No duplicate rent due-date rows were found for this joint tenancy. The user has not yet answered whether next month's invoice should also be generated before the calendar month starts; the current calendar-month policy is retained.

Evidence: `tmp/joint-invoices-live-verification.json`, `tmp/joint-invoices-api-live-check.json`, `tmp/chat-controls-api-live-check.json`.

## Final rent-list clarification

The user's later screenshot clarification supersedes the separate Saved Invoices display and calendar-month-only expectation. Rent Payments & Invoices now has one list; the saved document remains accessible through that row's View Invoice button. Upcoming unpaid rent is yellow and ordered before paid history. Amounts use UK comma separators. The scheduler prepares one next instalment in advance (5 October for the Woodberry tenancy), respecting the same final-invoice cutoff, rather than changing an already-paid September charge to unpaid. Current/next-period document storage remains idempotent.

Team Chat uses profile photos when uploaded, with a fallback icon. The picker button says Department. Fleming Connect's menu now fits its options, and its Team Chat / WhatsApp descriptions match the user's requested text.

## Flemo document actions and onboarding test

Flemo now accepts PDFs and JPG/PNG/WebP attachments via the paperclip, paste or drop. A batch supports six files, 15 MB each and 40 MB total. Private staging is user-owned, expires after 24 hours and requires staff permissions. Text/OCR recognition uses the existing connected Flemo account and proposes a person/property, category and explicit certificate dates. Ambiguous matches can be selected manually. The user reviews the proposal before saving.

Generic filing supports properties, tenants, landlords, tenant enquiries, maintenance and landlord enquiries. EICR, EPC and gas dates can be updated with the replacement document in one transaction. Unsatisfactory reports do not clear reminders, and EICR requires an explicit satisfactory overall assessment. ID, income, bank and Right to Rent evidence stays pending review; filing never changes identity/eligibility verification flags. An edited property date invalidates a stale proposal. Repeating an applied request returns the original result without another write.

Documents, compliance changes and resolved tasks retain the signed-in user's ID/name and `via: FlemoAI` in audit records. Activity timelines display the exact marker **Done by FlemoAI** alongside that user's name. Failed saves roll back database changes and remove newly copied files. Unfiled staging files expire automatically. Chats retain the review when switching modules/pages. Every request checks the current database role; viewers cannot upload/review/apply, and the filing service itself also enforces staff access. The workflow does not expose financial transaction targets, edit user permissions or perform payments. Existing email proposals recheck revoked finance access and restricted bank documents before sending.

Validation: 25 focused tests cover document decisions, owner-scoped requests, audit attribution, repeat-save protection, rollback, notification lifecycle, downgraded tokens and revoked finance access. Both builds passed. Browser verification used a fictional local document review and checked the exact audit marker. Live recognition matched a fictional supporting PDF to the test landlord without suggesting compliance or identity verification. An initial live-save check identified a PostgreSQL parameter inference error; explicit integer/text casts were validated against both approved and pending insert plans before the correction was deployed. No partial document or compliance changes survived the failed transaction. The corrected save produced test document 859, audited once as Administrator via FlemoAI; repeating the request returned the same document and KYC stayed unchanged.

User-requested live test fixture: landlord 11, property 26 and linked enquiries 83/84 (Jamie and Casey Taylor, clearly labelled TEST). Fictional email addresses, no telephone numbers, no payments or outbound setup emails. Public application links were checked without accepting terms or submitting either form. Transactional notification probes confirmed both application completions route to Administrator's My Clients list; the probes were rolled back. The bell now also refreshes when returning to the browser tab. Test links are recorded privately in `tmp/onboarding-test-links.json`.

Release evidence: `tmp/release-2026-09-29-flemo-access/manifest.json`, `tmp/flemo-access-live-verification.json`, `tmp/flemo-access-api-verification.json`, `tmp/flemo-sql-verification.json`, `tmp/flemo-filing-live-result.json`, `tmp/flemo-document-review-preview.png` and `tmp/flemo-audit-marker-preview.png`.

### Signing, recovery screen and confirmed rent suggestions — 29 September 2026
- Signing status pills have a fixed width and stay on one line, including in the narrow detail sidebar.
- Page failures retain the signed-in user's appearance provider and display a theme-aware card with the Fleming pill button. The test landlord record and its document/activity history rendered successfully in the local reproduction; the original crash was not reproduced.
- New document signing emails use surname-document-title plus a random 128-bit numeric reference. Previously issued links remain valid and switch to the readable address when opened. Signature, expiry, recipient and cancellation checks are shared; signed PDFs are unchanged.
- Bank assignment offers read-only suggestions from previous user-confirmed, unreversed rent allocations. Different amounts and ambiguous matches remain visible for review. Rent choices include overdue (red), due today (yellow) and advance (green) charges.
- Rent assignments require an explicit confirmation checkbox and server-side `confirm_rent_assignment: true`; edits/splits reset confirmation. The existing transaction audit records the confirming user's identity. No live payment was allocated during development or verification.
- Validation: backend/frontend builds; 20 focused backend tests and one rent date-colour test passed. Browser checks confirmed disabled Save before confirmation, enabled Save after confirmation, reset on charge change, retained Arial appearance in the error fallback, and compact signing badges.
- Release snapshot: `tmp/release-2026-09-29-signing-rent-recovery`; API release `crm29-signing-rent-b416259677`.

### 29 September 2026 — approved rent assignment revision 3
- Deployed the exact approved test build to the CRM frontend: compact, scrollable rent suggestions; fixed assignment header with top-right close; bold Money In/Money Out; confirmation dialog replacing the checkbox, including confirmation before applying suggestions.
- Frontend deployment: dpl_CnpKArt1LppuWcndAaXKv9CtoSRA, aliased to https://crm.fleminglettings.co.uk.
- Build passed. Local browser checks confirmed compact suggestions, close remaining visible while scrolled, and closing without assignment. Prior confirmation flow checks passed on fictional payments.
- Production index, main script/styles and Transactions script SHA-256 hashes match the approved revision. API health is OK; backend release remains crm29-signing-rent-b416259677.
- Snapshot: tmp/release-2026-09-29-rent-revision-3. Verification: tmp/rent-revision-3-live-verification.json. No live transactions assigned during deployment.

### 29 September 2026 — onboarding and service contract feedback
- Deployed API release crm29-onboarding-e549ccbe59 and frontend deployment dpl_173Z53RzRFHqSARiddrPN9rFwhMR, aliased to the CRM domain. Used the prior live backend snapshot plus the scoped service-choice, property lifecycle and holding-deposit status changes.
- Header displays the stored user name in a pill without the email. The service warning is centred red with an exclamation icon; its measured height is added to the onboarding modal, bounded by the viewport.
- Service choice and percentage fees can change before signing/tenancy/AST issuance. Existing unsigned agreements are voided and preserved for audit; replacements require generation and signing. Summary cards distinguish not started (red), draft/awaiting signature (yellow) and signed (green), and show prepared agreement fees.
- Properties become Let Agreed when onboarding starts, including a holding-deposit request, rather than merely being linked to an enquiry. Rejected/abandoned enquiries do not retain Let Agreed. Active and scheduled tenancies retain their appropriate status.
- Added one-time stale-chunk recovery and retained previous fingerprinted frontend assets. Casey's reported crash was not reproduced with the real API fixture; the updated onboarding rendered without console errors. Live browser required sign-in, so authenticated visual checks used the local fixture.
- Populated test property 26, landlord 11 and joint enquiries 83/84 with 18 clearly fictional PDFs and missing sample fields. All document reviews remain pending; application submission, signatures, real payments and messages were not performed. Compliance attachments require user approval before AST issuance. Live readback confirms all 18 files persist, property status To Let and both applications incomplete.
- Validation: frontend build, 42 targeted backend tests, two preload recovery tests and seven rolled-back PostgreSQL property status scenarios passed. Live asset hashes and API release match the snapshot. Unauthenticated service changes return 401; invalid service choices return 400.
- Evidence: tmp/release-2026-09-29-onboarding-feedback/manifest.json, tmp/onboarding-feedback-live-verification.json, tmp/property-status-transition-check.json, tmp/onboarding-final-guards.json, tmp/onboarding-warning-updated.png.
