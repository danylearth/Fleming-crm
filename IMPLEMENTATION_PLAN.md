# Implementation Plan

<!-- Release: Full Platform UAT & Bug Fix -->
<!-- Audience: Solo dev preparing Fleming CRM for production use after Railway deployment fixes -->
<!-- Spec: specs/uat-full-platform.md -->

## High Priority

### Route Ordering Fixes (CRITICAL — blocks functionality)

- [x] **Move `GET /api/landlords/check-duplicates` above `GET /api/landlords/:id`** — Express matches `:id` first (line 245), so `/api/landlords/check-duplicates` resolves as `id="check-duplicates"` → 404. The actual handler (line 332) is dead code. Landlord duplicate detection completely broken.

- [x] **Move `GET /api/documents/download/:id` above `GET /api/documents/:entityType/:entityId`** — Line 2272 catches download requests with `entityType="download"`. The download handler (line 2308) is unreachable. All document downloads are broken.

### Query Fixes (CRITICAL — data loss / silent failures)

- [x] **Fix `PUT /api/properties/:id` return query: `JOIN` → `LEFT JOIN`** — Line 2012 uses `JOIN landlords l ON l.id = p.landlord_id`. Properties without a landlord return null after update; frontend sees failure. Confirmed root cause of "record updates broken" bug. Change to `LEFT JOIN`. Compare with GET at line 1958 which already uses `LEFT JOIN`.

- [x] **Fix `GET /api/maintenance` list query: `JOIN` → `LEFT JOIN` for landlords** — Line 2177 double INNER JOINs properties and landlords. Maintenance records silently disappear when property's landlord is missing. Change landlords JOIN to `LEFT JOIN` (keep properties JOIN since property_id is NOT NULL).

- [x] **Fix `GET /api/tenancies` list query: `JOIN` → `LEFT JOIN` for tenants** — Line 2342-2343 double INNER JOINs properties and tenants. If a tenant is deleted, orphaned tenancy records silently vanish from the list. Change tenants JOIN to `LEFT JOIN`.

### Frontend Kanban Bug (CRITICAL — reported bug)

- [x] **Fix EnquiriesKanban.tsx: add server refetch after status update** — Line 508-509 does `api.put()` then only updates local state with `setEnquiries(prev => ...)`. Server changes (validation, auto-set fields) not reflected. Root cause of "kanban status sync" reported bug. Add `await load()` after the PUT, matching the pattern in Enquiries.tsx (line 500-501).

### Column Name Bug (HIGH — silent file leak)

- [x] **Fix `doc.file_name` → `doc.filename` in DELETE /api/tasks/:id** — Line 2132 references `doc.file_name` but the documents table column is `filename` (db-pg.ts:321). Every other DELETE endpoint uses `doc.filename` correctly (lines 2313, 2328, 2558, 2576). Task deletion silently fails to clean up associated files on disk.

### Missing Endpoint (HIGH — no single-record delete)

- [x] **Add `DELETE /api/maintenance/:id` endpoint** — Only bulk-delete exists (line 2237). Add single-record delete following the pattern of `DELETE /api/properties/:id` (line 2572): delete associated documents + files, delete record, logAudit. Place BEFORE `/api/maintenance/bulk-delete` to avoid route conflicts.

### Inconsistent PUT Response Shapes (HIGH — frontend confusion)

- [x] **Fix `PUT /api/maintenance/:id` to return updated record** — Line 2231 returns `{ success: true }`. Fetch and return the updated maintenance record after UPDATE, consistent with PUT /api/properties/:id and PUT /api/tenants/:id.

- [x] **Fix `PUT /api/landlords-bdm/:id` to return updated record** — Line 671 returns `{ success: true }`. Fetch and return the updated BDM record. Note: BDMDetail.tsx currently calls `load()` after save so this won't break anything, but consistency matters for API consumers.

- [x] **Fix `PUT /api/tasks/:id` to return updated record** — Line 2107 returns `{ success: true }`. Fetch and return the updated task record after UPDATE.

## Medium Priority

### POST /api/maintenance Missing Fields (parity with schema)

- [ ] **Expand POST /api/maintenance to accept reporter fields** — Line 2186-2191 only accepts `property_id, title, description, category, priority`. DB schema (db-pg.ts:275-280) has `tenant_id, landlord_id, reporter_name, reporter_email, reporter_phone, reporter_type`. The frontend Maintenance.tsx create form doesn't send them yet, but the list view displays `reporter_name` (line 332). Add these optional fields to the INSERT.

### Maintenance Sort Parity

- [x] **Fix maintenance sort to include 'medium' priority level** — Line 2178 CASE sorts: urgent→1, high→2, else→3. Should be: urgent→1, high→2, medium→3, low→4 (matching SQLite version). Medium and low are currently treated identically.

### AI Router Not Ported to PostgreSQL

- [ ] **Port AI chat router to PostgreSQL backend** — `backend/src/ai/chat.ts` imports from `../db` (SQLite). Frontend has FloatingAI widget, `useAIChat` hook (calls `/api/ai/chat`, `/api/ai/execute`), and Settings page (calls `/api/ai/config`). All 404 in production since `index-pg.ts` never mounts the AI router. Create `ai/chat-pg.ts` using `db-pg.ts` helpers, mount in `index-pg.ts`. Or: disable the FloatingAI widget and Settings AI section in production to avoid confusion.

