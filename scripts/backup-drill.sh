#!/usr/bin/env bash
# =====================================================================
# Weekly restore drill — proves prod-backend dumps are restore-able.
# Plan: .omo/plans/prod-backend-rolling-backup.md T10
#
# What it does:
#   1. Picks the latest prod-backend-*.dump.gz in BACKUP_DIR.
#   2. Verifies integrity: gzip -t + sha256 against the .meta.txt sidecar
#      (when present; meta line 1 is "<sha>  <basename>", same contract
#      scripts/backup-db.sh writes).
#   3. Restores it (gunzip -c on the pipe — NEVER straight .gz into
#      pg_restore) into an EPHEMERAL postgres:16-alpine container
#      (--rm, isolated, shifted host port 55433 by default: never 5432 /
#      5433 / 5434, never touches prod/staging/dev DBs).
#   4. Asserts: pg_restore exit 0 AND user-table count > 0 AND a row
#      spot-check (largest public table returns ≥1 row).
#   5. Writes $BACKUP_DIR/.rolling-status.json (atomic .tmp + mv) for the
#      future frontend widget (T13) and the cleanup gate (T11):
#        {updated_at, latest_file, latest_age_h, count, disk_pct,
#         last_drill:{at,result,restored_tables,restored_rows}}
#      Keys are STABLE — T11 reads last_drill.{at,result}, T13 reads the
#      whole file. Do NOT rename keys without updating both consumers.
#
# Safety:
#   - EPHEMERAL container ONLY. The ONLY write to BACKUP_DIR is the status
#     JSON (never a dump, never a restore target). NEVER restores into any
#     non-ephemeral database.
#   - Lock-aware: if /run/lock/onchain-backend-backup.lock is held by a
#     running dump, the drill exits 0 with a `drill-skipped-locked` notice
#     rather than competing (no second lock is taken).
#   - Loud in journal on any failure (exit != 0): integrity, restore,
#     assertions. A failed drill writes result=fail (never pass) so the
#     gate/widget never see a stale green.
#
# ESCALA UNICA (docs/deployment/BACKUPS.md §5 — same scale as T1/T2/T5):
#   backup age fail > 26h · disk warn >= 80% / fail >= 90% or < 2 GB free.
#   The drill reports age/disk with these thresholds; the restore proof
#   itself runs regardless of age (staleness is the health watchdog's job).
#
# Scheduling: infra/systemd/onchain-backup-drill.timer fires
#   Sun 05:00:00 UTC — AFTER the 04:00 daily health watchdog and clear of
#   the 03:00 daily backup / 03:20 offsite sync. No overlap by design.
#
# QA overrides (dev-container runs; prod paths untouched):
#   BACKUP_DIR / BACKUP_BASENAME / BACKUP_LOCK_FILE (same names as
#   backup-db.sh) · DRILL_PORT (default 55433) · DRILL_IMAGE
#   (default postgres:16-alpine) · DRILL_CONTAINER (default
#   onchain-backup-drill-<pid>) · DRILL_POSTGRES_PASSWORD (default random
#   per run) · DRILL_DB/DRILL_USER (default drill_postgres/drill).
#   Dev runs use a temporal BACKUP_DIR with synthetic dumps; the real
#   /opt/onchain-bot/backups is only ever READ (latest dump) for a live
#   drill, never written except the status JSON on prod.
#
# Exit codes: 0 pass (or drill-skipped-locked) · 1 any failure
#   (missing dump, integrity, restore, assertions, docker unavailable).
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/onchain-bot/backups}"
BACKUP_BASENAME="${BACKUP_BASENAME:-prod-backend}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/onchain-backend-backup.lock}"
STATUS_FILE="$BACKUP_DIR/.rolling-status.json"
DRILL_PORT="${DRILL_PORT:-55433}"
DRILL_IMAGE="${DRILL_IMAGE:-postgres:16-alpine}"
DRILL_CONTAINER="${DRILL_CONTAINER:-onchain-backup-drill-$$}"
DRILL_POSTGRES_PASSWORD="${DRILL_POSTGRES_PASSWORD:-drill-ephemeral-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
DRILL_DB="${DRILL_DB:-drill_postgres}"
DRILL_USER="${DRILL_USER:-drill}"

# ESCALA UNICA thresholds (must match backup-db.sh / backup-health.yml).
MAX_AGE_S=93600 # 26h
DISK_WARN=80
DISK_FAIL=90
DISK_MIN_FREE_KB=2097152 # 2 GiB

NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
NOW_S="$(date +%s)"

file_size() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0
}

