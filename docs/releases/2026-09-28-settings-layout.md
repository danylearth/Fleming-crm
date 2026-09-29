# Live Settings layout — 28 September 2026

Published to https://crm.fleminglettings.co.uk/settings as deployment dpl_44HGM182xLYPFuBVjjSF96ttjNVL.

- Sidebar labels bold.
- Full-width Profile card includes editable contact details.
- Trusted Number & Two-Factor Authentication and Change Password sit side by side with equal dimensions.
- Company & Agreement Settings spans the next row, directly below security.
- Administrator permissions and Appearance share the next row; AI and Accountancy share the following row.
- All section headings use text-lg/font-semibold. Administrator-only Company, Permissions and Accountancy sections share a larger bold Administrator Access Only badge.
- Mobile layouts stack cards; existing profile/security/settings request handlers retained.
- Deleted the exact user-confirmed Frank Smith test staff account, ID 7, sam@flemingcg.co.uk. Removed one account token and two activity-minute records. Preserved five audit records, recorded deletion, verified the user absent. No linked business records were present.

Validation: production build passed. Local browser verified the section order, contact editing, 18px/600 headings, and identical width/height of each paired card. Production index/CSS/entry/Settings assets matched snapshot hashes; API healthy. Existing Leaflet image-path warnings remain.

Evidence: tmp/frank-user-deletion.json; tmp/settings-layout-live-verification.json; tmp/release-2026-09-28-settings-layout/manifest.json.

## Team action column follow-up

Deployment dpl_62G6hvyt5cqAiTty49q574VQS7pE adds the Action heading and a vertical divider before the staff account buttons. Deactivate/Reactivate is hidden for the signed-in user; other staff actions retain existing behaviour. Production build passed. Browser inspection confirmed the divider on heading and rows, two actions on the current user's row, and retained deactivation for other users. Live index, entry, CSS and Users bundle matched the release snapshot; API health passed. Evidence: tmp/team-actions-live-verification.json.

The preceding dpl_3MY1wBjJkTb58LT41iUvhat2jKyE update standardised Request Verification Code, Update Password and Save Appearance to matching 256 x 48 sizes at 100% text scale and changed sidebar weight to semibold (600). Browser dimensions and live assets verified.

## Company settings and appearance follow-up

Release snapshot: `tmp/release-2026-09-28-company-settings-final` (backend release `crm28-company-d2ba280ca0`).

- Sidebar labels now 16px/500, with links distributed through available vertical space and compact spacing on short screens.
- Appearance has 23 named colours including Fleming pink and deep purple. The API accepts the new options.
- Equal-size security buttons align at the bottom of their paired cards.
- Company settings open read-only. Edit Settings unlocks the fields; Cancel restores saved values. Phone verification remains required for every save.
- Company section navigation is a left-hand list, with a fixed 544px scrolling content panel across tabs.
- Removed the old agreement-only explanatory strip. Added eight previews: owned, managed-client and let-only APTs; all three service contract types; operating/client-account final balance emails. Previews use the real generators with sample client data and send nothing.
- Signing Authority reuses the APT Type/Draw signature popup, while retaining PNG upload. Signature changes are saved only through the existing verified settings save.
- Removed West Midlands from the default registered address; both default account names are Fleming Lettings & Developments UK Limited. Production company settings had no saved override when inspected, so these defaults apply without a database write.
- Verified CMP012565 (Client Money Protect) and PRS042592 (Property Redress Scheme) against the company website. CMP expiry is 7 December 2026, confirmed visually from the published certificate. PRS expiry remains blank because no date was published.
- Labels use Provider/Scheme and Position/Job Title.

Validation: frontend and backend builds passed; six generated PDF variants and two rendered email variants passed. Browser checks verified read-only controls, edit/cancel restoration, typed signature application, drawing mode, 544px panel height, 23 colours, aligned action buttons and 16px/500 sidebar labels distributed over a tall desktop. Remote Docker release checks cover company settings in APT/service PDFs, client-owned APT generation and Arial signing certificates.

Sources: https://fleminglettings.co.uk/client-money-protection/ and https://fleminglettings.co.uk/redress-scheme/ .

Live verification completed at 19:21 UTC: production index, CSS, Layout, Settings and Users assets matched release snapshot hashes; API reported healthy release `crm28-company-d2ba280ca0`. Read-only inspection confirmed the corrected live company address, both full account names, scheme details and all eight preview variants. Frontend deployment: https://fleming-portal-rl9l3w0v6-danyls-projects-1551df91.vercel.app, aliased to https://crm.fleminglettings.co.uk . Evidence: `tmp/company-final-live-verification.json`, `tmp/company-final-live-settings.json`, and deployment logs.

## Sidebar and dashboard readability refinement

Published a follow-up with regular-weight (400), 17px sidebar labels and equal grid rows filling all available navigation height. Rows retain a 44px minimum and scroll on short screens. Enquiry Pipeline names now use regular weight instead of bold strong elements. Compliance property addresses use semibold (600); certificate labels use medium weight and stronger secondary text contrast, and urgency colours use darker theme-aware amber/green.

Browser validation: tall desktop showed all 12 rows at approximately 64px, filling the navigation to its bottom padding; short viewport kept all 12 rows at 44px with scrolling. Enquiry names computed at 400; compliance addresses 600; certificate/deadline labels 500. Earlier settings checks confirmed all eight section headings at 18px, three admin badges, read-only company fields, identical 256x48 action buttons and equal bottom positions for the two security buttons. Source audit confirmed the Team Action heading/divider and hidden self-deactivation.

Production asset verification passed for index/CSS/Layout/Dashboard/Settings/Users against `tmp/release-2026-09-28-sidebar-readability/manifest.json`; API remained healthy on `crm28-company-d2ba280ca0`. Evidence: `tmp/sidebar-readability-live-verification.json`.

## Logo spacing and consistent dashboard row type

Added 8px below the sidebar logo (header 72px with 8px bottom padding at 100% scale), preserving the logo position. Reduced compliance addresses from 600 to 500. Standardised compliance address/type/deadline/date and all Enquiry Pipeline headings/cells/action buttons to text-sm (14px at 100% scale). Browser computed-style checks confirmed every affected text element at 14px, compliance address weight 500, and approximately 12.4px logo-to-divider gap. Build and live asset verification passed. Evidence: `tmp/dashboard-consistent-type-final-live-verification.json`; snapshot: `tmp/release-2026-09-28-dashboard-consistent-type-final`.

## Header divider and appearance palette

Removed the final Charcoal swatch, leaving 22 colours. Raised desktop top-bar minimum height to 4.5rem to match the logo header; browser verified both dividers at 72px at 100% scale. Build passed and production Layout/Settings and supporting assets matched `tmp/release-2026-09-28-appearance-header/manifest.json`. Live evidence: `tmp/appearance-header-live-verification.json`.

## Compact property comparison panels

Recent Sales rows now use 10px vertical padding, 32px icons, 14px address/price text and wrapping 12px metadata grouped below the address. Price weight reduced to medium. Average Rents and expanded Land Registry Price Data have matching 16px headers, matching header grids and identical outline X/Close buttons. Browser verified headings at the same top position, both close buttons 80.3x36px with X icons, compact sales rows and successful closing back to View Price Data. Build and production asset verification passed, including the PropertyDetail bundle. Snapshot: `tmp/release-2026-09-28-property-panels`; evidence: `tmp/property-panels-live-verification.json`.
