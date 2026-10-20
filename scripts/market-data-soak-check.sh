#!/usr/bin/env bash
#
# market-data-soak-check.sh — one run of the market-data staging 7-day soak.
#
# READ-ONLY probes (GET only). Each run appends ONE JSON line (JSONL) to
# OUT_FILE:
#   ts, base_url, health_http/health_ms/health_ok,
#   chains_http/chains_count/chains_keyed,
#   snapshot_http/snapshot_ms/snapshot_status/snapshot_sources/
#   snapshot_provider_errors/snapshot_degraded/snapshot_stale,
#   db_snapshot_history_rows (null unless PSQL_CONTAINER is set).
#
# Exit code: 0 unless the HEALTH probe is not HTTP 200. Every other probe
# is recorded and NEVER fatal (401 on chains/snapshot with the key absent
# is a valid observation, not a crash).
#
# Env:
#   BASE_URL              default http://localhost:4001
#   MARKET_DATA_API_KEY   optional; sent as x-api-key, NEVER echoed
#   OUT_FILE              default logs/market-data-soak.jsonl
#   TIMEOUT               per-request curl timeout in seconds, default 15
#   SNAPSHOT_CHAIN        default bsc
#   SNAPSHOT_ADDRESS      default 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82
#                         (CAKE on bsc — a token with live pairs)
#   PSQL_CONTAINER        optional; docker container used for the DB count.
#                         Unset -> DB probe skipped silently.
#   PSQL_USER / PSQL_DB   defaults onchain_bot / onchain_bot_market_data_staging
#
# Oracle invocation (run ON the host; the key is read from the RUNNING
# container env into the shell and NEVER echoed — .env.staging is
# operator-owned and not readable by the SSH user):
#
#   ssh OracleDroplet
#   export MARKET_DATA_API_KEY="$(docker exec \
#     onchain-bot-market-data-staging printenv MARKET_DATA_API_KEY)"
#   PSQL_CONTAINER=onchain-bot-market-data-postgres-staging \
#     OUT_FILE="$HOME/market-data-soak.jsonl" \
#     bash /opt/onchain-bot-staging/scripts/market-data-soak-check.sh
#
# If the script is not on the host yet (it lands with the next deploy of
# the full staging tree), copy it once:
#
#   scp scripts/market-data-soak-check.sh OracleDroplet:/tmp/
#   # then use: bash /tmp/market-data-soak-check.sh
#
# Without the key (loopback fail-open / 401 recorded as data):
#
#   BASE_URL=http://localhost:4001 bash scripts/market-data-soak-check.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4001}"
OUT_FILE="${OUT_FILE:-logs/market-data-soak.jsonl}"
TIMEOUT="${TIMEOUT:-15}"
SNAPSHOT_CHAIN="${SNAPSHOT_CHAIN:-bsc}"
SNAPSHOT_ADDRESS="${SNAPSHOT_ADDRESS:-0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82}"
MARKET_DATA_API_KEY="${MARKET_DATA_API_KEY:-}"
PSQL_CONTAINER="${PSQL_CONTAINER:-}"
PSQL_USER="${PSQL_USER:-onchain_bot}"
PSQL_DB="${PSQL_DB:-onchain_bot_market_data_staging}"

usage() {
  sed -n '3,47p' "$0" | sed -e 's/^# \{0,1\}//'
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
  '') ;;
  *)
    echo "market-data-soak-check: unknown argument: $1" >&2
    usage >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# Helpers (bash 3.2 / macOS-safe; no GNU-only flags required)
# ---------------------------------------------------------------------------

have_jq=0
if command -v jq >/dev/null 2>&1; then
  have_jq=1
fi

json_escape() {
  printf '%s' "${1:-}" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

json_string() {
  printf '"%s"' "$(json_escape "${1:-}")"
}

json_string_or_null() {
  if [ -z "${1:-}" ]; then
    printf 'null'
  else
    printf '"%s"' "$(json_escape "$1")"
  fi
}

json_bool_or_null() {
  case "${1:-}" in
    true | false) printf '%s' "$1" ;;
    *) printf 'null' ;;
  esac
}

json_number_or_null() {
  case "${1:-}" in
    '' | *[!0-9]*) printf 'null' ;;
    *) printf '%s' "$((10#$1))" ;;
  esac
}

to_decimal() {
  case "${1:-}" in
    '' | *[!0-9]*) printf '0' ;;
    *) printf '%s' "$((10#$1))" ;;
  esac
}

ms_from_seconds() {
  if command -v awk >/dev/null 2>&1; then
    awk -v t="${1:-0}" 'BEGIN { printf "%d", (t * 1000) + 0.5 }'
  else
    local whole="${1:-0}"
    whole="${whole%%.*}"
    case "$whole" in
      '' | *[!0-9]*) whole=0 ;;
    esac
    printf '%s' "$((whole * 1000))"
  fi
}

