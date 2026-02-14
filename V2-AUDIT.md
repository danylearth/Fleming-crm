# Fleming CRM V2 — Frontend Audit & Gap Analysis

*Audit date: 2026-02-14*
*Compared against: SPEC-FULL.md*

---

## Per Page Gaps

### DashboardV2.tsx
**What exists:** AI greeting, priority action cards (compliance alerts, new enquiries, outstanding rent, overdue tasks, maintenance, voids, BDM), quick stats strip, AI chat input with suggestions.

**Missing vs spec:**
- **To-Do List module** — spec requires a dedicated to-do list with manual task creation (description, priority Low/Med/High, assigned agent), follow-up dates (exit/re-enter queue), complete/archive (archived against Property). Dashboard only shows generated action cards, not a manageable to-do list.
- **Tenant Enquiries Pipeline widget** — spec wants all active/in-progress enquiry records visible on dashboard. Only a count + "View enquiries" link exists.
- **Property Viewings widget** — spec: "Upcoming booked viewings, appear on viewing date." Not present — no viewing calendar/list on dashboard.
- **Rent Payment Checks** — spec: "Monthly popup when rent due per property/tenant, 'Payment Received' button + date, confirmed → leaves pipeline, links to Tenant + Property, Average Late Payment metric." Only outstanding rent £ total shown; no per-property/tenant rent check pipeline, no "Payment Received" button, no Average Late Payment metric.
- **Maintenance Tasks widget** — spec: "All active requests (from website form)." Only a count card; no inline maintenance list.
- **Landlords BDM Pipeline widget** — only a count; no inline pipeline.
- **Team Calendar** — completely absent.
- **Quick Actions** — spec: "Add record in each module." Only chat suggestions exist; no quick-add buttons for landlord/tenant/property/enquiry/maintenance.
- **Portfolio Overview** — spec: "total rental, property list, outgoing costs, total properties." Only basic stats shown; no outgoing costs, no property list drill-down.
- **Data Export** — spec: "export data." No export button on dashboard.

### EnquiriesV2.tsx (Kanban)
**What exists:** Kanban board with 6 columns (New, Viewing, Awaiting, Onboarding, Converted, Rejected), drag-and-drop status changes, search, enquiry cards with name/initials/property/contact icons/KYC badge/viewing date/joint applicant indicators.

**Missing vs spec:**
- **No detail view** — clicking a card links to `/tenant-enquiries/${id}` (old route). No V2 detail page.
- **No create/edit form** — "New Enquiry" button exists but is non-functional (no form).
- **Missing fields on cards/detail**: `date_of_birth_1`, `current_address_1`, `employment_status_1`, `employer_1`, `income_1`, and all `_2` joint applicant fields are not shown.
- **No validation workflow** — spec: "Validate" action on record. Not implemented.
- **No KYC add/edit** — spec: "add KYC." Only a boolean badge shown.
- **No notes editing** — spec: "add notes."
- **No property linking UI** — spec: "link to Property." No property selector.
- **No follow-up date management** — spec: "Awaiting Client Response → follow-up date → exits/re-enters queue." No follow-up date input or automatic queue management.
- **No viewing date picker** — spec: "Viewing Booked → date + property → creates Property Viewing on Dashboard." Can't set viewing date from the kanban.
- **No onboarding completion check** — spec: "All mandatory info completed + linked to property → moves to Tenants." No validation before conversion.
- **No duplicate prevention** — spec: "Validate phone/email across entire CRM; duplicates trigger re-review."
- **No rejection reason** — schema has `rejection_reason` field; not exposed in UI.
- **No archived enquiry search** — spec: "Rejected → archived (searchable, mailing lists)."

### EnquiriesListV2.tsx (List + Detail + AI Chat)
**What exists:** Three-panel layout (left list grouped by status, center detail with profile header/stats/property card/joint applicant/notes, right AI chat). Has its own sidebar nav (duplicated from AILayout). Hardcoded AI responses.

