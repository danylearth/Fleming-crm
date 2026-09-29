# Prospect landlord marketing readiness — 28 September 2026

User supplied fleming-prospect-landlord-email.html and its 14 images, selected 72 opted-in landlord enquiries, and sender enquiries@fleminglettings.co.uk.

Dry run tmp/dry-run-prospect-marketing.cjs uses the compiled worker and email renderer with a fake database/provider and network disabled. Exact files produce the same 14 image hashes already uploaded to production. Original input failed greeting personalisation, contained four placeholder links and generated two opt-out rows. Fixed normalisation converts the supplied greeting to FIRST_NAME, removes honorifics when choosing first name, resolves approved social URLs, and reuses the supplied opt-out row for the recipient-specific URL. Passed rerun: all 15 image references embedded in 14 CID attachments; correct From and Reply-To; no unfinished links; one opt-out row; outgoing email_messages entry linked to landlord_bdm. 63 related tests passed.

Deployed backend crm28-marketing-personalisation-6074b7c3e1, image deployment-01M3MGWVFGB0W8KW4WQS5GBDTN. Frontend unchanged. Fix also processes the existing browser draft at send time; re-upload is not necessary.

User explicitly approved one test to accounts@fleminglettings.co.uk. tmp/send-prospect-test.cjs attempted this with an idempotency key and no marketing queue. Provider rejected it: The fleminglettings.co.uk domain is not verified. No prospect campaign was sent. CRM key is send-only, so cannot inspect/modify Resend domains.

Public DNS at 1.1.1.1: resend._domainkey.tenancies.fleminglettings.co.uk and send.tenancies.fleminglettings.co.uk TXT/MX exist; the corresponding root-domain Resend records are missing. User screenshots confirm tenancies Verified, root Failed / All required records missing. User contacted Stablepoint to add/review root records. User must provide the DNS Records table values, then use Restart in Resend. Existing office-mail MX must not be overwritten. Do not retry the real test until the provider domain is verified; do not send the 72-recipient campaign without explicit instruction.
