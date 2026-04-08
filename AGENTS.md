# AGENTS.md - Project Configuration for Clonk
<!-- KEEP THIS FILE UNDER ~80 LINES - operational only -->

## Tech Stack
- **Frontend:** React 19.2.0 + TypeScript 5.9.3 + Vite 7.2.4 + TailwindCSS 4.1.18 + React Router 7.13.0
- **Backend:** Express 5.2.1 + TypeScript 5.9.3 + PostgreSQL (prod) / SQLite (dev)
- **Mobile:** React Native 0.81.5 + Expo 54 + TanStack Query 5 + Expo SecureStore
- **Auth:** JWT (jsonwebtoken 9.0.3) + bcryptjs 3.0.3, 7-day tokens
- **Key deps:** multer 2.0.2 (uploads), sharp 0.34.5 (thumbnails), resend 6.9.3 (email), twilio 5.5.1 (SMS), pg 8.18.0 + better-sqlite3 12.6.2, Vitest 4.1.2

## Build Commands
```bash
# Frontend
cd frontend && npm run dev              # Dev on :5173
cd frontend && npm run build            # tsc -b && vite build
cd frontend && npm run lint             # ESLint
cd frontend && npm test                 # Vitest run
cd frontend && npm run test:coverage    # Vitest coverage

# Backend
cd backend && npm run dev               # SQLite dev (tsx watch src/index.ts)
cd backend && npm run dev:pg            # PostgreSQL dev (tsx watch src/index-pg.ts)
cd backend && npm run build             # tsc → dist/
cd backend && npm run start             # node dist/index-pg.js (prod)
cd backend && npm test                  # Vitest run
cd backend && npm run migrate:production # tsx run-production-migration.ts

# Mobile
cd mobile && npm run start              # Expo dev server
cd mobile && npm run ios / android

# Root shortcuts
npm run dev:frontend / dev:backend
npm run render-build / render-start     # Render deployment
```

## Project Structure
```
/
├── frontend/src/
│   ├── pages/          # Route components (+ backup " 2.tsx" files — ignore)
│   │                   # Dashboard, Properties, PropertyDetail, Landlords, LandlordDetail,
│   │                   # Tenants, TenantDetail, Enquiries, EnquiryDetail, EnquiriesKanban,
│   │                   # BDM, BDMDetail, Maintenance, Tasks, TaskDetail, Transactions,
│   │                   # Settings, Users, Login  (/v3/* → redirect to clean URLs)
│   ├── components/     # Layout.tsx, DocumentsSection.tsx
│   ├── components/ui/  # ActivityTimeline, AddressAutocomplete, BulkActions,
│   │                   # CompaniesHouseLookup, ContextualDocSlot, DataTable, DatePicker,
│   │                   # DocumentUpload, EmailPreviewModal, FloatingAI, OnboardingWizard,
│   │                   # PostcodeAutocomplete, PricePaidData, PropertyMap, RentPayments,
│   │                   # SearchDropdown + icons/
│   ├── context/        # AuthContext, ThemeContext, PortfolioContext
│   ├── hooks/          # useApi, useAIChat, useGovernmentAPIs, usePermissions
│   └── utils/          # sms.ts (segment calc), sms.test.ts
├── backend/src/
│   ├── index.ts        # SQLite entry point (dev)
│   ├── index-pg.ts     # PostgreSQL entry point (prod) — 3500+ lines, ALL routes inline
│   ├── db.ts / db-pg.ts
│   ├── auth.ts         # JWT middleware + requireRole() | auth.test.ts
│   ├── scheduler.ts / scheduler-pg.ts  # Compliance reminder cron jobs
│   ├── sms.ts          # Twilio SMS + templates | sms.test.ts
│   ├── email.ts        # Resend email + delivery tracking
│   ├── inventory-routes.ts  # Photo upload + thumbnails
│   ├── routes/         # public-tenant-enquiry.ts only
│   ├── migrations/     # SQL migration files
│   └── ai/chat.ts      # AI assistant router
├── specs/              # Feature spec markdown files (ignore " 2.md" backups)
├── mobile/             # Expo RN app (React Native 0.81.5)
├── tenants-subdomain/  # apply.fleminglettings.co.uk (Vercel)
├── landlords-subdomain/ # landlords.fleminglettings.co.uk (Vercel)
└── public-form/        # Legacy static HTML tenant form
```

## Architecture
Monorepo: frontend (Vercel static), backend API (Railway/PostgreSQL port 3001), mobile (Expo). REST API with JWT auth on all `/api/*` except `/api/public/*` (unauthenticated, rate-limited). Dual DB: `index.ts`+`db.ts` = SQLite dev; `index-pg.ts`+`db-pg.ts` = PostgreSQL prod. All routes consolidated in `index-pg.ts` — no route separation except `routes/public-tenant-enquiry.ts`.

## Existing Features
- **Dashboard** — stats, recent activity, compliance alerts
- **Properties** — CRUD, compliance (EICR/EPC/gas), multi-landlord, inventory+photos, expenses, viewings
- **Landlords** — individual/company/trust, Companies House lookup, directors, BDM pipeline (convert to landlord)
- **Tenants** — full KYC, guarantor, deposit, enquiry→tenant pipeline, bulk operations
- **Tenant Enquiries** — kanban board, duplicate detection, joint applicants, public intake form
- **Maintenance** — requests linked to properties
- **Tasks** — manual + auto-created compliance reminders (scheduler every hour)
- **Financials** — rent payment tracking, transactions, property expenses
- **Users/Settings** — role-based (admin/manager/staff/viewer)
- **AI Assistant** — floating widget, `/api/ai/chat`
- **SMS/Email** — Twilio SMS (templates, inbound, delivery status) + Resend email (delivery tracking webhooks)
- **Government APIs** — Land Registry, Postcodes.io, EPC, Companies House, Council Tax
- **Mobile app** — Expo RN, React Navigation, secure token storage, same JWT API
- **Public forms** — Tenant (apply.fleminglettings.co.uk) + Landlord (landlords.fleminglettings.co.uk) subdomains
- **Data export** — `GET /api/export/:entityType`

