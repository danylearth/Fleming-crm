#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm install --omit=optional
VITE_API_URL="" npx vite build
cd ..

echo "=== Building backend ==="
cd backend
npm install --omit=optional
npm install sharp --ignore-scripts
npm rebuild sharp
npx tsc -p tsconfig.render.json || true

if [ ! -f dist/index-pg.js ]; then
  echo "ERROR: backend/dist/index-pg.js was not produced by tsc"
  exit 1
fi

echo "=== Build complete ==="
