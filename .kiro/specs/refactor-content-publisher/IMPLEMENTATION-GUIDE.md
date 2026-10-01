# Content Publisher Refactor - Guía de Implementación Ejecutiva

> **Versión**: 1.0  
> **Fecha**: 2026-09-23  
> **Propósito**: Guía condensada para implementar el refactor de content-publisher sin leer 2172 líneas de documentación

---

## 🎯 Qué Estamos Haciendo

Extraer 3 BCs de crypto-news (integration, publisher, ads) del backend monolito → nuevo app `apps/content-publisher/` con 11 módulos, soporte multi-content (crypto-news + threads v2), dual bot adapters, y arquitectura limpia.

**Resultado Final**:

- ✅ Backend pierde 3 BCs completos (~15k LOC)
- ✅ Content-publisher es independiente (puerto 3040/3041/3042)
- ✅ Frontend migra 4 endpoints críticos
- ✅ Rollback total en 30 min si falla

---

## 📋 Orden de Implementación (8 Fases, 7 Semanas)

### **Phase 1: App Setup** (1 semana)

**Goal**: Crear esqueleto funcional de `apps/content-publisher/`

**Tareas**:

1. Crear estructura de directorios (11 módulos)
2. `package.json` + dependencias (NestJS 11, TypeORM, Bull, OpenAI, Telegram Bot API)
3. `nest-cli.json` + `tsconfig.json` (paths)
4. `src/main.ts` (bootstrap, puerto 3040 dev)
5. `src/app.module.ts` (11 imports)
6. `.env.example` (25 vars)
7. Docker Compose dev (postgres + redis)
8. Healthcheck `/api/health`

**Validación**: `curl localhost:3040/api/health` → 200 OK

**Sin código de negocio todavía** — solo infraestructura.

---

### **Phase 2: Shared Module** (1 semana)

**Goal**: Implementar módulo transversal con 50+ componentes reutilizables

**Tareas**:

1. **Domain** (17 componentes):
   - VOs: `ContentType.vo.ts`, `PublishState.vo.ts`, `TemplateId.vo.ts`, `Fingerprint.vo.ts`, `MediaUrl.vo.ts`, `PublishedAt.vo.ts`, `ContentMetadata.vo.ts`
   - Events: `ContentPublished.event.ts`, `ContentFailed.event.ts`, `ContentEnqueued.event.ts`, `ContentDequeued.event.ts`, `ContentDuplicated.event.ts`, `TemplateApplied.event.ts`
   - Exceptions: `ContentPublisherException`, `InvalidContentTypeException`, `PublishRateLimitException`, `TemplateNotFoundException`

2. **Infrastructure** (16 componentes):
   - Persistence: `BaseTypeormRepository`, `TransactionManager`
   - HTTP: `HttpClientService`, `RateLimiterInterceptor`
   - Cache: `CacheService` (Redis wrapper)
   - Messaging: `EventBusAdapter`, `QueueAdapter`
   - Monitoring: `MetricsService`, `LoggerService`, `HealthIndicator`
   - Security: `ApiKeyGuard`, `RateLimitGuard`

3. **Application** (9 componentes):
   - Decorators: `@UseCache()`, `@Retry()`, `@RateLimit()`, `@Transaction()`, `@LogExecution()`, `@ValidateInput()`
   - Filters: `DomainErrorFilter`, `HttpExceptionFilter`, `AllExceptionsFilter`

4. **Config** (6 archivos):
   - `app.config.ts`, `database.config.ts`, `redis.config.ts`, `telegram.config.ts`, `llm.config.ts`, `queue.config.ts`

5. **Guards/Pipes** (4 componentes):
   - Guards: `AuthGuard`, `RoleGuard`
   - Pipes: `ValidationPipe`, `TransformPipe`

6. **Validators** (3 clases):
   - `ContentTypeValidator`, `UrlValidator`, `DateRangeValidator`

7. **Utils** (15+ funciones):
   - `retryWithBackoff()`, `normalizeUrl()`, `sanitizeHtml()`, `truncate()`, `hashContent()`, `parseTemplate()`, `formatTimestamp()`, `chunkArray()`, `deepClone()`, `isValidJson()`, `extractUrls()`, `slugify()`, `debounce()`, `throttle()`, `uuid()`

**Validación**: Tests unitarios para cada componente (>80% coverage)

**Dependencias de otros módulos**: TODOS los módulos posteriores dependen de Shared

---

### **Phase 3: Queue + Database** (1 semana)

**Goal**: Implementar cola unificada con discriminador `contentType` y schema de 16 tablas

**Tareas**:

#### 3.1 Queue Module (4 días)

1. **Domain**:
   - `PublisherQueueEntry` aggregate (`id`, `contentType`, `state`, `rawContent`, `processedContent`, `metadata`, `priority`, `attempts`, `createdAt`, `processedAt`)
   - States: `pending`, `processing`, `completed`, `failed`, `cancelled`
   - Events: `EntryEnqueued`, `EntryDequeued`, `EntryCompleted`, `EntryFailed`

2. **Application**:
   - `EnqueueContentUseCase` (crypto-news | thread)
   - `DequeueContentUseCase` (fetch by priority + contentType)
   - `CompleteEntryUseCase` (mark completed + metadata)
   - `FailEntryUseCase` (mark failed + error)
   - `GetQueueStatsUseCase` (count by state + contentType)

