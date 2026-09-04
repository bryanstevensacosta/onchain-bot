#!/bin/bash
set -e

echo "=== Sync Production Config to Dev ==="
echo ""
echo "Copying these tables from production:"
echo "  - crypto_news_sources"
echo "  - channel_content_filter_configs"
echo "  - crypto_news_blacklist_phrases"
echo "  - crypto_news_publisher_llm_config"
echo "  - crypto_news_publisher_default_llm_settings"
echo "  - crypto_news_publisher_prompt_templates"
echo "  - crypto_news_ads + media + rotation"
echo ""

# Export from production via SSH
echo "📦 Exporting from production (you'll need SSH password)..."
ssh root@144.126.203.139 "docker exec alpha-meta-token-scanner-postgres pg_dump -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner --data-only --no-owner --no-privileges \
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
  --table=crypto_news_ads_throttle_state" > /tmp/prod-config.sql

echo "✅ Export complete ($(wc -l < /tmp/prod-config.sql) lines)"

# Clear dev tables
echo ""
echo "🗑️  Clearing dev tables..."
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -q <<EOF
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
echo "✅ Cleared"

# Import
echo ""
echo "📥 Importing..."
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -f /tmp/prod-config.sql -q
echo "✅ Imported"

# Verify
echo ""
echo "🔍 Verification:"
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "
SELECT 'sources' as table, COUNT(*) FROM crypto_news_sources
UNION ALL SELECT 'filters', COUNT(*) FROM channel_content_filter_configs
UNION ALL SELECT 'blacklist', COUNT(*) FROM crypto_news_blacklist_phrases
UNION ALL SELECT 'templates', COUNT(*) FROM crypto_news_publisher_prompt_templates
UNION ALL SELECT 'ads', COUNT(*) FROM crypto_news_ads
UNION ALL SELECT 'llm_config', COUNT(*) FROM crypto_news_publisher_llm_config;"

rm /tmp/prod-config.sql
echo ""
echo "✅ Done!"
