# 10 September 2026 — production login recovery

The live CRM displayed `Failed to fetch` because Fly reported the API machine and its volume's physical host as unreachable. The public API health request timed out. The accounts user remained active; its password was a separate issue and the supplied screenshot password was rejected after connectivity was restored.

## Recovery

- Restored snapshot `vs_mvB45w3gBkLtLmDPMyP`, taken after the September 9 document import, to volume `vol_r1j29166qledpzpr` on another London host. Snapshot retention is now 14 days on this volume.
- Started replacement machine `2860671cd20d78` with the existing production image `deployment-01M23QZJHE5PYZFBXDG46321H4`, then applied `backend/fly.toml` using `fly deploy --only-machines`. API source remains `670d7f9`; no schema or application changes were required.
- Removed the failed machine `d891e57df37178` so it cannot return to routing against a divergent file volume. Its original volume `vol_4y8qjm8gke63671r` was retained, as was the older unattached volume.
- Reset accounts@ through the existing audited administrator password-reset endpoint. No role or account activation changed. Credentials are excluded from this report and version control.

## Verification

- Public API health: HTTP 200, release `670d7f9`; Fly health check passes.
- Fresh password login, authenticated `/api/auth/me`, and `/api/dashboard`: HTTP 200. The CRM origin is returned in the CORS response.
- Browser login at `https://crm.fleminglettings.co.uk` opened the Administrator dashboard successfully at approximately 09:15 BST.
- Database-backed users, permission requests, inventories, financial summary, properties, tenant details and rent-review endpoints returned HTTP 200. Migration 0013 remains applied.
- All 225 document rows, five original agreement files and two signed agreement files resolve to existing files. There are no inventory photo rows. All 42 imported document links match the original SHA-256 checksums across 34 distinct files.
- The Supabase database was retained in place, not restored to an earlier snapshot.

## Remaining resilience work

The API still has one active machine with local volume storage. This recovery restores service but does not provide automatic failover. Shared durable file storage (or verified replication) is needed before running multiple interchangeable API machines. Fly's guidance: https://fly.io/docs/apps/trouble-host-unavailable/.

An immediate login in the same second as a password reset can receive a token rejected by the existing millisecond-versus-JWT-second revocation comparison. A later login succeeded; this edge case was not the cause of the reported outage and was not changed during infrastructure recovery.