3. **Infrastructure**:
   - `QueueRepository` (TypeORM)
   - `publisher.entry.entity.ts` (tabla `publisher_queue_entries`)
   - Bull queue wrapper (opcional: background processor)

4. **API**:
   - `POST /api/queue/enqueue` (body: `{contentType, rawContent, priority}`)
   - `GET /api/queue/stats` (response: `{crypto-news: {pending: 5}, thread: {pending: 2}}`)
   - `DELETE /api/queue/:id` (cancel entry)

#### 3.2 Database Schema (3 días)

Crear 16 tablas vía TypeORM migrations:

| Módulo        | Tablas                                                                                              | Total  |
| ------------- | --------------------------------------------------------------------------------------------------- | ------ |
| Matching      | `matching_config`                                                                                   | 1      |
| Keywords      | `keywords_config`, `keyword_groups`, `keyword_group_keywords`, `keyword_stats`                      | 4      |
| Filters       | `content_filters`                                                                                   | 1      |
| Queue         | `publisher_queue_entries`                                                                           | 1      |
| Deduplication | `deduplication_fingerprints`                                                                        | 1      |
| LLM           | `llm_config`, `llm_templates`                                                                       | 2      |
| Scheduling    | `scheduling_config`, `ad_configs`, `ad_media`, `ad_rotations`, `published_content`, `publish_stats` | 6      |
| **Total v1**  | —                                                                                                   | **16** |

**Script de migration**:

```bash
cd apps/content-publisher
npm run migration:generate -- -n BaselineContentPublisherSchema
npm run migration:run
```

**Validación**:

- `docker exec -it content-publisher-postgres psql -U postgres -d content_publisher_dev -c "\dt"`
- Debe mostrar 16 tablas

---

### **Phase 4: Ingestion Module** (3 días)

**Goal**: Consumir SSE de `ingestion-telegram` y enqueue mensajes

**Tareas**:

1. **Infrastructure**:
   - `CryptoNewsIngestionClient` (migrado desde backend, HTTP + SSE)
   - Endpoints: `GET /api/feed/sources`, `GET /api/feed/messages`
   - SSE: `GET /api/ingestion/stream` (metadata-only events)

2. **Application**:
   - `IngestionSseListenerUseCase` (subscribe to SSE, parse events, enqueue)
   - Backoff: 1s → 30s (exponential)
   - Lossy by design (no replay)

3. **API** (read-only, para debug):
   - `GET /api/ingestion/sources` (proxy to ingestion-telegram)
   - `GET /api/ingestion/stream-status` (connected | reconnecting | error)

**Validación**:

- Logs muestran `[IngestionSseListener] Connected to ingestion-telegram:3031`
- Queue recibe entradas con `contentType: 'crypto-news'`

---

### **Phase 5: Matching + Keywords + Filters** (1 semana)

**Goal**: Filtrar contenido RAW antes de enqueue

**Tareas**:

#### 5.1 Matching Module (2 días)

1. **Application**:
   - `FilteredContentService` (orquestador: filters → keywords → blacklist)
   - `EvaluateContentUseCase` (returns `{matched: boolean, reason?: string}`)

2. **API**:
   - `POST /api/matching/evaluate` (test endpoint)
   - `GET /api/matching/config` (on/off flag)
   - `PATCH /api/matching/config` (toggle)

#### 5.2 Keywords Module (2 días)

1. **Domain**:
   - `KeywordGroup` aggregate (`id`, `name`, `keywords[]`, `operator: 'OR' | 'AND'`)
   - Simple keywords: ["pump", "moon"] (OR)
   - AND-groups: {group1: ["bitcoin", "ETF"]} (requires both)

2. **Application**:
   - `EvaluateKeywordsUseCase` (case-insensitive, whole-word match)
   - `ManageKeywordGroupsUseCase` (CRUD)

3. **API**:
   - `GET /api/keywords/groups` (list all)
   - `POST /api/keywords/groups` (create)
   - `PUT /api/keywords/groups/:id` (update)
   - `DELETE /api/keywords/groups/:id` (delete)

#### 5.3 Filters Module (3 días)

1. **Domain**:
   - `ContentFilter` aggregate (`id`, `channelId`, `patterns[]`, `order`)
   - Regex transformations per-channel (ReDoS protected)

2. **Application**:
   - `ApplyFiltersUseCase` (apply ordered transforms to title + content)
   - ReDoS protection: timeout 100ms per regex

3. **API**:
   - `GET /api/filters?channelId=123` (list filters)
   - `POST /api/filters` (create)
   - `PUT /api/filters/:id` (update)
   - `DELETE /api/filters/:id` (delete)

**Validación**:

- Test: mensaje con "bitcoin ETF" → matched (AND-group)
- Test: mensaje con "scam" (blacklist) → rejected

---

### **Phase 6: LLM Module** (3 días)

**Goal**: Generar contenido procesado con templates

**Tareas**:

1. **Domain**:
   - `LlmTemplate` aggregate (`id`, `contentType`, `systemPrompt`, `userPrompt`, `schema`)
   - Templates per contentType: `crypto-news-announcement`, `crypto-news-analysis`, `thread-kol-insight`

2. **Application**:
   - `GenerateContentUseCase` (rawContent + templateId → processedContent)
   - Gateway pattern: `LlmGatewayPort` (interface)
   - `OpenAILlmAdapter` (implementación vía gateway, NOT direct)

