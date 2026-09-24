# API keys and configuration handover

Actual credentials are supplied separately in the private `fleming-api-keys.env` file. They are intentionally excluded from Git. This document contains names and setup information only.

The inventory below records configuration found in the production backend and the production frontend environment on **24 September 2026**. “Present” means a value was available; it does not certify provider approval, permissions or successful delivery.

## Production inventory

| Service | Configuration names | Handover status |
| --- | --- | --- |
| Database | `DATABASE_URL` | Present; production database credentials, not a local demo connection |
| Authentication | `JWT_SECRET` | Present |
| Stored portal credentials | `PORTAL_CREDENTIALS_KEY` | Present |
| Bank token encryption | `BANK_FEED_ENCRYPTION_KEY` | Present; preserve with the database it encrypts |
| Resend | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Present |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_SENDER_ID` | Present |
| FreeAgent | `FREEAGENT_CLIENT_ID`, `FREEAGENT_CLIENT_SECRET`, `FREEAGENT_REDIRECT_URI` | Present; separate account authorisation is still required on a fresh database |
| TrueLayer | `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET` | Not present; environment and redirect URL were available |
| EPC | `EPC_API_TOKEN` | Present; legacy `EPC_API_KEY` and `EPC_API_EMAIL` also retained in the private inventory, but current code uses `EPC_API_TOKEN` |
| Companies House | `COMPANIES_HOUSE_API_KEY` | Present |
| Council Tax | `COUNCIL_TAX_API_KEY` | Not present |
| Google Maps / Places | `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_PLACES_API_KEY` | Not present in the production frontend environment inspected |
| Feedback worker | `FEEDBACK_AGENT_TOKEN` | Present; copying it does not create or restart a scheduled task |
| Sentry | `SENTRY_DSN` | Not present |
| Flemo AI | Per-user Codex OAuth connection | Not an API key; reconnect using the CRM's account connection |

App URL settings are included with the private handover for context. `EMAIL_FROM` is also retained as deployed configuration, but the current sender is defined in `backend/src/email.ts`; changing this variable alone does not change that sender.

## Where settings go

The backend reads its local `backend/.env` through the development and migration commands. The frontend reads `frontend/.env` when Vite starts. Restart the corresponding process after edits. Production settings are managed separately in Fly.io and Vercel.

Server keys belong only in the backend. Anything named `VITE_*` is exposed to the browser; Google browser keys, if added, should be restricted to the intended domains and APIs in the provider console.

For Sam's local demo, follow the root [README](../README.md). The setup script generates separate local secrets and leaves providers blank. **Do not copy the production credentials file over the local `.env`.** Real Resend/Twilio credentials turn on real delivery, and the production database URL points at real office records.

## OAuth and files that are not API keys

Bank connection access/refresh tokens are stored encrypted in the database. Flemo account sessions are stored separately on the server. Neither has been copied into this handover as an API key. A local database starts without those connections; use development provider applications with matching local callbacks if testing OAuth.

GitHub, Fly.io and Vercel account login tokens are deployment access, not application API keys. They are not in this file. Sam needs his own invited account access if he will manage those services. This handover does not include a production database backup, uploaded tenant documents or a production CRM user's password.

## Keeping the handover private

Keep the credentials file outside the repository and share it through your password manager or another private channel. The private directory and files on Danyl's Mac have owner-only permissions. Do not paste the file into support tickets, chat messages, screenshots or a pull request. `.env` files and local Flemo sessions are ignored by Git; the `.env.example` templates are safe to commit.
