# 2 October approved CRM UI fixes

Production: https://crm.fleminglettings.co.uk
Deployment: dpl_FUrJcCvP4DnqcrFfjKVp5bqABfk7
Immutable build: tmp/release-2026-10-02-approved-ui
Previous deployment: dpl_8FmBqNon4RGC57aN7F5BcxLC2hsu

Published the production source changes for collapsed application evidence rows, onboarding-style tenancy-end Actions & Previews with shared email/SMS choices and calendar, Delete/Archive wording, bank-statement evidence recognition for secondary ID/address checks, and removal of the property tenancy-section edit icon. Existing chat/team and other released frontend fixes are retained.

Validation: frontend build passed; all 110 frontend tests passed. Browser checks verified document keyboard collapse/expand and tenancy-end email/SMS previews using isolated local fixtures. Production entry HTML and nine relevant JS/CSS assets matched the tested snapshot byte-for-byte; evidence tmp/approved-ui-live-verification.json.

Not released: Start New Application buttons and linked reapplication journey, guarantor integration, prefilling/carry-forward into new applications, deposit-plan/completion workflow. These remain an isolated approved design preview, not production implementation. No preview adapter, fixture data or fictional link was included in the production bundle. Unfinished backend guarantor files/migration 0063 were not deployed. No tenant records, tenancy end dates, messages or deposits were changed.
