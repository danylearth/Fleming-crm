# Live release — 28 September 2026: settings, verification and signing

- Backend: `crm28-settings-security-12e5f53bbe`
- Fly image: `registry.fly.io/fleming-crm-api:deployment-01M3KZF14FBKY7703973KXDQM6`
- Frontend: `dpl_2YzjUyKAikmDoWt4tTUGqPujhWFa`
- Live site: https://crm.fleminglettings.co.uk
- Snapshot/manifest: `tmp/release-2026-09-28-settings-security/manifest.json`

Company & Agreement Settings is now inside Settings and restricted to administrators. Every save requires a five-minute, single-use phone code bound to the exact submitted settings, version, user and session. Incorrect attempts are capped. Trust-number changes are separately protected; administrator resets revoke that staff member's existing sessions and remembered devices. Unrecognised sign-in devices require phone verification before receiving a session. Remembering a device is optional for 30 days. Mobiles receive SMS; landlines receive voice calls. Supplied account numbers are stored by the migration using exact name/email matches; no calls or texts were sent during deployment testing. Frank Smith has no supplied number and must have one assigned in Team before new-device sign-in.

Also deployed: corrected signature field placement, Arial branded signing certificate with recorded declarations and signature, automatic signed-copy record storage, standard dashboard top-right controls, stable signature-request buttons and sizing, Request a Review HTML template and supplied review assets, and the centred marketing preference page with compact checkboxes, no help/header contact text or footer. Preference forms load existing record/canonical channel choices and update both stored permissions and CRM flags. A clicked unsubscribe link opts out immediately and suppresses queued marketing.

Newly generated APT/service documents use the current company settings; issued/signed documents retain their saved snapshot. No historic signed document was rewritten.

Validation: 403 backend tests passed. Two Windows PDF tests needed unavailable LibreOffice; the release image passed equivalent owned/client APT generation plus company-detail service-contract and Arial certificate checks before deployment. Five targeted frontend tests passed and the frontend build succeeded. Exact live asset comparison passed. Live backend migrations 0047–0050 and health passed. A synthetic example.test preference was used to verify immediate opt-out, explicit preference saving, repeat-click opt-out, and CSP, then removed. Unauthenticated company writes and invalid sign-in verification returned 401/403. Twilio's configured outgoing number has both voice and SMS capability; real code receipt remains a user-initiated check.
