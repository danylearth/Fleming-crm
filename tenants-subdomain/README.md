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
```bash
vercel --prod
```

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
Form submits to: `https://fleming-crm-api-production-7e58.up.railway.app/api/public/tenant-enquiries`

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
