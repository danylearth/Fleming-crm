# Login lockout — 28 September 2026

Published backend crm28-login-lockout-04064e201b (Fly image deployment-01M3MHJWGJGCJEJ9PX2HCRTJDV) and frontend dpl_HuHWcbvoQtirVyaywTP2KAo9AFQk to https://crm.fleminglettings.co.uk. Live frontend entry index-CENOuy26.js. Scoped snapshot: tmp/release-2026-09-28-login-lockout; backend based on the deployed marketing-personalisation release.

Three incorrect passwords take the user to Forgot Password with their email prefilled. Three incorrect verification codes lock the account. Sending the third verification code starts a five-minute deadline: successful verification clears it; otherwise the account locks. A fourth code cannot be requested. Failed provider sends do not increment the sent count. Server checks enforce deadlines independently of the browser countdown; a background task persists timed locks.

Locking revokes remembered devices, outstanding challenges, old account links and authenticated access. An administrator sends a fresh reset link through Team; completing that link clears the lock. Team displays locked status and a Reset Locked Account action.

Validation: frontend and backend builds passed; 48 focused authentication/security tests passed across six files. Fly release migration and machine checks passed. Read-only production verification confirmed migration 0052, the expected release, HTTP 200 frontend with the expected bundle, no locked accounts or pending deadlines, and the administrator's authorised email/phone configuration. No real user was deliberately locked.

The previously deployed marketing fixes remain included. The prospect marketing test was rejected by Resend because fleminglettings.co.uk is unverified. Stablepoint is reviewing DNS; no prospect campaign was sent. See 2026-09-28-prospect-marketing.md.
