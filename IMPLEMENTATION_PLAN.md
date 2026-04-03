# Implementation Plan

<!-- Release: Production UAT Sprint -->
<!-- Audience: Fleming Lettings property management staff -->
<!-- Spec: specs/production-readiness.md -->

## High Priority

### Backend Parity & Data Integrity

- [x] **Add `logAudit` to `PUT /api/tenant-enquiries/:id` in `index-pg.ts`** — Line ~1186. Handles ALL enquiry edits and status progressions but has zero audit logging. Detect status changes (compare old vs new status) and log as `status_changed` with `{from, to}`. Log field edits as `update`. Single biggest activity timeline gap. Per spec 1.3.

- [x] **Add `logAudit` to `POST /api/documents/:entityType/:entityId` in `index-pg.ts`** — Line ~1861. Document uploads not audit-logged. Log as `document_upload` against parent entity. Per spec 1.3.

- [x] **Add `logAudit` to email-sending endpoints in `index-pg.ts`** — Holding deposit request (`POST /api/tenant-enquiries/:id/request-holding-deposit`) and any future email sends should log as `email_sent` with `{to, subject}`. Per spec 1.3.

- [x] **Add missing `POST /api/tenancies` to `index-pg.ts`** — Exists in `index.ts` line 2478 but missing from PG. Creates tenancy record, sets property status to `let`. Production 404 risk.

- [x] **Add missing `DELETE /api/tasks/:id` to `index-pg.ts`** — Exists in `index.ts` line 2070 but missing from PG. Individual task delete with document cascade. Only bulk-delete exists in PG currently.

### Activity Timeline (spec 1.3)

- [x] **Add `document_upload`, `status_changed`, and `email_sent` action types to `ActivityTimeline.tsx`** — Add to `ACTION_CONFIG` (currently 8 types at line 15). Use FileUp for documents, ArrowRight for status changes, Mail for emails. Add inline body rendering for status changes (show from→to) and emails (show recipient/subject).

- [x] **Ensure onboarding field changes are captured in audit changes object** — When `PUT /api/tenant-enquiries/:id` saves onboarding toggles (ID verification, credit check, etc.), the `logAudit` changes object must include which specific onboarding field changed, not just a generic update.

### SMS Module (spec 1.2, per specs/twilio-sms.md)

- [x] **Make SMS text box auto-expand** — In `EnquiryDetailV3.tsx` line ~764, replace `<input>` with `<textarea>` using CSS `field-sizing: content` or controlled resize. Per spec 1.2.

- [x] **Replace SMS send button with message icon / "Send" label** — Update button in `EnquiryDetailV3.tsx` standalone SMS compose area (line ~770). Per spec 1.2.

- [x] **Add Twilio delivery status webhook** — Create `POST /api/sms/status` (unauthenticated) in `index-pg.ts`. Parse `MessageSid` + `MessageStatus` from urlencoded body, update `sms_messages.status`. Add `express.urlencoded()` middleware. Per specs/twilio-sms.md#3.

- [x] **Pass `statusCallback` URL when sending SMS** — In `backend/src/sms.ts` line ~30, add `statusCallback: \`${BASE_URL}/api/sms/status\`` to `client.messages.create()`. Requires `BASE_URL` env var. Per specs/twilio-sms.md#2.

- [x] **Show delivery status badges on SMS history** — In `EnquiryDetailV3.tsx` line ~747, update status badge rendering to handle `delivered`/`queued`/`undelivered`/`failed` (currently only `sent`/`failed`). Add manual refresh button for status polling.

### Email Preview & Templates (spec 1.7, per specs/resend-email.md)

- [x] **Create editable email preview modal component** — New `frontend/src/components/v3/EmailPreviewModal.tsx`. Renders email HTML in iframe/sandbox, with editable subject and body fields. "Send" button fires callback. Mount in `EnquiryDetailV3.tsx` for holding deposit and application emails.

- [x] **Create tenancy application email template in `email.ts`** — New `tenancyApplicationEmail()` function. Subject: `Tenancy Application – {PropertyAddress}`. Body per spec 1.7: pre-populated fields, bank details (Sort 20-08-64, Acct 03803880, Fleming Lettings, Barclays), company footer, 2-week deadline.

