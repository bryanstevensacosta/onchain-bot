# 11. Plan de Refactor: Content Publisher Monorepo

## Visión General

Este documento propone una **reestructuración completa** del sistema content publisher, desacoplándolo del backend monolítico en una nueva app dedicada: **`apps/content-publisher`**.

> **🔗 Refactor Relacionado**: Para el sistema KOL (VIP calls pipeline), ver:  
> [refactor-kol-system/overview.md](../../.kiro/specs/refactor-kol-system/overview.md)

### Objetivos del Refactor

1. **Desacoplamiento total** — Remover dependencias telegram/\* del backend
2. **Multi-content publishing** — Soportar crypto-news (actual) + threads (futuro) + otros tipos
3. **Escalabilidad horizontal** — Facilitar multi-replica deployment sin afectar backend
4. **Developer experience** — Estructura modular más navegable y mantenible
5. **Testing isolation** — Test suite independiente del backend monolítico

### Scope: Content Publisher vs KOL System

**Content Publisher** (este documento):

- ✅ Crypto-news publishing (matching + LLM + ads + scheduling)
- ✅ Threads publishing (multi-message sequences, FUTURO)
- ✅ Generic content publishing infrastructure

**KOL System** (refactor separado):

- ✅ VIP calls pipeline (extraction → parsing → scoring → approval → publishing)
- ✅ KOL identity & reputation management
- ✅ Call tracking & performance evaluation

**Separación clara**: Sin overlap de responsabilidades, diferentes pipelines, diferentes bots.

### Estado Actual vs Propuesto

#### Estado Actual (Distribuido en 3 BCs)

```
apps/backend/src/telegram/
├── crypto-news-integration/     # Matching + SSE handler + polling
├── crypto-news-publisher/       # Queue + LLM + publishing
├── crypto-news-ads/            # Ads + rotation + media
├── ingestion/crypto-news/      # Content filters (legacy location)
└── shared/                     # Bot API adapter
```

**Problemas**:

- ❌ 3 bounded contexts mezclados con telegram concerns
- ❌ Content filters viven en `ingestion/` (confusing ownership)
- ❌ Bot API adapter compartido con vip-calls (coupling)
- ❌ No clear separation entre matching y publishing
- ❌ Ads tratado como BC separado (exceso de granularidad)

#### Estado Propuesto (App Dedicada)

```
apps/content-publisher/
├── ingestion/                 # Conexión con ingestion-telegram (HTTP client)
├── matching/                  # Filtrado + keyword matching
├── keywords/                  # Allowed/blocked/compound keywords
├── filters/                   # Content filters (regex transforms)
├── queue/                     # Publisher queue + deduplication
├── deduplication/             # Semantic dedup + embeddings
├── llm/                       # LLM generation (config/templates/core/playground)
├── scheduling/                # Ads (core/media/uploads)
├── threads/                   # Thread generation & management (FUTURO)
├── telegram/                  # Bot API adapters (crypto-news + threads)
│                             # NOTA: KOL bot movido a apps/kol-system/
├── shared/                    # Cross-cutting (domain, infra, utils)
├── main.ts                    # Bootstrap (puerto :3040)
├── app.module.ts              # Root module
└── package.json               # Workspace independiente
```

**Beneficios**:

- ✅ Multi-content bounded context (crypto-news + threads + futuro)
- ✅ Claro ownership de cada módulo
- ✅ Escalado independiente del backend
- ✅ Bot API adapters centralizados (crypto-news + threads)
  - NOTA: KOL bot adapter movido a `apps/kol-system/`
- ✅ Ads integrado como módulo (no BC separado)
- ✅ Estructura flat más navegable (no nested `crypto-news/`)

---

## Estructura Detallada

### 1. Ingestion Module (`ingestion/`)

**Responsabilidad**: Conexión HTTP con ingestion-telegram service (crypto-news data ONLY).

> **⚠️ NOTA IMPORTANTE**: KOL data ingestion fue movido a `apps/kol-system/`.  
> Ver: [refactor-kol-system/overview.md](../../.kiro/specs/refactor-kol-system/overview.md)

```
ingestion/
├── application/
│   ├── services/
│   │   └── crypto-news-ingestion-client.service.ts   # HTTP client
│   └── handlers/
│       └── process-crypto-news-message.handler.ts    # SSE event handler
├── domain/
│   └── ports/
│       └── ingestion-client.port.ts                  # Interface para HTTP client
├── infrastructure/
│   └── http/
│       ├── ingestion-http-client.adapter.ts          # Axios/fetch impl
│       └── dto/
│           ├── raw-message.dto.ts
│           └── source.dto.ts
└── ingestion.module.ts
```

**Dependencias**:

- **Externa**: `INGESTION_TELEGRAM_URL` (env var, apunta a :3031/:3032/:3033 por env)
- **Interna**: Ninguna (leaf module)

**API Expuesta**:

```typescript
interface IngestionClientPort {
  // Crypto-news
  getRecentMessages(params: {
    limit: number;
    channelId?: string;
  }): Promise<RawMessage[]>;
  getMessageById(
    channelId: string,
    messageId: string,
  ): Promise<RawMessage | null>;
  getActiveSources(): Promise<Source[]>;

  // KOL (DEPRECADO — movido a apps/kol-system/)
  // Estos métodos permanecen solo para backward compatibility durante migración
  // ELIMINAR en v2.0.0 cuando kol-system esté en prod
  // Ver: .kiro/specs/refactor-kol-system/overview.md
  getKolMessages(params: {
    limit: number;
    kolId?: string;
  }): Promise<KolMessage[]>;
  getActiveKols(): Promise<Kol[]>;
}
```

**Migración**:

- ✅ Mover `CryptoNewsIngestionClient` desde `crypto-news-integration/`
- ✅ Mover `ProcessCryptoNewsMessageHandler` (SSE handler)
- ⚠️ **Decisión requerida**: ¿SSE listener vive aquí o en `shared/`? (Recomendación: aquí)

---

### 2. Matching Module (`matching/`)

**Responsabilidad**: Aplicar filtros + keywords + blacklist → decidir si enqueue (crypto-news only).

**Nota**: Threads NO usan matching (van directo a queue).

```
matching/
├── application/
│   ├── services/
│   │   ├── filtered-crypto-news.service.ts          # Orchestrator (fetch → filter → match)
│   │   └── matching-evaluator.service.ts             # Keyword + blacklist logic
│   ├── use-cases/
│   │   └── evaluate-message-match.use-case.ts       # Single message eval
│   └── scheduling/
│       └── enqueue-matching-cron.scheduler.ts       # Polling fallback scheduler
├── domain/
│   ├── entities/
│   │   └── matching-config.entity.ts                # matchingEnabled flag
│   └── ports/
│       ├── matching-config-repository.port.ts
│       └── keyword-provider.port.ts                 # Interface para keywords module
├── infrastructure/
│   └── persistence/
│       └── typeorm/
│           ├── entities/
│           │   └── matching-config.entity.ts
│           └── repositories/
│               └── typeorm-matching-config.repository.ts
└── matching.module.ts
```

**Dependencias**:

- `ingestion/` — Fetch raw messages
- `keywords/` — Keyword evaluation (allowed/blocked/compound)
- `filters/` — Content filtering (regex transforms)
- `queue/` — Enqueue matched messages

**API Expuesta**:

```typescript
interface MatchingService {
  evaluateMatch(message: RawMessage): Promise<MatchResult>; // Single message
  getMatchingMessages(
    limit: number,
    channelId?: string,
  ): Promise<FilteredMessage[]>; // Batch
}

interface MatchResult {
  matched: boolean;
  reasons: string[]; // e.g., ["keyword:BTC", "blacklist:scam"]
  filteredContent: { title: string; content: string };
}
```

**Migración**:

- ✅ Mover `FilteredCryptoNewsService` desde `crypto-news-integration/`
- ✅ Mover `EnqueueMatchingCronScheduler`
- ✅ Mover `MatchingConfig` entity (ya existe en integration)

---

### 3. Keywords Module (`keywords/`)

**Responsabilidad**: Storage + evaluation de keywords (allowed/blocked/compound) para crypto-news.

**Nota**: Threads NO usan keywords (matching deshabilitado).

```
keywords/
├── allowed/                                          # Simple keywords (OR logic)
│   ├── application/
│   │   ├── services/
│   │   │   └── keyword-evaluator.service.ts
│   │   └── use-cases/
│   │       ├── create-keyword.use-case.ts
│   │       ├── list-keywords.use-case.ts
│   │       └── delete-keyword.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   └── keyword.entity.ts                    # DDD aggregate
│   │   └── ports/
│   │       └── keyword-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   └── keyword.entity.ts
│               └── repositories/
│                   └── typeorm-keyword.repository.ts
│
├── blocked/                                          # Blacklist phrases
│   ├── application/
│   │   ├── services/
│   │   │   └── blacklist-evaluator.service.ts
│   │   └── use-cases/
│   │       ├── create-blacklist-phrase.use-case.ts
│   │       └── list-blacklist-phrases.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   └── blacklist-phrase.entity.ts
│   │   └── ports/
│   │       └── blacklist-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   └── blacklist-phrase.entity.ts
│               └── repositories/
│                   └── typeorm-blacklist.repository.ts
│
├── compound/                                         # AND-group keywords
│   ├── application/
│   │   ├── services/
│   │   │   └── compound-evaluator.service.ts
│   │   └── use-cases/
│   │       ├── create-compound-group.use-case.ts
│   │       └── evaluate-compound-match.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   └── compound-keyword-group.entity.ts    # Has-many keywords
│   │   └── ports/
│   │       └── compound-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   ├── compound-keyword-group.entity.ts
│               │   └── compound-keyword-item.entity.ts
│               └── repositories/
│                   └── typeorm-compound.repository.ts
│
├── api/
│   ├── controllers/
│   │   ├── keywords.controller.ts                   # CRUD allowed keywords
│   │   ├── blacklist.controller.ts                  # CRUD blacklist
│   │   └── compound.controller.ts                   # CRUD compound groups
│   └── dto/
│       ├── create-keyword.dto.ts
│       ├── create-blacklist-phrase.dto.ts
│       └── create-compound-group.dto.ts
│
└── keywords.module.ts                               # Exports public services
```

**Dependencias**:

- **Externa**: Ninguna (leaf module)
- **Interna**: Shared domain VOs (ChannelId, etc.)

**API Expuesta**:

```typescript
interface KeywordService {
  evaluateAllowed(content: string, sourceId: string): Promise<boolean>;
  evaluateBlocked(content: string): Promise<boolean>;
  evaluateCompound(content: string, sourceId: string): Promise<boolean>;
}

// Public API from module
export class KeywordsModule {
  static forRoot(): DynamicModule;
  // Exports: KeywordService, BlacklistService, CompoundService
}
```

**Rationale — 3 Subdirectorios**:

- ✅ **Separación clara** — Allowed/blocked tienen lógica diferente (OR vs blacklist)
- ✅ **Compound como extensión** — AND-groups son feature avanzado, aislado
- ✅ **HTTP API unificado** — Tres controllers bajo un solo prefix `keywords/*`
- ✅ **Shared module export** — `KeywordsModule` agrega los 3 submódulos

**Migración**:

- ✅ Mover `Keyword`, `BlacklistPhrase` entities desde `crypto-news-publisher/`
- ✅ Crear nuevo subdirectorio `compound/` (feature nueva)
- ✅ Consolidar evaluators dispersos en services dedicados

---

### 4. Filters Module (`filters/`)

**Responsabilidad**: Regex content transforms (per-channel) para crypto-news.

**Nota**: Threads podrían usar filtros en futuro (opcional, por diseñar).

```
filters/
├── application/
│   ├── services/
│   │   └── content-filter.service.ts               # Regex transform engine (ReDoS protection)
│   └── use-cases/
│       ├── create-content-filter.use-case.ts
│       ├── list-channel-filters.use-case.ts
│       ├── update-content-filter.use-case.ts
│       └── delete-content-filter.use-case.ts
├── domain/
│   ├── entities/
│   │   └── channel-content-filter-config.entity.ts # DDD aggregate
│   └── ports/
│       └── filter-repository.port.ts
├── infrastructure/
│   └── persistence/
│       └── typeorm/
│           ├── entities/
│           │   └── channel-content-filter-config.entity.ts
│           └── repositories/
│               └── typeorm-filter.repository.ts
├── api/
│   ├── controllers/
│   │   └── filters.controller.ts                   # CRUD per channel
│   └── dto/
│       ├── create-filter.dto.ts
│       └── update-filter.dto.ts
└── filters.module.ts
```

**Dependencias**:

- **Externa**: Ninguna (leaf module)

**API Expuesta**:

```typescript
interface ContentFilterService {
  filterContent(content: string, filters: FilterRule[]): string;
  filterTitleAndContent(
    title: string | null,
    content: string,
    filters: FilterRule[],
  ): { title: string | null; content: string };
}
```

**Migración**:

- ✅ Mover desde `telegram/ingestion/crypto-news/` (ubicación legacy confusa)
- ✅ `ChannelContentFilterConfig` entity + use cases + service
- ⚠️ **Decisión requerida**: ¿Mantener FK-less design? (Recomendación: Sí)

---

### 5. Queue Module (`queue/`)

**Responsabilidad**: Publisher queue management + status tracking (multi-content: crypto-news + threads).

**Design**: Queue unificado con `contentType` discriminator (`'crypto-news' | 'thread'`).

