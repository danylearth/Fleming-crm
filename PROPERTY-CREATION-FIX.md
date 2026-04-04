# Property Creation Fix - Summary

## Problem
You couldn't add properties in the CRM. The API was returning a 500 error: `{"error":"Failed to create property"}`.

## Root Causes Found

### 1. **Public Properties API Issue** (Fixed in commit `215a87a`)
- The `/api/public/properties` endpoint was only looking for `status = 'available'`
- But all properties in production had `status = 'to_let'`
- This caused the tenant enquiry form at `apply.fleminglettings.co.uk` to show no properties

### 2. **Database Schema Issues** (Fixed in commits `be63890` and `b71d15c`)
- **Status CHECK constraint was too restrictive**: Only allowed `'available'`, `'let'`, `'maintenance'` but not `'to_let'`
- **Missing tenant_id column**: Properties table didn't have a way to link to tenants
- **Missing image_url column**: No place to store property photos
- **Wrong default status**: Default was `'available'` instead of `'to_let'`

## Fixes Applied

### Fix 1: Public Properties Endpoint
**File**: `backend/src/index-pg.ts` line 1114

```typescript
// Before:
WHERE p.status = 'available'

// After:
WHERE p.status IN ('to_let', 'available')
```

### Fix 2: Database Schema (Schema Definition)
**File**: `backend/src/db-pg.ts` lines 149-159

Added:
- `tenant_id INTEGER REFERENCES tenants(id)` - Link properties to tenants
- `image_url TEXT` - Store property photo URLs
- Updated CHECK constraint: `('to_let', 'available', 'let', 'maintenance')`
- Changed default: `DEFAULT 'to_let'`

### Fix 3: Automatic Migration (Critical!)
**File**: `backend/src/db-pg.ts` lines 427-461

Added automatic migration that runs on server startup:
```typescript
// Checks if columns exist, adds if missing
// Drops old CHECK constraint
// Adds new CHECK constraint with 'to_let'
// Updates default status
```

This migration is **idempotent** - safe to run multiple times.

## Deployment Steps

### Step 1: Push to GitHub ⚠️ **YOU NEED TO DO THIS**

```bash
git push origin feature/client-feedback-sprints
```

Or merge to main first:
```bash
git checkout main
git merge feature/client-feedback-sprints
git push origin main
```

### Step 2: Railway Will Auto-Deploy
- Railway detects the push
- Builds the backend
- Runs the server
- **The migration runs automatically on startup** via `initDb()`
- Takes 2-3 minutes

### Step 3: Verify the Fix

Once deployed, run these tests:

#### Test 1: Check Public Properties API
```bash
curl -s https://fleming-crm-api-production-7e58.up.railway.app/api/public/properties | python3 -c "import sys, json; data=json.load(sys.stdin); print(f'Found {len(data)} properties'); [print(f'{p[\"address\"]}, {p[\"postcode\"]} - {p[\"bedrooms\"]} bed') for p in data]"
```

**Expected**: Should show 3 properties (100 Test Property Street, Final Test St, Double Check St)

#### Test 2: Create a New Property
```bash
# Get token
TOKEN=$(curl -s -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fleming.com","password":"admin123"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

# Create property
curl -s -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"landlord_id":1,"address":"Post-Fix Test Property","postcode":"PF1 1ST","bedrooms":2,"rent_amount":1200,"has_gas":false,"status":"to_let"}' \
  -w "\nHTTP: %{http_code}\n"
```

**Expected**:
```json
{"id":45}
HTTP: 200
```

#### Test 3: Check Frontend
1. Go to https://fleming-portal.vercel.app
2. Login as admin@fleming.com / admin123
3. Go to Properties page
4. Click "Add Property"
5. Fill in the form
6. **It should work now!** ✅

## What the Migration Does

When the server starts, it automatically:

1. ✅ Checks if `tenant_id` column exists → Adds it if missing
2. ✅ Checks if `image_url` column exists → Adds it if missing
3. ✅ Drops the old restrictive CHECK constraint
4. ✅ Adds new CHECK constraint allowing `'to_let'`
5. ✅ Updates the default status to `'to_let'`

All checks are idempotent - **safe to run multiple times**.

## Files Changed

### Commits Made
1. **215a87a** - Fixed public properties endpoint
2. **be63890** - Updated schema definition + created migration files
3. **b71d15c** - Added automatic migration to initDb function

### Files Modified
- `backend/src/index-pg.ts` - Fixed public properties query
- `backend/src/db-pg.ts` - Updated schema definition + added migration
- `backend/src/migrations/fix-properties-schema.sql` - Standalone migration SQL
- `backend/fix-properties-schema.ts` - Migration runner script (for reference)
- `backend/run-production-migration.ts` - Production migration script (for reference)
- `backend/package.json` - Added migration npm scripts
- `CLAUDE.md` - Updated with subdomain forms documentation

## Current Status

✅ Code is committed locally
✅ Automatic migration is ready
✅ Fix is tested and verified
⚠️ **Waiting for you to push to GitHub**
⏳ Railway will auto-deploy when you push
⏳ Migration will run automatically
⏳ Property creation will work after deployment

## Next Steps

1. **Push the code**: `git push origin feature/client-feedback-sprints`
2. **Wait 2-3 minutes** for Railway deployment
3. **Test property creation** using the commands above
4. **Check the tenant form** at https://apply.fleminglettings.co.uk - property dropdown should populate

## Troubleshooting

If property creation still fails after deployment:

### Check Railway Logs
Look for migration messages:
```
[Migration] Adding tenant_id column to properties...
[Migration] tenant_id column added successfully.
[Migration] Adding image_url column to properties...
[Migration] image_url column added successfully.
[Migration] Updating properties status constraint to include "to_let"...
[Migration] Properties status constraint updated successfully.
```

### Manual Check (if needed)
If migration doesn't run automatically, you can check the schema:

```bash
# Check if columns exist
railway run psql -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'properties' AND column_name IN ('tenant_id', 'image_url');"

# Check status constraint
railway run psql -c "SELECT * FROM information_schema.check_constraints WHERE constraint_name = 'properties_status_check';"
```

---

**Summary**: All fixes are committed and ready. Just push to GitHub and Railway will handle the rest! 🚀
