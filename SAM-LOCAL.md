# Sam's Windows demo

Double-click **Start CRM.cmd** in this folder to start the database and CRM and open http://localhost:5173. Double-click **Stop CRM.cmd** when finished. Closing the browser does not stop the background apps. After restarting Windows, use Start CRM.cmd again.

Your login is in **.local/login.txt**. The demo has its own password and sample records; your live login does not apply.

PostgreSQL 16, LibreOffice and Poppler are installed within **.local/tools**. Docker is not needed for this setup. The persistent demo database is in **.local/pgdata**. Keep that folder to preserve your records. Private settings, logs and downloaded tools are excluded from Git.

The supplied integration credentials are now configured in the private backend settings. **Email and SMS actions can send real messages.** No test messages were sent during setup. Public signing and onboarding sites are separate apps and are not started by this launcher.

## Integration status

- **Twilio SMS:** account credentials accepted; account is active. Local delivery-status callbacks are disabled because Twilio cannot reach localhost. Incoming messages and delivery receipts need a publicly reachable callback and provider configuration.
- **Resend email:** sending key and webhook secret installed. The API identified the key as restricted to sending; read-only domain verification was not permitted. Actual delivery has not been tested.
- **Companies House:** authenticated company search passed.
- **EPC:** token installed; the lookup completed with no records for the test postcode.
- **FreeAgent:** app credentials installed, but no account is connected. Confirm/register `http://localhost:3001/api/freeagent/callback` with the FreeAgent application owner, then connect the account from CRM Settings. The production callback was not copied into this local setup. A separate development app is preferable if the existing app cannot support this callback without changing production.
- **TrueLayer, Council Tax, Google Maps/Places and Sentry:** the handover contained no credentials.
- **Flemo AI:** needs its own account sign-in through the CRM; the handover contains no AI session.

The database, application URLs, login secret and encryption keys remain local. The production database, production encryption keys and feedback-worker token were not imported. The detailed read-only check results are in **.local/integration-status.json**.

If startup fails, check **.local/backend-error.log**, **.local/frontend-error.log**, and **.local/postgres.log**. Ports 3001, 5173 and 54329 must be free. You can run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-demo.ps1 start` from this folder to see startup errors.

The launcher uses the compiled backend. After changing backend code, stop the demo, run `npm.cmd --prefix backend run build`, and start it again. Follow the main README for development and migrations; use this launcher's start/stop commands instead of Docker commands on this machine.

## Preview preference

Sam requested on 27 September 2026 that all test/review links open in light mode. Set the theme in fictional demo bootstraps; preserve live user theme preferences.
