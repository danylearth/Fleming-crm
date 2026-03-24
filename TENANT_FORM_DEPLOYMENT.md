## Fleming Lettings - Tenant Enquiry Form Deployment Guide

**CRITICAL:** This form is your lead capture system. All submissions go directly into the CRM database.

---

## 🎯 Overview

The tenant enquiry form is a **public-facing form** that will be hosted on a subdomain of fleminglettings.co.uk (e.g., `form.fleminglettings.co.uk` or `enquiry.fleminglettings.co.uk`).

When a potential tenant submits the form:
1. ✅ Data is instantly saved to your CRM database
2. ✅ Applicant receives a confirmation email
3. ✅ Fleming Lettings team receives a notification email
4. ✅ Enquiry appears in the CRM under "Tenant Enquiries" with status `new`

---

## 📁 Files Created

### Backend Files

1. **`backend/src/routes/public-tenant-enquiry.ts`**
   - Public API endpoint (no authentication required)
   - Handles form submissions
   - Sends confirmation and notification emails
   - **Endpoint:** `POST /api/public/tenant-enquiry`

2. **`backend/src/migrations/add-tenant-enquiry-form-fields.sql`**
   - Database migration to add all form fields
   - Extends `tenant_enquiries` table

3. **`backend/src/run-migration.ts`**
   - Migration runner script
   - Run once to update database schema

### Frontend Files

1. **`frontend/public/tenant-enquiry-form.html`**
   - **Standalone HTML file** with embedded CSS and JavaScript
   - **No build process required** - ready to deploy as-is
   - Matches Fleming Lettings brand design perfectly
   - Fully responsive (mobile-friendly)
   - File location: `/Users/danyl/Downloads/Fleming CRM/frontend/public/tenant-enquiry-form.html`

### Documentation Files

1. **`TENANT_FORM_SPEC.md`**
   - Complete form specification
   - Field definitions and validation rules

2. **`TENANT_FORM_DEPLOYMENT.md`** (this file)
   - Deployment instructions

---

## 🚀 Deployment Steps

### Step 1: Update the Database Schema

Run the migration to add all new fields to the `tenant_enquiries` table.

**Option A: Using Railway CLI (Recommended)**

```bash
# Navigate to backend directory
cd backend

# Install dependencies if not already installed
npm install

# Set your DATABASE_URL environment variable
export DATABASE_URL="your-railway-postgresql-url"

# Run the migration
npx ts-node src/run-migration.ts
```

**Option B: Manually via Railway Dashboard**

1. Go to Railway dashboard: https://railway.app
2. Select your Fleming CRM project
3. Click on your PostgreSQL database
4. Click "Query" tab
5. Copy and paste the contents of `backend/src/migrations/add-tenant-enquiry-form-fields.sql`
6. Click "Run Query"

**Option C: Using pgAdmin or psql**

```bash
psql $DATABASE_URL -f backend/src/migrations/add-tenant-enquiry-form-fields.sql
```

---

### Step 2: Deploy Backend Changes to Railway

The backend changes need to be deployed to Railway (where your API is hosted).

```bash
# From project root
cd backend

# Commit changes
git add .
git commit -m "feat: add public tenant enquiry form API endpoint with extended schema"

# Push to Railway (this triggers automatic deployment)
git push origin main
```

**Verify Backend Deployment:**

1. Check Railway logs to ensure deployment succeeded
2. Test the public endpoint:

```bash
curl https://fleming-crm-api-production-7e58.up.railway.app/api/public/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "Fleming Lettings - Tenant Enquiry API",
  "version": "1.0.0",
  "timestamp": "2025-03-24T..."
}
```

---

### Step 3: Set Environment Variables (Railway)

Add these environment variables in your Railway project:

1. Go to Railway dashboard
2. Select your Fleming CRM backend service
3. Click "Variables" tab
4. Add/update:

```bash
# Frontend URL (for email links)
FRONTEND_URL=https://fleming-portal.vercel.app

# Email notification recipient
ENQUIRY_NOTIFICATION_EMAIL=admin@fleming.com  # Change to your actual email

# Resend API key (for sending emails)
RESEND_API_KEY=your-resend-api-key  # If not already set
```

---

### Step 4: Deploy the Form to a Subdomain

You need to host the HTML file on a subdomain of fleminglettings.co.uk.