```
queue/
├── application/
│   ├── services/
│   │   └── queue-manager.service.ts                # Queue operations (enqueue/dequeue/status)
│   ├── use-cases/
│   │   ├── enqueue-matching-message.use-case.ts    # From matching module
│   │   ├── process-next-queued-article.use-case.ts # Drain queue → LLM → publish
│   │   └── list-queue-entries.use-case.ts
│   └── scheduling/
│       ├── publisher-cron.scheduler.ts             # Main publisher loop (every minute)
│       └── expire-stale-entries.scheduler.ts       # TTL cleanup (24h)
├── domain/
│   ├── entities/
│   │   └── publisher-queue-entry.entity.ts         # State machine + contentType discriminator
│   ├── value-objects/
│   │   ├── queue-status.vo.ts                      # Enum + transitions
│   │   └── content-type.vo.ts                      # 'crypto-news' | 'thread'
│   └── ports/
│       └── queue-repository.port.ts
├── infrastructure/
│   └── persistence/
│       └── typeorm/
│           ├── entities/
│           │   └── publisher-queue-entry.entity.ts
│           └── repositories/
│               └── typeorm-queue.repository.ts
├── api/
│   ├── controllers/
│   │   └── queue.controller.ts                     # GET queue, POST enqueue, DELETE purge
│   └── dto/
│       ├── queue-entry.dto.ts
│       └── enqueue-request.dto.ts
└── queue.module.ts
```

**Dependencias**:

- `deduplication/` — Semantic dedup before enqueue
- `llm/` — Content generation when processing
- `telegram/` — Bot API publishing
- `scheduling/` — Ads injection

**API Expuesta**:

```typescript
interface QueueService {
  enqueue(
    content: QueueableContent,
    contentType: ContentType,
  ): Promise<QueueEntry>;
  dequeue(contentType?: ContentType): Promise<QueueEntry | null>; // Filter by type
  getQueueStatus(contentType?: ContentType): Promise<QueueStats>;
  purgeStaleEntries(
    olderThan: Date,
    contentType?: ContentType,
  ): Promise<number>;
}

interface QueueStats {
  pending: number;
  published: number;
  failed: number;
  oldestPendingAge: number; // milliseconds
  byContentType: Record<
    ContentType,
    { pending: number; published: number; failed: number }
  >;
}

type ContentType = 'crypto-news' | 'thread';
```

**Migración**:

- ✅ Mover `PublisherQueueEntry` entity desde `crypto-news-publisher/`
- ✅ Mover `EnqueueMatchingMessageUseCase`
- ✅ Mover `ProcessNextQueuedArticleUseCase` (CRÍTICO — pipeline core)
- ✅ Mover schedulers (`PublisherCronScheduler`, `ExpireStaleQueueEntriesScheduler`)

---

### 6. Deduplication Module (`deduplication/`)

**Responsabilidad**: Semantic dedup + embeddings (exact → content → semantic cascade) para crypto-news + threads.

```
deduplication/
├── application/
│   ├── services/
│   │   ├── deduplication.service.ts                # Cascade strategy orchestrator
│   │   ├── content-normalizer.service.ts           # Text normalization
│   │   └── url-normalizer.service.ts               # URL canonicalization
│   └── use-cases/
│       ├── check-duplicate.use-case.ts
│       └── mark-as-seen.use-case.ts
├── domain/
│   ├── entities/
│   │   └── dedup-record.entity.ts                  # Fingerprint + embedding storage
│   ├── value-objects/
│   │   ├── content-fingerprint.vo.ts               # SHA-256 hash
│   │   └── semantic-embedding.vo.ts                # float[] vector
│   └── ports/
│       ├── dedup-repository.port.ts
│       └── embedding-generator.port.ts             # LLM embeddings API
├── infrastructure/
│   ├── persistence/
│   │   └── typeorm/
│   │       ├── entities/
│   │       │   └── dedup-record.entity.ts
│   │       └── repositories/
│   │           └── typeorm-dedup.repository.ts
│   └── embeddings/
│       ├── openai-embeddings.adapter.ts            # text-embedding-3-small
│       └── mock-embeddings.adapter.ts              # Testing
└── deduplication.module.ts
```

**Dependencias**:

- **Externa**: OpenAI embeddings API (o LLM gateway)
- **Interna**: Shared crypto utils (hashing)

**API Expuesta**:

```typescript
interface DeduplicationService {
  checkDuplicate(message: FilteredMessage): Promise<DuplicateCheckResult>;
  markAsSeen(entry: QueueEntry): Promise<void>;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  strategy: 'exact' | 'content' | 'semantic' | 'none';
  duplicateOf?: { channelId: string; messageId: string; queueEntryId: string };
  similarity?: number; // 0.0-1.0 for semantic
}
```

**Cascade Strategy** (fail-open):

```typescript
async checkDuplicate(message: FilteredMessage): Promise<DuplicateCheckResult> {
  // 1. Exact match (channelId + messageId)
  const exact = await this.checkExact(message);
  if (exact.isDuplicate) return { ...exact, strategy: 'exact' };

  // 2. Content hash match (SHA-256 normalized content)
  const content = await this.checkContentHash(message);
  if (content.isDuplicate) return { ...content, strategy: 'content' };

  // 3. Semantic match (embedding cosine similarity > threshold)
  try {
    const semantic = await this.checkSemantic(message);
    if (semantic.isDuplicate) return { ...semantic, strategy: 'semantic' };
  } catch (err) {
    this.logger.warn('Semantic dedup failed, degrading to none', err);
    // Fail-open: enqueue on embedding service failure
  }

  return { isDuplicate: false, strategy: 'none' };
}
```

**Migración**:

- ✅ Mover `DeduplicationService` desde `shared/deduplication/`
- ✅ Mover `DedupRecord` entity
- ✅ Mover fingerprinting/normalization utils
- ⚠️ **Decisión requerida**: ¿Embeddings storage strategy? (pgvector vs separate table)

---

### 7. LLM Module (`llm/`)

**Responsabilidad**: LLM content generation (config/templates/core/playground) para crypto-news + threads.

**Design**: Templates per content-type (`crypto-news-default`, `thread-default`, etc.).

```
llm/
├── config/                                          # LLM settings
│   ├── application/
│   │   └── use-cases/
│   │       ├── get-llm-config.use-case.ts
│   │       ├── update-llm-config.use-case.ts
│   │       └── get-llm-models.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   └── llm-config.entity.ts                # llmEnabled + publishingEnabled
│   │   └── ports/
│   │       └── llm-config-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   └── llm-config.entity.ts
│               └── repositories/
│                   └── typeorm-llm-config.repository.ts
│
├── templates/                                       # Prompt templates
│   ├── application/
│   │   └── use-cases/
│   │       ├── create-template.use-case.ts
│   │       ├── list-templates.use-case.ts
│   │       └── activate-template.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   └── prompt-template.entity.ts           # Jinja2-like + contentType field
│   │   └── ports/
│   │       └── template-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   └── prompt-template.entity.ts
│               └── repositories/
│                   └── typeorm-template.repository.ts
│
├── core/                                            # LLM generation engine
│   ├── application/
│   │   └── services/
│   │       ├── llm-generator.service.ts            # Main orchestrator
│   │       ├── prompt-builder.service.ts           # Template rendering
│   │       └── content-validator.service.ts        # Post-gen validation (non-Latin filter)
│   ├── domain/
│   │   └── ports/
│   │       ├── llm-client.port.ts                  # Gateway interface
│   │       └── template-renderer.port.ts
│   └── infrastructure/
│       └── adapters/
│           ├── openai-llm.adapter.ts               # Via gateway
│           └── mock-llm.adapter.ts                 # USE_MOCK_AI
│
├── playground/                                      # Preview feature
│   ├── application/
│   │   └── use-cases/
│   │       └── generate-preview.use-case.ts        # Non-persisted generation
│   └── api/
│       ├── controllers/
│       │   └── playground.controller.ts            # POST /llm/playground/preview
│       └── dto/
│           ├── preview-request.dto.ts
│           └── preview-response.dto.ts
│
├── api/
│   ├── controllers/
│   │   ├── llm-config.controller.ts                # CRUD config
│   │   ├── templates.controller.ts                 # CRUD templates
│   │   └── models.controller.ts                    # GET available models
│   └── dto/
│       ├── update-llm-config.dto.ts
│       └── create-template.dto.ts
│
└── llm.module.ts
```

**Dependencias**:

- **Externa**: LLM Gateway (`LLM_GATEWAY_URL` o OpenAI API direct)
- **Interna**: Shared validation utils

**API Expuesta**:

```typescript
interface LlmGeneratorService {
  generate(input: GenerateRequest): Promise<GenerateResponse>;
  preview(input: PreviewRequest): Promise<PreviewResponse>; // Playground only
}

interface GenerateRequest {
  contentType: ContentType; // 'crypto-news' | 'thread'
  title: string;
  content: string;
  mediaUrls: string[];
  templateId?: string; // Use specific template (default: active for contentType)
}

interface GenerateResponse {
  generatedTitle: string;
  generatedContent: string;
  modelUsed: string;
  tokensUsed: number;
  validationPassed: boolean;
  validationErrors?: string[]; // e.g., ["non-Latin character detected"]
}
```

**Rationale — 4 Subdirectorios**:

- ✅ **Config isolated** — Settings management separate from generation logic
- ✅ **Templates reusable** — Multi-version prompt management (A/B testing)
- ✅ **Core engine decoupled** — Generator doesn't know about DB schemas
- ✅ **Playground sandboxed** — Preview feature isolated (no side effects)

**Migración**:

- ✅ Mover `LlmConfig` entity desde `crypto-news-publisher/`
- ✅ Mover `PromptTemplate` entity
- ✅ Mover `CryptoNewsLlmAdapter` → `llm/core/`
- ✅ Crear nuevo `playground/` module (feature nueva)
- ⚠️ **Decisión requerida**: ¿Gateway vs direct OpenAI? (Recomendación: Gateway para multi-provider)

---

### 8. Scheduling Module (`scheduling/`)

**Responsabilidad**: Ads rotation + media library (renombrado desde `crypto-news-ads`) — aplica a crypto-news only.

**Nota**: Threads NO usan ads (por diseñar si aplica en futuro).

```
scheduling/
├── core/                                            # Ads rotation logic
│   ├── application/
│   │   ├── services/
│   │   │   ├── ad-rotation.service.ts              # Weighted random selection
│   │   │   └── ad-scheduler.service.ts             # Cron orchestrator
│   │   ├── use-cases/
│   │   │   ├── create-ad.use-case.ts
│   │   │   ├── list-ads.use-case.ts
│   │   │   ├── update-rotation-config.use-case.ts
│   │   │   └── get-next-ad.use-case.ts
│   │   └── scheduling/
│   │       └── ads-cron.scheduler.ts               # Every minute
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── ad.entity.ts                        # Ad config (title/content/weight)
│   │   │   ├── ad-rotation-config.entity.ts        # Global rotation settings
│   │   │   └── ad-rotation-state.entity.ts         # Last-shown tracking
│   │   └── ports/
│   │       ├── ad-repository.port.ts
│   │       └── rotation-config-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   ├── ad.entity.ts
│               │   ├── ad-rotation-config.entity.ts
│               │   └── ad-rotation-state.entity.ts
│               └── repositories/
│                   ├── typeorm-ad.repository.ts
│                   └── typeorm-rotation-config.repository.ts
│
├── media/                                           # Media library management
│   ├── application/
│   │   ├── services/
│   │   │   └── ad-media-library.service.ts         # Media CRUD + serving
│   │   └── use-cases/
│   │       ├── create-ad-media.use-case.ts
│   │       ├── list-ad-media.use-case.ts
│   │       └── delete-ad-media.use-case.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── ad-media.entity.ts                  # Media metadata
│   │   │   └── ad-media-library.entity.ts          # Library grouping
│   │   └── ports/
│   │       └── ad-media-repository.port.ts
│   └── infrastructure/
│       └── persistence/
│           └── typeorm/
│               ├── entities/
│               │   ├── ad-media.entity.ts
│               │   └── ad-media-library.entity.ts
│               └── repositories/
│                   └── typeorm-ad-media.repository.ts
│

├── api/
│   ├── controllers/
│   │   ├── ads.controller.ts                       # CRUD ads
│   │   ├── rotation-config.controller.ts           # Rotation settings
│   │   └── ad-media.controller.ts                  # Media library
│   └── dto/
│       ├── create-ad.dto.ts
│       └── upload-ad-media.dto.ts
│
└── scheduling.module.ts
```

**Dependencias**:

- `telegram/` — Bot API publishing (for scheduled ads)
- `queue/` — Injection into publisher queue

**API Expuesta**:

```typescript
interface AdRotationService {
  getNextAd(): Promise<Ad | null>;
  scheduleAd(queueEntry: QueueEntry): Promise<void>;
}

interface AdMediaService {
  uploadMedia(file: Buffer, metadata: MediaMetadata): Promise<AdMedia>;
  getMediaUrl(mediaId: string): string;
  deleteMedia(mediaId: string): Promise<void>;
}
```

**Rationale — `scheduling` Name**:

- ✅ **Evita confusión** con `@nestjs/schedule` cron decorators
- ✅ **Más descriptivo** que "ads" (comunica que son posts programados)
- ✅ **Futuro-proof** — Si se agregan otros tipos de scheduled content (e.g., reminders)

**Uploads Location** — ✅ **DECISIÓN TOMADA: Opción B (raíz app)**

**Ubicación final**: `apps/content-publisher/uploads/ads-library/`

```
apps/content-publisher/
├── uploads/                    # Physical media files (gitignored)
│   └── ads-library/
│       ├── image-1.jpg
│       ├── image-2.png
│       └── video-1.mp4
├── scheduling/                 # Scheduling module (NO contiene uploads/)
│   ├── core/
│   ├── media/
│   └── api/
└── ...
```

**Rationale**:

- ✅ Sigue convención monorepo (`dist/`, `node_modules/`, `uploads/` en raíz)
- ✅ Simpler gitignore (una entrada: `/uploads/`)
- ✅ Path mapping en service (`join(__dirname, '../uploads/ads-library/')`)
- ✅ Separación clara: código en `src/`, assets en `uploads/`

**Migración**:

- ✅ Mover `crypto-news-ads/` completo → `scheduling/`
- ✅ Renombrar `CryptoNewsAdsModule` → `SchedulingModule`
- ✅ Mover uploads desde backend `crypto-news-ads-library/` → content-publisher `uploads/ads-library/`

---

### 9. Threads Module (`threads/`)

**Responsabilidad**: Thread generation & management (FUTURO — out of scope v1).

