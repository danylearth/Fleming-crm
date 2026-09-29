# Fleming client portal design draft

This standalone design uses sample records and session-only interactions. It does not call production CRM endpoints. The signing test uses the supplied private inventory and signature, plus the CRM's existing SignDocument.tsx, signatureEditor.js and signing stylesheet. The authentication-dependent SigningPage image wrapper is replaced with a local fixture wrapper; request data and submissions are simulated. The public signing UI itself is imported unchanged. The outgoing email is populated from signature-request.html, with the requested "Click to complete document" button text.

## Review links

- /?view=tenant — tenant dashboard
- /?view=landlord — expandable landlord portfolio
- /?view=tenant&screen=login — tenant login design
- /?view=landlord&screen=login — landlord login design
- /request-email.html — populated CRM signature-request email, not sent
- /request-signing.html — existing recipient signing UI with the inventory test

## Live CRM integration still required

The proposed portals need separate customer authentication and server-side object authorisation. Existing staff JWT access must not be exposed to customers. A portal identity should link to permitted tenant or landlord records. Every property, invoice, document and repair must be checked against that identity on the server.

| Portal function | CRM connection |
| --- | --- |
| Tenant account | tenants, linked tenancy/property, authorised contact updates |
| Landlord property list | property_landlords relations, properties and authorised owners |
| Rent history | actual rent-payment and transaction records; distinguish due, received, allocated and paid out |
| Costs and invoices | property_expenses and original invoice documents; calculate VAT and ownership shares from CRM records |
| Maintenance | create maintenance request and activity/audit entry; use existing task assignment and updates |
| Document library | documents, signed agreements, inventory and compliance records; authenticated downloads with permitted categories |
| Tenancy-end proposal | create a review request/task; no automatic legal end date or tenancy status change |
| Signature requests | existing signature_requests and signature_recipients workflow; token-scoped document access and sign fields |
| Fleming AI | account-scoped tools for invoices, documents and maintenance; source links; explicit review before creating a request |

Uploads need server file validation, private storage and scanning. AI must not expose staff-only notes, another customer's data or documents outside the logged-in user's scope. All mutations need audit entries and duplicate-submission protection. The existing generic signature-request flow already stores completed PDFs and signature audit data; extend that rather than introducing a competing signing system.

## Test inventory

Inspection date remains 21 September 2026. Page 1 is rebuilt with embedded Arial and Arial Bold. Sam Fleming replaces Marie Ellis and appears in a clearly labelled agent row with the user-supplied signature and a test date of 28 September 2026. Tenant name is retained from the supplied PDF. Tenant signature and date cells remain blank until the test is completed. Pages 2–17 are copied from the source. This is marked as a test document and does not assert an actual tenant signature or delivery.
