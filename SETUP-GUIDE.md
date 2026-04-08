# Fleming CRM - Complete Setup Guide

Step-by-step instructions for setting up every API, service, and endpoint needed to make all features work in production.

---

## Table of Contents

1. [Railway Environment Variables](#1-railway-environment-variables)
2. [Database (PostgreSQL)](#2-database-postgresql)
3. [JWT Secret](#3-jwt-secret)
4. [Email - Resend](#4-email---resend)
5. [SMS - Twilio](#5-sms---twilio)
6. [EPC Lookup](#6-epc-lookup-free)
7. [Companies House](#7-companies-house-free)
8. [Council Tax Lookup](#8-council-tax-lookup-paid)
9. [Vercel Environment Variables](#9-vercel-environment-variables)
10. [Webhook Configuration](#10-webhook-configuration)
11. [DNS & Domains](#11-dns--domains)
12. [Quick Reference Table](#12-quick-reference-table)

---

## 1. Railway Environment Variables

All backend environment variables are set in the Railway dashboard:

**Railway Dashboard > Your Service > Variables**

You'll be adding variables throughout this guide. Each section tells you exactly what to add.

---

## 2. Database (PostgreSQL)

**Status:** Already configured if the CRM loads and you can log in.

Railway provisions a PostgreSQL database automatically. The `DATABASE_URL` should already be set.

**To verify:**
```bash
curl https://fleming-crm-api-production-7e58.up.railway.app/api/health
# Should return: {"status":"ok","time":"..."}
```

**If starting fresh:**
1. In Railway, click **+ New** > **Database** > **PostgreSQL**
2. Railway auto-sets `DATABASE_URL` on your service
3. The backend auto-creates all tables on first start
4. Create the admin user:
```bash
curl -X POST https://YOUR-RAILWAY-URL/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fleming.com","password":"admin123","name":"Admin User"}'
```

| Variable | Value | Required |
|----------|-------|----------|
| `DATABASE_URL` | `postgresql://...` (auto-set by Railway) | Yes |

---

## 3. JWT Secret

**What it does:** Signs authentication tokens. Without a custom secret, anyone who knows the default could forge admin tokens.

**Setup:**
1. Generate a random secret:
   ```bash
   openssl rand -hex 32
   ```
2. In Railway Variables, add:

| Variable | Value | Required |
|----------|-------|----------|
| `JWT_SECRET` | `(paste your random string)` | Yes (for security) |

---

## 4. Email - Resend

**What it does:** Sends all transactional emails — holding deposit requests, application form links, onboarding emails, viewing confirmations.

**Without it:** Emails are simulated (logged to console, not actually sent). The "Send Email" buttons in the CRM will appear to work but no email is delivered.

### Step 1: Create a Resend account
1. Go to https://resend.com and sign up
2. From the dashboard, copy your **API Key** (starts with `re_`)

### Step 2: Verify your domain (recommended)
1. In Resend dashboard, go to **Domains** > **Add Domain**
2. Add `fleminglettings.co.uk`
3. Resend gives you DNS records to add (TXT, MX, CNAME)
4. Add these records in your DNS provider (mysecurecloudhost.com)
5. Wait for verification (usually 5-30 minutes)

### Step 3: Set up webhook for delivery tracking (optional)
1. In Resend dashboard, go to **Webhooks** > **Add Webhook**
2. Set endpoint URL: `https://fleming-crm-api-production-7e58.up.railway.app/api/email/webhook`
3. Select events: `email.delivered`, `email.bounced`, `email.opened`, `email.clicked`, `email.failed`
4. Copy the **Signing Secret** (starts with `whsec_`)

### Step 4: Add to Railway Variables

| Variable | Value | Required |
|----------|-------|----------|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxx` | Yes (for emails) |
| `EMAIL_FROM` | `Fleming Lettings <noreply@fleminglettings.co.uk>` | Recommended |
| `RESEND_WEBHOOK_SECRET` | `whsec_xxxxxxxxxxxx` | Optional (for delivery tracking) |
| `ENQUIRY_NOTIFICATION_EMAIL` | `info@fleminglettings.co.uk` | Optional (defaults to admin@fleming.com) |

### Features unlocked:
- Holding deposit request emails from onboarding wizard
- Application form email with link
- Viewing confirmation emails
- Rent reminder emails
- Email delivery status tracking (opened, bounced, etc.)

---

## 5. SMS - Twilio

**What it does:** Sends and receives SMS messages — viewing confirmations, follow-up reminders, rejection notifications, rent reminders, inbound message handling.

**Without it:** SMS sends are simulated (logged to console). The SMS compose box and send buttons will appear to work but no SMS is sent.

### Step 1: Create a Twilio account
1. Go to https://www.twilio.com and sign up
2. Complete the verification process

### Step 2: Get a UK phone number
1. In Twilio console, go to **Phone Numbers** > **Buy a Number**
2. Search for a UK number (+44)
3. Purchase a number with SMS capability
4. Note the number in E.164 format (e.g., `+441902212415`)

### Step 3: Get your credentials
1. Go to **Account** > **API Keys & Tokens**
2. Copy your **Account SID** (starts with `AC`)
3. Copy your **Auth Token**

### Step 4: Configure webhooks for inbound SMS
1. In Twilio console, go to **Phone Numbers** > click your number
2. Under **Messaging** > **A Message Comes In**:
   - Set webhook URL: `https://fleming-crm-api-production-7e58.up.railway.app/api/sms/inbound`
   - Method: HTTP POST

### Step 5: Add to Railway Variables

| Variable | Value | Required |
|----------|-------|----------|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxx` | Yes (for SMS) |
| `TWILIO_AUTH_TOKEN` | `(your auth token)` | Yes (for SMS) |
| `TWILIO_PHONE_NUMBER` | `+441902212415` | Yes (for SMS) |
| `BASE_URL` | `https://fleming-crm-api-production-7e58.up.railway.app` | Yes (for SMS delivery callbacks) |

### Features unlocked:
- SMS viewing confirmations when booking viewings
- SMS follow-up messages
- SMS rejection notifications
- SMS rent reminders
- Inbound SMS reception (tenant replies appear in CRM)
- SMS delivery status tracking (sent, delivered, failed)

---

## 6. EPC Lookup (Free)

**What it does:** Looks up Energy Performance Certificate data for properties by postcode — energy rating, certificate date, recommendations.

**Without it:** The EPC lookup button on property pages returns a "not configured" error.

### Setup:
1. Go to https://epc.opendatacommunities.org
2. Click **Sign Up** / **Register**
3. Verify your email
4. Once logged in, you'll have an email and API key (often your email is the key, authenticated via Basic Auth)

### Add to Railway Variables:

| Variable | Value | Required |
|----------|-------|----------|
| `EPC_API_KEY` | `(your API token)` | Optional |
| `EPC_API_EMAIL` | `(your registered email)` | Optional (paired with key) |

### Features unlocked:
- Auto-populate EPC rating on property detail pages
- EPC expiry date tracking for compliance

---

## 7. Companies House (Free)

**What it does:** Searches and verifies UK company details — company name, number, registered address, status, officers.

**Without it:** The Companies House lookup on landlord pages (for company landlords) returns a "not configured" error.

### Setup:
1. Go to https://developer.company-information.service.gov.uk
2. Sign in with a GOV.UK account (or create one)
3. Register an application
4. Create an **API Key** (REST API key)

### Add to Railway Variables:

| Variable | Value | Required |
|----------|-------|----------|
| `COMPANIES_HOUSE_API_KEY` | `(your API key)` | Optional |

### Features unlocked:
- Company search when creating company landlords
- Auto-fill company details (number, address, status)
- Director information lookup

---

## 8. Council Tax Lookup (Paid)

**What it does:** Looks up council tax band, annual/monthly tax amount, and council information for properties.

**Without it:** The council tax lookup on property pages returns a "not configured" error.

### Setup:
1. Go to https://www.counciltaxfinder.com
2. Subscribe to a plan (monthly subscription)
3. Get your API key from the dashboard

### Add to Railway Variables:

| Variable | Value | Required |
|----------|-------|----------|
| `COUNCIL_TAX_API_KEY` | `(your API key)` | Optional |

### Features unlocked:
- Council tax band lookup on property detail pages
- Auto-populate council tax data

---

## 9. Vercel Environment Variables

The frontend needs to know where the backend is. Set this in the **Vercel dashboard**:

**Vercel > fleming-portal > Settings > Environment Variables**

| Variable | Value | Environments |
|----------|-------|-------------|
| `VITE_API_URL` | `https://fleming-crm-api-production-7e58.up.railway.app` | Production, Preview, Development |

After adding/changing, trigger a redeploy:
```bash
cd ~/Documents/GitHub/Fleming-crm && VERCEL_SERVICE_DETECTION=0 vercel --prod --yes
```

---

## 10. Webhook Configuration

### Resend Email Webhooks
- **URL:** `https://fleming-crm-api-production-7e58.up.railway.app/api/email/webhook`
- **Events:** `email.delivered`, `email.bounced`, `email.opened`, `email.clicked`, `email.failed`
- **Set in:** Resend Dashboard > Webhooks

### Twilio SMS Delivery Status
- Handled automatically — the backend passes a `statusCallback` URL to Twilio when sending each SMS
- Requires `BASE_URL` to be set in Railway Variables

### Twilio Inbound SMS
- **URL:** `https://fleming-crm-api-production-7e58.up.railway.app/api/sms/inbound`
- **Method:** HTTP POST
- **Set in:** Twilio Console > Phone Numbers > Your Number > Messaging

---

## 11. DNS & Domains

### Current Setup

| Subdomain | Points To | Type |
|-----------|-----------|------|
| `crm.fleminglettings.co.uk` | `cname.vercel-dns.com` | CNAME |
| `apply.fleminglettings.co.uk` | `cname.vercel-dns.com` | CNAME |
| `landlords.fleminglettings.co.uk` | `cname.vercel-dns.com` | CNAME (needs adding) |

### To add landlords subdomain:
1. In your DNS provider, add a CNAME record:
   - **Name:** `landlords`
   - **Type:** CNAME
   - **Value:** `cname.vercel-dns.com`
2. In Vercel, add the domain:
   ```bash
   vercel domains add landlords.fleminglettings.co.uk landlords-subdomain
   ```

---

## 12. Quick Reference Table

### Services that DON'T need API keys (free, public):
| Service | What It Does |
|---------|-------------|
| Land Registry | Property sale prices by postcode |
| Postcodes.io | Postcode validation and geocoding |

### Services that need FREE API keys:
| Service | Sign Up URL | Time to Set Up |
|---------|-------------|----------------|
| Resend (email) | https://resend.com | 5 minutes |
| EPC Lookup | https://epc.opendatacommunities.org | 5 minutes |
| Companies House | https://developer.company-information.service.gov.uk | 10 minutes |

### Services that need PAID accounts:
| Service | Sign Up URL | Cost |
|---------|-------------|------|
| Twilio (SMS) | https://www.twilio.com | Pay-per-SMS (~3p/message UK) |
| Council Tax Finder | https://www.counciltaxfinder.com | Monthly subscription |

### All Railway Environment Variables (copy-paste checklist):

```env
# REQUIRED
DATABASE_URL=postgresql://...          # Auto-set by Railway PostgreSQL
JWT_SECRET=your-random-32-char-string  # openssl rand -hex 32
NODE_ENV=production
PORT=3001

# EMAIL (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=Fleming Lettings <noreply@fleminglettings.co.uk>
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
ENQUIRY_NOTIFICATION_EMAIL=info@fleminglettings.co.uk

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+441902212415
BASE_URL=https://fleming-crm-api-production-7e58.up.railway.app

# UK GOVERNMENT APIs
EPC_API_KEY=xxxxxxxxxxxx
EPC_API_EMAIL=your@email.com
COMPANIES_HOUSE_API_KEY=xxxxxxxxxxxx
COUNCIL_TAX_API_KEY=xxxxxxxxxxxx

# FRONTEND URL (for email links)
FRONTEND_URL=https://crm.fleminglettings.co.uk
```

---

## Priority Order

If you're setting these up one at a time, this is the recommended order:

1. **JWT_SECRET** — 1 minute, critical for security
2. **Resend (email)** — 5 minutes, unlocks all email features
3. **Twilio (SMS)** — 10 minutes, unlocks all SMS features
4. **Companies House** — 5 minutes, free, useful for company landlords
5. **EPC Lookup** — 5 minutes, free, useful for property compliance
6. **Council Tax** — 5 minutes, paid, nice-to-have for property data

Total time to set up everything: approximately 30-40 minutes.