3. **Infrastructure**:
   - HTTP client to LLM gateway (POST `/v1/chat/completions`)
   - Retry: 3 attempts with 2s backoff
   - Timeout: 30s

4. **API**:
   - `POST /api/llm/generate` (test endpoint)
   - `GET /api/llm/templates` (list all)
   - `POST /api/llm/templates` (create)
   - `GET /api/llm/config` (enabled flag)
   - `PATCH /api/llm/config` (toggle)

**Validación**:

- Test: raw="Solana breaks $200" → processed="🚀 Solana rompe $200: análisis del rally..."
- `llmEnabled=false` → skip generation, use raw content

---

### **Phase 7: Deduplication + Scheduling** (1 semana)

**Goal**: Evitar duplicados y publicar con ads

**Tareas**:

#### 7.1 Deduplication Module (3 días)

1. **Domain**:
   - `DeduplicationFingerprint` aggregate (`id`, `fingerprint`, `contentType`, `publishedAt`, `expiresAt`)
   - Cascade: exact match → fuzzy (90% similarity) → semantic (embeddings 0.95 threshold)

2. **Application**:
   - `CheckDuplicateUseCase` (returns `{isDuplicate: boolean, matchType?: string}`)
   - `RecordFingerprintUseCase` (store after publish)
   - Retention: 72h (janitor cron)

3. **Infrastructure**:
   - `FingerprintRepository` (TypeORM)
   - `SemanticSimilarityService` (pgvector, embeddings via LLM gateway)

4. **API**:
   - `POST /api/dedup/check` (test endpoint)
   - `GET /api/dedup/stats` (count by matchType)

#### 7.2 Scheduling Module (4 días)

1. **Domain**:
   - `PublishSchedule` aggregate (`id`, `contentType`, `intervalSeconds`, `maxPerHour`)
   - `AdConfig` aggregate (`id`, `active`, `rotationStrategy`, `probability`)
   - `PublishedContent` aggregate (`id`, `contentType`, `botUsed`, `messageId`, `publishedAt`)

2. **Application**:
   - `PublishContentUseCase` (dequeue → dedup → LLM → ads → telegram → finalize)
   - `RotateAdUseCase` (sequential | random | weighted)
   - `PublisherCronScheduler` (every 1 min, drain queue, respect rate limits)

3. **Infrastructure**:
   - `PublishedContentRepository`
   - `AdConfigRepository`
   - `TelegramBotApiClient` (sendMessage + sendPhoto, 2 bots: crypto-news + KOL)

4. **API**:
   - `POST /api/scheduling/publish-now/:entryId` (manual trigger)
   - `GET /api/scheduling/stats` (published count, failures, rate)
   - `GET /api/scheduling/ads` (list ads)
   - `POST /api/scheduling/ads` (upload ad)

**Validación**:

- Cron drains 1 entry → publica en Telegram → marca completed
- Ad rotates secuencialmente cada 5 mensajes

---

### **Phase 8: Telegram Module (Dual Bots)** (2 días)

**Goal**: Centralizar 2 bot adapters (crypto-news + KOL)

**Tareas**:

1. **Infrastructure**:
   - `CryptoNewsBotAdapter` (token: `TELEGRAM_BOT_TOKEN_CRYPTO_NEWS`, chatId: `TELEGRAM_CHAT_ID_CRYPTO_NEWS`)
   - `KolBotAdapter` (token: `TELEGRAM_BOT_TOKEN_KOL`, chatId: `TELEGRAM_CHAT_ID_KOL`)
   - Shared: `TelegramBotApiPort` (interface), retry logic, rate limiting (30 msg/s)

2. **Application**:
   - `SelectBotUseCase` (contentType → bot: crypto-news uses crypto-news bot, thread uses KOL bot)
   - `SendMessageUseCase` (text-only)
   - `SendPhotoUseCase` (with caption + photo)

3. **API** (opcional, debug):
   - `POST /api/telegram/test-message` (body: `{bot: 'crypto-news' | 'kol', text}`)

**Validación**:

- Test: publish crypto-news → usa crypto-news bot
- Test: publish thread → usa KOL bot

---

## 🔄 Renombres Críticos (Migración Backend → Content-Publisher)

### **Regla General**:

- `CryptoNews*` → `Content*` (cuando aplica a multi-content)
- Mantener `CryptoNews*` si es específico del dominio crypto-news

### **Tabla de Renombres**

