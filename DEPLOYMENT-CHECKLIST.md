# Fleming CRM Deployment Checklist

**Last Updated:** 2026-03-26

## Pre-Deployment Checklist

### 1. Run Smoke Tests (REQUIRED)
```bash
# Test against local backend
./smoke-test.sh http://localhost:3001 admin@fleming.com admin123

# Test against production backend (after deploy)
./smoke-test.sh https://fleming-crm-api-production-7e58.up.railway.app admin@fleming.com <production_password>
```

**ALL TESTS MUST PASS** before pushing to production.

### 2. Review Pending Commits
```bash
git log origin/main..HEAD --oneline
```

Verify all commits are intentional and tested.

### 3. Check for Uncommitted Changes
```bash
git status
```

No unexpected modified files should exist.

### 4. Push to GitHub
```bash
git push origin main
```

This triggers auto-deployment on Railway (backend) and Vercel (frontend).

## Post-Deployment Verification

### 1. Wait for Deployments (5-10 minutes)

**Railway (Backend):**
- Login: https://railway.app
- Check deployment status
- Review build logs for errors
- Verify migrations ran successfully

**Vercel (Frontend):**
- Login: https://vercel.com
- Check deployment status
- Review build logs
- Verify VITE_API_URL is set correctly

### 2. Run Production Smoke Tests
```bash
./smoke-test.sh https://fleming-crm-api-production-7e58.up.railway.app admin@fleming.com <password>
```

### 3. Manual Verification Checklist

#### Critical User Flows:
- [ ] Login works (admin@fleming.com)
- [ ] Dashboard loads without errors
- [ ] Create new landlord
- [ ] Create new property (with landlord selected)
- [ ] Upload property image
- [ ] Create task linked to property
- [ ] Submit tenant enquiry from public form
- [ ] View property detail page

#### Common Break Points:
- [ ] Property creation (most common failure)
- [ ] Landlord creation with company number
- [ ] Task creation with assignments
- [ ] Image upload/delete
- [ ] Bulk delete operations

### 4. Check Browser Console
- Open https://platform.fleminglettings.co.uk
- Open browser DevTools (F12)
- Console tab should have NO red errors
- Network tab should show 200 responses (not 500/404)

### 5. Check Railway Logs
```bash
# Or via Railway dashboard
railway logs --service fleming-crm-api
```

Look for:
- ✅ "[Migration] Adding image_url column to properties..."
- ✅ "Fleming CRM (PostgreSQL) running on..."
- ❌ Any SQL errors
- ❌ Any "Failed to create/update" errors

## If Deployment Fails

### Immediate Actions:
1. **DO NOT** make more changes
2. Check Railway logs for exact error
3. Check Vercel logs for build errors
4. Test affected endpoint with curl:

```bash
TOKEN=$(curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fleming.com","password":"<password>"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Test property creation
curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/properties \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"landlord_id":1,"address":"Test St","postcode":"T1 1ST","bedrooms":2,"rent_amount":1000,"has_gas":false}'
```

### Rollback Options:

**Option 1: Revert Git Commit**
```bash
git revert HEAD
git push origin main
```

**Option 2: Railway Rollback**
- Go to Railway dashboard
- Select previous successful deployment
- Click "Redeploy"

**Option 3: Vercel Rollback**
- Go to Vercel dashboard
- Deployments → Previous deployment
- Click "Promote to Production"

## Common Issues & Solutions

### Issue: Property Creation Fails
**Symptom:** "Failed to create property" error
**Cause:** INSERT statement missing columns
**Fix:** Check INSERT has all columns from CREATE TABLE
**File:** backend/src/index-pg.ts line ~1175

### Issue: Image Upload 404
**Symptom:** Uploaded image doesn't display
**Cause:** VITE_API_URL not set or wrong
**Fix:** Check Vercel env vars, redeploy frontend

### Issue: Migration Already Applied
**Symptom:** "column already exists" error
**Cause:** Migration not checking IF NOT EXISTS
**Impact:** Harmless warning, ignore

### Issue: Login Fails
**Symptom:** 401 Unauthorized
**Cause:** Database user not seeded
**Fix:** Run setup endpoint or reseed database

## Success Criteria

Deployment is successful when:
- ✅ All smoke tests pass
- ✅ No console errors on frontend
- ✅ No 500 errors in Railway logs
- ✅ Can create landlord, property, task
- ✅ Property image upload works
- ✅ Public tenant form works

## Monitoring

**First 24 Hours After Deploy:**
- Check Railway logs every 2-4 hours
- Monitor for unusual error patterns
- Test critical flows: create property, upload image

**Ongoing:**
- Weekly smoke test run
- Monthly review of audit logs
- Quarterly dependency updates

---

**Emergency Contact:**
If production is completely broken, contact development team immediately with:
1. Error message from browser console
2. Affected user flow (e.g., "can't create property")
3. Railway log screenshot
4. Steps to reproduce