**Recommended Options:**

#### **Option A: Netlify (Easiest - Recommended)**

1. Create a new folder locally:
```bash
mkdir fleming-form
cd fleming-form
```

2. Copy the HTML file:
```bash
cp "/Users/danyl/Downloads/Fleming CRM/frontend/public/tenant-enquiry-form.html" index.html
```

3. Deploy to Netlify:
   - Go to https://app.netlify.com/
   - Drag and drop the `fleming-form` folder
   - Netlify will give you a URL like `random-name.netlify.app`

4. Configure custom domain in Netlify:
   - Go to Site settings → Domain management
   - Add custom domain: `form.fleminglettings.co.uk`
   - Netlify will provide DNS settings

5. Update DNS at your domain registrar:
   - Add CNAME record: `form` → `random-name.netlify.app`

#### **Option B: Vercel**

1. Create a new folder:
```bash
mkdir fleming-form
cd fleming-form
cp "/Users/danyl/Downloads/Fleming CRM/frontend/public/tenant-enquiry-form.html" index.html
```

2. Deploy:
```bash
npx vercel --prod
```

3. Add custom domain in Vercel dashboard:
   - Go to project settings → Domains
   - Add `form.fleminglettings.co.uk`
   - Update DNS at your registrar

#### **Option C: WordPress Site (Current Host)**

If fleminglettings.co.uk is hosted on WordPress:

1. Go to WordPress dashboard
2. Create a new page
3. Switch to "Custom HTML" block or "Code Editor"
4. Paste the entire contents of `tenant-enquiry-form.html`
5. Publish page
6. Set URL to `/tenant-enquiry-form/` or create subdomain

**⚠️ Important:** If using WordPress, make sure the HTML isn't modified by WordPress filters. Use a plugin like "Insert Headers and Footers" or "Code Snippets" to inject the raw HTML.

---

### Step 5: Test the Complete Flow

**Test Form Submission:**