| Backend (viejo)                               | Content-Publisher (nuevo)                        | Razón                                                     |
| --------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `FilteredCryptoNewsService`                   | `FilteredContentService`                         | Ahora soporta crypto-news + threads                       |
| `CryptoNewsIngestionClient`                   | `IngestionClient`                                | Genérico (aunque solo consume crypto-news en v1)          |
| `TelegramSseListenerAdapter`                  | `IngestionSseListenerAdapter`                    | Claridad: escucha ingestion-telegram, no Telegram directo |
| `PublisherQueueEntry` (crypto-news only)      | `PublisherQueueEntry` + `contentType` column     | Unified queue                                             |
| `CryptoNewsLlmAdapter`                        | `LlmGatewayAdapter`                              | Usa gateway (multi-provider), no solo OpenAI              |
| `EnqueueMatchingCronScheduler`                | `MatchingScheduler`                              | Más corto, responsabilidad clara                          |
| `PublisherCronScheduler`                      | `PublishingScheduler`                            | Idem                                                      |
| `CryptoNewsRetentionCleanupScheduler`         | `RetentionCleanupScheduler`                      | Genérico (aunque solo limpia crypto-news entries en v1)   |
| `DeduplicationFingerprintEntity`              | `Fingerprint` (domain) + `fingerprint.entity.ts` | DDD: domain aggregate + infra entity separados            |
| `AdMedia` (tabla `ad_media`)                  | `AdMedia` (sin cambio)                           | Ya es genérico                                            |
| `KeywordGroupKeyword` (join table)            | `KeywordGroupKeyword` (sin cambio)               | Ya es correcto                                            |
| Backend env: `CRYPTO_NEWS_MATCHING_ENABLED`   | `MATCHING_ENABLED`                               | Genérico (aplica a todos los contentTypes)                |
| Backend env: `CRYPTO_NEWS_LLM_ENABLED`        | `LLM_ENABLED`                                    | Idem                                                      |
| Backend env: `CRYPTO_NEWS_PUBLISHING_ENABLED` | `PUBLISHING_ENABLED`                             | Idem                                                      |

### **Renombres de Módulo: `ads/` → `scheduling/` + Unificación `Ad` → `ScheduledPost`** ⚠️ **CRÍTICO**

**Rationale**: Unificar todo bajo el concepto de **"ScheduledPost"** (post programado). En el backend actual, `crypto-news-ads` es un BC separado, pero en realidad es parte del flujo de scheduling. La nueva arquitectura reconoce que:

- ✅ Todos los posts programados son `ScheduledPost` (sin campo `type` — simplificado)
- ✅ Un `ScheduledPost` puede ser contenido orgánico (crypto-news) o promocional (lo que antes llamábamos "ad")
- ✅ Comparten infraestructura (Bot API, throttling, slot arbitration)
- ✅ Simplifica el modelo de dominio (un solo concepto, no dos jerarquías)

**Semántica nueva**: `scheduling` = "scheduling posts" (cualquier tipo de post programado).

| Backend (viejo)                             | Content-Publisher (nuevo)                          | Tipo       | Razón                                                      |
| ------------------------------------------- | -------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| **MÓDULO**                                  |                                                    |            |                                                            |
| `crypto-news-ads/`                          | `scheduling/` ⚠️                                   | Directory  | Renombre: ads → scheduling (responsabilidad más amplia)    |
| `CryptoNewsAdsModule`                       | `SchedulingModule` ⚠️                              | Class      | Idem                                                       |
| **ENTITIES & AGGREGATES**                   |                                                    |            |                                                            |
| `Ad`                                        | `ScheduledPost` ⚠️                                 | Entity     | Unificación: Ad = scheduled post (sin distinción de tipo)  |
| `AdMedia`                                   | `ScheduledPostMedia` ⚠️                            | Entity     | Idem (media attachments de scheduled posts)                |
| `AdMediaLibrary`                            | `MediaLibrary` ⚠️                                  | Entity     | Simplificado (biblioteca compartida de media)              |
| `AdRotationConfig`                          | `ScheduledPostRotationConfig` ⚠️                   | Entity     | Config de rotación de scheduled posts                      |
| `AdRotationState`                           | `ScheduledPostRotationState` ⚠️                    | Entity     | Estado de rotación de scheduled posts                      |
| **SERVICES & USE CASES**                    |                                                    |            |                                                            |
| `RotationDeciderService`                    | `ScheduledPostRotationDeciderService` ⚠️           | Service    | Renombre: clarifica que decide rotación de scheduled posts |
| `AdMediaLibraryService`                     | `MediaLibraryService` ⚠️                           | Service    | Simplificado (gestiona biblioteca de media)                |
| `PublishAdUseCase`                          | `PublishScheduledPostUseCase` ⚠️                   | UseCase    | Renombre: publica scheduled post                           |
| `CreateAdUseCase`                           | `CreateScheduledPostUseCase` ⚠️                    | UseCase    | Renombre: crea scheduled post                              |
| `UploadAdImageUseCase`                      | `UploadScheduledPostMediaUseCase` ⚠️               | UseCase    | Renombre: sube media para scheduled post                   |
| **SCHEDULERS**                              |                                                    |            |                                                            |
| `AdsCronScheduler`                          | `ScheduledPostsCronScheduler` ⚠️                   | Scheduler  | Renombre: publica scheduled posts (cualquier tipo)         |
| `AdsThrottleScheduler`                      | `ScheduledPostsThrottleScheduler` ⚠️               | Scheduler  | Renombre: throttle de scheduled posts                      |
| **CONTROLLERS & DTOs**                      |                                                    |            |                                                            |
| `AdsController`                             | `ScheduledPostsController` ⚠️                      | Controller | Renombre: endpoints `/api/scheduling/posts`                |
| `RotationConfigController`                  | `ScheduledPostRotationConfigController` ⚠️         | Controller | Renombre: config de rotación de scheduled posts            |
| `AdMediaController`                         | `MediaLibraryController` ⚠️                        | Controller | Simplificado (gestiona media library)                      |
| `CreateAdDto`                               | `CreateScheduledPostDto` ⚠️                        | DTO        | Renombre                                                   |
| `UpdateAdDto`                               | `UpdateScheduledPostDto` ⚠️                        | DTO        | Renombre                                                   |
| **REPOSITORIES**                            |                                                    |            |                                                            |
| `AdRepository`                              | `ScheduledPostRepository` ⚠️                       | Repository | Renombre                                                   |
| `AdMediaRepository`                         | `ScheduledPostMediaRepository` ⚠️                  | Repository | Renombre                                                   |
| `AdMediaLibraryRepository`                  | `MediaLibraryRepository` ⚠️                        | Repository | Simplificado                                               |
| `AdRotationConfigRepository`                | `ScheduledPostRotationConfigRepository` ⚠️         | Repository | Renombre                                                   |
| `AdRotationStateRepository`                 | `ScheduledPostRotationStateRepository` ⚠️          | Repository | Renombre                                                   |
| **TABLAS DB**                               |                                                    |            |                                                            |
| `crypto_news_ads`                           | `scheduled_posts` ⚠️                               | Table      | Renombre completo (unificación + sin prefijo crypto_news)  |
| `crypto_news_ad_media`                      | `scheduled_post_media` ⚠️                          | Table      | Idem                                                       |
| `crypto_news_ad_media_library`              | `media_library` ⚠️                                 | Table      | Simplificado                                               |
| `crypto_news_ad_rotation_config`            | `scheduled_post_rotation_config` ⚠️                | Table      | Renombre                                                   |
| `crypto_news_ad_rotation_state`             | `scheduled_post_rotation_state` ⚠️                 | Table      | Renombre                                                   |
| `crypto_news_ads_throttle_state`            | `scheduled_posts_throttle_state` ⚠️                | Table      | Renombre                                                   |
| **UBICACIÓN UPLOADS**                       |                                                    |            |                                                            |
| Backend: `uploads/crypto-news-ads-library/` | `apps/content-publisher/uploads/media-library/` ⚠️ | Directory  | Renombre + mover (simplificado: media-library)             |
| **RUTAS API**                               |                                                    |            |                                                            |
| `POST /crypto-news-ads/ads`                 | `POST /api/scheduling/posts` ⚠️                    | Endpoint   | Renombre completo (ads → posts)                            |
| `GET /crypto-news-ads/ads`                  | `GET /api/scheduling/posts` ⚠️                     | Endpoint   | Idem                                                       |
| `PATCH /crypto-news-ads/ads/:id`            | `PATCH /api/scheduling/posts/:id` ⚠️               | Endpoint   | Idem                                                       |
| `DELETE /crypto-news-ads/ads/:id`           | `DELETE /api/scheduling/posts/:id` ⚠️              | Endpoint   | Idem                                                       |
| `POST /crypto-news-ads/ads/:id/publish-now` | `POST /api/scheduling/posts/:id/publish-now` ⚠️    | Endpoint   | Idem                                                       |
| `POST /crypto-news-ads/ads/:adId/images`    | `POST /api/scheduling/posts/:postId/media` ⚠️      | Endpoint   | Renombre (images → media, adId → postId)                   |
| `POST /crypto-news-ads/media/library`       | `POST /api/scheduling/media-library` ⚠️            | Endpoint   | Simplificado                                               |
| `GET /crypto-news-ads/rotation/config`      | `GET /api/scheduling/rotation/config` ⚠️           | Endpoint   | Namespace change solamente                                 |

