#!/usr/bin/env bash
#
# smoke-prod.sh — read-only post-deploy smoke checks.
#
# Probes (each with an explicit timeout, PASS/FAIL echo, non-zero exit on fail):
#   1. backend health            GET ${SMOKE_BACKEND_URL}/api/health
#   2. frontend 200 + html       GET ${SMOKE_FRONTEND_URL}/
#   3. ingestion sources         GET ${SMOKE_INGESTION_URL}/api/crypto-news/sources
#   4. recent reachable          GET ${SMOKE_BACKEND_URL}/vip-calls/calls/recent?limit=1
#                                (NOT freshness — gateway-deferred; reachability only)
#   5. SSE probe                 GET ${SMOKE_INGESTION_URL}/api/ingestion/stream
#                                (headers-only success: HTTP 200 headers == alive stream)
#   6. matching config           GET ${SMOKE_BACKEND_URL}/crypto-news/matching/config
#                                (expect 200 + boolean `enabled`)
#   7. matching health           GET ${SMOKE_BACKEND_URL}/crypto-news/matching/health
#                                (expect 200 + all 6 keys: enabled,lastTickAt,lastFetchOk,
#                                 consecutiveFetchFailures,lastEnqueuedAt,queuePending)
#
# URLs are env-parametrized with loopback defaults (NO hardcoded IPs — the
# runner executes ON the host, so loopback is correct in every environment).
# NEVER publishes anything: all probes are GET (read-only by construction).
#
# Usage:
#   SMOKE_BACKEND_URL=http://localhost:3030 \
#   SMOKE_FRONTEND_URL=http://localhost:5173 \
#   SMOKE_INGESTION_URL=http://localhost:3032 \
#   bash scripts/smoke-prod.sh
#
set -euo pipefail

SMOKE_BACKEND_URL="${SMOKE_BACKEND_URL:-http://localhost:3030}"
SMOKE_FRONTEND_URL="${SMOKE_FRONTEND_URL:-http://localhost:5173}"
SMOKE_INGESTION_URL="${SMOKE_INGESTION_URL:-http://localhost:3032}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-10}"
SMOKE_SSE_TIMEOUT="${SMOKE_SSE_TIMEOUT:-8}"

FAILURES=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILURES=$((FAILURES + 1)); }

echo "=== smoke-prod (backend=${SMOKE_BACKEND_URL} frontend=${SMOKE_FRONTEND_URL} ingestion=${SMOKE_INGESTION_URL}) ==="

# 1. backend health
if curl -sf --max-time "${SMOKE_TIMEOUT}" "${SMOKE_BACKEND_URL}/api/health" > /dev/null 2>&1; then
  pass "backend health (${SMOKE_BACKEND_URL}/api/health)"
else
  fail "backend health (${SMOKE_BACKEND_URL}/api/health)"
fi

# 2. frontend 200 + html
FRONT_BODY="$(mktemp)"
FRONT_CODE="$(curl -s -o "${FRONT_BODY}" -w "%{http_code}" --max-time "${SMOKE_TIMEOUT}" "${SMOKE_FRONTEND_URL}/" 2>/dev/null || echo "000")"
if [ "${FRONT_CODE}" = "200" ] && grep -qiE '<!doctype html|<html' "${FRONT_BODY}"; then
  pass "frontend 200+html (${SMOKE_FRONTEND_URL}/)"
else
  fail "frontend 200+html (${SMOKE_FRONTEND_URL}/ -> http=${FRONT_CODE})"
fi
rm -f "${FRONT_BODY}"

# 3. ingestion sources
if curl -sf --max-time "${SMOKE_TIMEOUT}" "${SMOKE_INGESTION_URL}/api/crypto-news/sources" > /dev/null 2>&1; then
  pass "ingestion sources (${SMOKE_INGESTION_URL}/api/crypto-news/sources)"
else
  fail "ingestion sources (${SMOKE_INGESTION_URL}/api/crypto-news/sources)"
fi

