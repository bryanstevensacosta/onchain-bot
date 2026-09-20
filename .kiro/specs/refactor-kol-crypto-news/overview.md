# KOL & CryptoNews — Architecture Overview

> **Fecha de creación:** 2026-09-20  
> **Fuentes:** `apps/ingestion-telegram/AGENTS.md`, `apps/backend/AGENTS.md`, `AGENTS.md` (root)  
> **Propósito:** Documentación consolidada de los conceptos KOL y CryptoNews en ambos servicios

---

## Tabla de Contenidos

1. [Arquitectura General](#arquitectura-general)
2. [KOL (Key Opinion Leaders)](#kol-key-opinion-leaders)
3. [Crypto-News](#crypto-news)
4. [Flujo de Datos](#flujo-de-datos)
5. [Persistencia y Ownership](#persistencia-y-ownership)
6. [Invariantes Críticas](#invariantes-críticas)
7. [Referencias de Código](#referencias-de-código)

---

## Arquitectura General

### Principio de Separación (Split 2026-09-08)

El sistema usa una **arquitectura de ingesta centralizada** con un único servicio `ingestion-telegram` que alimenta múltiples backends (dev/staging/prod):

```
┌─────────────────────────────────────────────────────────────┐
│  ingestion-telegram (ÚNICO) - :3031 dev, :3032 droplet      │
│                                                              │
│  RESPONSABILIDADES:                                          │
│  ✓ Una sola sesión MTProto                                  │
│  ✓ DB propia: <base>_ingestion                              │
│  ✓ Tablas crypto-news: sources, messages, message_media     │
│  ✓ Media storage: uploads/crypto-news/media/                │
│  ✓ SSE fan-out: /api/ingestion/stream                       │
│  ✓ Retención 72h (janitor messages + media)                 │
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

- ✅ Sin duplicación de datos (todos los ambientes ven los mismos mensajes)
- ✅ Sincronización automática (un mensaje descargado → visible instantáneamente)
- ✅ Escalabilidad (agregar ambientes solo requiere apuntar al ingestion existente)
- ✅ Evita conflictos (sin DBs duplicadas, sin sesiones MTProto duplicadas)

---

## KOL (Key Opinion Leaders)

### Definición

**KOL = Canales de Telegram monitoreados que publican alpha calls de tokens cripto.**

Los KOLs son influencers cuyas menciones de tokens generan análisis, scoring y potencialmente publicaciones en el canal VIP del bot.

### Ownership y Flujo

#### Ingestion-Telegram (Consumer)

**Responsabilidades:**

- **NO posee la identidad KOL** — la obtiene vía HTTP del backend
- Polling cada 5 minutos: `GET localhost:3030/telegram-kol/identity/kols/active/ids`
- Escucha canales KOL vía MTProto (realtime NewMessage + polling 30s)
- **ToS Invariante:** Texto NUNCA se incluye en el SSE payload para KOLs

**Componentes clave:**

```typescript
// apps/ingestion-telegram/src/telegram/shared/services/backend-channel-provider.service.ts
export class BackendChannelProviderService {
  async fetchActiveKolIds(): Promise<string[]> {
    // GET localhost:3030/telegram-kol/identity/kols/active/ids
    // Retorna: ["channelId1", "channelId2", ...]
  }
}

// apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts
export class IngestionCoordinator {
  async route(raw: TelegramRawMessage, type: 'kol' | 'crypto-news') {
    if (type === 'kol') {
      // Text EXCLUIDO del payload (ToS compliance - fix-1)
      const payload = this.transformToPayload(raw, 'kol'); // text = undefined
      await this.stream.broadcast({
        type: 'message:telegram',
        data: payload, // SIN texto
      });
    }
  }
}
```

**MessagePayload para KOL:**

```typescript
{
  peerId: "-1001234567890",
  messageId: 123,
  occurredAt: "2026-09-20T10:00:00Z",
  text: undefined,              // ⚠️ SIEMPRE undefined para KOL
  media: [],                    // KOL nunca descarga media
  entities: [...],
  messageType: "kol"
}
```

#### Backend (Owner)

**Responsabilidades:**

- **Posee la identidad KOL completa** en tabla `kols` (DB backend)
- Provee endpoint HTTP: `GET /telegram-kol/identity/kols/active/ids`
- Recibe mensajes KOL vía SSE (sin texto) y extrae texto directamente de Telegram

**Módulos:**

1. **`kol/identity/`** — Domain Layer
   - `Kol` aggregate (AggregateRoot)
   - Value Objects: `KolId`, `KolHandle`, lifecycle states
   - Use Cases: `RegisterKol`, `GetKol`, `ListKols`, `SetKolLifecycle`, `ListActiveKolIds`
   - **`KolIngestionOrchestratorUseCase`** — Orquesta el pipeline alpha-call

2. **`kol/reputation/`** — Scoring Layer
   - `KolMetricsCalculator` → mention/quality/drawdown scores
   - `blendScore` con pesos configurables (`KolScoreFormula`)
   - Multipliers: whitelist ×1.2 / blacklist ×0.5
   - Confidence levels: <5 mentions LOW … 50+ VERY_HIGH
   - Scheduler: recompute cada 15 min

3. **`kol/source/`** — Attribution
   - `Source` VO: `{kolId, sourceType: TELEGRAM|DISCORD|OTHER, messageIds}`
   - `SourceAggregatorPort` — deduplicación de fuentes

4. **`kol/stats/`** — Stats (stub, 4 endpoints retornan `{note:'Stub'}`)

**Entidades persistidas:**

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

### Pipeline KOL (Alpha-Call Path)

```
Telegram Channel (KOL)
    ↓ MTProto ingestion
ingestion-telegram:
    1. Detecta mensaje de canal KOL (vía fetchActiveKolIds)
    2. Transforma mensaje → MessagePayload (text=undefined, media=[])
    3. Emite SSE event: 'message:telegram' con messageType='kol'

Backend SSE Consumer:
    ↓ IngestionCoordinator.route(raw, 'kol')
    ↓ KolIngestionOrchestratorUseCase.onMessageReceived()
        ├─► ExtractFromMessageUseCase (direct call, NO bus)
        │   └─► Extrae contract addresses, tickers, nombres
        │       Emite: extraction.candidates.extracted
        │
        ├─► ParseFromCandidatesUseCase (direct call, NO bus)
        │   └─► Parsea candidatos → TokenCall
        │       Emite: parsing.call.parsed
        │
        └─► Event Bus continúa:
            ├─► normalization.call.normalized
            ├─► chain-detection.chain.detected
            ├─► enrichment.token.enriched
            ├─► classification.token.classified
            ├─► scoring.token.scored
            ├─► vip-call.approval.approved/rejected
            └─► publishing.telegram.published (Bot API)
```

**Fix-1 (ToS Compliance):**

El texto NUNCA cruza el event bus. `KolIngestionOrchestratorUseCase` llama directamente a `ExtractFromMessageUseCase` y `ParseFromCandidatesUseCase` con el texto crudo, evitando que el contenido de Telegram viaje por eventos.

**Seeding:**

```bash
# Backend: Alta manual (recomendado)
POST /telegram-kol/identity/kols
Body: {
  "kolId": "-1001234567890",
  "handle": "username",
  "title": "KOL Display Name"
}

# Legacy: Seeder deprecado (INGESTION_TELEGRAM_SEED_ENABLED=false por defecto)
# Format: INGESTION_TELEGRAM_SEED_CHANNELS="kolId|handle|title,kolId2|handle2|title2"
```

### KOL Reputation Scoring

**Fórmula:**

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

**Uso en Scoring Pipeline:**

```typescript
// apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts
const kolReputation = await this.reputationPort.getReputation(kolId);
const finalScore = baseScore * kolReputation.multiplier; // 0.85 - 1.15
```

---

## Crypto-News

### Definición

**Crypto-News = Canales de Telegram monitoreados para noticias cripto (NO alpha calls).**

Contenido opaco: el texto se guarda tal cual (sin análisis de tokens) y se publica en un canal de noticias después de:

1. Filtrado (regex transformations per-channel)
2. Keyword matching
3. LLM refinement (opcional)

### Ownership y Flujo (Opción A: Filter on-Read)

#### Ingestion-Telegram (Owner)

**Responsabilidades:**

- **Posee TODA la data crypto-news** en su DB `<base>_ingestion`
- Tablas: `crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media`
- Media storage: `uploads/crypto-news/media/{channelId}/{messageId}_{index}.ext`
- Sirve HTTP API: `GET /api/crypto-news/sources`, `GET /api/crypto-news/messages`
- Sirve media: `GET /api/media/:channelId/:messageId/:index`
- Alta de sources: `POST /api/crypto-news/sources`
- **Retención 72h:** Scheduler `CryptoNewsRetentionCleanupScheduler` (EVERY_HOUR, lock `9_421_373`)

**Componentes clave:**

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

**Ingestion Flow:**

```typescript
// apps/ingestion-telegram/src/telegram/shared/api/mtproto/telegram-mtproto-listener.adapter.ts
async transformMessage(message: Api.Message, channelId: string) {
  // 1. Extract text (4-source cascade: message.message → text → media.caption → fwdFrom.message)
  const text = await this.textExtractor.extract(message);

  // 2. Download media (ONLY for crypto-news, KOL never downloads)
  const mediaAttachments = await this.mediaExtractor.extractAndDownload(
    this.client,
    channelId,
    message.id,
    message.media
  );

  // 3. Store in DB
  await this.cryptoNewsRepo.save({
    id: `${channelId}:${message.id}`,
    channelId,
    messageId: message.id,
    content: text,              // RAW text (no transformations)
    ingestedAt: new Date(),
    telegramDate: new Date(message.date * 1000),
    groupedId: message.groupedId?.toString()
  });

  // 4. Store media metadata
  for (const media of mediaAttachments) {
    await this.mediaRepo.save({
      messageId: `${channelId}:${message.id}`,
      mediaType: media.type,
      mediaIndex: media.index,
      filePath: media.filePath,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      url: `${baseUrl}/api/media/${channelId}/${message.id}/${media.index}`
    });
  }

  // 5. Broadcast SSE
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

**Responsabilidades:**

- **NO posee tablas crypto-news** (eliminadas en split 2026-09-08)
- Lee vía HTTP: `GET {INGESTION_TELEGRAM_URL}/api/crypto-news/messages?limit=50`
- Aplica filtros ON-READ (ContentFilterService + keyword matching)
- Encola mensajes matched (publisher queue)
- Procesa queue → LLM → Bot API publish

**Módulos:**

1. **`telegram/crypto-news-integration/`** (NEW — Opción A orchestrator)
   - `CryptoNewsIngestionClient` — HTTP client wrapper
   - `FilteredCryptoNewsService` — fetch→filter→match orchestrator
   - `EnqueueMatchingCronScheduler` — polling fallback (1 min sin SSE / 5 min con SSE)
   - **`ProcessCryptoNewsMessageHandler`** — real-time SSE processor (<10s latency target)

2. **`telegram/ingestion/crypto-news/filters/`** — Content Filters (STAYS)
   - `ChannelContentFilterConfigEntity` — per-channel regex rules (FK-less, opaque `channel_id`)
   - `ContentFilterService` — applies transformations (100ms timeout per regex)
   - Use Cases: `CreateFilter`, `UpdateFilter`, `DeleteFilter`, `ListFilters`

3. **`telegram/crypto-news-publisher/`** — Publishing Pipeline
   - `EnqueueMatchingMessageUseCase` — queue insertion (cap 36)
   - `ProcessNextQueuedArticleUseCase` — drain queue → LLM → Bot API
   - `PublisherCronScheduler` — every minute (advisory lock)
   - `LlmConfig` — 3-flag control (matchingEnabled, llmEnabled, publishingEnabled)

**Entidades persistidas (Backend):**

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

### Data Flow (Opción A — Dual-Path)

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
    4. Emite SSE event: 'message:telegram' con messageType='crypto-news'

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

### Content Filtering (On-Read)

**Per-Channel Regex Rules:**

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

**Keyword Matching:**

```typescript
// Simple keywords (OR logic)
const simpleKeywords = ['bitcoin', 'ethereum', 'solana'];

// Compound keywords (AND logic within group)
const compoundKeywords = [
  ['airdrop', 'snapshot'], // Both must appear
  ['presale', 'whitelist'],
];

// Blacklist phrases (instant reject)
const blacklistPhrases = ['scam', 'rug', 'honeypot'];
```

### 3-Flag Control System (CRITICAL)

```typescript
// Flag 1: matchingEnabled (MatchingConfig)
//   Controls: EnqueueMatchingCronScheduler + ProcessCryptoNewsMessageHandler
//   When true: fetches messages → applies filters → enqueues matches
//   When false: no new messages enter queue

// Flag 2: llmEnabled (LlmConfig)
//   Controls: ProcessNextQueuedArticleUseCase content mode
//   When true (AND publishingEnabled=true): LLM refinement
//   When false: publishes raw content

// Flag 3: publishingEnabled (LlmConfig)
//   Controls: PublisherCronScheduler (master switch)
//   When true: drains queue
//   When false: queue accumulates, NO LLM generation

// DEPENDENCY: LLM generation = llmEnabled AND publishingEnabled
```

**Truth Table:**

| Matching | LLM | Publishing | Behavior                                    |
| :------: | :-: | :--------: | ------------------------------------------- |
|    ❌    | ❌  |     ❌     | All paused                                  |
|    ❌    | ❌  |     ✅     | Drain queue raw (no new enqueue)            |
|    ❌    | ✅  |     ❌     | All paused (LLM inactive)                   |
|    ❌    | ✅  |     ✅     | Drain queue with LLM (no new enqueue)       |
|    ✅    | ❌  |     ❌     | Enqueue only (queue builds)                 |
|    ✅    | ❌  |     ✅     | **Raw pipeline** (enqueue + publish raw)    |
|    ✅    | ✅  |     ❌     | Enqueue only (LLM inactive)                 |
|    ✅    | ✅  |     ✅     | **Full pipeline** (enqueue + LLM + publish) |

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

    // Returns array of downloaded files
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
        // File already gone → delete record
        await this.mediaRepo.delete(media.id);
      } else if (err.code === 'EACCES') {
        // Permission error → skip + keep record
        continue;
      } else {
        throw err; // Other errors abort
      }
    }
  }

  // Pass 2: Cleanup messages (batched DELETE 1000)
  while (true) {
    const deleted = await this.messageRepo.deleteOlderThan(cutoff, 1000);
    if (deleted < 1000) break;
  }

  // Pass 3: Orphan media sweep (messages deleted but media remains)
  await this.mediaRepo.deleteOrphans();
}
```

**24h Queue TTL (Backend):**

```typescript
// apps/backend/src/telegram/crypto-news-publisher/application/scheduling/expire-stale-queue-entries.scheduler.ts
@Cron('*/30 * * * *') // Every 30 minutes
async expireStaleEntries() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find PENDING entries older than 24h
  const stale = await this.queueRepo.findPendingOlderThan(cutoff);

  // Mark as FAILED with expiration reason
  for (const entry of stale) {
    entry.status = 'FAILED';
    entry.failureReason = 'Expired: exceeded 24h in queue without publishing';
    await this.queueRepo.save(entry);
  }

  this.logger.log(`Expired ${stale.length} stale queue entries`);
}
```

---

## Flujo de Datos

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

## Persistencia y Ownership

### Ingestion-Telegram DB (`<base>_ingestion`)

**Tablas propias (5):**

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

**Tablas propias (39 entities):**

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
CREATE INDEX idx_filters_channel ON channel_content_filter_configs(channel_id, is_active);

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
CREATE INDEX idx_queue_status_queued ON crypto_news_publisher_queue(status, queued_at)
  WHERE status = 'PENDING';

CREATE TABLE crypto_news_matching_config (
  id INT PRIMARY KEY DEFAULT 1,        -- Singleton
  enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crypto_news_llm_config (
  id INT PRIMARY KEY DEFAULT 1,        -- Singleton
  llm_enabled BOOLEAN DEFAULT TRUE,
  publishing_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crypto-news ads, keywords, blacklist, etc.
CREATE TABLE crypto_news_keywords (...);
CREATE TABLE crypto_news_blacklist_phrases (...);
CREATE TABLE crypto_news_ads (...);
-- ... (ver AGENTS.md backend para lista completa)
```

**⚠️ Backend NO tiene tablas `crypto_news_sources`, `crypto_news_messages`, `crypto_news_message_media`**

Migration `1860000000001-DropIngestionOwnedCryptoNewsTables` las eliminó en el split 2026-09-08.

---

## Invariantes Críticas

### Invariantes Arquitecturales (Inamovibles)

1. **Un solo ingestion-telegram** — NO crear instancias por environment
2. **Una sola sesión MTProto** — credenciales viven SOLO en `ingestion-telegram/.env`
3. **Una sola DB de ingestion por servidor Postgres** — `<base>_ingestion` en dev local y droplet
4. **Ingestion-telegram es owner de crypto-news data** — backends NO replican tablas
5. **Backend NO escribe crypto-news** — staging/prod solo LEEN vía HTTP/SSE
6. **Frontend consume directo de ingestion-telegram** — `GET :3032/api/crypto-news/*`
7. **Retención 72h messages + media** — `CryptoNewsRetentionCleanupScheduler` (ingestion)

### Invariantes de Contenido (ToS Compliance)

1. **KOL text NUNCA cruza el event bus** (fix-1)
   - `MessagePayload.text = undefined` para `messageType='kol'`
   - Backend extrae texto directamente via `KolIngestionOrchestratorUseCase`
2. **Crypto-news text SÍ cruza el event bus**
   - `MessagePayload.text = "..."` para `messageType='crypto-news'`
   - Contenido opaco, se guarda/procesa sin análisis de tokens

### Invariantes de Filtering (Opción A)

1. **Ingestion-telegram guarda contenido CRUDO** (sin filtros, sin transformaciones)
2. **Backend aplica filtros ON-READ** (NO persiste contenido transformado)
3. **Frontend muestra contenido RAW** (sin transformaciones de display)
4. **Publisher queue recibe contenido FILTRADO** (AFTER ContentFilterService)

### Invariantes de Control (3-Flag System)

1. **LLM generation = llmEnabled AND publishingEnabled**
   - Si `publishingEnabled=false`, LLM NO se ejecuta (aunque `llmEnabled=true`)
2. **Matching y publishing son independientes**
   - `matchingEnabled` (crypto-news-integration) no depende de publisher config
3. **Production LLM lock** (guard en `LlmConfigController`)
   - `llmEnabled` NO se puede cambiar en producción (siempre `true` para calidad)

---

## Referencias de Código

### Ingestion-Telegram

**Estructura:**

```
apps/ingestion-telegram/src/
├── telegram/
│   ├── crypto-news/
│   │   ├── crypto-news.module.ts
│   │   ├── api/http/crypto-news.controller.ts
│   │   ├── application/
│   │   │   ├── handlers/register-news-source.use-case.ts
│   │   │   └── scheduling/crypto-news-retention-cleanup.scheduler.ts
│   │   └── infrastructure/persistence/typeorm/
│   │       ├── entities/crypto-news-{source,message,message-media}.entity.ts
│   │       └── repositories/crypto-news-{source,message,media}.repository.ts
│   │
│   └── shared/
│       ├── api/mtproto/telegram-mtproto-listener.adapter.ts
│       ├── application/
│       │   ├── coordinators/ingestion.coordinator.ts
│       │   └── services/
│       │       ├── telegram-media-extractor.service.ts (Phase 5.2)
│       │       └── deduplication.service.ts
│       └── services/backend-channel-provider.service.ts
│
├── stream/
│   ├── api/http/stream.controller.ts
│   └── application/services/stream.service.ts
│
└── media/
    ├── api/http/media.controller.ts
    └── application/services/media-downloader.service.ts
```

**Archivos clave:**

- `telegram.module.ts` — onModuleInit + refresh channels + startListening
- `ingestion.coordinator.ts` — route(raw, type) + transformToPayload
- `telegram-mtproto-listener.adapter.ts` — MTProto subscription + transformMessage
- `crypto-news-retention-cleanup.scheduler.ts` — 72h janitor (EVERY_HOUR)
- `backend-channel-provider.service.ts` — fetchActiveKolIds() HTTP

### Backend

**Estructura:**

```
apps/backend/src/
├── kol/
│   ├── identity/
│   │   ├── kol-identity.module.ts
│   │   ├── api/http/kol.controller.ts
│   │   ├── domain/entities/kol.entity.ts
│   │   ├── application/
│   │   │   ├── handlers/
│   │   │   │   ├── kol-ingestion-orchestrator.use-case.ts (⚠️ lives here)
│   │   │   │   ├── register-kol.use-case.ts
│   │   │   │   ├── list-active-kol-ids.use-case.ts
│   │   │   │   └── set-kol-lifecycle.use-case.ts
│   │   │   └── ports/kol.repository.ts
│   │   └── infrastructure/persistence/typeorm/
│   │       ├── entities/kol.entity.ts
│   │       └── repositories/typeorm-kol.repository.ts
│   │
│   ├── reputation/
│   │   ├── kol-reputation.module.ts
│   │   ├── api/http/kol-reputation.controller.ts
│   │   ├── domain/value-objects/kol-metrics.vo.ts
│   │   ├── application/
│   │   │   ├── services/kol-metrics-calculator.service.ts
│   │   │   └── handlers/recompute-kol-reputation.use-case.ts
│   │   └── infrastructure/scheduling/kol-reputation.scheduler.ts
│   │
│   ├── source/
│   │   └── domain/value-objects/source.vo.ts
│   │
│   └── stats/
│       └── api/http/kol-stats.controller.ts (stub endpoints)
│
├── telegram/
│   ├── crypto-news-integration/  (NEW — Opción A)
│   │   ├── crypto-news-integration.module.ts
│   │   ├── api/http/
│   │   │   └── matching-config.controller.ts
│   │   ├── application/
│   │   │   ├── handlers/process-crypto-news-message.handler.ts (⚠️ SSE processor)
│   │   │   ├── services/
│   │   │   │   ├── filtered-crypto-news.service.ts
│   │   │   │   └── crypto-news-ingestion-client.service.ts
│   │   │   └── scheduling/enqueue-matching-cron.scheduler.ts
│   │   └── infrastructure/persistence/typeorm/
│   │       ├── entities/matching-config.entity.ts
│   │       └── repositories/matching-config.repository.ts
│   │
│   ├── ingestion/crypto-news/filters/  (STAYS — FK-less)
│   │   ├── crypto-news-filters.module.ts
│   │   ├── api/http/content-filter.controller.ts
│   │   ├── application/
│   │   │   ├── services/content-filter.service.ts
│   │   │   └── handlers/{create,update,delete,list}-filter.use-case.ts
│   │   └── infrastructure/persistence/typeorm/
│   │       ├── entities/channel-content-filter-config.entity.ts
│   │       └── repositories/typeorm-channel-filter.repository.ts
│   │
│   ├── crypto-news-publisher/
│   │   ├── crypto-news-publisher.module.ts
│   │   ├── api/http/
│   │   │   ├── llm-config.controller.ts (⚠️ production guard)
│   │   │   ├── queue.controller.ts
│   │   │   ├── keywords.controller.ts
│   │   │   └── blacklist-phrases.controller.ts
│   │   ├── application/
│   │   │   ├── handlers/
│   │   │   │   ├── enqueue-matching-message.use-case.ts
│   │   │   │   └── process-next-queued-article.use-case.ts
│   │   │   └── scheduling/
│   │   │       ├── publisher-cron.scheduler.ts
│   │   │       └── expire-stale-queue-entries.scheduler.ts
│   │   └── infrastructure/persistence/typeorm/
│   │       ├── entities/
│   │       │   ├── publisher-queue.entity.ts
│   │       │   ├── llm-config.entity.ts
│   │       │   ├── keyword.entity.ts
│   │       │   └── blacklist-phrase.entity.ts
│   │       └── repositories/publisher-queue.repository.ts
│   │
│   ├── ingestion/
│   │   ├── telegram-ingestion.module.ts
│   │   └── shared/
│   │       ├── shared-ingestion.module.ts (@Global)
│   │       ├── application/ingestion-coordinator.service.ts (⚠️ router)
│   │       └── api/sse/telegram-sse-listener.adapter.ts
│   │
│   └── vip-calls/vip-channel/  (Bot API publishing)
│       └── ... (alpha-call publishing pipeline)
│
├── token/  (alpha-call pipeline)
│   ├── intake/{extraction,parsing}/
│   ├── normalization/
│   ├── enrichment/
│   ├── classification/
│   ├── scoring/
│   └── vip-call-approval/
│
└── shared/
    ├── kernel/ (AggregateRoot, Entity, ValueObject, DomainEvent)
    ├── common/persistence/
    │   ├── entities.ts (PERSISTED_ENTITIES = 39)
    │   ├── data-source.ts
    │   └── migrations/ (15 TypeORM migrations)
    └── ws/gateway/ws.gateway.ts (Socket.IO fan-out)
```

**Archivos clave:**

- `ingestion-coordinator.service.ts` — routeMessage(raw) + subscribe()
- `kol-ingestion-orchestrator.use-case.ts` — onMessageReceived() + direct calls
- `process-crypto-news-message.handler.ts` — handle() SSE processor (<10s)
- `filtered-crypto-news.service.ts` — getMatchingMessages() orchestrator
- `content-filter.service.ts` — applyFilters() on-read transformations
- `enqueue-matching-message.use-case.ts` — queue insertion (cap 36)
- `process-next-queued-article.use-case.ts` — LLM + Bot API publishing
- `llm-config.controller.ts` — production guard (llmEnabled immutable)

### Root

**Archivos de orquestación:**

- `AGENTS.md` — overview de arquitectura (este documento se basó en él)
- `GIT-FLOW.md` — branch strategy (dev → staging, master → production)
- `GOVERNANCE.md` — branch protection rules (v2.0, Spanish)
- `apps/backend/docker-compose.yml` — postgres + redis dev infra
- `apps/backend/docker-compose.ingestion.yml` — standalone ingestion droplet
- `.github/workflows/deploy-ingestion.yml` — CI/CD ingestion
- `.github/workflows/deploy.yml` — CI/CD backend + frontend

---

## Notas Adicionales

### Gaps Conocidos

**Ingestion-Telegram:**

1. Backfill roto (endpoint existe pero lanza error)
2. Health endpoints con stubs null (no reflejan estado real MTProto)
3. Dedup service inyectado pero nunca llamado
4. Métricas Prometheus definidas pero nunca actualizadas
5. Sleep window configurado pero nunca aplicado
6. Refresh de canales cada 5 min inefectivo (single-listener lanza error)
7. Config anti-ban decorativa (polling siempre 30s fijos sin jitter)

**Backend:**

1. `IdentityModule` loads transitively (comentado en AppModule pero se importa vía dependencies)
2. `DashboardModule` comentado (código exists but not wired)
3. Cross-BC use-case imports (gap 7: SettingsService, EnrichTokenUseCase)
4. Health endpoint estático (no refleja estado real, gap 9)
5. Frontend 5s stale time + No Zustand/Redux (pese a MSW/recharts en deps sin uso)

### Migraciones Relevantes

**Backend:**

- `1860000000001-DropIngestionOwnedCryptoNewsTables.ts` — Split final (eliminó 3 tablas + FKs)
- `1875000000000-BackfillMatchingConfigFromLlm.ts` — Separó `matchingEnabled` de LLM config
- `1788659125192-SplitLlmConfigFlags.ts` — Separó `llmEnabled` + `publishingEnabled`
- `1860000000000-AddQueuedAtToPublisherQueue.ts` — TTL 24h support

**Ingestion-Telegram:**

- `1788844970659-BaselineIngestionSchema.ts` — Baseline (5 tablas, generado contra DB vacía)

### Testing

**Ingestion-Telegram:** 43 suites / 815 tests (post-split task-10)
**Backend:** 170 suites / 1969 tests (post-split task-10)
**Frontend:** 23 `*.test.*` files (Vitest)

### Deployment

**Orden crítico (code-before-schema):**

1. Deploy ingestion-telegram PRIMERO
2. Verificar `:3032/api/crypto-news/sources` healthy
3. SOLO ENTONCES deploy backend con drop migration

**Rollback:** Set `USE_SSE_CRYPTO_NEWS=false` → instant fallback a polling 1-min

---

**FIN DEL OVERVIEW**