**⚠️ BREAKING CHANGES** (TODO marcado con ⚠️):

- **40+ clases renombradas** — `Ad*` → `ScheduledPost*` o simplificado
- **6 tablas renombradas** — `crypto_news_ads` → `scheduled_posts`, etc.
- **10+ endpoints cambian** — `/crypto-news-ads/ads` → `/api/scheduling/posts`
- **Uploads path cambia** — `ads-library/` → `media-library/`

**Archivos a Renombrar** (scope del refactor):

```bash
# Backend source (ANTES de migrar a content-publisher)
apps/backend/src/crypto-news-ads/               → apps/content-publisher/src/scheduling/

# Dentro del módulo, renombrar TODOS los archivos:
# ad.entity.ts                 → scheduled-post.entity.ts
# ad-media.entity.ts           → scheduled-post-media.entity.ts
# ad-media-library.entity.ts   → media-library.entity.ts
# ad-rotation-config.entity.ts → scheduled-post-rotation-config.entity.ts
# ads-cron.scheduler.ts        → scheduled-posts-cron.scheduler.ts
# ... (40+ archivos)

# Uploads físicos (mover en deploy)
apps/backend/uploads/crypto-news-ads-library/   → apps/content-publisher/uploads/media-library/
```

**Decisión de Diseño** (Unificación total):

- ✅ **Módulo = `scheduling/`** — Responsabilidad: scheduling posts (cualquier tipo)
- ✅ **Entidad unificada = `ScheduledPost`** — Sin campo `type` (todos son scheduled posts)
- ✅ **Media genérico = `MediaLibrary`** — Biblioteca compartida (no específica de ads)
- ✅ **Schedulers = `ScheduledPosts*`** — Publica scheduled posts (sin distinción)
- ✅ **Rutas API = `/scheduling/posts`** — Recurso genérico (posts programados)
- ✅ **Tablas sin prefijo legacy** — `scheduled_posts` (limpio, sin crypto*news*)

**Ejemplo de Renombre de Archivo**:

