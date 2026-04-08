# Full Platform UAT & Bug Fix Sprint

Post-deployment-fix regression testing and repair. The Railway/Vercel deployment fixes introduced breaking changes to core CRUD operations across the platform.

## Problem

During the Railway deployment fix work, changes to `index-pg.ts` and the build pipeline broke standard CRUD functionality: record updates fail (can't edit names/fields), property linking doesn't work, and status changes don't reflect on kanban boards. The platform needs a complete UAT pass before any further development.

## Approach

1. **Verify deployment builds** — confirm `render-build.sh` produces a working build
2. **Systematic API testing** — test every CRUD endpoint in `index-pg.ts` against PostgreSQL
3. **Frontend integration testing** — verify each page's forms, links, and state changes work
4. **Fix all regressions** — repair broken endpoints and UI flows
5. **Re-verify deployment** — confirm fixes don't re-break the build

## Core Areas & Acceptance Criteria

### 1. Deployment Verification
- [ ] `npm run render-build` completes successfully
- [ ] `backend/dist/index-pg.js` is produced
- [ ] Backend starts and `/api/health` responds 200
- [ ] Frontend builds without errors

### 2. Authentication & Users
- [ ] Login works with valid credentials
- [ ] JWT token is returned and stored
- [ ] Protected routes reject unauthenticated requests
- [ ] User CRUD: create, read, update, delete users
- [ ] Role-based access (admin/manager/staff/viewer) enforced

### 3. Properties — CRUD & Relationships
- [ ] Create new property with all fields
- [ ] Read/list properties
- [ ] **Update property fields** (name, address, compliance dates, etc.)
- [ ] Delete property
- [ ] Link property to landlord (primary)
- [ ] Add/remove secondary landlords via `property_landlords`
- [ ] Link tenant to property
- [ ] Compliance fields save and display correctly (EICR, EPC, gas safety)

### 4. Landlords — CRUD & Pipeline
- [ ] Create landlord (individual, company, trust types)
- [ ] Read/list landlords
- [ ] **Update landlord fields** (name, contact, type, etc.)
- [ ] Delete landlord
- [ ] Company landlords: add/remove directors
- [ ] View landlord's properties (including via `property_landlords`)

### 5. BDM (Business Development) — CRUD & Conversion
- [ ] Create BDM prospect
- [ ] Read/list BDM prospects
- [ ] **Update BDM fields** (name, status, notes, etc.)
- [ ] Delete BDM prospect
- [ ] **Status change reflects on pipeline/kanban view**
- [ ] **"Onboarding" status moves card to onboarding column**
- [ ] Convert BDM prospect to landlord (creates landlord record, marks BDM as converted)

### 6. Tenant Enquiries — CRUD, Kanban & Conversion
- [ ] Create tenant enquiry
- [ ] Read/list tenant enquiries
- [ ] **Update enquiry fields** (name, contact, status, etc.)
- [ ] Delete tenant enquiry
- [ ] **Kanban board displays enquiries in correct columns by status**
- [ ] **Status change to "onboarding" moves card to onboarding column**
- [ ] **Status change to any value reflects immediately on kanban**
- [ ] Duplicate detection works (`check-duplicates` endpoint)
- [ ] Joint applicant linking works
- [ ] Convert enquiry to tenant (creates tenant record, marks enquiry as converted)

### 7. Tenants — CRUD
- [ ] Create tenant
- [ ] Read/list tenants
- [ ] **Update tenant fields** (name, KYC, guarantor, deposit, etc.)
- [ ] Delete tenant

### 8. Maintenance — CRUD
- [ ] Create maintenance request (linked to property)
- [ ] Read/list maintenance requests
- [ ] **Update maintenance fields** (status, description, etc.)
- [ ] Delete maintenance request

### 9. Tasks — CRUD
- [ ] Create manual task
- [ ] Read/list tasks
- [ ] **Update task fields** (status, assignee, description, etc.)
- [ ] Delete task
- [ ] Tasks link to entities via `entity_type` + `entity_id`

### 10. Transactions & Rent Payments
- [ ] Create rent payment record
- [ ] Read/list payments
- [ ] **Update payment fields**
- [ ] Mark payment as paid (`PUT /api/rent-payments/:id/pay`)
- [ ] Transactions list/read

### 11. Documents & File Uploads
- [ ] Upload document to any entity
- [ ] List documents for an entity
- [ ] Delete document

### 12. Dashboard & Reporting
- [ ] Dashboard loads with stats
- [ ] Data export endpoint works (`GET /api/export/:entityType`)

### 13. Public API Endpoints (Unauthenticated)
- [ ] `GET /api/public/properties` returns available properties
- [ ] `POST /api/public/tenant-enquiries` creates enquiry
- [ ] `POST /api/public/landlord-enquiries` creates BDM prospect
- [ ] Rate limiting is active on public endpoints

## Known Bugs (Reported)

1. **Record updates broken** — Can't change field values (names, etc.) on any record detail page
2. **Property linking broken** — Can't link a property to a tenant/landlord if not already linked
3. **Kanban status sync** — Clicking "onboarding" on tenant/landlord enquiry doesn't move the card to the onboarding column

## Testing Strategy

- Test against local PostgreSQL dev server (`npm run dev:pg`)
- Focus on `index-pg.ts` endpoints since that's the production entry point
- For each entity: test the API endpoint directly, then verify the frontend page works
- Fix issues in `index-pg.ts` and corresponding frontend pages
- After all fixes, run `npm run render-build` to confirm deployment still works
