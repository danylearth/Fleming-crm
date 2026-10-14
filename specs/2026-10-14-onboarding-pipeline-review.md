# Onboarding action pipeline — 14 October 2026

The dashboard is an office-action queue. Full records remain accessible in their normal modules while waiting. This change does not approve, sign, convert or send anything.

| Process | Office action shown | Waiting hidden until a scheduled follow-up or new action |
| --- | --- | --- |
| Tenant enquiry | New enquiry, due viewing/follow-up | Future viewing/follow-up |
| Deposit/application | Request deposit, send application, review submitted application, unsent corrections | Requested unpaid deposit, sent incomplete application, sent corrections |
| Joint applications | Both submissions ready, missing office decisions, either applicant’s outstanding credit work | Outstanding submission; no premature completion |
| Guarantor | Invite/retry/expired link, signed submission review, credit work, final approval, declined/changed deed | Invited application, sent corrections, reviewed application with completed credit check awaiting witness |
| Tenancy agreement | Prepare, deliver/retry, continue after all signatures | Outstanding landlord/tenant/joint signature |
| New tenant completion | Request final balance, book handover, due handover, conversion | Unpaid balance until follow-up, future handover |
| Existing tenant completion | Complete new tenancy after required checks/signatures | Outstanding application/guarantor/signing; no deposit/balance/handover stages introduced |
| Landlord enquiry | New enquiry, due meeting/follow-up, delivery problem | Future appointment/follow-up |
| Landlord after conversion | Add property, prepare/send contract, failed delivery, signed contract bank approval, ID review/request | Issued unsigned contract, unless independent ID review or due follow-up exists |
| Finished records | No completed enquiry/onboarding row | Converted/closed/rejected enquiries and completed landlord work leave the queue |

Scheduled follow-ups use existing record/task dates; no deadlines are invented. Failure metadata uses the latest delivery, including provider bounce results. Signed or submitted work takes precedence over a future follow-up. Current contract versions and service overrides are respected. Closed properties are excluded.

Dashboard data refreshes every minute while visible, and on return/focus. Dismissing a row hides that stage/version only: a changed action or record date can return it. A load failure is shown explicitly rather than silently presenting an empty successful queue.

## Verification

- Frontend and backend production builds passed.
- 15 focused frontend tests passed, covering the stage sequences and joint/sole differences.
- Isolated PostgreSQL tests exercised real enquiry SQL and the authenticated landlord-onboarding endpoint: invitation expiry, corrections, witness wait/failure/completion, credit/review gates, latest deliveries, landlord-to-tenant signing handoff, service contracts, bank approvals, void/closed records and data minimisation.
- Fictional browser transitions passed at 390, 820 and 1440 pixels, with no page errors or page overflow. Checked disappearance/reappearance, follow-up, stage dismissal, landlord filtering and removal after completion.
- Live read-only checks confirmed Zoe remains waiting for Frank, with no due follow-up task. No live application was progressed during verification.

## Live release and urgent guarantor uploads

- Pipeline published to the CRM on 14 October 2026. Archived properties are excluded as well as closed/sold properties.
- Guarantor evidence now supports six files per selection and twenty current files per category, retaining existing evidence. A batch containing an invalid file rolls back without replacing previous uploads. Separate files remain available for individual office review; all supporting documents must be approved.
- Correction uploads supersede rejected evidence only, preserving approved documents and historical evidence. Signed application locks and private credit-report restrictions remain enforced.
- Guarantor upload controls use the tenant form's Choose files / + Add another wording and matching file-row presentation. Supported guarantor formats remain PDF, PNG and JPEG, up to 10 MB each.
- Account Name capitalises word initials. Removed the redundant Fleming Lettings footer.
- Actual upload HTTP tests passed against an isolated PostgreSQL database, including multiple uploads, individual removal, invalid batch rollback, correction additions, signed locks and office visibility. Ten existing evidence/review/privacy tests passed. Browser checks passed at 390, 820 and 1440 pixels, including account-name formatting.
- Live API health confirmed `crm14-guarantor-multi-upload`; public form source confirmed the new multiple selector, add-another controls, capitalisation and footer removal. Public form deployment: `dpl_CC8HpYGk1tsNYuh4Bdg1wo9kV8PE`; CRM deployment: `dpl_e9PMaSywPoV3naHY1ewPhkrtHbHt`.

## Authorised test-data cleanup

Removed landlord 15 (Marie Ellis), linked properties 32 and 34, explicitly labelled test property 35 (Review Court), enquiry 95 (Winston Jerome) and its test guarantor/signing records. Removed their linked test documents, tasks, messages, service agreements and bank-details row. Verified there were no linked real tenants or financial records; unexpected cross-links would have aborted the transaction. Signed evidence and recovery details remain in internal audit entry 17355; no private documents were exported.

Post-cleanup checks found none of the selected records remaining. The genuine internal landlord and Zoe/Mathew records remain. Zoe's pipeline still reports waiting; Frank remains invited, with his existing three current evidence categories retained. Nothing was signed, approved or progressed on their behalf.
