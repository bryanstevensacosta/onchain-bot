# Content Publisher Refactor - Phase Tracker

> **Propósito**: Checklist interactivo para tracking diario del progreso  
> **Cómo usar**: Marcar ✅ al completar cada tarea, agregar notas en columna "Notes/Blockers"  
> **Update frequency**: Diario (EOD standup)

---

## 📊 Overall Progress

```
Phase 1: [░░░░░░░░░░] 0/7   (0%)
Phase 2: [░░░░░░░░░░] 0/57  (0%)
Phase 3: [░░░░░░░░░░] 0/12  (0%)
Phase 4: [░░░░░░░░░░] 0/6   (0%)
Phase 5: [░░░░░░░░░░] 0/18  (0%)
Phase 6: [░░░░░░░░░░] 0/9   (0%)
Phase 7: [░░░░░░░░░░] 0/15  (0%)
Phase 8: [░░░░░░░░░░] 0/6   (0%)
─────────────────────────────
Total:   [░░░░░░░░░░] 0/130 (0%)
```

**Current Phase**: Phase 1 (App Setup)  
**Started**: [Date]  
**Target Completion**: [Date + 7 weeks]  
**Actual Completion**: [Pending]

---

## Phase 1: App Setup (Week 1)

**Goal**: Crear esqueleto funcional de `apps/content-publisher/`  
**Duración estimada**: 5 días  
**Responsable**: [Name]

| #    | Task                                                                                                                                     | Status | Assignee | Notes/Blockers | Completed Date |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 1.1  | Crear estructura de directorios (11 módulos)                                                                                             | ☐      | —        | —              | —              |
| 1.2  | Crear `package.json` + instalar deps (NestJS, TypeORM, Bull, etc.)                                                                       | ☐      | —        | —              | —              |
| 1.3  | Configurar `nest-cli.json` (root: `src`, watch assets)                                                                                   | ☐      | —        | —              | —              |
| 1.4  | Configurar `tsconfig.json` + paths (`shared/*`, `ingestion/*`, etc.)                                                                     | ☐      | —        | —              | —              |
| 1.5  | Crear `src/main.ts` (bootstrap, puerto 3040 dev, ValidationPipe)                                                                         | ☐      | —        | —              | —              |
| 1.6  | Crear `src/app.module.ts` (11 imports: Shared, Ingestion, Matching, Keywords, Filters, Queue, Dedup, LLM, Scheduling, Telegram, Threads) | ☐      | —        | —              | —              |
| 1.7  | Crear `.env.example` (25 vars mínimas: DB, Redis, Telegram, LLM)                                                                         | ☐      | —        | —              | —              |
| 1.8  | Crear `docker-compose.yml` dev (postgres + redis, puertos 5434/6381)                                                                     | ☐      | —        | —              | —              |
| 1.9  | Implementar `/api/health` endpoint (status: ok, uptime)                                                                                  | ☐      | —        | —              | —              |
| 1.10 | Validar healthcheck: `curl localhost:3040/api/health` → 200 OK                                                                           | ☐      | —        | —              | —              |

**Phase 1 Completion Criteria**:

- [ ] App inicia sin errores (`npm run start:dev`)
- [ ] Healthcheck responde 200 OK
- [ ] Docker compose levanta postgres + redis sin errores
- [ ] Commit: `feat(content-publisher): phase 1 - app setup skeleton`

---

## Phase 2: Shared Module (Week 2)

**Goal**: Implementar módulo transversal con 50+ componentes reutilizables  
**Duración estimada**: 5 días  
**Responsable**: [Name]

### 2.1 Domain Layer (17 componentes)

| #     | Task                                                                           | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ------------------------------------------------------------------------------ | ------ | -------- | -------------- | -------------- |
| 2.1.1 | Value Objects (7 VOs)                                                          | ☐      | —        | —              | —              |
| →     | `ContentType.vo.ts` (enum: crypto-news, thread)                                | ☐      | —        | —              | —              |
| →     | `PublishState.vo.ts` (enum: pending, processing, completed, failed, cancelled) | ☐      | —        | —              | —              |
| →     | `TemplateId.vo.ts` (UUID string)                                               | ☐      | —        | —              | —              |
| →     | `Fingerprint.vo.ts` (SHA-256 hash)                                             | ☐      | —        | —              | —              |
| →     | `MediaUrl.vo.ts` (validated URL)                                               | ☐      | —        | —              | —              |
| →     | `PublishedAt.vo.ts` (ISO timestamp)                                            | ☐      | —        | —              | —              |
| →     | `ContentMetadata.vo.ts` (generic key-value object)                             | ☐      | —        | —              | —              |
| 2.1.2 | Domain Events (6 events)                                                       | ☐      | —        | —              | —              |
| →     | `ContentPublished.event.ts`                                                    | ☐      | —        | —              | —              |
| →     | `ContentFailed.event.ts`                                                       | ☐      | —        | —              | —              |
| →     | `ContentEnqueued.event.ts`                                                     | ☐      | —        | —              | —              |
| →     | `ContentDequeued.event.ts`                                                     | ☐      | —        | —              | —              |
| →     | `ContentDuplicated.event.ts`                                                   | ☐      | —        | —              | —              |
| →     | `TemplateApplied.event.ts`                                                     | ☐      | —        | —              | —              |
| 2.1.3 | Domain Exceptions (4 exceptions)                                               | ☐      | —        | —              | —              |
| →     | `ContentPublisherException` (base)                                             | ☐      | —        | —              | —              |
| →     | `InvalidContentTypeException`                                                  | ☐      | —        | —              | —              |
| →     | `PublishRateLimitException`                                                    | ☐      | —        | —              | —              |
| →     | `TemplateNotFoundException`                                                    | ☐      | —        | —              | —              |