### Systematic UAT Verification

Each task below maps to a section in `specs/uat-full-platform.md`. Test against local PostgreSQL (`npm run dev:pg`). Fix any issues found inline.

- [ ] **UAT: Authentication & Users** — Login, JWT token, protected routes, user CRUD, role enforcement. Per specs/uat-full-platform.md §2. Note: PG `GET /api/users` (line 2426) lacks `requireRole('admin')` unlike SQLite version — verify this is intentional (returns all users for assignment dropdowns).

- [ ] **UAT: Properties CRUD & relationships** — Create/read/update/delete, landlord linking (primary + secondary), tenant linking, compliance fields. Per specs/uat-full-platform.md §3. Verify the `LEFT JOIN` fix resolves the "record updates broken" report.

- [ ] **UAT: Landlords CRUD & pipeline** — Create/read/update/delete (individual/company/trust), directors, view landlord's properties. Per specs/uat-full-platform.md §4. Verify the route ordering fix restores duplicate detection.

- [ ] **UAT: BDM CRUD & conversion** — Create/read/update/delete, status changes, pipeline/kanban view, convert to landlord. Per specs/uat-full-platform.md §5. BDM kanban calls `load()` after update (line 130) — confirmed working. Verify SMS/email history loads via generic endpoints (lines 2957, 2967).

- [ ] **UAT: Tenant Enquiries — CRUD, Kanban & conversion** — Create/read/update/delete, kanban board column moves, status changes, duplicate detection, joint applicants, convert to tenant. Per specs/uat-full-platform.md §6. Verify the EnquiriesKanban refetch fix resolves the "kanban status sync" bug.

- [ ] **UAT: Tenants CRUD** — Create/read/update/delete, KYC, guarantor, deposit fields. Per specs/uat-full-platform.md §7.

- [ ] **UAT: Maintenance CRUD** — Create/read/update/delete (after adding DELETE endpoint and LEFT JOIN fix). Per specs/uat-full-platform.md §8.

- [ ] **UAT: Tasks CRUD** — Create/read/update/delete, entity linking via `entity_type`/`entity_id`. Per specs/uat-full-platform.md §9. Verify `doc.filename` fix prevents file leaks.

- [ ] **UAT: Transactions & Rent Payments** — Create/read/update payments, mark as paid. Per specs/uat-full-platform.md §10.

- [ ] **UAT: Documents & File Uploads** — Upload to any entity, list, download (after route ordering fix), delete. Per specs/uat-full-platform.md §11. Verify download route is reachable after reorder.

- [ ] **UAT: Dashboard & Reporting** — Dashboard loads with stats, data export endpoint. Per specs/uat-full-platform.md §12.

- [ ] **UAT: Public API Endpoints** — `GET /api/public/properties`, `POST /api/public/tenant-enquiries`, `POST /api/public/landlord-enquiries`, rate limiting. Per specs/uat-full-platform.md §13.

## Low Priority

### Deployment Re-verification

- [ ] **Run `npm run render-build` and verify build succeeds** — After all fixes, confirm `backend/dist/index-pg.js` is produced, frontend builds, backend starts and `/api/health` responds 200.

- [ ] **Deploy to Railway and verify production** — Push fixes, confirm health endpoint, test login, spot-check one CRUD operation.

### Future Release (Out of Scope)

- _Missing single DELETE for `/api/landlords-bdm/:id` and `/api/tenant-enquiries/:id` — frontend uses bulk-delete only, not blocking_
- _Missing `GET /api/rent-payments/:id` and `DELETE /api/rent-payments/:id` — frontend only lists payments, doesn't need single-record ops yet_
- _Missing `GET /api/users/:id` — frontend fetches user list only_
- _`PUT /api/directors/:id` returns `{ success: true }` not entity (line 460) — low-traffic endpoint_
- _`PUT /api/rent-payments/:id/pay` returns `{ success: true, status }` not full entity (line 2417) — acceptable_
- _Hardcoded team list in Tasks.tsx — should pull from `/api/users` instead of static array_
- _Non-functional toggles in Settings.tsx (notifications, dark mode) — purely decorative_
- _BDM workflow follow-up SMS template hardcoded in frontend — doesn't use `followUpSms()` from sms.ts_
- _Backup " 2.tsx"/".ts" files cluttering codebase — safe to delete, no imports reference them_
- _`|| true` in render-build.sh silently swallows TypeScript compile errors — should fail loudly_
- _`public/properties` query includes both 'to_let' and 'To Let' status values — mixed casing from legacy data_
- _CI pipeline: GitHub Actions to validate Railway build before push_
- _PG `GET /api/users` missing `requireRole('admin')` — currently returns all users for both admin and assignment UIs_
- _POST /api/maintenance missing reporter fields vs SQLite parity (if not fixed in Medium)_
- _Dashboard maintenance query (line ~180) uses INNER JOIN — same LEFT JOIN concern_
