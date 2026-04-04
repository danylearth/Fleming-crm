# Production Readiness: Fleming CRM UAT & Cleanup Sprint

**One-liner:** Get Fleming CRM production-ready by implementing client feedback, deleting V1/V2 dead code, fixing known bugs, and auditing V3 + backend end-to-end.

## Problem / Solution

**Problem:** The CRM has accumulated three UI versions (V1/V2/V3), unimplemented spec features, and client-reported bugs from the April 1st feedback session. It cannot be deployed to production in its current state.

**Solution:** A focused sprint covering four workstreams — client feedback implementation, V1/V2 deletion + V3 rename, bug fixes, and systematic V3 + backend audit.

---

## Workstream 1: Client Feedback (from `crm feedback 01.04.docx`)

### 1.1 Tenant Registration Form Fixes
- [ ] Fix form submission error on `apply.fleminglettings.co.uk`
- [ ] Fix property search: "Are you interested in a specific property?" → searchable pre-populated box with un-tenanted properties not appearing (screen goes grey)

### 1.2 SMS Module Improvements
- [ ] Text box auto-expands vertically as user types beyond one line
- [ ] Replace action button with message icon or "Send" button
- [ ] Display sent SMSs below the input with timestamp
- [ ] Show delivery status (delivered/pending/rejected) from Twilio callback
- [ ] Connect SMS module to Twilio account (credentials: accounts@fleminglettings.co.uk)

### 1.3 Activity Timeline
- [ ] Track ALL record activity: page views, edits, document uploads, SMSs sent, onboarding updates, notes, progression/rejections
- [ ] Show user ID, time, and date for each activity entry
- [ ] Application form link clicks and completions should appear in timeline

### 1.4 Tenant Enquiry → Property Linking
- [ ] Add clear section/box to search and select a property for the enquiry
- [ ] Property record must NOT show the tenant enquiry as a "linked tenant" until fully converted and onboarded

### 1.5 Joint Applicant Handling
- [ ] Fix: Document upload for Applicant 2 does nothing — make it work
- [ ] Joint applicants should have their OWN individual tenant enquiry records, interlinked as joint
- [ ] On conversion, both tenants show as individual linked records under the property page > tenants

### 1.6 CRM Performance & UI Bugs
- [ ] Fix glitchy pages — boxes jumping, not allowing user to select options (investigate across all pages, especially "Progress" screen)
- [ ] Light mode: selected date not visible — fix contrast/styling
- [ ] Viewing booking submission is very slow — investigate and fix
- [ ] Holding deposit input: only allows one number at a time — change to freetext numeric input allowing full number entry
- [ ] Security deposit should NOT pre-populate

### 1.7 Email Preview & Templates
- [ ] Show email body preview before sending (like SMS preview)
- [ ] Allow user to edit email content before sending
- [ ] Implement tenancy application email template with pre-populated fields:
  - Subject: `Tenancy Application – {PropertyAddress}`
  - Body: Full template with editable yellow-highlighted fields (FirstName, PropertyAddress, MonthlyRentAmount, SecurityDepositAmount, HoldingDepositAmount, date 2 weeks from issue)
  - Bank details section (Sort Code: 20-08-64, Account: 03803880, Fleming Lettings and Developments UK Limited, Barclays)
  - Standard footer with company details

### 1.8 Tenant Application Form (via unique link)
- [ ] Mobile and tablet optimization
- [ ] Fix logo display (match tenant registration form styling)
- [ ] Match fonts, boxes, styles, formatting to tenant registration form
- [ ] Top header: "Your tenancy application form"
- [ ] "14 days" text for deadline
- [ ] Action box: "I've read and agree to the Terms & Conditions – Continue"
- [ ] Pre-populated fields with edit icon next to each for inline editing
- [ ] Date format: DD/MM/YYYY with correct calendar icon
- [ ] Address lookup: Google-style autocomplete when typing (e.g., "4a" starts pre-populating)
- [ ] Remove "previous address" box → replace with "Add a previous address" button with same fields
- [ ] Employment section renamed to "Employment Information" with conditional fields:
  - **Employed:** Employer Name, Address, Contact Number, Years of Service (freetext), Pay Frequency (Weekly/Fortnightly/Monthly/Other), Annual Salary, Any Other Income
  - **Self-employed:** Same fields but "Number of Tax Years Employed" instead of Years of Service
  - **Unemployed/Student/Retired:** Only "Annual Income (£)"
- [ ] References section with checkboxes: "Do you have an employer's reference?" / "Do you have a previous landlord reference?" (Yes/No → conditional fields)
  - Employer ref: Name/Department, Contact Number, Email, Employee ID/Reference
  - Landlord ref: Name/Department, Contact Number, Email, Property Address/Reference Number
  - Each reference needs mandatory consent checkbox: "Please confirm if we can contact this reference?"
