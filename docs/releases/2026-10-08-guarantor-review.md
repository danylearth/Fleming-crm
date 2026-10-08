# Guarantor office review fixes — 8 October 2026

Published frontend: `dpl_7mcep9YRJ92xaDvG8mkVCwFcGSeP`, https://crm.fleminglettings.co.uk. This supersedes `dpl_G7BbJ2FFzcNvwzp5kHofqMgFwQxH` with automatic signing activity refresh.

Published API: release `crm08-guarantor-choice-1`, image `deployment-01M4DSYDP6ZY5SEP4P933F7GD1` on Fly.io.

- Application review uses a consistent notes field and compact, rounded approval buttons.
- Guarantor Yes/No can be selected once an active application is submitted. Final application approval remains required before issuing the guarantor invitation or advancing to credit checks.
- Unsaved guarantor contact/date edits survive screen changes and refreshes in the same browser tab. Save Details persists contact details to the API. Saving the date no longer clears other edits; failed saves preserve the draft.
- Active signing activity refreshes every ten seconds while the screen is visible. The witness link and copy action appear after the guarantor signs, without requiring a manual refresh. Polling stops when the component unmounts, during actions, and for draft/verified records.

Investigation confirmed the reported signature and witness token already existed on the server. The office screen was stale; no replacement signature, witness invitation or historical evidence was generated.

Verification: isolated frontend/backend builds and five requirement/validation tests passed. Browser checks at 390px and 1440px covered Yes/No before approval, progression gates, form layout, Save Date, focus/reopening, successful and failed Save Details, and automatic witness-link appearance using mocked data. No customer messages or live record changes were made by these checks. Live HTML, onboarding bundle and stylesheet matched the tested deployment after publication.

Local release snapshots: `tmp/release-2026-10-08-review-polish` and `tmp/release-2026-10-08-witness-refresh`. These contain deployment/runtime material and are deliberately excluded from Git. Application source is in `frontend/` and `backend/`.
