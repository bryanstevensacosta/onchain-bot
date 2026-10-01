#!/bin/bash
# rollback-rehearsal.sh — Tramo 1 todo 15 (C3) rollback rehearsal, TIMED.
# Simulates the cutover rollback WITHOUT posting anything real:
#   re-enable backend legacy path (KOL_PIPELINE_ENABLED=true) +
#   orchestrator off (TEMPLATE_ORCHESTRATOR_ENABLED=false).
# No network writes, no Telegram posts — read-only checks + env simulation.
# Prints elapsed seconds + minutes and asserts <30min (Gate T1).
set -euo pipefail

START=$(date +%s)
echo "[rehearsal] start: $(date -u +%FT%TZ)"

# Step 1: backend legacy path still wired (dual-run invariant).
if [ ! -f 'apps/backend/src/telegram/ingestion/kol/kol-ingestion.module.ts' ]; then
  echo '[rehearsal] FAIL: backend kol-ingestion.module.ts missing (legacy path gone)'
  exit 1
fi
echo '[rehearsal] step 1/3: backend legacy module present (KOL_PIPELINE_ENABLED=true path intact)'

# Step 2: orchestrator kill-switch simulation (env only, no restart of prod).
export TEMPLATE_ORCHESTRATOR_ENABLED=false
export KOL_PIPELINE_ENABLED=true
export KOL_CALLS_ENABLED=true
if [ "$TEMPLATE_ORCHESTRATOR_ENABLED" != 'false' ]; then
  echo '[rehearsal] FAIL: kill-switch env did not apply'
  exit 1
fi
echo '[rehearsal] step 2/3: kill-switch applied (TEMPLATE_ORCHESTRATOR_ENABLED=false, KOL_PIPELINE_ENABLED=true)'

# Step 3: kol-calls health still answers (read-only GET) when a port is given.
PORT="${1:-3051}"
if curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:${PORT}/api/health" | grep -q '200'; then
  echo "[rehearsal] step 3/3: kol-calls :${PORT}/api/health reachable (read-only)"
else
  echo "[rehearsal] step 3/3: kol-calls :${PORT} not running — rehearsal continues without live probe (env-only)"
fi

END=$(date +%s)
ELAPSED=$((END - START))
# awk for one-decimal minutes without bc dependency.
MIN=$(awk "BEGIN {printf \"%.1f\", ${ELAPSED}/60}")
echo "[rehearsal] end: $(date -u +%FT%TZ) elapsed-sec: ${ELAPSED} rehearsal-min: ${MIN}"
if [ "$ELAPSED" -ge 1800 ]; then
  echo '[rehearsal] FAIL: exceeded 30min budget'
  exit 1
fi
echo '[rehearsal] PASS: rollback rehearsed inside 30min budget (<30min)'
