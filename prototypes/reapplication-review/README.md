# Existing tenant reapplication design review

## Current version — actual CRM components

Latest correction: the first stage now uses ApplicationReviewPanel itself (compact document rows and existing controls). Bespoke carryover/checklist cards have been removed from the active preview. Application settings are a separate compact dialog. The preview uses the CRM default 90% scale and Lufga font, instead of forcing Arial at 100%. A comparison against the unmodified OnboardingWizard reference verified identical dialog bounds at the same viewport.

Guarantor Required is decided only after the application is approved. Before this decision the sidebar has four stages; Yes adds and opens Guarantor (five total), No omits it and opens Credit Checks. `?review=approved` is a simulated approved state for reviewing this decision, not Zoe’s live progress. The initial setup no longer asks for a guarantor decision. Verified by tmp/capture-reapplication-final.cjs; screenshots 17–22 supersede earlier process images. Property Tenancy Information no longer has a general edit pencil; screenshot 23 shows the dedicated actions.

Latest review: exactly five stages (Issue New Application Form, Guarantor, Credit Checks, APT, Completion), using the actual onboarding status and stage components. Holding deposit stages are omitted. Tenant actions are a two-by-two grid with equal 13px text and 34px heights; new-application buttons are solid purple on tenant and property pages.

Saved personal details are prefilled where held; only already-approved ID/address evidence carries approved status into the new application. Fresh bank statements, employment/income and loans/credit/CCJ answers remain required. Fixtures illustrate approved ID; no live customer approval is changed. `?example=progress` illustrates a fully approved application stage and pending guarantor stage, not Zoe’s real progress.

Run `node tmp/serve-reapplication-form.cjs` for the actual public application form preview on port 8989. Personal details use explicitly labelled example DOB/NI, not Zoe’s actual values. The form is not marked as previously submitted, fresh finance answers are blank, and new financial documents are missing intentionally. Verified by tmp/check-reapplication-five.cjs. Screenshots 12–16 show the latest versions; earlier screenshots are superseded.

The standalone HTML proposal below is superseded following feedback. Run `node tmp/serve-reapplication-current.cjs` and open http://127.0.0.1:8987/tenants/999 or http://127.0.0.1:8987/properties/10. This preview imports the actual TenantDetail, PropertyDetail and OnboardingWizard, with preview-only transforms for the proposed buttons and setup step. It uses the existing CRM styles, fields, calendar, stage navigation, delivery controls and email preview. No production API is contacted; all API responses are local fixtures and mutations are blocked. `Create Draft & Continue` changes only the displayed preview stage.

Corrected screenshots are 06 through 09 in docs/reviews/reapplication-2026-10-02. Both page entry points and draft-to-application navigation verified with tmp/check-reapplication-current.cjs. This is a design prototype, not an implemented or deployed reapplication workflow.

## Superseded standalone proposal

Approval prototype only. Open index.html or run `node tmp/serve-reapplication-review.cjs` from the repository root and visit http://127.0.0.1:8986.

Screens: tenant record action, new application setup, linked sole onboarding, existing bank statement review. `?view=record`, `?view=setup` and `?view=journey` select the initial screen. All actions are local mock interactions: no API requests, submissions, signatures, payments or messages.

Illustrative proposed tenancy date: 6 November 2026. Existing joint tenancy is shown as active, not ended. The existing December 2023 bank statement supports secondary ID and address evidence; review of suitability for the new application remains separate. No credit, guarantor or signing approval is carried over.

Screenshots: docs/reviews/reapplication-2026-10-02. Render/check using tmp/render-reapplication-review.cjs.

## 2 October compact controls follow-up

The shared ApplicationReviewPanel now renders uploaded evidence in native collapsed rows; category and View/Download/review actions appear on expansion. The reapplication preview reuses OnboardingWizard's actual applicationContent (status, issued date, last opened, refresh, copy and resend controls). Preview clipboard links point only to the local example form. Resend remains a local notification, not a live send. Guarantor selection remains conditional after application approval.

TenancyEndModal now uses the onboarding Actions & Previews sidebar and shared DeliveryChoices; the calendar and notes sit alongside it. Production build passed. tmp/check-reapplication-compact.cjs verified document keyboard expand/collapse, refresh, clipboard, resend preview, Yes/No routing and both tenancy-end preview dialogs without runtime errors. Screenshots 24–27 document this iteration.

USER REVIEW STILL OPEN: user says the reapplication size and section names do not match the perfected current onboarding view. Requested a specific reference tenant/enquiry to compare; do not treat screenshots 24–26 as approved or claim design parity. Browser control failed to initialise, so the existing live screen has not yet been compared. No deployment, live tenancy change or message send performed.

## Final screenshot set

The preview now uses standard section names: Application Form, Application Review, conditional Guarantor, Run Credit Check, Tenancy Agreement, Onboarding Completed. Application tracking and review are separate again. No holding-deposit stage. The actual shared StepCard, ApplicationReviewPanel, CreditCheckPanel and agreement section are reused. Reapplication allPreviousComplete skips the exempt holding-deposit stages in the preview only.

At a 1280 × 800 viewport, both original onboarding and the reapplication dialog measured x14.39/y14.41, width1251.22/height771.19; checked by tmp/check-standard-reapplication.cjs. Deployed asset snapshot tmp/chat-team-review-release also uses the same max-width1400px and viewport-based height. Browser access to the authenticated CRM was unavailable; this comparison uses source and the deployed asset snapshot, not a live tenant mutation.

Screenshots 32–42 and whole-process-gallery.html show all 11 screens. The later agreement/finish views use an example completed tenant credit check, keep the guarantor route selected, and do not claim the guarantor or tenancy has completed. Completion remains disabled. Full frontend build passed; browser checks reported no runtime errors. No release, live tenant mutation or message send took place.
