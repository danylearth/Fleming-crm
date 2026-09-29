# Login delivery diagnosis and authentication page design

Backend live release: `crm28-login-delivery-6aa382f3e1`.
Image: `registry.fly.io/fleming-crm-api:deployment-01M3MD3ZCEX3F26B4R5WN85CD4`.
Frontend final deployment: `dpl_EwHak87VSkG55JvaHCYyvHAuzafm`.
Frontend snapshot: `tmp/release-2026-09-28-auth-final/crm`.
Backend snapshot: `tmp/release-2026-09-28-login-delivery/backend`.

## Delivered

- Larger centred waving hand and “Hey there team!” login greeting.
- Red rounded “Psst.. Forgot Password?❗” link.
- Compact rectangular ALTCHA widget with larger checkbox and original provider attribution/logo.
- “Email Address” capitalisation and full-width rounded “👈 Back to sign in” link matching request button dimensions.
- Provider-specific explanation when Twilio rejects voice delivery with error 10005, safe numeric diagnostic logging, and sign-in-specific wording for other delivery failures. No authentication bypass or alternate recipient fallback.

## Unresolved external blocker

The live Twilio call API returned HTTP 403 / error 10005: “Voice calling has been disabled for this account.” The diagnostic call was rejected before being placed. UK low-risk calling is enabled and the customer profile is twilio-approved. Voice calling must be restored by Twilio. The user explicitly declined switching the Administrator account to Sam's mobile; the office landline remains configured unchanged. No successful office call or end-to-end office login is claimed.

## Validation

33 targeted delivery/login/challenge/SMS tests passed. Frontend and backend builds passed. Linux release smoke tests for APT, service agreements and Arial certificates passed. Live health reports the expected backend release. Live frontend entry JS/CSS match the final snapshot byte-for-byte. Browser checks confirm final text, provider widget, visible emoji, equal button dimensions and back navigation to /login. CAPTCHA was not solved and no password reset was submitted.

Screenshots: `tmp/password-reset-final-live.png`, `tmp/login-final-live.png`.
