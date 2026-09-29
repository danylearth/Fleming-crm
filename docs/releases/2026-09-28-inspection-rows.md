# Inspection row redesign — 28 September 2026

Release: `crm28-inspections-7166f04181`.

- Compact completed-inspection rows retain the date, overall condition, inspector and confirmation date.
- Right-aligned actions appear in order: View Report, Delete Inspection, Edit Inspection. Editing/deletion retain existing admin permissions and deletion confirmation.
- Good, Very Good and Excellent use green rows; Average uses yellow; Bad and Needs Repair use red. Historical Good summaries also use green.
- View Report opens the recorded inspection answers, notes and optional attachment download. Details absent from historical forms remain explicitly unrecorded.
- Added Average and Very Good to all three form condition fields, backend validation and PostgreSQL checks via additive migration 0053. No existing ratings or inspection records are rewritten.

Validation: frontend/backend builds passed; all 9 inspection tests passed, including new-rating validation. Browser checks covered all six row colours, aligned desktop actions, compact ~62px desktop rows, no narrow-screen overflow, report details/attachment access and editing Average answers. Production constraint names and previous API release were read before deployment.

Snapshot: `tmp/release-2026-09-28-inspection-rows`. Deployment and final live verification are recorded in the associated files under `tmp`.

Live verification completed at 20:21 UTC. CRM index/CSS/Layout/PropertyDetail/Settings/Users/Dashboard matched the snapshot; the API reported healthy release `crm28-inspections-7166f04181`. Read-only inspection confirmed all three live condition constraints now include Average and Very Good. Evidence: `tmp/inspection-rows-live-verification.json` and `tmp/inspection-constraints-after.json`.
