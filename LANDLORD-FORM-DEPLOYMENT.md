# Landlord Enquiry Form - Subdomain Deployment Guide

## 🎯 Goal
Host the landlord enquiry form at: **`https://landlords.fleminglettings.co.uk`**

## 📋 Prerequisites
- Access to DNS management for fleminglettings.co.uk
- A hosting platform account (Vercel, Netlify, or GitHub Pages recommended)
- The form file: `public-form/landlord-enquiry.html`

---

## 🚀 Deployment Options

### **Option 1: Vercel (Recommended - Easiest)**

#### Step 1: Prepare the deployment folder
```bash
# Create a clean deployment folder
mkdir landlords-subdomain
cp public-form/landlord-enquiry.html landlords-subdomain/index.html
```

#### Step 2: Create vercel.json configuration
Create `landlords-subdomain/vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

#### Step 3: Deploy to Vercel
```bash
cd landlords-subdomain
vercel --prod
```

When prompted:
- Project name: `fleming-landlords`
- Framework: `Other`
- Output directory: `./`

#### Step 4: Add custom domain in Vercel
1. Go to your Vercel project dashboard
2. Click **Settings** → **Domains**
3. Add domain: `landlords.fleminglettings.co.uk`
4. Vercel will provide DNS records (usually CNAME)

#### Step 5: Configure DNS
Add the following DNS record in your domain registrar:

```
Type:  CNAME
Name:  landlords
Value: cname.vercel-dns.com  (or the specific value Vercel provides)
TTL:   3600 (or Auto)
```

**Wait 5-30 minutes for DNS propagation**

---

### **Option 2: Netlify**

#### Step 1: Prepare deployment
```bash
mkdir landlords-subdomain
cp public-form/landlord-enquiry.html landlords-subdomain/index.html
```

#### Step 2: Create netlify.toml
Create `landlords-subdomain/netlify.toml`:
```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
```

#### Step 3: Deploy
```bash
cd landlords-subdomain
netlify deploy --prod
```

Or use Netlify's drag-and-drop interface at https://app.netlify.com/drop

#### Step 4: Configure DNS
In Netlify dashboard:
1. Go to **Domain settings**
2. Add custom domain: `landlords.fleminglettings.co.uk`
3. Netlify will provide DNS instructions

Add CNAME record:
```
Type:  CNAME
Name:  landlords
Value: [your-site-name].netlify.app
TTL:   3600
```

---

### **Option 3: GitHub Pages**

#### Step 1: Create GitHub repository
```bash
# Create new repo on GitHub: fleming-landlords
git init landlords-subdomain
cd landlords-subdomain
cp ../public-form/landlord-enquiry.html index.html
git add .
git commit -m "Initial commit: Landlord enquiry form"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fleming-landlords.git
git push -u origin main
```

#### Step 2: Enable GitHub Pages
1. Go to repository **Settings** → **Pages**
2. Source: Deploy from branch `main` / `root`
3. Click **Save**

#### Step 3: Configure DNS
Add CNAME record:
```
Type:  CNAME
Name:  landlords
Value: YOUR_USERNAME.github.io
TTL:   3600
```

#### Step 4: Add CNAME file to repo
Create `CNAME` file in repository root:
```bash
echo "landlords.fleminglettings.co.uk" > CNAME
git add CNAME
git commit -m "Add custom domain"
git push
```

---

## 🔧 DNS Configuration Summary

Regardless of hosting platform, you'll add a DNS record like this:

### **For most hosting providers (Vercel, Netlify, etc.):**
```
Type:  CNAME
Name:  landlords
Value: [provided by hosting platform]
TTL:   3600 or Auto
```

### **If you have access to your DNS provider:**

**Common DNS Providers:**
- **Cloudflare:** DNS tab → Add record
- **GoDaddy:** DNS Management → Add
- **Namecheap:** Advanced DNS → Add New Record
- **AWS Route 53:** Hosted zones → Create record

---

## ✅ Verification Steps

### 1. Test the deployment
Once DNS propagates (5-30 minutes), visit:
```
https://landlords.fleminglettings.co.uk
```

### 2. Test form submission
1. Fill out the form with test data
2. Submit the form
3. Check the CRM BDM module for the new enquiry

### 3. Verify data in CRM
```bash
# Connect to backend database and check
sqlite3 backend/fleming.db "SELECT id, name, email, source FROM landlords_bdm ORDER BY id DESC LIMIT 1;"
```

Expected source: `Website Enquiry Form`

---

## 🔒 Security Checklist

✅ **HTTPS enabled** (automatic with Vercel/Netlify)
✅ **API endpoint uses HTTPS** (`https://fleming-crm-api-production-7e58.up.railway.app`)
✅ **CORS configured** on Railway backend
✅ **Duplicate detection** (24-hour window)
✅ **Email validation** on backend
✅ **No sensitive data** in form HTML

