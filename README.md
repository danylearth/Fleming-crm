# Fleming Lettings CRM — Sam's local setup

This runs a separate copy of the CRM on your computer with sample records. Your normal live login and the office's live records are not copied into it. Allow about 30–45 minutes for the first installation; starting it afterwards takes about two minutes.

The latest handover is on **`codex/sept15-office-feedback`**. Use that branch rather than `main`.

## 1. Install the tools and download the project

Install **Git**, **Node.js 24.x**, and **Docker Desktop** for your computer. Start Docker Desktop and wait until its engine is running. You need GitHub access to `danylearth/Fleming-crm`.

Open Terminal on Mac or PowerShell on Windows and run:

```sh
git clone --branch codex/sept15-office-feedback https://github.com/danylearth/Fleming-crm.git
cd Fleming-crm
node --version
docker compose version
```

Node must show `v24.x.x`. Keep this terminal in the `Fleming-crm` folder; the commands below run from there.

## 2. Prepare your settings and local database

```sh
node scripts/setup-local.mjs
docker compose -f compose.local.yaml up -d --wait
npm --prefix backend ci
npm --prefix frontend ci
```

The setup command creates private `backend/.env` and `frontend/.env` files with local settings and random local passwords. It preserves existing files if run again. The database runs on your computer at port **54329** and keeps its data in a Docker volume.

If you already use PostgreSQL 16 or newer, you can create a separate empty local database instead of using Docker. Change `DATABASE_URL` in `backend/.env` to that local database before the next step. Never point the local demo at the production database: migrations, seeding and the CRM's background jobs can change records.

## 3. Create the tables and sample records

```sh
npm --prefix backend run migrate
npm --prefix backend run seed:dev
```

Run migrations before seeding. Seeding creates sample landlords, properties, enquiries and tasks, plus a local administrator:

| Login field | Value |
| --- | --- |
| Email | `admin@fleming.com` |
| Password | Copy the value after `SEED_ADMIN_PASSWORD=` from your `backend/.env` file |

The seed skips an existing database with users. Changing `SEED_ADMIN_PASSWORD` afterwards does not change an existing user's password. Do not enable `FORCE_RESEED` on a database you want to keep.

## 4. Start the CRM and sign in

In your first terminal, run:

```sh
npm --prefix backend run dev
```

Open a second terminal in the same `Fleming-crm` folder and run:

```sh
npm --prefix frontend run dev
```

Open **http://localhost:5173** and use the local login from step 3. Keep both terminals open while using the CRM. API health is available at **http://localhost:3001/api/health**.

Start by opening Properties and Enquiries to see the sample records. You can create a test landlord/property, follow an onboarding workflow and practise uploading documents. Local uploads stay in `backend/uploads`; they do not appear in the live CRM. Use sample documents for local practice.

## 5. Stop it, restart it, or get updates

Press **Ctrl+C** in each application terminal to stop the CRM. To stop the database while preserving its data:

```sh
docker compose -f compose.local.yaml stop
```

Next time, start Docker Desktop, run `docker compose -f compose.local.yaml up -d --wait`, then repeat the two start commands in step 4.

To update, stop both app terminals and run these commands from the project folder:

```sh
git pull --ff-only
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run migrate
```

Restart the apps. If Git reports local changes or a conflict, stop and ask Danyl before discarding anything. Do not use `docker compose down -v`: that deletes the local database volume.

## Documents, integrations and differences from live

**Agreement PDFs:** install LibreOffice, including Writer, to generate tenancy and landlord service agreement PDFs. The setup script detects its standard Mac and Windows installation locations when creating `backend/.env`. If installed later or elsewhere, set `LIBREOFFICE_PATH` in that file to the full path to `soffice` / `soffice.exe`, then restart the backend. On Windows, for example:

```dotenv
LIBREOFFICE_PATH="C:/Program Files/LibreOffice/program/soffice.exe"
```

**PDF reading and signatures:** install Poppler with `pdftotext` and `pdftoppm` on PATH for signed-document processing and Flemo PDF extraction. `PDFTOTEXT_PATH` overrides text extraction for Flemo only; signing still needs `pdftotext` on PATH. Arial fonts are needed to match production document layout. The setup script detects standard Windows Arial files; for another location set `PDF_ARIAL_REGULAR` and `PDF_ARIAL_BOLD` in `backend/.env`. Basic CRM browsing does not require these document tools.

**Email and SMS:** the supplied local settings leave Resend and Twilio blank and enable simulation. Messages are not delivered with these settings. Adding valid provider keys enables real sending, even if the simulation flag remains true. Keep provider keys blank for a demo.

**Banking, lookups and AI:** FreeAgent, TrueLayer, EPC and Companies House require their own configuration. Flemo's open-ended AI requires signing in through its account connection; it is not supplied by a generic API key. A fresh local database does not inherit live OAuth connections. For local OAuth testing, use separate development provider credentials and registered local callback URLs; production callbacks return to production.

**Public pages:** tenant application, landlord onboarding and signing sites are separate apps in `tenants-subdomain/` and `landlords-subdomain/`. This guide starts the staff CRM and API only. Some generated links and embedded assets still use office domains; do not use those links for a local end-to-end signing test. Background compliance/finance jobs run against the local database while the backend is open. Some public lookup features still need internet access.

The private credentials handover is supplied separately from Git. See [the configuration inventory](docs/API-KEYS.md) for which keys belong where. Do not paste server secrets into `frontend/.env`; Vite browser settings are public.

## If something does not work

| Symptom | What to do |
| --- | --- |
| `node` / `npm` is not recognised | Install Node 24, close and reopen the terminal. |
| Cannot connect to Docker / database connection refused | Start Docker Desktop and repeat step 2's database command. Check `DATABASE_URL` still points to port 54329. |
| Login says “Failed to fetch” | Check the backend terminal is running and open `/api/health` at port 3001. Check `frontend/.env` has `VITE_API_URL=http://localhost:3001`; restart Vite after edits. |
| Invalid login / missing tables | Run migrations, then `seed:dev`; use the local admin email and the generated password. Production login details do not apply. |
| Agreement generation fails | Install LibreOffice Writer, check `LIBREOFFICE_PATH`, and restart the backend. |

For an “address already in use” message, stop the other process using port 3001 or 5173 before starting the CRM again. For any other error, send Danyl the error text without including `.env` contents or passwords.

## Developer checks

```sh
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run lint
```

Use these package-specific build commands for local work. The root `npm run build` is a deployment script, not the local setup command. Database integration checks have additional requirements documented in `backend/tests/production-readiness.mjs`; never aim tests at the live database.

Handover checked on 24 September 2026 with Node 24 and a fresh native PostgreSQL 16 database: dependency installation, all 30 migrations, demo seed, development startup, administrator API login, dashboard/property/enquiry requests and both builds passed. Nine authentication tests passed. Docker Compose configuration was validated; the Docker database itself was not started on the handover machine. Windows instructions have not been tested on a Windows machine.
