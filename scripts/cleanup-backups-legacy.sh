#!/usr/bin/env bash
# =====================================================================
# Legacy backup cleanup — gated auto-deletion of backup clutter.
# Plan: .omo/plans/prod-backend-rolling-backup.md T11
# Doc gate embodied: docs/deployment/BACKUPS.md §10 (legacy inventory).
#
# What it does (ONLY when ALL machine-verified gates pass, else exits 0
# doing nothing with a logged `cleanup-skipped-<reason>` line):
#   Gate (a): >=7 valid prod-backend-*.dump.gz present (gzip -t each) AND
#             the latest one's .meta.txt passes `sha256sum -c`.
#   Gate (b): drill status fresh — $BACKUP_DIR/.rolling-status.json exists
#             with last_drill.result=pass AND drill age <10 days.
#             T10 runs parallel: field names are read TOLERANTLY (both
#             snake_case and camelCase variants); this script NEVER writes
#             the status file, only reads it.
#   Gate (c): deletions come ONLY from an explicit allowlist, always
#             `find "$BACKUP_DIR" -maxdepth 1` (top-level regular files;
#             subdirectories like ingestion/ and staging/ are never touched),
#             and rolling prod-backend-YYYYMMDD.dump.gz/.meta.txt are never
#             matched:
#               - `pre-deploy-*.dump.gz` older than 7 days (-mtime +7, keeps
#                 the week's deploy backups as extra net)
#               - `prod-backend-*-*.dump` UNCOMPRESSED legacy: gzip -9 to a
#                 new .gz + `gzip -t` verify + sha BEFORE deleting the
#                 original (reversible first — the .gz stays on disk)
#               - `prod-ingestion-*` top-level files only
#               - `staging*` top-level files only
#
# Lock-aware (like T10/backup-db.sh): when the shared dump lock
#   /run/lock/onchain-backend-backup.lock is HELD by a running backup,
#   skip everything (exit 0, `cleanup-skipped-lock-held`). No lock = no-op
#   probe only; this script never holds the lock.
#
# Logging: per-file lines (deleted/compressed/kept/skipped) + a final
#   summary with bytes reclaimed. stdout/stderr → journald under systemd.
#   DRY_RUN=1 prints the plan without deleting/compressing anything.
#
# Env overrides (for QA against a temporal dir — NEVER point at prod data
#   from dev; on the Oracle server BACKUP_DIR is always /opt/onchain-bot/backups):
#   BACKUP_DIR (default /opt/onchain-bot/backups)
#   STATUS_FILE (default $BACKUP_DIR/.rolling-status.json)
#   BACKUP_LOCK_FILE (default /run/lock/onchain-backend-backup.lock)
#   DRY_RUN=1 (plan only)
#
# Exit codes: ALWAYS 0 (gates fail safe to no-op). Non-zero only on
#   unexpected internal errors (missing BACKUP_DIR is a skip, not an error).
#
# MUST NOT touch: scripts/backup-db.sh, scripts/sync-backups-offsite.sh,
#   deploy.yml, backup-health.yml, existing timers, T10 files, docs,
#   frontend/backend. Do NOT enable anything on prod from here.
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/onchain-bot/backups}"
STATUS_FILE="${STATUS_FILE:-$BACKUP_DIR/.rolling-status.json}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/onchain-backend-backup.lock}"
DRY_RUN="${DRY_RUN:-0}"

# --- explicit allowlist: anything else on disk is untouched ---
# (globs are matched against top-level basenames only, never directories,
#  never rolling prod-backend-YYYYMMDD.dump.gz / .meta.txt)
ALLOW_PRE_DEPLOY_GZ='pre-deploy-*.dump.gz'          # -mtime +7 only
ALLOW_UNCOMPRESSED_LEGACY='prod-backend-*-*.dump'   # compress (reversible), never bare-delete
ALLOW_PROD_INGESTION='prod-ingestion-*'             # top-level files only, any age
ALLOW_STAGING='staging*'                            # top-level files only, any age

RECLAIMED_BYTES=0
DELETED_COUNT=0
COMPRESSED_COUNT=0
KEPT_COUNT=0

log() { echo "legacy-cleanup: $*"; }

file_size() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0
}

# Rolling day-files (T1 daily scheme) are NEVER in scope, even if some
# future allowlist glob could match them. Returns 0 (= is rolling) for
# prod-backend-YYYYMMDD.dump.gz / .meta.txt.
is_rolling_day_file() {
  case "$(basename "$1")" in
    prod-backend-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].dump.gz|prod-backend-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].meta.txt)
      return 0 ;;
  esac
  return 1
}

skip() {
  # $1 = reason slug (no spaces). Gate failure = safe no-op, exit 0.
  log "cleanup-skipped-$1"
  exit 0
}

# --- lock probe: skip when a dump holds the shared lock ---
if [ -e "$BACKUP_LOCK_FILE" ] && command -v flock >/dev/null 2>&1; then
  if ! flock -n "$BACKUP_LOCK_FILE" true 2>/dev/null; then
    skip "lock-held"
  fi
  log "lock free, proceeding"
