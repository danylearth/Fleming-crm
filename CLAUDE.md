# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fleming CRM is a full-stack lettings management system for property management companies. It manages landlords, tenants, properties, maintenance requests, compliance tracking, and business development pipelines.

**Stack:**
- Frontend: React 19 + TypeScript + Vite + TailwindCSS + React Router
- Backend: Express.js + TypeScript
- Database: SQLite (dev) / PostgreSQL (production)
- Deployment: Railway, Render, Vercel (frontend static hosting)

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Start dev server on port 5173
npm run build        # Production build
npm run lint         # Run ESLint
```

### Backend
```bash
cd backend
npm install
npm run dev          # SQLite dev server with tsx watch
npm run dev:pg       # PostgreSQL dev server with tsx watch
npm run build        # TypeScript compilation
npm run start        # Production server (compiled JS)
npm run seed:pg      # Seed PostgreSQL with demo data
```

### Mobile (from mobile directory)
```bash
cd mobile
npm install
npm run start        # Start Expo dev server
npm run android      # Run on Android emulator/device
npm run ios          # Run on iOS simulator/device
npm run web          # Run in web browser
```

### Public Form (static HTML)
```bash
cd public-form
python3 -m http.server 8000  # Test locally at http://localhost:8000/tenant-enquiry.html
# Or deploy tenant-enquiry.html to any static host (Vercel, Netlify, etc.)
```

### Full Stack (from root)
```bash
npm run dev:frontend    # Start frontend dev server
npm run dev:backend     # Start backend dev server
npm run render-build    # Production build for Render deployment
npm run render-start    # Production start for Render deployment
```

### Subdomain Forms Deployment
```bash
# Deploy tenant form to apply.fleminglettings.co.uk
./deploy-tenant-subdomain.sh

# Deploy landlord form to landlords.fleminglettings.co.uk
./deploy-landlord-subdomain.sh

# Or manually from subdomain directories
cd tenants-subdomain && vercel --prod
cd landlords-subdomain && vercel --prod
```

## Architecture

### Backend Structure

**Multiple Entry Points:**
- `src/index.ts` - SQLite backend (development/local)
- `src/index-pg.ts` - PostgreSQL backend (production)
- `src/index-postgres.ts` - Legacy PostgreSQL implementation

**Database Layer:**
- `src/db.ts` - SQLite database with better-sqlite3, includes full schema initialization
- `src/db-pg.ts` - PostgreSQL abstraction layer with connection pool helpers
- Database choice controlled by environment and entry point

**Key Backend Files:**
- `src/auth.ts` - JWT authentication middleware and token generation
- `src/email.ts` - Email service using Resend for notifications
- `src/sms.ts` - Twilio SMS integration (simulates sends if Twilio env vars missing)
- `src/scheduler.ts` - Background job scheduler for compliance reminders and automated task creation
- `src/ai/chat.ts` - AI assistant router for natural language queries
- `src/inventory-routes.ts` - Property inventory with photo upload and thumbnail generation (sharp)
- `src/routes/public-tenant-enquiry.ts` - Public tenant enquiry endpoint (PostgreSQL version)
- `src/db-inventory-migration.ts` / `src/run-migration.ts` - Database migration utilities

**Scheduler System:**
The scheduler (`src/scheduler.ts`) runs every hour and:
- Checks compliance certificate expiry dates (Gas Safety, EICR, EPC)
- Auto-creates reminder tasks at 30, 14, and 7 days before expiry
- Avoids duplicate tasks by checking existing pending/in-progress tasks

**API Architecture:**
All backend routes are RESTful and follow the pattern:
- `GET /api/{entity}` - List all
- `GET /api/{entity}/:id` - Get one
- `POST /api/{entity}` - Create
- `PUT /api/{entity}/:id` - Update
- `DELETE /api/{entity}/:id` - Delete

Special routes:
- `POST /api/landlords-bdm/:id/convert` - Convert BDM prospect to landlord
- `POST /api/tenant-enquiries/:id/convert` - Convert enquiry to tenant
- `PUT /api/rent-payments/:id/pay` - Mark rent payment as paid
- `GET /api/tenant-enquiries/check-duplicates` - Cross-check duplicates across tenants/landlords/enquiries
- `GET /api/landlords/:id/properties` - Get all properties for a landlord (including via property_landlords)
- `GET /api/properties/:id/landlords` - Get all landlords for a property (primary + secondary)
- `POST /api/properties/:id/landlords` - Add secondary landlord to property
- `DELETE /api/properties/:propertyId/landlords/:landlordId` - Remove secondary landlord
- `GET /api/landlords/:id/directors` - Get directors for a company landlord
- `POST /api/landlords/:id/directors` - Add director to company landlord
- `DELETE /api/landlords/:landlordId/directors/:directorId` - Remove director from company

### Frontend Structure

**Three UI Versions:**
The codebase contains three iterations of the UI (V1, V2, V3). V3 is the current production version with a navy/gold color scheme.

**Routing:**
- All routes configured in `src/App.tsx`
- Protected routes wrapped with `<ProtectedRoute>` component
- Auth context manages user state and redirects
- Default route redirects to `/v3`

**Page Naming Convention:**
- V1: `PageName.tsx`
- V2: `PageNameV2.tsx`
- V3: `PageNameV3.tsx` (current production)

**Current V3 Pages:**
- List + Detail pages for: Properties, Landlords, Tenants, Enquiries, BDM, Maintenance, Tasks
- Dashboard, Settings, Transactions, Users, Login
- Enquiries have both list (`EnquiriesV3`) and kanban board (`EnquiriesKanbanV3`) views

**Context Providers:**
- `AuthContext.tsx` - User authentication state, login/logout, token management
- `ThemeContext.tsx` - Light/dark mode theme switching
- `PortfolioContext.tsx` - Portfolio type filtering (internal vs external landlords)

**Component Organization:**
- `components/` - Shared components (Layout, AILayout, DocumentsSection)
- `components/v3/` - V3-specific reusable components
- `pages/` - Top-level route components
- `hooks/` - Custom React hooks
- `utils/` - Utility functions

**Styling:**
- TailwindCSS with custom navy/gold theme
- Theme colors defined in `tailwind.config.js`
- Navy primary: `#1a2332`
- Gold accent: `#d4af37`

