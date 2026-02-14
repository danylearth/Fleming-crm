# Fleming Lettings CRM – Full Functional Specification

## 1. Home Screen (Dashboard)
- **To-Do List**: EICR/Gas/EPC expiry reminders, tenancy end (30 days prior), manual task creation (description, priority Low/Med/High, assigned agent), follow-up dates (exit/re-enter queue), complete/archive (archived against Property), missing Next of Kin flags (Low Priority)
- **Tenant Enquiries Pipeline**: All active/in-progress records, return to queue on follow-up date
- **Property Viewings**: Upcoming booked viewings (from enquiries), appear on viewing date
- **Rent Payment Checks**: Monthly popup when rent due per property/tenant, 'Payment Received' button + date, confirmed → leaves pipeline, links to Tenant + Property, Average Late Payment metric
- **Maintenance Tasks**: All active requests (from website form)
- **Landlords BDM Pipeline**: Active prospects + follow-up statuses
- **Team Calendar**: Shared calendar view
- **Quick Actions**: Add record in each module, export data, portfolio overview (total rental, property list, outgoing costs, total properties)

## 2. Tenant Enquiries Module
- **Record Fields**: All website form fields, joint application support (doubled fields)
- **Record Actions**: Validate, add KYC, edit contact info, add notes, link to Property
- **Workflow**:
  - Rejected → archived (searchable, mailing lists)
  - Viewing Booked → date + property → creates Property Viewing on Dashboard; leaves queue, returns on viewing date
  - Awaiting Client Response → follow-up date → exits/re-enters queue
  - Onboarding → stays in queue, optional follow-up. All mandatory info completed + linked to property → moves to Tenants
- **Duplicate Prevention**: Validate phone/email across entire CRM; duplicates trigger re-review

## 3. Tenants Module
Every tenant linked to a Property.
- **Contact**: Full name, email, phone, address, Next of Kin (missing = Low Priority todo)
- **Tenancy Details**: Start date, type (AST/HMO/Rolling/Other), end date (Yes/No → 30-day warning High Priority), monthly rent
- **Onboarding Checklist** (% completion): Holding deposit (Yes/No + amount + date), Application forms, KYC (per applicant if joint), Guarantor (name, address, contact, KYC, Deed of Guarantee)
- **Document Uploads**: Primary ID, Address ID, Proof of Funds, Application Forms, Deed of Guarantee, Guarantor Forms, Bank Statements, Council Tax Bill, Complaint, Compliments, Other
- **Rent Payment History**: Payment dates, Average Late Payment metric
- **Duplicate Prevention**: No duplicate phone/email

## 4. Landlords BDM Module
Manual entry prospective landlords.
- **Fields**: Per LANDLORD LIST spreadsheet, contact info, notes
- **Actions**: Add/edit, notes, upload documents, follow-up dates (exit/re-enter queue)
- **Onboarding**: Verified → moves to Landlords module
- **Duplicate Prevention**: No duplicate phone/email

## 5. Landlords Module
- **Contact**: Full name, email, alt email, DOB, home address, marketing preference (Post/Email/Tel/SMS)
- **Linked Records**: All Properties linked to landlord
- **Compliance**: KYC Yes/No
- **Notes**: Free-text
- **Document Uploads**: Primary ID, Address ID, Proof of Funds, Application Forms, Deed of Guarantee, Guarantor Forms, Bank Statements, Council Tax Bill, Complaint, Compliments, Proof of Ownership, Mortgage Statement, Other

## 6. Properties Module
- **Core**: Full address, onboarded date, leasehold/freehold (if leasehold: start/end/leaseholder info), live tenancy (Yes/No → start date + rent + tenant link), linked landlord (mandatory)
- **Service Type**: Rent Collection (rent + charge% + tenancy details) / Let Only (rent + total charge £ + tenancy) / Full Management (rent + charge% + tenancy)
- **Compliance** (14-day reminders → Dashboard + Property): EICR expiry, EPC grade (A-G/None) + expiry, Gas (Yes/No → gas safety expiry, annual), Proof of Ownership, Council Tax Band (A-H), Rent Review Date
- **Document Uploads**: Same as Landlords + Mortgage Statement
- **Rent Payment History**: Payment dates, Average Late Payment
- **Archived Tasks**: Completed todos archived against property

## 7. Maintenance Module
- Data from website form, displays on Dashboard, linked to Property

## 8. Financials Module
- Own Portfolio Rents, Rent Collection Totals, additional views

## 9. Global Requirements
- **Branding**: Company branding throughout
- **Data Export**: Mailing lists from Landlords/BDM/Tenants, export from any module
- **Duplicate Prevention**: CRM-wide phone/email uniqueness
- **User Accounts + Audit Trail**: accounts@ (master admin, full footprint tracking), marie@ (full access, logged), chris@ (full access, logged)
