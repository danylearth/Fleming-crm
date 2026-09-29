# Guarantor onboarding — local review prototype

This isolated prototype is **not deployed or connected to production**. All records, documents, invitations, credit results and attestations are fictional. Use sample files only. The role selector demonstrates workflow permissions; it is not production authentication. Email delivery, Canopy and signature services are simulated.

Start from the repository root with `node prototypes/guarantor-onboarding/server.cjs`. Open http://127.0.0.1:8921/office on this computer. The process binds to loopback only. State and uploaded sample files persist under `tmp/guarantor-prototype`; resetting the demonstration resets the active fixture, not previously stored sample file bytes.

## Review screens

- `/office`: guarantor onboarding, office addition, review, correction/rejection reasons, notifications, audit, access-level demonstration.
- `/tenant`: tenant nomination and automatic enquiry-field population; subsequent nominations are held for review if a guarantor has already submitted.
- `/email`: request and completion previews using the supplied Fleming HTML and images, with all joint applicants named. Downloadable HTML and linked tenant outbox entries are test-only.
- `/apply`: guarantor details, applicant confirmation, document upload, privacy/credit declarations, submission.
- `/record`: updated enquiry fields and the projected tenant record after conversion, with prior details preserved.
- `/agreement`: non-binding proposed limited agreement and sample attestations.
- `/plan`: production integration, permission, security, legal and acceptance-test checklist; primary research links.

## Try the journey

1. In Application Review, select Yes for a guarantor and prepare the test invitation. Open the guarantor form, choose **Fill fictional details**, then **Attach three sample documents**.
2. Read and tick the five declarations, then submit.
3. Return to office onboarding, review the documents and simulated credit report. Record a review note before approving.
4. In Agreement, issue the non-binding sample, try the guarantor attestation, and simulate landlord acceptance.
5. Inspect the Record and Activity audit. Use **Reset demonstration** to repeat, including correction/rejection and role tests.

## Verification on 29 September 2026

- Domain and supplied-email tests passed: validation, nomination reconciliation, prior versions, role restrictions, invitation expiry/rotation, correction/rejection, credit review gates, separate signature steps, protection of completed agreements and replacement uploads.
- Full browser journey passed from sample uploads to record updates, office review, non-binding attestation and completion; notifications and named audit entries checked.
- Desktop and 390 px mobile layout inspected; mobile navigation height corrected and no horizontal page overflow observed.
- HTTP checks passed for all seven pages, viewer write rejection, invalid PDF rejection, cross-origin rejection and unchanged state after rejected requests.

Run logic tests with `node --test prototypes/guarantor-onboarding/model.test.mjs`.

## Legal boundary

The original deed was reviewed, not modified. Individual deed witnessing requirements cannot simply be removed. This proposes a simple written agreement for a new English tenancy before grant, subject to solicitor approval of consideration, execution, fairness and the final tenancy. It is not an approved contract or a claim that every litigation risk is covered. Financial caps and duration are sample commercial choices. The final complete tenancy document, version locking and production signature evidence remain required implementation work. Canopy request mapping is a future integration plan, not a live connection.
