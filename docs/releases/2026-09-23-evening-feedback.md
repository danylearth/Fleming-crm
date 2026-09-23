# 22 September evening feedback

Implements the 18:37 feedback document, its screenshots, profile-photo feedback and supplied HTML signatures from WhatsApp Chat - CRM (4).zip. The earlier 16:15 batch was released separately at 25a990c.

- Financials: restore title, exclude deposit transfers from property expenses, show signed security/holding balances and filtered transaction history, improve allocation detail and bank controls.
- Marketing: campaign placeholder, channel pills, composer text, delivery labels, attachment removal and supplied team/user signatures. User signatures use saved contact details. Existing-tenant SMS permissions are a separately audited production correction; explicit opt-outs remain intact.
- Teams/profile: department registry, membership editor, role hierarchy, account department picker, all-user searchable activity, profile mobile/extension/team and photo replacement/deletion.
- Inventory: explicit applicability to a tenancy preserves historical document dates; completed state and a single download action. The production audit links existing signed records only; no duplicate uploads.
- Inspections: administrator edit/delete, actual inspection date, condition colours and restored due reminders after deletion.
- Insurance: all authenticated users can edit an existing policy; allocation changes update premiums once and preserve superseded evidence.
- General: measured dropdown positioning, tenant CSV import with deduplication and manager/admin permissions, dashboard defaults and spacing, matched notes/SMS controls.
- Production records: separately audited July/September rent allocations and deposit-scheme normalization against an existing certificate.
- Office guide: Resend root-domain/API-key steps and rental-comparison options supplied separately. A rental-data subscription was not requested for activation.

Validation: 162 backend unit tests, 50 frontend unit tests, 73 production-readiness scenarios, 9 afternoon scenarios, 8 account-access scenarios, and 15 evening scenarios passed. Backend/frontend builds pass; frontend lint has no errors and one existing Tenants effect-dependency warning. Browser checks cover department/profile/marketing workflows, role-based tenant import, inventory/policy UI, financial/year dropdowns and Chromium/WebKit mobile filters.

Deployment uses migration 0028 and the existing Fly API / Vercel CRM projects. Record corrections have a private pre-change database backup and before/after audit evidence.
