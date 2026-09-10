# FreeAgent setup for Fleming

The CRM does not yet import FreeAgent data. These steps prepare the account and agree the matching rules before enabling an import. The current bank-feed screen uses a different provider.

## Office steps

1. Open the [FreeAgent Developer Dashboard](https://dev.freeagent.com/) and register a production OAuth application named **Fleming Lettings CRM**. Keep its client secret private. The developer will provide the exact callback address when the FreeAgent connector is installed; do not use the ChatGPT connection in Settings for this.
2. Use a Fleming FreeAgent account with access to **Banking**. Connect it through the future FreeAgent button and approve access on FreeAgent’s own sign-in page. No FreeAgent password needs to be stored in the CRM. [OAuth instructions](https://dev.freeagent.com/docs/oauth).
3. In FreeAgent, finish explaining one rent receipt and one property expense. Make the property association explicit. For an unincorporated landlord account, FreeAgent exposes a property reference; other accounts may use projects or the paid invoice/bill. [Explanation fields](https://dev.freeagent.com/docs/bank_transaction_explanations).
4. Supply those two example references and the matching CRM property names. They establish the mapping; an unexplained bank transaction or a guessed explanation awaiting review must remain outside the import.
5. Review the first import preview before enabling regular synchronisation. It should show the FreeAgent explanation, property, tenant where applicable, amount, date and category. Unmatched entries stay in a review queue.

## Proposed import rules

Only import explained rental receipts and property costs that can be mapped reliably. Use each explanation’s permanent FreeAgent identifier to prevent duplicates, including split transactions. Retain its source link. Re-reading the same period must not create another payment.

Separate bank cash movements from expenses recorded on bills: one paid bill must not become two property costs. Refunds, partial payments and changed explanations need explicit reconciliation. Do not infer a tenant from an amount alone or mark scheduled rent as paid.

The connector should read FreeAgent records; it should not create or amend accounting entries. This is the recommended implementation boundary, not a claim that FreeAgent grants a narrowly restricted read-only OAuth scope.

For a developer: register the callback, store client credentials and encrypted account tokens on the server, validate OAuth state, then read bank transaction explanations and their associated invoices/bills/properties or projects. Check pagination, rate limits and historical import boundaries against the [FreeAgent API documentation](https://dev.freeagent.com/docs). No client credentials or account approval are configured for this connector yet.
