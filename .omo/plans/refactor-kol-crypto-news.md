# refactor-kol-crypto-news - Work Plan

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Manuales que explican el sistema, nombres que no confunden, un buzón que rescata mensajes fallidos sin vigilar nada, ajustes que se defienden solos ante avalanchas y disco lleno, documentación interactiva de la API y base de datos lista para búsquedas potentes.

**Why this approach:** primero lo que evita sustos sin vigilancia (docs + validaciones + buzón), luego lo automatizado (performance + disco), al final el pulido (OpenAPI + JSONB). Cada wave funciona sola: puedes parar tras cualquier wave y lo hecho sigue valiendo.

**What it will NOT do:** no vigila nada por ti (sin alarmas ni Slack), no toca cómo se puntúan monedas ni los canales VIP, y no reintenta fallos solo (el rescate es manual, cuando quieras).

**Effort:** Medium (11 todos en 4 waves)
**Risk:** Low-Medium - la migración JSONB toca datos reales (mitigada con down() + filas inválidas a '[]' + prueba up/down en dev)
**Decisions to sanity-check:** DLQ con reintento solo manual; Opción 2 del 2-flag diferida; READMEs en español quedan fuera del alcance.

Your next move: aprueba y arrancamos con la Wave 1, o pide high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): Medium effort, Low-Medium risk, docs + rename + 2-flag validation + DLQ + adaptive polling/heartbeat + disk-aware cleanup + OpenAPI + JSONB (C1 alerts deferred)

## Scope

### Must have

- Documentación dual-path (rápida SSE vs lenta de respaldo) + referencia de variables de entorno con troubleshooting + guía de alta de fuentes (3 docs nuevos + JSDoc en scheduler/handler).
- Claridad: renombrar las dos clases `IngestionCoordinator` (backend → enrutado, ingestion → persistencia) + validación 400 para la combinación tonta del 2-flag (`llmEnabled=true` con `publishingEnabled=false`).
- Buzón DLQ: captura automática de mensajes fallidos + reintento manual on-demand vía HTTP (cero vigilancia, cero pérdidas).
- Performance automatizado: polling adaptativo (re-poll en 10s tras 3 tandas llenas) + heartbeat SSE configurable por env (defaults intactos) + limpieza de media con vigilancia de disco (recorte auto a 48h si >90%).
- OpenAPI/Swagger en backend e ingestion (`/api/docs`, alcance crypto-news/ingestion/stream/media).
- Calidad: documentar FKs opacas por diseño + migración `message_entities` TEXT→JSONB con GIN + comentarios ES→EN en código `.ts`.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- NO métricas/Prometheus/Alertmanager/Slack (C1 deferred por decisión del operador 2026-09-21: solo-dev sin capacidad de vigilancia).
- NO merge de flags a `PublishingMode` (Opción 2): queda como follow-up documentado, no implementado.
- NO tocar pipeline alpha-call (extraction/parsing/normalization/scoring/gates), vip-calls, ni frontend.
- NO cambiar defaults: cap 36 del queue, TTL 24h queue / 72h retención, intervalos 30s/1s/30s, `FETCH_LIMIT=50`.
- NO tocar ownership DB del split (backend no escribe crypto-news; ingestion no guarda identidad KOL) ni credenciales MTProto ni crear segundas instancias.
- NO replay SSE / Last-Event-ID / backfill real, NO pgvector, NO nuevo cliente OpenAI.
- NO reintento automático del DLQ (manual on-demand por diseño); `capture()` jamás lanza (protege el stream SSE).
- NO documentar con Swagger fuera del alcance (alpha-call, vip-calls, dashboard quedan fuera).

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: **tests-after** para integración y docs-adjacentes + **TDD** para servicios nuevos (DeadLetterService, DiskMonitorService, stream.config) + framework Jest co-locado (`*.spec.ts`) en ambos servicios.
- Full suites sin regresiones: backend (`npm run test:backend`) e ingestion (`cd apps/ingestion-telegram && npm test`); `tsc --noEmit` limpio en ambas apps tras cada todo de código.
- Cambios de comportamiento permitidos (únicos): 400 en combo inválido de flags, captura DLQ, re-poll adaptativo, recorte disco 90%→48h, columna JSONB. Todo lo demás es docs/comentarios/config sin cambio runtime (verificado con specs existentes en verde).
- Evidence: .omo/evidence/task-<N>-refactor-kol-crypto-news.txt

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- Wave 1 (docs, 3 todos, paralelizables): T1 dual-path doc, T2 env reference, T3 ADD guide.
- Wave 2 (backend claridad + limpieza, 3 todos, paralelizables): T4 rename coordinators, T5 validación 2-flag, T10 FK docs + ES→EN.
- Wave 3 (fiabilidad + performance, 3 todos, paralelizables): T6 DLQ, T7 adaptive polling + heartbeat, T8 DiskMonitor.
- Wave 4 (cierre, 2 todos, paralelizables): T9 OpenAPI ambos servicios, T11 migración JSONB.

