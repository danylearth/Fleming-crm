# 30 September evening release

Production: https://crm.fleminglettings.co.uk

- Backend: crm30-22294e8ef83a; Fly image deployment-01M3T623MH347VZKTAW7C3B5SF. Migration command and machine health checks succeeded.
- CRM frontend: dpl_B498B5bzEGvQaukXnpQntosuvT3Z, aliased to the real CRM.
- Tenant forms: dpl_AEDuXh3jH3QB3QPqasRZdfrVi4Vh, aliased to apply.fleminglettings.co.uk; application/short-link routes verified.
- Immutable source/build snapshot: tmp/release-2026-09-30-evening. Contains today's production source changes, including onboarding/balance/handover, messaging, notifications, APT presentation and shared signing layout. No secrets or uploaded customer files.

Validation: 105 frontend tests passed. Backend suite: 596 passed initially, two PDF tests failed solely because soffice was not on PATH; all four tests in that PDF file passed when the installed converter and Arial fonts were configured. Both production builds passed. Eleven live checks matched deployed HTML/assets/public form/style hashes and confirmed the backend release through the CRM proxy. Evidence: docs/reviews/crm-2026-09-30/live-evening-verification.json.

The unfinished guarantor backend, migration 0063, fictional preview adapter and MTD prototype were excluded. No new live guarantee can be issued through the demonstration workflow. Production integration and final guarantee scope/cap/duration/delivery terms remain outstanding; do not report this preview as a production legal-signing feature.

Guarantor test preview: https://fleming-portal-erv1o2i4d-danyls-projects-1551df91.vercel.app, dpl_BZ8jBVJRDJAqC7rzjM6hiLKUxR81. Hosted full form/upload/sign/witness/office/revision checks, employment branch and calendar checks, invitation progress, and the standard rejection-email correction journey passed. Only fictional data and simulated messages are used.

Legal review: electronic signing can satisfy execution requirements when intention and required formalities are met. Physical witnessing remains required for the deed; a video call does not replace presence. Relevant official guidance: https://lawcom.gov.uk/project/electronic-execution-of-documents/ and https://www.gov.uk/government/publications/execution-of-deeds/practice-guide-8-execution-of-deeds. Final terms, attached tenancy and delivery mechanics require legal approval. A review of guidance is not certification of enforceability.
