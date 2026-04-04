# How to Deploy to Railway

## Option 1: Via Railway Dashboard (Recommended)

### Step 1: Push to GitHub
```bash
git push origin feature/client-feedback-sprints
```

### Step 2: Trigger Deployment in Railway
1. Go to https://railway.app
2. Click on your project: **fleming-crm-api-production**
3. Click on the **backend service**
4. Click the **"Deploy"** or **"Redeploy"** button in the top right
5. Wait 2-3 minutes for deployment

### Step 3: Check Logs
In the Railway dashboard, click "View Logs" to see:
```
[Migration] Adding tenant_id column to properties...
[Migration] tenant_id column added successfully.
[Migration] Adding image_url column to properties...
[Migration] image_url column added successfully.
[Migration] Updating properties status constraint to include "to_let"...
[Migration] Properties status constraint updated successfully.
```

---

## Option 2: Via Railway CLI

### Install Railway CLI
```bash
# macOS
brew install railway

# Or using npm
npm i -g @railway/cli
```

### Login to Railway
```bash
railway login
```

### Link to Project
```bash
railway link
# Select: fleming-crm-api-production
```

### Deploy
```bash
railway up
```

Or deploy from the backend directory:
```bash
cd backend
railway up
```

---

## Option 3: Enable GitHub Auto-Deployments

### Connect Railway to GitHub
1. Go to https://railway.app
2. Click on your project
3. Click on the backend service
4. Go to **Settings** tab
5. Under **Service Source**, click **"Connect Repo"**
6. Select your GitHub repo: **danylearth/Fleming-crm**
7. Select branch: **feature/client-feedback-sprints** (or **main**)
8. Click **"Deploy Now"**

Now Railway will auto-deploy on every push! 🎉

---

## After Deployment: Verify the Fix

### Test 1: Check Migration Logs
Look for these lines in Railway logs:
```
✅ [Migration] tenant_id column added successfully.
✅ [Migration] image_url column added successfully.
✅ [Migration] Properties status constraint updated successfully.
```

### Test 2: Check Public Properties API
```bash
curl -s https://fleming-crm-api-production-7e58.up.railway.app/api/public/properties
```

Should return 3 properties.

### Test 3: Create a Property
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
  -d '{"landlord_id":1,"address":"Deployment Test Property","postcode":"DT1 1ST","bedrooms":2,"rent_amount":1200,"has_gas":false,"status":"to_let"}'
```

Should return: `{"id":XX}` with HTTP 200

---

## Recommended Flow

1. **Push to GitHub** (required for all options)
2. **Use Railway Dashboard** to trigger deployment (easiest)
3. **Watch the logs** to confirm migration ran
4. **Test property creation** in the frontend

That's it! 🚀