## Code Patterns
- **Single UI version:** V1/V2 deleted; V3 suffix removed — pages named `Dashboard.tsx` (not `DashboardV3.tsx`)
- **Active layout:** `Layout.tsx` collapsible sidebar, navy `#1a2332` / gold `#d4af37` theme (TailwindCSS 4)
- **API calls:** `useApi` hook + fetch with `Authorization: Bearer` header
- **Polymorphic relations:** tasks/documents use `entity_type` + `entity_id`
- **Audit logging:** `logAudit(userId, email, action, entityType, entityId, changes)` on all mutations
- **Tests:** Vitest, co-located (`*.test.ts`). 3 files: `frontend/src/utils/sms.test.ts`, `backend/src/auth.test.ts`, `backend/src/sms.test.ts`

## Dev Server
```bash
cd backend && npm run dev:pg   # PostgreSQL dev (or npm run dev for SQLite)
cd frontend && npm run dev     # http://localhost:5173

# Key env vars:
# Backend: DATABASE_URL, JWT_SECRET, UPLOADS_PATH, RESEND_API_KEY, RESEND_WEBHOOK_SECRET, BASE_URL
#          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
#          EMAIL_FROM, ENQUIRY_NOTIFICATION_EMAIL, FRONTEND_URL (optional)
#          EPC_API_KEY, EPC_API_EMAIL, COMPANIES_HOUSE_API_KEY, COUNCIL_TAX_API_KEY (optional)
# Frontend: VITE_API_URL (default http://localhost:3001)
# Default creds: admin@fleming.com / admin123
# Production: frontend → https://fleming-portal.vercel.app, backend → https://fleming-crm-api-production-7e58.up.railway.app
```

## Patterns Discovered
- **Joint applicants:** `tenant_enquiries.joint_partner_id` self-references two enquiry records. Shared fields (status, property, viewing) sync on update. Legacy records use `_2` suffix columns — UI handles both.
- **Webhook validation:** Twilio via `twilio.validateRequest()`, Resend via svix HMAC-SHA256 (`RESEND_WEBHOOK_SECRET`). Both skip validation in dev when secrets absent.
- **Email delivery tracking:** `email_messages` table stores sent emails with `resend_id`. Resend webhook `/api/email/webhook` updates status (delivered/bounced/opened/clicked/failed).
- **Inbound SMS:** `/api/sms/inbound` matches sender phone to `tenant_enquiries.phone_1`, stores `direction='inbound'` in `sms_messages`, returns empty TwiML.
- **SMS templates:** Exported functions in `backend/src/sms.ts` (viewingConfirmationSms, followUpSms, rejectionSms, rentReminderSms, genericSms). Frontend generates template text inline — not imported from backend.
- **SMS phone normalisation:** `normalizeUkPhone(phone)` in `sms.ts` converts to E.164 (+44). `statusCallback` only set when `BASE_URL` env var is present.
- **Entity SMS/email history:** `GET /api/sms/{entityType}/{id}`, `GET /api/email-history/{entityType}/{id}` — used by detail pages (e.g. BDMDetail).
- **Activity logging:** `POST /api/activity` logs actions (e.g. `note_added`) with `entity_type`, `entity_id`, metadata.
- **SMS segment calculator:** `frontend/src/utils/sms.ts` → `calculateSmsSegments(text)` returning `{ charCount, encoding, segments, charsPerSegment, charsRemaining }`. GSM-7 vs UCS-2 detection.
- **Rate limiting:** `express-rate-limit` on `/api/public/*`. POST: 10 req/15min, GET: 60 req/15min.

## Gotchas
- Express 5 (not 4): route handlers return promises natively; error handling differs
- Backend is API-only: root `GET /` must return JSON, never serve frontend files (Railway)
- Never delete converted records (BDM→Landlord, Enquiry→Tenant) — only mark as converted
- SQLite: `index.ts`/`db.ts`; PostgreSQL: `index-pg.ts`/`db-pg.ts` — never mix SQL syntax across entry points
- Mobile physical device: use local network IP in `mobile/src/services/api.ts`, not `localhost`
- Multi-landlord: always set one `is_primary = 1` in `property_landlords`; also update `properties.landlord_id` for backwards compat
- `index-pg.ts` is 3500+ lines with all routes inline — no route separation except `routes/public-tenant-enquiry.ts`
- Backup files with " 2.tsx"/".ts"/".md" suffix exist throughout — ignore them, use originals
- Root `.npmrc` has `force=true` to bypass npm platform checks for Railway Linux builds
- `db-postgres.ts` and `index-postgres.ts` are legacy files — not actively used; use `db-pg.ts` / `index-pg.ts`
- `tsconfig.json` (prod) compiles ONLY `index-pg.ts`, `db-pg.ts`, `auth.ts` with strict=true; `tsconfig.render.json` compiles `src/**/*.ts` (minus SQLite/legacy) with strict=false — `render-build.sh` uses `tsconfig.render.json`
- Root `render-start` script points to `dist/index.js` (SQLite); Railway uses `dist/index-pg.js` — don't confuse them
