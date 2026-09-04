#!/bin/bash
set -e

# Load SSH password from .env.sync if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.sync" ]; then
  set -a
  source "$SCRIPT_DIR/.env.sync"
  set +a
fi

SSH_PASSWORD="${SSH_PASSWORD:-}"
if [ -z "$SSH_PASSWORD" ]; then
  echo "⚠️  SSH_PASSWORD not set in .env.sync"
  echo "Please add: SSH_PASSWORD=your_ssh_password"
  exit 1
fi

echo "=== Sync Production → Development Config ==="
echo ""

TEMP_FILE="/tmp/prod-config-$(date +%s).sql"

# Step 1: Export from production
echo "📦 Step 1/3: Exporting from production..."
sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no root@144.126.203.139 \
  "PGPASSWORD='mr.one2896' pg_dump -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner --data-only --no-owner --no-privileges --table=crypto_news_sources --table=channel_content_filter_configs --table=crypto_news_blacklist_phrases --table=crypto_news_publisher_llm_config --table=crypto_news_publisher_default_llm_settings --table=crypto_news_publisher_prompt_templates --table=crypto_news_ads --table=crypto_news_ad_media --table=crypto_news_ad_media_library --table=crypto_news_ad_rotation_config --table=crypto_news_ad_rotation_state --table=crypto_news_ads_throttle_state" \
  > "$TEMP_FILE"

echo "✅ Export complete ($(wc -l < "$TEMP_FILE") lines)"

# Step 2: Clear dev tables
echo ""
echo "🗑️  Step 2/3: Clearing development tables..."
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner <<EOF
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
echo "📥 Step 3/3: Importing to development..."
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -f "$TEMP_FILE" -q

echo "✅ Import complete"

# Verify
echo ""
echo "🔍 Verification:"
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "
SELECT 'sources' as table_name, COUNT(*) FROM crypto_news_sources
UNION ALL SELECT 'filters', COUNT(*) FROM channel_content_filter_configs
UNION ALL SELECT 'blacklist', COUNT(*) FROM crypto_news_blacklist_phrases
UNION ALL SELECT 'templates', COUNT(*) FROM crypto_news_publisher_prompt_templates
UNION ALL SELECT 'ads', COUNT(*) FROM crypto_news_ads
UNION ALL SELECT 'ad_media', COUNT(*) FROM crypto_news_ad_media
UNION ALL SELECT 'llm_config', COUNT(*) FROM crypto_news_publisher_llm_config;"

# Cleanup
rm -f "$TEMP_FILE"
echo ""
echo "✅ Sync complete!"
