# Deploy Backend Update - Landlord Enquiry Endpoint

## 🎯 Goal
Deploy the new landlord enquiry endpoint to Railway production backend

## ⚠️ Important
The landlord enquiry form requires the backend API endpoint:
```
POST /api/public/landlord-enquiries
```

This endpoint has been added to both:
- `backend/src/index.ts` (SQLite)
- `backend/src/index-pg.ts` (PostgreSQL - used by Railway)

## 🚀 Deployment Steps

### Option 1: Git Push (Automatic Deploy)

If Railway is connected to your GitHub repository:

```bash
# Stage the backend changes
git add backend/src/index.ts backend/src/index-pg.ts

# Commit with descriptive message
git commit -m "feat: add landlord enquiry public API endpoint

- Added POST /api/public/landlord-enquiries to index.ts
- Added POST /api/public/landlord-enquiries to index-pg.ts
- Endpoint accepts landlord registration form submissions
- Data saved to landlords_bdm table with status 'new'
- Includes email validation and duplicate detection
- All form data structured in notes field
- Marketing consent tracking included"

# Push to trigger Railway deployment
git push origin main
```

Railway will automatically:
1. Detect the push
2. Run build process
3. Deploy new version
4. Keep zero-downtime

**Monitor deployment:**
- Go to Railway dashboard
- Check deployment logs
- Verify successful deployment

### Option 2: Manual Railway CLI Deploy

```bash
# Install Railway CLI if not installed
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Deploy
railway up
```

### Option 3: Railway Dashboard Manual Deploy

1. Go to https://railway.app
2. Select your Fleming CRM project
3. Click on the backend service
4. Go to **Deployments** tab
5. Click **Deploy** button
6. Railway will rebuild and deploy

---

## ✅ Verify Deployment

### 1. Check Railway Logs
```bash
railway logs --follow
```

Look for:
```
[LANDLORD ENQUIRY] endpoint initialized
Server running on port XXXX
```

### 2. Test Health Endpoint
```bash
curl https://fleming-crm-api-production-7e58.up.railway.app/api/health
```

Expected response:
```json
{"status":"ok","time":"2026-03-25T..."}
```

### 3. Test Landlord Enquiry Endpoint
```bash
curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/public/landlord-enquiries \
  -H "Content-Type: application/json" \
  -d '{
    "registration_type": "Sole",
    "firstName": "Test",
    "surname": "Deploy",
    "email": "test.deploy@example.com",
    "phone": "07700900111",
    "address": "123 Test St",
    "postcode": "TE1 2ST",
    "propertyAddress": "456 Prop Ave",
    "propertyPostcode": "PR1 2OP",
    "bedrooms": "3",
    "ownershipStructure": "Mortgaged",
    "propertyCondition": "Good",
    "yearsAtAddress": "5",
    "dob": "1980-01-01",
    "nationality": "English, Welsh, Scottish, Northern Irish or British",
    "offroadParking": "Yes",
    "alreadyLet": "No",
    "mortgageAttached": "Yes",
    "lookingForNewTenant": "No",
    "epcCertificate": "Yes",
    "eicrCertificate": "Yes",
    "gasCertificate": "Yes"
  }'
```

Expected success response:
```json
{
  "success": true,
  "message": "Landlord enquiry submitted successfully",
  "enquiry_id": 1
}
```

### 4. Verify in CRM Database

If you have PostgreSQL access:
```sql
-- Check the new enquiry
SELECT id, name, email, phone, status, source, created_at
FROM landlords_bdm
ORDER BY created_at DESC
LIMIT 1;

-- Should see:
-- status: 'new'
-- source: 'Website Enquiry Form'
```

Or via Railway dashboard:
1. Go to your PostgreSQL database service
2. Open **Data** tab
3. Query the `landlords_bdm` table

---

## 🔧 Troubleshooting

### Build Fails

**Check TypeScript compilation:**
```bash
cd backend
npm run build
```

If errors occur:
- Review `index-pg.ts` for syntax errors
- Ensure all imports are correct
- Check tsconfig.render.json excludes

### Deployment Succeeds but Endpoint Not Working

**Check Railway environment variables:**
- `DATABASE_URL` - should be set to PostgreSQL connection string
- `JWT_SECRET` - should be set
- `PORT` - Railway auto-assigns

**Check which entry point Railway is using:**
Railway should use: `index-pg.js` (PostgreSQL version)

Verify in `railway.json`:
```json
{
  "deploy": {
    "startCommand": "cd backend && node dist/index-pg.js"
  }
}
```

### CORS Errors from Frontend

If you get CORS errors when testing from subdomain:

1. Check that CORS is enabled in `index-pg.ts`
2. Should have:
```typescript
app.use(cors({
  origin: true, // or specify domains
  credentials: true
}));
```

3. Redeploy if needed

### Database Connection Issues

Check Railway logs for:
```
Database connection error
PostgreSQL connection failed
```

If found:
1. Verify `DATABASE_URL` environment variable
2. Check PostgreSQL service is running
3. Restart backend service

---

## 📊 Post-Deployment Checklist

After successful deployment:

- [ ] Test health endpoint responds
- [ ] Test landlord enquiry endpoint accepts submissions
- [ ] Verify data appears in `landlords_bdm` table
- [ ] Check CRM BDM module shows new enquiries
- [ ] Test duplicate detection (submit same email twice)
- [ ] Test email validation (submit invalid email)
- [ ] Verify Railway logs show successful requests
- [ ] Update LANDLORD-FORM-DEPLOYMENT.md if needed

---

## 🔄 Rolling Back (If Needed)

If something goes wrong:

### Via Railway Dashboard:
1. Go to **Deployments** tab
2. Find previous working deployment
3. Click **Redeploy**

### Via Git:
```bash
git revert HEAD
git push origin main
```

---

## 📝 Deployment Timeline

Typical deployment takes:
- **Build:** 2-5 minutes
- **Deploy:** 1-2 minutes
- **Total:** 3-7 minutes

Railway provides zero-downtime deployment, so your existing API will remain available during the update.

---

## ✅ Success Indicators

You'll know deployment succeeded when:
1. Railway shows green "Deployed" status
2. Health endpoint responds correctly
3. Landlord enquiry endpoint returns success
4. CRM shows test submission in BDM module
5. No errors in Railway logs

---

## 🎉 Next Steps

Once backend is deployed:
1. Deploy form to `landlords.fleminglettings.co.uk` (see LANDLORD-FORM-DEPLOYMENT.md)
2. Test end-to-end flow
3. Monitor submissions in CRM
4. Set up alerts for errors (optional)

---

## 📞 Support

If deployment fails:
1. Check Railway logs for specific errors
2. Verify all files committed to git
3. Test locally first: `npm run dev:pg`
4. Check Railway environment variables
5. Contact Railway support if infrastructure issue
