#!/bin/bash
# Apply backfill_messages table migration to production database
# Usage: ./apply-backfill-migration.sh

set -e

echo "🔧 Applying backfill_messages table migration..."
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="${SCRIPT_DIR}/migrations/001-create-backfill-messages-table.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Error: Migration file not found at $MIGRATION_FILE"
  exit 1
fi

# Database connection details
DB_USER="alpha_meta_token_scanner"
DB_NAME="alpha_meta_token_scanner"
CONTAINER_NAME="onchain-bot-postgres"

echo "📊 Database: $DB_NAME"
echo "👤 User: $DB_USER"
echo "🐳 Container: $CONTAINER_NAME"
echo ""

# Check if running inside container or on host
if [ -f /.dockerenv ]; then
  # Running inside container
  echo "🐳 Running inside container, using direct psql..."
  psql -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"
else
  # Running on host, use docker exec
  echo "💻 Running on host, using docker exec..."
  docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$MIGRATION_FILE"
fi

echo ""
echo "✅ Migration applied successfully!"
echo ""
echo "🔍 Verifying table creation..."
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "\d backfill_messages" || psql -U "$DB_USER" -d "$DB_NAME" -c "\d backfill_messages"
