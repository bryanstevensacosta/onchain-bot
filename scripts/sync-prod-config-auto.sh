#!/bin/bash
set -e

# Automated script to sync production config to development
# Requires SSH keys configured for passwordless access to production

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment
if [ -f "$SCRIPT_DIR/.env.sync" ]; then
  set -a
  source "$SCRIPT_DIR/.env.sync"
  set +a
fi

PROD_HOST="${PROD_DB_HOST:-144.126.203.139}"
TEMP_FILE="/tmp/prod-config-$(date +%s).sql"

echo "=== Automated Production → Development Config Sync ==="
echo ""

# Step 1: Export from production via SSH
echo "📦 Exporting from production (via SSH)..."
ssh -o BatchMode=yes -o ConnectTimeout=10 root@$PROD_HOST \
  "PGPASSWORD='${PROD_DB_PASSWORD}' pg_dump \
    -h localhost \
    -p ${PROD_DB_PORT:-5432} \
    -U '${PROD_DB_USER}' \
    -d '${PROD_DB_NAME}' \
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
  > "$TEMP_FILE"

echo "✅ Export complete"

# Step 2: Clear dev tables
echo ""
echo "🗑️  Clearing development tables..."
PGPASSWORD="${DEV_DB_PASSWORD}" psql \
  -h "${DEV_DB_HOST:-localhost}" \
  -p "${DEV_DB_PORT:-5432}" \
  -U "${DEV_DB_USER}" \
  -d "${DEV_DB_NAME}" \
  <<EOF
SET session_replication_role = replica;
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
SET session_replication_role = DEFAULT;
EOF

echo "✅ Tables cleared"

# Step 3: Import to dev
echo ""
echo "📥 Importing to development..."
PGPASSWORD="${DEV_DB_PASSWORD}" psql \
  -h "${DEV_DB_HOST:-localhost}" \
  -p "${DEV_DB_PORT:-5432}" \
  -U "${DEV_DB_USER}" \
  -d "${DEV_DB_NAME}" \
  -f "$TEMP_FILE" \
  -q

echo "✅ Import complete"

# Step 4: Verify
echo ""
echo "🔍 Verifying counts..."
PGPASSWORD="${DEV_DB_PASSWORD}" psql \
  -h "${DEV_DB_HOST:-localhost}" \
  -p "${DEV_DB_PORT:-5432}" \
  -U "${DEV_DB_USER}" \
  -d "${DEV_DB_NAME}" \
  -c "SELECT 'crypto_news_sources' as table_name, COUNT(*) as count FROM crypto_news_sources
      UNION ALL
      SELECT 'content_filters', COUNT(*) FROM channel_content_filter_configs
      UNION ALL
      SELECT 'blacklist_phrases', COUNT(*) FROM crypto_news_blacklist_phrases
      UNION ALL
      SELECT 'prompt_templates', COUNT(*) FROM crypto_news_publisher_prompt_templates
      UNION ALL
      SELECT 'ads', COUNT(*) FROM crypto_news_ads;"

# Cleanup
echo ""
echo "🧹 Cleaning up..."
rm -f "$TEMP_FILE"

echo ""
echo "✅ Sync complete!"