# --- rolling fields (shared by pass / fail / skipped outcomes) ---
LATEST="$(ls -t "$BACKUP_DIR"/${BACKUP_BASENAME}-*.dump.gz 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo "ERROR: drill failed: no ${BACKUP_BASENAME}-*.dump.gz in $BACKUP_DIR" >&2
  printf '{\n  "updated_at": "%s",\n  "latest_file": "(missing)",\n  "latest_age_h": -1,\n  "count": 0,\n  "disk_pct": 0,\n  "last_drill": {\n    "at": "%s",\n    "result": "fail",\n    "restored_tables": 0,\n    "restored_rows": 0\n  }\n}\n' "$NOW_ISO" "$NOW_ISO" > "$STATUS_FILE.tmp"
  mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
  exit 1
fi
LATEST_FILE="$(basename "$LATEST")"
# Portable mtime: GNU first (Linux). BSD `stat -f` MUST come second:
# on Linux `stat -f %m <file>` succeeds printing multi-line filesystem
# info (first line `File: "..."`), which then breaks $(( )) arithmetic
# under `set -u` ("File: unbound variable", seen live 2026-09-20).
LATEST_MT="$(stat -c %Y "$LATEST" 2>/dev/null || stat -f %m "$LATEST" 2>/dev/null || echo 0)"
case "$LATEST_MT" in '' | *[!0-9]*) LATEST_MT=0 ;; esac
AGE_S=$((NOW_S - LATEST_MT))
[ "$AGE_S" -lt 0 ] && AGE_S=0
AGE_H="$(awk "BEGIN {printf \"%.1f\", $AGE_S/3600}")"
COUNT="$(ls "$BACKUP_DIR"/${BACKUP_BASENAME}-*.dump.gz 2>/dev/null | wc -l | tr -d ' ')"
DF_LINE="$(df -P "$BACKUP_DIR" 2>/dev/null | awk 'NR==2 {print $5, $4}')"
[ -z "$DF_LINE" ] && DF_LINE="$(df -P / 2>/dev/null | awk 'NR==2 {print $5, $4}')"
DISK_PCT="$(printf '%s' "$DF_LINE" | awk '{print $1}' | tr -d '%')"
DISK_AVAIL_KB="$(printf '%s' "$DF_LINE" | awk '{print $2}')"
case "$DISK_PCT" in '' | *[!0-9]*) DISK_PCT=0 ;; esac
case "$DISK_AVAIL_KB" in '' | *[!0-9]*) DISK_AVAIL_KB=0 ;; esac

write_status() {
  # $1=result $2=tables $3=rows — atomic .tmp + mv, keys STABLE (T11+T13).
  local result="$1" tables="$2" rows="$3"
  local at
  at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{\n  "updated_at": "%s",\n  "latest_file": "%s",\n  "latest_age_h": %s,\n  "count": %s,\n  "disk_pct": %s,\n  "last_drill": {\n    "at": "%s",\n    "result": "%s",\n    "restored_tables": %s,\n    "restored_rows": %s\n  }\n}\n' \
    "$at" "$LATEST_FILE" "$AGE_H" "$COUNT" "$DISK_PCT" "$at" "$result" "$tables" "$rows" \
    > "$STATUS_FILE.tmp"
  mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
}

fail() {
  # fail <message> — loud + fail-status (never pass) + exit 1.
  echo "ERROR: drill failed: $1" >&2
  write_status "fail" 0 0
  exit 1
}

# --- ESCALA UNICA notices (informational; the proof runs regardless) ---
if [ "$AGE_S" -gt "$MAX_AGE_S" ]; then
  echo "WARN: newest backup $LATEST_FILE is ${AGE_H}h old (>26h ESCALA UNICA fail threshold)"
fi
if [ "$DISK_PCT" -ge "$DISK_FAIL" ] || [ "$DISK_AVAIL_KB" -lt "$DISK_MIN_FREE_KB" ]; then
  echo "WARN: disk at ${DISK_PCT}% (${DISK_AVAIL_KB}KB free): >=90% or <2GB free (ESCALA UNICA fail threshold)"
elif [ "$DISK_PCT" -ge "$DISK_WARN" ]; then
  echo "WARN: disk at ${DISK_PCT}% >= 80% (free ${DISK_AVAIL_KB}KB)"
fi

# --- lock-aware: a running dump wins, the drill steps aside ---
if command -v flock >/dev/null 2>&1 && [ -e "$BACKUP_LOCK_FILE" ]; then
  if ! flock -n "$BACKUP_LOCK_FILE" true 2>/dev/null; then
    echo "drill-skipped-locked: $BACKUP_LOCK_FILE held by a running dump; skipping this run"
    write_status "drill-skipped-locked" 0 0
    exit 0
  fi
fi

