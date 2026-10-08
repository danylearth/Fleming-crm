# Enquiry Design A and workflow stage labels

Published to https://crm.fleminglettings.co.uk on 7 October 2026.

- Design A: equal 280px desktop cards (292px for touch), aligned Progress actions, Arial, white cards and compact metadata. Existing stats, search, filters, coloured headings and workflow handlers retained.
- New applications from existing tenants read `Existing Tenant - New Onboarding`.
- Onboarding cards retain the Onboarding badge and show the current step beside it, including Application Ready for Review and Tenancy Agreement Signed. Joint applicant submissions and requested corrections are considered before showing ready for review; later payment steps take precedence.
- Dashboard View/Continue actions share 13px Arial, weight 600, 90px × 30px pills.

Release chain:
- Baseline: dpl_H28aPDLEVhMrnD85vtMPZxuTWjU9 (`tmp/release-2026-10-07-dashboard-arial`).
- Design A: dpl_BReuzEfFVX5cdqrYtZCchk6BsS2j (`tmp/release-2026-10-07-enquiry-cards`).
- Current: dpl_DF2UVPtro8ypPgeBcjezuE6YCwa1 (`tmp/release-2026-10-07-enquiry-card-stages`).

Isolated source scope: Enquiries.tsx, ApplicantPipelineCard.tsx/.css, enquiryStage.ts/.test.ts, DashboardWorkPanels.css. No backend, record-tab previews, expanded reminder previews or unrelated working-tree changes published.

Validation: frontend production build; five stage-label tests; Edge browser checks for equal dimensions, long text, aligned buttons, workflow opening, selection and mobile sizing; dashboard computed font/size/weight/line-height/width/height equality, existing filters and controls. Browser checks run locally and against the published frontend with all API requests intercepted using sample records; no production records or messages changed.

Screenshots: `docs/reviews/2026-10-07/enquiry-design-a-approved.png`, `docs/reviews/2026-10-07/dashboard-matching-actions.png`.