### Mobile App Structure

**React Native/Expo App:**
The codebase includes a mobile app in the `/mobile` directory for on-the-go CRM access.

**Stack:**
- React Native 0.81.5
- Expo ~54.0.0
- TypeScript
- React Navigation for routing
- TanStack Query for data fetching
- Expo SecureStore for token storage

**API Configuration:**
- Development: Connects to local backend via network IP (configure in `src/services/api.ts`)
- Production: Connects to Railway backend URL
- Change `API_BASE_URL` in `src/services/api.ts` to point to your backend
- Development requires your local network IP (not localhost) for physical device testing
- Current dev IP: `192.168.0.123:3001` (update this to match your local network)

**Key Files:**
- `App.tsx` - Root component with providers (Query, Theme, Auth)
- `src/context/AuthContext.tsx` - Mobile authentication state
- `src/context/ThemeContext.tsx` - Light/dark theme switching
- `src/services/api.ts` - API client with token management
- `src/navigation/AppNavigator.tsx` - Navigation structure

**Authentication:**
- Uses Expo SecureStore for token persistence (more secure than AsyncStorage)
- Token automatically attached to all API requests via interceptor
- Auto-logout on 401 responses
- Same JWT tokens as web frontend

### Database Schema

**Core Entities:**
- `users` - Staff users with role-based access (admin/staff)
- `landlords` - Onboarded landlords with full KYC (individual/company/trust types)
- `landlord_directors` - Directors/officers for company landlords
- `landlords_bdm` - Business development prospects (pipeline)
- `tenant_enquiries` - Website enquiries (pre-tenant pipeline)
- `tenants` - Onboarded tenants with KYC and tenancy details
- `properties` - Rental properties with compliance tracking
- `property_landlords` - Junction table for multi-landlord properties
- `maintenance` - Maintenance requests
- `tasks` - Manual and automated tasks
- `rent_payments` - Rent payment tracking
- `documents` - File uploads linked to entities
- `audit_log` - Full audit trail of all user actions

**Key Relationships:**
- Properties belong to landlords (primary relationship)
- Properties support multiple landlords via `property_landlords` junction table
  - One primary landlord (marked with `is_primary = 1`)
  - Multiple secondary landlords (co-owners, trustees, companies with multiple directors)
  - Tracks ownership entity type (individual/company/trust)
