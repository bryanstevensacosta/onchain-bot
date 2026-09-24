# Sistema Publisher de Crypto-News — Overview

**Versión:** 1.0  
**Fecha:** 2026-09-23  
**Ubicación:** `apps/backend/src/telegram/`

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura de Módulos](#arquitectura-de-módulos)
3. [Principios de Diseño](#principios-de-diseño)
4. [Stack Tecnológico](#stack-tecnológico)

---

## Visión General

El **Sistema Publisher** es una arquitectura distribuida de 3 bounded contexts que gestiona el flujo completo desde la ingesta de mensajes de Telegram hasta la publicación de contenido refinado en canales de salida.

### Propósito

- **Ingestar** mensajes de canales de Telegram (crypto-news)
- **Filtrar** contenido basado en reglas configurables
- **Enriquecer** con generación LLM opcional
- **Publicar** en canales de salida (Telegram Bot API)
- **Gestionar** anuncios intercalados automáticamente

### Componentes Principales

```
┌─────────────────────────────────────────────────────────────────┐
│                     TELEGRAM ECOSYSTEM                           │
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ crypto-news-     │  │ crypto-news-     │  │ crypto-news-  │  │
│  │ integration/     │  │ publisher/       │  │ ads/          │  │
│  │                  │  │                  │  │               │  │
│  │ • SSE Handler    │  │ • Queue          │  │ • Rotation    │  │
│  │ • HTTP Client    │  │ • LLM Adapter    │  │ • Media Lib   │  │
│  │ • Filter Service │  │ • Bot API        │  │ • Scheduler   │  │
│  │ • Matching Cron  │  │ • Schedulers     │  │               │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │                     │                     │           │
│           └─────────────────────┴─────────────────────┘           │
│                                 │                                 │
└─────────────────────────────────┼─────────────────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  ingestion-telegram        │
                    │  (Servicio Externo)        │
                    │                            │
                    │  • MTProto Session         │
                    │  • DB Propia (_ingestion)  │
                    │  • SSE Stream :3031        │
                    │  • Media Storage           │
                    └────────────────────────────┘
```

### Flujo de Alto Nivel

```
1. INGESTION
   Telegram → ingestion-telegram → RAW storage + SSE stream

2. MATCHING
   SSE event → Backend → Filter + Keywords → Enqueue si match

3. QUEUE
   PENDING entries → FIFO buffer → Cap 36 → TTL 24h

4. PUBLISHING
   Cron (1min) → Dequeue → LLM (opcional) → Bot API → PUBLISHED

5. ADS
   Rotation logic → Intercalar ads cada N posts
```

---

## Arquitectura de Módulos

### 1. `crypto-news-integration/` (Orchestrator)

**Responsabilidad**: Coordinación entre ingestion-telegram y publisher

**Archivos clave**:

- `CryptoNewsIngestionClient` — HTTP client
- `FilteredCryptoNewsService` — Orquestador fetch→filter→match
- `ProcessCryptoNewsMessageHandler` — Procesador SSE real-time
- `EnqueueMatchingCronScheduler` — Fallback polling
- `MatchingConfig` — Feature flag entity

**Dependencias**:

- `CryptoNewsIngestionModule` (filters)
- `CryptoNewsPublisherModule` (keywords, blacklist, enqueue use case)

**Exports**:

- `MatchingConfigRepository`
- `ProcessCryptoNewsMessageHandler` (para SSE routing)

---

### 2. `crypto-news-publisher/` (Core Publishing)

**Responsabilidad**: Queue management, LLM generation, Telegram publishing

**Archivos clave** (80 archivos TypeScript):

- **Use Cases**:
  - `EnqueueMatchingMessageUseCase`
  - `ProcessNextQueuedArticleUseCase`
  - `GetLlmModelsUseCase`
  - `PreviewPromptUseCase`
- **Adapters**:
  - `CryptoNewsLlmAdapter`
  - `BotApiCryptoNewsPublisherAdapter`
- **Schedulers**:
  - `PublisherCronScheduler` (every 1min)
  - `ExpireStaleQueueEntriesScheduler` (every 30min)
- **Entities**:
  - `PublisherQueueEntry`
  - `LlmConfig`
  - `PromptTemplate`
  - `Keyword`
  - `BlacklistPhrase`

**Controllers** (5):

- `QueueController` — `/crypto-news-publisher/queue`
- `KeywordsController` — `/crypto-news-publisher/keywords`
- `PhrasesController` — `/crypto-news-publisher/phrases`
- `LlmConfigController` — `/crypto-news-publisher/llm/*`
- `BlacklistController` — `/crypto-news-publisher/blacklist`

**Exports**:

- Repositories (queue, keywords, blacklist, llm-config, templates)
- `TelegramPublisherPort`
- `EnqueueMatchingMessageUseCase`
- `ProcessNextQueuedArticleUseCase`

---

### 3. `crypto-news-ads/` (Ads Management)

**Responsabilidad**: Rotación automática de anuncios entre contenido

**Archivos clave**:

- **Use Cases**:
  - `PublishAdUseCase`
  - `PublishAdNowUseCase`
  - `UploadAdImageUseCase`
  - `ReuseLibraryImageUseCase`
- **Services**:
  - `RotationDeciderService`
  - `AdFormatPublisherService`
- **Scheduler**:
  - `AdsCronScheduler` (every 1min)

**Entidades**:

- `Ad`
- `AdMedia`
- `AdMediaLibrary`
- `AdRotationConfig`
- `AdRotationState`

**Controllers** (2):

- `AdsController` — `/crypto-news-ads/ads`
- `AdsMediaController` — `/crypto-news-ads/media`
- `AdsRotationConfigController` — `/crypto-news-ads/rotation-config`

**Exports**:

- `AdRepository`
- `AdMediaRepository`
- `AdRotationConfigRepository`
- `AdRotationStateRepository`

---

### 4. Shared Components

**`telegram/shared/`**:

- `TelegramPublisherPort` — Port para adaptadores
- `SlotArbitratorPort` — Mutex entre news y ads
- `SharedThrottleSchedulerService` — Random delay 3-15min
- `SharedThrottleStateRepository` — Persist timestamps

**`shared/deduplication/`**:

- `DeduplicationService` — Cascade exact→content→semantic
- `ContentNormalizer` — Text normalization
- `DedupScorer` — Similarity scoring
- Threshold: `DEDUP_SEMANTIC_ARBITER_THRESHOLD=0.7`

**`shared/llm/`**:

- `LlmPort` — Interface común
- `LlmGatewayAdapter` — LiteLLM integration
- `MockLlmAdapter` — Dev/test mode

---

## Principios de Diseño

### 1. Opción A (Filter on-Read)

**Decisión arquitectónica**: Ingestion-telegram almacena contenido RAW, backend aplica filtros on-read.

**Rationale**:

- ✅ Ingestion-telegram es stateless respecto a reglas de negocio
- ✅ Backend staging/prod tienen SUS PROPIOS filtros
- ✅ Frontend muestra contenido RAW (display mode)
- ✅ Publisher queue recibe contenido FILTRADO

**Alternativa rechazada**: Opción B (Filter on-Write) requería sincronizar filtros entre todos los envs.

---

### 2. Dual-Path Architecture

**Path Primario (SSE)**: Latencia target <10 segundos

```
Telegram → ingestion-telegram → SSE stream → Backend handler → Queue
```

**Fallback (Polling)**: Catch gaps durante disconnections

```
Cron (5min) → HTTP GET messages → Filter → Queue
```

**Configuración**:

```bash
USE_SSE_CRYPTO_NEWS=true              # Enable SSE path
CRYPTO_NEWS_POLLING_INTERVAL_MINUTES=5  # Fallback frequency
```

**Rollback strategy**: `USE_SSE_CRYPTO_NEWS=false` → instant fallback a polling 1min.

---

### 3. 3-Flag Control System

**Flags independientes** para máxima flexibilidad:

1. **`matchingEnabled`** (MatchingConfig)
   - Controla: `EnqueueMatchingCronScheduler`
   - Scope: crypto-news-integration

2. **`llmEnabled`** (LlmConfig)
   - Controla: Modo LLM vs Raw content
   - Scope: crypto-news-publisher

3. **`publishingEnabled`** (LlmConfig)
   - Controla: `PublisherCronScheduler` master switch
   - Scope: crypto-news-publisher

**Dependency crítica**: `LLM generation = llmEnabled AND publishingEnabled`

**Use cases**:

- Pause publishing: `matching=true`, `publishing=false` → queue builds
- Raw pipeline: `matching=true`, `llm=false`, `publishing=true`
- Drain queue: `matching=false`, `publishing=true`
- Emergency stop: all flags `false`

---

### 4. Fail-Safe Design

**Error Boundaries**:

- Cada step en `ProcessNextQueuedArticleUseCase` wrapped en try/catch
- SSE handler no lanza excepciones (protege stream)
- Queue state transitions son transaccionales
- Media cleanup en `finally` (siempre ejecuta)

**Retry Logic**:

- Max attempts: `llmMaxAttempts` (default 3)
- Backoff: Implicit via cron frequency (1min)
- Failed entries: Re-queue si non-blocking, mark FAILED si blocking

**Defensive Programming**:

```typescript
// ProcessCryptoNewsMessageHandler
try {
  await this.handler.handle(message);
  logger.info(`✅ Crypto-news handler completed`);
} catch (err) {
  logger.error(`❌ Crypto-news handler failed: ${err.message}`);
  // NO throw — protege SSE stream
}
```

---

### 5. Zero-Growth Cache

**Problema**: Backend media cache crecía indefinidamente.

**Solución**: Ephemeral tmpdir staging

```typescript
// 1. Create temp dir
const tmpDir = path.join(os.tmpdir(), `backend-media-${uuid()}`);

try {
  // 2. Download images
  const localPaths = await this.downloadMedia(remotePaths, tmpDir);

  // 3. Use for LLM + Telegram
  await this.publishWithMedia(localPaths);
} finally {
  // 4. ALWAYS cleanup (success OR failure)
  await fs.rm(tmpDir, { recursive: true, force: true });
}
```

**Garantías**:

- Zero growth: tmpdir se borra siempre
- Retry re-downloads: No state persisted
- Ingestion-telegram es source of truth (72h retention)
- Frontend display: Backend proxy fallback a ingestion

---

## Stack Tecnológico

### Backend

- **Framework**: NestJS 11 (DDD/Hexagonal)
- **Language**: TypeScript 5.7
- **Database**: PostgreSQL 16 (TypeORM 0.3)
- **Cache**: Redis 7 (opcional para dedup)
- **HTTP Client**: Native `fetch` (SSE) + `axios` (REST)

### External Services

- **Ingestion**: ingestion-telegram (:3031, :3032 prod, :3033 staging)
- **LLM**: LiteLLM Gateway (OpenAI, Anthropic, etc.)
- **Telegram**: Bot API (sendMessage, sendPhoto)

### Infrastructure

- **Schedulers**: `@nestjs/schedule` (cron-based)
- **Locks**: PostgreSQL advisory locks
- **Logging**: Pino (structured JSON)
- **Validation**: class-validator + custom validators

### Dev/Test

- **Test Framework**: Jest
- **Mock Mode**: `USE_MOCK_INGESTION=true`, `USE_MOCK_AI=true`
- **CLI Tools**: `inject-message`, `record`, `replay`
- **E2E**: `test/*.e2e-spec.ts`

---

## Métricas y Observabilidad

### Latency Tracking

**SSE Handler**:

```typescript
const latency = Date.now() - message.ingestedAt.getTime();
if (latency < 10_000) {
  logger.info(`✅ Latency ${(latency / 1000).toFixed(1)}s (target <10s met)`);
} else {
  logger.warn(`⚠️ Latency ${(latency / 1000).toFixed(1)}s (target MISSED)`);
}
```

### Queue Metrics

```typescript
interface QueueStats {
  pending: number;
  scheduled: number;
  published: number;
  failed: number;
  blocked: number;
  oldestPending: Date | null;
}
```

**API**: `GET /crypto-news-publisher/queue/stats`

### Correlation IDs

**Per-entry tracking**:

- `traceId` en PublisherQueueEntry
- Logs: `[QUEUE:trace-id]`, `[PUB:trace-id]`
- Frontend: Puede filtrar por traceId

---

## Próximos Documentos

1. ✅ **01-overview.md** (este archivo)
2. 📝 **02-matching.md** — Filtering y keyword matching
3. 📝 **03-queue.md** — State machine y deduplicación
4. 📝 **04-llm.md** — Generación y prompt templates
5. 📝 **05-publishing.md** — Bot API y schedulers
6. 📝 **06-ads.md** — Rotación y media library
7. 📝 **07-content-filters.md** — Regex transforms
8. 📝 **08-apis.md** — HTTP endpoints reference
9. 📝 **09-database.md** — Schema completo
10. 📝 **10-deployment.md** — Ops y troubleshooting

---

**Navegación**: [Siguiente: 02-matching.md →](./02-matching.md)