### Dependency matrix

| Todo                  | Depends on | Blocks | Can parallelize with                                                |
| --------------------- | ---------- | ------ | ------------------------------------------------------------------- |
| T1 dual-path doc      | —          | —      | T2, T3 (evita nombrar coordinators; T4 retoca docs si hace falta)   |
| T2 env reference      | —          | —      | T1, T3                                                              |
| T3 ADD guide          | —          | —      | T1, T2                                                              |
| T4 rename             | —          | —      | T5, T10                                                             |
| T5 2-flag validation  | —          | —      | T4, T10                                                             |
| T6 DLQ                | —          | —      | T7, T8 (único que toca el handler; T7 toca scheduler, T8 ingestion) |
| T7 adaptive+heartbeat | —          | —      | T6, T8                                                              |
| T8 DiskMonitor        | —          | —      | T6, T7                                                              |
| T9 OpenAPI            | —          | —      | T11 (solo añade `main.ts` + decoradores; T11 toca entity+migración) |
| T10 FK+ES→EN          | —          | —      | T4, T5                                                              |
| T11 JSONB             | —          | —      | T9                                                                  |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Documentar arquitectura dual-path (SSE rápido + polling de respaldo)
     What to do: Crear `docs/architecture/crypto-news-dual-path.md` con diagrama de ambos caminos, tabla de las 4 combinaciones (`USE_SSE_CRYPTO_NEWS` × `matchingEnabled`), estrategia de rollback (`USE_SSE_CRYPTO_NEWS=false`), SLO latencia <10s y resumen de reglas dedup (PENDING/PUBLISHED/bloqueante). Añadir JSDoc `PRIMARY PATH` en `ProcessCryptoNewsMessageHandler` y `FALLBACK PATH` en `EnqueueMatchingCronScheduler`. Evitar nombrar las clases `IngestionCoordinator` (las renombra T4).
     Must NOT do: cambiar intervalos, FETCH_LIMIT, lógica de matching o cualquier runtime.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References (executor has NO interview context - be exhaustive): `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts:43` (intervalo dinámico, FETCH_LIMIT=50), `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts:46` (dedup→fetch ventana 10→enqueue→logLatency 10_000ms, nunca lanza), `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §2 (contenido esperado del doc).
     Acceptance criteria (agent-executable): `test -f docs/architecture/crypto-news-dual-path.md && grep -q 'PRIMARY PATH' apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts && grep -q 'FALLBACK PATH' apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts && npm run test:backend -- enqueue-matching-cron process-crypto-news-message` en verde (sin cambio de comportamiento).
     QA scenarios (name the exact tool + invocation): happy — `Read` del doc + specs relacionadas en verde vía `npm run test:backend -- <suite>`; failure — `git diff --stat -- apps/backend/src` solo muestra líneas de comentario (cero lógica). Evidence .omo/evidence/task-1-refactor-kol-crypto-news.txt
     Commit: Y | docs(crypto-news): document dual-path SSE plus polling architecture

- [x] 2. Referencia de variables de entorno crypto-news + troubleshooting
     What to do: Crear `docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md` con cada variable (default, quién la lee, rango válido): `INGESTION_TELEGRAM_URL`, `USE_SSE_CRYPTO_NEWS`, `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES`, `SSE_HEARTBEAT_INTERVAL_MS`, `SSE_RECONNECT_INITIAL_DELAY_MS`, `SSE_RECONNECT_MAX_DELAY_MS`, `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`, `CRYPTO_NEWS_BOT_TOKEN`, `CRYPTO_NEWS_OUTPUT_CHANNEL`, `INGESTION_TELEGRAM_MTPROTO_*`. Incluir tabla troubleshooting (SSE silencioso→revisar URL; polling lento→intervalo; LLM nunca corre→`publishingEnabled`; cola llena→cap 36/TTL 24h).
     Must NOT do: cambiar código ni valores; solo documentar la realidad verificada en `app.config.ts`.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References: `apps/backend/src/shared/common/config/app.config.ts` (bloque `USE_SSE_CRYPTO_NEWS`, `CRYPTO_NEWS_POLLING_INTERVAL_MINUTES`), `apps/ingestion-telegram/src/shared/common/config/app.config.ts` (retención 72h, safety), `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §3.
     Acceptance criteria: `test -f docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md && for v in INGESTION_TELEGRAM_URL USE_SSE_CRYPTO_NEWS CRYPTO_NEWS_POLLING_INTERVAL_MINUTES INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS; do grep -q "$v" docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md; done && npm run docs:check` exit 0.
     QA scenarios: happy — cada variable del doc existe en código vía `Grep`; failure — variable documentada sin lector en código se marca y elimina. Evidence .omo/evidence/task-2-refactor-kol-crypto-news.txt
     Commit: Y | docs(crypto-news): environment variable reference plus troubleshooting

