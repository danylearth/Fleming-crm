# Portfolio selection correction

Production: https://crm.fleminglettings.co.uk

Current deployment: `dpl_4C1SCywZWGhhSoKFGn8xkHBb6tMz`.
Source snapshot: `tmp/release-2026-10-07-portfolio-addresses/frontend-source`.
Initial filtering deployment: `dpl_DdeEfWNqdeLUhGV5m5R4eeeeYm3L` (`tmp/release-2026-10-07-portfolio-scope`). The final one-file correction ensures the detail boundary also matches canonical URLs such as `/tenants/1-name`, after the record loads and adds its readable name.
Baseline: `dpl_DF2UVPtro8ypPgeBcjezuE6YCwa1`.

My Portfolio hides Landlords and Landlord Enquiries navigation and redirects those sections to Properties. Lists, counts, linked filter options, enquiry boards, maintenance, calendar tasks and financial records follow property ownership. My Clients excludes internal ownership. All includes both, including internal landlord records previously omitted from the landlord list. Unlinked records remain under All; unmatched or mixed-portfolio bank transactions remain under All. Portfolio deposit totals count only matching allocations, including the matching portion of mixed receipts. Existing role permissions remain unchanged; portfolio selection is a viewing filter.

A shared, paginated ownership lookup resolves tenants and enquiries through saved property IDs. Open detail pages outside the selection show a message with Show in All. Switching portfolios clears stale selections and relevant dialogs. The dashboard ownership helper now recognises linked_property_id.

Validation: production frontend build passed; eight ownership and financial scope tests passed. Edge browser checks passed locally and against the deployed frontend for all three portfolio choices, navigation, landlords/properties/tenants/enquiries, maintenance, Team Calendar, financial rows and out-of-scope direct records. Every API request in browser verification was intercepted with fictional records; no live data mutated. Sixteen changed files are listed in the isolated release scope.json. No backend or unrelated working-tree changes deployed.