```
threads/
├── application/
│   ├── services/
│   │   ├── thread-builder.service.ts              # Orchestrator (multi-message threads)
│   │   └── thread-scheduler.service.ts            # Timing & sequencing
│   ├── use-cases/
│   │   ├── create-thread.use-case.ts
│   │   ├── enqueue-thread.use-case.ts
│   │   └── publish-thread.use-case.ts
│   └── scheduling/
│       └── thread-publisher-cron.scheduler.ts
├── domain/
│   ├── entities/
│   │   ├── thread.entity.ts                       # Multi-message container
│   │   └── thread-message.entity.ts               # Individual message in thread
│   └── ports/
│       └── thread-repository.port.ts
├── infrastructure/
│   └── persistence/
│       └── typeorm/
│           ├── entities/
│           │   ├── thread.entity.ts
│           │   └── thread-message.entity.ts
│           └── repositories/
│               └── typeorm-thread.repository.ts
├── api/
│   ├── controllers/
│   │   └── threads.controller.ts                  # CRUD threads
│   └── dto/
│       ├── create-thread.dto.ts
│       └── enqueue-thread.dto.ts
└── threads.module.ts
```

**Dependencias**:

- `ingestion/` — Fetch content for threads (DEPRECADO: KOL messages ahora en apps/kol-system/)
- `queue/` — Enqueue threads (contentType='thread')
- `llm/` — Optional thread content refinement
- `telegram/` — Bot API publishing (threads bot adapter)

> **⚠️ NOTA**: El fetching de KOL messages fue movido a `apps/kol-system/`.  
> Threads en v1 no consumen KOL data directamente.  
> Ver: [refactor-kol-system/overview.md](../../.kiro/specs/refactor-kol-system/overview.md)

**API Expuesta**:

```typescript
interface ThreadService {
  createThread(messages: ThreadMessageInput[]): Promise<Thread>;
  enqueueThread(thread: Thread): Promise<void>;
  publishThread(threadId: string): Promise<void>;
}

interface ThreadMessageInput {
  content: string;
  mediaUrls?: string[];
  delaySeconds?: number; // Delay after previous message
}
```

**Design Considerations**:

1. **Multi-message threads** — Un thread = N mensajes secuenciales con delays
2. **No matching** — Threads van directo a queue (sin keywords/blacklist)
3. **Optional LLM** — Thread content puede ser raw o LLM-refined (configurable)
4. **Sequencing logic** — Scheduler maneja delays entre mensajes
5. **Dedup cross-thread** — Dedup service valida contra mensajes individuales (no threads completos)
6. **Bot selection** — Threads usan **threads bot token** (`THREADS_BOT_TOKEN`).

   > **⚠️ NOTA**: El token `KOL_BOT_TOKEN` (para VIP calls) ahora es propiedad de `apps/kol-system/`.  
   > Los threads (contenido largo-form) usan un bot dedicado separado.  
   > Ver: [refactor-kol-system/overview.md](../../.kiro/specs/refactor-kol-system/overview.md)

**Failure Handling** (CRÍTICO):

```typescript
interface ThreadPublishState {
  threadId: string;
  messagesPublished: number; // 0..N
  lastPublishedMessageIndex: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  failureReason?: string;
}
```

**Escenarios**:

- **Partial publish** — Mensaje 1 OK, mensaje 2 falla → Estado: `PARTIAL`, retry desde mensaje 2 (no re-publica mensaje 1)
- **Critical failure** — Bot token inválido → Estado: `FAILED`, no retry (fix token primero)
- **Transient failure** — Rate limit → Estado: `IN_PROGRESS`, retry después de backoff

**Futuro (out of scope v1)**:

- Thread templates (pre-defined message sequences)
- Thread analytics (engagement tracking)
- Thread editing (update pending threads)
- Thread cancellation (abort in-progress threads)

---

### 10. Telegram Module (`telegram/`)

**Responsabilidad**: Bot API adapters centralizados (crypto-news + threads).

> **⚠️ NOTA IMPORTANTE**: El bot KOL (para VIP calls) fue movido a `apps/kol-system/`.  
> Ver: [refactor-kol-system/overview.md](../../.kiro/specs/refactor-kol-system/overview.md)

```
telegram/
├── application/
│   └── services/
│       ├── crypto-news-bot-publisher.service.ts   # Crypto-news dedicated
│       └── threads-bot-publisher.service.ts       # Threads dedicated
│                                                   # (RENOMBRADO desde kol-bot-publisher)
│                                                   # KOL VIP calls ahora en apps/kol-system/
├── domain/
│   └── ports/
│       └── telegram-publisher.port.ts             # Shared interface
├── infrastructure/
│   └── adapters/
│       ├── crypto-news-bot-api.adapter.ts         # CRYPTO_NEWS_BOT_TOKEN
│       └── threads-bot-api.adapter.ts             # THREADS_BOT_TOKEN
│                                                   # (RENOMBRADO desde kol-bot-api)
└── telegram.module.ts
```

**Dependencias**:

- **Externa**: Telegram Bot API (`api.telegram.org`)
- **Interna**: Ninguna (leaf module)

**API Expuesta**:

```typescript
interface TelegramPublisherPort {
  sendMessage(params: SendMessageParams): Promise<TelegramMessage>;
  sendPhoto(params: SendPhotoParams): Promise<TelegramMessage>;
}

interface SendMessageParams {
  chatId: string;
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  disableWebPagePreview?: boolean;
}
```

**Rationale — 2 Bot Adapters**:

- ✅ **Separate bot tokens** — Crypto-news (`CRYPTO_NEWS_BOT_TOKEN`) + Threads (`THREADS_BOT_TOKEN`)
  - **NOTA**: `KOL_BOT_TOKEN` (para VIP calls) ahora vive en `apps/kol-system/`
- ✅ **Independent rate limiting** — Cada bot tiene su propia throttle config
- ✅ **No shared state** con otros publishers
- ✅ **Future-proof** — Fácil agregar bots adicionales

**Design**:

- Shared `TelegramPublisherPort` interface
- Dos implementaciones concretas (crypto-news + threads)
- VIP calls publishing → Ver `apps/kol-system/publishing/`
- `QueueService` routing por `contentType`:
  - `contentType='crypto-news'` → `CryptoNewsBotPublisher`
  - `contentType='thread'` → `KolBotPublisher`

**Migración**:

- ✅ Copy `BotApiCryptoNewsPublisherAdapter` desde backend → `crypto-news-bot-api.adapter.ts`
- ✅ Crear nuevo `kol-bot-api.adapter.ts` (para threads, futuro)
- ✅ Remover dependencia shared con vip-calls
- ⚠️ **Decisión requerida**: ¿Mantener rate limit 1 msg/min? (Recomendación: Configurable por bot)

---

### 11. Shared Module (`shared/`)

**Responsabilidad**: Cross-cutting concerns (domain VOs, infra, utils, config) — shared por TODOS los módulos.

```
shared/
├── domain/
│   ├── value-objects/
│   │   ├── channel-id.vo.ts                        # Telegram channel ID validation
│   │   ├── message-id.vo.ts                        # Telegram message ID (numeric)
│   │   ├── content-hash.vo.ts                      # SHA-256 fingerprint
│   │   ├── content-type.vo.ts                      # Enum: 'crypto-news' | 'thread'
│   │   ├── timestamp.vo.ts                         # Unix timestamp + timezone utils
│   │   ├── url.vo.ts                               # URL validation + normalization
│   │   └── language-code.vo.ts                     # ISO 639-1 (en, es, etc.)
│   ├── events/
│   │   ├── base/
│   │   │   ├── domain-event.base.ts                # Abstract base class
│   │   │   └── event-metadata.ts                   # Timestamp, correlation ID, user ID
│   │   ├── content/
│   │   │   ├── message-matched.event.ts            # Matching module emits
│   │   │   ├── queue-entry-created.event.ts        # Queue module emits
│   │   │   ├── content-published.event.ts          # Telegram module emits
│   │   │   └── thread-created.event.ts             # Threads module emits
│   │   └── system/
│   │       ├── health-check-failed.event.ts        # Health monitoring
│   │       └── rate-limit-exceeded.event.ts        # Throttling
│   └── exceptions/
│       ├── domain-exception.ts                     # Base domain error
│       ├── validation-exception.ts                 # Input validation errors
│       ├── not-found-exception.ts                  # Resource not found
│       └── business-rule-violation.exception.ts    # Domain invariant violations
│
├── infrastructure/
│   ├── persistence/
│   │   ├── typeorm/
│   │   │   ├── typeorm.config.ts                   # DataSource factory (env-based)
│   │   │   ├── base-repository.ts                  # Abstract repo (common CRUD)
│   │   │   ├── transaction-manager.ts              # Transaction wrapper (@Transactional decorator)
│   │   │   └── naming-strategy.ts                  # snake_case columns
│   │   └── migrations/                             # Timestamped migrations (centralized)
│   │       ├── 1788659125192-SplitLlmConfigFlags.ts
│   │       ├── 1860000000000-AddQueuedAtColumn.ts
│   │       └── ...
│   ├── http/
│   │   ├── http-client.service.ts                  # Axios wrapper (retry, timeout, circuit breaker)
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts              # Request/response logging
│   │   │   ├── auth.interceptor.ts                 # JWT/API key injection
│   │   │   └── error-mapping.interceptor.ts        # HTTP → Domain exceptions
│   │   └── retry-strategy.ts                       # Exponential backoff (1s → 30s)
│   ├── cache/
│   │   ├── cache.interface.ts                      # Port (get/set/del/ttl)
│   │   ├── redis-cache.adapter.ts                  # Redis implementation
│   │   ├── memory-cache.adapter.ts                 # In-memory (testing)
│   │   └── cache-key-builder.ts                    # Namespace + key generation
│   ├── messaging/
│   │   ├── event-bus.service.ts                    # EventEmitter2 wrapper (async/sync modes)
│   │   └── event-handler.decorator.ts              # @OnEvent custom decorator
│   ├── monitoring/
│   │   ├── logger.service.ts                       # Pino wrapper (structured logging)
│   │   ├── metrics.service.ts                      # Prometheus metrics (counters, gauges, histograms)
│   │   └── health-indicator.interface.ts           # Health check contract
│   └── security/
│       ├── encryption.service.ts                   # AES-256-GCM encryption (env secrets)
│       ├── hashing.service.ts                      # SHA-256, bcrypt, HMAC
│       └── rate-limiter.service.ts                 # Token bucket algorithm
│
├── application/
│   ├── decorators/
│   │   ├── transactional.decorator.ts              # @Transactional() method wrapper
│   │   ├── cacheable.decorator.ts                  # @Cacheable(ttl, key) memoization
│   │   └── rate-limit.decorator.ts                 # @RateLimit(requests, window)
│   └── filters/
│       ├── http-exception.filter.ts                # Global HTTP error handler
│       ├── domain-exception.filter.ts              # Domain → HTTP status mapping
│       └── validation.filter.ts                    # class-validator errors → 400
│
├── config/
│   ├── app.config.ts                               # registerAs('app', ...) - port, env, name
│   ├── database.config.ts                          # DB connection settings
│   ├── redis.config.ts                             # Redis connection
│   ├── telegram.config.ts                          # Bot tokens (crypto-news + kol)
│   ├── llm.config.ts                               # LLM gateway URL + API keys
│   └── config.module.ts                            # ConfigModule.forRoot() wrapper
│
├── guards/
│   ├── api-key.guard.ts                            # @UseGuards(ApiKeyGuard) - admin endpoints
│   └── feature-flag.guard.ts                       # @FeatureFlag('threads') - gradual rollout
│
├── pipes/
│   ├── parse-content-type.pipe.ts                  # Transform string → ContentType VO
│   ├── parse-timestamp.pipe.ts                     # ISO 8601 → Date
│   └── trim-strings.pipe.ts                        # Sanitize input strings
│
├── validators/
│   ├── is-telegram-channel-id.validator.ts         # Custom class-validator (numeric, negative)
│   ├── is-content-type.validator.ts                # Validate against ContentType enum
│   └── is-safe-regex.validator.ts                  # ReDoS detection (filters module)
│
└── utils/
    ├── date/
    │   ├── date.utils.ts                           # formatDate, diffInMinutes, isExpired
    │   └── timezone.utils.ts                       # UTC conversions
    ├── string/
    │   ├── text-normalizer.util.ts                 # Lowercase, trim, remove special chars
    │   ├── url-parser.util.ts                      # Extract domain, strip query params
    │   ├── slug.util.ts                            # Generate URL-safe slugs
    │   └── sanitize.util.ts                        # XSS protection (strip HTML tags)
    ├── crypto/
    │   ├── hash.util.ts                            # SHA-256, MD5
    │   └── random.util.ts                          # Secure random strings (crypto.randomBytes)
    ├── array/
    │   ├── chunk.util.ts                           # Split array into chunks
    │   ├── unique-by.util.ts                       # Dedup by key
    │   └── group-by.util.ts                        # Group objects by property
    └── promise/
        ├── retry.util.ts                           # Retry async operation with backoff
        ├── timeout.util.ts                         # Promise.race with timeout
        └── batch.util.ts                           # Process array in batches (concurrency limit)
```

**API Expuesta** (exports públicos):

```typescript
// Value Objects
export * from './domain/value-objects';

// Events
export * from './domain/events';
export { DomainEvent } from './domain/events/base/domain-event.base';

// Exceptions
export * from './domain/exceptions';

// Infrastructure Services
export { HttpClientService } from './infrastructure/http/http-client.service';
export { CacheService } from './infrastructure/cache/cache.interface';
export { RedisCacheAdapter } from './infrastructure/cache/redis-cache.adapter';
export { LoggerService } from './infrastructure/monitoring/logger.service';
export { MetricsService } from './infrastructure/monitoring/metrics.service';

// Decorators
export { Transactional } from './application/decorators/transactional.decorator';
export { Cacheable } from './application/decorators/cacheable.decorator';
export { RateLimit } from './application/decorators/rate-limit.decorator';

// Utilities
export * from './utils';

// Config
export { SharedModule } from './shared.module';
```

