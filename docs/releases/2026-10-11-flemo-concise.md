# Concise Flemo contact lookups — 11 October 2026

Flemo now answers simple address/name/phone requests with short text blocks and a brief clarification when an address is ambiguous. It no longer automatically adds record links, document downloads or email proposals. “Send me a list” means a reply in chat; email requires an explicit email request or recipient.

Contact lookups retrieve only current tenant names, addresses and contact fields. Selected portfolio scope is retained; an explicit own-portfolio request also restricts candidates to internal properties. Contact lookups do not retrieve documents, payment histories, notes or SMS. Address confirmations such as “Yes, 2A Cavalier Circus” retain the preceding lookup context. The assistant is instructed not to silently substitute house numbers, expose internal record IDs, or use Markdown tables in the compact chat panel.

Explicit record links, document downloads, exports and confirmed email actions remain available. Download actions are deduplicated by document ID.

Verification: 30 targeted lookup/action/rent tests passed. The isolated production backend built successfully. Published from the previously verified live backend snapshot with only the five Flemo source files changed. No frontend release is required.

Release: `crm11-flemo-concise-1`. Live example verification recorded after publication.

Live verification passed for the user's exact request: three requested addresses with tenant names/phone numbers, followed by “For ‘21 caval’, did you mean 2A Cavalier Circus?” No table markup, CRM IDs, action buttons or email proposals were returned. Confirming “Yes, 2A Cavalier Circus” returned just that address and its tenant contact details, again without actions. Production health checks passed. Image: `deployment-01M4N82S9C3K3DJC1DDE4K0KZG`.