**Missing vs spec:**
- **No edit capability** — all fields read-only; no edit button, no inline editing.
- **No status change UI** — can't move enquiry between stages from detail view.
- **No document upload** — spec mentions KYC documents per applicant.
- **Missing fields displayed**: `income_1`, `employment_status_1`, DOB not shown in detail. Joint applicant `email_2`, `phone_2`, `employment_status_2`, `employer_2`, `income_2` not displayed.
- **Duplicate nav sidebar** — has its own icon sidebar instead of using AILayout, creating inconsistency.
- **AI chat is fake** — hardcoded pattern-matching responses, not connected to real AI backend.

### LandlordsV2.tsx
**What exists:** Left panel list with colored avatar circles + initials + company/"Individual" label + property count. Center detail with contact info (email, phone, address) and linked properties list with links.

**Missing vs spec:**
- **No alt email** — spec: "alt email." Schema doesn't even have this field.
- **No DOB** — spec: "DOB."
- **No home address** vs general address — spec distinguishes "home address."
- **No marketing preference** — spec: "marketing preference (Post/Email/Tel/SMS)." Not in schema or UI.
- **No KYC compliance** — spec: "KYC Yes/No." Not shown.
- **No notes** — spec: "Free-text notes." Not displayed despite being in schema.
- **No document upload** — spec: Primary ID, Address ID, Proof of Funds, Application Forms, Deed of Guarantee, Guarantor Forms, Bank Statements, Council Tax Bill, Complaint, Compliments, Proof of Ownership, Mortgage Statement, Other.
- **No create/edit form** — no "Add Landlord" button, no edit capability.
- **No duplicate prevention** — spec: "No duplicate phone/email."
- **No linked records navigation** — properties link to `/properties/${id}` which works, but no linked tenants or enquiries.
- **No data export** — spec: "Mailing lists from Landlords."
- **No status field** — UI shows active/inactive/prospect statuses but schema has no `status` column on landlords table.

### TenantsV2.tsx
**What exists:** Left panel list with lavender avatar circles + name + property address + chevron. Center detail with contact info (email, phone), property address, tenancy dates (start/end), rent amount.

**Missing vs spec:**
- **No Next of Kin** — spec: "Next of Kin (missing = Low Priority todo)." Fields `nok_name`, `nok_relationship`, `nok_phone`, `nok_email` exist in schema but not in UI.
- **No tenancy type** — spec: "type (AST/HMO/Rolling/Other)." In schema (`tenancy_type`) but not displayed.
- **No onboarding checklist** — spec: "Onboarding Checklist (% completion): Holding deposit (Yes/No + amount + date), Application forms, KYC (per applicant if joint), Guarantor (name, address, contact, KYC, Deed of Guarantee)." All these fields exist in schema but none shown.
- **No document upload** — spec lists 12+ document types.
- **No rent payment history** — spec: "Payment dates, Average Late Payment metric." `rent_payments` table exists but no UI.
- **No joint tenancy display** — schema has `is_joint_tenancy`, `first_name_2`, etc. Not shown.
- **No guarantor info** — schema has guarantor fields. Not displayed.
- **No create/edit form** — no "Add Tenant" button, no editing.
- **No duplicate prevention** — spec: "No duplicate phone/email."
- **No data export** — spec: "Mailing lists from Tenants."
- **Detail uses list item data** — `setSelected(t)` stores the list-level Tenant object. No API call to fetch full tenant detail with all fields. Missing fields like `title_1`, `date_of_birth_1`, `kyc_completed_1`, etc.

### PropertiesV2.tsx
**What exists:** Card grid with address, postcode, status badge, property type, bedrooms, bathrooms, rent amount, landlord name, compliance dots (Gas/EICR/EPC). Search. "Add Property" button (non-functional). Links to `/properties/${id}`.