1. Open the form: `https://form.fleminglettings.co.uk` (or your chosen subdomain)
2. Fill out all required fields
3. Submit the form
4. **Check that:**
   - ✅ Success message appears
   - ✅ Confirmation email received (check applicant's email)
   - ✅ Notification email received (check your admin email)
   - ✅ Enquiry appears in CRM: https://fleming-portal.vercel.app/v3/tenant-enquiries
   - ✅ All data is correctly saved in the database

**Test Different Scenarios:**

1. **Single Applicant:**
   - Select "Sole" registration type
   - Submit form
   - Verify `is_joint_application = 0` in database

2. **Joint Applicant:**
   - Select "Joint" registration type
   - Fill Applicant 2 fields
   - Submit form
   - Verify `is_joint_application = 1` and Applicant 2 data is saved

3. **Employment Details:**
   - Test "Yes" to providing further information (shows employment fields)
   - Test "No" (hides employment fields)

4. **With Pets:**
   - Select "Yes" for pets
   - Verify pet details field appears and data is saved

5. **Duplicate Submission:**
   - Submit same email within 24 hours
   - Should show error: "A recent enquiry with this email already exists"

---

## 🔒 Security Features

The public API endpoint includes:

✅ **Input Validation:** Required fields, email format, max lengths
✅ **Duplicate Prevention:** Prevents duplicate submissions within 24 hours
✅ **SQL Injection Protection:** Parameterized queries
✅ **Rate Limiting:** (Consider adding with express-rate-limit)
✅ **CORS Protection:** Only allows requests from fleminglettings.co.uk domains
✅ **IP Logging:** Tracks submission IP for audit trail
✅ **GDPR Compliance:** Consent checkboxes required

---

## 📧 Email Configuration

Emails are sent via **Resend** (configured in `backend/src/email.ts`).

**Two emails are sent on form submission:**

1. **Confirmation Email to Applicant**
   - Subject: "Thank you for your enquiry - Fleming Lettings"
   - Contains enquiry reference number
   - Link to view properties
   - Fleming branding (pink/purple)

2. **Notification Email to Fleming Team**
   - Subject: "New Tenant Enquiry - [Name] (#ENQ-[ID])"
   - Full enquiry details
   - Direct link to view in CRM
   - Action required notice

**To configure:**

1. Ensure `RESEND_API_KEY` is set in Railway environment variables
2. Update `ENQUIRY_NOTIFICATION_EMAIL` to your team's email address
3. Optionally customize email templates in `backend/src/routes/public-tenant-enquiry.ts`

---

## 🗄️ Database Schema

The `tenant_enquiries` table now includes:

**Applicant 1 Fields:**
- Basic info: `first_name_1`, `last_name_1`, `email_1`, `phone_1`, `current_address_1`, `postcode_1`
- Demographics: `date_of_birth_1`, `nationality_1`, `years_at_address_1`
- Employment: `employment_status_1`, `industry_of_employment_1`, `job_title_1`, `years_in_employment_1`, `annual_salary_1`, `position_type_1`

**Applicant 2 Fields** (conditional):
- Same structure with `_2` suffix

**Property Requirements:**
- `preferred_location`, `bedrooms`, `monthly_rent_budget`, `move_in_date`
- `property_type` (JSON array), `has_pets`, `pet_details`, `additional_requirements`

**Additional:**
- `referral_source`, `comments`, `gdpr_consent`, `marketing_consent`
- `form_submission_ip`, `form_submission_user_agent`, `form_version`

**Status Field:**
- Default: `new`
- Workflow: `new` → `viewing_booked` → `onboarding` → `converted` or `rejected`

---

## 🔗 API Endpoints

### **POST /api/public/tenant-enquiry**

**Public endpoint (no authentication required)**

**Request Body:** (JSON)
```json
{
  "registration_type": "Sole",
  "FirstName": "John",
  "Surname": "Doe",
  "address": "123 Main Street",
  "Postcode": "AB12 3CD",
  "yearofaddress": "2",
  "dob": "1990-01-01",
  "form_email": "john.doe@example.com",
  "contactNumber": "07700900000",
  "Nationality": "English, Welsh, Scottish, Northern Irish or British",
  "EmploymentStatus": "Full-Time Employed",
  "furtherinformation": "Yes",
  "IndustryofEmployment": "Healthcare",
  "job_title": "Nurse",
  "YearsinEmployment": "5",
  "AnnualSalary": "35000",
  "position": "Permanent position",
  "preferred_location": "City Centre",
  "bedrooms": "2",
  "monthly_rent_budget": "1200",
  "move_in_date": "2025-05-01",
  "pets": "No",
  "referral_source": "Google Search",
  "gdpr_consent": true,
  "marketing_consent": false
}
```

**Success Response:** (201 Created)
```json
{
  "success": true,
  "message": "Thank you! Your enquiry has been received. We will be in touch shortly.",
  "enquiry_id": 42,
  "reference": "ENQ-42"
}
```

**Error Response:** (400/409/500)
```json
{
  "success": false,
  "message": "Error message here"
}
```

### **GET /api/public/health**

**Health check endpoint**

**Response:**
```json
{
  "status": "ok",
  "service": "Fleming Lettings - Tenant Enquiry API",
  "version": "1.0.0",
  "timestamp": "2025-03-24T12:00:00.000Z"
}
```

---

## 🎨 Customization

### Update API URL (if needed)

If your backend API URL changes, update the `API_URL` constant in the HTML file:

```javascript
// Line ~850 in tenant-enquiry-form.html
const API_URL = 'https://your-new-api-url.com/api/public/tenant-enquiry';
```

### Update Colors

The form uses Fleming brand colors:
- Pink: `#DC006D`
- Purple: `#25073B`
- Background: `#eeeeee`

To change colors, search and replace hex codes in the `<style>` section.

### Add Google Analytics / Tracking

Add tracking code in the `<head>` section:

```html
<head>
    <!-- ... existing head content ... -->

    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'GA_MEASUREMENT_ID');
    </script>
</head>
```

---

## 📊 Monitoring & Analytics

### Check Form Submissions in CRM

1. Log in to CRM: https://fleming-portal.vercel.app
2. Navigate to: **Tenant Enquiries** (V3)
3. View all enquiries with status `new`
4. Click on enquiry to see full details
5. Follow up and update status through workflow

### Database Queries

**Count total enquiries:**
```sql
SELECT COUNT(*) FROM tenant_enquiries;
```

**Count enquiries by status:**
```sql
SELECT status, COUNT(*) FROM tenant_enquiries GROUP BY status;
```

**Recent enquiries (last 7 days):**
```sql
SELECT * FROM tenant_enquiries
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

**Enquiries with property budget:**
```sql
SELECT first_name_1, last_name_1, email_1, monthly_rent_budget, bedrooms
FROM tenant_enquiries
WHERE monthly_rent_budget IS NOT NULL
ORDER BY monthly_rent_budget DESC;
```

### Monitor API Health

Set up monitoring for the public endpoint:

**Using Uptime Robot:**
1. Go to https://uptimerobot.com
2. Add new monitor: `https://fleming-crm-api-production-7e58.up.railway.app/api/public/health`
3. Set check interval: 5 minutes
4. Add alert contacts

---

## 🐛 Troubleshooting

### Form Not Submitting

**Check:**
1. ✅ Browser console for JavaScript errors
2. ✅ Network tab: Is request reaching API?
3. ✅ API response: What error is returned?
4. ✅ CORS: Is request blocked due to origin?

**Common Issues:**
- **CORS Error:** Add subdomain to CORS allowed origins in `backend/src/index-pg.ts`
- **Network Error:** Check Railway API is running
- **500 Error:** Check Railway logs for backend errors

### Emails Not Sending

**Check:**
1. ✅ `RESEND_API_KEY` environment variable is set
2. ✅ API key is valid and active
3. ✅ `ENQUIRY_NOTIFICATION_EMAIL` is set correctly
4. ✅ Check Railway logs for email errors

**Note:** If email fails, the enquiry is STILL saved to database. Email is non-blocking.

### Data Not Appearing in CRM

**Check:**
1. ✅ Database connection: Run health check
2. ✅ Migration ran successfully: Check table schema
3. ✅ API response: Did it return `success: true`?
4. ✅ Query database directly: `SELECT * FROM tenant_enquiries ORDER BY id DESC LIMIT 5;`

### Duplicate Detection Not Working

**Check:**
1. ✅ Time window: Duplicate check is 24 hours
2. ✅ Email match: Must be exact email match
3. ✅ Database query: Check for SQL errors in logs

---

## 🔐 Production Checklist

Before going live, ensure:

- [ ] Database migration ran successfully
- [ ] Backend deployed to Railway and running
- [ ] Environment variables set (`FRONTEND_URL`, `ENQUIRY_NOTIFICATION_EMAIL`, `RESEND_API_KEY`)
- [ ] CORS configured for subdomain
- [ ] Form HTML deployed to subdomain
- [ ] Custom domain DNS configured
- [ ] SSL certificate active (HTTPS)
- [ ] Test form submission end-to-end
- [ ] Confirmation email received
- [ ] Notification email received
- [ ] Data appears in CRM
- [ ] Duplicate prevention tested
- [ ] Mobile responsiveness tested
- [ ] Form validation tested (required fields, email format)
- [ ] Error handling tested (network errors, API errors)
- [ ] Analytics/tracking code added (optional)
- [ ] Uptime monitoring configured (optional)

---

## 📞 Support

If you encounter issues:

1. **Check Railway logs:** https://railway.app → Your Project → Deployments → Logs
2. **Check browser console:** Right-click → Inspect → Console tab
3. **Test API directly:** Use Postman or curl to test endpoints
4. **Check database:** Query tenant_enquiries table directly

---

## 🎉 Success!

Once deployed, your tenant enquiry form will:

✅ **Capture leads 24/7** from the Fleming Lettings website
✅ **Store all data securely** in your CRM database
✅ **Send instant confirmations** to applicants
✅ **Notify your team** of new enquiries
✅ **Integrate seamlessly** with your existing CRM workflow

**No more lost leads!** 🚀

---

## Next Steps (Optional Enhancements)

1. **Add reCAPTCHA** to prevent spam submissions
2. **Add rate limiting** (express-rate-limit) to prevent abuse
3. **Create thank you page** redirect after successful submission
4. **Add property search integration** to pre-filter properties
5. **Create webhook** for Slack/Teams notifications
6. **Build dashboard** for form analytics (conversion rates, popular locations, etc.)
7. **Add file upload** for documents (ID, proof of income)
8. **Implement SMS notifications** using Twilio

---

**Document Version:** 1.0
**Last Updated:** March 24, 2026
**Maintained By:** Fleming Lettings Development Team