elif ! command -v flock >/dev/null 2>&1; then
  log "flock unavailable, lock probe skipped (dev/QA path)"
fi

if [ ! -d "$BACKUP_DIR" ]; then
  skip "no-backup-dir"
fi

# --- gate (a): >=7 valid rolling dumps + latest .meta.txt verifies ---
VALID_COUNT=0
LATEST_FILE=""
LATEST_MTIME=0
for f in "$BACKUP_DIR"/prod-backend-*.dump.gz; do
  [ -e "$f" ] || continue
  [ -f "$f" ] || continue
  is_rolling_day_file "$f" || continue
  if gzip -t "$f" 2>/dev/null; then
    VALID_COUNT=$((VALID_COUNT + 1))
    # GNU-first: BSD `stat -f` succeeds on Linux with mount-point text (see backup-drill.sh).
    MT="$(stat -c%Y "$f" 2>/dev/null || stat -f%m "$f" 2>/dev/null || echo 0)"
    case "$MT" in ''|*[!0-9]*) MT=0 ;; esac
    if [ "$MT" -ge "$LATEST_MTIME" ]; then
      LATEST_MTIME="$MT"
      LATEST_FILE="$f"
    fi
  else
    log "skipped invalid rolling dump (gzip -t failed): $(basename "$f")"
  fi
done
log "gate-a: valid rolling dumps: $VALID_COUNT (need >=7)"
if [ "$VALID_COUNT" -lt 7 ]; then
  skip "insufficient-rolling"
fi
LATEST_META="${LATEST_FILE%.dump.gz}.meta.txt"
if [ ! -f "$LATEST_META" ]; then
  skip "meta-missing"
fi
if ! (cd "$BACKUP_DIR" && sha256sum -c "$(basename "$LATEST_META")") >/dev/null 2>&1; then
  skip "meta-verify-failed"
fi
log "gate-a: latest $(basename "$LATEST_FILE") meta sha256sum -c OK"

# --- gate (b): drill status fresh (read-only, variant-tolerant) ---
if [ ! -f "$STATUS_FILE" ]; then
  skip "no-drill-status"
fi
DRILL_EVAL="$(python3 - "$STATUS_FILE" <<'PY' 2>/dev/null || echo "ERROR|0"
import json, sys, datetime
try:
    with open(sys.argv[1]) as fh:
        s = json.load(fh)
except Exception:
    print("ERROR|0")
    sys.exit(0)
# result variants (T10 contract + tolerant fallbacks; reads only)
result = ""
for path in (("last_drill", "result"), ("lastDrill", "result"),
             ("last_drill", "status"), ("lastDrill", "status"),
             ("drill", "result")):
    node = s
    try:
        for k in path:
            node = node[k]
        if isinstance(node, str) and node:
            result = node
            break
    except (KeyError, TypeError):
        continue
if not result:
    for k in ("drill_result", "last_drill_result", "drillResult"):
        if isinstance(s.get(k), str) and s[k]:
            result = s[k]
            break
# timestamp variants
at = ""
for path in (("last_drill", "at"), ("lastDrill", "at"),
             ("last_drill", "time"), ("last_drill", "date"),
             ("drill", "at")):
    node = s
    try:
        for k in path:
            node = node[k]
        if isinstance(node, str) and node:
            at = node
            break
    except (KeyError, TypeError):
        continue
if not at:
    for k in ("last_drill_at", "drill_at", "drillAt", "updated_at", "updatedAt"):
        if isinstance(s.get(k), str) and s[k]:
            at = s[k]
            break
print("%s|%s" % (result, at))
PY
)"
DRILL_RESULT="${DRILL_EVAL%%|*}"
DRILL_AT="${DRILL_EVAL#*|}"
if [ "$DRILL_RESULT" = "ERROR" ]; then
  skip "drill-status-unparseable"
fi
case "$(printf '%s' "$DRILL_RESULT" | tr '[:upper:]' '[:lower:]')" in
  pass|passed|success|ok) ;;
  *) skip "drill-not-pass" ;;
esac
DRILL_AGE_S="$(python3 -c "
import sys, datetime
raw = '''$DRILL_AT'''.strip().replace('Z', '+00:00')
try:
    dt = datetime.datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    age = (datetime.datetime.now(datetime.timezone.utc) - dt).total_seconds()
    print(int(age))
except Exception:
    print(-1)
" 2>/dev/null || echo -1)"
case "$DRILL_AGE_S" in ''|*[!0-9]*) DRILL_AGE_S=-1 ;; esac
if [ "$DRILL_AGE_S" -lt 0 ]; then
  # Unparseable drill timestamp: fall back to the status FILE mtime
  # (still <10 days proves a recent passing drill wrote it).
  NOW="$(date +%s)"
  # GNU-first (same BSD-stat trap as above).
  FMT="$(stat -c%Y "$STATUS_FILE" 2>/dev/null || stat -f%m "$STATUS_FILE" 2>/dev/null || echo 0)"
  case "$FMT" in ''|*[!0-9]*) FMT=0 ;; esac
  DRILL_AGE_S=$((NOW - FMT))
  log "drill timestamp unparseable, using status file mtime age"