- [x] **Add "Send Application Email" trigger** — Button in `OnboardingWizard.tsx` (Step 1 or new workflow step) that opens EmailPreviewModal with tenancy application template pre-filled, allows editing, then sends via backend.

### Tenant Application Form Overhaul (spec 1.8)

- [x] **Fix application form API base URL** — In `tenants-subdomain/application.html` line 513, URL was hardcoded to `valiant-alignment-production.up.railway.app` (wrong). Changed to dynamic hostname detection matching `index.html` pattern, pointing to correct `fleming-crm-api-production-7e58.up.railway.app` backend.

- [x] **Mobile-optimize application form** — In `application.html`: increase touch targets to 44px min, add `inputmode` attributes on numeric/tel fields (currently missing), add sticky step indicator, improve padding. Viewport meta already exists. Per spec 1.8.

- [x] **Match application form styling to registration form** — Update fonts, box styles, logo, header ("Your tenancy application form"), "14 days" deadline text. Match `index.html` design. Per spec 1.8.

- [x] **Add edit icons on pre-populated read-only fields** — Personal info fields (name, email, phone) are pre-populated and read-only. Add pencil/edit icon that enables inline editing. Per spec 1.8.

- [x] **Fix date fields to DD/MM/YYYY format with calendar icon** — Currently plain text inputs. Add date picker or formatted input matching registration form. Per spec 1.8.

- [x] **Restructure employment section** — Replace flat employer/income fields with conditional sections per spec 1.8: Employed (employer name, address, contact, years of service, pay frequency, annual salary, other income), Self-employed (similar + tax years), Unemployed/Student/Retired (annual income only).

- [x] **Add references section with consent checkboxes** — Per spec 1.8: Employer ref (name/dept, phone, email, employee ID) and Previous Landlord ref (name/dept, phone, email, property address) each with mandatory "confirm we can contact" checkbox. Replace current basic name/phone/email fields.

- [x] **Expand next of kin to 2 entries with address field** — Currently 1 entry with name/phone/relationship. Expand to 2 entries, each with name, address, contact number, relationship. Per spec 1.8.

- [x] **Add 8 declaration checkboxes** — Replace current 2 checkboxes with 8 mandatory declarations per spec 1.8 (holding deposit T&C, accuracy, GDPR, employer/bank/landlord enquiries, How to Rent guide, credit check, T&C, marketing).

- [x] **Replace "previous address" with "Add a previous address" button** — Change always-visible previous address field to a button that reveals fields on click. Per spec 1.8.

- [x] **Add free-text box** — "Is there any further information you would like to submit?" textarea before declarations. Per spec 1.8.

- [x] **Update `POST /api/public/application-form/:token` to accept new fields** — Backend must accept expanded employment, references, next of kin (2 entries), and declaration fields. Update both `index.ts` and `index-pg.ts`.

### UI Bug Fixes (spec 1.6)

- [x] **Fix security deposit pre-population** — Remove `Math.round(rent * 5 / 4.33)` auto-calculation in `OnboardingWizard.tsx` line 50 and `EnquiryDetailV3.tsx` line 705. Leave security deposit field empty for manual entry. Keep holding deposit auto-calc. Per spec 1.6.

- [x] **Fix holding deposit input for full number entry** — Change from `type="number"` to `type="text" inputmode="numeric"` with validation pattern, allowing paste and full number entry. In both `EnquiryDetailV3.tsx` and `OnboardingWizard.tsx`. Per spec 1.6.

- [x] **Fix light mode date picker contrast** — In `DatePicker.tsx`: remove hardcoded `text-white` on hover states (line 183), today highlight (line 184), and "Today" footer button (line 200). Replace with `text-[var(--text-primary)]` or theme-aware values. "Clear" button (line 205) already uses CSS vars correctly. Per spec 1.6.

- [x] **Investigate and fix "Progress" screen glitchiness** — Workflow modal in `EnquiryDetailV3.tsx` lines 803–837. Check for: stale closures in `setWorkflowMode` callbacks, DatePicker portal positioning inside modal, Select dropdown z-index conflicts with modal overlay.

