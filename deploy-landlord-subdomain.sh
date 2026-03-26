#!/bin/bash
# Fleming Lettings - Landlord Form Subdomain Deployment Script
# This script prepares the landlord enquiry form for deployment to landlords.fleminglettings.co.uk

set -e

echo "🏠 Fleming Lettings - Landlord Form Deployment"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Create deployment directory
DEPLOY_DIR="landlords-subdomain"
echo -e "${BLUE}📁 Creating deployment directory: ${DEPLOY_DIR}${NC}"

if [ -d "$DEPLOY_DIR" ]; then
    echo -e "${YELLOW}⚠️  Directory exists. Cleaning...${NC}"
    rm -rf "$DEPLOY_DIR"
fi

mkdir -p "$DEPLOY_DIR"

# Copy form file as index.html
echo -e "${BLUE}📄 Copying form file...${NC}"
cp public-form/landlord-enquiry.html "$DEPLOY_DIR/index.html"

# Create vercel.json for Vercel deployment
echo -e "${BLUE}⚙️  Creating Vercel configuration...${NC}"
cat > "$DEPLOY_DIR/vercel.json" << 'EOF'
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
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
EOF

# Create netlify.toml for Netlify deployment
echo -e "${BLUE}⚙️  Creating Netlify configuration...${NC}"
cat > "$DEPLOY_DIR/netlify.toml" << 'EOF'
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
    Referrer-Policy = "strict-origin-when-cross-origin"
EOF

# Create README for deployment directory
echo -e "${BLUE}📝 Creating deployment README...${NC}"
cat > "$DEPLOY_DIR/README.md" << 'EOF'
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
EOF

# Create .gitignore
cat > "$DEPLOY_DIR/.gitignore" << 'EOF'
.DS_Store
node_modules
.vercel
.netlify
EOF

echo ""
echo -e "${GREEN}✅ Deployment directory prepared successfully!${NC}"
echo ""
echo -e "${BLUE}📦 Contents:${NC}"
ls -lh "$DEPLOY_DIR"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Choose your hosting platform (Vercel, Netlify, or GitHub Pages)"
echo "2. Deploy the ${DEPLOY_DIR} directory"
echo "3. Configure DNS to point landlords.fleminglettings.co.uk to your deployment"
echo "4. Wait for DNS propagation (5-30 minutes)"
echo "5. Test at https://landlords.fleminglettings.co.uk"
echo ""
echo -e "${BLUE}🚀 Quick Deploy Commands:${NC}"
echo ""
echo -e "${GREEN}Vercel:${NC}"
echo "  cd $DEPLOY_DIR && vercel --prod"
echo ""
echo -e "${GREEN}Netlify:${NC}"
echo "  cd $DEPLOY_DIR && netlify deploy --prod"
echo ""
echo -e "${GREEN}GitHub Pages:${NC}"
echo "  cd $DEPLOY_DIR"
echo "  git init && git add . && git commit -m 'Initial commit'"
echo "  git remote add origin https://github.com/YOUR_USERNAME/fleming-landlords.git"
echo "  git push -u origin main"
echo ""
echo -e "${YELLOW}⚠️  Important:${NC} Make sure backend is deployed first!"
echo "See DEPLOY-BACKEND-UPDATE.md for backend deployment instructions."
echo ""
echo -e "${GREEN}📚 Full Documentation:${NC}"
echo "  LANDLORD-FORM-DEPLOYMENT.md - Complete deployment guide"
echo "  DEPLOY-BACKEND-UPDATE.md - Backend deployment guide"
echo ""
echo -e "${GREEN}✨ Ready to deploy!${NC}"
