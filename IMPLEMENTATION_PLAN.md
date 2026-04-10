# Implementation Plan

<!-- Release: Full Platform UAT & Bug Fix -->
<!-- Audience: Solo dev preparing Fleming CRM for production use after Railway deployment fixes -->
<!-- Spec: specs/uat-full-platform.md -->
<!-- Last updated: 2026-04-11 — gap analysis verified all High Priority fixes applied -->

## High Priority (ALL VERIFIED COMPLETE)

All 10 critical fixes confirmed applied via code inspection on 2026-04-11:

- [x] Route ordering: `check-duplicates` before `/:id` (line 254 vs 333)
- [x] Route ordering: `download/:id` before `/:entityType/:entityId` (line 2314 vs 2329)
- [x] LEFT JOIN fix: `PUT /api/properties/:id` (line 2029)
- [x] LEFT JOIN fix: `GET /api/maintenance` (line 2195)
- [x] LEFT JOIN fix: `GET /api/tenancies` (line 2385)
- [x] `doc.filename` fix in `DELETE /api/tasks/:id` (line 2150)
- [x] `DELETE /api/maintenance/:id` endpoint added (line 2260)
- [x] `PUT /api/maintenance/:id` returns full record (line 2249)
- [x] `PUT /api/landlords-bdm/:id` returns full record (line 679)
- [x] `PUT /api/tasks/:id` returns full record (line 2124)
- [x] EnquiriesKanban.tsx calls `await load()` after PUT (line 515)
- [x] Maintenance sort includes all 4 priority levels (line 2196)

## Medium Priority

### Dashboard LEFT JOIN Fix (same class as completed fixes)

- [x] **Fix dashboard `recentMaintenance` query: `JOIN` → `LEFT JOIN` for properties** — Line 186 uses `JOIN properties p ON p.id = m.property_id`. If a maintenance record references a deleted property, it silently vanishes from dashboard. Change to `LEFT JOIN`. Same pattern as the verified maintenance list fix.

### Disable FloatingAI Widget in Production

- [x] **Hide FloatingAI widget until AI router is ported** — `FloatingAI` is rendered in `Layout.tsx` (line 195) but all `/api/ai/*` endpoints 404 in production since `index-pg.ts` never mounts the AI router. `chat.ts` imports SQLite `db` — can't just mount it. Remove or conditionally hide the `<FloatingAI />` render in `Layout.tsx`. Also hide the AI config section in `Settings.tsx` if present. This is the SLC approach — porting the full AI router is out of scope for this UAT release.

### POST /api/maintenance Missing Fields (parity with schema)

- [x] **Expand POST /api/maintenance to accept reporter fields** — Line 2204 INSERT only accepts `property_id, title, description, category, priority`. DB schema (db-pg.ts:272-294) has `tenant_id, landlord_id, reporter_name, reporter_email, reporter_phone, reporter_type`. The list view displays `reporter_name`. Add these 6 optional fields to the INSERT.

### Systematic UAT Verification

Each task below maps to a section in `specs/uat-full-platform.md`. Test against local PostgreSQL (`npm run dev:pg`). Fix any issues found inline.

- [x] **UAT: Authentication & Users** — Login, JWT token, protected routes, user CRUD, role enforcement. Per specs/uat-full-platform.md §2. Known: `GET /api/users` (line 2468) lacks `requireRole('admin')` — intentionally left open for assignment dropdowns (see Future Release for separation). Fixed: `AuthContext.tsx` User.role type was `'landlord'|'tenant'|'admin'` — corrected to `'viewer'|'staff'|'manager'|'admin'` to match backend roles.

- [ ] **UAT: Properties CRUD & relationships** — Create/read/update/delete, landlord linking (primary + secondary), tenant linking, compliance fields. Per specs/uat-full-platform.md §3. LEFT JOIN fix verified — confirm frontend behaviour.

- [ ] **UAT: Landlords CRUD & pipeline** — Create/read/update/delete (individual/company/trust), directors, view landlord's properties. Per specs/uat-full-platform.md §4. Route ordering fix verified — confirm duplicate detection works.

