# Stability Audit & Fix Plan

**Date:** 2026-03-26
**Issue:** Repeated production breaks due to schema/code mismatches

## Current Breaks Identified

### ✅ FIXED - Properties
- **Issue:** INSERT missing `amenities` column
- **Fixed in:** Commit 23ac62f
- **Status:** Ready to deploy

### ⚠️ POTENTIAL - Properties Image URL
- **Issue:** `image_url` column added via migration but NOT in CREATE TABLE base schema
- **Risk:** New deployments to fresh databases won't have `image_url` in base schema
- **Impact:** Medium (works for existing prod DB, breaks on fresh installs)

## Schema Audit Results

### Properties Table Columns (from CREATE TABLE)
```
address, amenities, bedrooms, charge_percentage, council_tax_band,
created_at, eicr_expiry_date, epc_expiry_date, epc_grade,
gas_safety_expiry_date, has_end_date, has_gas, has_live_tenancy,
id, is_leasehold, landlord_id, leasehold_end_date, leasehold_start_date,
leaseholder_info, notes, onboarded_date, postcode, proof_of_ownership_received,
property_type, rent_amount, rent_review_date, service_type, status,
tenancy_end_date, tenancy_start_date, tenancy_type, total_charge, updated_at
```

**MISSING from base schema:** `image_url` (added via migration only)

### Properties INSERT Statement Columns
```
address, amenities, bedrooms, charge_percentage, council_tax_band,
eicr_expiry_date, epc_expiry_date, epc_grade, gas_safety_expiry_date,
has_end_date, has_gas, has_live_tenancy, is_leasehold, landlord_id,
leasehold_end_date, leasehold_start_date, leaseholder_info, notes,
onboarded_date, postcode, proof_of_ownership_received, property_type,
rent_amount, rent_review_date, service_type, status, tenancy_end_date,
tenancy_start_date, tenancy_type, total_charge
```

**Total:** 30 columns
**Matches schema:** ✅ (excluding auto-generated: id, created_at, updated_at, image_url)

### Properties UPDATE Statement Allowed Fields
```
landlord_id, address, postcode, property_type, bedrooms,
is_leasehold, leasehold_start_date, leasehold_end_date, leaseholder_info,
proof_of_ownership_received, council_tax_band, service_type,
charge_percentage, total_charge, rent_amount,
has_live_tenancy, tenancy_start_date, tenancy_type, has_end_date, tenancy_end_date,
rent_review_date, eicr_expiry_date, epc_grade, epc_expiry_date,
has_gas, gas_safety_expiry_date, status, onboarded_date, notes, amenities, tenant_id
```

**Total:** 31 fields
**Extra field:** `tenant_id` (foreign key, not a property table column - stored elsewhere)

## Entities Requiring Full Audit

1. ⚠️ **Landlords** - Added `company_number` and `landlord_type` via migrations
2. ⚠️ **Tenant Enquiries** - Complex entity with many fields
3. ⚠️ **Tenants** - Large entity
4. ⚠️ **Tasks** - Simple but critical
5. ⚠️ **Maintenance** - Critical for operations

## Root Causes

### 1. Schema Drift
- Columns added via migrations but not in base CREATE TABLE
- Leads to inconsistent fresh installs vs production upgrades

### 2. Manual Column Lists
- INSERT and UPDATE statements use hardcoded field lists
- Easy to miss a field when schema changes
- No automated validation

### 3. No Testing
- Zero automated tests
- No pre-deployment smoke tests
- Production is the test environment

### 4. No Deployment Verification
- Railway auto-deploys on push
- No health checks beyond basic `/api/health`
- Breaks discovered by users

## Recommended Fixes

### Priority 1: Immediate Stability (Today)

1. **Move migrations into base schema**
   - Add `image_url` to properties CREATE TABLE
   - Add `company_number`, `landlord_type` to landlords CREATE TABLE
   - Remove redundant migrations

2. **Audit all entity endpoints**
   - Check landlords CREATE/UPDATE
   - Check tenant_enquiries CREATE/UPDATE
   - Check tenants CREATE/UPDATE
   - Document mismatches

3. **Create smoke test script**
   - Test all critical CRUD operations
   - Run before pushing to main
   - Catches schema mismatches

### Priority 2: Medium Term (This Week)

1. **Add basic integration tests**
   - Test property creation
   - Test landlord creation
   - Test tenant enquiry submission
   - Run in CI/CD

2. **Add deployment health checks**
   - Test endpoints after Railway deploy
   - Alert on failures
   - Rollback option

3. **Schema validation utility**
   - Compare database schema vs INSERT/UPDATE statements
   - Run as pre-commit hook
   - Fail if mismatch detected

### Priority 3: Long Term (Next Sprint)

1. **Use ORM or query builder**
   - Sequelize, TypeORM, or Kysely
   - Auto-generates INSERT/UPDATE from models
   - Type-safe queries
   - No manual column lists

2. **Comprehensive test suite**
   - Unit tests for all endpoints
   - Integration tests for workflows
   - E2E tests for critical paths

3. **Staging environment**
   - Test deployments before production
   - Mirror production database schema
   - Validate migrations

## Immediate Action Plan

**Step 1:** Fix image_url schema drift (5 min)
**Step 2:** Audit landlords endpoint (10 min)
**Step 3:** Create smoke test script (20 min)
**Step 4:** Document all entities (15 min)
**Step 5:** Push stability fixes (5 min)

**Total:** ~55 minutes to production-ready stability

## Success Criteria

- ✅ All entity CREATE endpoints work
- ✅ All entity UPDATE endpoints work
- ✅ Fresh database installs work
- ✅ Migrations apply cleanly
- ✅ Smoke tests pass
- ✅ No production breaks for 1 week

---

**Next Action:** Fix image_url schema drift + audit landlords