- [x] 3. Guía de alta de fuentes crypto-news + rollback
     What to do: Crear `docs/guides/ADD_CRYPTO_NEWS_SOURCE.md`: alta vía `POST {INGESTION_TELEGRAM_URL}/api/crypto-news/sources`, keywords simples + AND-groups, blacklist phrases, filtros regex por canal (endpoints filters CRUD del backend), verificación (logs `Found N matching messages`, cola), rollback (borrar source / `matchingEnabled=false`).
     Must NOT do: cambiar endpoints ni lógica; guía operativa solamente.
     Parallelization: Wave 1 | Blocked by: — | Blocks: —
     References: `apps/ingestion-telegram/src/telegram/crypto-news` (alta de sources en ingestion), `apps/backend/src/telegram/ingestion/crypto-news/filters` (CRUD filtros), `apps/backend/src/telegram/crypto-news-publisher` (keywords/blacklist controllers), `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §9.
     Acceptance criteria: `test -f docs/guides/ADD_CRYPTO_NEWS_SOURCE.md && npm run docs:check` exit 0 y cada endpoint citado responde a `Grep` en `src/` (ningún 404 documentado).
     QA scenarios: happy — walkthrough en seco de la guía contra código (cada paso mapea a ruta real); failure — paso sin ruta real se corrige antes de cerrar. Evidence .omo/evidence/task-3-refactor-kol-crypto-news.txt
     Commit: Y | docs(crypto-news): add-source guide with rollback

- [x] 4. Renombrar los dos `IngestionCoordinator` (backend e ingestion)
     What to do: Backend `IngestionCoordinator` → `MessageRoutingService` (enruta KOL vs crypto-news, no persiste); ingestion-telegram `IngestionCoordinator` → `MessagePersistenceCoordinator` (persiste + emite SSE). Renombrar clase + fichero, actualizar todos los imports/providers/specs y comentarios `Per ...` que citen el nombre viejo. Si algún doc creado en Wave 1 nombra coordinators, actualizarlo.
     Must NOT do: cambiar lógica de ruteo, firmas de métodos ni dependencias; rename puro.
     Parallelization: Wave 2 | Blocked by: — | Blocks: —
     References: `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts:32` + `ingestion-coordinator.service.spec.ts`, `apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts` + `ingestion.coordinator.integration.spec.ts`, wirings (`SharedIngestionModule` backend, `SharedModule` ingestion).
     Acceptance criteria: `grep -rn 'IngestionCoordinator' apps/backend/src apps/ingestion-telegram/src --include='*.ts' | grep -v spec` vacío (cero refs no-spec al nombre viejo) + `tsc --noEmit` limpio en ambas apps + suites de coordinators en verde.
     QA scenarios: happy — `npm run test:backend -- ingestion-coordinator` y `npm test -- ingestion.coordinator` (ingestion) en verde; failure — importar el nombre viejo falla en compilación (prueba que el rename es total). Evidence .omo/evidence/task-4-refactor-kol-crypto-news.txt
     Commit: Y | refactor(ingestion): rename coordinators to routing and persistence names

- [x] 5. Validación del 2-flag (`llmEnabled` requiere `publishingEnabled`)
     What to do: En `LlmConfigController.updateConfig()` (el path REAL — `UpdateLlmConfigUseCase` no existe): si `dto.llmEnabled === true`, cargar config actual vía repo y si `publishingEnabled === false` lanzar `BadRequestException` con `{ error: 'llmEnabled requires publishingEnabled (LLM only runs when publishing is active)', hint: 'Enable publishing first via { publishingEnabled: true }' }`. Añadir specs: true+false→400 con hint, true+true→200, false→200 siempre. Respetar guards existentes (matchingEnabled-reject, production-guard).
     Must NOT do: tocar production-guard, matchingEnabled-guard, entity defaults ni fusionar flags (Opción 2 diferida).
     Parallelization: Wave 2 | Blocked by: — | Blocks: —
     References: `apps/backend/src/telegram/crypto-news-publisher/api/http/llm-config.controller.ts:221` (updateConfig + guards), `apps/backend/src/telegram/crypto-news-publisher/domain/entities/llm-config.entity.ts:55` (flags + singleton id=1), `llm-config.controller.spec.ts` existente, `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §5.
     Acceptance criteria: nuevo spec en verde con los 3 casos + spec existente del controller en verde + `npm run test:backend -- llm-config` completo verde.
     QA scenarios: happy — PATCH `{llmEnabled:true}` con publishing true → 200 vía spec HTTP; failure — con publishing false → 400 y body contiene `publishingEnabled` (assert exacto en spec). Evidence .omo/evidence/task-5-refactor-kol-crypto-news.txt
     Commit: Y | feat(crypto-news-publisher): validate llm plus publishing flag combination

