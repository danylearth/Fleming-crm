# Additional CRM feedback — 9 September 2026

Source: `changes and feedback document.docx` (latest document, including its six screenshots).

## Implemented

| Request | Result |
| --- | --- |
| Rent Review workflow | Official Form 4A download and Section 13 guidance; **Rent increase agreed** action records new monthly rent, effective date, previous increase date, service method, service evidence and the completed notice PDF. |
| Automatic rent update | Applies on the UK effective date through the hourly scheduler and fresh tenant/property/financial reads. Updates both linked tenants, the property and active tenancy rent. Eligible unpaid future full-rent charges follow the increase; historic receipts, partial payments and bespoke charges remain unchanged. Each tenant receives an audit entry. |
| No replacement APT | Scheduling a rent review does not generate or send another tenancy agreement. |
| Review protection | Requires an active monthly tenancy, two calendar months after service, annual spacing and a tenancy-period start date. One pending increase per property. Pause, resume and cancellation have reasons and audit entries. Changed/ended tenancies or altered rents pause automatically. Notice documents and records with rent history cannot be deleted. |
| Clickable completion percentage | Opens every checklist item with its complete/missing status. Guarantor checks count only when Guarantor Required is Yes. |
| Staff overrides | Each missing item can be completed with a reason, staff identity and timestamp. Overrides can be removed and remain distinct from underlying KYC evidence. |
| Financial labels and values | Let Only Service excludes Fleming-owned properties; Rent Collection Service and Full Management Service show external active rental values. Portfolio Turnover (monthly total) shows active rent once per occupied property, including joint tenancies only once. Values are rental amounts, not service-fee income. |
| Calendar | Team Calendar opens in Month view. |
| Public forms | Maintenance report matches the application page's purple/pink styling; bottom photo and contact strip removed. Report, application and agreement pages accommodate mobile/tablet widths, long content and touch controls. Fonts/logos resolve from nested secure links. Agreement has a separate link to open the complete PDF. |

## Using rent reviews

1. Open **Tenants → tenant → £ Rent Review**.
2. Download the current Form 4A and check the linked government guidance. Obtain landlord approval, complete and sign the notice, and serve it using a valid method.
3. Select **Rent increase agreed**. Enter rent, dates, service method and evidence. Upload the completed notice PDF and confirm the checks.
4. Select **Schedule rent increase**. Both linked tenants share one record.
5. If challenged or delayed, use **Pause / challenge** before it applies. Resume only when the original notice and effective date remain valid; an expired date needs a newly reviewed record.

Form 4A is itself the Section 13 notice. Its signature section is for the landlord/agent; tenant acknowledgement can be recorded in notes. The document's references to separate Form A4/Section 13 uploads and a mandatory tenant signature have therefore been corrected. This implementation handles monthly tenancies and notices served from 1 May 2026, not historic notices or tribunal determinations.

Official sources checked 9 September 2026: [Form 4A and notes](https://assets.publishing.service.gov.uk/media/69eb2022606c20d412163366/Form_4A.pdf), [GOV.UK rent-increase guidance](https://www.gov.uk/assured-periodic-tenancies-tenants/rent-increases).

## Verification

- 176 unit tests passed (135 backend, 41 frontend).
- 23 real HTTP/PostgreSQL scenarios passed, including scheduling, duplicate rejection, pauses, joint application, receipt preservation, protected notice downloads/deletion and audited completion overrides.
- Backend and frontend production builds passed. Frontend lint: no errors; two existing hook warnings.
- Public report/application/agreement checked at 320, 390, 768 and 1024 pixels. All five application steps checked; no horizontal overflow.
- Staff browser checks passed: completion override persisted after reload and could be removed; rent review form, monthly calendar and financial service totals rendered correctly.
- Synthetic local data only for mutations and signatures; no messages sent to live tenants.

## Release

Pre-release database data backup: `backups/pre-followup-20260909-125837.json.gz` (outside the Git repository, restricted file permissions; 27 tables, 2,153 rows). Upload-volume snapshot: `vs_QR0ZJ1xl0AjsGyozbD2Q` (created). Deployment details and live verification are recorded below after completion.

Existing Resend/Twilio account setup remains separate from this feature release; see [Resend setup](resend-setup.md).