# 4. recent reachable (reachability only — NOT freshness, gateway-deferred)
RECENT_OK=0
if curl -sf --max-time "${SMOKE_TIMEOUT}" "${SMOKE_BACKEND_URL}/vip-calls/calls/recent?limit=1" > /dev/null 2>&1; then
  RECENT_OK=1
elif curl -sf --max-time "${SMOKE_TIMEOUT}" "${SMOKE_BACKEND_URL}/api/vip-calls/calls/recent?limit=1" > /dev/null 2>&1; then
  RECENT_OK=1
fi
if [ "${RECENT_OK}" = "1" ]; then
  pass "recent reachable (${SMOKE_BACKEND_URL}/vip-calls/calls/recent?limit=1)"
else
  fail "recent reachable (${SMOKE_BACKEND_URL}/vip-calls/calls/recent?limit=1)"
fi

# 5. SSE probe (headers-only success: 200 response headers == alive stream;
#    the body is intentionally truncated by --max-time, so exit 28 is fine)
SSE_CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time "${SMOKE_SSE_TIMEOUT}" \
  -H 'Accept: text/event-stream' "${SMOKE_INGESTION_URL}/api/ingestion/stream" 2>/dev/null || true)"
if [ "${SSE_CODE}" = "200" ]; then
  pass "SSE stream headers (${SMOKE_INGESTION_URL}/api/ingestion/stream)"
else
  fail "SSE stream headers (${SMOKE_INGESTION_URL}/api/ingestion/stream -> http=${SSE_CODE})"
fi

# 6. matching config (expect 200 + boolean `enabled`)
MATCHING_CONFIG_BODY="$(mktemp)"
MATCHING_CONFIG_CODE="$(curl -s -o "${MATCHING_CONFIG_BODY}" -w "%{http_code}" --max-time "${SMOKE_TIMEOUT}" "${SMOKE_BACKEND_URL}/crypto-news/matching/config" 2>/dev/null || echo "000")"
if [ "${MATCHING_CONFIG_CODE}" = "200" ] && grep -q '"enabled"[[:space:]]*:[[:space:]]*\(true\|false\)' "${MATCHING_CONFIG_BODY}"; then
  pass "matching config (${SMOKE_BACKEND_URL}/crypto-news/matching/config)"
else
  fail "matching config (${SMOKE_BACKEND_URL}/crypto-news/matching/config -> http=${MATCHING_CONFIG_CODE})"
fi
rm -f "${MATCHING_CONFIG_BODY}"

# 7. matching health (expect 200 + all 6 keys)
MATCHING_HEALTH_BODY="$(mktemp)"
MATCHING_HEALTH_CODE="$(curl -s -o "${MATCHING_HEALTH_BODY}" -w "%{http_code}" --max-time "${SMOKE_TIMEOUT}" "${SMOKE_BACKEND_URL}/crypto-news/matching/health" 2>/dev/null || echo "000")"
MATCHING_HEALTH_OK=0
if [ "${MATCHING_HEALTH_CODE}" = "200" ]; then
  MATCHING_HEALTH_OK=1
  for _key in enabled lastTickAt lastFetchOk consecutiveFetchFailures lastEnqueuedAt queuePending; do
    if ! grep -q "\"${_key}\"" "${MATCHING_HEALTH_BODY}"; then
      MATCHING_HEALTH_OK=0
      break
    fi
  done
fi
if [ "${MATCHING_HEALTH_OK}" = "1" ]; then
  pass "matching health (${SMOKE_BACKEND_URL}/crypto-news/matching/health)"
else
  fail "matching health (${SMOKE_BACKEND_URL}/crypto-news/matching/health -> http=${MATCHING_HEALTH_CODE})"
fi
rm -f "${MATCHING_HEALTH_BODY}"

echo "=== smoke-prod: $((7 - FAILURES))/7 PASS ==="
if [ "${FAILURES}" -gt 0 ]; then
  echo "smoke-prod: ${FAILURES} check(s) FAILED"
  exit 1
fi
echo "smoke-prod: ALL CHECKS PASS"
