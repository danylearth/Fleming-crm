# Inventory email originals

Saved from the files supplied by Sam on 25 September 2026 for future inventory emails. All seven source files were copied unchanged and their SHA-256 hashes checked against the supplied originals.

## Templates

- [Tenant inventory email](fleming-tenant-inventory-email.html)
- [Landlord inventory email](fleming-landlord-inventory-email.html)

## Visual references and assets

- [Tenant preview](fleming-tenant-inventory-email%20Preview.jpeg)
- [Landlord preview](fleming-landlord-inventory-email%20Preview.jpeg)
- [Tenant image band](inventory-tenant-band.png)
- [Landlord image band](inventory-landlord-band.png)
- [White Fleming logo](fleming-logo-white.png)

These are retained design/source references, not active email templates. Do not overwrite them when integrating: create production derivatives and preserve these originals. No emails were sent or live templates replaced by saving these files.

Preserve the supplied layout, colours, spacing, typography, button proportions and image choices. Bind recipient names, full property addresses, dates and individual review links to verified record data. Use hosted production assets or approved embedded attachments when sending; local/placeholder asset references need resolving.

The landlord version requests a signature. The implementation plan should therefore account for a landlord-signing workflow for client properties and a distinct view-only variant where only a copy is required. Do not send signing wording with a view-only link.

The tenant original includes wording about agreement through non-response. Retain the source unchanged, but review this wording before production use; the CRM must still distinguish an overdue response from an actual signature.

Future integration checks: mobile/desktop rendering, light/dark colours, recipient-specific links, client-property routing, joint tenants, delivery tracking, and no marketing unsubscribe footer on these service emails.

Related plan: [Mobile inventory functionality and delivery](../../../reviews/mobile-inventory-plan-2026-09-25.md).