- Tenants can be linked to properties (via `tenant_id` on properties table)
- Maintenance requests link to properties
- Tasks can link to any entity type (polymorphic via `entity_type` and `entity_id`)
- Documents link to any entity type (polymorphic)

**Compliance Fields on Properties:**
- `eicr_expiry_date` - Electrical safety certificate
- `epc_expiry_date` - Energy Performance Certificate
- `gas_safety_expiry_date` - Gas safety certificate (only if `has_gas = 1`)
- Scheduler auto-creates reminder tasks before these expire

**Tenant/Enquiry Pipeline:**
1. `tenant_enquiries` with status: new → viewing_booked → onboarding → converted/rejected
2. Convert enquiry creates record in `tenants` table
3. Tenants have full KYC, guarantor, and deposit tracking

**Landlord Pipeline:**
1. `landlords_bdm` with status: new → contacted → follow_up → interested → onboarded/not_interested
2. Convert BDM prospect creates record in `landlords` table

**Landlord Types:**
Landlords can be one of three types:
- `individual` - Single person owner (default)
- `company` - Limited company (requires `company_number`, can have multiple `landlord_directors`)
- `trust` - Trust entity

Company landlords require Companies House verification and director information.

### Government API Integrations

The system integrates with several UK government open data APIs to provide accurate property information:

**1. Land Registry Price Paid Data (FREE - No API key needed)**
- Endpoint: `GET /api/land-registry/price-paid?postcode=XXX`
- Source: HM Land Registry Open Data (Open Government License)
- Provides historical sale prices for properties by postcode
- Returns up to 20 recent transactions with property type, price, and date
- Used on property detail pages to show area market intelligence

**2. Postcodes.io (FREE - No API key needed)**
- Endpoint: `GET /api/postcode/lookup?postcode=XXX`
- Endpoint: `GET /api/postcode/autocomplete?query=XXX`
- Source: UK government ONS Postcode Directory & OS Open Names
- Validates postcodes and provides geolocation data
- Includes administrative district, ward, region, coordinates
- Used for address validation and autocomplete

**3. EPC Lookup (FREE - Requires registration)**
- Endpoint: `GET /api/epc-lookup?postcode=XXX`
- Source: MHCLG Energy Performance Certificates
- Provides energy ratings, certificate dates, recommendations
- Requires free API key from epc.opendatacommunities.org
- Used for auto-populating property compliance data

**4. Companies House (FREE - Requires registration)**
- Endpoint: `GET /api/companies-house/search?query=XXX`
- Endpoint: `GET /api/companies-house/company/:companyNumber`
- Source: Companies House UK company register
- Verifies company registration, status, and registered addresses
- Used for landlord company verification
- Requires free API key from developer.company-information.service.gov.uk

**5. Council Tax Lookup (PAID - CouncilTaxFinder.com)**
- Endpoint: `GET /api/council-tax-lookup?postcode=XXX`
- Source: CouncilTaxFinder.com by INFOROX LTD
- Provides council tax band, annual/monthly tax amounts, and council information
- Returns: address, band, council name, annual tax, monthly tax
- Requires paid monthly subscription from counciltaxfinder.com
- Used for auto-populating property council tax data

**Frontend Components:**
- `<PricePaidData>` - Displays Land Registry price data with average, highest, recent sales
- `<PostcodeAutocomplete>` - Autocomplete input with validation
- `<CompaniesHouseLookup>` - Company search and verification UI

**Hook:**
- `useGovernmentAPIs()` - Custom React hook providing methods for all government APIs

### Public Forms and Subdomains

**Three Public Forms:**
The codebase includes three standalone forms for public-facing data capture:

1. **Tenant Enquiry Form** (`/tenants-subdomain/`)
   - Production URL: `apply.fleminglettings.co.uk`
   - Multi-step wizard (7 steps) with joint applicant support
   - Full KYC data capture
   - Mobile-optimized with touch-friendly targets
   - Property selection from CRM database

2. **Landlord Enquiry Form** (`/landlords-subdomain/`)
   - Production URL: `landlords.fleminglettings.co.uk`
   - Property owner enquiry form for onboarding new landlords
   - Captures landlord details and property information
   - Routes to BDM pipeline in CRM

3. **Legacy Public Form** (`/public-form/`)
   - Original tenant enquiry form (single file)
   - Can be hosted on any static host

**Public API Endpoints:**
The backend provides public endpoints (no auth required):
- `GET /api/public/properties` - List available properties
- `POST /api/public/tenant-enquiries` - Submit tenant enquiry
- `POST /api/public/landlord-enquiries` - Submit landlord enquiry

