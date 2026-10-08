# Website preview and CRM refinements

- Landlord preview published over FTPS to https://fleminglettings.co.uk/crm-admin/. Only index.html, portal.css and portal.js uploaded and hash verified. Fictional, in-memory demo; no CRM requests, real registration, signature, uploads, chat delivery or bank changes. Pink sampled from user screenshot: #C02C6C. Desktop and ten mobile routes checked live; sample filters, download and task interactions passed. Evidence: landlord-portal-preview-checks.json.
- Header Blog replacement with Sign In / Register prepared in tmp/fleming-portal-navigation.php, targeting existing menu item 30. NOT applied: supplied FTP account is confined to crm-admin. User asked to create an additional account for the parent website directory; credentials/access pending.
- Dropdown width/spacing fix live, limited to dashboard owner menus. CRM deployment dpl_3Vw6V8NkGzFPqQStMsm1BJmY4G9U.
- Service Type label clarified to All except Let Only, keeping actual service choices and default filtering. Deployment dpl_FuEsGBdhMmm1nxaMDNucrzifkvFZ, isolated source tmp/release-2026-10-06-service-label/frontend-source. Browser verified locally and live with intercepted fictional data.
- User-authorized test cleanup removed Alex test landlord enquiry 80, Sam tenant 37/enquiry 91, 16 directly related documents, 11 email history entries, 3 tasks, agreement 14 and draft guarantor verification 1; two test payment notes removed from property 32. No real emails sent or bank transactions changed. Recovery backup recorded in tmp/test-cleanup-oct6-result.json; independent verification in tmp/test-cleanup-oct6-verified.json.
- Automatic approval rejected deleting shared document entries 937/938 attached to genuine property 32 and landlord 15. Narrowed cleanup preserved those links, physical files, audit history, Marie and the property. These two shared agreement entries remain pending clarification/approval.
- Backend portal sketches moved outside active backend source/migrations to landlord-portal-preview/integration-draft after user explicitly deferred CRM connection. They are incomplete, untested and were NOT deployed or migrated. Do not upload this directory with the static preview.

## Website design alignment — 6 October 2026
- Published updated login and registration at https://fleminglettings.co.uk/crm-admin/ (asset version 20261006-3).
- Reused website Switzer font files (400/500/600/700), purple #27083D and user-selected pink #C02C6C.
- Replaced plain purple left panel with the website's trust-img.jpg property photograph and translucent white copy panel. Square controls and responsive typography follow the supplied website reference.
- Verified all four font weights and photograph load on the live website. Reviewed desktop login, registration and mobile login screenshots. Existing preview interaction checks and ten mobile route overflow checks passed; zero CRM/submission requests.
- Only index.html, portal.css and portal.js published, previous versions backed up. Main WordPress navigation change still awaits website-root FTP access; no backend connection activated.

## Shared login, property records and support preview — version 20261006-5
- Shared tenant/landlord login and registration wording, consistent panel dimensions across both tabs. Removed duplicate Sign In/Register header button. Portal header now has sample account and Log Out; logout clears in-memory preview requests/chat and returns to shared login.
- User-selected signed-document-band.png reused as lettings-board.png; separate solid white text section beneath. Added local Fleming icon. Website Switzer typography, purple/pink and rectangular controls applied through portal pages.
- Property pages: tenant/contact information, payments and dates received, monthly fees, recorded rent to date, agreements/service contracts with sample view/download, onboarding and property requests. Let Only receipts explicitly not recorded; no tenant shown for unlet property.
- Onboarding moved under property; includes signed service contract, readiness to let, marketing, tenant onboarding and start stages. Rent increase creates only an in-memory support request and does not alter rent or notify a tenant.
- Support tickets replaces sidebar Chat with the office. Preview ticket creation, reference, replies, Open/Closed filtering and closure. Floating Fleming icon opens demo chat and leave-message/ticket option; online prompt explicitly marked Preview. No staff presence is asserted as real.
- Published five allowlisted files (HTML/CSS/JS plus two image assets), with FTPS byte verification and recovery copies. No backend or WordPress navigation files changed.
- Local and live browser checks passed: equal login/register height at widths 1440/900/700/390; property data and sample download; rent request into support history; ticket create/reply/close; chat; property onboarding; logout; 12 mobile routes without overflow; zero API/submission requests and zero JS errors. Evidence: docs/reviews/2026-10-06/portal-v5-checks.json and matching v5 screenshots.

## Redesigned preview — version 20261006-6
- Published and verified the five static preview files only; the portal remains disconnected from CRM, authentication, messaging and payments. FTPS upload verified byte-for-byte and previous files backed up.
- Login fills the desktop viewport directly below the header, with stable Sign In/Register dimensions, exact website Switzer fonts, lettings-board photograph and white copy area. Contact footer reduced to requested phone link.
- Removed sidebar heading and breadcrumbs; separated title-case navigation rows; renamed Maintenance and Financials. Compact dismissible chat prompt retains Fleming launcher.
- Property overview now has icon-led tenant details left, service/rate/tenancy facts and coloured statuses right, followed by full-width Financials Snapshot with next invoice and up to four recorded invoices (only available records are shown).
- Request a Change dropdown: Request a Rent Review, Request Inspection, End Tenancy, Cancel Services. Requests create only in-memory preview tickets; no real tenancy or service changes.
- Office tasks separated into Action Required and Waiting on Others, including landlord signing, tenant signature, office review, ID and EPC examples.
- Account Contact Details across top; Primary/Secondary ID&V left, Bank Details right. Ownership proof per property with pending office review after sample upload; no automatic verification.
- Portfolio green/amber/red progress, including new property example. Completed onboarding hidden; pending Tenant Journey identifies who is being waited on.
- Agency Service Contracts, Tenancy Contracts and Property Documents grouped with category filters. Compliance issue/expiry dates, replacement review and preserved sample history.
- Both local and published browser suites passed: desktop viewport fit, stable tabs, loaded Switzer fonts, responsive routes, document validation/replacement/cancellation/reset, conditional journeys, account layout, ownership states, request tickets, document categories and prompt dismissal. No browser errors, API requests or non-GET submissions. Reports: portal-v6-checks.json and portal-v6-journey-checks.json in docs/reviews/2026-10-06.
- Main WordPress header replacement remains separate and pending website-root access; this release only updates /crm-admin/.

## Clean design wording and compact navigation — version 20261006-7
- Removed visible development/test/preview labels, banner, footer disclaimers and explanatory copy at the user's request. Neutral display names and reserved example.com email addresses remain entirely fabricated. No backend/auth/CRM connection enabled.
- Login actions now read Sign In/Register. Disabled account fields continue to prevent credential collection. Removed dummy document download button action; no fabricated agreement file is offered as a real download.
- Sidebar reduced to 205px with 43px rows, 14px labels and 18px icons; compact support section fits typical desktop view. Request a Change uses smaller 14px text, reduced padding and an SVG chevron.
- Local browser checks passed for visible wording on 16 routes/dialogs, viewport fit, request creation, identity/ownership workflow, grouped documents and mobile overflow. Screenshots reviewed for compact property page.
