# Login alignment and Tenants refresh loop — 11 October 2026

Frontend deployment: `dpl_EcDHMrWuax5YaaBDRoKSEtf9WaDp` at https://crm.fleminglettings.co.uk.

- Remember-device copy now uses left alignment, 13px text and an 8px gap, with the checkbox aligned to its first line. Wrapped lines align under the text. Authentication and device-trust behaviour are unchanged.
- The Tenants page's postcode geocoding POST is a read-only lookup. It no longer invalidates CRM records. Previously each lookup triggered portfolio loading and another lookup, causing an endless loading cycle.

Built from the last verified live snapshot with only `src/pages/Login.tsx` and `src/hooks/useApi.ts` changed. Backend and live records unchanged.

Verification: TypeScript/Vite build passed. Browser reproduction with fictional data observed geocode requests increasing from 10 to 16 and property loads from 19 to 31 while idle. Fixed version stayed at two of each. My Clients and My Portfolio showed only their respective tenants; All showed both. Login layout and clickable checkbox passed at 360, 390 and 1440px without horizontal overflow. All API responses in these browser checks were mocked; no login codes or customer messages were sent.
