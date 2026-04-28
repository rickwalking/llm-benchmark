#!/usr/bin/env bash
# Runs the full objective gauntlet against a candidate repo.
#
# Usage: run-objective.sh <RUN_DIR> <HARNESS_DIR>
#   RUN_DIR     path to a run directory (must contain candidate/)
#   HARNESS_DIR path to the harness/ directory (for templates)
#
# Outputs all tool reports under $RUN_DIR/objective/.
# Exits non-zero if a *fatal* step fails (install, app boot). Test/lint failures are
# captured but do not abort the gauntlet — we want partial scores.

set -uo pipefail

RUN_DIR="${1:?usage: run-objective.sh RUN_DIR HARNESS_DIR}"
HARNESS_DIR="${2:?usage: run-objective.sh RUN_DIR HARNESS_DIR}"
CANDIDATE="$RUN_DIR/candidate"
OBJ="$RUN_DIR/objective"

mkdir -p "$OBJ" "$OBJ/screenshots"

log()   { printf '\033[1;34m[gauntlet]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[gauntlet]\033[0m %s\n' "$*"; }
fatal() { printf '\033[1;31m[gauntlet] FATAL:\033[0m %s\n' "$*" >&2; exit 1; }

cd "$CANDIDATE" || fatal "candidate dir missing: $CANDIDATE"

# ──────────────────────────────────────────────────────────────────────────────
# Step 1 — install
# ──────────────────────────────────────────────────────────────────────────────
log "npm install"
if ! npm install --no-audit --no-fund > "$OBJ/install.log" 2>&1; then
  warn "npm install failed — recording and aborting gauntlet (first_run_success = 0)"
  echo '{"install_succeeded": false}' > "$OBJ/first_run.json"
  exit 0
fi
echo '{"install_succeeded": true}' > "$OBJ/first_run.json"

# ──────────────────────────────────────────────────────────────────────────────
# Step 2 — typecheck + lint + build
# ──────────────────────────────────────────────────────────────────────────────
log "typecheck"
npm run typecheck > "$OBJ/typecheck.log" 2>&1 || warn "typecheck reported errors (recorded)"

log "lint"
npm run lint --silent -- --format json > "$OBJ/lint.json" 2> "$OBJ/lint.err.log" || \
  warn "lint reported errors (recorded)"

log "build"
npm run build > "$OBJ/build.log" 2>&1 || warn "build failed (recorded)"

# ──────────────────────────────────────────────────────────────────────────────
# Step 3 — unit tests + BDD
# ──────────────────────────────────────────────────────────────────────────────
log "unit tests"
npm run test:unit -- --reporter=json > "$OBJ/unit.json" 2> "$OBJ/unit.err.log" || \
  warn "unit tests failed (recorded)"

log "BDD scenarios"
npm run test:bdd -- --format json:"$OBJ/bdd.json" > "$OBJ/bdd.log" 2>&1 || \
  warn "BDD failures (recorded)"

# ──────────────────────────────────────────────────────────────────────────────
# Step 4 — boot the app, run e2e + screenshots + lighthouse + axe + api-probe
# ──────────────────────────────────────────────────────────────────────────────
log "starting candidate app (npm run dev)"
npm run dev > "$OBJ/dev-server.log" 2>&1 &
DEV_PID=$!
trap 'kill $DEV_PID 2>/dev/null || true' EXIT

# Wait for both ports to be reachable, max 60s.
WAIT=0
until curl -sf http://localhost:5173 > /dev/null && curl -sf http://localhost:3001/api/books > /dev/null; do
  sleep 1
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -ge 60 ]; then
    warn "app failed to boot within 60s (first_run_success = 0)"
    jq '. + {"app_booted": false}' "$OBJ/first_run.json" > "$OBJ/first_run.tmp" && mv "$OBJ/first_run.tmp" "$OBJ/first_run.json"
    exit 0
  fi
done
jq '. + {"app_booted": true}' "$OBJ/first_run.json" > "$OBJ/first_run.tmp" && mv "$OBJ/first_run.tmp" "$OBJ/first_run.json"
log "app up after ${WAIT}s"

# Step 4a — e2e
log "e2e (Playwright)"
npm run test:e2e -- --reporter=json > "$OBJ/e2e.json" 2> "$OBJ/e2e.err.log" || \
  warn "e2e failures (recorded)"

# Step 4b — screenshots (copy template into candidate, run, copy back)
log "screenshot capture"
cp "$HARNESS_DIR/playwright/screenshots.spec.ts" "$CANDIDATE/tests/e2e/_screenshots.spec.ts"
SCREENSHOT_OUT="$OBJ/screenshots" \
  npx playwright test tests/e2e/_screenshots.spec.ts --reporter=line \
  > "$OBJ/screenshots.log" 2>&1 || warn "some screenshots failed (recorded)"