fi
log "gate-b: drill result=$DRILL_RESULT age=${DRILL_AGE_S}s (need pass + <864000s)"
if [ "$DRILL_AGE_S" -ge 864000 ]; then
  skip "drill-stale"
fi

log "all gates passed, applying allowlist cleanup in $BACKUP_DIR"

delete_file() {
  # $1 = full path. Dry-run echo FIRST, then delete.
  local f="$1" base size
  base="$(basename "$f")"
  size="$(file_size "$f")"
  log "dry-run: would delete $base (${size} bytes)"
  if [ "$DRY_RUN" = "1" ]; then
    log "skipped (dry-run) $base"
    return 0
  fi
  rm -f -- "$f"
  RECLAIMED_BYTES=$((RECLAIMED_BYTES + size))
  DELETED_COUNT=$((DELETED_COUNT + 1))
  log "deleted $base (${size} bytes)"
}

compress_legacy() {
  # $1 = full path to uncompressed prod-backend-*-*.dump.
  # Round-trip: gzip -9 → gzip -t new .gz → sha → only then delete original.
  local f="$1" base gz tmp size newsize sha
  base="$(basename "$f")"
  gz="$f.gz"
  tmp="$f.gz.tmp"
  size="$(file_size "$f")"
  if [ -e "$gz" ]; then
    log "skipped $base (compressed $base.gz already exists)"
    return 0
  fi
  log "dry-run: would compress $base (${size} bytes) → $base.gz"
  if [ "$DRY_RUN" = "1" ]; then
    log "skipped (dry-run) $base"
    return 0
  fi
  rm -f -- "$tmp"
  if ! gzip -9 -c -- "$f" > "$tmp"; then
    log "skipped $base (gzip -9 failed, original kept)"
    rm -f -- "$tmp"
    return 0
  fi
  if ! gzip -t "$tmp" 2>/dev/null; then
    log "skipped $base (gzip -t on new .gz failed, original kept)"
    rm -f -- "$tmp"
    return 0
  fi
  mv -f -- "$tmp" "$gz"
  newsize="$(file_size "$gz")"
  sha="$(sha256sum "$gz" | awk '{print $1}')"
  rm -f -- "$f"
  RECLAIMED_BYTES=$((RECLAIMED_BYTES + size - newsize))
  COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))
  log "compressed $base → $base.gz (${size}→${newsize} bytes, sha256=$sha)"
}

# --- allowlist 1: pre-deploy-*.dump.gz older than 7 days ---
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_rolling_day_file "$f"; then
    log "kept $(basename "$f") (rolling day-file, never in scope)"
    KEPT_COUNT=$((KEPT_COUNT + 1))
    continue
  fi
  delete_file "$f"
done <<EOF
$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$ALLOW_PRE_DEPLOY_GZ" -mtime +7 -print 2>/dev/null)
EOF

# --- allowlist 1b: recent pre-deploy files are explicitly KEPT ---
while IFS= read -r f; do
  [ -n "$f" ] || continue
  log "kept $(basename "$f") (pre-deploy <7d, week's deploy net)"
  KEPT_COUNT=$((KEPT_COUNT + 1))
done <<EOF
$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$ALLOW_PRE_DEPLOY_GZ" ! -mtime +7 -print 2>/dev/null)
EOF

# --- allowlist 2: uncompressed legacy prod-backend-*-*.dump → compress ---
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_rolling_day_file "$f"; then
    log "kept $(basename "$f") (rolling day-file, never in scope)"
    KEPT_COUNT=$((KEPT_COUNT + 1))
    continue
  fi
  compress_legacy "$f"
done <<EOF
$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$ALLOW_UNCOMPRESSED_LEGACY" -print 2>/dev/null)
EOF

# --- allowlist 3: prod-ingestion-* top-level files only ---
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_rolling_day_file "$f"; then
    log "kept $(basename "$f") (rolling day-file, never in scope)"
    KEPT_COUNT=$((KEPT_COUNT + 1))
    continue
  fi
  delete_file "$f"
done <<EOF
$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$ALLOW_PROD_INGESTION" -print 2>/dev/null)
EOF

# --- allowlist 4: staging* top-level files only ---
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if is_rolling_day_file "$f"; then
    log "kept $(basename "$f") (rolling day-file, never in scope)"
    KEPT_COUNT=$((KEPT_COUNT + 1))
    continue
  fi
  delete_file "$f"
done <<EOF
$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$ALLOW_STAGING" -print 2>/dev/null)
EOF

log "legacy-cleanup done: deleted=$DELETED_COUNT compressed=$COMPRESSED_COUNT kept=$KEPT_COUNT reclaimed_bytes=$RECLAIMED_BYTES"
exit 0