- [ ] Next of Kin section: 2 entries, each with Name, Address, Contact Number, Relationship
- [ ] Free-text box: "Is there any further information you would like to submit?"
- [ ] Declaration checkboxes (8 mandatory):
  1. Holding Deposit Terms & Conditions (Tenant Fees Act 2019)
  2. Information is true and complete
  3. GDPR consent per privacy notice
  4. Authorise employer/bank/landlord/referee enquiries
  5. Consent to receive How to Rent guide, EPC, gas cert, EICR via email
  6. Authorise credit check by Fleming Lettings & Developments UK Limited
  7. Accept Terms and Conditions *
  8. Accept marketing and communications policies *
- [ ] Submit + Back buttons matching registration form formatting

### 1.9 Onboarding Section Improvements
- [ ] Completed onboarding stages must still be clickable/expandable to view details (e.g., completed Application Form shows the PDF)
- [ ] ID Verification section: allow direct document upload via onboarding screen
- [ ] Application form data should pre-populate and override personal/employment info in tenant enquiry record
- [ ] Application Form section: change from document upload to progress tracker ("Waiting on Tenant to complete")
- [ ] Holding Deposit section: change from document upload to tracking — show date + email/attachments sent + "Date Deposit Received" box sourced from onboarding checklist

---

## Workstream 2: V1/V2 Cleanup & V3 Rename

### 2.1 Delete V1 and V2 Files
- [ ] Delete all V1 page files (files without version suffix that have V2/V3 equivalents)
- [ ] Delete all V2 page files (`*V2.tsx`)
- [ ] Delete V2-specific components and layouts (e.g., `AILayout.tsx` if V2-only)
- [ ] Remove V1/V2 routes from `App.tsx`
- [ ] Remove any V1/V2-specific imports across the codebase

### 2.2 Rename V3 Files
- [ ] Rename all `*V3.tsx` pages to drop the V3 suffix (e.g., `DashboardV3.tsx` → `Dashboard.tsx`)
- [ ] Update all imports and route references
- [ ] Update route paths (remove `/v3` prefix if present, or redirect)
- [ ] Verify no broken references after rename

### 2.3 Dead Code Removal
- [ ] Remove unused components, hooks, and utils that were V1/V2 specific
- [ ] Remove `EnquiriesListV2.tsx` duplicate sidebar nav
- [ ] Remove hardcoded AI response patterns from V2 pages
- [ ] Clean up any leftover V2-AUDIT.md, V3-SPRINT-PLAN.md, V3-QA-REPORT.md references if no longer needed

---

## Workstream 3: Known Bug Fixes

_(Bugs from client feedback already covered in Workstream 1. Additional bugs discovered during audit go here.)_

- [ ] Fix any TypeScript compilation errors after V1/V2 deletion
- [ ] Fix any broken routes after rename
- [ ] Fix any API endpoints returning incorrect data
- [ ] Fix any 500 errors on backend endpoints

---

## Workstream 4: Systematic V3 + Backend Audit

### 4.1 Backend API Audit
- [ ] Test all CRUD endpoints for each entity (landlords, tenants, properties, enquiries, BDM, maintenance, tasks, rent payments)
- [ ] Test conversion endpoints (BDM → Landlord, Enquiry → Tenant)
- [ ] Test public endpoints (`/api/public/*`)
- [ ] Test document upload/download
- [ ] Test authentication flow (login, token refresh, protected routes)
- [ ] Test scheduler (compliance reminders)
- [ ] Verify audit logging works on all mutations

### 4.2 V3 Frontend Audit
- [ ] Test each V3 page loads without errors
- [ ] Test create/edit/delete flows for each entity
- [ ] Test navigation between related entities (landlord → properties, property → tenant, etc.)
- [ ] Test search and filtering on list pages
- [ ] Test kanban board drag-and-drop (Enquiries, BDM)
- [ ] Test light mode and dark mode on all pages
- [ ] Test responsive behavior on smaller screens

### 4.3 Integration Audit
- [ ] Test tenant enquiry form submission → appears in CRM
- [ ] Test landlord enquiry form submission → appears in BDM pipeline
- [ ] Test Government API integrations (Land Registry, Postcodes.io, EPC, Companies House)
- [ ] Test email sending via Resend
- [ ] Test SMS sending via Twilio

---

## User Journey (Post-Implementation)

1. **Staff logs in** → Dashboard shows actionable widgets (tasks, enquiries, rent checks, maintenance)
2. **Tenant submits enquiry** via `apply.fleminglettings.co.uk` → record appears in Enquiries pipeline
3. **Staff processes enquiry** → books viewing → sends application email with editable template → tracks via activity timeline
4. **Tenant completes application** via unique link (mobile-optimized) → data pre-populates CRM record
5. **Staff manages onboarding** → tracks holding deposit, application form progress, KYC, guarantor → converts to tenant
6. **Property management** → compliance tracking, rent payment checks, maintenance requests all flowing through dashboard

---

## Success Metrics

- [ ] Zero V1/V2 files in codebase
- [ ] All V3 pages renamed without V3 suffix
- [ ] All client feedback items from April 1st addressed
- [ ] All CRUD operations work for every entity
- [ ] All conversion workflows (BDM → Landlord, Enquiry → Tenant) work end-to-end
- [ ] No console errors on any page
- [ ] No 500 errors from any API endpoint
- [ ] SMS and email integration functional
- [ ] Tenant registration form submits successfully
- [ ] Application form works on mobile/tablet
