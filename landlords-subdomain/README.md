# Landlord Enquiry Form - Subdomain Deployment

This directory contains the production-ready landlord enquiry form for deployment to `landlords.fleminglettings.co.uk`.

## Quick Deploy

### Vercel (Recommended)
```bash
vercel --prod
```

Then add custom domain in Vercel dashboard:
- Domain: `landlords.fleminglettings.co.uk`
- Add CNAME record in DNS: `landlords` → `cname.vercel-dns.com`

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
git remote add origin https://github.com/YOUR_USERNAME/fleming-landlords.git
git push -u origin main
```

Then enable Pages in repo settings and add CNAME file with: `landlords.fleminglettings.co.uk`

## Files
- `index.html` - The landlord enquiry form
- `vercel.json` - Vercel deployment configuration
- `netlify.toml` - Netlify deployment configuration

## API Endpoint
Form submits to: `https://fleming-crm-api-production-7e58.up.railway.app/api/public/landlord-enquiries`

## DNS Configuration
Add CNAME record:
```
Type:  CNAME
Name:  landlords
Value: [provided by hosting platform]
TTL:   3600
```

## Support
See `../LANDLORD-FORM-DEPLOYMENT.md` for detailed instructions.