```bash
# ANTES (backend)
apps/backend/src/crypto-news-ads/
├── domain/
│   ├── entities/
│   │   ├── ad.entity.ts                        # → scheduled-post.entity.ts
│   │   ├── ad-media.entity.ts                  # → scheduled-post-media.entity.ts
│   │   └── ad-rotation-config.entity.ts        # → scheduled-post-rotation-config.entity.ts
│   └── ports/
│       └── ad-repository.port.ts               # → scheduled-post-repository.port.ts
├── application/
│   ├── use-cases/
│   │   ├── create-ad.use-case.ts               # → create-scheduled-post.use-case.ts
│   │   └── publish-ad.use-case.ts              # → publish-scheduled-post.use-case.ts
│   └── services/
│       ├── rotation-decider.service.ts         # → scheduled-post-rotation-decider.service.ts
│       └── ad-media-library.service.ts         # → media-library.service.ts
└── api/
    └── controllers/
        └── ads.controller.ts                   # → scheduled-posts.controller.ts

# DESPUÉS (content-publisher)
apps/content-publisher/src/scheduling/
├── domain/
│   ├── entities/
│   │   ├── scheduled-post.entity.ts            # ✅ RENOMBRADO
│   │   ├── scheduled-post-media.entity.ts      # ✅ RENOMBRADO
│   │   └── scheduled-post-rotation-config.entity.ts # ✅ RENOMBRADO
│   └── ports/
│       └── scheduled-post-repository.port.ts   # ✅ RENOMBRADO
├── application/
│   ├── use-cases/
│   │   ├── create-scheduled-post.use-case.ts   # ✅ RENOMBRADO
│   │   └── publish-scheduled-post.use-case.ts  # ✅ RENOMBRADO
│   └── services/
│       ├── scheduled-post-rotation-decider.service.ts # ✅ RENOMBRADO
│       └── media-library.service.ts            # ✅ SIMPLIFICADO
└── api/
    └── controllers/
        └── scheduled-posts.controller.ts       # ✅ RENOMBRADO
```

---

## 🚨 Estrategia de Deprecación (Backend → Content-Publisher)

### **Fase 1: Marcar como @deprecated (Semana 1-2)**

Agregar decoradores en TODAS las clases/métodos que serán migrados:

```typescript
/**
 * @deprecated Moved to apps/content-publisher/src/matching/
 * Use MatchingModule from content-publisher app instead.
 * This service will be removed in v2.0.0 (ETA: 2026-10-15)
 *
 * Migration guide: /docs/migrations/crypto-news-to-content-publisher.md
 *
 * @see {@link apps/content-publisher/src/matching/application/services/filtered-content.service.ts}
 */
@Injectable()
export class FilteredCryptoNewsService {
  // ...
}
```

**Aplicar a**:

- 41 archivos en `crypto-news-integration/` BC
- 28 archivos en `crypto-news-publisher/` BC
- 15 archivos en `crypto-news-ads/` BC

**Comando automatizado**:

```bash
# Script para agregar @deprecated headers
node scripts/add-deprecation-headers.js \
  --bcs "crypto-news-integration,crypto-news-publisher,crypto-news-ads" \
  --target "apps/content-publisher" \
  --version "v2.0.0" \
  --eta "2026-10-15"
```

---

### **Fase 2: Dual-Write Period (Semana 3-5)**

Durante migración, AMBOS sistemas escriben (backend + content-publisher):

```typescript
// Backend: EnqueueMatchingCronScheduler (OLD)
async enqueueMatching() {
  const messages = await this.ingestionClient.getMessages();

  // WRITE TO OLD SYSTEM (deprecated)
  for (const msg of messages) {
    if (this.shouldMatch(msg)) {
      await this.oldQueue.enqueue(msg); // ← DEPRECATED, still active
    }
  }

  // ALSO WRITE TO NEW SYSTEM (shadow mode)
  try {
    await this.contentPublisherClient.enqueue({
      contentType: 'crypto-news',
      rawContent: msg.content,
      metadata: { channelId: msg.channelId }
    });
  } catch (error) {
    // Log but don't fail (shadow mode)
    this.logger.warn('[Shadow] Content-publisher enqueue failed', error);
  }
}
```

**Validación**: Comparar outputs durante 1 semana (backend queue vs content-publisher queue)

---

### **Fase 3: Feature Flag Cutover (Semana 6)**

Agregar flag para switch gradual:

```typescript
// apps/backend/src/shared/common/config/app.config.ts
export const appConfig = registerAs('app', () => ({
  // ...
  cryptoNews: {
    useContentPublisher: process.env.USE_CONTENT_PUBLISHER === 'true', // ← NEW FLAG
  },
}));
```

Implementar switch en entry point:

```typescript
// Backend: EnqueueMatchingCronScheduler
async enqueueMatching() {
  const useNewSystem = this.configService.get<boolean>('app.cryptoNews.useContentPublisher');

  if (useNewSystem) {
    // Route to content-publisher
    await this.contentPublisherClient.enqueue({...});
  } else {
    // Old path (deprecated)
    await this.oldQueue.enqueue(msg);
  }
}
```

**Rollout**:

1. Dev: `USE_CONTENT_PUBLISHER=true` (día 1)
2. Staging: `USE_CONTENT_PUBLISHER=true` (día 3)
3. Production: `USE_CONTENT_PUBLISHER=true` (día 7, después de validación)

---

### **Fase 4: Hard Deprecation (Semana 7)**

Cambiar `@deprecated` → `@throws DeprecationError`:

```typescript
/**
 * @deprecated HARD DEPRECATION - DO NOT USE
 * This service has been removed. Use content-publisher app.
 *
 * @throws {DeprecationError} Always throws since v2.0.0
 */
@Injectable()
export class FilteredCryptoNewsService {
  constructor() {
    throw new DeprecationError(
      'FilteredCryptoNewsService is no longer available. ' +
        'Use apps/content-publisher/src/matching/FilteredContentService instead. ' +
        'See migration guide: /docs/migrations/crypto-news-to-content-publisher.md',
    );
  }
}
```

**Validación**: CI debe FALLAR si algún import activo referencia clases deprecadas hard

---

### **Fase 5: Deletion (Post-Release v2.0.0)**

Después de 2 semanas sin incidentes en prod:

```bash
# Eliminar BCs completos
rm -rf apps/backend/src/crypto-news-integration/
rm -rf apps/backend/src/crypto-news-publisher/
rm -rf apps/backend/src/crypto-news-ads/

# Actualizar AppModule
# apps/backend/src/app.module.ts
@Module({
  imports: [
    // ❌ REMOVED: CryptoNewsIntegrationModule,
    // ❌ REMOVED: CryptoNewsPublisherModule,
    // ❌ REMOVED: CryptoNewsAdsModule,
    // ... other modules
  ]
})
```

**Commit message**:

```
feat(backend)!: remove crypto-news BCs (migrated to content-publisher)

BREAKING CHANGE: The following modules have been permanently removed:
- CryptoNewsIntegrationModule
- CryptoNewsPublisherModule
- CryptoNewsAdsModule

All crypto-news functionality now lives in apps/content-publisher/.

Migration guide: /docs/migrations/crypto-news-to-content-publisher.md

Refs: #TASK-123
```

---

## 📦 Checklist de Deprecación (Por Clase)

Use esta tabla para tracking:

| Clase/Servicio                        | @deprecated Added | Dual-Write | Flag Cutover | Hard Deprecation | Deleted |
| ------------------------------------- | ----------------- | ---------- | ------------ | ---------------- | ------- |
| `FilteredCryptoNewsService`           | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `CryptoNewsIngestionClient`           | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `EnqueueMatchingCronScheduler`        | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `PublisherCronScheduler`              | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `CryptoNewsLlmAdapter`                | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `AdRotationService`                   | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `KeywordMatchingService`              | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `ContentFilterService`                | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `DeduplicationService`                | ☐                 | ☐          | ☐            | ☐                | ☐       |
| `CryptoNewsRetentionCleanupScheduler` | ☐                 | ☐          | ☐            | ☐                | ☐       |
| _(agregar resto...)_                  | ☐                 | ☐          | ☐            | ☐                | ☐       |

---

## 🧪 Testing Strategy (Por Fase)

### **Phase 1-2: Unit Tests**

- Shared module: >80% coverage
- Cada VO/Event/Exception tiene spec

### **Phase 3-4: Integration Tests**

- Queue enqueue/dequeue cycle
- Database migrations (up + down)
- Ingestion SSE connection

### **Phase 5-6: E2E Tests (Critical)**

**Test 1: Crypto-News End-to-End**

```typescript
describe('Crypto-News Publishing E2E', () => {
  it('should publish crypto-news message with correct bot', async () => {
    // 1. Enqueue crypto-news entry
    const entry = await request(app).post('/api/queue/enqueue').send({
      contentType: 'crypto-news',
      rawContent: 'Bitcoin breaks $100k',
      priority: 1,
    });

    // 2. Trigger scheduler (manual)
    await request(app)
      .post(`/api/scheduling/publish-now/${entry.body.id}`)
      .expect(200);

    // 3. Verify published to Telegram (crypto-news bot)
    const published = await publishedContentRepo.findOne({
      where: { queueEntryId: entry.body.id },
    });

    expect(published.botUsed).toBe('crypto-news');
    expect(published.messageId).toBeDefined();
  });
});
```

**Test 2: Thread End-to-End (v2)**

```typescript
it('should publish thread with KOL bot', async () => {
  const entry = await request(app).post('/api/queue/enqueue').send({
    contentType: 'thread',
    rawContent: 'KOL insight about SOL',
    priority: 2,
  });

  await request(app)
    .post(`/api/scheduling/publish-now/${entry.body.id}`)
    .expect(200);

  const published = await publishedContentRepo.findOne({
    where: { queueEntryId: entry.body.id },
  });

  expect(published.botUsed).toBe('kol'); // ← CRITICAL
});
```

**Test 3: Deduplication**

```typescript
it('should reject duplicate content', async () => {
  // Publish once
  await request(app).post('/api/queue/enqueue').send({
    contentType: 'crypto-news',
    rawContent: 'Solana breaks $200',
  });
  await scheduler.run(); // Process queue

  // Try publish duplicate
  const duplicate = await request(app).post('/api/queue/enqueue').send({
    contentType: 'crypto-news',
    rawContent: 'Solana breaks $200', // ← Exact match
  });

  await scheduler.run();

  const entry = await queueRepo.findOne(duplicate.body.id);
  expect(entry.state).toBe('failed');
  expect(entry.metadata.failureReason).toContain('duplicate');
});
```

### **Phase 7: Load Tests**

- 100 concurrent enqueues → queue capacity 36
- Rate limiting: 30 msg/s Telegram API
- Memory leak check: 1000 publishes (no OOM)

### **Phase 8: Rollback Test (Staging)**