**Missing vs spec:**
- **No detail view** — cards link out but there's no V2 property detail page.
- **No master-detail layout** — unlike Landlords/Tenants, Properties is a card grid only. No left sidebar list + center detail.
- **Missing fields**: `onboarded_date`, `is_leasehold` + leasehold details (`leasehold_start_date`, `leasehold_end_date`, `leaseholder_info`), `has_live_tenancy`, tenancy link to tenant, `service_type` (Rent Collection/Let Only/Full Management) + `charge_percentage`/`total_charge`, `council_tax_band`, `rent_review_date`, `proof_of_ownership_received`, `has_gas`.
- **No compliance detail** — only traffic-light dots; no expiry dates shown, no 14-day reminder system.
- **No document upload** — spec lists many document types.
- **No rent payment history** — spec: "Payment dates, Average Late Payment."
- **No archived tasks** — spec: "Completed todos archived against property."
- **No linked tenant display** — spec: "live tenancy (Yes/No → start date + rent + tenant link)."
- **No create form** — "Add Property" button exists but has no form/modal.
- **No linked landlord navigation** — landlord name shown but not clickable.
- **`bathrooms` field** — shown in UI but not in schema. Likely always null.

### BDMV2.tsx
**What exists:** Kanban board with 6 columns (New, Contacted, Interested, Proposal Sent, Won, Lost), drag-and-drop, search. Cards show company name, contact name, source, date.

**Missing vs spec:**
- **Column mismatch** — schema has statuses: `new`, `contacted`, `follow_up`, `interested`, `onboarded`, `not_interested`. UI has: `new`, `contacted`, `interested`, `proposal_sent`, `won`, `lost`. These don't match.
- **No detail view** — no click-through to BDM record detail.
- **No create/edit form** — no "Add Lead" button.
- **No notes display/editing** — spec: "notes."
- **No document upload** — spec: "upload documents."
- **No follow-up date management** — spec: "follow-up dates (exit/re-enter queue)." Schema has `follow_up_date` but not exposed.
- **No onboarding workflow** — spec: "Verified → moves to Landlords module." No conversion action.
- **No duplicate prevention** — spec: "No duplicate phone/email."
- **No email/phone display** — schema has `email`, `phone` but not shown on cards.
- **Missing fields from LANDLORD LIST spreadsheet** — spec references additional fields per spreadsheet.

### MaintenanceV2.tsx
**What exists:** Stats strip (Open/In Progress/Completed counts), search, status + priority filters, table with priority bar, title, reporter, property, status badge, priority, date.

**Missing vs spec:**
- **No detail view** — clicking a row does nothing; no detail page.
- **No create form** — can't create maintenance requests.
- **No edit/update** — can't change status, assign contractor, add resolution notes.
- **Missing fields displayed**: `description`, `category`, `contractor`, `contractor_phone`, `cost`, `resolution_notes`, `completed_date`, `reporter_email`, `reporter_phone`, `reporter_type`, linked tenant, linked landlord.
- **No property linking** — address shown but not clickable.
- **No tenant/landlord linking** — spec: "linked to Property" (and by extension, to tenant/landlord).
- **No document/photo upload** — maintenance often needs photos.

### TasksV2.tsx
**What exists:** Calendar week view with tasks by day, stats (Active/Completed/Overdue), create task modal (title, description, priority, due date, assign to), toggle complete. Week navigation.

**Missing vs spec:**
- **No entity linking** — spec: tasks linked to entities (property, tenant, landlord, enquiry, maintenance). Task creation form has no entity selector.
- **No task types** — spec: compliance reminders (EICR/Gas/EPC expiry), tenancy end warnings, rent review, NOK missing, follow-up. Form only has `task_type: 'general'` hardcoded.
- **No follow-up dates** — spec: "follow-up dates (exit/re-enter queue)."
- **No archive** — spec: "complete/archive (archived against Property)." Tasks only toggle completed.
- **No auto-generation** — spec: compliance/tenancy tasks should auto-generate. No system for this.
- **No detail/edit view** — can only toggle completion; can't edit existing tasks.
- **No team calendar integration** — spec: "Team Calendar: Shared calendar view."