**SharedModule Registration**:

```typescript
@Global() // ← Hace que exports estén disponibles sin re-import
@Module({
  imports: [
    ConfigModule, // Config centralized
    TypeOrmModule, // DB connection
    EventEmitterModule, // Event bus
  ],
  providers: [
    // Infrastructure
    HttpClientService,
    LoggerService,
    MetricsService,
    RedisCacheAdapter,

    // Domain Services (si aplican)
    HashingService,
    EncryptionService,

    // Filters
    HttpExceptionFilter,
    DomainExceptionFilter,
  ],
  exports: [
    // Services
    HttpClientService,
    LoggerService,
    MetricsService,
    RedisCacheAdapter,
    HashingService,

    // Modules (re-export)
    ConfigModule,
    TypeOrmModule,
  ],
})
export class SharedModule {}
```

**Rationale — Componentes Transversales**:

1. **Domain Layer**
   - ✅ **VOs reutilizables** — ChannelId, MessageId, ContentType usados por 5+ módulos
   - ✅ **Domain events** — Contract para event bus (matching → queue → telegram)
   - ✅ **Exceptions** — Error hierarchy (ValidationException, NotFoundException)

2. **Infrastructure Layer**
   - ✅ **TypeORM config** — Single DataSource (no duplicar DB connection por módulo)
   - ✅ **HTTP client** — Retry logic + circuit breaker (usado por ingestion, telegram, llm)
   - ✅ **Cache** — Redis adapter shared (dedup, matching, LLM results)
   - ✅ **Logging** — Structured logging (todos los módulos usan mismo logger)
   - ✅ **Metrics** — Prometheus counters/gauges (centralized telemetry)

3. **Application Layer**
   - ✅ **Decorators** — `@Transactional`, `@Cacheable`, `@RateLimit` (AOP)
   - ✅ **Filters** — Global exception handlers (HTTP + domain errors)
   - ✅ **Guards** — API key validation, feature flags

4. **Config Layer**
   - ✅ **Environment configs** — Centralized (app, DB, Redis, Telegram, LLM)
   - ✅ **Validation** — class-validator schemas (fail-fast on bad config)

5. **Utils**
   - ✅ **Pure functions** — Date manipulation, string sanitization, crypto
   - ✅ **Testable** — No side effects, deterministic

**Migración**:

- ✅ Crear estructura completa en Phase 1 (skeleton)
- ✅ Extraer common code de backend `shared/` (kernel, common, filters)
- ✅ Migrar utils dispersos (cada módulo tiene sus propios duplicados)
- ✅ Centralizar TypeORM migrations (actualmente duplicadas por BC)

**Anti-Pattern a Evitar**:

- ❌ **NO poner domain logic** en shared (e.g., `MatchingService` NO va aquí)
- ❌ **NO poner use cases** (shared solo infra + VOs + utils)
- ❌ **NO poner entities** (cada módulo es owner de sus aggregates)

**Dependency Rule**:

```
Modules → Shared  ✅ (allowed)
Shared → Modules  ❌ (violation — causes circular dependency)
```

---

## Orquestación de Módulos

### Dependency Graph

```
                    ┌──────────────┐
                    │ App Module   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────────────┐
         │                 │                         │
    ┌────▼────┐       ┌────▼────┐      ┌────▼────┐ │
    │Ingestion│       │Matching │      │  Queue  │ │
    └────┬────┘       └────┬────┘      └────┬────┘ │
         │                 │                 │      │
         │            ┌────▼────┐       ┌────▼────┐ │
         │            │Keywords │       │   LLM   │ │
         │            └─────────┘       └────┬────┘ │
         │            ┌─────────┐            │      │
         │            │Filters  │       ┌────▼────┐ │
         │            └─────────┘       │Telegram │ │
         │                              │(2 bots) │ │
         │            ┌─────────┐       └────┬────┘ │
         │            │ Threads │            │      │
         │            │(futuro) │            │      │
         │            └────┬────┘            │      │
         │                 │                 │      │
         └────────────┬────▼────┐       ┌───▼──────▼──┐
                      │  Dedup  ◄───────┤  Schedule   │
                      └─────────┘       └─────────────┘
                           │
                      ┌────▼────┐
                      │ Shared  │
                      └─────────┘
```

**Nota**: `Shared` module es dependency implícita de TODOS los demás módulos (VOs, events, TypeORM DataSource, utils). No se muestra conectado explícitamente en el diagrama por claridad visual.

**Flujo Completo (Crypto-News)**:

```typescript
// 1. Ingestion → Fetch RAW
const raw = await ingestionClient.getRecentMessages({ limit: 50 });

// 2. Matching → Filter + evaluate
const matched = await matchingService.getMatchingMessages(50);

// 3. Queue → Enqueue (with dedup check)
for (const msg of matched) {
  const isDupe = await dedupService.checkDuplicate(msg);
  if (!isDupe.isDuplicate) {
    await queueService.enqueue(msg, 'crypto-news'); // contentType
  }
}

// 4. Scheduler → Process queue (crypto-news only)
const entry = await queueService.dequeue('crypto-news');

// 5. LLM → Generate content (if enabled)
const generated = await llmService.generate({
  contentType: 'crypto-news',
  title: entry.title,
  content: entry.content,
  mediaUrls: entry.mediaUrls,
});

// 6. Telegram → Publish (crypto-news bot)
await cryptoNewsBotPublisher.sendMessage({
  chatId: config.targetChannel,
  text: generated.generatedContent,
});

// 7. Queue → Mark published
await queueService.markPublished(entry.id);

// 8. Dedup → Record fingerprint
await dedupService.markAsSeen(entry);
```

**Flujo Completo (Threads — FUTURO)**:

```typescript
// 1. Threads → Create multi-message thread
const thread = await threadService.createThread([
  { content: 'Message 1', delaySeconds: 0 },
  { content: 'Message 2', delaySeconds: 30 },
  { content: 'Message 3', delaySeconds: 60 },
]);

// 2. Queue → Enqueue thread (NO matching, NO filters)
await queueService.enqueue(thread, 'thread'); // contentType='thread'

// 3. Scheduler → Process queue (threads)
const entry = await queueService.dequeue('thread');

// 4. LLM → Optional refinement
const refined = await llmService.generate({
  contentType: 'thread',
  title: '',
  content: entry.messages[0].content,
  mediaUrls: [],
});

// 5. Telegram → Publish sequence (KOL bot)
for (const msg of thread.messages) {
  await kolBotPublisher.sendMessage({
    chatId: config.kolChannel,
    text: msg.content,
  });
  await sleep(msg.delaySeconds * 1000); // Sequential delays
}

// 6. Queue → Mark published
await queueService.markPublished(entry.id);
```

---

## Configuración & Bootstrap

### main.ts

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3040);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS (development)
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  await app.listen(port);
  logger.log(`🚀 Content Publisher listening on http://localhost:${port}`);
}

bootstrap();
```

**Port Allocation** — ⚠️ **DECISIÓN REQUERIDA**:

| Env        | Backend | Frontend | Ingestion-Telegram | Content-Publisher (propuesto) |
| ---------- | ------- | -------- | ------------------ | ----------------------------- |
| Dev        | 3030    | 5173     | 3031               | **3040**                      |
| Staging    | 3031    | 4173     | 3033               | **3041**                      |
| Production | 3030    | 80       | 3032               | **3042**                      |

**Rationale**: Evita colisiones con staging backend (3031).

### app.module.ts

```typescript
@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.dev', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [
          __dirname +
            '/shared/infrastructure/persistence/migrations/*{.ts,.js}',
        ],
        synchronize: config.get('database.synchronize', false),
        logging: false,
      }),
      inject: [ConfigService],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Event Bus
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 32,
    }),

    // Modules
    IngestionModule,
    MatchingModule,
    KeywordsModule,
    FiltersModule,
    QueueModule,
    DeduplicationModule,
    LlmModule,
    SchedulingModule, // Renamed from AdsModule
    ThreadsModule, // FUTURO (commented out in v1)
    TelegramModule, // 2 bot adapters
    SharedModule,
  ],
})
export class AppModule {}
```

### Environment Variables

```bash
# .env.example (apps/content-publisher/)

# App
APP_PORT=3040
NODE_ENV=development

# Database (separate from backend DB)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=content_publisher_dev
DATABASE_SYNCHRONIZE=true  # false in staging/prod

# Ingestion-Telegram
INGESTION_TELEGRAM_URL=http://localhost:3031
USE_SSE_CRYPTO_NEWS=true

# Telegram Bots
CRYPTO_NEWS_BOT_TOKEN=123456:ABC-DEF...
CRYPTO_NEWS_OUTPUT_CHANNEL=-1001234567890
KOL_BOT_TOKEN=789012:GHI-JKL...
KOL_OUTPUT_CHANNEL=-1009876543210

# LLM
LLM_GATEWAY_URL=http://localhost:8000
USE_MOCK_AI=false

# Matching
CRYPTO_NEWS_POLLING_INTERVAL_MINUTES=5

# Queue
QUEUE_TTL_HOURS=24
QUEUE_MAX_SIZE=36

# Deduplication
DEDUP_SEMANTIC_THRESHOLD=0.7
OPENAI_API_KEY=sk-...  # For embeddings

# Redis (optional caching)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Database Schema

### Nueva DB: `content_publisher_dev|staging|production`

**Rationale**: DB separada del backend para:

- ✅ **Independent scaling** — Publisher puede tener su propio RDS instance
- ✅ **Backup isolation** — Snapshots no incluyen backend data
- ✅ **Schema evolution** — Migrations independientes de backend
- ⚠️ **Trade-off**: No puede JOIN con backend tables (pero ya no debería necesitarlo)

### Tables (16 en v1, 18 en v2)

```sql
-- Matching (1 tabla)
matching_configs                     -- matchingEnabled flag (singleton)

-- Keywords (4 tablas)
keywords                             -- Allowed keywords (OR logic)
blacklist_phrases                    -- Blocked phrases
compound_keyword_groups              -- AND-group configs
compound_keyword_items               -- Items in compound groups

-- Filters (1 tabla)
channel_content_filter_configs       -- Per-channel regex filters

-- Queue (1 tabla - MULTI-CONTENT)
publisher_queue                      -- Unified queue + contentType discriminator

-- Deduplication (1 tabla)
dedup_records                        -- Fingerprints + embeddings

-- LLM (2 tablas)
llm_configs                          -- llmEnabled + publishingEnabled (singleton)
prompt_templates                     -- Jinja2-like + contentType field

-- Scheduling/Ads (6 tablas)
ads                                  -- Ad configs
ad_rotation_configs                  -- Rotation settings
ad_rotation_states                   -- Last-shown tracking
ads_throttle_states                  -- Rate limiting
ad_media                             -- Media metadata
ad_media_library                     -- Library grouping

-- Threads (2 tablas - FUTURO v2)
threads                              -- Thread containers
thread_messages                      -- Individual messages in threads

-- TOTAL: 16 tablas (v1 sin threads) | 18 tablas (v2 con threads)
```

**Queue Table Schema Change** (contentType discriminator):

```sql
ALTER TABLE crypto_news_publisher_queue
ADD COLUMN content_type VARCHAR(20) DEFAULT 'crypto-news';

CREATE INDEX idx_publisher_queue_content_type
ON crypto_news_publisher_queue (content_type, status);

-- Rename table (semantic clarity)
ALTER TABLE crypto_news_publisher_queue RENAME TO publisher_queue;
```

**Migration desde Backend**:

```bash
# 1. Dump backend crypto-news tables
pg_dump -h localhost -U postgres alpha_meta_token_scanner_dev \
  --table=keywords \
  --table=blacklist_phrases \
  --table=channel_content_filter_configs \
  --table=crypto_news_publisher_queue \
  --table=dedup_records \
  --table=llm_configs \
  --table=prompt_templates \
  --table=ads \
  --table=ad_rotation_configs \
  --table=ad_rotation_states \
  --table=ads_throttle_states \
  --table=ad_media \
  --table=ad_media_library \
  --data-only --column-inserts > content_publisher_data.sql

# 2. Create new DB
createdb -h localhost -U postgres content_publisher_dev

# 3. Run migrations (empty schema)
cd apps/content-publisher
npm run migration:run

# 4. Import data
psql -h localhost -U postgres content_publisher_dev < content_publisher_data.sql

# 5. Add contentType column (all existing = 'crypto-news')
psql -h localhost -U postgres content_publisher_dev -c "
  ALTER TABLE crypto_news_publisher_queue
  ADD COLUMN content_type VARCHAR(20) DEFAULT 'crypto-news';

  ALTER TABLE crypto_news_publisher_queue RENAME TO publisher_queue;
"
```

---

## Deployment

### Docker Compose (Development)

```yaml
# apps/content-publisher/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: content-publisher-postgres-dev
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: content_publisher_dev
    ports:
      - '${POSTGRES_PORT:-5435}:5432' # Avoid collision with backend (5432)
    volumes:
      - content-publisher-db-dev:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: content-publisher-redis-dev
    ports:
      - '${REDIS_PORT:-6382}:6379' # Avoid collision with backend (6379)
    volumes:
      - content-publisher-redis-dev:/data

volumes:
  content-publisher-db-dev:
  content-publisher-redis-dev:
```

**Commands**:

```bash
# Start infra
cd apps/content-publisher
POSTGRES_PORT=5435 REDIS_PORT=6382 docker compose up -d

# Start app
npm run start:dev  # Watch mode, port 3040
```

### Production (Oracle Server)

**Port Allocation** (propuesto):

```
Oracle Host:
  - Backend prod: 3030 (unchanged)
  - Backend staging: 3031 (unchanged)
  - Ingestion prod: 3032 (unchanged)
  - Ingestion staging: 3033 (unchanged)
  - Content-Publisher prod: 3042 (NEW)
  - Content-Publisher staging: 3041 (NEW)
```

**Docker Compose** (`docker-compose.content-publisher.prod.yml`):