# --- 1. integrity: gzip -t + sha256 against the .meta.txt sidecar ---
echo "==> Drill: verifying $LATEST_FILE"
gzip -t "$LATEST" 2>/dev/null || fail "gzip -t failed for $LATEST_FILE"
META_FILE="${LATEST%.dump.gz}.meta.txt"
if [ -s "$META_FILE" ]; then
  EXPECTED_SHA="$(awk 'NR==1 {print $1}' "$META_FILE")"
  case "$EXPECTED_SHA" in
  ????????????????????????????????????????????????????????????????)
    ACTUAL_SHA="$(sha256sum "$LATEST" | awk '{print $1}')"
    [ "$ACTUAL_SHA" = "$EXPECTED_SHA" ] || fail "sha256 mismatch for $LATEST_FILE (meta=$EXPECTED_SHA actual=$ACTUAL_SHA)"
    echo "==> sha256 OK ($LATEST_FILE)"
    ;;
  *)
    echo "WARN: $META_FILE has no parseable sha on line 1; gzip -t already passed, continuing"
    ;;
  esac
else
  echo "WARN: no sidecar $META_FILE; gzip -t already passed, continuing"
fi

# --- 2. ephemeral restore target (ONLY this container is ever written) ---
command -v docker >/dev/null 2>&1 || fail "docker unavailable — cannot start ephemeral restore target"
echo "==> Drill: starting ephemeral $DRILL_IMAGE ($DRILL_CONTAINER, host 127.0.0.1:$DRILL_PORT)"
docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
cleanup() {
  docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker run -d --rm --name "$DRILL_CONTAINER" \
  -e POSTGRES_PASSWORD="$DRILL_POSTGRES_PASSWORD" \
  -e POSTGRES_USER="$DRILL_USER" -e POSTGRES_DB="$DRILL_DB" \
  -p "127.0.0.1:${DRILL_PORT}:5432" \
  "$DRILL_IMAGE" >/dev/null || fail "docker run $DRILL_IMAGE failed"

PSQL="docker exec $DRILL_CONTAINER psql -U $DRILL_USER -d $DRILL_DB -v ON_ERROR_STOP=1"
READY=0
for _ in $(seq 1 60); do
  if docker exec "$DRILL_CONTAINER" pg_isready -U "$DRILL_USER" -d "$DRILL_DB" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" -eq 1 ] || fail "ephemeral postgres never became ready"

# --- 3. restore: decompress on the pipe, NEVER straight .gz into pg_restore ---
echo "==> Drill: restoring into ephemeral container"
set +e
gunzip -c "$LATEST" 2>/dev/null | docker exec -i "$DRILL_CONTAINER" \
  pg_restore -U "$DRILL_USER" -d "$DRILL_DB" --no-owner --no-acl
RESTORE_RC=${PIPESTATUS[1]:-1}
set -e
[ "$RESTORE_RC" -eq 0 ] || fail "pg_restore exit $RESTORE_RC"
echo "==> pg_restore exit 0"

# --- 4. assertions: user-table count > 0 AND row spot-check ---
TABLES="$($PSQL -tA -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo 0)"
case "$TABLES" in '' | *[!0-9]*) TABLES=0 ;; esac
[ "$TABLES" -gt 0 ] || fail "restored user-table count = 0"
echo "==> restored_tables=$TABLES"

TABLE_LIST="$($PSQL -tA -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null || true)"
TOTAL_ROWS=0
TOP_TABLE=""
TOP_ROWS=0
for t in $TABLE_LIST; do
  N="$($PSQL -tA -c "SELECT count(*) FROM \"$t\";" 2>/dev/null || echo 0)"
  case "$N" in '' | *[!0-9]*) N=0 ;; esac
  TOTAL_ROWS=$((TOTAL_ROWS + N))
  if [ "$N" -gt "$TOP_ROWS" ]; then
    TOP_ROWS="$N"
    TOP_TABLE="$t"
  fi
done
echo "==> restored_rows=$TOTAL_ROWS (largest: $TOP_TABLE=$TOP_ROWS)"
[ "$TOP_ROWS" -gt 0 ] || fail "row spot-check failed: every public table is empty"
SPOT="$($PSQL -tA -c "SELECT 1 FROM \"$TOP_TABLE\" LIMIT 1;" 2>/dev/null || true)"
[ "$SPOT" = "1" ] || fail "row spot-check failed: SELECT LIMIT 1 on $TOP_TABLE returned nothing"

# --- 5. pass: stable status JSON, loud success for the journal ---
write_status "pass" "$TABLES" "$TOTAL_ROWS"
echo "==> Drill PASS: $LATEST_FILE → $TABLES tables / $TOTAL_ROWS rows (status $STATUS_FILE)"
exit 0
