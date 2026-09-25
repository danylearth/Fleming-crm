# Fleming Lettings: mobile inventory and signing plan

**Draft for review · 25 September 2026**
**Scope:** mobile capture, CRM review, tenant signing and landlord copies for client properties. This is a proposed feature plan, not a statement that the workflow is deployed.

## Recommended approach

Extend the inventory feature already in Fleming's mobile app and CRM. Staff should complete a structured inventory on their phone, with photographs attached to the relevant room or item. The CRM should generate the report, manage review and signatures, and retain a complete history. Uploading a separate paper report should be optional.

Once the office approves the completed inventory, send each tenant an individual review/signing link. For **My Clients** properties, also send the relevant landlord a report link and, when signing is complete, the final copy. For **My Portfolio** properties, keep the report on the property and tenant records without generating an external client-landlord email.

**Proposed default:** support “Landlord signature required” for client properties, with a separate view-only copy option. The subsequently supplied landlord email explicitly requests signing, so the design must support this path; this remains a proposed setting rather than an instruction to issue any real requests now. The tenant and landlord originals are preserved unchanged in `docs/templates/inventory/2026-09-25-originals/`.

## What to take from InventoryBase

InventoryBase's published features include offline mobile work, reusable report templates, room/item-linked photographs, dictation, desktop editing, secure report sharing, tenant comments, PDF export and check-out comparisons. These are useful reference points for the Fleming workflow. It also advertises an API and webhooks, making an integration an alternative to building everything ourselves. This review covers its public documentation, not a logged-in trial or practical assessment of its app. [InventoryBase features](https://inventorybase.co.uk/features/)

