# Not deployed — integration draft

The user instructed on 6 October 2026 to publish the website preview without connecting it to the CRM backend. These incomplete integration sketches are outside backend/src and the migrations directory deliberately. Do not upload this folder to the website or run the migration. Real access control, document visibility, signing status types, bank request approval, account activation, conversion links, and integration tests require completion before backend activation.

The publishable preview consists only of index.html, portal.css and portal.js. It sends no requests to the CRM and creates no accounts, submissions or signatures. Sample state stays in memory and resets on refresh.
