#!/usr/bin/env bash
set -e

echo "=== Building backend only (API) ==="
cd backend
npm install
# tsc emits JS despite type errors (noEmitOnError: false in tsconfig.render.json)
# We allow non-zero exit from tsc but verify the output exists
npx tsc -p tsconfig.render.json || true

if [ ! -f dist/index-pg.js ]; then
  echo "ERROR: backend/dist/index-pg.js was not produced by tsc"
  exit 1
fi

echo "=== Backend build complete ==="
echo "Note: Frontend should be deployed separately (e.g., to Vercel)"