### 2.2 Infrastructure Layer (16 componentes)

| #     | Task                                                    | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 2.2.1 | Persistence (2 componentes)                             | ☐      | —        | —              | —              |
| →     | `BaseTypeormRepository` (generic CRUD)                  | ☐      | —        | —              | —              |
| →     | `TransactionManager` (wrapper for TypeORM transactions) | ☐      | —        | —              | —              |
| 2.2.2 | HTTP (2 componentes)                                    | ☐      | —        | —              | —              |
| →     | `HttpClientService` (axios wrapper, retry logic)        | ☐      | —        | —              | —              |
| →     | `RateLimiterInterceptor` (throttle 30 req/s)            | ☐      | —        | —              | —              |
| 2.2.3 | Cache (1 componente)                                    | ☐      | —        | —              | —              |
| →     | `CacheService` (Redis wrapper, TTL support)             | ☐      | —        | —              | —              |
| 2.2.4 | Messaging (2 componentes)                               | ☐      | —        | —              | —              |
| →     | `EventBusAdapter` (NestJS EventEmitter wrapper)         | ☐      | —        | —              | —              |
| →     | `QueueAdapter` (Bull wrapper)                           | ☐      | —        | —              | —              |
| 2.2.5 | Monitoring (3 componentes)                              | ☐      | —        | —              | —              |
| →     | `MetricsService` (Prometheus metrics)                   | ☐      | —        | —              | —              |
| →     | `LoggerService` (Winston wrapper, structured logs)      | ☐      | —        | —              | —              |
| →     | `HealthIndicator` (custom health checks)                | ☐      | —        | —              | —              |
| 2.2.6 | Security (2 componentes)                                | ☐      | —        | —              | —              |
| →     | `ApiKeyGuard` (validate X-API-Key header)               | ☐      | —        | —              | —              |
| →     | `RateLimitGuard` (IP-based rate limiting)               | ☐      | —        | —              | —              |

### 2.3 Application Layer (9 componentes)

| #     | Task                                            | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ----------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 2.3.1 | Decorators (6 decorators)                       | ☐      | —        | —              | —              |
| →     | `@UseCache(ttl)`                                | ☐      | —        | —              | —              |
| →     | `@Retry(attempts, backoff)`                     | ☐      | —        | —              | —              |
| →     | `@RateLimit(max, window)`                       | ☐      | —        | —              | —              |
| →     | `@Transaction()`                                | ☐      | —        | —              | —              |
| →     | `@LogExecution()`                               | ☐      | —        | —              | —              |
| →     | `@ValidateInput(schema)`                        | ☐      | —        | —              | —              |
| 2.3.2 | Filters (3 filters)                             | ☐      | —        | —              | —              |
| →     | `DomainErrorFilter` (DomainError → HTTP status) | ☐      | —        | —              | —              |
| →     | `HttpExceptionFilter` (HttpException → JSON)    | ☐      | —        | —              | —              |
| →     | `AllExceptionsFilter` (catch-all, log + 500)    | ☐      | —        | —              | —              |

### 2.4 Config + Guards + Pipes + Validators + Utils (19 componentes)