- [x] 6. Buzón DLQ: captura automática + reintento manual on-demand
     What to do: Nueva tabla `dead_letter_queue` (entity `DeadLetterQueueEntry`: id uuid, channelId, messageId, failureReason text, failedPayload jsonb/text, failedAt, retryCount, status PENDING|RETRIED|DISCARDED) + registro en `PERSISTED_ENTITIES` (bump `EXPECTED_ENTITY_COUNT` 39→40) + migración TypeORM + `DeadLetterService` (capture/list/retry vía `EnqueueMatchingMessageUseCase`, TDD) + `DeadLetterController` (`GET /crypto-news/dead-letter`, `POST /crypto-news/dead-letter/:id/retry`) + cablear `catch` del handler a `capture()` envuelto en try/catch propio (jamás lanza). Specs: captura, retry re-encola, 404 en id inexistente, capture que falla no tumba el stream.
     Must NOT do: reintento automático, cambiar dedup, lanzar desde el path de captura, tocar TTL/cap del queue.
     Parallelization: Wave 3 | Blocked by: — | Blocks: —
     References: `apps/backend/src/telegram/crypto-news-integration/application/handlers/process-crypto-news-message.handler.ts:46` (catch a cablear), `apps/backend/src/telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity.ts:101` (patrón entity dual), `apps/backend/src/shared/common/persistence/entities.ts` (registro + count), `EnqueueMatchingMessageUseCase` (retry path), `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §8.
     Acceptance criteria: migración existe y aplica/revierte en dev; `npm run test:backend -- dead-letter` verde; retry de una fila PENDING la marca RETRIED y encola (assert en spec).
     QA scenarios: happy — capturar fallo → fila PENDING; retry → encolado + RETRIED; failure — retry id inexistente → 404; `capture()` lanzando → stream SSE intacto (spec con mock que truena). Evidence .omo/evidence/task-6-refactor-kol-crypto-news.txt
     Commit: Y | feat(crypto-news): dead-letter queue with manual retry

- [x] 7. Polling adaptativo + heartbeat SSE configurable
     What to do: Scheduler: guardia `isPolling` (salta tick si el anterior sigue corriendo) + `consecutiveFullBatches` (tandas de 50 llenas; umbral 3 → `setTimeout` re-poll en 10s; reset si tanda no llena). Ingestion: `stream.config.ts` (`registerAs('stream')`: `SSE_HEARTBEAT_INTERVAL_MS` default 30000, `SSE_RECONNECT_INITIAL_DELAY_MS` 1000, `SSE_RECONNECT_MAX_DELAY_MS` 30000, con validación min/max), `StreamService` usa el intervalo configurado, adapter backend `calculateBackoff()` usa las env. Registrar config en `StreamModule` + validación. Specs: 3 tandas llenas → re-poll programado; tick solapado → saltado; defaults intactos.
     Must NOT do: cambiar defaults, FETCH_LIMIT=50, lógica de matching; sin infra nueva.
     Parallelization: Wave 3 | Blocked by: — | Blocks: —
     References: `apps/backend/src/telegram/crypto-news-integration/application/scheduling/enqueue-matching-cron.scheduler.ts:43`, `enqueue-matching-cron.scheduler.spec.ts`, `apps/ingestion-telegram/src/stream/application/services/stream.service.ts` (heartbeat 30s hardcodeado), `apps/backend/src/telegram/ingestion/shared/api/sse/telegram-sse-listener.adapter.ts:68` (backoff), `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §§6-7.
     Acceptance criteria: specs nuevos + existentes en verde en ambas apps; `SSE_HEARTBEAT_INTERVAL_MS` ausente → 30000 efectivo (assert en spec de config).
     QA scenarios: happy — simular 3 tandas de 50 → `setTimeout` 10s invocado (fake timers); failure — tick con `isPolling=true` → skip logueado sin fetch. Evidence .omo/evidence/task-7-refactor-kol-crypto-news.txt
     Commit: Y | feat(crypto-news): adaptive polling plus configurable SSE heartbeat