**Subdomain Deployment:**
Each subdomain form can be deployed independently to Vercel/Netlify:
```bash
cd tenants-subdomain   # or landlords-subdomain
vercel --prod          # Deploy to Vercel
```

Then configure DNS CNAME records:
- `apply` → Vercel DNS (for tenant form)
- `landlords` → Vercel DNS (for landlord form)

**Data Flow:**
1. User submits form on subdomain
2. POST to `/api/public/tenant-enquiries` or `/api/public/landlord-enquiries`
3. Record created in `tenant_enquiries` or `landlords_bdm` table
4. Enquiry appears in CRM for staff to manage
5. Staff progress through pipeline and convert to tenant/landlord

### Environment Configuration

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string (production)
- `DATABASE_PATH` - SQLite file path (optional, defaults to `backend/fleming.db`)
- `JWT_SECRET` - Secret for JWT token signing
- `UPLOADS_PATH` - Directory for file uploads (defaults to `backend/uploads`)
- `RESEND_API_KEY` - API key for Resend email service (optional)
- `FORCE_RESEED` - Set to "true" to wipe and re-seed database on startup

**Frontend Environment Variables:**
- `VITE_API_URL` - Backend API URL (e.g., `http://localhost:3001` for dev, `https://fleming-crm-api-production-7e58.up.railway.app` for production)
- `VITE_GOOGLE_PLACES_API_KEY` - Google Places API key for address autocomplete (optional)
- Frontend `.env` file should have localhost for development
- Production deployments (Vercel) use environment variables set in Vercel dashboard

**Backend Optional API Keys:**
- `EPC_API_KEY` - Register at https://epc.opendatacommunities.org (FREE)
- `COMPANIES_HOUSE_API_KEY` - Register at https://developer.company-information.service.gov.uk (FREE)
- `COUNCIL_TAX_API_KEY` - Subscribe at https://www.counciltaxfinder.com (PAID - Monthly subscription)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` - Twilio SMS (optional, simulates if missing)
- Note: Land Registry and Postcodes.io require NO API keys

**Deployment Configurations:**
- `render.yaml` - Render deployment with persistent disk for SQLite
- `railway.json` - Railway deployment configuration (backend API-only)
- `vercel.json` - Vercel configuration (frontend static hosting)
- `render-build.sh` - Production build script

**Current Production Deployment:**
- Frontend: https://fleming-portal.vercel.app (Vercel)
- Backend: https://fleming-crm-api-production-7e58.up.railway.app (Railway)
- Frontend env var `VITE_API_URL` must point to Railway backend URL
- Backend serves API-only (no static frontend files)
- Railway uses `index-pg.ts` entry point for PostgreSQL
- Vercel deploys from root using `vercel.json` build configuration

### Data Seeding

**Auto-seeding (PostgreSQL):**
When `DATABASE_URL` is set and database is empty, the system auto-seeds with demo data from `src/db-pg.ts`:
- Creates admin user
- Seeds sample landlords, properties, tenants, enquiries, BDM prospects, maintenance, tasks
- Creates realistic compliance dates and schedules

**Manual Seeding:**
- `npm run seed:pg` - Run seed script from Excel file (see `backend/seed-pg.ts`)
- Set `FORCE_RESEED=true` to wipe and re-seed on next startup

## Key Development Patterns

### Duplicate Detection
The system has sophisticated duplicate checking:
- `/api/tenant-enquiries/check-duplicates?email=X&phone=Y&exclude_id=Z`
- Checks across tenants, landlords, and enquiries
- Returns matches with source type and match type (email/phone)
- Used during enquiry creation and editing

### Audit Logging
All create/update/delete operations log to `audit_log`:
```typescript
logAudit(userId, userEmail, 'create', 'landlord', entityId, changesObject);
```

### File Uploads
- Uses multer with disk storage
- Uploaded to `UPLOADS_PATH` or `backend/uploads`
- Metadata stored in `documents` table
- Polymorphic linking via `entity_type` and `entity_id`
- Supported types: PDF, JPEG, PNG, GIF, DOC, DOCX

### Authentication Flow
1. POST `/api/auth/login` with email/password
2. Returns JWT token and user object
3. Frontend stores token in localStorage
4. All API requests include `Authorization: Bearer <token>` header
5. Backend middleware validates token on protected routes

