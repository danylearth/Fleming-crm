# Tenant Enquiry Form - Subdomain Deployment

This directory contains the production-ready tenant enquiry form for deployment to `apply.fleminglettings.co.uk`.

## Features
- ✅ Multi-step wizard with 7 steps
- ✅ Property selection from CRM
- ✅ Joint application support
- ✅ Full nationality dropdown (UK census-compliant)
- ✅ Mobile-optimized with touch-friendly targets
- ✅ Comprehensive data capture

## Quick Deploy

### Vercel (Recommended)
From the repository root, explicitly select this directory **and its configuration**.
The root `vercel.json` belongs to the CRM and sends signing links to the registration page if used here.

```powershell
$publicFormRoot = (Resolve-Path tenants-subdomain).Path
vercel --cwd $publicFormRoot --local-config "$publicFormRoot/vercel.json"
```

Review the preview deployment before promotion. Check `/apt-routing-check-fictional`
and `/agreement/routing-check-fictional` both have the title `Tenancy Agreement | Fleming Lettings`
(an invalid-link message is expected for these fictional tokens), `/onboarding/routing-check-fictional`
opens the application page, and `/` still opens registration. Check deployment inspection shows
the rewrites from this folder, including `/apt-:slug` → `/agreement.html`.
After approval, deploy using the same explicit paths with `--prod`, then repeat these route checks.
Do not use a real customer's signing token for smoke tests: opening it records an access timestamp.

Run `node tenants-subdomain/check-deployment.cjs https://deployment-host` before approval and
again against `https://apply.fleminglettings.co.uk` after promotion. This compares each actual
route with its intended HTML file; checking only `/agreement.html` is insufficient.

Then add custom domain in Vercel dashboard:
- Domain: `apply.fleminglettings.co.uk`
- Add CNAME record in DNS: `apply` → `68bcbb82721f9fea.vercel-dns-017.com.`

### Netlify
```bash
netlify deploy --prod
```

Or drag and drop this folder to: https://app.netlify.com/drop

### GitHub Pages
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/fleming-tenants.git
git push -u origin main
```

Then enable Pages in repo settings and add CNAME file with: `apply.fleminglettings.co.uk`

## API Endpoint
Form submits to: `https://fleming-crm-api.fly.dev/api/public/tenant-enquiries`

## DNS Configuration
Add CNAME record:
```
Type:  CNAME
Name:  apply
Value: 68bcbb82721f9fea.vercel-dns-017.com.
TTL:   3600
```

## Testing
Local: http://localhost:8000/tenant-enquiry.html
Production: https://apply.fleminglettings.co.uk
