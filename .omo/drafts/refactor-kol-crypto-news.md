---
slug: refactor-kol-crypto-news
status: drafting
intent: clear
pending-action: write .omo/plans/refactor-kol-crypto-news.md
approach: <fill: the approach you intend to plan>
---

# Draft: refactor-kol-crypto-news

## Components (topology ledger)

<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

- C1 | Observabilidad con alertas (MetricsService + /metrics + Prometheus + Alertmanager + Slack) | status: DEFERRED por decisión del operador 2026-09-21 (solo-dev, sin capacidad de mirar métricas) | evidence: apps/backend/package.json (sin prom-client)
- C1-auto | Lo automatizado que YA existe y se conserva sin todos nuevos: backoff reconexión SSE 1s→30s (TelegramSseListenerAdapter.calculateBackoff) + degradación de disco automática (DiskMonitor, parte de C4) | status: active (vía C4, sin C1) | evidence: telegram-sse-listener.adapter.ts:68
- C2 | Claridad arquitectónica (dual-path docs + rename coordinators + validación 2-flag) | status: active | evidence: apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts:43, apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts:46, apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts:32, apps/backend/src/telegram/crypto-news-publisher/api/http/llm-config.controller.ts:221
- C3 | Fiabilidad (DLQ entity + retry CLI + métricas de routing failures) | status: active | evidence: DLQ MISSING en backend, handler try/catch nunca lanza (process-crypto-news-message.handler.ts:70)
- C4 | Performance (SSE heartbeat configurable + adaptive polling + media cleanup inteligente) | status: active | evidence: apps/ingestion-telegram/src/stream/application/services/stream.service.ts (heartbeat 30s), retention scheduler existe con spec
- C5 | Documentación (OpenAPI ambos servicios + CRYPTO_NEWS_ENV_REFERENCE + ADD_CRYPTO_NEWS_SOURCE) | status: active | evidence: @nestjs/swagger MISSING ambos, docs/configuration/ MISSING, docs/guides/ MISSING
- C6 | Calidad de código (opaque FK docs + TEXT→JSONB migración + comentarios ES→EN) | status: active | evidence: 41 hits ES en 18 ficheros backend (90% READMEs, 3 .ts), ingestion 0 hits

## Open assumptions (announced defaults)

<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->

- 2-flag system | Option 1 (validación con 400) ahora, Option 2 (merge a PublishingMode) diferido | Option 1 es quick-win reversible; Option 2 cambia contrato API + schema DB, decisión de producto mayor | reversible: sí (validación se puede relajar; merge queda documentado como follow-up)
- Test strategy | tests-after para integración + TDD para servicios nuevos (MetricsService, DLQ, DiskMonitor) | convención del repo: specs co-locados \*.spec.ts, Jest backend / Jest ingestion | reversible: n/a (estrategia, no código)
- Rename coordinators | renombrar con clases nuevas + deprecación 1 sprint (MessageRoutingService / MessagePersistenceCoordinator) | evita big-bang de imports; IDE refactoring | reversible: sí
- TEXT→JSONB | migración TypeORM con USING + GIN index + down() completo | patrón estándar TypeORM, datos existentes convertibles | reversible: parcial (down existe, pero en prod requiere ventana)
- Scope por defecto | plan completo de 9 items en waves HIGH→MEDIUM→LOW | el doc recomienda orden top-to-bottom por prioridad; waves permiten ship parcial | reversible: sí (pregunta de scope abajo)

## Findings (cited - path:lines)

