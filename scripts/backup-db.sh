#!/usr/bin/env bash
# =====================================================================
# Database backup script — runs before each deploy.
# Produces a timestamped pg_dump in /opt/onchain-bot/backups/ on the Oracle server.
# Keeps the last 7 backups; older ones are pruned.
#
# Daily rolling mode (opt-in, T1 prod-backend-rolling-backup):
#   BACKUP_MODE=daily BACKUP_BASENAME=prod-backend BACKUP_ORIGIN=cron|pre-deploy
# produces prod-backend-YYYYMMDD.dump.gz + .meta.txt via .tmp + atomic mv,
# with validation, anti-empty guard, disk pre-flight, flock lock, prune to 7.
# Without these vars the legacy pre-deploy-* behavior is unchanged.
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/onchain-bot/backups}"
BACKUP_MODE="${BACKUP_MODE:-pre-deploy}"
BACKUP_BASENAME="${BACKUP_BASENAME:-prod-backend}"
BACKUP_ORIGIN="${BACKUP_ORIGIN:-cron}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/onchain-backend-backup.lock}"

# --- exclusive lock (single lock-path system-wide) ---
mkdir -p "$(dirname "$BACKUP_LOCK_FILE")" 2>/dev/null || true
exec 9>"$BACKUP_LOCK_FILE" || { echo "locked"; exit 3; }
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || { echo "locked"; exit 3; }
fi

CONTAINER_NAME="${POSTGRES_CONTAINER:-onchain-bot-postgres-dev}"
# Legacy names from the onchain-bot-<service>-<env> rename cutover.
# During a rename deploy the running container still has the OLD name while
# the workflow already passes the NEW one — probe candidates in order and
# use the first running container. Post-cutover the fallbacks never match.
# Override via POSTGRES_CONTAINER_FALLBACKS (space-separated) if needed.
FALLBACKS="${POSTGRES_CONTAINER_FALLBACKS:-onchain-bot-postgres onchain-bot-staging-postgres alpha-meta-token-scanner-postgres}"
DB_NAME="${POSTGRES_DB:-alpha_meta_token_scanner}"
DB_USER="${POSTGRES_USER:-alpha_meta_token_scanner}"

mkdir -p "$BACKUP_DIR"

# Clean stale .tmp leftovers from interrupted runs (both modes).
find "$BACKUP_DIR" -maxdepth 1 -name '*.tmp' -delete 2>/dev/null || true

file_size() {
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null || echo 0
}

do_dump_to_tmp() {
  # $1 = tmp file path. Dumps pg custom-format piped through gzip.
  # Returns pg_dump exit status; never touches the final file.
  local tmp="$1"
  local pg_status gz_status
  RUNNING_NAMES="$(docker ps --format '{{.Names}}')"
  FOUND=""
  for candidate in $CONTAINER_NAME $FALLBACKS; do
    if printf '%s\n' "$RUNNING_NAMES" | grep -q "^${candidate}$"; then
      FOUND="$candidate"
      break
    fi
  done
  set +e
  if [ -n "$FOUND" ]; then
    if [ "$FOUND" != "$CONTAINER_NAME" ]; then
      echo "==> Note: '$CONTAINER_NAME' not running, using legacy container '$FOUND'"
    fi
    CONTAINER_NAME="$FOUND"
    echo "==> Dumping from container $CONTAINER_NAME → $tmp"
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER_NAME" \
      pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
      | gzip > "$tmp"
    pg_status="${PIPESTATUS[0]:-0}"
    gz_status="${PIPESTATUS[1]:-0}"
  else
    echo "WARN: container '$CONTAINER_NAME' not running. Falling back to host pg_dump (if installed)."
    if command -v pg_dump >/dev/null 2>&1; then
      PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
        -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" \
        -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
        | gzip -c > "$tmp"
      pg_status="${PIPESTATUS[0]:-0}"
      gz_status="${PIPESTATUS[1]:-0}"
    else
      echo "ERROR: neither docker container nor local pg_dump available. Aborting." >&2
      set -e
      return 1
    fi
  fi
  set -e
  if [ "$pg_status" -ne 0 ]; then
    return "$pg_status"
  fi
  if [ "$gz_status" -ne 0 ]; then
    return "$gz_status"
  fi
  return 0
}

