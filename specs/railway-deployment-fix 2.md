# Railway Deployment Fix

Fix the systematic Railway build failure so that `git push` to the tracked branch deploys successfully every time.

## Problem

Every Railway deploy fails with `EBADPLATFORM` during the backend `npm install` step:

```
npm error code EBADPLATFORM
npm error notsup Unsupported platform for @rolldown/binding-darwin-arm64@1.0.0-rc.13:
  wanted {"os":"darwin","cpu":"arm64"} (current: {"os":"linux","cpu":"x64"})
```

## Root Cause

The dependency chain is: **vitest** (devDependency) -> **vite** -> **rolldown** -> **@rolldown/binding-darwin-arm64** (platform-specific optional dep).

The build script (`render-build.sh` line 12) runs `npm install` **without `--omit=dev`**, so it installs vitest and its entire tree including platform-specific rolldown binaries. The `backend/.npmrc` has `force=true` and `omit=optional`, but these don't reliably prevent EBADPLATFORM errors for nested optional dependencies in npm 10.x.

Previous fix attempts (visible in git history: `5dab5cc`, `93d6784`, `2bef315`) tried `.npmrc` tweaks and removing individual packages, but none addressed the fundamental issue: **devDependencies should not be installed in the production build**.

## Solution

### Core Fix: Separate build-time and runtime deps in `render-build.sh`

```bash
#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm ci --omit=dev
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
```

Key changes:
- [ ] Use `npm ci` instead of `npm install` (deterministic, uses lock file exactly)
- [ ] Use `--force` flag on the backend npm ci command to bypass EBADPLATFORM for build-time deps
- [ ] Add `npm prune --omit=dev` after tsc compilation to strip vitest/vite/rolldown from the deployed image
- [ ] Frontend: use `npm ci --omit=dev` (no dev deps needed, vite is in dependencies for frontend)

### Supporting Fix: Clean up `.npmrc` files

**`backend/.npmrc`** - simplify to just force:
```
force=true
```

**Root `.npmrc`** - can be removed or kept minimal:
```
force=true
```

The `omit=optional` setting was a workaround that didn't solve the problem and could interfere with legitimate optional deps (like sharp's platform binaries which ARE needed).

### Verify: `tsconfig.render.json` excludes

Already correct - excludes SQLite-only files (`index.ts`, `db.ts`, `index-postgres.ts`). No changes needed.

### Verify: `railway.json`

Already correct:
- Build command: `chmod +x render-build.sh && ./render-build.sh`
- Start command: `cd backend && node dist/index-pg.js`
- Health check: `/api/health`

No changes needed.

## Acceptance Criteria

- [ ] `render-build.sh` uses `npm ci --force` for backend install step
- [ ] `render-build.sh` prunes devDeps after TypeScript compilation
- [ ] Frontend step uses `npm ci --omit=dev` (vite is a regular dep in frontend)
- [ ] Build succeeds on Railway (Linux x64) without EBADPLATFORM errors
- [ ] Backend starts and `/api/health` returns 200
- [ ] `.npmrc` files simplified (remove `omit=optional` which masks real issues)

## User Journey

1. Developer works locally on macOS (darwin-arm64)
2. Commits and pushes to tracked branch
3. Railway auto-detects push, runs `render-build.sh`
4. Frontend builds (npm ci + vite build)
5. Backend builds (npm ci --force + tsc + prune devDeps)
6. Container starts with only production deps
7. Health check passes, deploy succeeds

## Risk

- `--force` during build is safe because devDeps are pruned before the image ships
- `npm ci` is stricter than `npm install` - if lock file is out of sync it will fail fast (good - catches issues locally)
- sharp needs to rebuild for Linux - `npm ci` handles this via install scripts

## Success Metrics

- Zero EBADPLATFORM errors on Railway deploys
- Deploy succeeds on first push without manual intervention
- Build time stays under 60 seconds
