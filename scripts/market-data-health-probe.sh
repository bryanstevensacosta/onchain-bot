#!/usr/bin/env bash
# Hourly /api/health probe for the market-data staging 24h SLO gate.
#
# Install on the Oracle staging host (owner-approved 2026-10-22):
#   sudo install -m 755 scripts/market-data-health-probe.sh \
#     /usr/local/bin/onchain-market-data-health-probe.sh
#   sudo install -m 644 infra/systemd/onchain-market-data-health-probe.service \
#     /etc/systemd/system/
#   sudo install -m 644 infra/systemd/onchain-market-data-health-probe.timer \
#     /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now onchain-market-data-health-probe.timer
#
# Read-only by design: ONE loopback HTTP GET, no provider calls, no DB
# access, no writes outside the JSONL log. One line per run:
#   {"ts":"2026-10-22T14:52:41Z","http":200,"ms":2.6}
#
# Overridable for tests: ONCHAIN_MARKET_DATA_HEALTH_LOG / _URL.
set -u

LOG="${ONCHAIN_MARKET_DATA_HEALTH_LOG:-/home/ubuntu/market-data-health-24h.jsonl}"
URL="${ONCHAIN_MARKET_DATA_HEALTH_URL:-http://127.0.0.1:4001/api/health}"

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
raw="$(curl -s -o /dev/null -m 10 -w '%{http_code} %{time_total}' "$URL" 2>/dev/null || true)"
code="${raw%% *}"
seconds="${raw##* }"
[ -n "$code" ] || code=000
case "$seconds" in '' | *[!0-9.]*) seconds=0 ;; esac
ms="$(awk -v t="$seconds" 'BEGIN { printf "%.1f", t * 1000 }')"

printf '{"ts":"%s","http":%s,"ms":%s}\n' "$ts" "$code" "$ms" >>"$LOG"