- [x] 8. Limpieza inteligente con vigilancia de disco (ingestion)
     What to do: Nuevo `DiskMonitorService` (TDD): `getDiskUsage()` vía `fs.statfs(uploadsRoot)` → porcentaje, `getDirectorySize()` recursivo sobre `uploads/`. Partir el janitor: `cleanupExpiredContent()` en cron diario 3AM (misma semántica two-pass, lock `9_421_373`, reloj `ingested_at`, 72h) + `checkDiskAndCleanup()` horario: >80% warn + adelanta limpieza, >90% critical + `aggressiveCleanup()` (cutoff 72h→48h). Specs con `fs` mockeado; spec existente del retention scheduler sigue verde.
     Must NOT do: cambiar default 72h, lock id, semántica two-pass, ni tocar backend (su janitor se borró en el split por diseño).
     Parallelization: Wave 3 | Blocked by: — | Blocks: —
     References: `apps/ingestion-telegram` retention scheduler + `crypto-news-retention-cleanup.scheduler.spec.ts`, `apps/ingestion-telegram/src/shared/common/config/app.config.ts` (`INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`), `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §8 (segunda mitad).
     Acceptance criteria: specs nuevos + spec existente verdes; `statfs` mock 85% → cleanup invocado; 95% → cutoff 48h (assert en spec).
     QA scenarios: happy — disco 85% → limpieza + warn; failure — `statfs` truena → logueado y scheduler sobrevive (spec). Evidence .omo/evidence/task-8-refactor-kol-crypto-news.txt
     Commit: Y | feat(ingestion): disk-aware intelligent media cleanup

- [ ] 9. OpenAPI/Swagger en backend e ingestion (alcance crypto-news)
     What to do: Añadir `@nestjs/swagger` (versión compatible Nest 11) en ambas apps; `DocumentBuilder` en cada `main.ts` sirviendo en `/api/docs` (verificar que no colisiona con `/api/health`); decoradores en controllers/DTOs de crypto-news, ingestion, stream y media (matching config, llm config, queue, filters, keywords/blacklist, sources, stream status, media). Smoke spec/e2e: `GET /api/docs` → 200 en ambas.
     Must NOT do: cambiar rutas, añadir auth, documentar fuera del alcance (alpha-call, vip-calls, dashboard fuera).
     Parallelization: Wave 4 | Blocked by: — | Blocks: —
     References: `apps/backend/src/main.ts:85` (bootstrap), `apps/ingestion-telegram/src/main.ts` (bootstrap), controllers crypto-news-publisher/integration/ingestion + `stream.controller.ts` + `media.controller.ts`, `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §7 (segunda mitad).
     Acceptance criteria: ambas apps arrancan, `GET /api/docs` → 200 en las dos, suites unit completas verdes (cero rutas rotas).
     QA scenarios: happy — docs cargan y listan paths crypto-news; failure — `GET /api/health` sigue 200 (no colisión) + full suites verdes. Evidence .omo/evidence/task-9-refactor-kol-crypto-news.txt
     Commit: Y | docs(api): OpenAPI Swagger for backend plus ingestion