rm -f "$CANDIDATE/tests/e2e/_screenshots.spec.ts"

# Step 4c — Lighthouse on each page (desktop preset)
log "lighthouse"
mkdir -p "$OBJ/lighthouse"
for path in "/books" "/members" "/checkout"; do
  fname=$(echo "$path" | tr '/' '_' | sed 's/^_//')
  npx --yes lighthouse "http://localhost:5173${path}" \
    --preset=desktop --output=json --quiet \
    --output-path="$OBJ/lighthouse/${fname}.json" \
    --chrome-flags="--headless=new --no-sandbox" \
    > /dev/null 2>&1 || warn "lighthouse failed for ${path} (recorded)"
done
# Aggregate into a single lighthouse.json with the headline scores
jq -s 'map({url: .finalDisplayedUrl, performance: .categories.performance.score, accessibility: .categories.accessibility.score})' \
  "$OBJ/lighthouse"/*.json > "$OBJ/lighthouse.json" 2>/dev/null || echo '[]' > "$OBJ/lighthouse.json"

# Step 4d — axe-core via Playwright
log "axe (run through Playwright spec — assumes candidate's e2e includes axe checks)"
# If candidate doesn't ship its own axe pass, we run a standalone axe.
# Marker: tests/e2e/axe.spec.ts is the convention.
if [ -f "$CANDIDATE/tests/e2e/axe.spec.ts" ]; then
  npx playwright test tests/e2e/axe.spec.ts --reporter=json > "$OBJ/axe.json" 2>&1 || \
    warn "axe violations recorded"
else
  warn "candidate has no axe spec — skipping. UI/UX objective half will reflect this."
  echo '{"skipped": true, "reason": "no axe spec in candidate"}' > "$OBJ/axe.json"
fi

# Step 4e — API probe: hit each documented endpoint, record actual status + body shape
log "API probe"
"$HARNESS_DIR/scripts/api_probe.sh" "$OBJ/api-probe.json" 2> "$OBJ/api-probe.err.log" || \
  warn "API probe partial (recorded)"

# Step 4f — OpenAPI validation
log "OpenAPI validation"
if [ -f "$CANDIDATE/backend/openapi.yaml" ]; then
  npx --yes @apidevtools/swagger-cli validate "$CANDIDATE/backend/openapi.yaml" \
    > "$OBJ/openapi-validation.log" 2>&1 || warn "OpenAPI invalid (recorded)"
else
  echo "no openapi.yaml found" > "$OBJ/openapi-validation.log"
fi

kill $DEV_PID 2>/dev/null || true
trap - EXIT

# ──────────────────────────────────────────────────────────────────────────────
# Step 5 — mutation testing (Stryker) — done after stack shutdown to free ports
# ──────────────────────────────────────────────────────────────────────────────
log "mutation testing"
npm run mutation > "$OBJ/mutation.log" 2>&1 || warn "mutation step exited non-zero (recorded)"
# Stryker emits reports/mutation/mutation.json by default
if [ -f "$CANDIDATE/reports/mutation/mutation.json" ]; then
  cp "$CANDIDATE/reports/mutation/mutation.json" "$OBJ/mutation.json"
else
  echo '{"missing": true}' > "$OBJ/mutation.json"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Step 6 — static analysis (madge, file sizes, npm audit)
# ──────────────────────────────────────────────────────────────────────────────
log "madge (cycles + orphans)"
{
  echo "{"
  printf '  "circular": '; npx --yes madge --circular --json "$CANDIDATE/backend/src" "$CANDIDATE/frontend/src" || echo "[]"
  printf ',\n  "orphans": '; npx --yes madge --orphans --json "$CANDIDATE/backend/src" "$CANDIDATE/frontend/src" || echo "[]"
  echo "}"
} > "$OBJ/madge.json" 2> "$OBJ/madge.err.log"

log "file size distribution"
{
  echo "path,lines"
  find "$CANDIDATE/backend/src" "$CANDIDATE/frontend/src" \
    -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null \
    | while read -r f; do printf '%s,%d\n' "${f#$CANDIDATE/}" "$(wc -l < "$f")"; done \
    | sort -t, -k2 -nr
} > "$OBJ/file-sizes.csv"

log "npm audit"
(cd "$CANDIDATE" && npm audit --omit=dev --json) > "$OBJ/npm-audit.json" 2>&1 || true

# ──────────────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────────────
log "objective gauntlet complete → $OBJ"
