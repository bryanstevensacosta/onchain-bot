# Sistema Publisher — Database Schema

**PostgreSQL 16 + TypeORM 0.3**

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Publisher Queue](#publisher-queue)
3. [LLM Configuration](#llm-configuration)
4. [Keywords & Blacklist](#keywords--blacklist)
5. [Content Filters](#content-filters)
6. [Ads System](#ads-system)
7. [Deduplication](#deduplication)
8. [Shared State](#shared-state)
9. [Indexes](#indexes)
10. [Migrations](#migrations)

---

## Visión General

El sistema publisher usa **14 tablas** distribuidas en 3 bounded contexts:

| Bounded Context         | Tables                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| crypto-news-publisher   | publisher_queue, llm_config, prompt_templates, keywords, blacklist_phrases, publisher_throttle_state, publisher_slot_state |
| crypto-news-ads         | ads, ad_media, ad_media_library, ad_rotation_config, ad_rotation_state, ads_throttle_state                                 |
| crypto-news-integration | matching_config, dead_letter_queue                                                                                         |
| shared/deduplication    | dedup_records                                                                                                              |

**Naming Convention**: `crypto_news_<context>_<entity>`

---

## Publisher Queue

### crypto_news_publisher_queue

**Purpose**: FIFO buffer de mensajes matched pendientes de publicación

```sql
CREATE TABLE crypto_news_publisher_queue (
  -- Identity
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id                    VARCHAR NOT NULL,
  channel_id                  VARCHAR NOT NULL,
  message_id                  INTEGER NOT NULL,

  -- Content
  raw_content                 TEXT NOT NULL,
  raw_title                   VARCHAR,
  image_path                  VARCHAR,              -- DEPRECATED
  image_paths                 TEXT[],
  grouped_id                  VARCHAR,
  formatting_entities         TEXT,

  -- Matching
  matched_keyword_ids         TEXT[],
  keyword_template_id         UUID REFERENCES crypto_news_publisher_prompt_templates(id) ON DELETE SET NULL,

  -- Timestamps
  message_received_at         TIMESTAMPTZ NOT NULL,
  queued_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at                TIMESTAMPTZ,

  -- State
  status                      VARCHAR NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'BLOCKED')),
  telegram_message_id         VARCHAR,
  last_error                  TEXT,
  attempts                    INTEGER NOT NULL DEFAULT 0,

  -- LLM Generation
  generated_content           TEXT,
  generated_system_prompt     TEXT,
  generated_user_prompt       TEXT,
  generated_temperature       NUMERIC,
  generated_reasoning_effort  VARCHAR,
  generated_model             VARCHAR,

  -- Deduplication
  blocked_reason              TEXT,
  duplicate_of_channel_id     VARCHAR,
  duplicate_of_message_id     INTEGER,
  duplicate_of_entry_id       UUID REFERENCES crypto_news_publisher_queue(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT uq_channel_message UNIQUE (channel_id, message_id)
);

-- Indexes
CREATE INDEX idx_publisher_queue_status
  ON crypto_news_publisher_queue(status);

CREATE INDEX idx_publisher_queue_status_queued_at
  ON crypto_news_publisher_queue(status, queued_at)
  WHERE status = 'PENDING';

CREATE INDEX idx_publisher_queue_trace_id
  ON crypto_news_publisher_queue(trace_id);

CREATE INDEX idx_publisher_queue_published_at
  ON crypto_news_publisher_queue(published_at)
  WHERE status = 'PUBLISHED';

CREATE INDEX idx_publisher_queue_telegram_message_id
  ON crypto_news_publisher_queue(telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;
```

**Row Count**: ~1000 (TTL 24h + daily cap 20)

**Growth Rate**: +20-30/day, -20-30/day (cleanup)

---

## LLM Configuration

### crypto_news_publisher_llm_config

**Purpose**: Singleton config para LLM y publishing

```sql
CREATE TABLE crypto_news_publisher_llm_config (
  id                     INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  llm_enabled            BOOLEAN NOT NULL DEFAULT true,
  publishing_enabled     BOOLEAN NOT NULL DEFAULT true,
  default_template_id    UUID NOT NULL REFERENCES crypto_news_publisher_prompt_templates(id),
  llm_max_tokens         INTEGER NOT NULL DEFAULT 2000 CHECK (llm_max_tokens > 0),
  llm_max_attempts       INTEGER NOT NULL DEFAULT 3 CHECK (llm_max_attempts > 0),
  daily_cap              INTEGER NOT NULL DEFAULT 20 CHECK (daily_cap > 0 AND daily_cap <= 1000),
  daily_reset_utc_hour   INTEGER NOT NULL DEFAULT 0 CHECK (daily_reset_utc_hour >= 0 AND daily_reset_utc_hour <= 23),
  reject_non_latin       BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by             VARCHAR
);

-- Seed (after creating default template)
INSERT INTO crypto_news_publisher_llm_config (
  id, llm_enabled, publishing_enabled, default_template_id
) VALUES (
  1, true, false, '<default-template-uuid>'
)
ON CONFLICT (id) DO NOTHING;
```

**Row Count**: 1 (singleton)

---

### crypto_news_publisher_prompt_templates

**Purpose**: LLM prompt templates

```sql
CREATE TABLE crypto_news_publisher_prompt_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(200) NOT NULL UNIQUE,
  description          VARCHAR(1000),
  system_prompt        TEXT NOT NULL CHECK (LENGTH(system_prompt) <= 10000),
  user_prompt          TEXT NOT NULL CHECK (LENGTH(user_prompt) <= 10000),
  model                VARCHAR NOT NULL,
  temperature          NUMERIC NOT NULL CHECK (temperature >= 0 AND temperature <= 1),
  reasoning_effort     VARCHAR CHECK (reasoning_effort IN ('low', 'medium', 'high')),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           VARCHAR,
  updated_by           VARCHAR
);

CREATE INDEX idx_prompt_templates_active
  ON crypto_news_publisher_prompt_templates(is_active)
  WHERE is_active = true;

CREATE INDEX idx_prompt_templates_name
  ON crypto_news_publisher_prompt_templates(name);
```

**Row Count**: ~5-10

**Seed**:

```sql
INSERT INTO crypto_news_publisher_prompt_templates (
  name, description, system_prompt, user_prompt, model, temperature
) VALUES (
  'Default Crypto News',
  'Standard formatting for crypto news articles',
  'You are a professional crypto news editor...',
  'Title: {{title}}\n\nContent:\n{{content}}\n\n{{imageAnalysis}}',
  'gpt-4o',
  0.7
);
```

---

## Keywords & Blacklist

### crypto_news_publisher_keywords

**Purpose**: Keyword matching rules

```sql
CREATE TABLE crypto_news_publisher_keywords (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase             VARCHAR(200) NOT NULL,
  type               VARCHAR NOT NULL CHECK (type IN ('SIMPLE', 'AND_GROUP')),
  compound_phrases   TEXT[],                -- For AND_GROUP only
  channel_id         VARCHAR,               -- NULL = global
  priority           INTEGER NOT NULL DEFAULT 0,
  template_id        UUID REFERENCES crypto_news_publisher_prompt_templates(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         VARCHAR,
  updated_by         VARCHAR,

  CONSTRAINT chk_and_group_phrases
    CHECK (type != 'AND_GROUP' OR (compound_phrases IS NOT NULL AND array_length(compound_phrases, 1) >= 2))
);

CREATE INDEX idx_keywords_active
  ON crypto_news_publisher_keywords(is_active)
  WHERE is_active = true;

CREATE INDEX idx_keywords_channel
  ON crypto_news_publisher_keywords(channel_id);

CREATE INDEX idx_keywords_type
  ON crypto_news_publisher_keywords(type);
```

**Row Count**: ~50-100

---

### crypto_news_publisher_blacklist_phrases

**Purpose**: Blacklist phrases para bloquear contenido

```sql
CREATE TABLE crypto_news_publisher_blacklist_phrases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase      VARCHAR(500) NOT NULL,
  match_mode  VARCHAR NOT NULL CHECK (match_mode IN ('EXACT', 'CONTAINS', 'REGEX')),
  reason      TEXT,
  channel_id  VARCHAR,               -- NULL = global
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  VARCHAR,
  updated_by  VARCHAR
);

CREATE INDEX idx_blacklist_active
  ON crypto_news_publisher_blacklist_phrases(is_active)
  WHERE is_active = true;

CREATE INDEX idx_blacklist_channel
  ON crypto_news_publisher_blacklist_phrases(channel_id);
```

**Row Count**: ~20-50

---

## Content Filters

### channel_content_filter_configs

**Purpose**: Per-channel regex transforms

```sql
CREATE TABLE channel_content_filter_configs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   VARCHAR NOT NULL,     -- Opaque (no FK to sources)
  pattern      TEXT NOT NULL,
  replacement  TEXT NOT NULL DEFAULT '',
  flags        VARCHAR NOT NULL DEFAULT '',
  priority     INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   VARCHAR,
  updated_by   VARCHAR
);

CREATE INDEX idx_channel_filters_channel_id
  ON channel_content_filter_configs(channel_id);

CREATE INDEX idx_channel_filters_active
  ON channel_content_filter_configs(is_active)
  WHERE is_active = true;

CREATE INDEX idx_channel_filters_priority
  ON channel_content_filter_configs(channel_id, priority);
```

**Row Count**: ~100-200 (multiple filters per channel)

**Note**: `channel_id` es opaque string — no FK a `crypto_news_sources` (tabla vive en ingestion-telegram DB).

---

## Ads System

### crypto_news_ads

**Purpose**: Ad catalog

```sql
CREATE TABLE crypto_news_ads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text                  TEXT NOT NULL CHECK (LENGTH(text) <= 1024),
  media_type            VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO', 'TEXT_ONLY')),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  priority              INTEGER NOT NULL DEFAULT 0,
  scheduled_start_date  TIMESTAMPTZ,
  scheduled_end_date    TIMESTAMPTZ,
  last_published_at     TIMESTAMPTZ,
  publish_count         INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            VARCHAR,
  updated_by            VARCHAR,

  CONSTRAINT chk_scheduled_dates
    CHECK (scheduled_end_date IS NULL OR scheduled_start_date IS NULL OR scheduled_end_date > scheduled_start_date)
);

CREATE INDEX idx_ads_active
  ON crypto_news_ads(is_active)
  WHERE is_active = true;

CREATE INDEX idx_ads_scheduled
  ON crypto_news_ads(scheduled_start_date, scheduled_end_date);

CREATE INDEX idx_ads_last_published
  ON crypto_news_ads(last_published_at);
```

**Row Count**: ~10-50

---

### crypto_news_ad_media

**Purpose**: Ad media files (1:N con ads)

```sql
CREATE TABLE crypto_news_ad_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id             UUID NOT NULL REFERENCES crypto_news_ads(id) ON DELETE CASCADE,
  media_url         VARCHAR NOT NULL,
  media_type        VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  sequence          INTEGER NOT NULL DEFAULT 0,
  library_image_id  UUID REFERENCES crypto_news_ad_media_library(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_media_ad_id
  ON crypto_news_ad_media(ad_id);

CREATE INDEX idx_ad_media_sequence
  ON crypto_news_ad_media(ad_id, sequence);
```

**Row Count**: ~50-200 (multiple media per ad)

---

### crypto_news_ad_media_library

**Purpose**: Shared media pool

```sql
CREATE TABLE crypto_news_ad_media_library (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename       VARCHAR NOT NULL UNIQUE,
  original_name  VARCHAR NOT NULL,
  mime_type      VARCHAR NOT NULL,
  size_bytes     INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760), -- 10MB
  media_type     VARCHAR NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  storage_url    VARCHAR NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 0,
  description    TEXT,
  tags           TEXT[],
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     VARCHAR
);

CREATE INDEX idx_media_library_tags
  ON crypto_news_ad_media_library USING GIN(tags);

CREATE INDEX idx_media_library_media_type
  ON crypto_news_ad_media_library(media_type);

CREATE INDEX idx_media_library_filename
  ON crypto_news_ad_media_library(filename);
```

**Row Count**: ~100-500

---

### crypto_news_ad_rotation_config

**Purpose**: Rotation configuration (singleton)

```sql
CREATE TABLE crypto_news_ad_rotation_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  enabled               BOOLEAN NOT NULL DEFAULT false,
  interval_posts        INTEGER NOT NULL DEFAULT 10 CHECK (interval_posts > 0),
  min_hours_between_ads NUMERIC NOT NULL DEFAULT 2 CHECK (min_hours_between_ads >= 0),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            VARCHAR
);

-- Seed
INSERT INTO crypto_news_ad_rotation_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
```

**Row Count**: 1 (singleton)

---

### crypto_news_ad_rotation_state

**Purpose**: Rotation state tracking (singleton)

```sql
CREATE TABLE crypto_news_ad_rotation_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  posts_since_last_ad  INTEGER NOT NULL DEFAULT 0,
  last_ad_published_at TIMESTAMPTZ,
  last_ad_id           UUID REFERENCES crypto_news_ads(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_ad_rotation_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
```

**Row Count**: 1 (singleton)

---

### crypto_news_ads_throttle_state

**Purpose**: Ads throttle state (singleton, separate from news)

```sql
CREATE TABLE crypto_news_ads_throttle_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  last_publish_at  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_ads_throttle_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
```

**Row Count**: 1 (singleton)

---

## Deduplication

### dedup_records

**Purpose**: Fingerprint storage para semantic dedup

```sql
CREATE TABLE dedup_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash    VARCHAR NOT NULL,
  normalized_title    TEXT NOT NULL,
  normalized_content  TEXT NOT NULL,
  normalized_urls     TEXT[],
  raw_length          INTEGER NOT NULL,
  entry_id            UUID NOT NULL,  -- Soft FK to publisher_queue
  source              VARCHAR NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_fingerprint_source UNIQUE (fingerprint_hash, source)
);

CREATE INDEX idx_dedup_hash
  ON dedup_records(fingerprint_hash);

CREATE INDEX idx_dedup_source_recorded
  ON dedup_records(source, recorded_at DESC);

CREATE INDEX idx_dedup_entry_id
  ON dedup_records(entry_id);
```

**Row Count**: ~1000-5000 (30-day retention)

**Cleanup**: Daily cron deletes records >30 days old

---

## Shared State

### crypto_news_publisher_throttle_state

**Purpose**: News throttle state (singleton)

```sql
CREATE TABLE crypto_news_publisher_throttle_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  last_publish_at  TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_publisher_throttle_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
```

---

### crypto_news_publisher_slot_state

**Purpose**: Slot arbitrator state (singleton, shared between news y ads)

```sql
CREATE TABLE crypto_news_publisher_slot_state (
  id               INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  last_publish_at  TIMESTAMPTZ,
  last_scope       VARCHAR CHECK (last_scope IN ('news', 'ads')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed
INSERT INTO crypto_news_publisher_slot_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
```

---

### crypto_news_integration_matching_config

**Purpose**: Matching feature flag (singleton)

```sql
CREATE TABLE crypto_news_integration_matching_config (
  id         INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton
  enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR
);

-- Seed
INSERT INTO crypto_news_integration_matching_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;
```

---

### crypto_news_integration_dead_letter_queue

**Purpose**: Overflow queue para mensajes que no pueden enqueued

```sql
CREATE TABLE crypto_news_integration_dead_letter_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   VARCHAR NOT NULL,
  message_id   INTEGER NOT NULL,
  raw_content  TEXT NOT NULL,
  raw_title    VARCHAR,
  reason       VARCHAR NOT NULL,
  metadata     JSONB,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retried      BOOLEAN NOT NULL DEFAULT false,
  retried_at   TIMESTAMPTZ,

  CONSTRAINT uq_dlq_channel_message UNIQUE (channel_id, message_id)
);

CREATE INDEX idx_dlq_captured_at
  ON crypto_news_integration_dead_letter_queue(captured_at DESC);

CREATE INDEX idx_dlq_retried
  ON crypto_news_integration_dead_letter_queue(retried)
  WHERE retried = false;
```

**Row Count**: ~0-100 (only on overflow/errors)

---

## Indexes

### Performance Considerations

**Hot paths**:

1. `findNextPending()` — Index: `idx_publisher_queue_status_queued_at`
2. `findByChannelIdAndMessageId()` — Constraint: `uq_channel_message`
3. `countPublishedSince()` — Index: `idx_publisher_queue_published_at`
4. `findByHash()` — Index: `idx_dedup_hash`
5. `findActiveAds()` — Index: `idx_ads_active`

**Partial Indexes**:

- `WHERE status = 'PENDING'` — Only index pending entries (reduces index size)
- `WHERE is_active = true` — Only index active records
- `WHERE retried = false` — Only index unprocessed DLQ entries

**GIN Indexes**:

- `tags` (TEXT[]) — Full-text search en media library

---

## Migrations

### TypeORM Migrations

**Location**: `src/shared/common/persistence/migrations/`

**Commands**:

```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Run migrations (staging/prod)
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

### Key Migrations

**Historic**:

1. `1788844970659-BaselineSchema` — Initial schema
2. `1860000000001-DropIngestionOwnedCryptoNewsTables` — Backend DB split
3. `1875000000002-DropLlmConfigMatchingEnabled` — 3-flag separation
4. `1788659125192-SplitLlmConfigFlags` — llmEnabled + publishingEnabled
5. `1860000000000-AddQueuedAtToPublisherQueue` — TTL support

**Recent** (2026-09):

- Per-env ingestion split
- Semantic dedup integration
- Content filters FK removal

### Dev vs Prod

**Development**:

```typescript
// .env
DATABASE_SYNCHRONIZE = true; // TypeORM auto-sync
```

**Production**:

```typescript
// .env.production
DATABASE_SYNCHRONIZE = false;
DATABASE_MIGRATIONS_RUN = false; // Manual control
```

**Migration Script** (`scripts/run-migrations.sh`):

```bash
#!/bin/bash
npx typeorm migration:run -d src/shared/common/persistence/data-source.ts
```

---

## Database Diagram

```
┌──────────────────────┐
│ publisher_queue      │
│ (main FIFO buffer)   │
└──────────┬───────────┘
           │
           ├─► keywords (matched_keyword_ids[])
           ├─► prompt_templates (keyword_template_id FK)
           └─► dedup_records (entry_id soft FK)

┌──────────────────────┐
│ llm_config           │
│ (singleton)          │
└──────────┬───────────┘
           │
           └─► prompt_templates (default_template_id FK)

┌──────────────────────┐
│ ads                  │
└──────────┬───────────┘
           │
           ├─► ad_media (ad_id FK)
           │     └─► ad_media_library (library_image_id FK)
           └─► ad_rotation_state (last_ad_id FK)

┌──────────────────────┐
│ matching_config      │
│ (singleton)          │
└──────────────────────┘

┌──────────────────────┐
│ Shared State         │
│ (singletons)         │
├──────────────────────┤
│ • throttle_state     │
│ • slot_state         │
│ • rotation_config    │
│ • rotation_state     │
└──────────────────────┘
```

---

**Navegación**: [← 08-apis.md](./08-apis.md) | [10-content-filters.md →](./10-content-filters.md)