### TransactionsV2.tsx
**What exists:** Monthly financial overview with stats (Income/Outstanding/Expenses/Net), month navigation, type + status filters, transaction table (type, property, description, amount, date, status).

**Missing vs spec:**
- **No "Payment Received" button** — spec: "Payment Received button + date, confirmed → leaves pipeline."
- **No Average Late Payment metric** — spec requires this per tenant and per property.
- **No rent collection vs let only vs full management breakdown** — spec: different service types have different financial structures.
- **No Own Portfolio Rents** — spec §8.
- **No Rent Collection Totals** — spec §8.
- **No tenant linking** — transactions show property but not which tenant.
- **No create transaction** — can't manually add transactions.
- **No export** — spec: "export from any module."

---

## UX Issues

1. **Inconsistent list components** — Landlords left sidebar uses colored avatar circles (`bg-sky-500`, `bg-violet-500`, etc.) with initials + "Individual"/"Company" labels + property count icons. Tenants left sidebar uses uniform `bg-violet-100` lavender circles with initials + property address + chevron arrows. These should use the same `EntityListItem` component.

2. **Inconsistent layout patterns** — Landlords and Tenants use master-detail (left list + center detail). Properties uses card grid. Enquiries has both kanban (EnquiriesV2) and list+detail+AI chat (EnquiriesListV2). BDM and Maintenance are full-page views. Dashboard is single-column. No consistent layout strategy.

3. **No detail views for most entities** — Clicking a property card navigates to `/properties/${id}` but no V2 detail page exists there. No BDM detail. No maintenance detail. Landlords and Tenants have inline detail but missing most spec fields.

4. **No create/edit forms on any V2 page** — Properties has a non-functional "Add Property" button. Enquiries has a non-functional "New Enquiry" button. Tasks has a working create modal but it's the only page with any create capability. No edit forms anywhere.

5. **No document upload UI on any page** — The `documents` table exists in the backend with entity type support for landlord, tenant, property, maintenance, etc. Zero UI for uploading, viewing, or managing documents.

6. **No rent payment tracking UI** — `rent_payments` table exists with full schema (due_date, amount_due, amount_paid, payment_date, status). No UI anywhere.

7. **No duplicate detection** — Spec requires CRM-wide phone/email uniqueness validation. Not implemented anywhere.

8. **EnquiriesListV2 duplicates the sidebar** — Has its own full icon sidebar + nav, separate from AILayout. This means navigating to this page shows double navigation or inconsistent navigation depending on routing.

9. **AI chat is hardcoded** — Both EnquiriesListV2 and AILayout have fake AI responses (pattern-matching `setTimeout`). DashboardV2 uses `useAIChat()` hook which may be real. Inconsistent AI implementation.

10. **No responsive/mobile considerations** — Fixed widths (`w-80`, `w-72`, `w-[380px]`) throughout. Will break on smaller screens.

11. **Missing filter capabilities** — No filter by status on Landlords or Tenants lists. No filter by property on Enquiries. No date range filters on Tasks or Transactions beyond month navigation.

---

## Data Connection Gaps

1. **Cross-entity filtering** — Cannot filter enquiries by property, properties by landlord, maintenance by property/tenant, tasks by entity. All lists are flat.

2. **Linked record navigation** — Landlord detail shows properties with links (✓), but:
   - Tenant detail shows property address as plain text (no link)
   - Property cards show landlord name as plain text (no link)
   - Maintenance table shows property address (no link)
   - BDM cards have no entity links
   - Task calendar shows tasks with no entity context

3. **Missing onboarding workflows:**
   - **BDM → Landlord**: spec says "Verified → moves to Landlords module." No conversion button or workflow.
   - **Enquiry → Tenant**: spec says "All mandatory info completed + linked to property → moves to Tenants." No onboarding completion check or conversion action.

4. **No property → tenant link** — spec: "live tenancy (Yes/No → start date + rent + tenant link)." Properties don't show current tenant.

5. **No tenant → property link** — Tenants show `property_address` text but don't use `property_id` for navigation.

