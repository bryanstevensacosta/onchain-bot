#!/usr/bin/env bash
# =====================================================================
# Offsite backup sync — prod-backend rolling backups → R2 (default) / B2.
# T4 prod-backend-rolling-backup. Scheduled conceptually 03:20 UTC,
# 20 min AFTER the daily backup timer (03:00 UTC, T3
# infra/systemd/onchain-backend-backup.{service,timer}), so it mirrors
# the pair the timer just produced (T1 names: prod-backend-YYYYMMDD
# .dump.gz + .meta.txt).
#
# Install (droplet, out-of-band):
#   RCLONE_VERSION=1.69.0
#   curl -fsSLO "https://downloads.rclone.com/v1.69.0/rclone-v${RCLONE_VERSION}-linux-amd64.deb"
#   curl -fsSLO "https://downloads.rclone.com/v1.69.0/rclone-v${RCLONE_VERSION}-linux-amd64.deb.sha256"
#   sha256sum -c "rclone-v${RCLONE_VERSION}-linux-amd64.deb.sha256"
#   sudo dpkg -i "rclone-v${RCLONE_VERSION}-linux-amd64.deb"
#   install -m 600 -o runner /dev/null /opt/onchain-bot/.rclone-offsite.env
#   # then fill it (see RCLONE_ENV_FILE below). Never commit this file.
#
# CI secrets (GitHub Secrets, NOT systemd — systemd reads only the on-host file):
#   gh secret set R2_ENDPOINT
#   gh secret set R2_BUCKET
#   gh secret set R2_ACCESS_KEY_ID
#   gh secret set R2_SECRET_ACCESS_KEY
#
# B2 alternative: same script, different remote/endpoint — set
# R2_REMOTE to a B2 remote and R2_ENDPOINT to the B2 S3 endpoint
# (documented in docs/deployment/BACKUPS.md by T6).
#
# Remote-deletion ownership: THIS script is the SOLE owner of remote
# deletion (rclone delete --min-age 7d below). NEVER configure a bucket
# lifecycle rule alongside it. Verify with:
#   aws --endpoint-url "$R2_ENDPOINT" s3api get-bucket-lifecycle-configuration \
#     --bucket "$R2_BUCKET"
# expected: An error occurred (NoSuchLifecycleConfiguration). Do NOT touch
# the real bucket from dev — QA uses rclone --dry-run / stubs only.
#
# Secrets never hit logs: no env dump, rclone runs with --log-level NOTICE,
# and CI masks values with ::add-mask:: (see .github/workflows, T5).
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/onchain-bot/backups}"
BACKUP_BASENAME="${BACKUP_BASENAME:-prod-backend}"
RCLONE_ENV_FILE="${RCLONE_ENV_FILE:-/opt/onchain-bot/.rclone-offsite.env}"
RCLONE_BIN="${RCLONE_BIN:-rclone}"
DRY_RUN=0

# Bucket budget (single scale, shared with T5 health watchdog):
# warn >= 6.4 GB (80% of 8 GB), fail > 8 GB.
BUCKET_WARN_BYTES=6871947674   # 6.4 GiB
BUCKET_FAIL_BYTES=8589934592   # 8 GiB