### Onboarding Improvements (spec 1.9)

- [x] **Show detail content in completed onboarding steps** — Steps are already expandable (all clickable regardless of status). Issue: completed steps don't show meaningful details. For completed Application Form: show PDF/signature. For completed Holding Deposit: show date/amount/email sent. For completed ID Verification: show uploaded documents. Per spec 1.9.

- [x] **Add document upload to ID Verification step** — `OnboardingWizard.tsx` Step 4 (lines ~353–393) currently only has "Mark Verified" toggles. Add file upload input for ID documents using existing documents API. Per spec 1.9.

- [x] **Change Application Form step to progress tracker** — Step 3 partially done (shows "Waiting for tenant" and URL). Enhance: add visual progress states (not sent → sent/waiting → completed), show completion timestamp when done. Per spec 1.9.

- [x] **Change Holding Deposit step to tracking view** — Replace current send-only UI with tracking: show date email was sent, email preview/attachments summary, and "Date Deposit Received" field sourced from onboarding checklist data. Per spec 1.9.

- [ ] **Pre-populate enquiry record from completed application form** — In `POST /api/public/application-form/:token` handler (both `index.ts` and `index-pg.ts`), after saving form data, UPDATE the parent `tenant_enquiries` record with employment, address, and personal details from the submission. Per spec 1.9.

## Medium Priority

### Tenant Registration Form Fixes (spec 1.1)

- [ ] **Fix form submission error on apply.fleminglettings.co.uk** — Investigate `tenants-subdomain/index.html` form POST to `/api/public/tenant-enquiries`. Check backend CORS, endpoint URL config, error responses. Test locally with both SQLite and PG backends. Note: `application.html` had wrong API URL — check if `index.html` has similar issues.

- [ ] **Fix property search grey screen** — In `index.html`, the `cs-overlay` (line 1575) appears when custom select opens. Properties load from `/api/public/properties` (called at page init line 2311 AND on demand). If API is slow, overlay shows with empty dropdown. Fix: ensure loading spinner inside dropdown, or preload more aggressively.

### Property Linking (spec 1.4)

- [ ] **Improve property search/select UX on enquiry detail** — In `EnquiryDetailV3.tsx` lines 583–591, the linked property `<Select>` is not searchable (unlike the viewing booking select at line 855 which IS searchable). Add `searchable` prop or replace with combobox.

### Joint Applicant Handling (spec 1.5)

- [ ] **Fix Applicant 2 document upload** — Document upload for joint applicant currently non-functional. Investigate existing upload code and wire up to documents API with correct entity linkage.

- [ ] **Create separate interlinked enquiry records for joint applicants** — Currently joint applicants stored as `_2` suffix columns on single record. Per spec 1.5: create individual `tenant_enquiry` records linked via `joint_partner_id` field. Requires schema change + UI updates.

- [ ] **On conversion, create two separate tenant records** — When converting a joint enquiry, create individual tenant records for both applicants and link both to the property. Per spec 1.5.

### Google Places Address Autocomplete (per specs/google-places-autocomplete.md)

- [ ] **Implement Google Places in `AddressAutocomplete.tsx`** — Replace stub (29 lines, just a plain input with helper text) with working Google Places integration. Use `@googlemaps/js-api-loader`, legacy Autocomplete widget, `componentRestrictions: { country: 'gb' }`. Requires `VITE_GOOGLE_PLACES_API_KEY`.

- [ ] **Add Google Places to application form** — In `tenants-subdomain/application.html`, add Google Maps JS API script and autocomplete for address fields (current, previous, employer). Per spec 1.8.

### Viewing Booking Performance (spec 1.6)

- [ ] **Investigate slow viewing booking submission** — `POST /api/property-viewings` (index-pg.ts line 2216) creates viewing, updates enquiry status, creates task, and optionally sends SMS synchronously. Profile to identify bottleneck — likely SMS send blocking response. Consider making SMS send fire-and-forget.

### V1/V2 Cleanup (spec Workstream 2)