| #     | Task                                           | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ---------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 2.4.1 | Config files (6 archivos)                      | ☐      | —        | —              | —              |
| →     | `app.config.ts` (port, env, timeouts)          | ☐      | —        | —              | —              |
| →     | `database.config.ts` (pg connection)           | ☐      | —        | —              | —              |
| →     | `redis.config.ts` (host, port, db index)       | ☐      | —        | —              | —              |
| →     | `telegram.config.ts` (2 bot tokens + chatIds)  | ☐      | —        | —              | —              |
| →     | `llm.config.ts` (gateway URL, timeout)         | ☐      | —        | —              | —              |
| →     | `queue.config.ts` (Bull options)               | ☐      | —        | —              | —              |
| 2.4.2 | Guards + Pipes (4 componentes)                 | ☐      | —        | —              | —              |
| →     | `AuthGuard` (JWT validation)                   | ☐      | —        | —              | —              |
| →     | `RoleGuard` (role-based access)                | ☐      | —        | —              | —              |
| →     | `ValidationPipe` (class-validator integration) | ☐      | —        | —              | —              |
| →     | `TransformPipe` (DTO transformation)           | ☐      | —        | —              | —              |
| 2.4.3 | Validators (3 clases)                          | ☐      | —        | —              | —              |
| →     | `ContentTypeValidator`                         | ☐      | —        | —              | —              |
| →     | `UrlValidator`                                 | ☐      | —        | —              | —              |
| →     | `DateRangeValidator`                           | ☐      | —        | —              | —              |
| 2.4.4 | Utils (15 funciones)                           | ☐      | —        | —              | —              |
| →     | `retryWithBackoff()`                           | ☐      | —        | —              | —              |
| →     | `normalizeUrl()`                               | ☐      | —        | —              | —              |
| →     | `sanitizeHtml()`                               | ☐      | —        | —              | —              |
| →     | `truncate()`                                   | ☐      | —        | —              | —              |
| →     | `hashContent()`                                | ☐      | —        | —              | —              |
| →     | `parseTemplate()`                              | ☐      | —        | —              | —              |
| →     | `formatTimestamp()`                            | ☐      | —        | —              | —              |
| →     | `chunkArray()`                                 | ☐      | —        | —              | —              |
| →     | `deepClone()`                                  | ☐      | —        | —              | —              |
| →     | `isValidJson()`                                | ☐      | —        | —              | —              |
| →     | `extractUrls()`                                | ☐      | —        | —              | —              |
| →     | `slugify()`                                    | ☐      | —        | —              | —              |
| →     | `debounce()`                                   | ☐      | —        | —              | —              |
| →     | `throttle()`                                   | ☐      | —        | —              | —              |
| →     | `uuid()`                                       | ☐      | —        | —              | —              |

**Phase 2 Completion Criteria**:

- [ ] 57 componentes implementados
- [ ] Unit tests: >80% coverage (`npm run test -- shared/`)
- [ ] Commit: `feat(content-publisher): phase 2 - shared module complete`

---

## Phase 3: Queue + Database (Week 3)

**Goal**: Implementar cola unificada + schema 16 tablas  
**Duración estimada**: 5 días  
**Responsable**: [Name]

### 3.1 Queue Module (4 días)

| #     | Task                                                                                                              | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 3.1.1 | Domain: `PublisherQueueEntry` aggregate                                                                           | ☐      | —        | —              | —              |
| →     | Props: id, contentType, state, rawContent, processedContent, metadata, priority, attempts, createdAt, processedAt | ☐      | —        | —              | —              |
| →     | Methods: `markProcessing()`, `markCompleted()`, `markFailed()`, `incrementAttempts()`                             | ☐      | —        | —              | —              |
| 3.1.2 | Domain Events                                                                                                     | ☐      | —        | —              | —              |
| →     | `EntryEnqueued`                                                                                                   | ☐      | —        | —              | —              |
| →     | `EntryDequeued`                                                                                                   | ☐      | —        | —              | —              |
| →     | `EntryCompleted`                                                                                                  | ☐      | —        | —              | —              |
| →     | `EntryFailed`                                                                                                     | ☐      | —        | —              | —              |
| 3.1.3 | Application Use Cases (5 use cases)                                                                               | ☐      | —        | —              | —              |
| →     | `EnqueueContentUseCase`                                                                                           | ☐      | —        | —              | —              |
| →     | `DequeueContentUseCase` (fetch by priority + contentType)                                                         | ☐      | —        | —              | —              |
| →     | `CompleteEntryUseCase`                                                                                            | ☐      | —        | —              | —              |
| →     | `FailEntryUseCase`                                                                                                | ☐      | —        | —              | —              |
| →     | `GetQueueStatsUseCase`                                                                                            | ☐      | —        | —              | —              |
| 3.1.4 | Infrastructure                                                                                                    | ☐      | —        | —              | —              |
| →     | `QueueRepository` (TypeORM implementation)                                                                        | ☐      | —        | —              | —              |
| →     | `publisher.entry.entity.ts` (tabla `publisher_queue_entries`)                                                     | ☐      | —        | —              | —              |
| →     | Bull queue wrapper (opcional, background processor)                                                               | ☐      | —        | —              | —              |
| 3.1.5 | API Endpoints                                                                                                     | ☐      | —        | —              | —              |
| →     | `POST /api/queue/enqueue`                                                                                         | ☐      | —        | —              | —              |
| →     | `GET /api/queue/stats`                                                                                            | ☐      | —        | —              | —              |
| →     | `DELETE /api/queue/:id` (cancel entry)                                                                            | ☐      | —        | —              | —              |

### 3.2 Database Schema (3 días)