---

## 🧪 Testing Commands

### Test from subdomain
```bash
curl -X POST https://landlords.fleminglettings.co.uk \
  -H "Content-Type: application/json" \
  -d '{
    "registration_type": "Sole",
    "firstName": "Test",
    "surname": "Landlord",
    "email": "test@example.com",
    "phone": "07700900000",
    "address": "123 Test St",
    "postcode": "AB1 2CD",
    "propertyAddress": "456 Property Ave",
    "propertyPostcode": "CD3 4EF",
    "bedrooms": "3",
    "ownershipStructure": "Mortgaged",
    "propertyCondition": "Good"
  }'
```

### Test API endpoint directly
```bash
curl -X POST https://fleming-crm-api-production-7e58.up.railway.app/api/public/landlord-enquiries \
  -H "Content-Type: application/json" \
  -d '{
    "registration_type": "Sole",
    "firstName": "Test",
    "surname": "Landlord",
    "email": "test@example.com",
    "phone": "07700900000",
    "address": "123 Test St",
    "postcode": "AB1 2CD",
    "propertyAddress": "456 Property Ave",
    "propertyPostcode": "CD3 4EF",
    "bedrooms": "3",
    "ownershipStructure": "Mortgaged",
    "propertyCondition": "Good"
  }'
```

---

## 📊 Monitoring & Analytics

### View submissions in CRM
1. Log into CRM at `https://fleming-portal.vercel.app`
2. Navigate to **BDM** module (`/v3/bdm`)
3. Filter by source: "Website Enquiry Form"
4. All submissions will have status "new"

### Database queries
```sql
-- Count submissions by source
SELECT source, COUNT(*) as count
FROM landlords_bdm
GROUP BY source;

-- Recent submissions
SELECT id, name, email, created_at
FROM landlords_bdm
WHERE source = 'Website Enquiry Form'
ORDER BY created_at DESC
LIMIT 10;

-- Submissions by day
SELECT DATE(created_at) as date, COUNT(*) as submissions
FROM landlords_bdm
WHERE source = 'Website Enquiry Form'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🔄 Updates & Maintenance

### To update the form:
1. Edit `public-form/landlord-enquiry.html`
2. Redeploy using your chosen method:
   - **Vercel:** `vercel --prod`
   - **Netlify:** `netlify deploy --prod`
   - **GitHub Pages:** `git push`

### Version control
Consider tagging releases:
```bash
git tag -a v1.0.0 -m "Initial landlord form deployment"
git push origin v1.0.0
```

---

## 🆘 Troubleshooting

### Form doesn't load
- Check DNS propagation: `dig landlords.fleminglettings.co.uk`
- Wait 30 minutes after DNS changes
- Clear browser cache (Ctrl+Shift+R)

### Form submission fails
- Check browser console for errors (F12)
- Verify API endpoint is accessible:
  ```bash
  curl https://fleming-crm-api-production-7e58.up.railway.app/api/health
  ```
- Check CORS settings on Railway

### Duplicate submission error
- Expected behavior: prevents spam
- To reset: wait 24 hours or use different email

### Data not appearing in CRM
- Check Railway logs for errors
- Verify database connection
- Test API endpoint directly (see Testing Commands above)

---

## 📞 Support

If you encounter issues:
1. Check Railway logs for backend errors
2. Check browser console for frontend errors
3. Verify DNS configuration with `dig` or `nslookup`
4. Test API endpoint independently

---

## ✨ Features Summary

✅ **4-step multi-page form** with progress tracking
✅ **Sole and joint applications** support
✅ **Real-time validation** and error messages
✅ **Duplicate detection** (24-hour window)
✅ **Mobile responsive** design
✅ **Comprehensive data capture** in structured format
✅ **Direct CRM integration** via public API
✅ **Auto-assigns status** "new" and source "Website Enquiry Form"
✅ **Marketing consent** tracking
✅ **Professional UI** matching Fleming brand

---

## 🎉 You're Ready!

Your landlord enquiry form is now production-ready and can be deployed to `landlords.fleminglettings.co.uk` using any of the methods above.

**Recommended:** Use Vercel for the easiest setup and automatic SSL.
