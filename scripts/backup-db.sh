#!/usr/bin/env bash
# =====================================================================
# Database backup script — runs before each deploy.
# Produces a timestamped pg_dump in /opt/onchain-bot/backups/ on the droplet.
# Keeps the last 7 backups; older ones are pruned.
# =====================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/onchain-bot/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$BACKUP_DIR/pre-deploy-${TIMESTAMP}.dump"

CONTAINER_NAME="${POSTGRES_CONTAINER:-alpha-meta-token-scanner-postgres}"
DB_NAME="${POSTGRES_DB:-alpha_meta_token_scanner}"
DB_USER="${POSTGRES_USER:-alpha_meta_token_scanner}"

mkdir -p "$BACKUP_DIR"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> Dumping from container $CONTAINER_NAME → $DUMP_FILE"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$CONTAINER_NAME" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
    > "$DUMP_FILE"
else
  echo "WARN: container '$CONTAINER_NAME' not running. Falling back to host pg_dump (if installed)."
  if command -v pg_dump >/dev/null 2>&1; then
    PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
      -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" \
      -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner --no-acl \
      -f "$DUMP_FILE"
  else
    echo "ERROR: neither docker container nor local pg_dump available. Aborting." >&2
    exit 1
  fi
fi

echo "==> Backup complete: $(ls -lh "$DUMP_FILE" | awk '{print $5}')"

echo "==> Pruning backups older than 7 days..."
find "$BACKUP_DIR" -maxdepth 1 -name 'pre-deploy-*.dump' -mtime +7 -delete

echo "==> Current backup set:"
ls -lh "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null || echo "  (none)"