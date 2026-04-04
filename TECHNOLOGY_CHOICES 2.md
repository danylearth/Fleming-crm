# Technology Choices

> These choices were confirmed during API Discovery and inform the implementation plan.

## Selected Technologies

### SMS: Twilio
- **Why**: Already integrated in codebase (`src/sms.ts`), client has existing account, industry standard with delivery status webhooks
- **SDK**: `twilio` (needs adding to package.json — currently dynamically required)
- **API Keys**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- **Key Features**: SMS sending, delivery status callbacks (delivered/pending/rejected), message history
- **Docs**: https://www.twilio.com/docs/messaging/quickstart/node

### Email: Resend
- **Why**: Already installed in package.json (`resend@^6.9.3`), modern API, 3,000 free emails/month, supports HTML templates
- **SDK**: `resend`
- **API Key**: `RESEND_API_KEY`
- **Key Features**: Transactional email, HTML templates, delivery tracking
- **Docs**: https://resend.com/docs

### Address Autocomplete: Google Places API
- **Why**: Client specifically requested "Google-style" address lookup, best autocomplete UX, frontend types already installed (`@types/google.maps`)
- **SDK**: Google Maps JavaScript API (loaded via script tag)
- **API Key**: `VITE_GOOGLE_PLACES_API_KEY`
- **Key Features**: Address autocomplete, place details, UK address lookup
- **Docs**: https://developers.google.com/maps/documentation/places/web-service

### Database: PostgreSQL (production) / SQLite (development)
- **Why**: Already established, dual-DB pattern with separate entry points
- **SDK**: `pg` (PostgreSQL), `better-sqlite3` (SQLite)
- **API Key**: `DATABASE_URL` (PostgreSQL connection string)
- **Status**: Fully configured

### Authentication: JWT
- **Why**: Already implemented, works across web and mobile
- **SDK**: `jsonwebtoken` + `bcryptjs`
- **API Key**: `JWT_SECRET`
- **Status**: Fully configured

### Government APIs (all pre-existing)
- **Land Registry**: Free, no key needed
- **Postcodes.io**: Free, no key needed
- **EPC Lookup**: `EPC_API_KEY` (free registration)
- **Companies House**: `COMPANIES_HOUSE_API_KEY` (free registration)
- **Council Tax**: `COUNCIL_TAX_API_KEY` (paid subscription)

## Not Needed
- **New database**: Existing PostgreSQL/SQLite setup is sufficient
- **New auth provider**: JWT implementation is working
- **AI/LLM**: Existing AI chat integration (`src/ai/chat.ts`) — not in scope for this sprint
- **Payments**: Not required by spec
- **File storage (cloud)**: Disk storage via multer is sufficient for current scale

## Environment Variables Summary

| Variable | Service | Status |
|----------|---------|--------|
| `TWILIO_ACCOUNT_SID` | Twilio | Pending |
| `TWILIO_AUTH_TOKEN` | Twilio | Pending |
| `TWILIO_PHONE_NUMBER` | Twilio | Pending |
| `RESEND_API_KEY` | Resend | Pending |
| `VITE_GOOGLE_PLACES_API_KEY` | Google Places | Pending |
| `DATABASE_URL` | PostgreSQL | Configured |
| `JWT_SECRET` | Auth | Configured |
| `EPC_API_KEY` | EPC Lookup | Configured |
| `COMPANIES_HOUSE_API_KEY` | Companies House | Configured |
| `COUNCIL_TAX_API_KEY` | Council Tax | Configured |
