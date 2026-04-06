#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm ci
npx vite build
cd ..

echo "=== Building backend ==="
cd backend
# Install ALL deps (including devDeps like typescript) for compilation
npm ci --force
# Compile TypeScript
npx tsc -p tsconfig.render.json || true

if [ ! -f dist/index-pg.js ]; then
  echo "ERROR: backend/dist/index-pg.js was not produced by tsc"
  exit 1
fi

# Remove devDeps after compilation - production image only has runtime deps
npm prune --omit=dev

echo "=== Build complete ==="