```yaml
version: '3.9'

services:
  content-publisher:
    image: ghcr.io/owner/content-publisher:latest
    container_name: content-publisher-prod
    restart: unless-stopped
    ports:
      - '127.0.0.1:3042:3040' # Host 3042 → container 3040
    env_file:
      - .env.production
    volumes:
      - ./uploads:/app/uploads # Ads media
      - ./logs:/app/logs
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    container_name: content-publisher-postgres-prod
    restart: unless-stopped
    environment:
      POSTGRES_DB: content_publisher_prod
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - '127.0.0.1:5436:5432' # Avoid collision
    volumes:
      - content-publisher-db-prod:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: content-publisher-redis-prod
    restart: unless-stopped
    ports:
      - '127.0.0.1:6383:6379'
    volumes:
      - content-publisher-redis-prod:/data

volumes:
  content-publisher-db-prod:
  content-publisher-redis-prod:
```

---

## Testing Strategy

### Unit Tests (Per Module)

```bash
# Run all tests
npm test

# Run specific module
npm test -- matching
npm test -- queue
npm test -- llm/core

# Coverage
npm run test:cov
```

**Test Organization**:

```
crypto-news/matching/
├── application/
│   └── services/
│       ├── filtered-crypto-news.service.ts
│       └── filtered-crypto-news.service.spec.ts  # Co-located
└── ...
```

### E2E Tests (Pipeline Flow)

```typescript
// test/pipeline.e2e-spec.ts
describe('Content Publisher Pipeline (e2e)', () => {
  it('publishes matched message end-to-end', async () => {
    // 1. Mock ingestion-telegram response
    mockServer.get('/api/feed/messages').reply(200, [rawMessage]);

    // 2. Trigger matching cron
    await app.get(EnqueueMatchingCronScheduler).handleCron();

    // 3. Verify queue entry created
    const entry = await queueRepo.findOne({
      where: { messageId: rawMessage.messageId },
    });
    expect(entry.status).toBe('PENDING');

    // 4. Trigger publisher cron
    await app.get(PublisherCronScheduler).handleCron();

    // 5. Verify published
    const updated = await queueRepo.findOne({ where: { id: entry.id } });
    expect(updated.status).toBe('PUBLISHED');

    // 6. Verify correct bot called (crypto-news bot, NOT KOL bot)
    expect(mockCryptoNewsBot.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: config.cryptoNewsChannel,
        text: expect.stringContaining('generated content'),
      }),
    );
    expect(mockKolBot.sendMessage).not.toHaveBeenCalled(); // Ensure KOL bot NOT used

    // 7. Verify contentType persisted correctly
    expect(updated.contentType).toBe('crypto-news');
  });
});
```

---

## Migration Roadmap

### Phase 1: Setup (Week 1)

**Goals**: Create new app structure, configure tooling.

**Tasks**:

- [ ] Create `apps/content-publisher/` directory
- [ ] Setup `package.json` (workspace dependency)
- [ ] Create `main.ts`, `app.module.ts` boilerplate
- [ ] Configure TypeORM with separate DB
- [ ] Setup Docker Compose (postgres:5435, redis:6382)
- [ ] Configure ESLint + Prettier (inherit from root)
- [ ] Create `.env.example`

**Deliverables**:

- ✅ App boots on port 3040
- ✅ TypeORM connects to `content_publisher_dev`
- ✅ Health check `GET /health` returns 200

---

### Phase 2: Core Modules (Week 2-3)

**Goals**: Migrate leaf modules (no dependencies).

**Tasks**:

- [ ] Migrate `ingestion/` module
  - Copy `CryptoNewsIngestionClient`
  - Copy `ProcessCryptoNewsMessageHandler`
  - Write tests
- [ ] Migrate `filters/` module
  - Move from `telegram/ingestion/crypto-news/`
  - Copy `ContentFilterService`
  - Copy `ChannelContentFilterConfig` entity
  - Migrate DB table + data
- [ ] Migrate `keywords/` module
  - Create `allowed/`, `blocked/`, `compound/` subdirs
  - Move `Keyword`, `BlacklistPhrase` entities
  - Implement `CompoundKeywordGroup` (new feature)
  - Migrate DB tables + data
- [ ] Migrate `telegram/` module
  - Copy `BotApiPublisherAdapter`
  - Remove shared state with vip-calls
  - Write isolated tests

**Deliverables**:

- ✅ All 4 modules boot independently
- ✅ Unit tests pass (>80% coverage)
- ✅ DB migrations run successfully

---

### Phase 3: Orchestration Modules (Week 4-5)

**Goals**: Migrate modules with inter-dependencies.

**Tasks**:

- [ ] Migrate `matching/` module
  - Move `FilteredCryptoNewsService`
  - Move `EnqueueMatchingCronScheduler`
  - Wire dependencies (ingestion, filters, keywords)
- [ ] Migrate `deduplication/` module
  - Move `DeduplicationService`
  - Move `DedupRecord` entity
  - Implement embeddings adapter (OpenAI)
  - Migrate DB table + data
- [ ] Migrate `queue/` module
  - Move `PublisherQueueEntry` entity
  - Move `EnqueueMatchingMessageUseCase`
  - Move `ProcessNextQueuedArticleUseCase` (CRÍTICO)
  - Move schedulers (publisher cron, expire stale)
  - Wire dependencies (dedup, llm, telegram, scheduling)
  - Migrate DB table + data

**Deliverables**:

- ✅ Matching cron fetches messages
- ✅ Queue enqueues matched messages
- ✅ Deduplication blocks duplicates

---

### Phase 4: LLM & Scheduling (Week 6)

**Goals**: Migrate content generation and ads.

**Tasks**:

- [ ] Migrate `llm/` module
  - Create 4 subdirs (config/templates/core/playground)
  - Move `LlmConfig`, `PromptTemplate` entities
  - Move `CryptoNewsLlmAdapter` → `core/`
  - Implement `playground/` (new feature)
  - Migrate DB tables + data
- [ ] Migrate `scheduling/` module
  - Rename from `crypto-news-ads/`
  - Create `core/`, `media/` subdirs
  - Move all Ad entities
  - Move uploads from backend → `apps/content-publisher/uploads/ads-library/`
  - Migrate DB tables + data

**Deliverables**:

- ✅ LLM generation works (mock + real)
- ✅ Playground preview endpoint functional
- ✅ Ads rotation works
- ✅ Media serving works

---

### Phase 5: Integration & Testing (Week 7)

**Goals**: E2E pipeline verification.

**Tasks**:

- [ ] Write E2E tests (pipeline flow)
- [ ] Integration testing with ingestion-telegram (dev env)
- [ ] Load testing (queue throughput, LLM latency)
- [ ] Performance profiling (memory leaks, DB query optimization)

**Deliverables**:

- ✅ E2E test suite passes (>5 scenarios)
- ✅ Load test: 100 msgs/min processed
- ✅ Memory stable over 24h run

---

### Phase 6: Deployment (Week 8)

**Goals**: Production deployment on Oracle server.

**Tasks**:

- [ ] Setup GitHub Actions workflow (`deploy-content-publisher.yml`)
- [ ] Build Docker image (multi-stage, alpine)
- [ ] Create production Docker Compose
- [ ] Port allocation on Oracle (3042 prod, 3041 staging)
- [ ] Database migration (backend → content-publisher DB)
- [ ] Uploads migration (rsync ads-library files)
- [ ] Monitoring setup (logs, metrics, alerts)
- [ ] Rollback plan documentation

**Deliverables**:

- ✅ Staging deployment successful
- ✅ Production deployment successful
- ✅ Zero downtime migration
- ✅ Rollback tested

---

### Phase 7: Backend Cleanup (Week 9)

**Goals**: Remove migrated code from backend.

**Tasks**:

- [ ] Delete `telegram/crypto-news-integration/`
- [ ] Delete `telegram/crypto-news-publisher/`
- [ ] Delete `telegram/crypto-news-ads/`
- [ ] Delete `telegram/ingestion/crypto-news/` (filters only)
- [ ] Drop migrated tables from backend DB
- [ ] Update backend `AppModule` (remove imports)
- [ ] Update frontend API clients (new base URL)
- [ ] Update documentation (AGENTS.md, README)

**Deliverables**:

- ✅ Backend deploys without errors
- ✅ Frontend connects to new publisher API
- ✅ Documentation updated

---

## Frontend API Migration

### Changed Endpoints (v1 backend → v2 content-publisher)

| Old Endpoint (Backend)              | New Endpoint (Content-Publisher) | Breaking? | Notes                                          |
| ----------------------------------- | -------------------------------- | :-------: | ---------------------------------------------- |
| `POST /crypto-news-publisher/queue` | `POST /v1/queue`                 |    ✅     | New base URL + path                            |
| `GET /crypto-news-publisher/llm`    | `GET /v1/llm/config`             |    ✅     | Renamed path                                   |
| `GET /keywords`                     | `GET /v1/keywords/allowed`       |    ✅     | New subdirectory `/allowed`                    |
| `GET /blacklist`                    | `GET /v1/keywords/blocked`       |    ✅     | Unified under `/keywords`                      |
| `POST /ads`                         | `POST /v1/scheduling/ads`        |    ✅     | Renamed `/scheduling`                          |
| `GET /queue/status`                 | `GET /v1/queue/status`           |    ❌     | Only base URL change (non-breaking with proxy) |

### Migration Strategy (5 Weeks)

**Week 1-2**: Backend proxy layer (backward compat)

```typescript
// Backend routes (temporary, removed in Week 5)
@Controller('crypto-news-publisher')
export class PublisherProxyController {
  @Post('queue')
  async enqueueProxy(@Body() body: any) {
    // Redirect to content-publisher
    return this.httpClient.post(`${CONTENT_PUBLISHER_URL}/v1/queue`, body);
  }
}
```

**Week 3**: Frontend feature flag

```typescript
// Frontend config
const API_BASE_URL = import.meta.env.VITE_USE_NEW_PUBLISHER_API
  ? 'http://localhost:3040' // Content-Publisher
  : 'http://localhost:3030'; // Backend (legacy)
```

**Week 4**: Gradual rollout (10% → 50% → 100%)

```typescript
// Feature flag service
const useNewPublisher =
  Math.random() < ROLLOUT_PERCENTAGE ||
  localStorage.getItem('force_new_publisher') === 'true';
```

**Week 5**: Remove proxy layer (full cutover)

- Delete backend proxy controllers
- Remove feature flag (hardcode new API)
- Monitor error rates (rollback if >5%)

---

## Rollback Procedure

### Trigger Conditions

Rollback if ANY of:

- Production error rate >5% (sustained 10 min)
- Queue processing stopped >30 min
- Critical bug affecting data integrity
- Performance degradation >2× baseline

### Rollback Steps (30 min total)

**1. Pause Deployments** (1 min)

```bash
# Disable GitHub Actions workflow
gh workflow disable deploy-content-publisher.yml
```

**2. Restore Backend Code** (5 min)

```bash
# On Oracle server
cd /opt/onchain-bot
git checkout <prev-backend-commit>  # Tag: pre-publisher-migration
docker compose -f apps/backend/docker-compose.prod.yml up -d --build backend
```

**3. Restore Database** (10 min)

```bash
# From backup taken in Phase 6
pg_restore \
  -h localhost \
  -U postgres \
  -d alpha_meta_token_scanner_prod \
  --clean \
  < backups/pre-migration-$(date +%Y%m%d).sql

# Verify table restoration
psql -h localhost -U postgres alpha_meta_token_scanner_prod -c "
  SELECT COUNT(*) FROM crypto_news_publisher_queue;
  SELECT COUNT(*) FROM keywords;
  SELECT COUNT(*) FROM llm_configs;
"
```

**4. Verify Health** (5 min)

```bash
# Health check
curl -f http://localhost:3030/api/health || exit 1

# Smoke test (manual)
# - POST /crypto-news-publisher/queue → 201
# - GET /queue/status → 200
# - Verify frontend loads without errors
```

**5. Frontend Rollback** (5 min)

```bash
# Revert API base URL (emergency hotfix)
cd apps/frontend
git checkout <prev-frontend-commit>  # Reverts VITE_API_BASE_URL
docker compose -f docker-compose.prod.yml up -d --build frontend
```

**6. Monitor** (ongoing)

```bash
# Watch error logs
docker compose -f docker-compose.prod.yml logs -f backend | grep ERROR

# Watch metrics (Grafana dashboard)
# - Request rate: should stabilize at baseline
# - Error rate: should drop <1%
# - Queue depth: should resume draining
```

**7. Post-Mortem** (next day)

- Document failure root cause
- Update rollback procedure (if gaps found)
- Plan fix + re-migration timeline

### Data Loss Risk

**Acceptable losses** (ephemeral data):

- Mensajes enqueued en content-publisher DURING rollback window (~30 min)
- LLM generations in-progress (regenerate on retry)

**Unacceptable losses** (must prevent):

- Published messages history (backed up)
- Keywords/filters config (backed up)
- Ads library media (rsync backup)

### Rollback Testing (Required in Staging)

**Before production migration**:

1. Deploy content-publisher to staging
2. Run for 48h with synthetic traffic
3. Execute rollback procedure (rehearsal)
4. Verify data integrity post-rollback
5. Document actual rollback time (should be <30 min)

---

## Decisiones Pendientes

### 1. Uploads Location ⚠️

**Pregunta**: ¿Dónde viven los archivos de ads media?

**Opciones**:

- **A**: `apps/content-publisher/crypto-news/scheduling/uploads/`
- **B**: `apps/content-publisher/uploads/ads-library/` (raíz app)

**Recomendación**: Opción B (más limpio, sigue convención monorepo).

---

### 2. Port Allocation ⚠️

**Pregunta**: ¿Qué puertos usar en producción?

**Propuesto**:

- Prod: 3042
- Staging: 3041

**Validación Pre-Deployment** (CRÍTICO — ejecutar en Oracle server):

