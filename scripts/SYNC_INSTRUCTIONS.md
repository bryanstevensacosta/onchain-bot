# Sync Production Config to Development - Instructions

## Quick Command (All-in-One)

Ejecuta este comando en tu terminal (requerirá autenticación SSH):

```bash
# Export from production → Import to dev
ssh root@144.126.203.139 "PGPASSWORD='alpha_meta_token_scanner' pg_dump -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner --data-only --no-owner --no-privileges --table=crypto_news_sources --table=channel_content_filter_configs --table=crypto_news_blacklist_phrases --table=crypto_news_publisher_llm_config --table=crypto_news_publisher_default_llm_settings --table=crypto_news_publisher_prompt_templates --table=crypto_news_ads --table=crypto_news_ad_media --table=crypto_news_ad_media_library --table=crypto_news_ad_rotation_config --table=crypto_news_ad_rotation_state --table=crypto_news_ads_throttle_state" | \
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "
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
" && echo "Tables cleared, importing..." && \
ssh root@144.126.203.139 "PGPASSWORD='alpha_meta_token_scanner' pg_dump -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner --data-only --no-owner --no-privileges --table=crypto_news_sources --table=channel_content_filter_configs --table=crypto_news_blacklist_phrases --table=crypto_news_publisher_llm_config --table=crypto_news_publisher_default_llm_settings --table=crypto_news_publisher_prompt_templates --table=crypto_news_ads --table=crypto_news_ad_media --table=crypto_news_ad_media_library --table=crypto_news_ad_rotation_config --table=crypto_news_ad_rotation_state --table=crypto_news_ads_throttle_state" | \
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner

# Verify counts
PGPASSWORD='alpha_meta_token_scanner' psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -c "
SELECT 'sources' as table_name, COUNT(*) FROM crypto_news_sources
UNION ALL SELECT 'filters', COUNT(*) FROM channel_content_filter_configs
UNION ALL SELECT 'blacklist', COUNT(*) FROM crypto_news_blacklist_phrases
UNION ALL SELECT 'templates', COUNT(*) FROM crypto_news_publisher_prompt_templates
UNION ALL SELECT 'ads', COUNT(*) FROM crypto_news_ads;"
```

## What This Does

1. **Clears** all development config tables
2. **Exports** production data for these tables:
   - `crypto_news_sources` - News channel sources
   - `channel_content_filter_configs` - Keywords for filtering
   - `crypto_news_blacklist_phrases` - Blacklist phrases
   - `crypto_news_publisher_llm_config` - LLM configuration
   - `crypto_news_publisher_default_llm_settings` - Default LLM settings
   - `crypto_news_publisher_prompt_templates` - Prompt templates
   - `crypto_news_ads` - Advertisement configuration
   - `crypto_news_ad_media` - Ad media files
   - `crypto_news_ad_media_library` - Ad media library
   - `crypto_news_ad_rotation_config` - Ad rotation schedule
   - `crypto_news_ad_rotation_state` - Ad rotation state
   - `crypto_news_ads_throttle_state` - Ads throttle state
3. **Imports** into local development database
4. **Verifies** record counts

## Alternative: Use the provided script

If you've configured SSH keys for passwordless access:

```bash
cd /Users/bryanstevens/dev/onchain-bot
./scripts/sync-prod-config-auto.sh
```

## Manual Steps

If you prefer step-by-step control, see: `sync-prod-config-to-dev-manual.md`
