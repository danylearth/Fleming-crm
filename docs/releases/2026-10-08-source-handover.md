# Source handover — 8 October 2026

Repository: https://github.com/danylearth/Fleming-crm

Branch: `codex/sept25-crm-feedback`. This branch contains the consolidated working source. `main` is older; use the branch link in the root README when sharing the project.

## Included work

The handover includes the staff CRM, API, public application/signing sites, mobile client, migrations, tests, source assets and design prototype source. Recent changes cover dashboard/task panels, enquiry cards and stages, portfolio boundaries, record tabs, tenancy changeovers, finance and bank matching, document presentation, communications, and the guarantor application/deed/witness workflow. The latest office review fixes are described in [the guarantor release note](2026-10-08-guarantor-review.md).

The root README contains the architecture, installation, local database, startup and testing instructions. Local configuration examples and setup scripts are included. Production credentials and OAuth connections are supplied separately; they are not part of this handover.

## Verification on this source

- Backend TypeScript build and asset copy: passed.
- Frontend TypeScript/Vite build: passed.
- Frontend unit tests: 32 files / 126 tests passed.
- Full backend run: 117 test files passed, six failed; 681 tests passed and eight failed initially.
- Signing PDF and workflow tests: all 18 passed when re-run with one worker and a 20-second timeout. The initial parallel run had two rendering timeouts and a related workflow assertion failure.
- Remaining backend issues: two tenancy PDF cases require LibreOffice (`soffice`, unavailable on this workstation); three older source-text assertions expect dashboard/tenancy markup that has changed. Affected files: `tenancy-agreement-pdf.test.ts`, `september-four-feedback.test.ts`, `september-five-feedback.test.ts`, `whatsapp-feedback.test.ts`. These failures are recorded rather than silently skipped or represented as a clean suite.
- Latest guarantor/browser checks passed separately, as recorded in the guarantor release note.
- Credential-pattern scan of the included files found no provider tokens, private keys, JWTs or live signing URLs. The matched database URL is the documented local-only example. This check is not a full security audit.

A fresh Docker installation, mobile build, full database integration suite and full browser regression have not been run for this combined handover. Existing source-text tests need updating to the current components, and PDF tests need the document tooling listed in the README.

## Source and live deployment

This commit consolidates work from the local project; it is not a claim that every combined file is deployed. Live changes were published from isolated release snapshots, described in the dated release notes. The source push does not promote this whole branch to production or merge it into `main`.

Excluded local material: environment secrets, dependencies, built output, temporary release snapshots, uploaded customer files, generated PDF/screenshot review evidence, cached browser data and the separate `crm-record-design-test` preview checkout. These remain on the local machine. Source assets and document templates needed by the application are included.