- Ejecutar procedimiento completo (7 pasos)
- Tiempo objetivo: <30 min
- Backend debe publicar correctamente después de rollback

---

## 📊 Tracking Progress

Usar GitHub Project board con 8 columnas (1 por fase):

| Phase                            | Tasks | Status | Blocker? |
| -------------------------------- | ----- | ------ | -------- |
| 1. App Setup                     | 7     | ☐      | —        |
| 2. Shared                        | 50+   | ☐      | —        |
| 3. Queue + DB                    | 2     | ☐      | —        |
| 4. Ingestion                     | 1     | ☐      | —        |
| 5. Matching + Keywords + Filters | 3     | ☐      | —        |
| 6. LLM                           | 1     | ☐      | —        |
| 7. Dedup + Scheduling            | 2     | ☐      | —        |
| 8. Telegram                      | 1     | ☐      | —        |

**Daily Standup Questions**:

1. ¿Qué fase completaste ayer?
2. ¿Qué fase trabajas hoy?
3. ¿Hay bloqueadores? (puertos, dependencias, env vars)

---

## 🚀 Quick Start (Implementador)

```bash
# 1. Checkout nueva branch
git checkout -b feat/content-publisher-phase-1

# 2. Crear estructura
mkdir -p apps/content-publisher/src/{shared,ingestion,matching,keywords,filters,queue,deduplication,llm,scheduling,telegram,threads}

# 3. Copiar este documento al proyecto
cp IMPLEMENTATION-GUIDE.md apps/content-publisher/

# 4. Comenzar con Phase 1 (App Setup)
cd apps/content-publisher
# (seguir tareas de Phase 1 arriba)

# 5. Commit frecuente
git add . && git commit -m "feat(content-publisher): phase 1 - app setup skeleton"

# 6. Push y abrir PR por fase
git push origin feat/content-publisher-phase-1
gh pr create --title "Phase 1: Content-Publisher App Setup" --body "Implements Phase 1 of refactor guide"
```

---

## 📚 Referencias

- **Refactor completo**: `.kiro/specs/refactor-content-publisher/11-refactor.md` (2172 líneas)
- **Sistema actual**: `.kiro/specs/refactor-content-publisher/01-overview.md` hasta `10-content-filters.md`
- **Backend AGENTS.md**: `apps/backend/AGENTS.md` (gaps, anti-patterns)
- **Root AGENTS.md**: `AGENTS.md` (architecture overview)

---

## ❓ FAQ Implementador

**Q: ¿Puedo implementar fases en paralelo?**  
A: NO. Cada fase depende de la anterior (especialmente Shared → todos). Excepción: después de Phase 4, puedes paralelizar Phase 5 y Phase 6.

**Q: ¿Qué hago si un test E2E falla en Phase 7?**  
A: NO avanzar a Phase 8. Debuggear con logs de Telegram Bot API (`curl` manual al endpoint). Común: token incorrecto o chatId inválido.

**Q: ¿Cuándo deprecar clases del backend?**  
A: Después de completar Phase 8 Y validar en staging (1 semana). Nunca antes.

**Q: ¿Qué hago si el rollback falla?**  
A: Seguir procedimiento manual en `11-refactor.md` § Rollback Procedure (paso 7: force recreate). Si persiste, contactar DevOps.

**Q: ¿Dónde trackear cambios de schema (migrations)?**  
A: `apps/content-publisher/src/shared/infrastructure/database/migrations/`. Numeración: `1727100000000-*.ts` (timestamp Unix).

---

**Última actualización**: 2026-09-23  
**Autor**: Content-Publisher Refactor Team  
**Aprobado por**: [Pending stakeholder review]

---

## 🔮 Future Enhancements (v3+ Roadmap)

> **NOTA**: Estas features son POST-v2 (threads). No implementar hasta validar v2 en producción.

### **Multi-Bot Publishing Profiles**

Ver documentación completa en **`11-refactor.md` § ROADMAP (v3+)**

**Qué es**: Configurar múltiples "perfiles de publicación" desde el frontend, cada uno con:

- Bot Telegram propio (token + chatId)
- Keywords específicos
- Queue settings (interval, maxPerHour, prioridad)
- LLM template específico
- Filters específicos
- Ads config específico (opcional)
- Dedup strategy (per-profile o global)

**Use Cases**:

1. **Multi-language**: perfiles ES, EN, PT con templates localizados
2. **Niche streams**: Solana ecosystem, memecoins, DeFi, NFTs (cada uno con su bot)
3. **White-label B2B**: Clientes pagan por publicar en SU bot con SU branding

**Architecture Highlights**:

- New aggregate: `PublishingProfile`
- 2 new tables: `publishing_profiles` + `publishing_profile_filters`
- 8 API endpoints: CRUD + stats + compare + test-bot
- Frontend: Profile editor modal con 8 tabs

**Benefits**:

- ✅ Multi-tenant revenue model (white-label B2B)
- ✅ A/B testing (comparar perfiles)
- ✅ Niche targeting (mejor engagement)
- ✅ Multi-language (crecimiento internacional)

**Complexity**: ~4 semanas (1 sprint)  
**Priority**: Post-v2 (ETA: Q1 2027)  
**Decision Gate**: Validar v2 threads por 2 meses sin incidentes antes de iniciar v3

**Ver detalles técnicos completos**: `11-refactor.md` § ROADMAP (v3+) — incluye schema SQL, API specs, code samples, UI mockups.