- [ ] **UAT: BDM CRUD & conversion** — Create/read/update/delete, status changes, pipeline/kanban view, convert to landlord. Per specs/uat-full-platform.md §5. BDM kanban calls `load()` after update (line 130) — confirmed working.

- [ ] **UAT: Tenant Enquiries — CRUD, Kanban & conversion** — Create/read/update/delete, kanban board column moves, status changes, duplicate detection, joint applicants, convert to tenant. Per specs/uat-full-platform.md §6. Kanban refetch fix verified — confirm status sync works.

- [ ] **UAT: Tenants CRUD** — Create/read/update/delete, KYC, guarantor, deposit fields. Per specs/uat-full-platform.md §7.

- [ ] **UAT: Maintenance CRUD** — Create/read/update/delete, verify DELETE endpoint works, verify LEFT JOIN fix. Per specs/uat-full-platform.md §8.

- [ ] **UAT: Tasks CRUD** — Create/read/update/delete, entity linking via `entity_type`/`entity_id`. Per specs/uat-full-platform.md §9. Verify `doc.filename` fix prevents file leaks on task deletion.

- [ ] **UAT: Transactions & Rent Payments** — Create/read/update payments, mark as paid (partial vs full). Per specs/uat-full-platform.md §10.

- [ ] **UAT: Documents & File Uploads** — Upload to any entity, list, download, delete. Per specs/uat-full-platform.md §11. Download route reachable after reorder — verify end-to-end.

- [ ] **UAT: Dashboard & Reporting** — Dashboard loads with stats, data export endpoint. Per specs/uat-full-platform.md §12. Check after LEFT JOIN fix applied.

- [ ] **UAT: Public API Endpoints** — `GET /api/public/properties`, `POST /api/public/tenant-enquiries`, `POST /api/public/landlord-enquiries`, rate limiting. Per specs/uat-full-platform.md §13. Rate limiting confirmed on all public routes.

## Low Priority

### Deployment Re-verification

- [ ] **Run `npm run render-build` and verify build succeeds** — After all fixes, confirm `backend/dist/index-pg.js` is produced, frontend builds, backend starts and `/api/health` responds 200.

- [ ] **Deploy to Railway and verify production** — Push fixes, confirm health endpoint, test login, spot-check one CRUD operation.

### Future Release (Out of Scope)

- _Port AI chat router to PostgreSQL (`ai/chat-pg.ts`) — requires creating PG version of all AI queries, mounting in `index-pg.ts`. Re-enable FloatingAI widget after._
- _`POST /api/auth/login` has no rate limiting — brute force risk. Add `express-rate-limit` (e.g. 10 attempts/15min)._
- _Split `GET /api/users` into admin-only full list + lightweight `/api/users/assignable` for dropdowns_
- _Missing single DELETE for `/api/landlords-bdm/:id` and `/api/tenant-enquiries/:id` — frontend uses bulk-delete only_
- _Missing `GET /api/rent-payments/:id` and `DELETE /api/rent-payments/:id` — frontend only lists payments_
- _Missing `GET /api/users/:id` — frontend fetches user list only_
- _`PUT /api/directors/:id` returns `{ success: true }` not entity (line 460) — low-traffic endpoint_
- _`PUT /api/rent-payments/:id/pay` returns `{ success: true, status }` not full entity — acceptable_
- _Hardcoded team list in Tasks.tsx — should pull from `/api/users` instead of static array_
- _Non-functional toggles in Settings.tsx (notifications, dark mode) — purely decorative_
- _BDM workflow follow-up SMS template hardcoded in frontend — doesn't use `followUpSms()` from sms.ts_
- _Backup " 2.tsx"/".ts" files cluttering codebase (5 frontend pages) — safe to delete, no imports reference them_
- _`|| true` in render-build.sh silently swallows TypeScript compile errors — should fail loudly_
- _`public/properties` query includes both 'to_let' and 'To Let' status values — mixed casing from legacy data_
- _CI pipeline: GitHub Actions to validate Railway build before push_