- [ ] **Delete all V1 page files (16 files)** — `Dashboard.tsx`, `Properties.tsx`, `PropertyDetail.tsx`, `Landlords.tsx`, `LandlordDetail.tsx`, `LandlordsBDM.tsx`, `LandlordBDMDetail.tsx`, `Tenants.tsx`, `TenantDetail.tsx`, `TenantEnquiries.tsx`, `TenantEnquiryDetail.tsx`, `Maintenance.tsx`, `Transactions.tsx`, `Tasks.tsx`, `Login.tsx`, `ApplicantConcept.tsx`. Delete `Layout.tsx` from `components/`.

- [ ] **Delete all V2 page files (10 files)** — `DashboardV2.tsx`, `EnquiriesV2.tsx`, `EnquiriesListV2.tsx`, `TenantsV2.tsx`, `BDMV2.tsx`, `MaintenanceV2.tsx`, `TasksV2.tsx`, `TransactionsV2.tsx`, `PropertiesV2.tsx`, `LandlordsV2.tsx`. Delete `AILayout.tsx` from `components/`. Delete `useAIChat.ts` from `hooks/`.

- [ ] **Remove V1/V2 routes and imports from `App.tsx`** — Remove V1 routes (lines 98–124), V2 routes (lines 127–138), and all corresponding imports. 23 routes to remove.

- [ ] **Rename all V3 files to drop suffix (19 files)** — `DashboardV3.tsx` → `Dashboard.tsx`, etc. Update all imports across the codebase. List: DashboardV3, PropertiesV3, PropertyDetailV3, LandlordsV3, LandlordDetailV3, TenantsV3, TenantDetailV3, EnquiriesV3, EnquiriesKanbanV3, EnquiryDetailV3, BDMV3, BDMDetailV3, MaintenanceV3, TasksV3, TaskDetailV3, TransactionsV3, UsersV3, SettingsV3, LoginV3.

- [ ] **Update route paths to remove `/v3` prefix** — Change `/v3/properties` → `/properties`, etc. Update default redirect from `/v3` to `/`. Update `V3Layout.tsx` sidebar nav links. Update any hardcoded `/v3/` links in components.

- [ ] **Fix TypeScript compilation after V1/V2 deletion and V3 rename** — Run `cd frontend && npm run build` and fix all broken imports/references.

## Low Priority

### Systematic Audit (spec Workstream 4)

- [ ] **Audit all V3 pages load without console errors** — Visit each page in dev, check for React errors, missing data, broken layouts. Test both light and dark mode.

- [ ] **Audit all CRUD endpoints** — Test create/read/update/delete for every entity via the UI. Verify data persists correctly in PG.

- [ ] **Audit conversion workflows end-to-end** — Test BDM → Landlord and Enquiry → Tenant conversions. Verify data copies correctly and source records marked as converted.

- [ ] **Audit public form → CRM pipeline** — Submit tenant enquiry via `apply.fleminglettings.co.uk`, verify it appears in CRM kanban. Submit landlord enquiry, verify in BDM pipeline.

- [ ] **Audit Government API integrations** — Test Land Registry, Postcodes.io, EPC, Companies House, Council Tax lookups on property detail page.

- [ ] **Test responsive behavior on all V3 pages** — Check all pages at tablet and mobile breakpoints. Identify and fix layout issues.

### Future Release (Out of Scope)

- [ ] _Twilio webhook signature validation (`twilio.validateRequest()`) — security hardening_
- [ ] _Inbound SMS handling — receiving texts from tenants/landlords_
- [ ] _Resend webhook integration for email delivery tracking_
- [ ] _SMS templates for non-viewing scenarios (rejections, follow-ups, rent reminders)_
- [ ] _SMS character count / segment cost display in UI_
- [ ] _Rate limiting on public API endpoints_
- [ ] _Test framework setup and unit/integration tests_
- [ ] _Mobile app (Expo) audit and feature parity_
- [ ] _Next of kin data display in CRM enquiry/tenant detail pages_
- [ ] _Guarantor fields on tenant application form_
- [ ] _Port `scheduler.ts` to PostgreSQL — currently imports SQLite `db`, not PG `pool`, so compliance/tenancy reminders are inactive in production_
- [ ] _Standardize application.html API URL configuration (env-based or dynamic detection)_
