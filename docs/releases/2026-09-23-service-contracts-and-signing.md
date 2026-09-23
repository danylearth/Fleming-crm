# 23 September: service contracts and signing feedback

Scope: the Marie review in WhatsApp Chat - CRM (1).zip and the subsequent 3pm document, service contracts, HTML emails, invoices and messages through 17:13 in WhatsApp Chat - CRM (2).zip.

## Implemented

- Landlord service contracts use the three supplied Let Only, Rent Collection and Full Management Word templates and branded emails. Property and company details, signatories, agreed fees and bank details populate the documents. The issued source is retained with the record.
- Staff can create, preview, send, resend/chase and void contracts. Landlords review a responsive PDF, confirm or change their bank details, preview their signature and accept the terms. Signed PDFs are linked to both the property and landlord using one stored file, with signer/time evidence and delivery tracking.
- Client properties require a signed matching service agreement before public marketing and tenant onboarding. Existing completed tenancies remain intact. Signed fees and approved property bank details feed into client tenancy agreements.
- Tenant portfolio filters now receive the landlord classification. Dashboard actions, stage labels, due follow-ups and calendar user columns were corrected.
- Property pages show monthly cached ONS local-authority rents, bedroom/type breakdowns and CRM street/postcode averages together, with dates and sample counts. Workbook parsing streams rows to limit server memory.
- Financials contains an MTD review and staged implementation plan. It distinguishes CRM record keeping from recognised submission software; this release does not claim HMRC submission capability.
- Northwood corrections replace existing estimated costs with the supplied invoices, preserve payment/outstanding notes, attach only missing evidence and display insured building values without adding a second insurance expense.
- Public registration, application and maintenance form spacing, checkboxes, signature selection and mobile overflow were corrected. Available-property loading now reports failures and supports retry.
- Viewing workflows require a property, with an explicit Other option and manual address. Message previews expand to fit their contents.
- Client tenancy agreement layout preserves the supplied wording while fixing paragraph/page flow. Agreement dates use the tenancy start; signing dates retain the actual signature date. Each signer's status/link is shown, with landlord-first enforcement and PDF signature preview before submission.
- Landlord details/bank controls, email preview and correspondence history were corrected. Final-balance requests remain visible with resend/confirmation actions and require an explicit receipt date. Email artwork/colours and notes alignment were corrected.

## Pending clarification or external action

- Full Management: the supplied contract requires payment to Fleming, while the feedback also asks for a direct-to-landlord option. The supplied contract remains authoritative until the intended contractual change is confirmed.
- Existing landlord enquiry marketing opt-ins have not been fabricated. Confirmation is needed that recipients consented to marketing; service communications remain separate.
- Resend DNS: the three requested records were still absent from public DNS when checked. Stablepoint's reply promises installation but does not confirm completion. The production sending key cannot administer domain verification.
- Earlier office-dependent document/date/identity questions remain outstanding; this release does not mark missing evidence complete.

## Verification

175 backend and 52 frontend unit tests, 73 production-readiness scenarios, nine Marie feedback scenarios and 13 service-contract scenarios passed. Browser checks cover the signing flow on mobile, filters, service email previews, MTD, real ONS/local averages and calendar columns, alongside the earlier Marie workflows. All contract pages were visually inspected. Backend/frontend builds pass; lint reports no errors and one existing Tenants effect-dependency warning.

Migration 0030 adds service contracts, landlord approval evidence, insured values and the ONS cache. Release targets are the Fly API and the existing CRM, tenant/application and landlord Vercel projects. No feedback-monitor automation is recreated.