| #      | Task                                                               | Status | Assignee | Notes/Blockers | Completed Date |
| ------ | ------------------------------------------------------------------ | ------ | -------- | -------------- | -------------- |
| 3.2.1  | Crear migration: `1727100000000-BaselineContentPublisherSchema.ts` | ☐      | —        | —              | —              |
| 3.2.2  | Tablas Matching (1 tabla)                                          | ☐      | —        | —              | —              |
| →      | `matching_config`                                                  | ☐      | —        | —              | —              |
| 3.2.3  | Tablas Keywords (4 tablas)                                         | ☐      | —        | —              | —              |
| →      | `keywords_config`                                                  | ☐      | —        | —              | —              |
| →      | `keyword_groups`                                                   | ☐      | —        | —              | —              |
| →      | `keyword_group_keywords` (join table)                              | ☐      | —        | —              | —              |
| →      | `keyword_stats`                                                    | ☐      | —        | —              | —              |
| 3.2.4  | Tablas Filters (1 tabla)                                           | ☐      | —        | —              | —              |
| →      | `content_filters`                                                  | ☐      | —        | —              | —              |
| 3.2.5  | Tablas Queue (1 tabla)                                             | ☐      | —        | —              | —              |
| →      | `publisher_queue_entries`                                          | ☐      | —        | —              | —              |
| 3.2.6  | Tablas Deduplication (1 tabla)                                     | ☐      | —        | —              | —              |
| →      | `deduplication_fingerprints`                                       | ☐      | —        | —              | —              |
| 3.2.7  | Tablas LLM (2 tablas)                                              | ☐      | —        | —              | —              |
| →      | `llm_config`                                                       | ☐      | —        | —              | —              |
| →      | `llm_templates`                                                    | ☐      | —        | —              | —              |
| 3.2.8  | Tablas Scheduling (6 tablas)                                       | ☐      | —        | —              | —              |
| →      | `scheduling_config`                                                | ☐      | —        | —              | —              |
| →      | `ad_configs`                                                       | ☐      | —        | —              | —              |
| →      | `ad_media`                                                         | ☐      | —        | —              | —              |
| →      | `ad_rotations`                                                     | ☐      | —        | —              | —              |
| →      | `published_content`                                                | ☐      | —        | —              | —              |
| →      | `publish_stats`                                                    | ☐      | —        | —              | —              |
| 3.2.9  | Ejecutar migration: `npm run migration:run`                        | ☐      | —        | —              | —              |
| 3.2.10 | Validar schema: `psql -c "\dt"` (16 tablas)                        | ☐      | —        | —              | —              |

**Phase 3 Completion Criteria**:

- [ ] Queue enqueue/dequeue funciona
- [ ] 16 tablas creadas sin errores
- [ ] Integration tests green
- [ ] Commit: `feat(content-publisher): phase 3 - queue + database schema`

---

## Phase 4: Ingestion Module (Week 4, Days 1-3)

**Goal**: Consumir SSE de ingestion-telegram y enqueue mensajes  
**Duración estimada**: 3 días  
**Responsable**: [Name]

| #   | Task                                                                        | Status | Assignee | Notes/Blockers | Completed Date |
| --- | --------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 4.1 | Infrastructure: `IngestionClient` (HTTP client)                             | ☐      | —        | —              | —              |
| →   | `GET /api/feed/sources`                                                     | ☐      | —        | —              | —              |
| →   | `GET /api/feed/messages`                                                    | ☐      | —        | —              | —              |
| 4.2 | Infrastructure: `IngestionSseListenerAdapter` (SSE client)                  | ☐      | —        | —              | —              |
| →   | Subscribe to `GET /api/ingestion/stream`                                    | ☐      | —        | —              | —              |
| →   | Backoff: 1s → 30s exponential                                               | ☐      | —        | —              | —              |
| 4.3 | Application: `IngestionSseListenerUseCase`                                  | ☐      | —        | —              | —              |
| →   | Parse SSE events → enqueue with `contentType: 'crypto-news'`                | ☐      | —        | —              | —              |
| 4.4 | API (debug endpoints)                                                       | ☐      | —        | —              | —              |
| →   | `GET /api/ingestion/sources` (proxy to ingestion-telegram)                  | ☐      | —        | —              | —              |
| →   | `GET /api/ingestion/stream-status` (connected, reconnecting, error)         | ☐      | —        | —              | —              |
| 4.5 | Validar logs: `[IngestionSseListener] Connected to ingestion-telegram:3031` | ☐      | —        | —              | —              |
| 4.6 | Validar queue recibe entradas con `contentType: 'crypto-news'`              | ☐      | —        | —              | —              |

**Phase 4 Completion Criteria**:

- [ ] SSE connection estable (>5 min sin reconnect)
- [ ] Queue recibe mensajes cada 1-2 min
- [ ] Commit: `feat(content-publisher): phase 4 - ingestion module`

---

## Phase 5: Matching + Keywords + Filters (Week 4-5)

**Goal**: Filtrar contenido RAW antes de enqueue  
**Duración estimada**: 5 días  
**Responsable**: [Name]

### 5.1 Matching Module (2 días)