```bash
# Verificar puertos libres
netstat -tuln | grep ':304[0-2]'

# Expected output (sin colisiones):
# tcp 0.0.0.0:3030 LISTEN  # Backend prod
# tcp 0.0.0.0:3031 LISTEN  # Backend staging
# tcp 0.0.0.0:3032 LISTEN  # Ingestion prod
# tcp 0.0.0.0:3033 LISTEN  # Ingestion staging
# (3040, 3041, 3042 deben estar LIBRES)

# Si 3041 o 3042 ocupados, usar alternativas:
# - Content-Publisher prod: 3050
# - Content-Publisher staging: 3051
```

**Rationale**: Staging backend (3031) + staging content-publisher (3041) NO colisionan (diferentes puertos).

---

### 3. Database Name ⚠️

**Pregunta**: ¿Nombre de la nueva DB?

**Opciones**:

- `content_publisher_{dev|staging|prod}`
- `crypto_news_publisher_{dev|staging|prod}`
- `alpha_meta_token_scanner_publisher_{dev|staging|prod}`

**Recomendación**: `content_publisher_*` (más corto, más genérico).

---

### 4. LLM Gateway vs Direct OpenAI ⚠️

**Pregunta**: ¿Usar gateway centralizado o llamar OpenAI direct?

**Opciones**:

- **A**: Gateway (LiteLLM, configurado en backend actual)
- **B**: Direct OpenAI SDK

**Recomendación**: Gateway (multi-provider, rate limiting centralizado).

---

### 5. FK-less Filters Design ⚠️

**Pregunta**: ¿Mantener `channel_id` opaque (sin FK)?

**Rationale actual**: `crypto_news_sources` vive en ingestion-telegram DB (cross-DB FK imposible).

**Recomendación**: Mantener FK-less (el problema de ownership persiste).

---

### 6. Semantic Dedup Storage ⚠️

**Pregunta**: ¿Cómo almacenar embeddings vectors?

**Opciones**:

- **A**: `pgvector` extension (Postgres native)
- **B**: Separate `vector_embeddings` table (JSONB array)
- **C**: External vector DB (Pinecone, Weaviate)

**Recomendación**: Opción A (pgvector — native, performant, no extra infra).

---

### 7. SSE Listener Location ⚠️

**Pregunta**: ¿SSE listener vive en `ingestion/` o `shared/`?

**Rationale**:

- `ingestion/` — Es parte de la conexión con ingestion-telegram
- `shared/` — Podría ser reutilizable (si hay otros SSE sources en futuro)

**Recomendación**: `ingestion/` (YAGNI — no anticipar otros SSE sources).

---

### 8. Threads Implementation Priority ⚠️

**Pregunta**: ¿Implementar threads en v1 o diferir a v2?

**Opciones**:

- **A**: Full implementation en v1 (9 semanas → 11 semanas)
- **B**: Skeleton en v1 (module + entities, sin lógica) + full en v2
- **C**: Diferir completamente a v2 (v1 solo crypto-news)

**Recomendación**: Opción C (v1 crypto-news only, v2 threads).

**Rationale**:

- ✅ Reduce scope v1 (risk mitigation)
- ✅ Valida arquitectura multi-content con crypto-news primero
- ✅ Threads requirements aún no están completamente definidos
- ⚠️ Si threads es prioridad alta, considerar Opción B (skeleton en v1)

---

## Riesgos & Mitigaciones

### Riesgo 1: Data Loss Durante Migración

**Probabilidad**: Media  
**Impacto**: Alto

**Mitigación**:

- ✅ Backup completo de backend DB antes de migration
- ✅ Dry-run en staging primero
- ✅ Rollback plan documentado (restore backup + redeploy old version)
- ✅ Keep backend code durante 2 semanas post-migration (parallel run)

---

### Riesgo 2: Port Collisions en Oracle

**Probabilidad**: Baja  
**Impacto**: Alto (service down)

**Mitigación**:

- ✅ Verificar puertos libres antes de deploy (`netstat -tuln | grep 304[0-9]`)
- ✅ Document port allocation en README
- ✅ Systemd service config con ports explícitos

---

### Riesgo 3: Dependency Hell (Shared TypeORM Version)

**Probabilidad**: Media  
**Impacto**: Medio

**Mitigación**:

- ✅ Lock TypeORM version en root `package.json` (centralizado)
- ✅ CI check para version skew (`npm ls typeorm`)
- ✅ Migrations separadas por app (no shared migration runner)

---

### Riesgo 4: Frontend API Client Breaking Changes

**Probabilidad**: Alta  
**Impacto**: Alto

**Mitigación**:

- ✅ Version API endpoints (`/v1/queue`, `/v1/llm`, etc.)
- ✅ Maintain backward compat proxy en backend (302 redirect) durante 1 mes
- ✅ Frontend feature flag: `USE_NEW_PUBLISHER_API` (gradual rollout)

---

### Riesgo 6: Multi-Content Queue Routing Bugs

**Probabilidad**: Media  
**Impacto**: Medio

**Scenario**: `contentType` discriminator mal configurado → wrong bot publishes content.

**Ejemplo**: Thread encolado como `'crypto-news'` → publishes to crypto-news channel (wrong audience).

**Mitigación**:

- ✅ Strong typing: `ContentType` enum (not string literals)
- ✅ Database constraint: `CHECK (content_type IN ('crypto-news', 'thread'))`
- ✅ E2E test: enqueue both types, verify correct bot publishes
- ✅ Monitoring: alert on `contentType` mismatch (bot vs queue entry)

---

### Riesgo 5: Performance Degradation (Network Hop)

**Probabilidad**: Baja  
**Impacto**: Medio

**Scenario**: Backend → Content-Publisher HTTP calls add latency.

**Mitigación**:

- ✅ Co-locate en mismo host (Oracle server)
- ✅ Use `127.0.0.1` loopback (no external network)
- ✅ Connection pooling + keep-alive
- ✅ Monitor P95 latency (alert if >500ms)

---

## Beneficios Esperados

### 1. Escalabilidad Horizontal

**Antes**: Backend monolith (single replica).

**Después**: Content-Publisher puede escalar independiente.

```bash
# 3 replicas del publisher (load balanced)
docker compose up --scale content-publisher=3
```

**Impacto**: 3× throughput en queue processing.

---

### 2. Developer Experience

**Antes**: Navegar 3 BCs mezclados con 19 otros modules.

**Después**: Todo crypto-news en un solo directorio.

**Métricas**:

- ✅ Time to find code: 60s → 10s (6× faster)
- ✅ Test suite runtime: 5min → 2min (isolated)
- ✅ Onboarding time: 2 días → 4 horas

---

### 3. Deployment Independence

**Antes**: Publisher changes requieren full backend deploy (30+ modules).

**Después**: Deploy solo content-publisher (8 modules).

**Impacto**: Deployment risk ↓ 75% (less surface area).

---

### 4. Database Optimization

**Antes**: Crypto-news tables mezcladas con 39 backend entities.

**Después**: DB dedicada con 16 tables (v1) focused en publishing.

**Impacto**:

- ✅ Query planning más eficiente (menos tables en statistics)
- ✅ Backup/restore más rápido (smaller DB)
- ✅ Schema evolution sin afectar backend

---

### 5. Testing Isolation

**Antes**: E2E tests requieren boot backend completo (22 modules).

**Después**: E2E tests solo boot publisher (10 modules v1, 11 en v2).

**Impacto**: Test suite boot time: 30s → 8s (3.75× faster).

---

## Conclusión

Este refactor propone una **reestructuración ambiciosa** del sistema content publisher, moviéndolo a una app dedicada con **11 módulos claramente separados** (10 activos en v1 + threads en v2 + shared transversal).

### Trade-offs

**Pros**:

- ✅ Desacoplamiento total del backend
- ✅ Multi-content support (crypto-news + threads + futuro)
- ✅ Escalabilidad horizontal
- ✅ Developer experience mejorado (estructura flat más navegable)
- ✅ Testing isolation
- ✅ Deployment independence
- ✅ Centralized Bot API (2 bots, 1 módulo)

**Cons**:

- ❌ Esfuerzo alto (9 semanas v1 crypto-news, +2 semanas v2 threads)
- ❌ Riesgo de data loss durante migración
- ❌ Network hop latency (mitigable con localhost)
- ❌ Duplicate infra (postgres, redis por app)
- ❌ Multi-content complexity (contentType routing)

### Recomendación Final

**Go/No-Go**: ✅ **GO** (beneficios superan costos).

**Condiciones**:

1. **Staging first** — Validar en staging 2 semanas antes de prod
2. **Parallel run** — Mantener backend code 2 semanas post-migration (rollback safety)
3. **Monitoring** — Setup dashboards ANTES de migration (latency, error rates)
4. **Rollback plan** — Documentar + ensayar en staging

---

## Navegación

- [← 10. Content Filters](./10-content-filters.md)
- [→ Inicio](./01-overview.md)

---

**Última Actualización**: 2026-09-23  
**Versión**: 1.0.0  
**Owner**: Architecture Team  
**Status**: ⚠️ PROPUESTA (pending approval)

---

## § ROADMAP (v3+): Multi-Bot Publishing Profiles

> **Status**: Future enhancement (post v2 threads)  
> **Complexity**: Medium (4 semanas / 1 sprint)  
> **Value**: High (multi-tenant, A/B testing, white-label support)  
> **Priority**: Consider after v2 threads validated in production

### **Feature Overview**

Permitir configurar múltiples **"perfiles de publicación"** desde el frontend, donde cada perfil encapsula:

| Componente          | Descripción                                  | Ejemplo                                     |
| ------------------- | -------------------------------------------- | ------------------------------------------- |
| **Bot Telegram**    | Token + ChatId único                         | @CryptoNewsEspañolBot                       |
| **Keywords Config** | Keywords específicos del perfil              | ["bitcoin", "ethereum", "criptomoneda"]     |
| **Queue Settings**  | Intervalos, maxPerHour, prioridad            | `{intervalSeconds: 60, maxPerHour: 30}`     |
| **LLM Template**    | Plantilla específica (tono, idioma, formato) | `crypto-news-spanish-casual`                |
| **Filters**         | Regex transforms específicos del perfil      | [remove-english-slang, localize-prices-eur] |
| **Ads Config**      | Rotación de ads específica (opcional)        | client-alpha-ads-library                    |
| **Dedup Strategy**  | Per-profile o global                         | `'per-profile' \| 'global'`                 |

### **Use Cases**

#### **UC1: Multi-Language Publishing**

```yaml
Profile: crypto-news-es
  Name: "Crypto News Español"
  Bot: @CryptoNewsEspañolBot (token: BOT_TOKEN_ES, chatId: -1001234567890)
  Keywords: ["bitcoin", "ethereum", "criptomoneda", "blockchain"]
  Template: crypto-news-spanish-casual (tono informal, emojis)
  Filters: [remove-english-slang, localize-prices-to-eur]
  MaxPerHour: 25

Profile: crypto-news-en
  Name: "Crypto News English"
  Bot: @CryptoNewsEnglishBot (token: BOT_TOKEN_EN, chatId: -1009876543210)
  Keywords: ["bitcoin", "ethereum", "crypto", "blockchain"]
  Template: crypto-news-english-formal (tono profesional, sin emojis)
  Filters: []
  MaxPerHour: 30
```

**Resultado**: Un mismo mensaje de ingestion-telegram puede publicarse en AMBOS canales (ES + EN) si matchea keywords de ambos perfiles.

---

#### **UC2: Niche Content Streams**

```yaml
Profile: solana-ecosystem
  Name: "Solana Ecosystem Deep Dive"
  Bot: @SolanaEcosystemBot
  Keywords: ["solana", "SOL", "jupiter", "raydium", "phantom"]
  Template: solana-ecosystem-deep-dive (análisis técnico, métricas on-chain)
  MaxPerHour: 10 (menos agresivo, contenido curado)
  Priority: 2 (alta prioridad en queue)

Profile: memecoins-pump
  Name: "Memecoin Signals"
  Bot: @MemecoinSignalsBot
  Keywords: ["pump", "moon", "100x", "memecoin", "doge", "shib"]
  Template: memecoin-hype (tono FOMO, CTA urgente)
  MaxPerHour: 30 (más agresivo, volumen alto)
  Priority: 1 (baja prioridad)
```

**Resultado**: Contenido se segmenta automáticamente por nicho, cada bot tiene su audiencia específica.

---

#### **UC3: White-Label Publishing (B2B Model)**

```yaml
Profile: client-alpha-ventures
  Name: "Alpha Ventures Signal Bot" (cliente B2B)
  Bot: @AlphaVenturesBot (token del CLIENTE, no nuestro)
  Keywords: [custom-list-from-client] (ej: ["DeFi", "yield farming", "Uniswap"])
  Template: client-alpha-template (branding del cliente, logo, colores)
  Ads: client-alpha-ads-library (ads del cliente, no nuestras)
  MaxPerHour: 20 (SLA contractual)
  Billing: track-usage-for-invoice (métrica: msgs publicados * $0.05)
  DedupStrategy: 'per-profile' (no compartir dedup con otros clientes)
```

**Resultado**: Cliente paga por acceso a nuestro pipeline, pero publica en SU bot con SU branding.

---

### **Architecture Changes (v3)**

#### **1. New Domain Aggregate: `PublishingProfile`**

