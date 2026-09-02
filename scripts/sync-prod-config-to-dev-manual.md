# Manual Steps to Sync Production Config to Development

## Step 1: Export data from production

SSH to production server and run:

```bash
ssh root@144.126.203.139

# Once connected to production, export the data:
PGPASSWORD='alpha_meta_token_scanner' pg_dump \
  -h localhost \
  -p 5432 \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
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
  --table=crypto_news_ads_throttle_state \
  > /tmp/prod-config-export.sql

# Exit SSH
exit
```

## Step 2: Copy the dump file to your local machine

```bash
scp root@144.126.203.139:/tmp/prod-config-export.sql /tmp/
```

## Step 3: Clear development tables

```bash
PGPASSWORD='alpha_meta_token_scanner' psql \
  -h localhost \
  -p 5432 \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
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
```

## Step 4: Import to development

```bash
PGPASSWORD='alpha_meta_token_scanner' psql \
  -h localhost \
  -p 5432 \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
  -f /tmp/prod-config-export.sql
```

## Step 5: Verify

```bash
PGPASSWORD='alpha_meta_token_scanner' psql \
  -h localhost \
  -p 5432 \
  -U alpha_meta_token_scanner \
  -d alpha_meta_token_scanner \
  -c "SELECT 'crypto_news_sources' as table_name, COUNT(*) as count FROM crypto_news_sources
      UNION ALL
      SELECT 'channel_content_filter_configs', COUNT(*) FROM channel_content_filter_configs
      UNION ALL
      SELECT 'crypto_news_blacklist_phrases', COUNT(*) FROM crypto_news_blacklist_phrases
      UNION ALL
      SELECT 'crypto_news_publisher_prompt_templates', COUNT(*) FROM crypto_news_publisher_prompt_templates
      UNION ALL
      SELECT 'crypto_news_ads', COUNT(*) FROM crypto_news_ads;"
```

## Cleanup

```bash
rm /tmp/prod-config-export.sql
ssh root@144.126.203.139 "rm /tmp/prod-config-export.sql"
```