| #     | Task                                                | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | --------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 5.1.1 | Application: `FilteredContentService` (orquestador) | ☐      | —        | —              | —              |
| →     | Pipeline: filters → keywords → blacklist            | ☐      | —        | —              | —              |
| 5.1.2 | Application: `EvaluateContentUseCase`               | ☐      | —        | —              | —              |
| →     | Returns: `{matched: boolean, reason?: string}`      | ☐      | —        | —              | —              |
| 5.1.3 | API Endpoints                                       | ☐      | —        | —              | —              |
| →     | `POST /api/matching/evaluate` (test endpoint)       | ☐      | —        | —              | —              |
| →     | `GET /api/matching/config`                          | ☐      | —        | —              | —              |
| →     | `PATCH /api/matching/config` (toggle on/off)        | ☐      | —        | —              | —              |

### 5.2 Keywords Module (2 días)

| #     | Task                                                  | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ----------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 5.2.1 | Domain: `KeywordGroup` aggregate                      | ☐      | —        | —              | —              |
| →     | Props: id, name, keywords[], operator ('OR' or 'AND') | ☐      | —        | —              | —              |
| 5.2.2 | Application: `EvaluateKeywordsUseCase`                | ☐      | —        | —              | —              |
| →     | Case-insensitive, whole-word match                    | ☐      | —        | —              | —              |
| 5.2.3 | Application: `ManageKeywordGroupsUseCase` (CRUD)      | ☐      | —        | —              | —              |
| 5.2.4 | API Endpoints                                         | ☐      | —        | —              | —              |
| →     | `GET /api/keywords/groups`                            | ☐      | —        | —              | —              |
| →     | `POST /api/keywords/groups`                           | ☐      | —        | —              | —              |
| →     | `PUT /api/keywords/groups/:id`                        | ☐      | —        | —              | —              |
| →     | `DELETE /api/keywords/groups/:id`                     | ☐      | —        | —              | —              |

### 5.3 Filters Module (3 días)

| #     | Task                                                  | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ----------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 5.3.1 | Domain: `ContentFilter` aggregate                     | ☐      | —        | —              | —              |
| →     | Props: id, channelId, patterns[] (regex), order       | ☐      | —        | —              | —              |
| 5.3.2 | Application: `ApplyFiltersUseCase`                    | ☐      | —        | —              | —              |
| →     | Apply ordered transforms to title + content           | ☐      | —        | —              | —              |
| →     | ReDoS protection: timeout 100ms per regex             | ☐      | —        | —              | —              |
| 5.3.3 | API Endpoints                                         | ☐      | —        | —              | —              |
| →     | `GET /api/filters?channelId=123`                      | ☐      | —        | —              | —              |
| →     | `POST /api/filters`                                   | ☐      | —        | —              | —              |
| →     | `PUT /api/filters/:id`                                | ☐      | —        | —              | —              |
| →     | `DELETE /api/filters/:id`                             | ☐      | —        | —              | —              |
| 5.3.4 | Test: mensaje con "bitcoin ETF" → matched (AND-group) | ☐      | —        | —              | —              |
| 5.3.5 | Test: mensaje con "scam" (blacklist) → rejected       | ☐      | —        | —              | —              |

**Phase 5 Completion Criteria**:

- [ ] Filtering pipeline completo (filters → keywords → blacklist)
- [ ] Tests unitarios + integration tests green
- [ ] Commit: `feat(content-publisher): phase 5 - matching + keywords + filters`

---

## Phase 6: LLM Module (Week 5, Days 4-5 + Week 6, Day 1)

**Goal**: Generar contenido procesado con templates  
**Duración estimada**: 3 días  
**Responsable**: [Name]

| #   | Task                                                                               | Status | Assignee | Notes/Blockers | Completed Date |
| --- | ---------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 6.1 | Domain: `LlmTemplate` aggregate                                                    | ☐      | —        | —              | —              |
| →   | Props: id, contentType, systemPrompt, userPrompt, schema                           | ☐      | —        | —              | —              |
| →   | Templates: crypto-news-announcement, crypto-news-analysis, thread-kol-insight (v2) | ☐      | —        | —              | —              |
| 6.2 | Application: `GenerateContentUseCase`                                              | ☐      | —        | —              | —              |
| →   | Input: rawContent + templateId → Output: processedContent                          | ☐      | —        | —              | —              |
| 6.3 | Port: `LlmGatewayPort` (interface)                                                 | ☐      | —        | —              | —              |
| 6.4 | Infrastructure: `OpenAILlmAdapter` (vía gateway)                                   | ☐      | —        | —              | —              |
| →   | POST `/v1/chat/completions`                                                        | ☐      | —        | —              | —              |
| →   | Retry: 3 attempts, 2s backoff                                                      | ☐      | —        | —              | —              |
| →   | Timeout: 30s                                                                       | ☐      | —        | —              | —              |
| 6.5 | API Endpoints                                                                      | ☐      | —        | —              | —              |
| →   | `POST /api/llm/generate` (test endpoint)                                           | ☐      | —        | —              | —              |
| →   | `GET /api/llm/templates`                                                           | ☐      | —        | —              | —              |
| →   | `POST /api/llm/templates`                                                          | ☐      | —        | —              | —              |
| →   | `GET /api/llm/config` (enabled flag)                                               | ☐      | —        | —              | —              |
| →   | `PATCH /api/llm/config` (toggle)                                                   | ☐      | —        | —              | —              |
| 6.6 | Test: raw="Solana breaks $200" → processed="🚀 Solana rompe $200: análisis..."     | ☐      | —        | —              | —              |
| 6.7 | Test: `llmEnabled=false` → skip generation, use raw content                        | ☐      | —        | —              | —              |