if [ "$BACKUP_MODE" = "daily" ]; then
  # --- validate BACKUP_ORIGIN ---
  case "$BACKUP_ORIGIN" in
    cron|pre-deploy) ;;
    *)
      echo "ERROR: invalid BACKUP_ORIGIN='$BACKUP_ORIGIN' (expected cron|pre-deploy)" >&2
      exit 2
      ;;
  esac

  # --- Oracle guard (FAKE_DATE set = QA override, skips the guard) ---
  if [ -z "${FAKE_DATE:-}" ]; then
    case "$BACKUP_DIR" in
      /opt/onchain-bot/backups|/data/backups/*) ;;
      *)
        echo "ERROR: daily mode requires BACKUP_DIR=/opt/onchain-bot/backups or /data/backups/* (got '$BACKUP_DIR'). Aborting." >&2
        exit 1
        ;;
    esac
  fi

  DATE_PART="${FAKE_DATE:-$(date +%Y%m%d)}"
  DUMP_FILE="$BACKUP_DIR/${BACKUP_BASENAME}-${DATE_PART}.dump.gz"
  META_FILE="$BACKUP_DIR/${BACKUP_BASENAME}-${DATE_PART}.meta.txt"
  TMP_FILE="$DUMP_FILE.tmp"
  rm -f "$TMP_FILE"

  # --- disk pre-flight (single scale: warn >=80%, fail >=90% or <2GB free) ---
  DF_USE_PCT="${BACKUP_DF_USE_PCT:-}"
  DF_AVAIL_KB="${BACKUP_DF_AVAIL_KB:-}"
  if [ -z "$DF_USE_PCT" ] || [ -z "$DF_AVAIL_KB" ]; then
    DF_LINE="$(df -P "$BACKUP_DIR" 2>/dev/null | awk 'NR==2 {print $5, $4}')"
    DF_USE_RAW="$(printf '%s' "$DF_LINE" | awk '{print $1}')"
    DF_AVAIL_RAW="$(printf '%s' "$DF_LINE" | awk '{print $2}')"
    [ -z "$DF_USE_PCT" ] && DF_USE_PCT="$(printf '%s' "$DF_USE_RAW" | tr -d '%')"
    [ -z "$DF_AVAIL_KB" ] && DF_AVAIL_KB="$DF_AVAIL_RAW"
  fi
  case "$DF_USE_PCT" in ''|*[!0-9]*) DF_USE_PCT=0 ;; esac
  case "$DF_AVAIL_KB" in ''|*[!0-9]*) DF_AVAIL_KB=0 ;; esac
  if [ "$DF_USE_PCT" -ge 90 ] || [ "$DF_AVAIL_KB" -lt 2097152 ]; then
    echo "::error:: disk pre-flight failed: use=${DF_USE_PCT}% avail=${DF_AVAIL_KB}KB (fail >=90% or <2GB free). Aborting before dump." >&2
    exit 1
  fi
  if [ "$DF_USE_PCT" -ge 80 ]; then
    echo "::warning:: disk use ${DF_USE_PCT}% >= 80% (avail ${DF_AVAIL_KB}KB)"
  fi

  # --- dump to .tmp in the same BACKUP_DIR ---
  DUMP_RC=0
  do_dump_to_tmp "$TMP_FILE" || DUMP_RC=$?
  if [ "$DUMP_RC" -ne 0 ]; then
    echo "ERROR: pg_dump failed (exit $DUMP_RC); NOT overwriting $DUMP_FILE" >&2
    rm -f "$TMP_FILE"
    exit "$DUMP_RC"
  fi

  # --- validate: gzip -t + size>0 + pg_restore --list if available ---
  TMP_SIZE="$(file_size "$TMP_FILE")"
  if [ "$TMP_SIZE" -le 0 ]; then
    echo "ERROR: validation failed: empty dump; NOT overwriting $DUMP_FILE" >&2
    rm -f "$TMP_FILE"
    exit 1
  fi
  if ! gzip -t "$TMP_FILE" 2>/dev/null; then
    echo "ERROR: validation failed: gzip -t; NOT overwriting $DUMP_FILE" >&2
    rm -f "$TMP_FILE"
    exit 1
  fi
  if command -v pg_restore >/dev/null 2>&1; then
    if ! gunzip -c "$TMP_FILE" 2>/dev/null | pg_restore --list >/dev/null 2>&1; then
      echo "ERROR: validation failed: pg_restore --list; NOT overwriting $DUMP_FILE" >&2
      rm -f "$TMP_FILE"
      exit 1
    fi
  fi

  # --- anti-empty guard: new valid <50% of largest existing valid dump ---
  EXISTING_MAX=0
  for existing in "$BACKUP_DIR"/${BACKUP_BASENAME}-*.dump.gz; do
    [ -e "$existing" ] || continue
    [ "$existing" = "$TMP_FILE" ] && continue
    if gzip -t "$existing" 2>/dev/null; then
      ES="$(file_size "$existing")"
      if [ "$ES" -gt "$EXISTING_MAX" ]; then
        EXISTING_MAX="$ES"
      fi
    fi
  done
  if [ "$EXISTING_MAX" -gt 0 ]; then
    if [ "$((TMP_SIZE * 2))" -lt "$EXISTING_MAX" ]; then
      echo "suspicious-size: new $TMP_SIZE bytes <50% of existing max $EXISTING_MAX bytes; NOT overwriting $DUMP_FILE" >&2
      echo "suspicious-size"
      rm -f "$TMP_FILE"
      exit 4
    fi
  fi

  # --- atomic publish + meta ---
  mv -f "$TMP_FILE" "$DUMP_FILE"
  SHA="$(sha256sum "$DUMP_FILE" | awk '{print $1}')"
  SIZE="$(file_size "$DUMP_FILE")"
  {
    echo "$SHA  $(basename "$DUMP_FILE")"
    echo "date=$DATE_PART"
    echo "sha256=$SHA"
    echo "origin=$BACKUP_ORIGIN"
    echo "BACKUP_ORIGIN=$BACKUP_ORIGIN"
    echo "size=$SIZE"
    echo "file=$(basename "$DUMP_FILE")"
  } > "$META_FILE"

  echo "==> Backup complete: $(ls -lh "$DUMP_FILE" | awk '{print $5}') origin=$BACKUP_ORIGIN"
  if [ "$SIZE" -gt 1073741824 ]; then echo "WARN dump >1GB ($SIZE bytes)"; fi

  # --- prune to exactly 7 files (dry-run print first) ---
  echo "==> Pruning daily backups older than 7 days (keeping 7)..."
  find "$BACKUP_DIR" -maxdepth 1 -name "${BACKUP_BASENAME}-*.dump*" -mtime +6 -print
  find "$BACKUP_DIR" -maxdepth 1 -name "${BACKUP_BASENAME}-*.dump*" -mtime +6 -delete
  find "$BACKUP_DIR" -maxdepth 1 -name "${BACKUP_BASENAME}-*.meta.txt" -mtime +6 -delete 2>/dev/null || true

  echo "==> Current backup set:"
  ls -lh "$BACKUP_DIR"/${BACKUP_BASENAME}-*.dump* 2>/dev/null || echo "  (none)"
  exit 0
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$BACKUP_DIR/pre-deploy-${TIMESTAMP}.dump.gz"

RUNNING_NAMES="$(docker ps --format '{{.Names}}')"
FOUND=""
for candidate in $CONTAINER_NAME $FALLBACKS; do
  if printf '%s\n' "$RUNNING_NAMES" | grep -q "^${candidate}$"; then
    FOUND="$candidate"
    break
  fi
done
if [ -n "$FOUND" ]; then
  if [ "$FOUND" != "$CONTAINER_NAME" ]; then
    echo "==> Note: '$CONTAINER_NAME' not running, using legacy container '$FOUND'"
  fi
  CONTAINER_NAME="$FOUND"
  echo "==> Dumping from container $CONTAINER_NAME → $DUMP_FILE"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER_NAME" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
    | gzip > "$DUMP_FILE"
else
  echo "WARN: container '$CONTAINER_NAME' not running. Falling back to host pg_dump (if installed)."
  if command -v pg_dump >/dev/null 2>&1; then
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
      -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" \
      -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
      | gzip -c > "$DUMP_FILE"
  else
    echo "ERROR: neither docker container nor local pg_dump available. Aborting." >&2
    exit 1
  fi
fi

echo "==> Backup complete: $(ls -lh "$DUMP_FILE" | awk '{print $5}')"

echo "==> Pruning backups older than 7 days..."
find "$BACKUP_DIR" -maxdepth 1 -name 'pre-deploy-*.dump*' -mtime +7 -delete
SIZE=$(stat -f%z "$DUMP_FILE" 2>/dev/null || stat -c%s "$DUMP_FILE" 2>/dev/null || echo 0); if [ "$SIZE" -gt 1073741824 ]; then echo "WARN dump >1GB ($SIZE bytes)"; fi

echo "==> Current backup set:"
ls -lh "$BACKUP_DIR"/pre-deploy-*.dump* 2>/dev/null || echo "  (none)"
