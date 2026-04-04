#!/bin/bash
# Quick deploy to Railway - bypasses GitHub

echo "🚀 Deploying Fleming CRM to Railway..."
echo ""

# Check if Railway CLI is available
if ! command -v railway &> /dev/null && ! npx @railway/cli --version &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Build backend first (optional - Railway does this too)
echo "📦 Building backend..."
cd backend && npm run build
cd ..

# Deploy to Railway
echo ""
echo "🚢 Deploying to Railway..."
npx @railway/cli up

echo ""
echo "✅ Deployment complete!"
echo "🌐 Check your Railway dashboard for the live URL"
