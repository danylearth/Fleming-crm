# CRM 09.9 feedback release

Source: `CRM 09.9.zip`, “feedback and changes.docx”, supplied tenancy-end HTML and Apple/Google icons. The document was treated as product feedback; historical operational instructions in older attachments were not executed.

| Feedback | Change |
|---|---|
| Handover time alignment | Added the missing time-field label to align with the date input. |
| Conversion and strange start dates | Normalised PostgreSQL calendar dates, fixed ISO display, and stopped ordinary tenant edits re-running placement validation. Overlapping unrelated live tenancies still require the existing tenancy’s end to be scheduled. |
| Tenant-detail crash | Nullable historical email bodies no longer crash the record. Ella and Sam tested using a private local copy of their actual records. |
| Tenant archive action | Added Archive Tenant directly to tenant details for managers/admins; documents/history remain intact. |
| End-tenancy workflow | Separate calendar/notes/message dialog, yellow Update Tenancy and red Schedule Tenancy End buttons. Both linked tenants receive the same end date. Internal notes are excluded from communications. |
| End messages | Personalised supplied HTML and requested SMS, optional channel checkboxes and pop-out previews for both linked tenants. Failures are reported without hiding a successfully saved end date. Successful message retries are deduplicated. |
| Dates resetting | Editing and tenancy-end drafts survive background/focus refreshes. |
| Archiving | Active through the end date; archived the following UK calendar day. Scheduled/active statuses synchronise on reads and in the hourly scheduler. |
| Property details | Removed numeric-zero rendering; grouped Previous Tenancies/Add Tenant buttons with red/green colours; show scheduled tenants and tenancy end dates. |
| Property status | Scheduled tenancy → Let Agreed; active tenancy → Let. Property tenancy summary follows the linked tenant dates. |
| Next of kin | Restored missing details from the supplied property overview; application conversion continues to carry next-of-kin data. |
| Guarantors | Dedicated visible details card with name, address, email, phone, date of birth, employment, employer, income and separate primary/secondary ID-held flags. Recovered source-backed details for Julia/Katie’s guarantor. |
| Rent Review | Green £ Rent Review button opens a proposed staff workflow. No automatic rent increase or notice is issued. |
| Communications | Shared history across tenant, enquiry, landlord and BDM records; Email/SMS filter, decoded text, failure details and full email preview. |
| Email appearance | Restored the supplied maintenance layout; added supplied tenancy-end layout and exact map icons. Supplied artwork is embedded in outbound emails. The original unsafe “non-emergency fire / 112” label is corrected to the gas-emergency number. |
| Own-portfolio landlord | Master Fleming landlord is always displayed. Adding/removing/reassigning portfolio ownership is blocked in UI and API. Client-property landlord controls remain available. |

## Remaining input and operational setup

- Mildred’s guarantor requirement is recorded from this feedback. The overview supplies Gavin Cameron as next of kin, without identifying a guarantor. Guarantor identity/contact/employment details still need confirmation; next-of-kin status was not converted into guarantor status.
- Diane Reaney’s next-of-kin section is blank in the supplied overview; no matching completed source was found. These details remain to be supplied.
- Primary ID for Julia/Katie’s guarantor is not marked held without a source document. The supplied approved utility bill supports the secondary-ID-held flag.
- Resend delivery/open/click event tracking still needs the account-side signing-secret setup in [resend-setup.md](resend-setup.md). No live recipient messages were sent during verification.
- Template HTML, images and provider payloads were tested. A real Outlook inbox rendering test remains part of the account-side test email; browser preview cannot establish identical rendering in every Outlook version.

## Proposed Rent Review process

1. Check tenancy terms, start date and the previous increase.
2. Record comparable local rents and the proposed amount.
3. Confirm the current legal notice/timing requirements and obtain landlord approval.
4. Prepare the applicable notice for staff review; record service and the effective date.
5. Update the rent schedule only when the approved increase takes effect.

## Verification

- 171 unit tests passed: 133 backend, 38 frontend.
- 20 real HTTP/PostgreSQL scenarios passed, including repeated migrations, joint conversion, end-date scheduling, read-only previews, failed-provider reporting, date transitions and portfolio ownership guards.
- Backend and frontend production builds passed. Lint: zero errors, two pre-existing hook warnings.
- Browser checks passed on desktop, tablet and mobile: real tenant records, null email bodies, entity decoding, filters, unsaved-date preservation, email/SMS previews, joint end-date save and recovered contact details. All template images loaded.
- Private database backup: 27 tables before release. Upload volume snapshot: `vs_kmjev12xjZlC7mGzqlzn`.
- Backend deployed successfully to Fly, release `13a334b`, image `deployment-01M22J71R0ZJ6JQ7GW7B92B8BH`; migration 0011 applied.
- Frontend deployed successfully to Vercel from `5a9540a`, deployment `dpl_4PqLTxf1RATonnwpHc1HL76w4BmC`.
- Source-backed restoration committed with audit entries for Julia, Katie and Mildred. Missing fields were filled without overwriting populated contact details.
- Live API verification passed: Ella/Sam accessible and scheduled for 14 September; 8 Bridgemary shows Let Agreed and master landlord 8; both personalised end-message previews render. No tenancy end was scheduled on production during testing.
- Live production login and supplied assets checked in Chrome. No live recipient emails/SMS were sent.

Production CRM: https://crm.fleminglettings.co.uk

Private source data and backups remain outside the repository.
