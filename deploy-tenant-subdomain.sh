#!/bin/bash
# Fleming Lettings - Tenant Form Subdomain Deployment Script
# This script prepares the tenant enquiry form for deployment to apply.fleminglettings.co.uk

set -e

echo "🏠 Fleming Lettings - Tenant Form Subdomain Deployment"
echo "======================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create deployment directory
DEPLOY_DIR="tenants-subdomain"
echo -e "${BLUE}📁 Creating deployment directory: ${DEPLOY_DIR}${NC}"

if [ -d "$DEPLOY_DIR" ]; then
    echo -e "${YELLOW}⚠️  Directory exists. Cleaning...${NC}"
    rm -rf "$DEPLOY_DIR"
fi

mkdir -p "$DEPLOY_DIR"

# Copy form file as index.html
echo -e "${BLUE}📄 Copying tenant form file...${NC}"
cp public-form/tenant-enquiry.html "$DEPLOY_DIR/index.html"

# Update logo to use CDN URL
echo -e "${BLUE}🖼️  Updating logo to use CDN URL...${NC}"
sed -i.bak 's|src="Logo for form.png"|src="https://fleminglettings.co.uk/wp-content/uploads/2023/10/image-4-1.png"|g' "$DEPLOY_DIR/index.html"
rm -f "$DEPLOY_DIR/index.html.bak"

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
EOF

# Create .gitignore
cat > "$DEPLOY_DIR/.gitignore" << 'EOF'
.DS_Store
node_modules
.vercel
.netlify
*.bak
EOF

echo ""
echo -e "${GREEN}✅ Tenant form deployment directory prepared successfully!${NC}"
echo ""
echo -e "${BLUE}📦 Contents:${NC}"
ls -lh "$DEPLOY_DIR"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Choose your hosting platform (Vercel, Netlify, or GitHub Pages)"
echo "2. Deploy the ${DEPLOY_DIR} directory"
echo "3. Configure DNS to point apply.fleminglettings.co.uk to your deployment"
echo "4. Wait for DNS propagation (5-30 minutes)"
echo "5. Test at https://apply.fleminglettings.co.uk"
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
echo "  git remote add origin https://github.com/YOUR_USERNAME/fleming-tenants.git"
echo "  git push -u origin main"
echo ""
echo -e "${YELLOW}💡 Configured Subdomains:${NC}"
echo "  - Tenant Applications: apply.fleminglettings.co.uk"
echo "  - Landlord Enquiries:  landlords.fleminglettings.co.uk"
echo ""
echo -e "${GREEN}✨ Ready to deploy!${NC}"