usage() {
  echo "Usage: $0 [--dry-run]"
  echo "  Mirrors today's ${BACKUP_BASENAME}-YYYYMMDD pair offsite, then prunes remote >7d."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown arg '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

RCLONE_ARGS=(--log-level NOTICE)
if [ "$DRY_RUN" -eq 1 ]; then
  RCLONE_ARGS+=(--dry-run)
fi

# --- credentials: on-host file (droplet) or env (CI via GitHub Secrets) ---
if [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
  : # CI path: vars already exported from GitHub Secrets (masked via ::add-mask:: there)
else
  if [ ! -s "$RCLONE_ENV_FILE" ]; then
    echo "ERROR: missing credentials: file '$RCLONE_ENV_FILE' absent or empty," >&2
    echo "  and R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY not set in env." >&2
    echo "  Droplet: fill $RCLONE_ENV_FILE (chmod 600)." >&2
    echo "  CI: gh secret set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  set -a; . "$RCLONE_ENV_FILE"; set +a
fi

R2_REMOTE="${R2_REMOTE:?R2_REMOTE is not set (remote name, e.g. r2)}"
R2_ENDPOINT="${R2_ENDPOINT:?R2_ENDPOINT is not set}"
R2_BUCKET="${R2_BUCKET:?R2_BUCKET is not set}"
if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  echo "ERROR: missing credentials: R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY are empty." >&2
  exit 1
fi

if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::${R2_ACCESS_KEY_ID}"
  echo "::add-mask::${R2_SECRET_ACCESS_KEY}"
fi

DATE_PART="${FAKE_DATE:-$(date +%Y%m%d)}"
DUMP_FILE="$BACKUP_DIR/${BACKUP_BASENAME}-${DATE_PART}.dump.gz"
META_FILE="$BACKUP_DIR/${BACKUP_BASENAME}-${DATE_PART}.meta.txt"

if [ ! -s "$DUMP_FILE" ]; then
  echo "ERROR: today's dump '$DUMP_FILE' missing or empty; nothing to sync." >&2
  exit 1
fi
if [ ! -s "$META_FILE" ]; then
  echo "ERROR: today's meta '$META_FILE' missing or empty; nothing to sync." >&2
  exit 1
fi

export RCLONE_CONFIG_"$(printf '%s' "$R2_REMOTE" | tr '[:lower:]' '[:upper:]')"_TYPE=s3
export RCLONE_CONFIG_"$(printf '%s' "$R2_REMOTE" | tr '[:lower:]' '[:upper:]')"_PROVIDER=Cloudflare
export RCLONE_CONFIG_"$(printf '%s' "$R2_REMOTE" | tr '[:lower:]' '[:upper:]')"_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_"$(printf '%s' "$R2_REMOTE" | tr '[:lower:]' '[:upper:]')"_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_"$(printf '%s' "$R2_REMOTE" | tr '[:lower:]' '[:upper:]')"_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

echo "==> Syncing offsite (remote=$R2_REMOTE bucket=$R2_BUCKET date=$DATE_PART dry-run=$DRY_RUN)..."
rclone copy "$DUMP_FILE" "$META_FILE" "$R2_REMOTE:$R2_BUCKET"/ "${RCLONE_ARGS[@]}"

echo "==> Pruning remote objects older than 7 days (sole owner of remote deletion; no bucket lifecycle)..."
rclone delete --min-age 7d --include 'prod-backend-*' "$R2_REMOTE:$R2_BUCKET"/ "${RCLONE_ARGS[@]}"

# --- bucket budget check (warn >=6.4GB / fail >8GB; never fail on dry-run plumbing) ---
BUCKET_BYTES="${BUCKET_BYTES:-}"
if [ -z "$BUCKET_BYTES" ]; then
  if BUCKET_BYTES="$("$RCLONE_BIN" lsl "$R2_REMOTE:$R2_BUCKET"/ --include 'prod-backend-*' 2>/dev/null | awk '{s+=$1} END {print s+0}')"; then
    :
  else
    echo "::warning:: could not measure bucket size; skipping budget check"
    BUCKET_BYTES=""
  fi
fi
if [ -n "${BUCKET_BYTES:-}" ]; then
  case "$BUCKET_BYTES" in ''|*[!0-9]*) BUCKET_BYTES=0 ;; esac
  GB="$(awk "BEGIN {printf \"%.2f\", $BUCKET_BYTES/1073741824}")"
  if [ "$BUCKET_BYTES" -gt "$BUCKET_FAIL_BYTES" ]; then
    echo "::error:: bucket size ${GB}GB exceeds 8GB budget (bytes=$BUCKET_BYTES)" >&2
    exit 1
  fi
  if [ "$BUCKET_BYTES" -ge "$BUCKET_WARN_BYTES" ]; then
    echo "::warning:: bucket size ${GB}GB >= 6.4GB (80% of 8GB budget)"
  else
    echo "==> Bucket size ${GB}GB within budget."
  fi
fi

echo "==> Offsite sync complete."
