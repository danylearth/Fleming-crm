# Production deployment — 25 September 2026

## Backend: deployed and verified

- Release source: `0f6489b83d740171efffd76cf75e9434b6d36f60` (clean Git archive; local secrets, receipts, uncommitted edits and temporary files excluded).
- Existing Fly application: `fleming-crm-api`, organisation `danyl-goodall`, London region.
- Fly release: **v65**, complete. Image: `registry.fly.io/fleming-crm-api:deployment-01M3CD1XFH435H6TK0HC1BVZH8`.
- Release command `node dist/migrate.js` completed successfully before the application update.
- Existing machine retained: one shared CPU, 1024 MB RAM and its existing upload volume. Rolling deployment, no extra application machine requested.
- Deployment smoke checks and machine health passed. Public `/api/health` returned `status: ok` and the exact source commit at 2026-09-25 13:49 UTC.
- Previous production release was v64, image `registry.fly.io/fleming-crm-api:deployment-01M37YDKGJDT7K9GB25AAAHJXH`, source `09deaa26ada4b28497b6bde44b4d00a3c2394204`. Database migrations remain applied if an application rollback becomes necessary.

## Frontend and signing pages: awaiting Vercel project access

Vercel CLI authentication succeeded as `accounts-2034`. The account can see only the `fleming4` team (Fleming), which has no projects. Inspection of `crm.fleminglettings.co.uk` and `apply.fleminglettings.co.uk` cannot resolve either deployment in that team.

Danyl must grant `accounts@fleminglettings.co.uk` deployment access to the existing Vercel team/projects. Do not create replacement projects or change production DNS. Once access is available, publish the CRM frontend and updated public signing pages from the same release, preserving their project settings and production API endpoint. Then verify the live UI.

## Outstanding feature scope

- MTD remains a fictional interactive prototype, not production record storage or an HMRC filing integration.
- User requested Settings for MTD configuration/credentials and a future resellable CRM where landlords manage both their own portfolios and other owners' rentals. This is not implemented or included in v65. It requires organisation-level isolation, scoped roles, separate taxpayer/provider authorisations and protected server-side credential storage; ordinary property ownership must not imply tax-filing authority.
- The inventory report and supplied future templates are planning/reference deliverables, not a completed new mobile inventory workflow.

## Portable preview correction

`docs/previews/service-agreement-preview.html` is now self-contained with embedded styles/logo and fictional interactive bank/signature fields. The old `tmp/service-signing-header.html` fragment forwards to this preview. It performs no API calls, persists no data and cannot sign or send a contract. JavaScript syntax and asset completeness were checked; browser inspection of the local file was blocked by browser URL policy.