### Task Types
- `manual` - User-created tasks
- `gas_reminder`, `eicr_reminder`, `epc_reminder` - Auto-created by scheduler
- Tasks have `entity_type` and `entity_id` for linking to related entities

## Important Constraints

1. **Express 5:** The backend uses Express 5 (`express@^5.2.1`), not Express 4. Route handlers return promises natively; error handling differs from Express 4 patterns.

2. **Database Flexibility:** Backend supports both SQLite (dev) and PostgreSQL (prod). Never hardcode SQL that's specific to one database type. The codebase uses different entry points (`index.ts` vs `index-pg.ts`) to handle this.

3. **Version Coexistence:** V1, V2, V3 pages coexist. When modifying functionality, check if changes need to propagate across versions or if V3 is the only active version.

4. **Polymorphic Relationships:** Tasks and documents use `entity_type` + `entity_id` pattern. Always ensure both fields are set when creating these records.

5. **Scheduler Dependencies:** The scheduler expects specific property fields (`gas_safety_expiry_date`, etc.) and task types. Don't rename these without updating the scheduler.

6. **Multi-tenant Awareness:** Landlords have `landlord_type` (internal/external) for portfolio filtering. This affects UI filtering and reporting.

7. **Conversion Workflows:** BDM → Landlord and Enquiry → Tenant conversions copy data and update status. Never delete the source record, only mark as converted.

8. **Demo Data:** Production databases can auto-seed. Be careful with `FORCE_RESEED` as it wipes all data.

9. **Public API Endpoints:** The `/api/public/*` routes are intentionally unauthenticated for the external enquiry forms (tenant and landlord). These should remain public but consider implementing rate limiting to prevent abuse.

10. **Mobile Development:** When testing the mobile app on physical devices, use your local network IP address in the API configuration (found in `mobile/src/services/api.ts`), not `localhost` or `127.0.0.1`. The app needs to connect to your development machine over the local network.

11. **Multi-Landlord Properties:** Properties can have multiple landlords. Always ensure one landlord is marked as primary (`is_primary = 1` in `property_landlords` table). The primary landlord ID is also stored on the `properties.landlord_id` field for backwards compatibility and simple queries.

## Deployment Troubleshooting

### Common Railway Backend Issues

**ENOENT Error (no such file or directory: frontend/dist/index.html):**
- Cause: Root route handler in `index-pg.ts` calling `next()` when receiving HTML requests
- Solution: Ensure root route (`GET /`) always returns JSON, never calls `next()`
- The backend is API-only; all frontend static file serving should be commented out

**Database Not Initialized:**
- If login fails with "Invalid credentials" and no users exist, use setup endpoint:
- `POST /api/auth/setup` with `{email, password, name}` to create first admin user
- Check Railway logs to verify `DATABASE_URL` is set and database initialized successfully

**Build Failures:**
- Verify `railway.json` uses correct buildCommand: `./render-build.sh`
- Verify `railway.json` uses correct startCommand: `cd backend && node dist/index-pg.js`
- Check that `tsconfig.render.json` excludes SQLite files: `index.ts`, `db.ts`
- Check that `tsconfig.render.json` includes PostgreSQL files via `src/**/*.ts`

### Common Vercel Frontend Issues

**ECONNREFUSED or Connection Errors:**
- Verify `VITE_API_URL` environment variable is set in Vercel project settings
- Must point to full Railway URL: `https://fleming-crm-api-production-7e58.up.railway.app`
- Set for all environments: Production, Preview, Development
- After changing env vars, trigger redeploy via `vercel --prod` or git push

**Environment Variable Management:**
```bash
# Add environment variable to Vercel
vercel env add VITE_API_URL production

# Remove old environment variable
vercel env rm VITE_API_URL production --yes

# List current environment variables
vercel env ls

# Deploy to production
vercel --prod
```

### Testing Production Deployment

```bash
# Test backend health
curl https://fleming-crm-api-production-7e58.up.railway.app/api/health

# Test backend login
curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fleming.com","password":"admin123"}'

# Create initial admin user if database is empty
curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fleming.com","password":"admin123","name":"Admin User"}'

# Check frontend is serving
curl https://fleming-portal.vercel.app
```

### Default Credentials

If database is freshly initialized:
- Email: `admin@fleming.com`
- Password: `admin123`