6. **No maintenance → tenant/landlord links** — Schema has `tenant_id` and `landlord_id` on maintenance; not used in UI.

7. **No viewing → dashboard integration** — spec: "Viewing Booked → creates Property Viewing on Dashboard." `property_viewings` table exists but no UI integration.

8. **No compliance → task auto-generation** — spec: "EICR/Gas/EPC expiry reminders" as dashboard tasks. Compliance data exists on properties but no task auto-creation.

---

## Shared Component Opportunities

### 1. `MasterDetailLayout`
**Used by:** Landlords, Tenants, EnquiriesListV2 (partially). Should also be used by Properties, BDM, Maintenance.
**Props:** `leftPanel`, `centerPanel`, `rightPanel?` (optional AI chat)
**Benefit:** Consistent three-panel layout. Currently each page implements its own flex layout with different widths (`w-80` vs `w-[380px]` vs `w-72`).

### 2. `EntityListItem`
**Used by:** Landlord list items, Tenant list items, Enquiry list items — all slightly different.
**Props:** `avatar` (color/initials), `title`, `subtitle`, `metadata` (badges, counts, icons), `selected`, `onClick`
**Benefit:** Eliminates inconsistency between colored circles vs lavender circles vs gray circles.

### 3. `DetailHeader`
**Used by:** Landlord detail header, Tenant detail header, Enquiry detail header.
**Props:** `avatar`, `name`, `status` (badge), `subtitle`, `actions` (button array)
**Benefit:** Consistent header with edit/delete/action buttons.

### 4. `DocumentUploadSection`
**Used by:** Every entity detail page (landlord, tenant, property, enquiry, maintenance, BDM).
**Props:** `entityType`, `entityId`, `allowedDocTypes[]`
**Benefit:** Single component handles upload, list, download, delete for all entity types. Maps to `documents` table.

### 5. `ComplianceSection`
**Used by:** Property detail, Dashboard compliance alerts.
**Props:** `propertyId`, `eicr_expiry`, `epc_grade`, `epc_expiry`, `has_gas`, `gas_safety_expiry`, `proof_of_ownership`, `council_tax_band`, `rent_review_date`
**Benefit:** Standardized compliance display with traffic-light indicators and 14-day warnings.

### 6. `PaymentHistory`
**Used by:** Property detail, Tenant detail, Dashboard rent checks, Transactions page.
**Props:** `propertyId?`, `tenantId?`, `payments[]`
**Benefit:** Reusable table/list of rent payments with "Payment Received" action and Average Late Payment calculation.

### 7. `NotesSection`
**Used by:** Every entity that has notes (landlords, tenants, properties, enquiries, BDM, maintenance, tasks).
**Props:** `notes`, `onSave`, `timestamped?`
**Benefit:** Consistent free-text notes with save capability.

### 8. `OnboardingChecklist`
**Used by:** Tenant detail (holding deposit, application forms, KYC, guarantor), Enquiry onboarding stage.
**Props:** `items[]` with `label`, `completed`, `details`
**Benefit:** Visual % completion bar with expandable checklist items.

### 9. `KanbanBoard`
**Used by:** EnquiriesV2 and BDMV2 — nearly identical implementations.
**Props:** `columns[]`, `items[]`, `onDrop`, `cardRenderer`
**Benefit:** Single drag-and-drop kanban. Currently ~200 lines duplicated.

### 10. `EntityForm` / `FormModal`
**Used by:** Every create/edit operation across all entities.
**Props:** `fields[]`, `values`, `onSubmit`, `validation`
**Benefit:** TasksV2 already has a create modal pattern. Should be generalized.

---

## Priority Implementation Order

### P0 — Critical (Core functionality, blocking daily use)

1. **Create/Edit forms for all entities** — Users literally cannot add or modify data. This is the single biggest gap. Start with:
   - Landlord create/edit form
   - Tenant create/edit form (with onboarding checklist fields)
   - Property create/edit form (with all spec fields: service type, compliance dates, leasehold)
   - Enquiry create/edit form (with all website form fields)
   - BDM create/edit form
   - Maintenance create/edit form

