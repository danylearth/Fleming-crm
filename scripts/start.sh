#!/bin/bash
# Fleming CRM Start Script

# Kill any existing processes
pkill -f "tsx.*fleming.*index.ts" 2>/dev/null || true
pkill -f "cloudflared.*3001" 2>/dev/null || true

# Start backend
cd /home/ubuntu/.openclaw/workspace/fleming-portal/backend
nohup npx tsx src/index.ts > /tmp/fleming-backend.log 2>&1 &
echo "Backend started (PID: $!)"

# Wait for backend to be ready
sleep 3

# Start tunnel
nohup cloudflared tunnel --url http://localhost:3001 > /tmp/cloudflared.log 2>&1 &
echo "Tunnel started (PID: $!)"

# Wait and show tunnel URL
sleep 5
TUNNEL_URL=$(grep -o "https://[^\"]*trycloudflare.com" /tmp/cloudflared.log | head -1)
echo "Tunnel URL: $TUNNEL_URL"
echo ""
echo "NOTE: Update VITE_API_URL in Vercel if tunnel URL changed"
echo "Then redeploy: cd frontend && npx vercel --prod"
