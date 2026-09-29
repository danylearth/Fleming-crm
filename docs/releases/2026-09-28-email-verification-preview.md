# Email and phone verification preview — awaiting design review

These changes are implemented locally, not deployed. Current live backend remains `crm28-login-delivery-6aa382f3e1`; current live frontend remains `dpl_EwHak87VSkG55JvaHCYyvHAuzafm`.

## Implemented

- Password is verified before returning an email/phone chooser. Selection posts credentials again to the existing login route, which rechecks the password. No login token is returned before a correct verification code.
- Email is the account's database email; phone is its existing trusted number. Client-supplied destination fields are ignored. Landlines use voice and mobiles use SMS.
- All new verification codes expire after 1,200 seconds. Six-digit CSPRNG codes are HMAC-hashed, single-use, limited to five attempts and bound to session/purpose/payload/current contacts. Email login payload also binds to the saved email and password-change timestamp.
- Resend uses the existing unconsumed, unexpired challenge and same browser agent, then revalidates the account/contact/password context. Shared three-per-15-minute and 60-second delivery limits remain. A successful replacement invalidates the previous challenge. Expired/locked requests require password sign-in again.
- Email verification does not mark the trusted phone verified or replace phone verification for company settings changes.
- User-provided `fleming-two-factor-code-email.html` is integrated with first name, six digits, 20-minute expiry and CID embedded images. Marketing unsubscribe row is excluded from this security email. Original assets are copied under `two-factor-*` names; existing branding assets are not overwritten.
- SMS wording exactly follows the user's requested text, substituting the first name and code.
- UI: capitalised Verification Code, full-width bottom back button with 👈, yellow Request a New Code, centred single-line remember-device text on desktop, bold Spam Detector 🔎, Back to Sign In capitalisation, and removed ❗ from forgot-password button.

## Preview

Loopback-only server `tmp/login-choice-preview.cjs` on port 5194. Static built app in `tmp/login-choice-preview-site`. Sample credentials `sam@example.test` / `PreviewOnly!123`. Both choices and resend are simulated; final login is intentionally not performed. No provider/database calls.

- http://127.0.0.1:5194/login?test=updated
- http://127.0.0.1:5194/two-factor-email.html (sample code 482731)

## Validation and deployment scope

67 targeted backend tests passed; frontend and backend builds passed. Browser verified chooser, email code-entry, resend notice, lower back buttons and single-line remember wording. Supplied email images all load in browser. No real email/SMS delivery or end-to-end production login is claimed.

For scoped deployment copy latest deployed backend snapshot, then overlay `src/sms.ts`, `src/settings-phone-verification.ts`, `src/login-phone-verification.ts`, `src/email.ts`, new `src/verification-code-policy.ts`, `src/login-code-email.ts`, `migrations/0051_login_email_verification.sql`, `src/email-templates/40-two-factor-sign-in.html`, and `src/email-assets/two-factor-*.png`. Frontend latest `dist` includes Login, AuthContext, PhoneVerification, ForgotPassword/CSS and seven matching public email assets. Do not deploy unrelated working-tree changes.

Twilio error 10005 still blocks voice calls; user submitted a support ticket and explicitly retained office landline. No new account phone changes were made.

## Deployed — 28 September 2026

The preview status above is superseded. User explicitly requested live publication and changed the Administrator trusted number to +447480859912, retaining accounts@fleminglettings.co.uk for email verification.

- Backend: crm28-email-auth-dd2b5df817, image deployment-01M3MFESA0RHAXES91NV8FPQHT. Migration 0051 applied and machine health checks passed.
- Frontend: dpl_9Do8vY6SPypQEuB3As8Ak65VtGNo, aliased to https://crm.fleminglettings.co.uk. Live index confirmed index-BLPiNK85.js.
- Administrator contact update audited; prior sessions, remembered devices and outstanding challenges revoked. New number remains unverified until a successful phone challenge. No password or role changed.
- Login resend now has a server-enforced 300-second cooldown, including repeat initial requests. UI displays an hourglass and Request Another in M:SS while disabled, restarting after successful resend. Three-per-15-minute limit remains. Other protected settings retain their existing 60-second request limit.
- Card widths match at 448px desktop. Verification, resend and back buttons match: 14px/600 text, 44px height. Green tick added to Verify & Sign In. Latest countdown wording verified in browser.
- 71 targeted tests passed across 8 files, including 299999ms rejection and 300000ms acceptance for email and SMS. Frontend/backend builds passed. Production runtime readback confirmed 1200-second expiry, 300-second cooldown, saved Administrator destinations, configured delivery providers, and no simulation. API health and frontend bundle checked through live CRM domain.
- Actual email/SMS receipt and completed production login require the user's real sign-in; no live codes were sent during these checks. Twilio voice restriction remains pending provider support.
- Screenshot: tmp/verification-countdown-final.png. Scoped snapshot: tmp/release-2026-09-28-email-auth.