AUTH_HEADER_ARGS=()
if [ -n "$MARKET_DATA_API_KEY" ]; then
  # Header value is never printed anywhere (not even on curl errors).
  AUTH_HEADER_ARGS=(-H "x-api-key: ${MARKET_DATA_API_KEY}")
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/market-data-soak.XXXXXX")"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

http_code=""
time_total=""

probe() {
  # $1 = url, $2 = body file. Sets http_code / time_total.
  local out
  out="$(
    curl -s -o "$2" -w '%{http_code} %{time_total}' --max-time "$TIMEOUT" \
      ${AUTH_HEADER_ARGS[@]+"${AUTH_HEADER_ARGS[@]}"} "$1" 2>/dev/null
  )" || true
  http_code="${out%% *}"
  time_total="${out##* }"
  case "$http_code" in
    '' | *[!0-9]*) http_code="000" ;;
  esac
  case "$time_total" in
    '' | *[!0-9.]*) time_total="0" ;;
  esac
}

# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

health_body="$tmpdir/health.json"
probe "$BASE_URL/api/health" "$health_body"
health_http="$(to_decimal "$http_code")"
health_ms="$(ms_from_seconds "$time_total")"

chains_body="$tmpdir/chains.json"
probe "$BASE_URL/api/v1/chains" "$chains_body"
chains_http="$(to_decimal "$http_code")"

snapshot_body="$tmpdir/snapshot.json"
probe \
  "$BASE_URL/api/market-data/snapshot?chain=${SNAPSHOT_CHAIN}&address=${SNAPSHOT_ADDRESS}" \
  "$snapshot_body"
snapshot_http="$(to_decimal "$http_code")"
snapshot_ms="$(ms_from_seconds "$time_total")"

# ---------------------------------------------------------------------------
# Parse chains + snapshot (jq when present, best-effort grep fallback)
# ---------------------------------------------------------------------------

chains_count=""
snapshot_status=""
snapshot_sources_json="null"
snapshot_provider_errors=""
snapshot_degraded=""
snapshot_stale=""

if [ "$have_jq" = 1 ]; then
  if [ "$chains_http" = "200" ]; then
    chains_count="$(jq -r 'if type == "array" then length else empty end' "$chains_body" 2>/dev/null)" || chains_count=""
  fi
  if [ "$snapshot_http" = "200" ]; then
    snapshot_status="$(jq -r 'if (.status | type) == "string" then .status else empty end' "$snapshot_body" 2>/dev/null)" || snapshot_status=""
    snapshot_sources_json="$(jq -c 'if (.sources | type) == "array" then .sources else null end' "$snapshot_body" 2>/dev/null)" || snapshot_sources_json="null"
    snapshot_provider_errors="$(jq -r 'if (.providerErrors | type) == "object" then (.providerErrors | length) else empty end' "$snapshot_body" 2>/dev/null)" || snapshot_provider_errors=""
    snapshot_degraded="$(jq -r 'if .degraded == true then "true" elif .degraded == false then "false" else "null" end' "$snapshot_body" 2>/dev/null)" || snapshot_degraded=""
    snapshot_stale="$(jq -r 'if .stale == true then "true" elif .stale == false then "false" else "null" end' "$snapshot_body" 2>/dev/null)" || snapshot_stale=""
  fi
else
  # jq absent: record what grep can recover, leave the rest null. Never fail
  # the run on parsing — the health contract is the only fatal probe.
  if [ "$chains_http" = "200" ]; then
    chains_count="$(
      {
        grep -o '"id"[[:space:]]*:' "$chains_body" 2>/dev/null || true
      } | wc -l | tr -d ' '
    )"
  fi
  if [ "$snapshot_http" = "200" ]; then
    snapshot_status="$(
      grep -m 1 -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$snapshot_body" 2>/dev/null |
        sed -e 's/^.*:[[:space:]]*"//' -e 's/"$//'
    )" || snapshot_status=""

    sources_raw="$(grep -m 1 -o '"sources"[[:space:]]*:[[:space:]]*\[[^]]*\]' "$snapshot_body" 2>/dev/null)" || sources_raw=""
    if [ -n "$sources_raw" ]; then
      sources_inner="$(
        printf '%s' "$sources_raw" | grep -o '"[^"]*"' | sed -n '2,$p' | paste -sd, -
      )" || sources_inner=""
      snapshot_sources_json="[${sources_inner}]"
    fi

    provider_errors_raw="$(grep -m 1 -o '"providerErrors"[[:space:]]*:[[:space:]]*{[^}]*}' "$snapshot_body" 2>/dev/null)" || provider_errors_raw=""
    if [ -n "$provider_errors_raw" ]; then
      provider_keys="$(
        printf '%s' "$provider_errors_raw" | grep -o '"[^"]*"[[:space:]]*:' | wc -l | tr -d ' '
      )" || provider_keys=""
      case "$provider_keys" in
        '' | *[!0-9]*) snapshot_provider_errors="" ;;
        *)
          if [ "$provider_keys" -gt 0 ]; then
            # The match includes the "providerErrors" key itself.
            snapshot_provider_errors="$((provider_keys - 1))"
          fi
          ;;
      esac
    fi

    snapshot_degraded="$(
      grep -m 1 -oE '"degraded"[[:space:]]*:[[:space:]]*(true|false)' "$snapshot_body" 2>/dev/null |
        sed -e 's/^.*:[[:space:]]*//'
    )" || snapshot_degraded=""
    snapshot_stale="$(
      grep -m 1 -oE '"stale"[[:space:]]*:[[:space:]]*(true|false)' "$snapshot_body" 2>/dev/null |
        sed -e 's/^.*:[[:space:]]*//'
    )" || snapshot_stale=""
  fi
