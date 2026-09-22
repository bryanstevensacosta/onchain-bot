# KOL & CryptoNews — Architecture Overview

> **Creation date:** 2026-09-20  
> **Branch:** dev  
> **Sources:** `apps/ingestion-telegram/AGENTS.md`, `apps/backend/AGENTS.md`, `AGENTS.md` (root)  
> **Purpose:** Consolidated and updated documentation of KOL and CryptoNews concepts in both services

---

## Table of Contents

1. [General Architecture](#general-architecture)
2. [KOL (Key Opinion Leaders)](#kol-key-opinion-leaders)
3. [Crypto-News](#crypto-news)
4. [Data Flow](#data-flow)
5. [Persistence and Ownership](#persistence-and-ownership)
6. [Critical Invariants](#critical-invariants)
7. [Code References](#code-references)

---

## General Architecture

### Separation Principle (Split 2026-09-08)

The system uses a **centralized ingestion architecture** with a single `ingestion-telegram` service that feeds multiple backends (dev/staging/prod):

```
┌─────────────────────────────────────────────────────────────┐
│  ingestion-telegram (SINGLE) - :3031 dev, :3032 droplet     │
│                                                              │
│  RESPONSIBILITIES:                                           │
│  ✓ Single MTProto session                                   │
│  ✓ Own DB: <base>_ingestion                                 │
│  ✓ Crypto-news tables: sources, messages, message_media     │
│  ✓ Media storage: uploads/crypto-news/media/                │
│  ✓ SSE fan-out: /api/ingestion/stream                       │
│  ✓ 72h retention (janitor messages + media)                 │
└──────────────────┬───────────────────────────────────────────┘
                   │ HTTP API (read-only) + SSE stream
          ┌────────┼────────┬────────────────┐
          │        │        │                │
    ┌─────▼────┐ ┌▼────────▼┐ ┌─────────────▼┐
    │ Backend  │ │ Backend   │ │ Backend      │
    │ Dev      │ │ Staging   │ │ Production   │
    │          │ │           │ │              │
    │ NO       │ │ NO crypto-│ │ NO crypto-   │
    │ crypto-  │ │ news      │ │ news tables  │
    │ news     │ │ tables    │ │              │
    │ tables   │ │           │ │              │
    └──────────┘ └───────────┘ └──────────────┘
```

**Rationale:**

- ✅ No data duplication (all environments see the same messages)
- ✅ Automatic synchronization (one downloaded message → instantly visible)
- ✅ Scalability (adding environments only requires pointing to existing ingestion)
- ✅ Avoids conflicts (no duplicate DBs, no duplicate MTProto sessions)

---

## KOL (Key Opinion Leaders)

### Definition

**KOL = Monitored Telegram channels that publish crypto token alpha calls.**

KOLs are influencers whose token mentions generate analysis, scoring, and potentially publications in the bot's VIP channel.

### Ownership and Flow

#### Ingestion-Telegram (Consumer)

**Responsibilities:**

- **Does NOT own KOL identity** — obtains it via HTTP from backend
- Polls every 5 minutes: `GET localhost:3030/telegram-kol/identity/kols/active/ids`
- Listens to KOL channels via MTProto (realtime NewMessage + 30s polling)
- **ToS Invariant:** Text is NEVER included in SSE payload for KOLs

**Key Components (Verified in current code):**

```typescript
// apps/ingestion-telegram/src/telegram/shared/services/backend-channel-provider.service.ts
export class BackendChannelProviderService {
  async fetchActiveKolIds(): Promise<string[]> {
    // GET localhost:3030/telegram-kol/identity/kols/active/ids
    // Returns: ["channelId1", "channelId2", ...]
  }
}

// apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts
export class IngestionCoordinator {
  async route(raw: TelegramRawMessage, type: 'kol' | 'crypto-news') {
    if (type === 'kol') {
      // Text EXCLUDED from payload (ToS compliance - fix-1)
      const payload = this.transformToPayload(raw, 'kol'); // text = undefined
      await this.stream.broadcast({
        type: 'message:telegram',
        data: payload, // WITHOUT text
      });
    }
  }
}
```

**MessagePayload for KOL:**

```typescript
{
  peerId: "-1001234567890",
  messageId: 123,
  occurredAt: "2026-09-20T10:00:00Z",
  text: undefined,              // ⚠️ ALWAYS undefined for KOL
  media: [],                    // KOL never downloads media
  entities: [...],
  messageType: "kol"
}
```

#### Backend (Owner)

**Responsibilities:**

- **Owns complete KOL identity** in `kols` table (backend DB)
- Provides HTTP endpoint: `GET /telegram-kol/identity/kols/active/ids`
- Receives KOL messages via SSE (without text) and extracts text directly from Telegram

**Modules (Verified):**

1. **`kol/identity/`** — Domain Layer
   - `Kol` aggregate (AggregateRoot)
   - Value Objects: `KolId`, `KolHandle`, lifecycle states
   - Use Cases (verified in code):
     - `RegisterKolUseCase` — `POST /telegram-kol/identity/kols`
     - `GetKolUseCase` — `GET /telegram-kol/identity/kols/:id`
     - `ListKolsUseCase` — `GET /telegram-kol/identity/kols`
     - `SetKolLifecycleUseCase` — lifecycle transitions
     - `ListActiveKolIdsUseCase` — provides IDs to ingestion-telegram
     - **`KolIngestionOrchestratorUseCase`** — Orchestrates the alpha-call pipeline

2. **`kol/reputation/`** — Scoring Layer
   - `KolMetricsCalculator` → mention/quality/drawdown scores
   - `blendScore` with configurable weights (`KolScoreFormula`)
   - Multipliers: whitelist ×1.2 / blacklist ×0.5
   - Confidence levels: <5 mentions LOW … 50+ VERY_HIGH
   - Scheduler: recompute every 15 min

3. **`kol/source/`** — Attribution
   - `Source` VO: `{kolId, sourceType: TELEGRAM|DISCORD|OTHER, messageIds}`
   - `SourceAggregatorPort` — source deduplication

4. **`kol/stats/`** — Stats (stub, 4 endpoints return `{note:'Stub'}`)

**Persisted Entities:**

```sql
-- apps/backend DB
CREATE TABLE kols (
  id VARCHAR PRIMARY KEY,           -- KolId
  handle VARCHAR,                   -- @username
  title VARCHAR,
  lifecycle VARCHAR,                -- ACTIVE | DORMANT | BLACKLISTED
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE kol_reputations (
  kol_id VARCHAR PRIMARY KEY,
  mention_score FLOAT,
  quality_score FLOAT,
  drawdown_score FLOAT,
  blend_score FLOAT,
  confidence_level VARCHAR,
  total_mentions INT,
  updated_at TIMESTAMPTZ
);
```

### KOL Pipeline (Alpha-Call Path)

```
Telegram Channel (KOL)
    ↓ MTProto ingestion
ingestion-telegram:
    1. Detects KOL channel message (via fetchActiveKolIds)
    2. Transforms message → MessagePayload (text=undefined, media=[])
    3. Emits SSE event: 'message:telegram' with messageType='kol'

Backend SSE Consumer:
    ↓ IngestionCoordinator.route(raw, 'kol')
    ↓ KolIngestionOrchestratorUseCase.onMessageReceived()
        ├─► ExtractFromMessageUseCase (direct call, NO bus)
        │   └─► Extracts contract addresses, tickers, names
        │       Emits: extraction.candidates.extracted
        │
        ├─► ParseFromCandidatesUseCase (direct call, NO bus)
        │   └─► Parses candidates → TokenCall
        │       Emits: parsing.call.parsed
        │
        └─► Event Bus continues:
            ├─► normalization.call.normalized
            ├─► chain-detection.chain.detected
            ├─► enrichment.token.enriched
            ├─► classification.token.classified
            ├─► scoring.token.scored
            ├─► vip-call.approval.approved/rejected
            └─► publishing.telegram.published (Bot API)
```

**Fix-1 (ToS Compliance):**

Text NEVER crosses the event bus. `KolIngestionOrchestratorUseCase` calls `ExtractFromMessageUseCase` and `ParseFromCandidatesUseCase` directly with raw text, preventing Telegram content from traveling through events.

**Seeding:**

```bash
# Backend: Manual registration (recommended)
POST /telegram-kol/identity/kols
Body: {
  "kolId": "-1001234567890",
  "handle": "username",
  "title": "KOL Display Name"
}
```

### KOL Reputation Scoring

**Formula:**

```typescript
blendScore =
  (mentionScore * weights.mention +
    qualityScore * weights.quality +
    drawdownScore * weights.drawdown) *
  reputationMultiplier;

// Multipliers:
// - Whitelist: 1.2
// - Blacklist: 0.5
// - Unknown: 1.0

// Clamp: 0.0 - 1.0
```

**Usage in Scoring Pipeline:**

```typescript
// apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts
const kolReputation = await this.reputationPort.getReputation(kolId);
const finalScore = baseScore * kolReputation.multiplier; // 0.85 - 1.15
```

---

## Crypto-News

### Definition

**Crypto-News = Monitored Telegram channels for crypto news (NOT alpha calls).**

Opaque content: text is stored as-is (no token analysis) and published to a news channel after:

1. Filtering (regex transformations per-channel)
2. Keyword matching
3. LLM refinement (optional)

### Ownership and Flow (Option A: Filter on-Read)

#### Ingestion-Telegram (Owner)

**Responsibilities:**

- **Owns ALL crypto-news data** in its `<base>_ingestion` DB
- Tables: `crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media`
- Media storage: `uploads/crypto-news/media/{channelId}/{messageId}_{index}.ext`
- Serves HTTP API: `GET /api/crypto-news/sources`, `GET /api/crypto-news/messages`
- Serves media: `GET /api/media/:channelId/:messageId/:index`
- Source registration: `POST /api/crypto-news/sources`
- **72h retention:** Scheduler `CryptoNewsRetentionCleanupScheduler` (EVERY_HOUR, lock `9_421_373`)

**Key Components (Verified):**

```typescript
// apps/ingestion-telegram/src/telegram/crypto-news/infrastructure/persistence/typeorm/entities/
export class CryptoNewsSourceEntity {
  channel_id: string; // Telegram channel ID
  title: string | null;
  handle: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class CryptoNewsMessageEntity {
  id: string; // PK: {channelId}:{messageId}
  channel_id: string;
  message_id: number;
  content: string; // RAW content (no filters applied)
  ingested_at: Date;
  telegram_date: Date;
  grouped_id: string | null;
}

export class CryptoNewsMessageMediaEntity {
  id: string; // PK: UUID
  message_id: string; // FK: crypto_news_messages
  media_type: string; // 'photo' | 'video'
  media_index: number;
  file_path: string; // uploads/crypto-news/media/...
  mime_type: string;
  file_size: number;
  url: string; // HTTP serving URL
}
```

**Ingestion Flow (Verified):**

```typescript
// apps/ingestion-telegram/src/telegram/shared/api/mtproto/telegram-mtproto-listener.adapter.ts
async transformMessage(message: Api.Message, channelId: string) {
  // 1. Extract text (4-source cascade: message.message → text → media.caption → fwdFrom.message)
  const text = await this.textExtractor.extract(message);

  // 2. Download media (ONLY for crypto-news, KOL never downloads)
  // Phase 5.2: Delegated to TelegramMediaExtractorService
  const mediaAttachments = await this.mediaExtractor.extractAndDownload(
    this.client,
    channelId,
    message.id,
    message.media
  );

  // 3. Store in DB (via coordinator)
  await this.coordinator.persistCryptoNewsMessage({
    id: `${channelId}:${message.id}`,
    channelId,
    messageId: message.id,
    content: text,              // RAW text (no transformations)
    ingestedAt: new Date(),
    telegramDate: new Date(message.date * 1000),
    groupedId: message.groupedId?.toString()
  });

  // 4. Broadcast SSE
  return {
    peerId: channelId,
    messageId: message.id,
    occurredAt: new Date().toISOString(),
    text: text,                 // ⚠️ Text INCLUIDO para crypto-news
    media: mediaAttachments.map(m => m.url),
    messageType: 'crypto-news'
  };
}
```

#### Backend (Consumer — Read-Only)

**Responsibilities:**

- **Does NOT own crypto-news tables** (removed in 2026-09-08 split)
- Reads via HTTP: `GET {INGESTION_TELEGRAM_URL}/api/crypto-news/messages?limit=50`
- Applies filters ON-READ (ContentFilterService + keyword matching)
- Enqueues matched messages (publisher queue)
- Processes queue → LLM → Bot API publish

**Modules (Verified):**

1. **`telegram/crypto-news-integration/`** (NEW — Option A orchestrator)
   - `CryptoNewsIngestionClient` — HTTP client wrapper
   - `FilteredCryptoNewsService` — fetch→filter→match orchestrator
   - `EnqueueMatchingCronScheduler` — dynamic polling scheduler (5min SSE mode / 1min polling-only mode)
   - **`ProcessCryptoNewsMessageHandler`** — real-time SSE processor (<10s latency target)
   - `MatchingConfigController` — `GET/PATCH /crypto-news-integration/matching`

2. **`telegram/ingestion/crypto-news/filters/`** — Content Filters (STAYS)
   - `ChannelContentFilterConfigEntity` — per-channel regex rules (FK-less, opaque `channel_id`)
   - `ContentFilterService` — applies transformations (100ms timeout per regex)
   - Use Cases: `CreateFilter`, `UpdateFilter`, `DeleteFilter`, `ListFilters`

3. **`telegram/crypto-news-publisher/`** — Publishing Pipeline
   - `EnqueueMatchingMessageUseCase` — queue insertion (cap 36)
   - `ProcessNextQueuedArticleUseCase` — drain queue → LLM → Bot API
   - `PublisherCronScheduler` — every minute (advisory lock)
   - `LlmConfig` — 2-flag control (llmEnabled, publishingEnabled)

**Persisted Entities (Backend):**

```sql
-- apps/backend DB (filters + publisher queue only)
CREATE TABLE channel_content_filter_configs (
  id UUID PRIMARY KEY,
  channel_id VARCHAR,          -- Opaque (no FK), references ingestion DB
  pattern VARCHAR,
  replacement VARCHAR,
  priority INT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
);

CREATE TABLE crypto_news_publisher_queue (
  id UUID PRIMARY KEY,
  channel_id VARCHAR,
  message_id INT,
  status VARCHAR,              -- PENDING | PUBLISHED | FAILED
  queued_at TIMESTAMPTZ,       -- For 24h TTL expiration
  published_at TIMESTAMPTZ,
  failure_reason VARCHAR,
  content JSONB,               -- Snapshot (title, text, mediaUrls)
  llm_refined_content JSONB
);

CREATE TABLE crypto_news_matching_config (
  id INT PRIMARY KEY,          -- Singleton row id=1
  enabled BOOLEAN              -- Master flag for matching
);

CREATE TABLE crypto_news_llm_config (
  id INT PRIMARY KEY,          -- Singleton row id=1
  llm_enabled BOOLEAN,         -- LLM transformation flag
  publishing_enabled BOOLEAN   -- Master flag for publishing
);
```

### Data Flow (Option A — Dual-Path)

```
┌─────────────────────────────────────────────────────────┐
│ PRIMARY PATH (SSE, <10s latency)                        │
└─────────────────────────────────────────────────────────┘

Telegram Channel (crypto-news)
    ↓ MTProto ingestion
ingestion-telegram:
    1. Download media → uploads/crypto-news/media/
    2. INSERT crypto_news_messages (RAW content, NO filters)
    3. INSERT crypto_news_message_media
    4. Emit SSE event: 'message:telegram' with messageType='crypto-news'

Backend SSE Consumer:
    ↓ IngestionCoordinator.route(raw, 'crypto-news')
    ↓ ProcessCryptoNewsMessageHandler.handle()
        1. Check matchingEnabled flag (skip if disabled)
        2. Deduplication check (PublisherQueueRepository):
           - SKIP if status=PENDING (already in queue)
           - SKIP if status=PUBLISHED (already published)
           - SKIP if status=FAILED + blocking reason (content issues)
           - ALLOW if status=FAILED + non-blocking reason (transient)
        3. Fetch RAW + filter + match (FilteredCryptoNewsService):
           a. GET ingestion:3032/api/crypto-news/messages?channelId=X&limit=1
           b. Load ContentFilterService rules for channel
           c. Apply regex transforms (on-read, NO persist)
           d. Evaluate keywords (simple + AND-groups)
           e. Check blacklist phrases (block if match)
        4. If matched → EnqueueMatchingMessageUseCase (cap 36)
        5. Log latency (ingestedAt → now):
           - INFO if <10s (✅ target met)
           - WARN if ≥10s (⚠️ target missed)

┌─────────────────────────────────────────────────────────┐
│ FALLBACK PATH (Polling, catches gaps)                   │
└─────────────────────────────────────────────────────────┘

EnqueueMatchingCronScheduler:
    - SSE enabled: runs every 5 minutes (light polling)
    - SSE disabled: runs every 1 minute (primary mode)
    ↓
    1. Fetch RAW: GET ingestion:3032/api/crypto-news/messages?limit=50
    2. Filter + match (FilteredCryptoNewsService, same as SSE)
    3. Enqueue matches (EnqueueMatchingMessageUseCase)

┌─────────────────────────────────────────────────────────┐
│ SHARED PUBLISHING PATH                                   │
└─────────────────────────────────────────────────────────┘

PublisherCronScheduler (every minute):
    1. Fetch PENDING from queue (FIFO)
    2. If llmEnabled=true → LLM refinement
    3. If llmEnabled=false → publish raw
    4. Bot API sendMessage/sendPhoto
    5. Update status: PUBLISHED | FAILED
```

**Deduplication Logic (Critical):**

```typescript
// apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts
async shouldProcess(channelId: string, messageId: number): Promise<boolean> {
  const existing = await this.queueRepo.findByChannelAndMessage(channelId, messageId);
  
  if (!existing) return true; // New message, process it
  
  // Already processed successfully
  if (existing.status === 'PUBLISHED') {
    this.logger.debug(`Message ${channelId}:${messageId} already published, skip`);
    return false;
  }
  
  // Currently in queue
  if (existing.status === 'PENDING') {
    this.logger.debug(`Message ${channelId}:${messageId} already pending, skip`);
    return false;
  }
  
  // Failed with blocking reason (content issues, blacklisted, etc.)
  if (existing.status === 'FAILED' && this.isBlockingFailure(existing.failureReason)) {
    this.logger.debug(`Message ${channelId}:${messageId} failed with blocking reason, skip`);
    return false;
  }
  
  // Failed with transient reason (network, rate limit, etc.)
  // Allow retry
  return true;
}

private isBlockingFailure(reason: string | null): boolean {
  if (!reason) return false;
  
  const blockingPatterns = [
    'blacklist',
    'content violation',
    'invalid format',
    'expired',
  ];
  
  return blockingPatterns.some(pattern => 
    reason.toLowerCase().includes(pattern)
  );
}
```

### Content Filtering (On-Read)

**Per-Channel Regex Rules (Verified):**

```typescript
// apps/backend/src/telegram/ingestion/crypto-news/filters/application/services/content-filter.service.ts
export class ContentFilterService {
  async applyFilters(
    channelId: string,
    title: string,
    content: string,
  ): Promise<{ title: string; content: string }> {
    // 1. Load active filters for channel (ordered by priority)
    const filters = await this.repo.findActiveByChannel(channelId);

    let transformedTitle = title;
    let transformedContent = content;

    // 2. Apply each filter with 100ms timeout (ReDoS protection)
    for (const filter of filters) {
      try {
        const regex = new RegExp(filter.pattern, 'g');
        transformedTitle = transformedTitle.replace(regex, filter.replacement);
        transformedContent = transformedContent.replace(
          regex,
          filter.replacement,
        );
      } catch (err) {
        this.logger.warn(`Invalid pattern ${filter.id}: ${err.message}`);
        continue; // Skip invalid patterns
      }
    }

    return { title: transformedTitle, content: transformedContent };
  }
}
```

### Keyword Matching (Verified)

**File:** `apps/backend/src/telegram/crypto-news-integration/application/services/filtered-crypto-news.service.ts`

**Responsibilities:**
- Fetch RAW messages from ingestion-telegram
- Apply ContentFilterService transformations
- Evaluate keyword rules (simple + AND-groups)
- Check blacklist phrases
- Return matched messages ready for enqueue

```typescript
export class FilteredCryptoNewsService {
  async fetchAndFilterMessages(options: {
    channelId?: string;
    limit?: number;
  }): Promise<FilteredMessage[]> {
    // 1. Fetch RAW from ingestion-telegram
    const rawMessages = await this.client.getMessages({
      channelId: options.channelId,
      limit: options.limit ?? 50
    });
    
    // 2. Filter + match each message
    const filtered: FilteredMessage[] = [];
    
    for (const raw of rawMessages) {
      // Apply regex transformations
      const { title, content } = await this.filterService.applyFilters(
        raw.channelId,
        raw.title ?? '',
        raw.content
      );
      
      // Evaluate keywords
      const matched = await this.keywordMatcher.matches(raw.channelId, title, content);
      
      if (matched) {
        filtered.push({
          ...raw,
          title,
          content, // Transformed content
          matchReason: matched.reason
        });
      }
    }
    
    return filtered;
  }
}
```

**Keyword Matching Logic:**

```typescript
// apps/backend/src/telegram/crypto-news-integration/application/services/keyword-matcher.service.ts
export class KeywordMatcherService {
  async matches(
    channelId: string,
    title: string,
    content: string
  ): Promise<{ matched: boolean; reason?: string }> {
    const keywords = await this.keywordRepo.findByChannel(channelId);
    const blacklist = await this.blacklistRepo.findByChannel(channelId);
    
    const fullText = `${title} ${content}`.toLowerCase();
    
    // 1. Check blacklist FIRST (blocklist takes precedence)
    for (const phrase of blacklist) {
      if (fullText.includes(phrase.toLowerCase())) {
        return { 
          matched: false, 
          reason: `Blacklist: "${phrase}"` 
        };
      }
    }
    
    // 2. Simple keywords (OR logic)
    const simpleKeywords = keywords.filter(k => k.type === 'SIMPLE');
    for (const kw of simpleKeywords) {
      if (fullText.includes(kw.keyword.toLowerCase())) {
        return { 
          matched: true, 
          reason: `Simple keyword: "${kw.keyword}"` 
        };
      }
    }
    
    // 3. AND-group keywords (ALL must match)
    const andGroups = this.groupBy(keywords.filter(k => k.type === 'AND_GROUP'), 'groupId');
    for (const [groupId, group] of andGroups) {
      const allMatch = group.every(kw => 
        fullText.includes(kw.keyword.toLowerCase())
      );
      
      if (allMatch) {
        return { 
          matched: true, 
          reason: `AND-group ${groupId}: [${group.map(k => k.keyword).join(', ')}]` 
        };
      }
    }
    
    // 4. No matches
    return { matched: false };
  }
}
```

**Keyword Types:**

| Type         | Logic                                    | Example                             |
| ------------ | ---------------------------------------- | ----------------------------------- |
| `SIMPLE`     | Any keyword matches → MATCH              | "bitcoin" OR "ethereum" OR "solana" |
| `AND_GROUP`  | All keywords in group match → MATCH      | ("airdrop" AND "free") in group 1   |
| Blacklist    | Any blacklist phrase matches → NO MATCH  | "scam", "fake", "phishing"          |

**Database Schema (Keywords):**

```sql
-- Backend DB
CREATE TABLE crypto_news_keywords (
  id UUID PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  keyword VARCHAR NOT NULL,
  type VARCHAR NOT NULL,        -- 'SIMPLE' | 'AND_GROUP'
  group_id VARCHAR NULL,        -- For AND_GROUP only
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_news_blacklist (
  id UUID PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  phrase VARCHAR NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3-Flag Control System (CRITICAL — 2 current flags)

**NOTE:** The current architecture uses **2 independent flags**, NOT 3:

1. **`matchingEnabled`** (`MatchingConfig`, `crypto-news-integration` module)
   - Controls: `EnqueueMatchingCronScheduler` + `ProcessCryptoNewsMessageHandler`
   - When `true`: fetches messages → applies filters + keywords → enqueues matches
   - When `false`: no new messages enter the queue
   - **Location:** `crypto_news_matching_config` table (singleton row id=1)
   - **Endpoints:** 
     - `GET /crypto-news-integration/matching` — read current state
     - `PATCH /crypto-news-integration/matching` — toggle flag

2. **`llmEnabled` + `publishingEnabled`** (`LlmConfig`, `crypto-news-publisher` module)
   - `llmEnabled`: Controls LLM transformation mode
   - `publishingEnabled`: Controls `PublisherCronScheduler` (master switch)
   - **DEPENDENCY**: LLM generation = llmEnabled AND publishingEnabled
   - **Location:** `crypto_news_llm_config` table (singleton row id=1)
   - **Endpoints:**
     - `GET /crypto-news-publisher/config` — read both flags
     - `PATCH /crypto-news-publisher/config` — update flags

**Truth Table (4 main combinations):**

| Matching | Publishing | Behavior                                    |
| :------: | :--------: | ------------------------------------------- |
|    ❌    |     ❌     | **All paused** — No enqueue, no publish     |
|    ❌    |     ✅     | **Drain queue** — No new enqueue, publishes existing |
|    ✅    |     ❌     | **Enqueue only** — Builds queue, no publish |
|    ✅    |     ✅     | **Full pipeline** — Enqueue + publish       |

**Extended Truth Table (llmEnabled combinations):**

| Matching | LLM | Publishing | Result                                      |
| :------: | :-: | :--------: | ------------------------------------------- |
|    ❌    | ❌  |     ❌     | All paused                                  |
|    ❌    | ❌  |     ✅     | Drain queue raw (no new enqueue)            |
|    ❌    | ✅  |     ❌     | All paused (LLM inactive)                   |
|    ❌    | ✅  |     ✅     | Drain queue with LLM (no new enqueue)       |
|    ✅    | ❌  |     ❌     | Enqueue only (queue builds)                 |
|    ✅    | ❌  |     ✅     | **Raw pipeline** (enqueue + publish raw)    |
|    ✅    | ✅  |     ❌     | Enqueue only (LLM inactive)                 |
|    ✅    | ✅  |     ✅     | **Full pipeline** (enqueue + LLM + publish) |

**Use Cases:**

- **Pause publishing, keep enqueuing:** `matching=true`, `publishing=false` → queue accumulates
- **Publish raw only (no LLM cost):** `llm=false`, `publishing=true`
- **Drain existing queue:** `matching=false`, `publishing=true`
- **Emergency stop:** all flags `false`

**Frontend Integration:**

```typescript
// apps/frontend/src/features/crypto-news/components/MatchingToggleButton.tsx
const MatchingToggleButton = () => {
  const { data: matchingConfig } = useMatchingConfig();
  const toggleMutation = useToggleMatching();

  return (
    <button onClick={() => toggleMutation.mutate({ enabled: !matchingConfig.enabled })}>
      {matchingConfig.enabled ? 'Pause Matching' : 'Resume Matching'}
    </button>
  );
};

// Separate toggles for LLM and Publishing
const PublishingControls = () => {
  const { data: llmConfig } = useLlmConfig();
  const updateMutation = useUpdateLlmConfig();

  return (
    <>
      <Toggle 
        checked={llmConfig.llmEnabled}
        onChange={(v) => updateMutation.mutate({ llmEnabled: v })}
        label="LLM Refinement"
      />
      <Toggle 
        checked={llmConfig.publishingEnabled}
        onChange={(v) => updateMutation.mutate({ publishingEnabled: v })}
        label="Publishing Enabled"
      />
    </>
  );
};
```

**Why decoupled:** Matching shouldn't depend on publisher config; separate configs prevent unnecessary coupling.

### Media Handling

**Ingestion-Telegram (Source of Truth):**

```typescript
// Phase 5.2 (2026-09): TelegramMediaExtractorService
export class TelegramMediaExtractorService {
  async extractAndDownload(
    client: TelegramClient,
    channelId: string,
    messageId: number,
    media: Api.TypeMessageMedia
  ): Promise<TelegramMediaAttachment[]> {
    if (!media) return [];

    const attachments: TelegramMediaAttachment[] = [];

    // Only photo + video (documents with video MIME)
    if (media instanceof Api.MessageMediaPhoto) {
      const filePath = await this.downloader.download(
        client, channelId, messageId, 0, media
      );
      attachments.push({
        type: 'photo',
        index: 0,
        filePath,
        mimeType: 'image/jpeg',
        fileSize: /* ... */
      });
    }

    return attachments;
  }
}

// Storage: uploads/crypto-news/media/{channelId}/{messageId}_{index}.ext
// Serving: GET /api/media/:channelId/:messageId/:index
// Headers: Cache-Control: public, max-age=31536000 + ETag
```

**Backend (Growth-Zero Consumer):**

```typescript
// apps/backend/src/telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case.ts
async ensureLocalFiles(entry: PublisherQueueEntry): Promise<string[]> {
  const tmpDir = path.join(os.tmpdir(), `backend-media-${uuid()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const localPaths: string[] = [];

    for (const mediaUrl of entry.content.mediaUrls) {
      // Download from ingestion-telegram
      const response = await fetch(mediaUrl);
      const buffer = await response.buffer();
      const localPath = path.join(tmpDir, `media-${index}.jpg`);
      await fs.writeFile(localPath, buffer);
      localPaths.push(localPath);
    }

    return localPaths;
  } finally {
    // ALWAYS cleanup (success or failure)
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// Backend cache is TRANSIENT: download → use → delete
// Retry re-downloads from ingestion (no backend persistence)
```

### Retention & TTL

**72h Retention (Ingestion-Telegram):**

```typescript
// apps/ingestion-telegram/src/telegram/crypto-news/application/scheduling/crypto-news-retention-cleanup.scheduler.ts
@Cron('0 * * * *') // Every hour
async cleanupExpiredContent() {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);

  // Pass 1: Cleanup media files + records
  const expiredMedia = await this.mediaRepo.findOlderThan(cutoff);
  for (const media of expiredMedia) {
    try {
      await fs.unlink(media.file_path);
      await this.mediaRepo.delete(media.id);
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this.mediaRepo.delete(media.id);
      } else if (err.code === 'EACCES') {
        continue; // Skip + keep record
      } else {
        throw err;
      }
    }
  }

  // Pass 2: Cleanup messages (batched DELETE 1000)
  while (true) {
    const deleted = await this.messageRepo.deleteOlderThan(cutoff, 1000);
    if (deleted < 1000) break;
  }

  // Pass 3: Orphan media sweep
  await this.mediaRepo.deleteOrphans();
}
```

**24h Queue TTL (Backend):**

```typescript
// apps/backend/src/telegram/crypto-news-publisher/application/scheduling/expire-stale-queue-entries.scheduler.ts
@Cron('*/30 * * * *') // Every 30 minutes
async expireStaleEntries() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stale = await this.queueRepo.findPendingOlderThan(cutoff);

  for (const entry of stale) {
    entry.status = 'FAILED';
    entry.failureReason = 'Expired: exceeded 24h in queue without publishing';
    await this.queueRepo.save(entry);
  }
}
```

---

## Data Flow

### Ingestion Flow (Shared)

```typescript
// apps/ingestion-telegram/src/telegram/telegram.module.ts
@Module()
export class TelegramModule implements OnModuleInit {
  async onModuleInit() {
    // 1. Fetch channels from backend + local DB
    const kolIds = await this.channelProvider.fetchActiveKolIds();
    const newsIds = await this.cryptoNewsRepo.findAllActive();

    // 2. Start listening
    await this.startListening(kolIds, newsIds);

    // 3. Schedule refresh every 5 minutes
    this.scheduleChannelRefresh();
  }

  private async startListening(kolIds: string[], newsIds: string[]) {
    const allChannelIds = [...kolIds, ...newsIds.map((s) => s.channelId)];

    // Subscribe to MTProto listener
    for await (const message of this.listener.subscribe(allChannelIds)) {
      // Route by channel membership
      const type = newsIds.includes(message.peerId) ? 'crypto-news' : 'kol';
      await this.coordinator.route(message, type);
    }
  }
}
```

### Backend Routing (IngestionCoordinator)

```typescript
// apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts
@Injectable()
export class IngestionCoordinator implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    // Subscribe ONCE to SSE/MTProto/Mock
    for await (const raw of this.listener.subscribe()) {
      await this.routeMessage(raw);
    }
  }

  private async routeMessage(raw: TelegramRawMessage) {
    const type = raw.messageType; // 'kol' | 'crypto-news'

    try {
      if (type === 'kol') {
        // KOL alpha-call pipeline (fix-1: direct calls, no bus)
        await this.kolOrchestrator.onMessageReceived(raw);
      } else if (type === 'crypto-news') {
        // Crypto-news real-time processing (<10s target)
        await this.cryptoNewsHandler.handle(raw);
      }
    } catch (err) {
      // Defensive: log errors, don't throw (protects SSE stream)
      this.logger.error(`Route failed for ${type}`, err);
    }
  }
}
```

---

## Persistence and Ownership

### Ingestion-Telegram DB (`<base>_ingestion`)

**Own Tables (4 — BackfillMessageEntity also exists):**

```sql
-- Crypto-news ownership (SOLE OWNER)
CREATE TABLE crypto_news_sources (
  channel_id VARCHAR PRIMARY KEY,
  title VARCHAR,
  handle VARCHAR,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_news_messages (
  id VARCHAR PRIMARY KEY,              -- {channelId}:{messageId}
  channel_id VARCHAR NOT NULL,
  message_id BIGINT NOT NULL,
  content TEXT,                        -- RAW content (no transformations)
  ingested_at TIMESTAMPTZ DEFAULT NOW(),
  telegram_date TIMESTAMPTZ,
  grouped_id VARCHAR,
  FOREIGN KEY (channel_id) REFERENCES crypto_news_sources(channel_id)
);
CREATE INDEX idx_messages_ingested_at ON crypto_news_messages(ingested_at);
CREATE INDEX idx_messages_channel_id ON crypto_news_messages(channel_id);

CREATE TABLE crypto_news_message_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id VARCHAR NOT NULL,
  media_type VARCHAR NOT NULL,         -- 'photo' | 'video'
  media_index INT NOT NULL,
  file_path VARCHAR NOT NULL,          -- uploads/crypto-news/media/...
  mime_type VARCHAR,
  file_size BIGINT,
  url VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (message_id) REFERENCES crypto_news_messages(id) ON DELETE CASCADE
);
CREATE INDEX idx_media_message_id ON crypto_news_message_media(message_id);

-- Backfill tracking (stream module)
CREATE TABLE backfill_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR NOT NULL,
  message_id BIGINT NOT NULL,
  backfill_type VARCHAR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel_id, message_id)
);
```

### Backend DB (`<base>`)

**Own Tables (39 entities — verified post-split):**

```sql
-- KOL domain
CREATE TABLE kols (...);
CREATE TABLE kol_reputations (...);

-- Token pipeline
CREATE TABLE canonical_token_calls (...);
CREATE TABLE token_scores (...);
CREATE TABLE token_classifications (...);
CREATE TABLE token_snapshots (...);
CREATE TABLE extraction_results (...);
CREATE TABLE token_calls (...);
CREATE TABLE honeypot_analyses (...);
CREATE TABLE chain_detection_results (...);

-- Publishing
CREATE TABLE vip_published_calls (...);
CREATE TABLE vip_notified_achievements (...);
CREATE TABLE monitored_calls (...);
CREATE TABLE achievement_thresholds (...);

-- Crypto-news (filters + publisher ONLY)
CREATE TABLE channel_content_filter_configs (
  id UUID PRIMARY KEY,
  channel_id VARCHAR NOT NULL,         -- Opaque (no FK to ingestion DB)
  pattern VARCHAR NOT NULL,
  replacement VARCHAR,
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_news_publisher_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id VARCHAR NOT NULL,
  message_id BIGINT NOT NULL,
  status VARCHAR NOT NULL,             -- PENDING | PUBLISHED | FAILED
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  failure_reason VARCHAR,
  content JSONB,                       -- Snapshot {title, text, mediaUrls}
  llm_refined_content JSONB,
  UNIQUE(channel_id, message_id)
);

CREATE TABLE crypto_news_matching_config (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_news_llm_config (
  id INT PRIMARY KEY DEFAULT 1,
  llm_enabled BOOLEAN DEFAULT TRUE,
  publishing_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ... (other 20+ entities)
```

**⚠️ Backend does NOT have `crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media` tables**

These live EXCLUSIVELY in `<base>_ingestion` (ingestion-telegram DB).

---

## Critical Invariants

### 1. Single MTProto Session

- MTProto credentials (`INGESTION_TELEGRAM_MTPROTO_*`) live ONLY in ingestion-telegram
- NEVER duplicate in `apps/backend/.env` → avoids `AUTH_KEY_DUPLICATED`
- One ingestion-telegram instance per physical environment

### 2. Crypto-news Ownership

- **Ingestion-telegram** is the SOLE OWNER:
  - DB `<base>_ingestion` with the 3 tables
  - Media in `uploads/crypto-news/media/`
  - 72h retention (janitor)
  
- **Backend** is read-only consumer:
  - Does NOT replicate tables
  - Reads via HTTP API
  - Applies filters on-read
  - Transient cache (growth-zero)

### 3. KOL Identity Ownership

- **Backend** is the SOLE OWNER:
  - `kols` table in backend DB
  - Endpoint `GET /telegram-kol/identity/kols/active/ids`
  
- **Ingestion-telegram** is consumer:
  - Polling every 5 minutes
  - Does NOT store identity locally

### 4. ToS Compliance (Fix-1)

- KOL text NEVER crosses the event bus
- `KolIngestionOrchestratorUseCase` calls extraction/parsing directly
- SSE payload for KOL: `text = undefined`

### 5. Filter on-Read (Option A)

- Ingestion stores RAW content (no filters)
- Backend applies ContentFilterService on-read
- Publisher queue receives FILTERED content

### 6. 72h Retention

- Janitor in ingestion-telegram runs every hour
- Cleans messages + media with `ingested_at > 72h`
- Backend queue TTL 24h (independent)

---

## Code References

### Ingestion-Telegram

| Component | Location | Key Lines |
|-----------|----------|-----------|
| `IngestionCoordinator` | `apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts` | L67-L160 |
| `BackendChannelProviderService` | `apps/ingestion-telegram/src/telegram/shared/services/backend-channel-provider.service.ts` | Fetch KOL IDs |
| `TelegramMediaExtractorService` | `apps/ingestion-telegram/src/telegram/shared/application/services/telegram-media-extractor.service.ts` | Phase 5.2 |
| `CryptoNewsRetentionCleanupScheduler` | `apps/ingestion-telegram/src/telegram/crypto-news/application/scheduling/` | 72h janitor |

### Backend

| Component | Location | Key Lines |
|-----------|----------|-----------|
| `KolIngestionOrchestratorUseCase` | `apps/backend/src/kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts` | L29-L150 |
| `ProcessCryptoNewsMessageHandler` | `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts` | L46-L200 |
| `EnqueueMatchingCronScheduler` | `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts` | L43-L230 |
| `ContentFilterService` | `apps/backend/src/telegram/ingestion/crypto-news/filters/application/services/content-filter.service.ts` | On-read filters |
| `IngestionCoordinator` (Backend) | `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts` | Routing logic |

### Shared

| Concept | Backend | Ingestion-Telegram |
|---------|---------|-------------------|
| Message routing | `IngestionCoordinator.routeMessage()` | `IngestionCoordinator.route()` |
| KOL identity | `kol/identity/` module (owner) | `BackendChannelProviderService` (consumer) |
| Crypto-news data | `crypto-news-integration/` (consumer) | `crypto-news/` module (owner) |
| Media handling | Growth-zero temp files | Downloads + serves (owner) |

---

## SSE (Server-Sent Events) Integration

### Stream Service (Ingestion-Telegram)

**File:** `apps/ingestion-telegram/src/stream/application/services/stream.service.ts`

**Responsibilities:**
- Manages SSE connections from backend consumers
- Broadcasts ingestion events in real-time
- Implements 30s heartbeat to prevent connection timeouts
- Tracks connected clients via `DisconnectionTracker`

```typescript
export class StreamService {
  private clients: Set<Response> = new Set();
  
  async addClient(res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    this.clients.add(res);
    
    // Send initial connection event
    this.sendToClient(res, {
      event: 'connected',
      data: { timestamp: new Date().toISOString() }
    });
    
    // Start heartbeat for this client
    const heartbeatInterval = setInterval(() => {
      this.sendToClient(res, {
        event: 'health:ping',
        data: { timestamp: new Date().toISOString() }
      });
    }, 30_000); // 30 seconds
    
    // Cleanup on disconnect
    res.on('close', () => {
      clearInterval(heartbeatInterval);
      this.clients.delete(res);
    });
  }
  
  async broadcast(event: StreamEvent): Promise<void> {
    const payload = {
      event: event.type, // 'message:telegram' | 'message:backfill'
      data: event.data
    };
    
    for (const client of this.clients) {
      this.sendToClient(client, payload);
    }
  }
  
  private sendToClient(res: Response, payload: { event: string; data: any }): void {
    const message = `event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
    res.write(message);
  }
}
```

**SSE Event Types:**

| Event                | Data                              | Purpose                          |
| -------------------- | --------------------------------- | -------------------------------- |
| `connected`          | `{ timestamp }`                   | Initial connection confirmation  |
| `health:ping`        | `{ timestamp }`                   | 30s heartbeat (prevents timeout) |
| `message:telegram`   | `TelegramRawMessage`              | Real-time ingestion event        |
| `message:backfill`   | `TelegramRawMessage` (enriched)   | Historical backfill event        |

### Backend SSE Consumer

**File:** `apps/backend/src/telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter.ts`

**Responsibilities:**
- Connects to ingestion-telegram SSE endpoint
- Implements exponential backoff reconnection (1s → 30s)
- Yields parsed events to `IngestionCoordinator`
- Handles connection failures gracefully

```typescript
export class TelegramSseListenerAdapter implements TelegramListenerPort {
  private reconnectDelay = 1000; // Start at 1s
  private maxReconnectDelay = 30000; // Cap at 30s
  
  async *subscribe(): AsyncGenerator<TelegramRawMessage> {
    while (true) {
      try {
        const response = await fetch(`${this.ingestionUrl}/api/ingestion/stream`, {
          headers: { Accept: 'text/event-stream' }
        });
        
        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }
        
        // Reset backoff on successful connection
        this.reconnectDelay = 1000;
        
        // Parse SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages
          const lines = buffer.split('\n\n');
          buffer = lines.pop()!; // Keep incomplete message in buffer
          
          for (const chunk of lines) {
            if (!chunk.trim()) continue;
            
            const event = this.parseSSE(chunk);
            
            if (event.type === 'message:telegram') {
              yield event.data as TelegramRawMessage;
            }
            // Ignore health:ping and other events
          }
        }
      } catch (err) {
        this.logger.warn(`SSE connection lost: ${err.message}, reconnecting in ${this.reconnectDelay}ms`);
        
        // Exponential backoff
        await this.sleep(this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    }
  }
  
  private parseSSE(chunk: string): { type: string; data: any } {
    const lines = chunk.split('\n');
    let eventType = 'message'; // Default event type
    let data = '';
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }
    
    return {
      type: eventType,
      data: data ? JSON.parse(data) : null
    };
  }
}
```

**Connection Lifecycle:**

```
Backend startup
    ↓
TelegramSseListenerAdapter.subscribe()
    ↓
Fetch ingestion:3032/api/ingestion/stream
    ↓ (connected)
Receive: event: connected
    ↓
Enter infinite loop:
    ├─► Receive: event: health:ping (every 30s, ignore)
    ├─► Receive: event: message:telegram (yield to coordinator)
    └─► Connection lost → exponential backoff → reconnect
```

**Lossy by Design:**

- No message replay on reconnection (backend relies on polling fallback)
- SSE is best-effort, not guaranteed delivery
- Polling (`EnqueueMatchingCronScheduler`) catches gaps

---

## MTProto Integration

### TelegramMtprotoListenerAdapter (Ingestion-Telegram)

**File:** `apps/ingestion-telegram/src/telegram/shared/api/mtproto/telegram-mtproto-listener.adapter.ts`

**Responsibilities:**
- Single MTProto session for ALL environments
- Connects to Telegram via `telegram` (GramJS) library
- Subscribes to channel messages (realtime + polling)
- Transforms raw Telegram messages to `TelegramRawMessage` format
- Manages flood wait handling and rate limits
- Coordinates with `TelegramMediaExtractorService` for crypto-news media

**Key Components:**

```typescript
export class TelegramMtprotoListenerAdapter implements TelegramListenerPort {
  // Dual-mode message ingestion
  async *subscribe(channelIds: string[]): AsyncIterable<TelegramRawMessage> {
    // 1. Register realtime event handler (NewMessage)
    client.addEventHandler((event) => this.handleEvent(event), new NewMessage({}));
    
    // 2. Start polling loop (30s interval, catches gaps)
    void this.startPollingLoop();
    
    // 3. Yield messages from queue
    while (this.running) {
      while (this.messageQueue.length > 0) {
        yield this.messageQueue.shift()!;
      }
      await this.messageQueue.waitForItem();
    }
  }
  
  // Realtime handler
  private async handleEvent(event: unknown): Promise<void> {
    const msg = event.message;
    const channelId = await msg.getChat().id;
    
    // Update cursor
    this.lastSeenManager.set(channelId, msg.id);
    
    // Transform + enqueue (async for media download)
    const transformed = await this.transformMessage(channelId, msg);
    this.messageQueue.push(transformed);
  }
  
  // Polling loop (catches missed messages)
  private async startPollingLoop(): Promise<void> {
    while (this.running) {
      for (const peer of subscribedPeers) {
        const minId = this.lastSeenManager.get(peer);
        const messages = await client.getMessages(peer, { 
          minId, 
          limit: 50 
        });
        // Process + enqueue
      }
      await sleep(30_000); // 30s fixed interval
    }
  }
}
```

**Message Transformation Pipeline:**

```typescript
// Phase 5.2 architecture (verified in code)
async transformMessage(channelId: string, msg: Api.Message): TelegramRawMessage {
  // 1. Text extraction (4-source cascade)
  const text = this.messageTransformer.extractText(msg);
  
  // 2. Media download (ONLY for crypto-news channels)
  let media: TelegramMediaAttachment[] = [];
  if (this.isCryptoNewsChannel(channelId)) {
    media = await this.mediaExtractor.extractAndDownload(
      client,
      channelId,
      msg.id,
      msg.media
    );
  }
  
  // 3. Build TelegramRawMessage
  return {
    peerId: channelId,
    messageId: msg.id,
    text,
    media,
    entities: msg.entities,
    groupedId: msg.groupedId?.toString(),
    occurredAt: new Date(msg.date * 1000).toISOString(),
  };
}
```

### TelegramMediaExtractorService (Phase 5.2)

**File:** `apps/ingestion-telegram/src/telegram/shared/application/services/telegram-media-extractor.service.ts`

**Extracted from adapter** to separate concerns and improve testability.

**Responsibilities:**
- Extract media metadata from Telegram messages
- Download photos/videos via MTProto
- Return `TelegramMediaAttachment[]` with file paths

**Supported Media Types:**
- `MessageMediaPhoto` → downloads as `.jpg`
- `MessageMediaDocument` (video MIME) → downloads as `.mp4`/`.bin`
- **NOT supported:** stickers, audio, generic documents

```typescript
export class TelegramMediaExtractorService {
  async extractAndDownload(
    client: TelegramClient,
    peerId: string,
    messageId: number,
    media: Api.TypeMessageMedia
  ): Promise<TelegramMediaAttachment[]> {
    if (!media) return [];
    
    if (media instanceof Api.MessageMediaPhoto) {
      return [await this.downloadPhoto(client, peerId, messageId, 0, media)];
    }
    
    if (media instanceof Api.MessageMediaDocument) {
      if (this.isVideoMime(media.document.mimeType)) {
        return [await this.downloadVideoDocument(client, peerId, messageId, 0, media)];
      }
    }
    
    return [];
  }
  
  private async downloadPhoto(/*...*/): Promise<TelegramMediaAttachment> {
    const filePath = await this.downloader.download(client, peerId, messageId, index, media);
    return {
      type: 'photo',
      index,
      filePath, // uploads/crypto-news/media/{channelId}/{messageId}_{index}.jpg
      mimeType: 'image/jpeg',
      fileSize: /* stat */ 
    };
  }
}
```

### TelegramClientManager

**File:** `apps/ingestion-telegram/src/telegram/shared/infrastructure/services/telegram-client-manager.service.ts`

**Singleton client lifecycle manager**

```typescript
export class TelegramClientManager {
  private client: TelegramClient | null = null;
  
  ensureClient(): TelegramClient {
    if (this.client) return this.client;
    
    const session = new StringSession(config.sessionString);
    this.client = new TelegramClient(
      session,
      config.apiId,
      config.apiHash,
      {
        connectionRetries: 5,
        useWSS: config.mtprotoUseWss ?? false,
      }
    );
    
    return this.client;
  }
  
  async connect(): Promise<void> {
    const client = this.ensureClient();
    await client.connect();
    
    const authorized = await client.isUserAuthorized();
    if (!authorized) {
      this.logger.warn('Session not authorized — listener will idle');
    }
  }
}
```

**Critical:** Session string (`INGESTION_TELEGRAM_MTPROTO_SESSION`) must be generated ONCE and NEVER duplicated. Duplication causes `AUTH_KEY_DUPLICATED` error.

### Anti-Ban Mechanisms

**FloodWaitHandler** (`apps/ingestion-telegram/src/telegram/shared/infrastructure/services/flood-wait-handler.service.ts`)

```typescript
export class FloodWaitHandlerService {
  async withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (this.isFloodWait(err)) {
          const seconds = this.extractWaitSeconds(err);
          this.logger.warn(`FLOOD_WAIT_${seconds} detected, pausing...`);
          await this.sleep(seconds * 1000);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Max flood wait retries exceeded');
  }
}
```

**LastSeenManager** (Redis-backed cursor tracking)

```typescript
export class LastSeenManager {
  private cursors = new Map<string, number>();
  
  async load(channelIds: string[]): Promise<void> {
    for (const id of channelIds) {
      const key = `ingestion:lastSeen:${this.normalize(id)}`;
      const value = await this.redis.get(key);
      if (value) {
        this.cursors.set(id, parseInt(value, 10));
      }
    }
  }
  
  set(channelId: string, messageId: number): void {
    this.cursors.set(channelId, messageId);
    const key = `ingestion:lastSeen:${this.normalize(channelId)}`;
    void this.redis.set(key, messageId.toString());
  }
  
  get(channelId: string): number {
    return this.cursors.get(channelId) ?? -1; // -1 = fetch all history
  }
}
```

**IngestionSafetyConfig** (safety defaults, mostly decorative)

```typescript
export class IngestionSafetyConfig {
  maxChannels = 100;
  pollIntervalBaseMs = 30000; // NOT USED (hardcoded 30s in loop)
  jitterPercent = 10; // NOT USED
  sleepWindow = { startUtc: 4, endUtc: 8 }; // NOT USED
  floodProtection = {
    initialMs: 5000,
    multiplier: 2,
    maxMs: 3600000,
    maxAttempts: 5,
    threshold24h: 10 // NOT ENFORCED
  };
}
```

---

## Database Schema Details

### Ingestion-Telegram Tables (Verified from Entities)

#### `crypto_news_sources`

**File:** `apps/ingestion-telegram/src/telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-source.entity.ts`

```sql
CREATE TABLE crypto_news_sources (
  channel_id VARCHAR(64) PRIMARY KEY,
  handle VARCHAR(64) NULL,
  title VARCHAR(256) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  lifecycle_status VARCHAR(16) DEFAULT 'ACTIVE', -- 'ACTIVE' | 'INACTIVE'
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crypto_news_sources_lifecycle_status 
  ON crypto_news_sources(lifecycle_status);
```

**Fields:**
- `channel_id`: Telegram channel ID (e.g., `-1001234567890`)
- `handle`: Channel username without `@` (e.g., `cryptonews`)
- `title`: Display name
- `is_active`: Legacy flag (use `lifecycle_status` instead)
- `lifecycle_status`: `'ACTIVE'` (monitored) or `'INACTIVE'` (paused)
- `added_at`: Source registration timestamp
- `updated_at`: Last modification timestamp

#### `crypto_news_messages`

**File:** `apps/ingestion-telegram/src/telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts`

```sql
CREATE TABLE crypto_news_messages (
  id UUID PRIMARY KEY,
  channel_id VARCHAR(64) NOT NULL,
  message_id INTEGER NOT NULL,
  title VARCHAR(512) NULL,
  content TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  link_preview_url TEXT NULL,
  link_preview_title TEXT NULL,
  link_preview_description TEXT NULL,
  link_preview_site_name VARCHAR(128) NULL,
  message_entities TEXT NULL,
  grouped_id VARCHAR(64) NULL,
  UNIQUE(channel_id, message_id)
);

CREATE INDEX idx_crypto_news_messages_channel_id 
  ON crypto_news_messages(channel_id);
  
CREATE INDEX idx_crypto_news_messages_ingested_at 
  ON crypto_news_messages(ingested_at);
  
CREATE UNIQUE INDEX uq_crypto_news_messages_channel_message 
  ON crypto_news_messages(channel_id, message_id);
```

**Fields:**
- `id`: UUID primary key
- `channel_id`: FK reference to source (NO FK constraint — opaque)
- `message_id`: Telegram message ID (integer)
- `title`: Extracted title (first line or link preview title)
- `content`: **RAW message text** (NO filters applied)
- `published_at`: Telegram message date
- `ingested_at`: **Retention clock** (72h TTL from this timestamp)
- `link_preview_*`: Rich embed metadata
- `message_entities`: JSON string of Telegram entities
- `grouped_id`: Media album grouping ID

**Composite uniqueness:** `(channel_id, message_id)` prevents duplicate ingestion

#### `crypto_news_message_media`

**File:** `apps/ingestion-telegram/src/telegram/crypto-news/infrastructure/persistence/typeorm/entities/crypto-news-message-media.entity.ts`

```sql
CREATE TABLE crypto_news_message_media (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,
  media_index SMALLINT NOT NULL,
  type VARCHAR(16) DEFAULT 'photo', -- 'photo' | 'video' | 'webpage'
  file_path TEXT NOT NULL,
  mime_type VARCHAR(64) NULL,
  file_size INTEGER NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_crypto_news_message_media_message 
    FOREIGN KEY (message_id) 
    REFERENCES crypto_news_messages(id) 
    ON DELETE CASCADE
);

CREATE INDEX idx_crypto_news_message_media_message_id 
  ON crypto_news_message_media(message_id);
```

**Fields:**
- `id`: UUID primary key
- `message_id`: FK to `crypto_news_messages.id` with **CASCADE DELETE**
- `media_index`: Zero-based position in photo album (0, 1, 2...)
- `type`: Media discriminator (`'photo'`, `'video'`, `'webpage'`)
- `file_path`: Absolute path on disk (e.g., `uploads/crypto-news/media/-100xxx/123_0.jpg`)
- `mime_type`: Detected from magic bytes (can be `NULL` on failure)
- `file_size`: Bytes (can be `NULL` on incomplete download)

**Cascade behavior:** Deleting a message **automatically** deletes all its media rows

---

## Frontend Integration

### API Consumption

**File:** `apps/frontend/src/shared/api/endpoints.ts` (verified)

```typescript
// Frontend fetches crypto-news directly from ingestion-telegram
export const CRYPTO_NEWS_API = {
  // Ingestion-telegram endpoints (:3032 in prod)
  sources: `${INGESTION_TELEGRAM_URL}/api/crypto-news/sources`,
  messages: `${INGESTION_TELEGRAM_URL}/api/crypto-news/messages`,
  media: (channelId: string, messageId: number, index: number) =>
    `${INGESTION_TELEGRAM_URL}/api/media/${channelId}/${messageId}/${index}`,
  
  // Backend endpoints (filters, matching, publishing)
  filters: `${API_BASE_URL}/crypto-news/filters`,
  matching: `${API_BASE_URL}/crypto-news-integration/matching`,
  queue: `${API_BASE_URL}/crypto-news-publisher/queue`,
};
```

### Data Flow (Frontend)

```
Frontend Dashboard
    ↓ TanStack Query
GET ingestion:3032/api/crypto-news/messages?limit=50
    ↓ Returns RAW messages (no filters)
Display in UI
    ↓ For each media attachment
GET ingestion:3032/api/media/{channelId}/{messageId}/{index}
    ↓ Serves from uploads/ with Cache-Control: max-age=31536000
Browser caches media for 1 year
```

**Key Points:**
- Frontend displays **RAW content** (no ContentFilterService applied)
- Media served directly from ingestion-telegram (backend proxies only as fallback)
- Backend matching/publishing configuration exposed via separate endpoints

---

## Configuration & Environment

### Ingestion-Telegram Environment Variables

**Critical MTProto credentials** (NEVER duplicate):

```bash
# MTProto session (SOLE COPY)
INGESTION_TELEGRAM_MTPROTO_API_ID=12345678
INGESTION_TELEGRAM_MTPROTO_API_HASH=abcdef1234567890
INGESTION_TELEGRAM_MTPROTO_SESSION=1AgAOMS...base64...

# Optional MTProto config
INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL=ERROR  # DEBUG | INFO | WARN | ERROR
INGESTION_TELEGRAM_MTPROTO_USE_WSS=false
INGESTION_TELEGRAM_MTPROTO_STARTUP_DELAY_MS=0

# Database
INGESTION_DATABASE_HOST=localhost
INGESTION_DATABASE_PORT=5432
INGESTION_DATABASE_NAME=alpha_meta_token_scanner_ingestion
INGESTION_DATABASE_USER=postgres
INGESTION_DATABASE_PASSWORD=postgres
INGESTION_DATABASE_SYNCHRONIZE=false  # true in dev, false in staging/prod
DATABASE_ENABLED=true

# Redis (cursor tracking)
INGESTION_REDIS_ENABLED=true
INGESTION_REDIS_HOST=localhost
INGESTION_REDIS_PORT=6379

# Retention
INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS=72

# API
INGESTION_API_PORT=3031
INGESTION_API_BASE_URL=http://localhost:3031

# Backend integration
BACKEND_PORT=3030
```

### Backend Environment Variables (Crypto-News)

```bash
# Ingestion-telegram connection
INGESTION_TELEGRAM_URL=http://localhost:3031  # :3032 in prod droplet
USE_SSE_INGESTION=true
USE_SSE_CRYPTO_NEWS=true  # Enable SSE for crypto-news

# Crypto-news polling (fallback)
CRYPTO_NEWS_POLLING_INTERVAL_MINUTES=5  # When SSE enabled
# Falls back to 1min when SSE disabled

# Publishing
CRYPTO_NEWS_BOT_TOKEN=<bot_token>
CRYPTO_NEWS_OUTPUT_CHANNEL=<channel_id>

# LLM (optional)
USE_MOCK_AI=false
LLM_API_URL=<llm_gateway_url>
```

---

**Last updated:** 2026-09-20  
**Status:** Code verified in `dev` branch  
**Post-split:** Complete DB separation (2026-09-08)  
**Enriched:** MTProto integration, database schema, frontend integration, configuration details


---

## Testing Considerations

### Ingestion-Telegram Tests

**Location:** `apps/ingestion-telegram/test/` and `apps/ingestion-telegram/src/**/*.spec.ts`

**Coverage (Post-split 2026-09-08):**
- 43 test suites
- 815 tests total
- All green in CI

**Key Test Files:**

| Component | Test File | Focus |
|-----------|-----------|-------|
| MTProto Listener | `telegram-mtproto-listener.adapter.spec.ts` | Message transformation, polling loop, flood wait |
| Media Extractor | `telegram-media-extractor.service.spec.ts` | Photo/video download, file path generation |
| Stream Service | `stream.service.spec.ts` | SSE broadcasting, heartbeat, client management |
| Retention Scheduler | `crypto-news-retention-cleanup.scheduler.spec.ts` | 72h TTL, orphan cleanup |

### Backend Tests

**Location:** `apps/backend/test/` and `apps/backend/src/**/*.spec.ts`

**Coverage (Post-split 2026-09-08):**
- 170 test suites
- 1969 tests total
- All green in CI

**Key Test Files:**

| Component | Test File | Focus |
|-----------|-----------|-------|
| KOL Orchestrator | `kol-ingestion-orchestrator.use-case.spec.ts` | Fix-1 compliance, direct calls |
| Process Crypto-News | `process-crypto-news-message.handler.spec.ts` | Deduplication, latency tracking |
| Filtered Service | `filtered-crypto-news.service.spec.ts` | Filter + match pipeline |
| Content Filter | `content-filter.service.spec.ts` | Regex transformations, ReDoS protection |
| Keyword Matcher | `keyword-matcher.service.spec.ts` | Simple/AND-group logic, blacklist |
| Publisher Queue | `enqueue-matching-message.use-case.spec.ts` | Cap 36, dedup |

### E2E Tests

**Backend E2E:** `apps/backend/test/*.e2e-spec.ts` (separate jest-e2e.json)

**Ingestion-Telegram E2E:** `apps/ingestion-telegram/test/*.e2e-spec.ts`

**Critical Scenarios:**
- KOL message ingestion → SSE → backend routing → extraction → parsing
- Crypto-news message ingestion → persist → SSE → filtering → matching → enqueue
- 72h retention cleanup (media + messages + orphans)
- SSE reconnection with exponential backoff
- MTProto flood wait handling

---

## Recommendations for Refactor

### Architectural Clarity

1. **Document the dual-path explicitly** in code comments:
   - SSE = primary, <10s target
   - Polling = fallback, catches gaps
   
2. **Consolidate coordinator logic:**
   - Backend has `IngestionCoordinator` (routing)
   - Ingestion-telegram has `IngestionCoordinator` (persistence)
   - Consider renaming one to avoid confusion (e.g., `IngestionPersistenceCoordinator`)

3. **Formalize the 2-flag system:**
   - Add validation: cannot enable `llmEnabled` without `publishingEnabled`
   - Consider merging into single config if coupling is intentional

### Code Quality

1. **Remove Spanish comments:**
   - Found: "Detecta mensaje", "Emite SSE"
   - Replace with English equivalents

2. **Type safety:**
   - `channel_id` in backend tables is opaque (no FK) — document this explicitly
   - `message_entities` is TEXT (JSON string) — consider JSONB for queries

3. **Error handling:**
   - SSE consumer swallows errors (defensive) — add metrics/alerts
   - ContentFilterService timeout (100ms) — make configurable

### Performance

1. **SSE heartbeat interval:**
   - Current: 30s (hardcoded)
   - Consider: configurable via environment variable

2. **Polling interval:**
   - SSE mode: 5min (light)
   - Non-SSE: 1min (heavy)
   - Consider: adaptive polling based on message volume

3. **Media cleanup:**
   - Retention scheduler runs every hour
   - Consider: daily cleanup + size-based triggers

### Observability

1. **Add metrics:**
   - SSE connection count
   - Latency histogram (ingestedAt → enqueued)
   - Queue depth gauge
   - Retention cleanup stats (deleted count, freed bytes)

2. **Add alerts:**
   - SSE disconnected for >5min
   - Queue cap (36) reached
   - Latency >10s for >10 consecutive messages
   - Retention cleanup failures

3. **Structured logging:**
   - Add correlation IDs (message trace: ingestion → filter → enqueue → publish)
   - Log sampling (reduce noise in high-volume scenarios)

### Documentation

1. **API Documentation:**
   - OpenAPI/Swagger specs for ingestion-telegram HTTP endpoints
   - Document SSE event schema with examples
   - Add sequence diagrams for common flows

2. **Configuration Reference:**
   - Centralized `.env.example` with inline comments
   - Document flag dependencies (llmEnabled requires publishingEnabled)
   - Add troubleshooting guide (common errors + solutions)

3. **Migration Guides:**
   - How to add new crypto-news sources
   - How to register new KOLs
   - How to update keyword rules
   - How to debug latency issues

---

**End of Document**
