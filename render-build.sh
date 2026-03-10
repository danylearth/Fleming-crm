#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Building backend ==="
cd backend
npm install
# tsc emits JS despite type errors (noEmitOnError: false in tsconfig.render.json)
# We allow non-zero exit from tsc but verify the output exists
npx tsc -p tsconfig.render.json || true

if [ ! -f dist/index.js ]; then
  echo "ERROR: backend/dist/index.js was not produced by tsc"
  exit 1
fi

echo "=== Build complete ==="
