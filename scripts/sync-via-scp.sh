#!/bin/bash
set -e

echo "=== Sync Production Config (2-step approach) ==="
echo ""

# Step 1: Create dump on production server
echo "📦 Step 1: Creating dump on production server..."
ssh root@144.126.203.139 <<'ENDSSH'
docker exec onchain-bot-postgres pg_dump \
  -h localhost \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
  --data-only \
  --no-owner \
  --no-privileges \
  --table=crypto_news_sources \
  --table=crypto_news_publisher_keywords \
  --table=crypto_news_publisher_llm_config \
  --table=crypto_news_publisher_prompt_templates \
  --table=crypto_news_ads \
  --table=crypto_news_ad_media \
  --table=crypto_news_ad_media_library \
  --table=crypto_news_ad_rotation_config \
  --table=crypto_news_ad_rotation_state \
  --table=crypto_news_ads_throttle_state \
  > /tmp/prod-config-dump.sql
echo "Dump created: $(wc -l < /tmp/prod-config-dump.sql) lines"
ENDSSH

echo "✅ Dump created on production"

# Step 2: Copy dump file to local
echo ""
echo "📥 Step 2: Downloading dump to local..."
scp root@144.126.203.139:/tmp/prod-config-dump.sql /tmp/prod-config-dump.sql
echo "✅ Downloaded ($(wc -l < /tmp/prod-config-dump.sql) lines)"

# Step 3: Clear dev tables
echo ""
echo "🗑️  Step 3: Clearing dev tables..."
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -q <<EOF
SET session_replication_role = replica;
TRUNCATE TABLE crypto_news_publisher_keywords CASCADE;
TRUNCATE TABLE crypto_news_publisher_prompt_templates CASCADE;
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

# Step 4: Import
echo ""
echo "📥 Step 4: Importing to dev..."
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -f /tmp/prod-config-dump.sql -q
echo "✅ Imported"

# Step 5: Verify
echo ""
echo "🔍 Step 5: Verification:"
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "
SELECT 'sources' as table, COUNT(*) FROM crypto_news_sources
UNION ALL SELECT 'keywords', COUNT(*) FROM crypto_news_publisher_keywords
UNION ALL SELECT 'templates', COUNT(*) FROM crypto_news_publisher_prompt_templates
UNION ALL SELECT 'ads', COUNT(*) FROM crypto_news_ads
UNION ALL SELECT 'llm_config', COUNT(*) FROM crypto_news_publisher_llm_config;"

# Cleanup
echo ""
echo "🧹 Cleanup..."
rm /tmp/prod-config-dump.sql
ssh root@144.126.203.139 "rm /tmp/prod-config-dump.sql"

echo ""
echo "✅ Sync complete!"