fi

# Non-200 probes carry no parseable body fields.
if [ "$chains_http" != "200" ]; then
  chains_count=""
fi
if [ "$snapshot_http" != "200" ]; then
  snapshot_status=""
  snapshot_sources_json="null"
  snapshot_provider_errors=""
  snapshot_degraded=""
  snapshot_stale=""
fi

# Normalize the sources array to valid JSON (or null).
case "$snapshot_sources_json" in
  \[*\] | null) ;;
  *) snapshot_sources_json="null" ;;
esac

# ---------------------------------------------------------------------------
# Optional DB probe (read-only SELECT; skipped silently when unset)
# ---------------------------------------------------------------------------

db_rows=""
if [ -n "$PSQL_CONTAINER" ]; then
  db_rows="$(
    docker exec "$PSQL_CONTAINER" \
      psql -U "$PSQL_USER" -d "$PSQL_DB" -tAc 'SELECT count(*) FROM snapshot_history' \
      2>/dev/null | tr -d '[:space:]'
  )" || db_rows=""
  if [ -z "$db_rows" ]; then
    echo "[market-data-soak] WARN: snapshot_history count unavailable (container=${PSQL_CONTAINER})" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Emit ONE JSON line
# ---------------------------------------------------------------------------

health_ok="false"
if [ "$health_http" = "200" ]; then
  health_ok="true"
fi

chains_keyed="false"
if [ -n "$MARKET_DATA_API_KEY" ]; then
  chains_keyed="true"
fi

out_dir="$(dirname "$OUT_FILE")"
if [ -n "$out_dir" ] && [ ! -d "$out_dir" ]; then
  mkdir -p "$out_dir"
fi

line="{"
line="${line}\"ts\":$(json_string "$ts")"
line="${line},\"base_url\":$(json_string "$BASE_URL")"
line="${line},\"health_http\":$(json_number_or_null "$health_http")"
line="${line},\"health_ms\":$(json_number_or_null "$health_ms")"
line="${line},\"health_ok\":${health_ok}"
line="${line},\"chains_http\":$(json_number_or_null "$chains_http")"
line="${line},\"chains_count\":$(json_number_or_null "$chains_count")"
line="${line},\"chains_keyed\":${chains_keyed}"
line="${line},\"snapshot_chain\":$(json_string "$SNAPSHOT_CHAIN")"
line="${line},\"snapshot_address\":$(json_string "$SNAPSHOT_ADDRESS")"
line="${line},\"snapshot_http\":$(json_number_or_null "$snapshot_http")"
line="${line},\"snapshot_ms\":$(json_number_or_null "$snapshot_ms")"
line="${line},\"snapshot_status\":$(json_string_or_null "$snapshot_status")"
line="${line},\"snapshot_sources\":${snapshot_sources_json}"
line="${line},\"snapshot_provider_errors\":$(json_number_or_null "$snapshot_provider_errors")"
line="${line},\"snapshot_degraded\":$(json_bool_or_null "$snapshot_degraded")"
line="${line},\"snapshot_stale\":$(json_bool_or_null "$snapshot_stale")"
line="${line},\"db_snapshot_history_rows\":$(json_number_or_null "$db_rows")"
line="${line}}"

printf '%s\n' "$line" >>"$OUT_FILE"

echo "[market-data-soak] ${ts} health=${health_http} (${health_ms}ms) chains=${chains_http} count=${chains_count:-null} snapshot=${snapshot_http} status=${snapshot_status:-null} providerErrors=${snapshot_provider_errors:-null} degraded=${snapshot_degraded:-null} stale=${snapshot_stale:-null} rows=${db_rows:-null}"
echo "[market-data-soak] appended ${OUT_FILE}"

if [ "$health_http" != "200" ]; then
  echo "[market-data-soak] FAIL: health probe returned HTTP ${health_http} (expected 200)" >&2
  exit 1
fi

echo "[market-data-soak] OK"
exit 0