Its signing guidance requires a report to be completed before signing; changes after signing require a further signature. Fleming should likewise preserve exactly what each person reviewed and signed. [InventoryBase digital signatures](https://inventorybase.co.uk/getting-started/capture-digital-signatures/)

The recommendation is a native Fleming workflow because an app, CRM records and signing foundation already exist. An InventoryBase subscription/API integration would need a separate assessment of access, costs, data ownership and duplicated workflows before choosing that route.

## Current CRM foundation and gaps

These findings are from the local project code, not confirmation of the current live deployment.

| Area | Already present | Planned work |
|---|---|---|
| Mobile capture | Inventory list, creation, rooms, condition, notes, camera/photo uploads | Detailed item capture, completeness checks, offline storage and reliable synchronisation |
| Data model | Inventory, room, item and photo tables | Fully expose item workflow; version reports and snapshots; support an explicit tenancy/participant group |
| Report generation | Generated PDF with photographs and tenant responses; imported PDFs | Structured room/item report, clear version identifiers, original evidence retention |
| Tenant review | Individual token links, comments, additional photos and typed-name signing | Review the complete structured report, support every joint tenant, revisions and reminder workflow |
| Joint tenancies | Main tenant plus linked partner supported | A participant list that supports more than two tenants and preserves who belonged to the tenancy at issue |
| Sending | Tenant email/SMS with delivery records and duplicate-send safeguards | Client-landlord recipients, reminders, final copies, explicit delivery failure handling |
| Completion | Mobile “Mark as Completed” can immediately issue for review | Separate capture completion, office approval, delivery and signature status |
| Editing | Issued inventories are locked, including database protections | Controlled replacement versions/addenda; consistent protection for imported signed documents |

Relevant files: `mobile/src/screens/InventoryDetailScreen.tsx`, `mobile/src/screens/RoomCaptureScreen.tsx`, `mobile/src/services/inventory.ts`, `frontend/src/components/PropertyInventory.tsx`, `backend/src/inventory-routes.ts`, `backend/src/inventory-review.ts`, `backend/src/inventory-pdf.ts`, `backend/migrations/0016_inventory_reviews.sql` and `tenants-subdomain/inventory.html`.

Two existing behaviours need particular attention: a new room currently defaults to “Good”, and existing invitation/review wording says an unanswered report is taken as agreed. New capture should begin **Not assessed**, and an unanswered signing request should stay **Overdue / awaiting response**. Receipt, silence and a signature must be distinct system events.

## End-to-end workflow

| Step | Staff or recipient action | CRM result |
|---|---|---|
| 1. Plan | Choose property, tenancy, report type, date and inspector | Assigned inventory task linked to the property, tenancy and calendar |
| 2. Prepare | Download the appointment and room template before the visit | Mobile shows “Available offline”; private records limited to the assigned work |
| 3. Capture | Complete rooms, items, meters, keys and safety observations; take photos | Automatic local draft saves, evidence linked to the correct item |
| 4. Finish capture | Review missing fields and mark the visit finished | “Waiting to sync” until all required data and photos reach the server |
| 5. Office review | Preview the generated report; correct errors or return it to the inspector | “Ready to issue” only after checks pass |
| 6. Issue | Confirm recipients, review deadline and approved version | A locked report version, individual tenant links, landlord copy for client properties |
| 7. Respond | Each tenant reviews, comments, adds evidence and signs | Separate response and signature status per person; office notified of discrepancies |
| 8. Resolve | Office reviews comments; agree an addendum or issue a replacement version if needed | Original evidence and signed versions retained; affected recipients re-sign revised content |
| 9. Close | Required signatures obtained and outstanding issues reviewed | Final report stored on related records; final copies delivered; audit trail retained |

Use three separate status indicators: **report stage**, **signature progress** and **delivery status**. For example, “Issued · 1 of 2 tenants signed · Landlord email failed” is more useful than one ambiguous “Completed” badge. All signatures received does not mean every recorded discrepancy has been resolved.

## Mobile design and capture fields

### App screens

**My inventories:** a simple vertical list, showing full property address, appointment, report type, assignee, progress and sync status. Filters: Upcoming, In progress, Waiting to sync and Returned for changes.

**Inventory overview:** property/tenancy details followed by a room checklist. Show “6 of 8 rooms assessed” and missing required sections. Main action: Continue inventory. Keep Finish capture separate from Send for signature.

**Room capture:** one room at a time, with a compact item list. An item opens a form with condition, cleanliness, description, notes and its photo gallery. Provide Save/Cancel, Add item, Duplicate item and Take photos. Reused descriptions and quick phrases save typing, but copied condition values must be confirmed for the current visit.

**Review capture:** list missing observations, inaccessible areas, damage and queued uploads. Staff can return directly to the relevant item. Optional supporting PDF upload remains available.

### Information to record

| Section | Fields |
|---|---|
| Report details | Full address and postcode, tenancy, report type, inspection date/time, inspector, persons present, furnished status, access limitations |
| Room or external area | Name/type, overview, cleanliness, overall observation, room photographs |
| Item | Name, description/material/colour, quantity, condition, cleanliness, defects, comments and item photos; make/model/serial where useful |
| Condition | Not assessed, Excellent, Good, Fair, Poor, Not present or Not inspected; require explanation for inaccessible/not inspected items |
| Cleanliness | Not assessed, Clean, Light cleaning needed, Cleaning required, Not applicable |
| Meters | Utility, meter identifier, location, reading as text, units/register, photo and observation time; support multiple rates/meters and leading zeros |
| Keys/access | Key/fob type, quantity, handed to/by, date, acknowledgement; protect access codes from routine shared reports |
| Safety observations | Smoke/CO alarm location, observed presence, test performed/result or not tested, date and notes; do not portray these as professional certification |
| Summary | Damage, maintenance/cleaning follow-ups, missing items, access restrictions and optional supporting documents |

Include hallways, doors, walls, ceilings, floors, windows, fittings, furniture/appliances, bathrooms, gardens and other external areas as appropriate. Templates should adapt to furnished/unfurnished properties and room count. Users can add/remove inapplicable items with a recorded reason.

New findings can create a linked maintenance task after staff review. Do not automatically charge tenants or decide responsibility for damage from a condition selection or photograph.

## Offline operation and evidence

Offline work is a first-release requirement. The existing direct upload calls alone do not provide it.

- Store draft answers and photos durably on the device, with autosave and a visible last-saved time. Survive app closure, battery loss and interrupted uploads.
- Assign stable client-generated identifiers to records/photos. Resume uploads with duplicate protection, checksums and server acknowledgement before marking an item synced.
- Show queued, uploading, failed and synced counts. Allow retry without recreating reports or sending invitations twice.
- If another staff member edits the same draft, show a conflict for review; do not silently overwrite either version.
- Retain original photo files, capture metadata where available, server receipt time, uploader and attachment location. Record device capture times as device-reported, not independently verified timestamps.
- Generate thumbnails and display copies separately. Never alter original damage evidence with AI enhancement. Annotations should be separate overlays or derivative copies.
- Avoid third-party transcription in the initial release unless approved; optional device dictation can assist entry, with staff checking the text.
- Protect local data and scoped downloads. Warn about unsynced work before logout/removal, provide recovery where possible, and apply an agreed retention policy after successful sync.
- Block issue until all required uploads have been acknowledged and the generated report has been checked. A signed report must not later acquire missing photographs silently.

## Tenant signing and landlord delivery

Tenants should not need to install the app or create a CRM account. Each receives a private, recipient-specific browser link. It opens the full report with room navigation, readable photos, comments and a download option.

The tenant can confirm observations, record disagreements, attach evidence, then enter their name and explicitly confirm their signed response. Store the exact report version, statement shown, response, signature event and server timestamp. A drawn signature can be an optional enhancement; it is not a substitute for clear identity, consent and version records.

Support one link per required adult tenant, including more than two joint tenants. Never infer all tenants have signed from one person's response. At issue, snapshot the intended participants so later changes to the tenancy do not redirect an already-issued report.

For client properties, resolve landlord recipients from the property's actual ownership/authorised contacts, not the user's currently selected portfolio filter. Show the recipient list before issue. Send the landlord an issued copy and a final copy when the signing process finishes. Use separate landlord access: a tenant signing token must never be reused in a landlord email.

Missing contact details should create a visible action for the office. Staff may record an agreed alternative delivery method; the system must not mark a failed email as delivered or silently drop a required signatory. Landlord signature, if enabled for that client, becomes a separately tracked requirement.

Links should be scoped, expiring and revocable, with no access to other records. Consider a one-time verification code for remote signing; an email link alone proves possession of that link, not independent identity verification. Reissuing access must not change the signed content.

When a review deadline passes, keep the record unsigned and create a chase task. A suggested configurable cadence is one reminder before the deadline, one on the deadline and an office task afterwards. Stop reminders for signed, superseded or withdrawn requests. Do not treat silence as a signature or automatically close a dispute.

## CRM presentation

On Property → Inventory, show a compact list of reports with date/type, inspector, version, stage, signature count and delivery exceptions. Actions depend on state: Continue, Review, Issue, View report, View responses or Create revision.

The review screen should have tabs for Report, Photos, Responses and Activity. Each editable draft section has its own pencil and Save/Cancel controls, consistent with the requested CRM design. After issue, editing opens a revision workflow rather than modifying the shared report in place.

Tenant and landlord records should link to the same underlying report, with recipient-specific permissions. Activity records capture who created, edited, approved, issued, viewed, responded, signed or superseded it. Email/SMS provider acceptance, confirmed delivery, opening and signing remain distinct events.

A success popup should show a tick and **View report**, with wording such as “Inventory issued for review”. Delivery failures should remain visible on the report rather than being concealed by the popup.

Keep routine periodic inspections separate: their requested 3/6/12-month then annual schedule is a different workflow. They can reuse condition capture components, but should not overwrite the check-in inventory baseline or require the same signing process by default.

## HTML and SMS plan

The project contains `backend/src/email-templates/12-property-inventory.html`, with tenant name, property address, due date and review-link placeholders. Sam subsequently supplied both tenant and landlord HTML originals, two previews, two image bands and a white logo. All seven files are now preserved, unchanged and hash-verified, in `docs/templates/inventory/2026-09-25-originals/`. Use these as the design references for production derivatives; they have not replaced live templates.

The landlord original requests a signature: use it for the landlord-signing path, and prepare a view-only wording variant if a copy alone is selected. The tenant original includes non-response agreement wording; retain the original but review that sentence before production use, keeping actual signature status separate.

| Communication | Recipient | Main action |
|---|---|---|
| Inventory ready | Each required tenant | Review and sign |
| Inventory issued | Relevant client landlord contacts | View inventory |
| Review reminder | Outstanding signatories only | Continue review |
| Comments received | Assigned office team | Review tenant comments |
| Revised inventory | Affected recipients | Review revised version |
| Signing complete | Tenants; client landlord contacts | View final report |
| Delivery failure / overdue | Assigned staff task | Resolve or chase |

Use the approved compact Fleming email proportions and signature styling. These are service messages: do not route them through marketing campaigns or append a marketing unsubscribe footer. Keep report details behind the secure link; do not put sensitive observations in SMS. Optional SMS invitations/reminders follow the configured communication settings.

Each send needs an identifier based on report version, recipient and message purpose. Track provider results and reconcile uncertain dispatches before retrying. Sending the same operation twice must not produce duplicate invitations. Template tests should use fictional records and an approved test inbox, covering mobile/desktop, light/dark appearance, wrapping, link expiry and missing optional values.

## Implementation plan

| Phase | Deliverables | Exit criteria |
|---|---|---|
| 1. Workflow and data | Report stages, tenancy participants, recipient roles, immutable versions, permissions and audit events | State transitions and access rules proven before replacing current completion behaviour |
| 2. Mobile capture | Room/item templates, condition/cleanliness, meters/keys/alarms, photo capture, autosave and offline queue | A complete visit survives airplane mode, app restart and interrupted synchronisation |
| 3. Office review and reports | Desktop section editing, validation, preview, generated PDF, revision/addendum workflow | Shared report matches reviewed content; issued evidence cannot be edited silently |
| 4. Signing and communication | Individual joint-tenant links, client-landlord delivery, comments, reminders, final copies | Every recipient/status tested; failures recover without duplicate sends |
| 5. Pilot and release | Staff walkthrough, fictional end-to-end trial, selected real-property pilot, monitoring and rollback | Office signs off usability and evidence completeness before wider rollout |

The initial release should include reliable capture, review, signatures and client delivery. Defer video/360-degree capture, AI-generated observations and a broader landlord portal until those fundamentals work. Check-out comparison can follow, referencing the immutable signed check-in version and recording differences without automatically assigning liability.

Technically, build on the existing React Native/Expo app, React CRM, PostgreSQL inventory tables and Resend/Twilio delivery tracking. Add explicit versions, participants, deliveries and sync-operation records rather than overloading one status field. Put permission and transition enforcement on the server, including direct API requests; hiding a button is insufficient. Use durable private storage for originals and PDFs, with backup/recovery checks before production release.

Existing imported or signed inventories must retain their original files and known metadata. Mark unknown signing dates as unknown. Do not invent signatures, backdate electronic acknowledgements or convert historical “Good” inspection information into proof of tenant agreement.

## Acceptance checks

1. Complete an eight-room inventory offline; close/reopen the app; all answers and photos remain available.
2. Interrupt a large photo upload twice; synchronisation resumes without missing or duplicate files.
3. A new room is Not assessed. Missing mandatory observations block completion, with an explicit reason allowed for inaccessible areas.
4. Two staff edits conflict visibly rather than silently overwriting each other.
5. An authorised reviewer can approve and issue; a viewer and an unrelated staff account cannot change or retrieve the report through the API.
6. Three joint tenants receive distinct links; one signature shows 1 of 3. Repeated clicks do not create duplicate signature events.
7. My Clients sends the approved landlord copy; My Portfolio does not. The UI filter cannot change recipient routing.
8. Missing/bounced contact details produce an office action. Provider acceptance does not display as recipient delivery or signature.
9. Tenant discrepancies and extra photos remain attached to their response and visible in the final report.
10. An expired/revoked link cannot access a report; changing an identifier cannot reveal another tenant's photos.
11. A replacement version preserves the original and its signatures. The new version requests its own signatures and stops obsolete reminders.
12. An overdue response remains unsigned. Imported historical documents do not gain invented agreement dates.
13. Generated PDFs match the web report, have readable photographs, sensible page breaks and clear version/signature information.
14. All invitation, reminder and final-copy templates render correctly at mobile widths and light/dark settings; service emails contain no marketing footer.

## Example walkthrough

An inspector visits the fictional **10 Example Road** for a new joint tenancy with Alex Example and Jamie Example. The property is a client-managed record.

The inspector records eight rooms, notes a scratch on the living-room door, photographs it, records the meter readings and saves the key count. There is no signal, so the app shows “Saved on device · 24 photos waiting to sync”. Once synchronised, the office checks the report and issues version 1.

Alex and Jamie receive separate signing links. For this example, landlord signing is enabled and the landlord receives a separate signing link matching the supplied landlord template. Alex signs; Jamie adds a photograph showing another pre-existing mark. The CRM shows **Tenants: 1 of 2 signed · Landlord: awaiting signature · Comments need review**, not Completed.

The office accepts the observation and issues a clearly identified revised report. Both tenants and the landlord sign that version. The final report contains the recorded condition, photographs, agreed responses and signature history. Copies go to both tenants and the client landlord, with delivery tracked separately. The original issued version remains in the audit history.

**Defaults to use for the first design:** office approval before issue; each joint tenant signs separately; client landlord gets issued/final copies with a signing path matching the supplied landlord template; a view-only alternative uses different wording; seven-day review window configurable by staff; optional supporting PDF; no automatic signature through non-response. These are proposed product settings for review, not claims about statutory requirements.