```typescript
// apps/content-publisher/src/shared/domain/aggregates/publishing-profile.aggregate.ts

export class PublishingProfile extends AggregateRoot<ProfileId> {
  constructor(
    id: ProfileId,
    private props: {
      name: string; // "crypto-news-es", "solana-ecosystem"
      active: boolean;
      botConfig: BotConfig; // token + chatId (encrypted at rest)
      keywordsConfigId: KeywordsConfigId; // FK to keywords_config
      queueSettings: QueueSettings; // intervalSeconds, maxPerHour, priority
      llmTemplateId: TemplateId; // FK to llm_templates
      filterIds: ContentFilterId[]; // FK to content_filters (ordered)
      adConfigId?: AdConfigId; // FK to ad_configs (optional)
      dedupStrategy: DedupStrategy; // 'per-profile' | 'global'
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    super(id);
  }

  // Business logic
  canPublishNow(publishedCountLastHour: number): boolean {
    return publishedCountLastHour < this.props.queueSettings.maxPerHour;
  }

  updateSettings(settings: Partial<QueueSettings>): void {
    this.props.queueSettings = { ...this.props.queueSettings, ...settings };
    this.props.updatedAt = new Date();
    this.addDomainEvent(new ProfileSettingsUpdated(this.id, settings));
  }

  deactivate(): void {
    this.props.active = false;
    this.addDomainEvent(new ProfileDeactivated(this.id));
  }
}

// Value Objects
export class BotConfig {
  constructor(
    public readonly token: string, // encrypted at rest
    public readonly chatId: string,
    public readonly rateLimitPerSecond: number = 30,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.token || this.token.length < 10) {
      throw new InvalidBotTokenException();
    }
    if (!this.chatId.startsWith('-')) {
      throw new InvalidChatIdException(
        'Chat ID must start with "-" (group/channel)',
      );
    }
  }
}

export class QueueSettings {
  constructor(
    public readonly intervalSeconds: number = 60,
    public readonly maxPerHour: number = 30,
    public readonly priority: number = 1, // 1=low, 2=medium, 3=high
  ) {
    if (maxPerHour < 1 || maxPerHour > 60) {
      throw new InvalidQueueSettingsException('maxPerHour must be 1-60');
    }
  }
}

export type DedupStrategy = 'per-profile' | 'global';
```

---

#### **2. Database Schema Changes (v3 Migration)**

**Nueva tabla: `publishing_profiles`**

```sql
CREATE TABLE publishing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN DEFAULT true,

  -- Bot Config (encrypted at rest via pgcrypto)
  bot_token_encrypted BYTEA NOT NULL, -- encrypt(bot_token, encryption_key, 'aes')
  bot_chat_id VARCHAR(50) NOT NULL,
  bot_rate_limit_per_second INT DEFAULT 30,

  -- Foreign Keys
  keywords_config_id UUID REFERENCES keywords_config(id) ON DELETE SET NULL,
  llm_template_id UUID REFERENCES llm_templates(id) ON DELETE SET NULL,
  ad_config_id UUID REFERENCES ad_configs(id) ON DELETE SET NULL,

  -- Queue Settings (denormalized for performance)
  interval_seconds INT DEFAULT 60,
  max_per_hour INT DEFAULT 30,
  priority INT DEFAULT 1 CHECK (priority BETWEEN 1 AND 3),

  -- Dedup Strategy
  dedup_strategy VARCHAR(20) DEFAULT 'global' CHECK (dedup_strategy IN ('per-profile', 'global')),

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Indexes
  INDEX idx_publishing_profiles_active (active),
  INDEX idx_publishing_profiles_name (name)
);

COMMENT ON TABLE publishing_profiles IS 'v3: Multi-bot publishing profiles (language, niche, white-label)';
COMMENT ON COLUMN publishing_profiles.bot_token_encrypted IS 'Telegram Bot API token (encrypted at rest)';
```

**Join table: `publishing_profile_filters` (many-to-many)**

```sql
CREATE TABLE publishing_profile_filters (
  profile_id UUID REFERENCES publishing_profiles(id) ON DELETE CASCADE,
  filter_id UUID REFERENCES content_filters(id) ON DELETE CASCADE,
  filter_order INT NOT NULL, -- orden de aplicación (1, 2, 3...)

  PRIMARY KEY (profile_id, filter_id),
  UNIQUE (profile_id, filter_order)
);

CREATE INDEX idx_profile_filters_profile ON publishing_profile_filters(profile_id, filter_order);
```

**Modificar tabla: `publisher_queue_entries`**

```sql
-- v3 migration: add profile_id column
ALTER TABLE publisher_queue_entries
  ADD COLUMN profile_id UUID REFERENCES publishing_profiles(id) ON DELETE SET NULL;

-- Index para queries por perfil
CREATE INDEX idx_queue_entries_profile_state ON publisher_queue_entries(profile_id, state, created_at);

-- Migration: backfill existing entries to default profile
UPDATE publisher_queue_entries
SET profile_id = (SELECT id FROM publishing_profiles WHERE name = 'crypto-news-default')
WHERE content_type = 'crypto-news' AND profile_id IS NULL;
```

**Modificar tabla: `published_content`**

```sql
-- v3 migration: add profile_id column
ALTER TABLE published_content
  ADD COLUMN profile_id UUID REFERENCES publishing_profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_published_content_profile_date ON published_content(profile_id, published_at DESC);

-- Migration: backfill
UPDATE published_content
SET profile_id = (SELECT id FROM publishing_profiles WHERE name = 'crypto-news-default')
WHERE profile_id IS NULL;
```

**Modificar tabla: `deduplication_fingerprints` (si dedup per-profile)**

```sql
-- v3 migration: add profile_id column (nullable para dedup global)
ALTER TABLE deduplication_fingerprints
  ADD COLUMN profile_id UUID REFERENCES publishing_profiles(id) ON DELETE CASCADE;

-- Index compuesto: fingerprint + profile (para per-profile dedup)
CREATE INDEX idx_dedup_fingerprint_profile ON deduplication_fingerprints(fingerprint, profile_id);

-- Para global dedup, profile_id = NULL (shared across all profiles)
```

---

#### **3. API Endpoints (Frontend CRUD)**

**Profile Management**:

```typescript
// ============================================
// CREATE PROFILE
// ============================================
POST /api/profiles
Headers: { Authorization: "Bearer <JWT>" }
Body: {
  name: "crypto-news-es",
  active: true,
  botConfig: {
    token: "1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ", // will be encrypted
    chatId: "-1001234567890",
    rateLimitPerSecond: 30
  },
  keywordsConfigId: "uuid-keywords-config",
  llmTemplateId: "uuid-llm-template",
  filterIds: ["uuid-filter-1", "uuid-filter-2"], // ordered
  adConfigId: "uuid-ad-config", // optional
  queueSettings: {
    intervalSeconds: 60,
    maxPerHour: 25,
    priority: 2
  },
  dedupStrategy: "global"
}
Response 201: {
  id: "uuid-profile",
  name: "crypto-news-es",
  active: true,
  // ... (no devuelve token por seguridad)
  createdAt: "2026-09-23T12:00:00Z"
}

// ============================================
// LIST PROFILES
// ============================================
GET /api/profiles?active=true&limit=20&offset=0
Response 200: {
  data: [
    {
      id: "uuid-1",
      name: "crypto-news-es",
      active: true,
      botChatId: "-1001234567890", // token OMITIDO
      stats: {
        totalPublished: 1250,
        last24h: 42,
        queuePending: 5
      }
    },
    {
      id: "uuid-2",
      name: "solana-ecosystem",
      active: false,
      botChatId: "-1009876543210",
      stats: {
        totalPublished: 680,
        last24h: 0,
        queuePending: 0
      }
    }
  ],
  total: 2,
  limit: 20,
  offset: 0
}

// ============================================
// GET PROFILE (con detalles completos)
// ============================================
GET /api/profiles/:id
Response 200: {
  id: "uuid-1",
  name: "crypto-news-es",
  active: true,
  botConfig: {
    chatId: "-1001234567890",
    rateLimitPerSecond: 30
    // token OMITIDO (nunca se devuelve en responses)
  },
  keywordsConfig: {
    id: "uuid-keywords",
    simpleKeywords: ["bitcoin", "ethereum"],
    andGroups: [...]
  },
  llmTemplate: {
    id: "uuid-template",
    name: "crypto-news-spanish-casual",
    systemPrompt: "...",
    userPrompt: "..."
  },
  filters: [
    { id: "uuid-filter-1", order: 1, pattern: "...", ... },
    { id: "uuid-filter-2", order: 2, pattern: "...", ... }
  ],
  queueSettings: { intervalSeconds: 60, maxPerHour: 25, priority: 2 },
  dedupStrategy: "global",
  stats: {
    totalPublished: 1250,
    last24h: 42,
    avgLatency: 85,
    failedLast7Days: 12
  },
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-09-20T15:30:00Z"
}

// ============================================
// UPDATE PROFILE
// ============================================
PUT /api/profiles/:id
Body: {
  active: false, // pause profile
  queueSettings: { maxPerHour: 20 } // throttle down
}
Response 200: { id: "uuid-1", ...updated }

// ============================================
// DELETE PROFILE
// ============================================
DELETE /api/profiles/:id
Response 204: No Content
// NOTE: Cascade deletes profile_filters join table entries
// Queue entries with this profile_id set to NULL (soft delete)

// ============================================
// TOGGLE PROFILE (quick on/off)
// ============================================
PATCH /api/profiles/:id/toggle
Response 200: { id: "uuid-1", active: false }

// ============================================
// TEST PROFILE BOT (validate token + chatId)
// ============================================
POST /api/profiles/:id/test-bot
Response 200: {
  success: true,
  botInfo: {
    id: 1234567890,
    username: "CryptoNewsEspañolBot",
    canSendMessages: true
  },
  chatInfo: {
    id: -1001234567890,
    title: "Crypto News ES",
    type: "channel"
  }
}
// OR
Response 400: {
  success: false,
  error: "Invalid bot token or insufficient permissions"
}
```

**Profile Stats & Analytics**:

```typescript
// ============================================
// PROFILE STATS (detailed metrics)
// ============================================
GET /api/profiles/:id/stats?period=7d
Response 200: {
  profileId: "uuid-1",
  name: "crypto-news-es",
  period: "7d",
  metrics: {
    totalPublished: 1250,
    publishedInPeriod: 298,
    failedInPeriod: 12,
    avgLatencySeconds: 85,
    p95LatencySeconds: 142,
    queuePending: 5,
    queueProcessing: 1,
    lastPublishedAt: "2026-09-23T14:30:00Z"
  },
  timeseries: [
    { date: "2026-09-17", published: 42, failed: 2 },
    { date: "2026-09-18", published: 45, failed: 1 },
    // ... 7 días
  ]
}

// ============================================
// COMPARE PROFILES (A/B testing)
// ============================================
GET /api/profiles/compare?ids=uuid-1,uuid-2&period=7d
Response 200: {
  period: "7d",
  profiles: [
    {
      id: "uuid-1",
      name: "crypto-news-es",
      totalPublished: 298,
      avgLatency: 85,
      failureRate: 4.0 // %
    },
    {
      id: "uuid-2",
      name: "crypto-news-en",
      totalPublished: 312,
      avgLatency: 78,
      failureRate: 2.5 // %
    }
  ]
}

// ============================================
// DUPLICATE PROFILE (template creation)
// ============================================
POST /api/profiles/:id/duplicate
Body: { newName: "crypto-news-pt" }
Response 201: {
  id: "uuid-new",
  name: "crypto-news-pt",
  // ... (copia completa excepto token, que queda vacío)
  botConfig: { chatId: "", rateLimitPerSecond: 30 } // USER MUST SET TOKEN
}
```

---

#### **4. Logic Changes (Matching & Publishing)**

**Matching Module** (evaluar contra TODOS los perfiles activos):

```typescript
// apps/content-publisher/src/matching/application/services/multi-profile-matcher.service.ts

@Injectable()
export class MultiProfileMatcherService {
  constructor(
    private readonly profilesRepo: PublishingProfileRepository,
    private readonly keywordsService: KeywordsService,
    private readonly filtersService: ContentFilterService,
    private readonly queueService: QueueService,
  ) {}

  async evaluateMessage(msg: RawMessage): Promise<void> {
    const activeProfiles = await this.profilesRepo.findActive();

    for (const profile of activeProfiles) {
      const matched = await this.evaluateProfile(msg, profile);

      if (matched) {
        await this.queueService.enqueue({
          profileId: profile.id,
          contentType: 'crypto-news', // o 'thread' en v2
          rawContent: msg.content,
          metadata: { channelId: msg.channelId, messageId: msg.messageId },
          priority: profile.queueSettings.priority,
        });

        this.logger.log(
          `[Profile:${profile.name}] Enqueued message ${msg.messageId}`,
        );
      }
    }
  }

  private async evaluateProfile(
    msg: RawMessage,
    profile: PublishingProfile,
  ): Promise<boolean> {
    try {
      // 1. Load profile-specific keywords
      const keywords = await this.keywordsService.getByConfigId(
        profile.keywordsConfigId,
      );

      // 2. Apply profile-specific filters (ordered)
      const filters = await this.filtersService.getByIds(profile.filterIds);
      const transformedContent = await this.filtersService.applyOrdered(
        msg.content,
        filters,
      );

      // 3. Evaluate keywords against transformed content
      const keywordMatch = this.keywordsService.evaluate(
        transformedContent,
        keywords,
      );

      return keywordMatch;
    } catch (error) {
      this.logger.error(
        `[Profile:${profile.name}] Evaluation failed: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}
```

**Publishing Scheduler** (drain por perfil, respetar rate limits):

```typescript
// apps/content-publisher/src/scheduling/application/schedulers/multi-profile-publisher.scheduler.ts

@Injectable()
export class MultiProfilePublisherScheduler {
  constructor(
    private readonly profilesRepo: PublishingProfileRepository,
    private readonly queueRepo: QueueRepository,
    private readonly publishedRepo: PublishedContentRepository,
    private readonly telegramService: TelegramMultiBotService,
    private readonly llmService: LlmService,
    private readonly dedupService: DeduplicationService,
  ) {}