**Phase 6 Completion Criteria**:

- [ ] LLM generation funciona con gateway
- [ ] Templates creadas en DB
- [ ] Fallback a raw content si LLM falla
- [ ] Commit: `feat(content-publisher): phase 6 - llm module`

---

## Phase 7: Deduplication + Scheduling (Week 6)

**Goal**: Evitar duplicados y publicar con ads  
**Duración estimada**: 5 días  
**Responsable**: [Name]

### 7.1 Deduplication Module (3 días)

| #     | Task                                                               | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ------------------------------------------------------------------ | ------ | -------- | -------------- | -------------- |
| 7.1.1 | Domain: `DeduplicationFingerprint` aggregate                       | ☐      | —        | —              | —              |
| →     | Props: id, fingerprint, contentType, publishedAt, expiresAt        | ☐      | —        | —              | —              |
| 7.1.2 | Application: `CheckDuplicateUseCase`                               | ☐      | —        | —              | —              |
| →     | Cascade: exact match → fuzzy (90%) → semantic (embeddings 0.95)    | ☐      | —        | —              | —              |
| 7.1.3 | Application: `RecordFingerprintUseCase`                            | ☐      | —        | —              | —              |
| 7.1.4 | Infrastructure: `FingerprintRepository`                            | ☐      | —        | —              | —              |
| 7.1.5 | Infrastructure: `SemanticSimilarityService` (pgvector, embeddings) | ☐      | —        | —              | —              |
| 7.1.6 | Janitor cron: limpieza 72h retention                               | ☐      | —        | —              | —              |
| 7.1.7 | API Endpoints                                                      | ☐      | —        | —              | —              |
| →     | `POST /api/dedup/check` (test endpoint)                            | ☐      | —        | —              | —              |
| →     | `GET /api/dedup/stats`                                             | ☐      | —        | —              | —              |

### 7.2 Scheduling Module (4 días)

| #      | Task                                                              | Status | Assignee | Notes/Blockers | Completed Date |
| ------ | ----------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 7.2.1  | Domain: `PublishSchedule` aggregate                               | ☐      | —        | —              | —              |
| →      | Props: id, contentType, intervalSeconds, maxPerHour               | ☐      | —        | —              | —              |
| 7.2.2  | Domain: `AdConfig` aggregate                                      | ☐      | —        | —              | —              |
| →      | Props: id, active, rotationStrategy, probability                  | ☐      | —        | —              | —              |
| 7.2.3  | Domain: `PublishedContent` aggregate                              | ☐      | —        | —              | —              |
| →      | Props: id, contentType, botUsed, messageId, publishedAt           | ☐      | —        | —              | —              |
| 7.2.4  | Application: `PublishContentUseCase`                              | ☐      | —        | —              | —              |
| →      | Flow: dequeue → dedup → LLM → ads → telegram → finalize           | ☐      | —        | —              | —              |
| 7.2.5  | Application: `RotateAdUseCase` (sequential, random, weighted)     | ☐      | —        | —              | —              |
| 7.2.6  | Application: `PublishingScheduler` (cron every 1 min)             | ☐      | —        | —              | —              |
| →      | Drain queue, respect rate limits (maxPerHour)                     | ☐      | —        | —              | —              |
| 7.2.7  | Infrastructure: `PublishedContentRepository`                      | ☐      | —        | —              | —              |
| 7.2.8  | Infrastructure: `AdConfigRepository`                              | ☐      | —        | —              | —              |
| 7.2.9  | Infrastructure: `TelegramBotApiClient` (sendMessage + sendPhoto)  | ☐      | —        | —              | —              |
| 7.2.10 | API Endpoints                                                     | ☐      | —        | —              | —              |
| →      | `POST /api/scheduling/publish-now/:entryId` (manual trigger)      | ☐      | —        | —              | —              |
| →      | `GET /api/scheduling/stats`                                       | ☐      | —        | —              | —              |
| →      | `GET /api/scheduling/ads`                                         | ☐      | —        | —              | —              |
| →      | `POST /api/scheduling/ads` (upload ad)                            | ☐      | —        | —              | —              |
| 7.2.11 | Test: Cron drains 1 entry → publica en Telegram → marca completed | ☐      | —        | —              | —              |
| 7.2.12 | Test: Ad rotates secuencialmente cada 5 mensajes                  | ☐      | —        | —              | —              |

**Phase 7 Completion Criteria**:

- [ ] Dedup cascade funciona (exact, fuzzy, semantic)
- [ ] Scheduler publica mensajes cada 1 min
- [ ] Ads rotation funciona
- [ ] Commit: `feat(content-publisher): phase 7 - dedup + scheduling`

---

## Phase 8: Telegram Module (Week 7, Days 1-2)

**Goal**: Centralizar 2 bot adapters (crypto-news + KOL)  
**Duración estimada**: 2 días  
**Responsable**: [Name]

| #    | Task                                                                            | Status | Assignee | Notes/Blockers | Completed Date |
| ---- | ------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| 8.1  | Infrastructure: `CryptoNewsBotAdapter`                                          | ☐      | —        | —              | —              |
| →    | Token: `TELEGRAM_BOT_TOKEN_CRYPTO_NEWS`, chatId: `TELEGRAM_CHAT_ID_CRYPTO_NEWS` | ☐      | —        | —              | —              |
| 8.2  | Infrastructure: `KolBotAdapter`                                                 | ☐      | —        | —              | —              |
| →    | Token: `TELEGRAM_BOT_TOKEN_KOL`, chatId: `TELEGRAM_CHAT_ID_KOL`                 | ☐      | —        | —              | —              |
| 8.3  | Port: `TelegramBotApiPort` (interface)                                          | ☐      | —        | —              | —              |
| 8.4  | Shared logic: retry (3×), rate limiting (30 msg/s)                              | ☐      | —        | —              | —              |
| 8.5  | Application: `SelectBotUseCase`                                                 | ☐      | —        | —              | —              |
| →    | contentType → bot (crypto-news uses crypto-news bot, thread uses KOL bot)       | ☐      | —        | —              | —              |
| 8.6  | Application: `SendMessageUseCase` (text-only)                                   | ☐      | —        | —              | —              |
| 8.7  | Application: `SendPhotoUseCase` (with caption + photo)                          | ☐      | —        | —              | —              |
| 8.8  | API (debug endpoint, opcional)                                                  | ☐      | —        | —              | —              |
| →    | `POST /api/telegram/test-message` (body: {bot: 'crypto-news' or 'kol', text})   | ☐      | —        | —              | —              |
| 8.9  | Test: publish crypto-news → usa crypto-news bot                                 | ☐      | —        | —              | —              |
| 8.10 | Test: publish thread (v2) → usa KOL bot                                         | ☐      | —        | —              | —              |

**Phase 8 Completion Criteria**:

- [ ] Dual bots funcionan correctamente
- [ ] Bot selection correcto por contentType
- [ ] Commit: `feat(content-publisher): phase 8 - telegram module (dual bots)`

---

## E2E Testing (Week 7, Days 3-5)

**Goal**: Validar flujo completo end-to-end  
**Duración estimada**: 3 días  
**Responsable**: [Name]

| #     | Task                                                                            | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| E2E.1 | Test: Crypto-News Publishing E2E                                                | ☐      | —        | —              | —              |
| →     | Enqueue crypto-news → scheduler → Telegram (crypto-news bot) → verify messageId | ☐      | —        | —              | —              |
| E2E.2 | Test: Thread Publishing E2E (v2)                                                | ☐      | —        | —              | —              |
| →     | Enqueue thread → scheduler → Telegram (KOL bot) → verify botUsed = 'kol'        | ☐      | —        | —              | —              |
| E2E.3 | Test: Deduplication                                                             | ☐      | —        | —              | —              |
| →     | Publish once → attempt duplicate → verify rejected with 'duplicate' reason      | ☐      | —        | —              | —              |
| E2E.4 | Test: LLM Fallback                                                              | ☐      | —        | —              | —              |
| →     | LLM timeout → verify raw content published instead                              | ☐      | —        | —              | —              |
| E2E.5 | Test: Rate Limiting                                                             | ☐      | —        | —              | —              |
| →     | Enqueue 100 entries → verify maxPerHour respected                               | ☐      | —        | —              | —              |
| E2E.6 | Load test: 100 concurrent enqueues                                              | ☐      | —        | —              | —              |
| →     | Verify queue capacity 36, no OOM                                                | ☐      | —        | —              | —              |

**E2E Completion Criteria**:

- [ ] Todos los tests E2E green (100%)
- [ ] Load test: no memory leaks, <512 MB usage
- [ ] Commit: `test(content-publisher): e2e tests complete`

---

## Staging Validation (Week 7, Days 5-7 + Week 8)

**Goal**: Validar en staging por 7 días sin errores  
**Duración estimada**: 7 días  
**Responsable**: [Name]

