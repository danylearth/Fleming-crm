# Implementation Plan

<!-- Release: Railway Deploy Fix -->
<!-- Audience: Solo dev deploying Fleming CRM from macOS to Railway (Linux x64) -->
<!-- Spec: specs/railway-deployment-fix.md -->

## High Priority

### Build Script Fix (`render-build.sh`)

- [x] **Rewrite `render-build.sh` per specs/railway-deployment-fix.md** — Frontend step: replace `npm install --omit=optional` with `npm ci` (keep devDeps — vite is a devDep, not a regular dep as spec incorrectly states). Remove `VITE_API_URL=""` prefix from vite build (env comes from Vercel at deploy time, not build time). Backend step: replace `npm install` + sharp reinstall hack with `npm ci --force`. Add `npm prune --omit=dev` after tsc to strip vitest/rolldown from deployed image.

### `.npmrc` Cleanup

- [x] **Simplify `backend/.npmrc`** — Remove `omit=optional` line (was masking issues and could block sharp's Linux binaries). Keep only `force=true`. Per spec.

- [x] **Simplify root `.npmrc`** — Replace `omit=optional` with `force=true`. Per spec.

### Dead Config Cleanup

- [x] **Remove `nixpacks.toml`** — Superseded by `railway.json` (Railway uses `railway.json` when present). Contains conflicting `npm install --production=false` command. Zero runtime effect since `railway.json` takes precedence.

## Low Priority

### Verification

- [x] **Push to Railway and verify build succeeds** — Acceptance criteria: zero EBADPLATFORM errors, `backend/dist/index-pg.js` produced, `npm prune` completes, container starts, `/api/health` returns 200. ✓ Verified 2026-04-06: health=200, login works, merged to main.

- [x] **Verify sharp works on Linux after prune** — sharp is a production dep with platform-specific binaries. Confirm `npm ci --force` installs Linux binaries and `npm prune --omit=dev` doesn't remove them. Test by hitting an endpoint that uses sharp (inventory photo thumbnails). ✓ Verified 2026-04-06: uploaded 100x100 PNG to `/api/inventory-photos/1/1`, received 200 with `thumbnail_filename` confirming sharp resized+converted successfully on Railway Linux.

### Future Release (Out of Scope)

- _Lock file sync: if `npm ci` fails due to stale lock files, run `npm install` locally and commit updated lock files_
- _CI pipeline: add GitHub Actions to validate Railway build before push (pre-deploy check)_
- _Build caching: Railway supports layer caching — could speed up `npm ci` with `--prefer-offline`_

## Spec Correction Note

The spec states "vite is in dependencies for frontend" (line 59) — this is incorrect. Vite is in `devDependencies` in `frontend/package.json`. The frontend build step must NOT use `--omit=dev` or vite won't be available. The frontend's devDeps are safe (no platform-specific rolldown binaries — only `@rolldown/pluginutils` which is cross-platform).
