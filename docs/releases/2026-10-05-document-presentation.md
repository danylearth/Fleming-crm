# 5 October document presentation release

Published and verified on the existing production CRM and tenant signing site.

- Backend release: `crm05-docs-e08bd15f125e`.
- Fly image: `deployment-01M45FH8ZHH1D1JR117PKQMR2G`; release command and machine health checks passed.
- Tenant forms: `dpl_7MxLYRsWj1zfy7P32UUh2JAWn2gd`, aliased to https://apply.fleminglettings.co.uk.
- Immutable scoped source: `tmp/release-2026-10-05-documents`; manifest records the six changed files, previous live source and hashes.

This release fixes generated APT narrative/addendum spacing, acknowledgement heading weight, receipt signature alignment and date sizing, tenant signature-name typography/removal of numbered tenant prefixes, and tenancy invitation company-address wrapping. The public signing viewer now displays separated PDF sheets. Existing signed PDFs and issued agreement records are not regenerated or altered.

Verification: scoped backend compilation; nine focused presentation/email tests; eight generated agreement variants covering internal, full management, rent collection and let only with short and long content; visual addendum/receipt inspection; isolated browser checks at 390, 768 and 1440 pixels with no horizontal overflow. Live agreement HTML/CSS match the snapshot byte-for-byte. Live CRM `/api/health` confirms the expected backend release. Existing public application and short-link routes remain correct. No test email, SMS or signature was sent to a real person.

This is the first, independent release only. New guarantor workflow, existing-tenant changeover/billing activation, new onboarding controls, remaining CRM layout changes and mobile app work are not part of this deployment. Existing-tenant email handling is not yet connected to the new workflow. Do not describe the full requested batch as live.
