#!/bin/bash
set -e

# Script to sync production configuration to local development database
# Tables synced:
# - crypto_news_sources (crypto news sources)
# - channel_content_filter_configs (keywords for crypto news)
# - crypto_news_blacklist_phrases (blacklist phrases)
# - crypto_news_publisher_llm_config (LLM configuration)
# - crypto_news_publisher_default_llm_settings (default LLM settings)
# - crypto_news_publisher_prompt_templates (prompt templates)
# - crypto_news_ads (ads)
# - crypto_news_ad_media (ad media)
# - crypto_news_ad_media_library (ad media library)
# - crypto_news_ad_rotation_config (ad rotation schedule)
# - crypto_news_ad_rotation_state (ad rotation state)
# - crypto_news_ads_throttle_state (ads throttle state)

# Load environment variables from .env.sync if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.sync" ]; then
  echo "Loading environment from .env.sync..."
  set -a
  source "$SCRIPT_DIR/.env.sync"
  set +a
else
  echo "⚠️  Warning: .env.sync not found. Copy .env.sync.example to .env.sync and configure it."
  echo "   Using default values (may fail if not configured)"
  echo ""
fi

echo "=== Syncing Production Config to Development ==="
echo ""

# Production connection (via SSH tunnel or direct connection)
PROD_HOST="${PROD_DB_HOST:-144.126.203.139}"
PROD_PORT="${PROD_DB_PORT:-5432}"
PROD_DB="${PROD_DB_NAME:-alpha_meta_token_scanner}"
PROD_USER="${PROD_DB_USER:-user}"

# Development connection (local Docker)
DEV_HOST="${DEV_DB_HOST:-localhost}"
DEV_PORT="${DEV_DB_PORT:-5432}"
DEV_DB="${DEV_DB_NAME:-alpha_meta_token_scanner}"
DEV_USER="${DEV_DB_USER:-user}"

# Temp file for SQL dump
TEMP_SQL="/tmp/prod-config-sync-$(date +%s).sql"

echo "📦 Exporting data from production..."
echo "   Host: $PROD_HOST:$PROD_PORT (via SSH tunnel)"
echo "   Database: $PROD_DB"
echo ""

# Export data from production via SSH
ssh -T root@$PROD_HOST "PGPASSWORD='$PROD_DB_PASSWORD' pg_dump \
  -h localhost \
  -p $PROD_PORT \
  -U '$PROD_USER' \
  -d '$PROD_DB' \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=crypto_news_sources \
  --table=channel_content_filter_configs \
  --table=crypto_news_blacklist_phrases \
  --table=crypto_news_publisher_llm_config \
  --table=crypto_news_publisher_default_llm_settings \
  --table=crypto_news_publisher_prompt_templates \
  --table=crypto_news_ads \
  --table=crypto_news_ad_media \
  --table=crypto_news_ad_media_library \
  --table=crypto_news_ad_rotation_config \
  --table=crypto_news_ad_rotation_state \
  --table=crypto_news_ads_throttle_state" \
  > "$TEMP_SQL"

echo "✅ Export complete: $TEMP_SQL"
echo ""

echo "🗑️  Clearing development tables..."
echo "   Host: $DEV_HOST:$DEV_PORT"
echo "   Database: $DEV_DB"
echo ""

# Clear development tables (in reverse FK order to avoid constraint violations)
PGPASSWORD="$DEV_DB_PASSWORD" psql \
  -h "$DEV_HOST" \
  -p "$DEV_PORT" \
  -U "$DEV_USER" \
  -d "$DEV_DB" \
  <<EOF
-- Disable triggers temporarily for faster deletion
SET session_replication_role = replica;

-- Clear in reverse FK order
TRUNCATE TABLE channel_content_filter_configs CASCADE;
TRUNCATE TABLE crypto_news_blacklist_phrases CASCADE;
TRUNCATE TABLE crypto_news_publisher_prompt_templates CASCADE;
TRUNCATE TABLE crypto_news_publisher_default_llm_settings CASCADE;
TRUNCATE TABLE crypto_news_publisher_llm_config CASCADE;
TRUNCATE TABLE crypto_news_ad_media CASCADE;
TRUNCATE TABLE crypto_news_ad_media_library CASCADE;
TRUNCATE TABLE crypto_news_ads CASCADE;
TRUNCATE TABLE crypto_news_ad_rotation_state CASCADE;
TRUNCATE TABLE crypto_news_ad_rotation_config CASCADE;
TRUNCATE TABLE crypto_news_ads_throttle_state CASCADE;
TRUNCATE TABLE crypto_news_sources CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;
EOF

echo "✅ Development tables cleared"
echo ""

echo "📥 Importing production data to development..."

# Import to development
PGPASSWORD="$DEV_DB_PASSWORD" psql \
  -h "$DEV_HOST" \
  -p "$DEV_PORT" \
  -U "$DEV_USER" \
  -d "$DEV_DB" \
  -f "$TEMP_SQL" \
  > /dev/null

echo "✅ Import complete"
echo ""

echo "🧹 Cleaning up..."
rm -f "$TEMP_SQL"

echo "✅ Sync complete!"
echo ""
echo "Summary:"
echo "  ✓ Crypto news sources synced"
echo "  ✓ Content filter keywords synced"
echo "  ✓ Blacklist phrases synced"
echo "  ✓ LLM configuration synced"
echo "  ✓ Default LLM settings synced"
echo "  ✓ Prompt templates synced"
echo "  ✓ Ads synced"
echo "  ✓ Ad media synced"
echo "  ✓ Ad rotation schedule synced"