- Scheduler es dinámico 1-vs-5min (no @Cron fijo): apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts:43 (FETCH_LIMIT=50, SchedulerRegistry, matchingEnabled gate). El doc asume @Cron('\*/5') fijo → STALE, el plan debe documentar dualidad real.
- Handler SSE <10s con dedup ANTES de fetch: apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts:46 (matchingEnabled → dedup PENDING/PUBLISHED/BLOCKING-FAILED → fetch ventana 10 → enqueue filtrado → logLatency 10_000ms). Nunca lanza (protege SSE).
- UpdateLlmConfigUseCase NO EXISTE (grep 0 hits): el path real es LlmConfigController.updateConfig apps/backend/src/telegram/crypto-news-publisher/api/http/llm-config.controller.ts:221 (rechaza matchingEnabled con 400+hint, bloquea llmEnabled en production, valida targetChannel vía Bot API). El plan debe targetear controller+entity.update, no use-case.
- LlmConfig entity existe con ambos flags: apps/backend/src/telegram/crypto-news-publisher/domain/entities/llm-config.entity.ts:55 (llmEnabled, publishingEnabled, singleton id=1).
- ContentFilterService es stateless puro con TIMEOUT_MS=100 post-hoc (no preemption real): apps/backend/src/telegram/ingestion/crypto-news/application/services/content-filter.service.ts:30. Docstring líneas 26-27 STALE (dice filtrado pre-persistencia vs realidad on-read).
- SSE adapter fetch+ReadableStream, backoff 1s\*2^n cap 30s: apps/backend/src/telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter.ts:68. backfill/resolveChannelMetadata/joinChannel NO IMPLEMENTADOS (placeholders).
- Publisher queue dual dominio+TypeORM, estados PENDING|SCHEDULED|PUBLISHING|PUBLISHED|FAILED|BLOCKED, cap 36, queued_at TTL 24h: apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts:101 + infrastructure/persistence/typeorm/entities/publisher-queue.entity.ts.
- Backend SIN prom-client/swagger/MetricsService/DLQ/middleware: apps/backend/package.json:38-70 (31 deps, sin ambos); MetricsService backend MISSING; DLQ MISSING (solo mención en comentario vip-channel spec:589); correlation-id solo como campo per-publish pub-<uuid> (vip-calls-publish.use-case.ts:67), no middleware.
- Ingestion SÍ tiene MetricsService+Controller (@willsoto/nestjs-prometheus ^6.1.0 + prom-client ^15.1.3): apps/ingestion-telegram/src/metrics/metrics.service.ts:31 + api/http/metrics.controller.ts:15-16. Pero nadie lo inyecta (gauges en 0) — el plan debe cablearlo, no crearlo.
- Español: 41 hits en 18 ficheros backend, ~90% READMEs, solo 3 .ts (ws.gateway.ts:21, command-router.service.ts:120, crypto-news-publisher.config.ts:93). Ingestion 0 hits. Por tanto el todo ES→EN es pequeño en código, grande en READMEs (acotar).
- Specs existen para las 5 familias: enqueue-matching-cron.scheduler.spec.ts, process-crypto-news-message.handler.spec.ts (+ filtered service + ingestion client), ingestion-coordinator.service.spec.ts (backend) + ingestion.coordinator.integration.spec.ts (ingestion), llm-config.entity.spec.ts + llm-config.controller.spec.ts + llm-config-migration.service.spec.ts, crypto-news-retention-cleanup.scheduler.spec.ts (solo ingestion; backend borrado en split por diseño).
- docs/configuration/ y docs/guides/ MISSING (docs/ tiene 23 entradas sin ambas). Hay que crearlos.

## Decisions (with rationale)

- Target de validación 2-flag = LlmConfigController.updateConfig + LlmConfig.update() (no use-case inexistente). Rationale: evidencia de explore 1.
- Métricas backend = nuevo MetricsService modelado sobre el de ingestion (Registry propio, mismos nombres crypto*news*\*), prom-client como dependencia nueva. Rationale: reusar patrón probado, evitar @willsoto wrapper para control fino de histogram buckets.
- DLQ = nueva tabla dead_letter_queue + entity + repo + use-case retry + CLI dlq:retry. Rationale: el handler actual solo loguea y pierde el mensaje.
- SSE heartbeat configurable vía env (SSE*HEARTBEAT_INTERVAL_MS, SSE_RECONNECT*\*), no cambio de comportamiento por defecto (30s/1s/30s). Rationale: operadores tunean sin deploy de código.
- TEXT→JSONB solo en ingestion DB (crypto_news_messages.message_entities) con migración up/down + GIN. Rationale: backend no tiene esa tabla (split 2026-09-08).

## Scope IN

- C2–C6 (docs, claridad arquitectónica, DLQ pendiente de confirmación, performance con DiskMonitor automático, OpenAPI/guides, calidad). C1 deferred.
- Archivos exactos citados en Findings; specs co-locados actualizados/creados por todo; evidencias .omo/evidence/task-N-refactor-kol-crypto-news.txt.

## Scope OUT (Must NOT have)

- NO merge de flags a PublishingMode (Option 2) — queda como follow-up documentado.
- NO tocar pipeline alpha-call (extraction/parsing/normalization/scoring/gates) ni vip-calls.
- NO cambiar cap 36 del queue, TTL 24h/72h, ni ownership DB (backend NO escribe crypto-news, ingestion NO guarda identidad KOL).
- NO implementar replay/SSE Last-Event-ID ni backfill real (gaps conocidos, fuera de este doc).
- NO tocar MTProto session/creds ni crear segundas instancias ingestion.
- NO pgvector, NO nuevo cliente OpenAI (LLM arbiter no es parte de este doc).

## Open questions

- Q1 (única, owner-decisión de alcance): ¿plan completo de 9 items o recorte? Ver Approval gate.

## Approval gate

status: approved
pending-action: none — plan written at .omo/plans/refactor-kol-crypto-news.md (11 todos + F1-F4, C1 deferred per operator 2026-09-21)
approach: waves HIGH→MEDIUM→LOW sin C1; cada todo con References + Acceptance + QA happy/failure + Commit.
