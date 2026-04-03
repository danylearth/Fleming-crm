# AGENTS.md - Project Configuration for Clonk
<!-- KEEP THIS FILE UNDER ~80 LINES - operational only -->

## Tech Stack
- **Frontend:** React 19 + TypeScript 5.9 + Vite 7 + TailwindCSS 4 + React Router 7
- **Backend:** Express 5 + TypeScript 5.9 + PostgreSQL (prod) / SQLite (dev)
- **Mobile:** React Native 0.81.5 + Expo 54 + TanStack Query 5
- **Auth:** JWT (jsonwebtoken) + bcryptjs, 7-day tokens
- **Key deps:** multer (uploads), sharp (thumbnails), resend (email), twilio (SMS), pg + better-sqlite3

## Build Commands
```bash
# Frontend
cd frontend && npm run dev          # Dev on :5173
cd frontend && npm run build        # tsc -b && vite build
cd frontend && npm run lint         # ESLint

# Backend
cd backend && npm run dev           # SQLite dev (tsx watch src/index.ts)
cd backend && npm run dev:pg        # PostgreSQL dev (tsx watch src/index-pg.ts)
cd backend && npm run build         # tsc → dist/
cd backend && npm run start         # node dist/index-pg.js (prod)

# Mobile
cd mobile && npm run start          # Expo dev server
cd mobile && npm run ios / android

# Root shortcuts
npm run dev:frontend / dev:backend
npm run render-build / render-start  # Render deployment

# No test framework configured
```

## Project Structure
```
/
├── frontend/src/
│   ├── pages/          # Route components (V3 suffix removed, e.g. Dashboard.tsx)
│   ├── components/     # Layout.tsx, AILayout.tsx, V3Layout.tsx, v3/ lib
│   ├── context/        # AuthContext, ThemeContext, PortfolioContext
│   ├── hooks/          # useApi, useAIChat, useGovernmentAPIs, usePermissions
│   └── App.tsx         # All routes defined here
├── backend/src/
│   ├── index.ts        # SQLite entry point (dev)
│   ├── index-pg.ts     # PostgreSQL entry point (production)
│   ├── db.ts / db-pg.ts
│   ├── auth.ts         # JWT middleware + requireRole()
│   ├── scheduler.ts    # Compliance reminder cron jobs
│   ├── routes/         # public-tenant-enquiry.ts
│   └── ai/chat.ts      # AI assistant router
├── mobile/             # Expo RN app
├── tenants-subdomain/  # apply.fleminglettings.co.uk (Vercel)
├── landlords-subdomain/ # landlords.fleminglettings.co.uk (Vercel)
└── public-form/        # Legacy static HTML tenant form
```

## Architecture
Monorepo with separate frontend (Vercel), backend API (Railway/PostgreSQL), and mobile (Expo). REST API on port 3001 with JWT auth. Dual DB support: `index.ts`+`db.ts` for SQLite dev, `index-pg.ts`+`db-pg.ts` for PostgreSQL prod. Public unauthenticated endpoints at `/api/public/*` for external forms.

## Existing Features
- **Dashboard** — stats, recent activity
- **Properties** — CRUD, compliance tracking (EICR/EPC/gas), multi-landlord support, inventory with photos
- **Landlords** — individual/company/trust types, Companies House lookup, BDM pipeline
- **Tenants** — full KYC, guarantor, deposit tracking, enquiry → tenant pipeline
- **Tenant Enquiries** — kanban board, duplicate detection, public intake form
- **Maintenance** — requests linked to properties
- **Tasks** — manual + auto-created compliance reminders (scheduler)
- **Financials** — rent payment tracking
- **Users/Settings** — role-based (admin/manager/staff/viewer)
- **AI Assistant** — floating widget (V3), full sidebar (V2), `/api/ai/chat`
- **Government APIs** — Land Registry, Postcodes.io, EPC, Companies House, Council Tax
- **Mobile app** — Expo RN with secure token storage, same API

## Code Patterns
- **Single UI version:** V1/V2 deleted, V3 suffix removed — pages are now `Page.tsx` (e.g. `Dashboard.tsx`)
- **V3 active layout:** `V3Layout.tsx` with collapsible sidebar, navy/gold theme (`#1a2332`/`#d4af37`)
- **API calls:** `useApi` hook + fetch with `Authorization: Bearer` header
- **Polymorphic relations:** tasks/documents use `entity_type` + `entity_id`
- **Audit logging:** `logAudit(userId, email, action, entityType, entityId, changes)` on all mutations
- **No tests** — zero test files in the entire repo

## Dev Server
```bash
# Requires two terminals:
cd backend && npm run dev:pg   # needs DATABASE_URL or falls back to SQLite with: npm run dev
cd frontend && npm run dev     # http://localhost:5173

# Key env vars:
# Backend: DATABASE_URL, JWT_SECRET, UPLOADS_PATH, RESEND_API_KEY
# Frontend: VITE_API_URL (default http://localhost:3001)
# Default creds: admin@fleming.com / admin123
```

## Patterns Discovered
- **Joint applicants use linked records:** `tenant_enquiries.joint_partner_id` self-references to link two individual enquiry records. Each applicant has their own record, documents, and KYC. Shared fields (status, property, viewing) sync on update. Legacy records may still have `_2` suffix columns without `joint_partner_id` — UI handles both patterns.

## Gotchas
- Express 5 is used (not 4) — route handlers return promises natively, error handling differs
- Backend is API-only; root `GET /` must return JSON, never serve frontend files (Railway deployment)
- Never delete converted records (BDM→Landlord, Enquiry→Tenant) — only mark as converted
- SQLite uses `index.ts`/`db.ts`; PostgreSQL uses `index-pg.ts`/`db-pg.ts` — don't mix SQL syntax
- Mobile physical device testing requires local network IP in `mobile/src/services/api.ts`, not localhost
