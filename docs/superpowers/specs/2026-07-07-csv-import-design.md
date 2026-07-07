# CSV Import Feature — Design

**Date:** 2026-07-07
**Status:** Approved

## Purpose

Let staff upload a CSV on the Tenant Enquiries, Landlords, or Properties list pages and bulk-create records, with auto-detected column mapping (Tally exports map with zero clicks), manual mapping override, and skip-and-report duplicate handling.

## Architecture (Approach B — client wizard + bulk endpoint)

The browser parses the CSV and runs the mapping UI. Mapped rows are sent as JSON to one new backend endpoint that validates, duplicate-checks, and inserts in a single transaction, returning a per-row report.

```
CSV file → utils/csv.ts (parse) → CsvImport wizard (map → preview)
        → POST /api/import/:entity {rows} → transaction insert + dup skip
        → {inserted, skipped: [{row, reason}]} → summary shown to user
```

## Frontend

### New files
- `frontend/src/utils/csv.ts` — RFC4180 parser (quoted fields, embedded commas/newlines, CRLF). Exports `parseCsv(text): string[][]`.
- `frontend/src/utils/csv.test.ts` — unit tests for parser edge cases.
- `frontend/src/utils/importConfig.ts` — per-entity field definitions (see below) + `autoDetect(headers, fields)` matcher. Exports tested.
- `frontend/src/utils/importConfig.test.ts` — auto-detect tests including the real Tally headers.
- `frontend/src/components/ui/CsvImport.tsx` — modal wizard, 3 steps.

### Changed files (surgical: one button each)
- `frontend/src/pages/Enquiries.tsx` — "Import CSV" button beside "Add Enquiry".
- `frontend/src/pages/Landlords.tsx` — beside "Add Landlord".
- `frontend/src/pages/Properties.tsx` — beside "Add Property".

### Wizard steps
1. **Upload** — file input (`.csv`), read as text, parse. Empty file / no data rows → inline error.
2. **Map** — one row per CRM field: label, required badge, dropdown of CSV headers (+ "— skip —"). Pre-selected by auto-detect. Next disabled until all required fields mapped.
3. **Preview & import** — table of first 5 mapped rows; count of rows missing required values (these will be skipped). Import button → POST → summary panel: inserted count, skipped list with row numbers and reasons. Close → refresh list.

### Auto-detect
Normalize header: lowercase, strip non-alphanumerics. Exact-match against per-field alias lists (also normalized). First unclaimed header wins; each header maps to at most one field.

### Field definitions

**tenant-enquiries** — required: `first_name_1` (aliases: first name, forename), `last_name_1` (last name, surname), `email_1` (email, email address). Optional: `phone_1` (phone, phone number, mobile, contact number), `date_of_birth_1` (dob, date of birth, what is your date of birth), `nationality_1` (nationality, what is your nationality), `current_address_1` (address, current address, where do you currently live), `employment_status_1` (employment status, what is your current employment status), `employer_1` (employer, occupation, company, please specify your current occupation and employer), `income_1` (income, annual income, salary), `preferred_tenancy_type` (tenancy type, is this for long term rent 12 months or short term rent 311 months), `preferred_property_type` (property type, is it a house an apartment or a studio), `notes` (notes, additional information, please provide any additional information or questions you have for us).

**landlords** — required: `name` (name, landlord name, full name). Optional: `email`, `phone` (phone, mobile, contact number), `address`, `home_address`, `entity_type` (entity type, landlord type), `company_number`.

**properties** — required: `address` (address, property address, street address), `landlord` (landlord, landlord name, landlord email, owner) — resolved server-side. Optional: `postcode`, `property_type` (property type, type), `bedrooms`, `rent_amount` (rent, monthly rent, rent amount), `notes`.

### Transforms (minimal, applied client-side before send)
- All values: trim.
- Phone fields: strip leading `'` (spreadsheet artifact).
- Date fields: `slice(0, 10)` when value matches ISO datetime.
- No income-unit heuristics or other data cleanup — imports data as given.

## Backend

### New endpoint (in `backend/src/index-pg.ts`, following existing inline-route style)

`POST /api/import/:entity` — `authMiddleware`.

- `entity` must be one of `tenant-enquiries`, `landlords`, `properties`; else 400.
- Body `{rows: [{field: value}]}`; max 1,000 rows, else 400.
- Per-entity column whitelist — unknown keys ignored.
- Rows missing required fields → skipped with reason.
- **Duplicate rules** (checked against DB, case-insensitive where sensible):
  - tenant-enquiries: existing `tenant_enquiries` row with same email or phone.
  - landlords: same email, or same name (exact, case-insensitive).
  - properties: same address + postcode.
  - Rows duplicating an earlier row in the same file are also skipped.
- **Properties landlord resolution:** row's `landlord` value matched against landlords by email (case-insensitive) or exact name. No match → skip with `landlord not found: <value>`. Never auto-creates landlords.
- All inserts in one transaction (`BEGIN`/`COMMIT`); a skipped row never aborts the import; an unexpected DB error rolls back everything (500).
- Response: `{inserted: n, skipped: [{row: i, reason: string}]}` (`row` is 1-based data-row index).
- One `logAudit(userId, email, 'create', '<entity>-import', null, {inserted, skipped: skipped.length})` per import.

Inserted enquiries get `status='new'`; properties get `status` default and `landlord_id` from resolution; landlords insert with given fields only.

## Error handling
- Client: unparseable/empty CSV → inline error at step 1; network/500 → error banner on step 3, nothing partially imported (transaction).
- Server: bad entity / oversized payload → 400 with message; per-row issues are skips, not errors.

## Testing / verification
1. `frontend`: vitest for `csv.ts` (quoted fields, embedded newlines, CRLF, trailing newline) and `importConfig.ts` auto-detect (real Tally headers map to expected fields).
2. Manual E2E in dev preview:
   - Re-import the real Tally CSV via the wizard → auto-detect pre-maps all fields → result: 0 inserted, all rows skipped as duplicates (validates mapping + dup check against previously imported data).
   - Import a 3-row landlords CSV → 3 inserted. Re-import → 3 skipped.
   - Import a properties CSV referencing those landlords by name + one unknown landlord → known rows link (`landlord_id` set, visible on landlord page), unknown row skipped with reason.

## Non-features (explicitly out of scope)
No upsert/update mode, no import history UI, no xlsx, no background jobs, no saved mapping templates, no tenant/BDM import, no auto-creation of referenced landlords.