2. **Property detail page** — Properties is the central entity. Needs a full detail view showing: all address fields, landlord link, service type + charges, compliance section (EICR/EPC/Gas with expiry dates), tenancy details + tenant link, documents, rent payment history, archived tasks.

3. **Tenant detail page (full)** — Current detail is missing: Next of Kin (`nok_name`, `nok_phone`, `nok_email`, `nok_relationship`), tenancy type, onboarding checklist (holding deposit, KYC, guarantor), joint tenancy info, documents, rent payment history.

4. **Rent payment tracking** — `rent_payments` table exists. Build: payment list per tenant/property, "Payment Received" button with date, Average Late Payment metric, overdue highlighting. Wire to Dashboard "Rent Payment Checks" widget.

### P1 — High (Workflow completeness)

5. **Document upload system** — `documents` table ready. Build `DocumentUploadSection` component. Deploy on landlord, tenant, property, enquiry, maintenance detail pages. Support doc types from spec: Primary ID, Address ID, Proof of Funds, Application Forms, Deed of Guarantee, etc.

6. **Enquiry → Tenant onboarding workflow** — Validate mandatory fields, link to property, convert to tenant record. Spec: "All mandatory info completed + linked to property → moves to Tenants."

7. **BDM → Landlord onboarding** — "Verified → moves to Landlords module." Add conversion action on BDM detail.

8. **Compliance reminders system** — Auto-generate tasks for EICR/Gas/EPC expiry (14 days prior). Show on Dashboard. Link to properties.

9. **Duplicate prevention** — CRM-wide phone/email validation on create/edit. Flag duplicates for review.

### P2 — Medium (UX consistency, navigation)

10. **Shared `MasterDetailLayout` component** — Standardize the three-panel layout. Apply to Properties (switch from card grid), BDM (add detail panel), Maintenance (add detail panel).

11. **Shared `EntityListItem` component** — Unify the left sidebar list item pattern across Landlords, Tenants, Enquiries, BDM, Properties, Maintenance.

12. **Cross-entity navigation** — Make landlord names on properties clickable. Make property addresses on tenants/maintenance clickable. Make tenant names on properties clickable.

13. **Shared `KanbanBoard` component** — Extract from EnquiriesV2 and BDMV2.

14. **Fix BDM status mismatch** — Align UI columns with database statuses.

### P3 — Lower (Polish, advanced features)

15. **Team Calendar** — Shared calendar view integrating tasks, viewings, follow-ups.

16. **Data export** — CSV/Excel export from all modules. Mailing list generation from Landlords/BDM/Tenants.

17. **Dashboard widgets** — Full enquiry pipeline, viewing list, maintenance list, BDM pipeline inline on dashboard.

18. **Real AI integration** — Replace hardcoded AI responses in EnquiriesListV2 and AILayout with actual backend AI.

19. **Audit trail UI** — `audit_log` table exists. No UI to view user actions.

20. **User accounts management** — Spec: accounts@, marie@, chris@ with different access levels. No user management UI.

---

## Schema Gaps (Backend)

Fields required by spec but missing from `db-pg.ts`:

| Entity | Missing Field | Spec Reference |
|--------|--------------|----------------|
| landlords | `alt_email` | "alt email" |
| landlords | `dob` | "DOB" |
| landlords | `marketing_preference` | "marketing preference (Post/Email/Tel/SMS)" |
| landlords | `kyc_completed` | "KYC Yes/No" |
| landlords | `status` | UI shows active/inactive/prospect but no column |
| landlords | `company` | UI references but not in schema |
| properties | `bathrooms` | UI shows but not in schema |
| tenant_enquiries | `guarantor` fields | spec mentions guarantor in onboarding |
| landlords_bdm | `company_name` vs `name` | UI uses `company_name` + `contact_name` but schema only has `name` |