- [x] 10. FKs opacas documentadas + comentarios ES→EN en código
      What to do: JSDoc en `ChannelContentFilterConfigEntity.channel_id` (varchar opaco, sin FK por diseño del split 2026-09-08) y `PublisherQueueEntry` (FK-less, snapshots de contenido) + mini-doc `docs/architecture/crypto-news-schema-ownership.md` (qué vive en cada DB y por qué no hay FKs cruzadas). Traducir a inglés los comentarios españoles en los 3 `.ts` con hits (`ws.gateway.ts:21`, `command-router.service.ts:120`, `crypto-news-publisher.config.ts:93`); READMEs quedan fuera (90% de los hits, alcance desmedido — anotarlo en el doc).
      Must NOT do: cambiar schema, entidades, queries ni tocar READMEs.
      Parallelization: Wave 2 | Blocked by: — | Blocks: —
      References: `ChannelContentFilterConfigEntity`, `PublisherQueueEntry` entity, los 3 `.ts` citados, `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §4 (primera mitad).
      Acceptance criteria: `grep -rn 'Detecta\|Emite\|vía\|para KOL' apps/backend/src apps/ingestion-telegram/src --include='*.ts'` vacío + JSDoc presentes + suites verdes (cambio solo-comentarios).
      QA scenarios: happy — `tsc --noEmit` limpio + specs de filtros/queue verdes; failure — n/a (docs). Evidence .omo/evidence/task-10-refactor-kol-crypto-news.txt
      Commit: Y | docs(i18n): opaque FK rationale plus English code comments

- [ ] 11. Migración `message_entities` TEXT→JSONB + GIN (ingestion DB)
      What to do: Migración TypeORM `XXXX-ConvertMessageEntitiesToJsonb`: `ALTER ... USING CASE WHEN NULL/'' THEN '[]'::jsonb ELSE message_entities::jsonb END` + índice GIN + `down()` completo (revert a TEXT + drop index). Actualizar `CryptoNewsMessageEntity.message_entities` a `jsonb` + adaptar lectores (`IngestionCoordinator` transform: string→`JSON.parse` fallback para compatibilidad durante el rollout). Probar up/down en DB dev de ingestion + query `@>` funcional.
      Must NOT do: cambiar shape del payload, rellenar filas inválidas con datos inventados (van a `'[]'`), tocar backend (no tiene esa tabla).
      Parallelization: Wave 4 | Blocked by: — | Blocks: —
      References: `CryptoNewsMessageEntity` (ingestion), `apps/ingestion-telegram/src/telegram/shared/application/coordinators/ingestion.coordinator.ts` (lectura de entities), `apps/ingestion-telegram/src/shared/common/persistence/data-source.ts` + `migrations/`, baseline `1788844970659-BaselineIngestionSchema`, `.kiro/specs/refactor-kol-crypto-news/refactor-recommendations.md` §4 (segunda mitad).
      Acceptance criteria: `migration:run` aplica + `migration:revert` revierte en dev sin pérdida (conteo de filas idéntico); `SELECT ... WHERE message_entities @> '[{"type":"url"}]'` funciona; suites ingestion verdes.
      QA scenarios: happy — up/down + `@>` query vía `psql`; failure — fila con `''` → migra a `'[]'` sin abortar (spec o SQL assert). Evidence .omo/evidence/task-11-refactor-kol-crypto-news.txt
      Commit: Y | feat(ingestion): message entities TEXT to JSONB plus GIN

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy

- Un commit por todo (11 commits), conventional commits, mensajes ya fijados en cada todo.
- Orden: Wave 1 → Wave 4; no se mezclan waves en un mismo commit.
- Las migraciones (T6 DLQ, T11 JSONB) viajan dentro de su propio commit con entity + spec.

## Success criteria

- Los 11 todos completos con evidencias en `.omo/evidence/task-<N>-refactor-kol-crypto-news.txt`.
- Suites completas verdes sin regresiones (backend + ingestion) y `tsc --noEmit` limpio en ambas apps.
- Únicos cambios de comportamiento: 400 en combo inválido de flags, captura DLQ, re-poll adaptativo, recorte disco 90%→48h, columna JSONB. Todo lo demás es docs/comentarios/config.
- Final Verification Wave: F1–F4 todos APPROVE.