| #     | Task                                                                            | Status | Assignee | Notes/Blockers | Completed Date |
| ----- | ------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| STG.1 | Deploy staging: `git push origin dev` (trigger deploy-staging.yml)              | ☐      | —        | —              | —              |
| STG.2 | Verificar healthcheck staging: `curl http://staging:3041/api/health` → 200 OK   | ☐      | —        | —              | —              |
| STG.3 | Monitorear logs staging 7 días: 0 errores críticos                              | ☐      | —        | —              | —              |
| STG.4 | Dual-write validation: comparar queue counts (backend vs content-publisher) ±5% | ☐      | —        | —              | —              |
| STG.5 | Rollback test staging: ejecutar procedimiento completo (30 min)                 | ☐      | —        | —              | —              |
| STG.6 | Performance validation: latency <90s (p95), memory <512 MB                      | ☐      | —        | —              | —              |

**Staging Validation Completion Criteria**:

- [ ] 7 días sin errores críticos en logs
- [ ] Dual-write consistency validada
- [ ] Rollback tested exitosamente

---

## Production Cutover (Week 9, Day 1)

**Goal**: Activar content-publisher en producción  
**Duración estimada**: 1 día (con monitoring 48h)  
**Responsable**: [Name]

| #       | Task                                                                                        | Status | Assignee | Notes/Blockers | Completed Date |
| ------- | ------------------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| PROD.1  | Merge dev → master: `gh pr create --title "feat: content-publisher refactor" --base master` | ☐      | —        | —              | —              |
| PROD.2  | Aprobar PR (1 approval + CI green)                                                          | ☐      | —        | —              | —              |
| PROD.3  | Merge PR → trigger deploy.yml                                                               | ☐      | —        | —              | —              |
| PROD.4  | Deploy content-publisher prod: manual workflow dispatch                                     | ☐      | —        | —              | —              |
| PROD.5  | Verificar healthcheck prod: `curl http://localhost:3042/api/health` → 200 OK                | ☐      | —        | —              | —              |
| PROD.6  | Activar feature flag: `USE_CONTENT_PUBLISHER=true` en backend `.env.production`             | ☐      | —        | —              | —              |
| PROD.7  | Restart backend: `docker compose restart backend`                                           | ☐      | —        | —              | —              |
| PROD.8  | Monitorear logs primeras 4 horas (smoke tests)                                              | ☐      | —        | —              | —              |
| PROD.9  | Verificar Telegram channel: mensajes publicados cada 1-2 min                                | ☐      | —        | —              | —              |
| PROD.10 | Medir métricas 48h: latency, CPU, memory, failed rate                                       | ☐      | —        | —              | —              |

**Production Cutover Completion Criteria**:

- [ ] Feature flag activado sin rollback
- [ ] 48h sin errores críticos
- [ ] Métricas dentro de targets (latency <90s, memory <512 MB)
- [ ] Commit: `chore: production cutover successful`

---

## Post-Cutover Cleanup (Week 9-10)

**Goal**: Deprecar y eliminar código viejo del backend  
**Duración estimada**: 2 semanas  
**Responsable**: [Name]

| #         | Task                                                                             | Status | Assignee | Notes/Blockers | Completed Date |
| --------- | -------------------------------------------------------------------------------- | ------ | -------- | -------------- | -------------- |
| CLEANUP.1 | Agregar `@deprecated` decorators a 41 clases (crypto-news BCs)                   | ☐      | —        | —              | —              |
| CLEANUP.2 | Esperar 1 semana sin incidentes en prod                                          | ☐      | —        | —              | —              |
| CLEANUP.3 | Hard deprecation: cambiar `@deprecated` → `@throws DeprecationError`             | ☐      | —        | —              | —              |
| CLEANUP.4 | Esperar 1 semana más (total: 2 semanas post-cutover)                             | ☐      | —        | —              | —              |
| CLEANUP.5 | Eliminar 3 BCs completos del backend (84 archivos)                               | ☐      | —        | —              | —              |
| →         | `rm -rf apps/backend/src/crypto-news-integration/`                               | ☐      | —        | —              | —              |
| →         | `rm -rf apps/backend/src/crypto-news-publisher/`                                 | ☐      | —        | —              | —              |
| →         | `rm -rf apps/backend/src/crypto-news-ads/`                                       | ☐      | —        | —              | —              |
| CLEANUP.6 | Actualizar `AppModule` (19 imports, 3 menos)                                     | ☐      | —        | —              | —              |
| CLEANUP.7 | Commit: `feat(backend)!: remove crypto-news BCs (migrated to content-publisher)` | ☐      | —        | —              | —              |

**Cleanup Completion Criteria**:

- [ ] Backend no tiene referencias a crypto-news BCs
- [ ] CI green después de eliminar archivos
- [ ] Commit con `BREAKING CHANGE` en mensaje

---

## 📈 Daily Standup Template

Use este template cada día durante implementación:

```markdown
### Standup [Date]

**Yesterday**: [Phase X.Y completed / in progress / blocked]

**Today**: [Phase X.Z plan]

**Blockers**:

- [ ] [Blocker 1: description, assignee, ETA]
- [ ] [Blocker 2: ...]

**Notes**: [Any relevant context]
```

---

**Document Version**: 1.0  
**Last Updated**: [Date]  
**Next Review**: [After each phase completion]
