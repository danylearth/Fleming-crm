# Fleming V3 Sprint Plan

## Architecture
- All V3 pages under `/v3/*` routes
- New shared layout: `V3Layout.tsx` (dark sidebar + top bar + optional AI chat)
- All pages built from scratch using V3-DESIGN-SPEC.md
- Data from existing backend API (`https://fleming-crm-api.fly.dev`)
- Existing `useApi` hook for authenticated requests

## Sprint 1: Foundation + Layout (Agent: Main)
- [x] V3-DESIGN-SPEC.md written
- [ ] `V3Layout.tsx` — dark sidebar, top bar, page wrapper
- [ ] `v3/components/` — shared components (Card, Button, Input, Tag, ProgressRing, Avatar, StatusDot)
- [ ] V3 Tailwind config additions (colors, etc.)
- [ ] Route setup in App.tsx for all `/v3/*`
- [ ] Login redirect to `/v3` for V3 mode

## Sprint 2: Core Pages (3 Sub-agents in parallel)

### Agent A: Dashboard + Properties
- [ ] `DashboardV3.tsx` — greeting, stats summary, property map preview, pipeline, tasks, recent activity
- [ ] `PropertiesV3.tsx` — grid/map toggle, search, filters, property cards
- [ ] `PropertyDetailV3.tsx` — hero image, progress rings (compliance), tenants, tasks, documents, messenger

### Agent B: Landlords + Tenants + Settings
- [ ] `LandlordsV3.tsx` — card grid with search + filters
- [ ] `LandlordDetailV3.tsx` — banner, company info, properties list, collaborators, documents
- [ ] `TenantsV3.tsx` — list/grid view
- [ ] `TenantDetailV3.tsx` — personal info form, documents, linked property
- [ ] `SettingsV3.tsx` — user profile, password, preferences

### Agent C: Enquiries + BDM + Operational
- [ ] `EnquiriesV3.tsx` — messenger layout (conversation list + chat panel)
- [ ] `BDMV3.tsx` — pipeline card grid
- [ ] `MaintenanceV3.tsx` — task list with status + priority
- [ ] `TasksV3.tsx` — task list with progress bars + status
- [ ] `TransactionsV3.tsx` — financial overview

## Sprint 3: AI Integration + Cross-linking (Main agent)
- [ ] AI chat component (reusable, context-aware per page)
- [ ] Cross-entity navigation (property→landlord, tenant→property, etc.)
- [ ] Create/edit modals for all entities
- [ ] Document upload integration

## Sprint 4: QA Agent
- [ ] Verify every route loads
- [ ] Verify every nav link works
- [ ] Verify data loads on every page
- [ ] Verify detail pages load from list clicks
- [ ] Verify cross-entity links work
- [ ] Verify AI chat renders
- [ ] Report broken items

## Sprint 5: Deploy
- [ ] Build + deploy to Vercel
- [ ] Verify production
