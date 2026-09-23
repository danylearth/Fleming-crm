# APT feedback, 23 September 19:02–19:39

Reviewed all messages and five screenshots in WhatsApp Chat - CRM (3).zip.

- Remove the gas-certificate acknowledgement row when the property has no gas, including the Let Only template's previously hard-coded label. Keep the row when gas is present.
- Start Section C at the top of a new page beneath the existing branded header, together with its introduction and General Terms.
- Capitalise heading words while retaining lowercase connecting words, such as Condition of the Property and Letters and Notices.
- Keep numbered clauses, including 3.6, together on one page.
- Add Assured Periodic Tenancy Agreement above the date section, with spacing.
- Remove underlining from numbered terms headings and use General Terms / You Must:.

The shared presentation step covers owned-property, Let Only and Rent Collection templates (also used for Full Management). Clause wording is preserved apart from the requested heading capitalisation and conditional acknowledgement removal.

Verification: 178 backend unit tests, six rendered PDF scenarios (three templates × gas/no gas), and nine existing signing/feedback integration scenarios passed. Reviewed rendered title, Section C, clause 3.6 and acknowledgement pages and checked the Linux production renderer with a synthetic agreement.

Existing signed agreements are immutable. The screenshot's agreement was issued and completed earlier on 23 September; this release changes newly generated agreements and does not replace its signatures or stored PDF. No document uploads, data migration or frontend release are required.