  @Cron('*/1 * * * *') // Every 1 minute
  async publishNext(): Promise<void> {
    const activeProfiles = await this.profilesRepo.findActive();

    for (const profile of activeProfiles) {
      try {
        // Check rate limit per profile
        if (!(await this.canPublish(profile))) {
          this.logger.debug(
            `[Profile:${profile.name}] Rate limit reached, skipping`,
          );
          continue;
        }

        // Dequeue 1 entry for this profile
        const entry = await this.queueRepo.dequeueForProfile(profile.id);
        if (!entry) {
          this.logger.debug(`[Profile:${profile.name}] No pending entries`);
          continue;
        }

        // Mark processing
        entry.markProcessing();
        await this.queueRepo.save(entry);

        // Check dedup (per-profile or global based on profile config)
        const isDuplicate = await this.dedupService.check(
          entry.rawContent,
          profile.dedupStrategy === 'per-profile' ? profile.id : null,
        );

        if (isDuplicate) {
          entry.markFailed('Duplicate content detected');
          await this.queueRepo.save(entry);
          continue;
        }

        // Generate LLM content (using profile's template)
        const processedContent = await this.llmService.generate(
          entry.rawContent,
          profile.llmTemplateId,
        );

        entry.processedContent = processedContent;

        // Publish with profile's bot
        const result = await this.telegramService.publish(
          profile,
          processedContent,
        );

        // Mark completed
        entry.markCompleted();
        await this.queueRepo.save(entry);

        // Record published content
        await this.publishedRepo.save({
          queueEntryId: entry.id,
          profileId: profile.id,
          botUsed: profile.name,
          messageId: result.messageId,
          publishedAt: new Date(),
        });

        // Record fingerprint for dedup
        await this.dedupService.record(
          processedContent,
          profile.dedupStrategy === 'per-profile' ? profile.id : null,
        );

        this.logger.log(
          `[Profile:${profile.name}] Published message ${result.messageId}`,
        );
      } catch (error) {
        this.logger.error(
          `[Profile:${profile.name}] Publish failed: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  private async canPublish(profile: PublishingProfile): Promise<boolean> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    const count = await this.publishedRepo.countByProfileInPeriod(
      profile.id,
      oneHourAgo,
      now,
    );

    return count < profile.queueSettings.maxPerHour;
  }
}
```

**Telegram Multi-Bot Service** (manage multiple bot clients):

```typescript
// apps/content-publisher/src/telegram/application/services/telegram-multi-bot.service.ts

@Injectable()
export class TelegramMultiBotService {
  private readonly botClients = new Map<string, TelegramBotApiClient>();

  constructor(private readonly encryptionService: EncryptionService) {}

  async publish(
    profile: PublishingProfile,
    content: string,
  ): Promise<{ messageId: number }> {
    // Get or create bot client for this profile
    const botClient = await this.getBotClient(profile);

    // Send message
    const result = await botClient.sendMessage({
      chatId: profile.botConfig.chatId,
      text: content,
      parseMode: 'HTML',
    });

    return { messageId: result.message_id };
  }

  private async getBotClient(
    profile: PublishingProfile,
  ): Promise<TelegramBotApiClient> {
    // Check cache
    if (this.botClients.has(profile.id.value)) {
      return this.botClients.get(profile.id.value)!;
    }

    // Decrypt bot token
    const decryptedToken = await this.encryptionService.decrypt(
      profile.botConfig.token,
    );

    // Create new client
    const client = new TelegramBotApiClient({
      token: decryptedToken,
      rateLimitPerSecond: profile.botConfig.rateLimitPerSecond,
    });

    // Cache
    this.botClients.set(profile.id.value, client);

    return client;
  }
}
```

---

#### **5. Frontend UI (Config Panel)**

**Component Tree**:

```
<ProfilesPage>
  ├─ <ProfilesList>
  │   ├─ <ProfileCard> (cada perfil)
  │   │   ├─ Name + Status badge (Active/Paused)
  │   │   ├─ Quick stats (published today, pending queue)
  │   │   ├─ Actions dropdown (Edit, Duplicate, Toggle, Delete, Test Bot)
  │   └─ <CreateProfileButton>
  │
  └─ <ProfileEditorModal> (drawer lateral)
      ├─ <BasicInfoTab>
      │   ├─ Name input
      │   ├─ Active toggle
      ├─ <BotConfigTab>
      │   ├─ Token input (password field, never mostrado después de guardar)
      │   ├─ ChatId input (validación: debe empezar con "-")
      │   ├─ Rate limit slider (1-30 msg/s)
      │   ├─ [Test Bot] button
      ├─ <KeywordsTab>
      │   ├─ Keywords config selector (dropdown de configs existentes)
      │   ├─ Preview de keywords seleccionados
      ├─ <LlmTemplateTab>
      │   ├─ Template selector (dropdown)
      │   ├─ Preview de system + user prompts
      ├─ <FiltersTab>
      │   ├─ Multi-select de filters existentes
      │   ├─ Drag-and-drop para ordenar (order: 1, 2, 3...)
      ├─ <QueueTab>
      │   ├─ Interval slider (30-300 seconds)
      │   ├─ MaxPerHour slider (1-60)
      │   ├─ Priority radio buttons (Low/Medium/High)
      ├─ <AdsTab> (opcional)
      │   ├─ Ad config selector (dropdown)
      │   ├─ Preview de ads seleccionadas
      └─ <AdvancedTab>
          ├─ Dedup strategy radio (Per-profile / Global)
          ├─ Danger zone: Delete profile
```

**Mockup (text-based)**:

```
┌───────────────────────────────────────────────────────────┐
│ Publishing Profiles                           [+ New Profile] │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🟢 crypto-news-es                    [⚙️] [▼]       │ │
│ │ @CryptoNewsEspañolBot                                │ │
│ │ Published today: 42 | Pending: 5 | Avg latency: 85s │ │
│ │ Template: crypto-news-spanish-casual                 │ │
│ │                                                       │ │
│ │ ┌───────────────────────────────────────────┐       │ │
│ │ │ ⚙️ Actions:                                │       │ │
│ │ │ • Edit                                     │       │ │
│ │ │ • Duplicate                                │       │ │
│ │ │ • Toggle (Pause)                           │       │ │
│ │ │ • Test Bot Connection                      │       │ │
│ │ │ • View Stats (7d/30d)                      │       │ │
│ │ │ • Delete                                   │       │ │
│ │ └───────────────────────────────────────────┘       │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🔴 solana-ecosystem                  [⚙️] [▼]       │ │
│ │ @SolanaEcosystemBot                                  │ │
│ │ Published today: 0 | Pending: 2 | Paused            │ │
│ │ Template: solana-ecosystem-deep-dive                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🟢 memecoins-pump                    [⚙️] [▼]       │ │
│ │ @MemecoinSignalsBot                                  │ │
│ │ Published today: 28 | Pending: 12 | Avg latency: 62s│ │
│ │ Template: memecoin-hype                              │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Profile Editor Modal** (tabs laterales):

```
┌─────────────────────────────────────────────────────────────┐
│ Edit Profile: crypto-news-es                        [✕ Close] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Basic] [Bot] [Keywords] [Template] [Filters] [Queue] [Ads] [Advanced] │
│ ──────                                                       │
│                                                             │
│ Profile Name *                                              │
│ ┌─────────────────────────────────────────┐               │
│ │ crypto-news-es                          │               │
│ └─────────────────────────────────────────┘               │
│                                                             │
│ Status                                                      │
│ ⚪ Active   🔘 Paused                                      │
│                                                             │
│ Created: 2026-08-01 | Updated: 2026-09-20                  │
│                                                             │
│                                    [Cancel] [Save Changes]  │
└─────────────────────────────────────────────────────────────┘
```

---

### **Migration Path (v2 → v3)**

#### **Step 1: Create Default Profiles from Existing Config**

```typescript
// Migration script: 1727200000000-CreateDefaultPublishingProfiles.ts

export class CreateDefaultPublishingProfiles1727200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create table
    await queryRunner.query(`
      CREATE TABLE publishing_profiles (
        -- ... (schema from above)
      );
    `);

    // Insert default crypto-news profile
    await queryRunner.query(`
      INSERT INTO publishing_profiles (
        id,
        name,
        active,
        bot_token_encrypted,
        bot_chat_id,
        keywords_config_id,
        llm_template_id,
        interval_seconds,
        max_per_hour,
        priority,
        dedup_strategy
      ) VALUES (
        gen_random_uuid(),
        'crypto-news-default',
        true,
        pgp_sym_encrypt('${process.env.TELEGRAM_BOT_TOKEN_CRYPTO_NEWS}', '${process.env.ENCRYPTION_KEY}'),
        '${process.env.TELEGRAM_CHAT_ID_CRYPTO_NEWS}',
        (SELECT id FROM keywords_config LIMIT 1), -- existing keywords
        (SELECT id FROM llm_templates WHERE name = 'crypto-news-announcement' LIMIT 1),
        60,
        30,
        1,
        'global'
      );
    `);

    // Insert default threads profile (v2)
    await queryRunner.query(`
      INSERT INTO publishing_profiles (
        id,
        name,
        active,
        bot_token_encrypted,
        bot_chat_id,
        keywords_config_id,
        llm_template_id,
        interval_seconds,
        max_per_hour,
        priority,
        dedup_strategy
      ) VALUES (
        gen_random_uuid(),
        'threads-default',
        true,
        pgp_sym_encrypt('${process.env.TELEGRAM_BOT_TOKEN_KOL}', '${process.env.ENCRYPTION_KEY}'),
        '${process.env.TELEGRAM_CHAT_ID_KOL}',
        NULL, -- threads don't use keywords yet
        (SELECT id FROM llm_templates WHERE name = 'thread-kol-insight' LIMIT 1),
        120,
        15,
        2,
        'per-profile'
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS publishing_profile_filters;`);
    await queryRunner.query(`DROP TABLE IF EXISTS publishing_profiles;`);
  }
}
```

#### **Step 2: Backfill `publisher_queue_entries.profile_id`**

```sql
-- Assign existing crypto-news entries to default profile
UPDATE publisher_queue_entries
SET profile_id = (
  SELECT id FROM publishing_profiles WHERE name = 'crypto-news-default'
)
WHERE content_type = 'crypto-news' AND profile_id IS NULL;

-- Assign existing threads entries to default profile
UPDATE publisher_queue_entries
SET profile_id = (
  SELECT id FROM publishing_profiles WHERE name = 'threads-default'
)
WHERE content_type = 'thread' AND profile_id IS NULL;
```

#### **Step 3: Feature Flag Rollout**

```typescript
// Backend: toggle multi-profile mode
export const appConfig = registerAs('app', () => ({
  features: {
    multiProfilePublishing: process.env.FEATURE_MULTI_PROFILE === 'true', // v3 flag
  }
}));

// Scheduler: conditional logic
@Cron('*/1 * * * *')
async publishNext() {
  if (this.configService.get('app.features.multiProfilePublishing')) {
    await this.multiProfilePublisher.publishNext(); // NEW (v3)
  } else {
    await this.legacyPublisher.publishNext(); // OLD (v2)
  }
}
```

**Rollout Plan**:

1. Dev: `FEATURE_MULTI_PROFILE=true` (día 1)
2. Staging: `FEATURE_MULTI_PROFILE=true` (día 3)
3. Production: `FEATURE_MULTI_PROFILE=true` (día 7, después de validación)

---

### **Benefits Summary**

| Benefit              | Description                                    | Impact                              |
| -------------------- | ---------------------------------------------- | ----------------------------------- |
| **Multi-tenant**     | Cada cliente B2B tiene su bot + config         | Revenue: white-label model          |
| **A/B Testing**      | Comparar perfiles (formal vs casual, keywords) | Optimization: data-driven decisions |
| **Niche Targeting**  | Perfiles específicos (Solana, memecoins, DeFi) | Engagement: mejor relevancia        |
| **Multi-language**   | Perfiles por idioma (ES, EN, PT, FR)           | Growth: mercados internacionales    |
| **Rate Flexibility** | maxPerHour diferenciado por perfil             | Control: SLAs contractuales         |
| **Template Reuse**   | LLM templates compartidos entre perfiles       | Efficiency: menos duplicación       |
| **Dedup Isolation**  | Per-profile dedup evita false positives        | Quality: mejor precision            |

---

### **Complexity Estimate**

| Component                       | Effort                               | Notes                                    |
| ------------------------------- | ------------------------------------ | ---------------------------------------- |
| **Backend (aggregate + repos)** | 4 días                               | PublishingProfile aggregate, repo, ports |
| **Backend (scheduler changes)** | 3 días                               | Multi-profile publishing logic           |
| **Backend (API endpoints)**     | 3 días                               | CRUD + stats + compare                   |
| **Database (migrations)**       | 2 días                               | Schema + backfill scripts                |
| **Frontend (CRUD UI)**          | 5 días                               | Profile editor modal, list, stats        |
| **Testing (E2E + integration)** | 3 días                               | Multi-profile tests, dedup per-profile   |
| **Documentation**               | 2 días                               | API docs, migration guide                |
| **Total**                       | **~22 días (~4 semanas / 1 sprint)** | Asumiendo 1 dev full-time                |

---

### **Dependencies & Blockers**

**Requires**:

- ✅ v2 (threads) stable en producción
- ✅ Encryption at rest (bot tokens) — pgcrypto extension
- ✅ Monitoring per profile (new Grafana dashboards)
- ✅ Frontend auth (JWT) para proteger profile management endpoints

**Blockers**:

- ⚠️ Si v2 threads no está validado, posponer
- ⚠️ Si encryption key rotation no está definido, resolver primero

---

### **Priority & Timing**

**Priority**: Medium-High (post-v2)  
**Timing**: Consider para v3 roadmap después de validar v2 threads en producción (ETA: Q1 2027)

**Decision Gate**: Revisar después de 2 meses de v2 prod (threads estables, sin incidentes). Si demand

a de white-label B2B es alta, acelerar a Q4 2026.

---

### **Open Questions**

1. **Billing model**: ¿Cómo facturar clientes B2B? (per-message, flat monthly, tiered)
2. **Profile limits**: ¿Cuántos perfiles simultáneos soportar? (soft limit: 50, hard limit: 100)
3. **Bot token rotation**: ¿Cómo manejar cuando un cliente rota su token?
4. **Profile templates**: ¿Pre-crear templates (e.g., "Memecoin Profile Template")?
5. **Analytics granularity**: ¿Dashboards públicos por perfil para clientes B2B?

**Resolution**: Definir en kickoff meeting de v3 (post-v2 production validation).

---

**End of v3 Roadmap Section**
