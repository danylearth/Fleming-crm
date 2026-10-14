# Joint-to-sole tenancy verification — 14 October 2026

Verified the same-property transition using fictional tenants and an isolated local PostgreSQL database. No live application was signed, approved or converted during testing.

## Behaviour verified
- Joint tenancy ends 5 November; sole tenancy starts 6 November.
- Final completion schedules the transition; the existing tenant identity is reused, and the enquiry is retained as converted history.
- Outgoing joint tenant becomes inactive (Archived in the UI); continuing tenant becomes sole.
- Old billing profile retains both tenant IDs, joint invoice names, payments and arrears. New profile contains the continuing tenant only.
- Repeat completion and billing runs do not create duplicate tenants or rent charges.
- An unpaid erroneous final-boundary charge can be cancelled with its original invoice and audit history retained. Paid, allocated, externally linked or chased charges are blocked from this correction.
- No rent is generated on the final boundary date. The sole rent schedule starts on the new start date.
- Verified guarantor details are frozen with the scheduled tenancy and copied to the continuing tenant at activation.
- Missing guarantor approval/witness completion blocks final progression.
- Dashboard pipeline hides applications waiting for an invited guarantor; signed submissions return as Guarantor Ready for Review. Corrections awaiting resubmission hide again; failed invitations and unsent office work remain actionable.

## Checks
- Frontend and backend production builds passed.
- 12 targeted frontend tests passed.
- Actual enquiry-list SQL and guarantor completion gates passed against isolated PostgreSQL.
- Changeover, retained balances, cancelled-invoice retrieval, scheduler idempotency and authenticated historical-invoice access passed.
- Fictional browser checks at 390, 820 and 1440 pixels: pipeline visibility, tenant rent history/new charges, zero charge shown Not due; no page errors or horizontal page overflow.
- Cancelled invoice PDF rendered and visually reviewed.

## Operational conditions
The old tenancy end date does not itself approve or activate the new tenancy. Staff must complete the remaining onboarding after the required reviews and signatures, before the 6 November changeover. Completion after the old tenancy has already archived requires office review rather than automatic retrospective activation.

The agreed new deposit is not a bank receipt: recorded deposit held is not automatically increased. Existing funds/top-up/protection must be handled through the normal financial process.

This covers the same-property joint-to-sole workflow. Cross-property moves and unrelated site-wide UAT are outside this verification.
