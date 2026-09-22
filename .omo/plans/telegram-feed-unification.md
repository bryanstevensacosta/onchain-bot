# telegram-feed-unification - Work Plan

## TL;DR (For humans)

**What you'll get:** una sola tabla de fuentes + una sola tabla de mensajes + una sola API (`/api/feed/*`), identidad KOL mudada a ingestion-telegram, y el servicio reordenado en 4 BCs (`registry/feed/retention/core`) en vez del `src/telegram/` stutter. Menos archivos, un solo janitor, una sola forma de dar de alta canales.

**Why this approach:** Wave 0 mueve (cero lógica, prueba = suite verde) y fija paths finales; ingestion primero (tablas+API+datos), backend después; RENAME conserva datos y la media se mueve con reescritura de prefijos porque el serving es por glob.

**What it will NOT do:** no toca scoring/reputación, no añade métricas, no da media a KOL, no implementa replay/backfill, no toca tu overview.md.

**Effort:** XL (11 todos 1–11 en 4 waves + final)
**Risk:** High - Wave 0 es moves puros (riesgo bajo, reversible); el riesgo vive en migración destructiva con datos vivos + cambio SSE + gate deploy (ver review adherido)
**Decisions to sanity-check:** Q1-B (texto KOL en SSE, sin media), Q2-A (mudanza completa), A-rutas (rename total incl. HTTP), disco a uploads/feed/media con /api/media intacto

Your next move: approve, or run a high-accuracy review. Full execution detail follows below.

---

> TL;DR (machine): XL effort, High risk, unify kol+crypto-news into telegram-feed (single sources/messages/media tables, /api/feed/*, identity moved to ingestion)

## Scope
### Must have
- Árbol final ingestion-telegram (4 BCs nuevos, `src/telegram/` ELIMINADO incl. fantasma kol/):
  - `src/registry/` — CATÁLOGO (vive años): entity `telegram_feed_sources`, repo, channel-resolver (¿qué type es este canal?), use-cases register/toggle, `sources.controller` (rutas `/api/feed/sources*`), registry.module. El engine le pregunta, nunca le escribe salvo CRUD de operador.
  - `src/feed/` — DATO CALIENTE (vive 72h): entities messages + message_media (misma lifecycle y FK), repos, `feed.controller` de lecturas (`/api/feed/messages`, stats), transformadores API. No sabe quién lo escucha ni quién lo borra.
  - `src/retention/` — CICLO INVERSO (único código con DELETE): janitor two-pass + DiskMonitor + orphan-sweep + retention.module. Triggers diarios/horarios, nunca realtime.
  - `src/core/` — MOTOR: listener MTProto, coordinator, dedup, extractor, safety (flood/sleep/cursors/queue/peer-resolver/client-manager), ports, `message-payload.ts`, `core.module.ts` (renombrado desde telegram.module.ts con rename de clase). Depende de puertos registry/feed/stream/media.
  - Intactos: `src/stream/` (SSE), `src/media/` (plumbing: downloader/controller/builder), `src/shared/` (config/log/cache), `src/health/`, `src/metrics/`, `src/debug/` (sube un nivel). Frontera: a `core/` solo lo que *hace* ingestión; lo que *ayuda* queda en `shared/`.
- `telegram_feed_sources` (channel_id PK, handle, title, type kol|crypto-news, is_active, lifecycle_status, last_ingested_at nullable, added/updated) absorbiendo `crypto_news_sources` + `kols` (datos migrados, no re-creados)
- `telegram_feed_messages` (= crypto_news_messages + columna type; KOL persiste content RAW, media vacío por política) + `telegram_feed_message_media` (rename directo, solo filas crypto-news)
- Controller único `telegram-feed.controller` con las 9 rutas viejas portadas 1:1 (`POST sources`, `GET messages`, `GET messages/channel/:id`, `GET sources`, `GET sources/active/ids`, `GET stats`, PATCH title/handle, PATCH toggle, DELETE); corte duro SIN alias 301 (decisión A) pero CON ventana de compat en deploy: `deploy.yml` gate + `smoke-prod.sh:62-65` se actualizan a `/api/feed/sources` ANTES del corte (pasos ordenados dentro de 5)
- Backfill kols→feed (script idempotente vía API, counts verificados) + coordinator persiste KOL + SSE con texto KOL + lectura local de fuentes (muere BackendChannelProviderService + registration-client)
- Backend: KolController deprecado (501 con hints), drop tabla `kols` vía migración, lecturas identity por HTTP client (`/api/feed/sources?type=kol`), orchestrator/extraction/parsing intactos
- Dedup `isDuplicate()` cableado en coordinator (ambos tipos) + eliminar `SourceAggregatorPort` muerto
- Janitor cubre feed_messages (72h, lock y reloj intactos; sources intacto) + OpenAPI endpoints feed + callers actualizados (backend CryptoNewsIngestionClient + frontend newsroom)
- Disco: `uploads/feed/media/` (mover archivos + 3 join sites + reescritura prefijos file_path); ruta HTTP `/api/media/...` INTACTA

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO métricas/Prometheus/alertas; NO tocar scoring/reputación/known-lists/stats-stub (quedan backend, intactos)
- NO media para KOL (gate isCryptoNewsChannel intacto en espíritu: pasa a ser rama por type)
- NO replay/Last-Event-ID/backfill real; NO PublishingMode ni flags; NO credenciales MTProto ni 2ª instancia
- NO inventar datos en migraciones (filas inválidas→documentado, nunca fabricado); NO `ALTER` con copia (RENAME conserva)
- NO tocar `.kiro/specs/refactor-kol-crypto-news/overview.md` (del operador) ni threads/vip-calls/dashboard más allá de URLs feed
- NO reintento automático DLQ ni cambios al plan anterior (cerrado, Final Wave passed)
- Ley de deploy ingestion-primero (inviolable): desplegar ingestion → verificar `curl -sf http://localhost:3032/api/feed/sources` 200 + sample SSE con texto → SOLO ENTONCES backend (drops/migraciones). Backend-primero = blackout silencioso; legacy-MTProto en prod no sobrevive al DROP (ver 8 precondición USE_SSE).

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD servicios nuevos (feed repo/service, backfill script dry-run) + tests-after integración; Jest co-locado ambos servicios
- Full suites sin regresiones + `tsc --noEmit` limpio ambas apps por todo de código; `migration:show/run/revert` en dev-ingestion DB para cada migración; counts pre/post en cada migración con datos
- Únicos cambios de comportamiento: tabla/API nuevas, texto KOL en SSE, dedup activo, 501 en endpoints viejos. Todo lo demás idéntico
- Evidence: .omo/evidence/task-<N>-telegram-feed-unification.txt

## Execution strategy
### Parallel execution waves
- Wave 0 (reestructura pura, 1 todo bloqueante): 1 moves registry/feed/retention/core + aliases, cero lógica, prueba = tsc + suite verde. Todo lo posterior referencia paths finales.
- Wave 1 (ingestion tablas+API, 4 todos): 2 sources (registry/), 3 messages+media-entity (feed/), 4 plumbing media + disco, 5 controllers (registry/feed) + corte + callers + gate deploy
- Wave 2 (KOL move, 3 todos): 6 backfill kols (tras 2), 7 coordinator persist+SSE+lectura local (tras 3), 8 backend deprecate+HTTP client+drop kols (tras 6 Y 7)
- Wave 3 (cierre, 3 todos): 9 dedup+dead-port (tras 7), 10 janitor(retention/)+OpenAPI+parity (tras 3), 11 docs+datos finales (tras 5,6,7,8 — último)
- Wave 4: Final verification wave F1-F4 en paralelo

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 wave-0 moves | — | 2–11 (paths finales) | — |
| 2 feed_sources (registry/) | 1 | 6 | 3, 4 |
| 3 feed_messages (feed/) | 1 | 7 | 2, 4 |
| 4 media+disco | 1 | — | 2, 3 |
| 5 feed controller + corte + callers | 1, 2, 3, 4 | — | — |
| 6 backfill kols | 2, 5 | 8 | 7 |
| 7 coordinator persist+SSE | 3 | 8 | 6 |
| 8 backend deprecate+client+drop | 6, 7 | — | — |
| 9 dedup+dead-port | 7 | — | 10 |
| 10 janitor+OpenAPI+parity | 3 | — | 9 |
| 11 docs+datos finales | 5, 6, 7, 8 | — | — |

## Todos
> Implementation + Test = ONE todo. Never separate.
> NOTA DE PATHS (post-Wave 0): `telegram/crypto-news/*` → `feed/*` (entities de sources? NO — sources van a `registry/*`) o `retention/*` (scheduler) según 1; `telegram/shared/*` → `core/*`; `telegram/telegram.module.ts` → `core/core.module.ts`; `telegram/debug/` → `src/debug/`. Los todos referencian hogares finales.

- [ ] 1. Wave 0: reestructura a registry/feed/retention/core (solo moves, cero lógica)
  What to do (git mv + rewiring imports, SIN cambiar ni una línea lógica; REGLA SPECS GLOBAL: cada `.ts` movido viaja con su `*.spec.ts` co-locado — dedup, retention scheduler + disk spec, message-payload, repos, transformer specs; nada queda huérfano):
  DISAMBIGUATION (leer 2 veces antes de mover): se mueve SOLO `src/telegram/**`. SE QUEDA: `src/shared/telegram/**` (transformation lib, consumida por backend vía `@ingestion-telegram/telegram/*` — no tocar jamás), `apps/backend/src/telegram/**` + su alias (otro servicio), `src/stream/ media/ shared/ health/ metrics/` (solo re-point de imports que apunten al árbol movido).
  Moves: entities/repos sources → `registry/`; entities/repos messages + message_media → `feed/`; controller crypto-news + transformadores → `feed/` (el split CRUD/lecturas lo hace el 5); retention scheduler + `disk-monitor.service*` → `src/retention/` (crear `retention.module.ts`, rewire owners); use-cases register/toggle → `registry/`; listener adapter, coordinator (+specs), dedup (+spec), extractor, ports, services, domain (`message-payload.ts` + spec), infra safety (client-manager, peer-resolver, last-seen, flood*, sleep, queue) → `src/core/`; `telegram.module.ts` → `src/core/core.module.ts` CON rename de clase `TelegramModule`→`CoreModule`; `telegram/debug/` → `src/debug/` (re-registrar `controllers:[DebugTelegramController]` en `core.module.ts` con import re-apuntado); `BackendChannelProviderService` se MUEVE a `core/` sin cambios (muere en el 7); BORRAR `src/telegram/` vacío (kol/ ya sin ficheros — verificar).
  Rewire completo `app.module.ts`: SharedModule (L8), TelegramModule→CoreModule import+wiring (L13/L118), 3 entities (L14-16 → registry//feed/).
  Aliases (5 configs, before/after en evidence): `tsconfig.json` (quitar `telegram/*`, añadir `feed|core|registry|retention|debug/*`, PRESERVAR pins gramjs), `package.json` moduleNameMapper unit (idem + pins `events|sessions|extensions/Logger`), `test/jest-e2e.json` (idem + pin extra `telegram/client`), `src/shared/common/persistence/data-source.ts` (tsconfig-paths `register()` + entity imports — QUINTA config, la que mata migraciones si se olvida), `tsconfig.build.json` (read-only check: sin paths). Reescribir imports alias Y relativos (`stream/` 4 controllers + 4 specs + e2e `sse-stream-controller.e2e-spec.ts:5`; `telegram.module.ts` ↔ `stream/`; `shared.module.ts` ↔ `crypto-news/`). Tag `pre-wave0` antes de mover.
  Must NOT do: cambiar lógica, firmas, comportamiento (un reviewer verifica `git diff -M -- . ':!*.json'` = SOLO renames + hunks de import-path antes del commit); NO tocar backend, `src/shared/telegram/**`, `stream/media/shared/health/metrics` más allá de re-points; NO borrar `BackendChannelProviderService` (muere en el 7); NO aceptar Wave 0 solo con `npm test` (e2e excluido) ni solo con el grep de alias.
  Parallelization: Wave 0 (bloquea todo) | Blocked by: — | Blocks: 2–11
  References: las 5 configs (`tsconfig.json:18`, `package.json:104-107`, `test/jest-e2e.json:12-16`, `src/shared/common/persistence/data-source.ts:11-30`, `tsconfig.build.json:3` read-only) + `src/app.module.ts:8,13-16,118` (rewire completo) + `src/telegram/` (árbol a vaciar) + `apps/backend/tsconfig.json:23,32-34` (ZONA PROHIBIDA: alias backend + cross-import que apunta al STAY-tree) + `test/sse-stream-controller.e2e-spec.ts:5` (único e2e con import movido).
  Acceptance criteria (cadena todo-o-nada): `grep -rn "from 'telegram/" --include='*.ts' src test` vacío Y `grep -rn "src/telegram" --include='*.ts' src test` vacío (caza relativos) + `npx tsc --noEmit --incremental false` limpio + `npm test` verde salvo los 4 preexistentes + `npm run test:e2e -- sse-stream-controller app` verde + `npm run migration:show` exit 0 contra dev-ingestion DB (prueba la 5ª config) + `git diff --stat -M` similaridad alta.
  QA scenarios: happy — e2e sse-stream-controller verde post-move (consume path movido); failure — import viejo (alias o relativo) → falla compilación y se corrige (la prueba SON los greps vacíos en ambas formas). Evidence .omo/evidence/task-1-telegram-feed-unification.txt (con before/after de las 5 configs)
  Commit: Y en DOS commits (revisabilidad): (1a) `refactor(ingestion): pure git mv telegram into registry-feed-retention-core` (solo moves, cero hunks de import) + (1b) `refactor(ingestion): rewire imports and aliases after flatten` (imports + 5 configs)

- [ ] 2. Tabla telegram_feed_sources + repo + migración con datos news
  What to do: Crear entity `TelegramFeedSourceEntity` (tabla `telegram_feed_sources`: channel_id PK varchar(64), handle nullable, title, type varchar(16) kol|crypto-news, is_active bool, lifecycle_status default ACTIVE, last_ingested_at nullable ← de kols, added/updated) + `TelegramFeedSourceRepository` (findAllActive con filtro opcional por type, findAll, findByChannelId, create, delete — espejar semantics fail-open de CryptoNewsSourceRepository) + migración `CREATE TABLE` + `INSERT INTO ... SELECT ... 'crypto-news'` desde crypto_news_sources + specs. Registrar entidad en app.module ingestion (junto a las viejas, sin borrarlas aún).
  Must NOT do: borrar crypto_news_sources todavía (vive hasta 5); tocar messages/media; cambiar callers.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6
  References (hogares post-Wave 0): `src/registry/infrastructure/persistence/typeorm/entities/crypto-news-source.entity.ts` (shape a espejar), `src/registry/infrastructure/persistence/typeorm/repositories/crypto-news-source.repository.ts` (7 métodos + fail-open), `apps/backend/src/kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts` (columnas a absorber: last_ingested_at), `apps/ingestion-telegram/src/app.module.ts` (registro entidades), baseline `1788844970659-BaselineIngestionSchema`.
  Acceptance criteria: `npm run migration:show` (apps/ingestion-telegram) la lista; run en dev-ingestion clona N rows (`SELECT count(*) FROM crypto_news_sources;` pre/post iguales + `SELECT count(*) FROM telegram_feed_sources WHERE type='crypto-news';` igual a N); `npx jest telegram-feed-source` verde en apps/ingestion-telegram; `npx tsc --noEmit --incremental false` limpio en apps/ingestion-telegram.
  QA scenarios: happy — create+findAllActive(type=kol|news) vía spec; failure — save duplicado → 409 path (spec); queries SQL pre/post pegadas en evidence. Evidence .omo/evidence/task-2-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): telegram feed sources table absorbing news sources

- [ ] 3. Tabla telegram_feed_messages (rename + type) + repo + migración
  What to do: Crear entity `TelegramFeedMessageEntity` (tabla `telegram_feed_messages` = shape crypto_news_messages + columna type varchar(16)) + repo (findRecent/findByChannelId/findByChannelAndMessageId/save/count — espejar) + migración `ALTER TABLE crypto_news_messages RENAME TO telegram_feed_messages` + `ADD COLUMN type` + backfill `type='crypto-news'` + índice GIN `idx_telegram_feed_messages_entities_gin USING GIN(message_entities)` + specs. Registrar junto a la vieja sin borrarla aún. Actualizar `parseMessageEntities`-style readers nuevos al type union. PROCEDIMIENTO ANTI-PÉRDIDA (writes vivos): parar ingestion-telegram durante la ventana (es standalone; backends degradan a reconnect/polls vacíos), migrar, loss-scan post (`SELECT max(ingested_at)` vs hora de parada + counts), arrancar. Registrar en evidence el devwart: con `synchronize:true` en dev el GIN se destruye en cada boot (TypeORM 0.3.30 no expresa `using:gin` en metadata) — staging/prod (`synchronize:false`) lo conservan; workaround dev: `CREATE INDEX IF NOT EXISTS ... USING GIN` tras boot.
  Must NOT do: borrar la tabla vieja (el RENAME la mueve; verificar que ningún reader viejo quede — grep crypto_news_messages tras el cambio); tocar media; cambiar payload SSE aún.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 7
  References (hogares post-Wave 0): `src/feed/infrastructure/persistence/typeorm/entities/crypto-news-message.entity.ts` (jsonb message_entities, índices, unique canal+mensaje), `src/feed/infrastructure/persistence/typeorm/repositories/crypto-news-message.repository.ts` (6 métodos), migración `1789987837661-ConvertMessageEntitiesToJsonb.ts` (patrón up/down + GIN: crear índice GIN equivalente para la nueva tabla), `src/feed/api/http/crypto-news.controller.ts` transformMessageForApi (reader a adaptar).
  Acceptance criteria: migration run en dev: `SELECT count(*)` igual pre/post; `SELECT count(*) FROM telegram_feed_messages WHERE message_entities @> '[{"type":"url"}]'` funciona; `SELECT indexname FROM pg_indexes WHERE tablename='telegram_feed_messages'` muestra el GIN; revert devuelve tabla vieja + datos; `npx jest` suites del repo nuevo verdes en apps/ingestion-telegram; `npx tsc --noEmit --incremental false` limpio.
  QA scenarios: happy — roundtrip mensaje vía repo nuevo; failure — row con entities '' → '[]' sin abortar. Evidence .omo/evidence/task-3-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): telegram feed messages table with type discriminator

- [ ] 4. Media rename + mudanza uploads/feed/media + reescritura prefijos
  What to do: Entity `TelegramFeedMessageMediaEntity` (tabla `telegram_feed_message_media`, mismo shape + FK CASCADE) + migración RENAME + `UPDATE file_path` reescribiendo prefijo absoluto viejo→nuevo SOLO donde matchee, con ENDURECIMIENTO previo: normalizar (backslashes→slash, trailing-slash del UPLOADS_ROOT, rows con ''), assert que `UPLOADS_ROOT` del host de migración == host escritor, y reportar count de no-match CON paso de remediación (re-mover o reescribir manual + orphan scan en AMBAS direcciones: rows-sin-archivo y archivos-sin-row). Mover archivos en disco `{ROOT}/crypto-news/media/*` → `{ROOT}/feed/media/*` (paso idempotente, ingestion parada — misma ventana que 3). Actualizar los 3 join sites (`media-downloader.service.ts:45`, `media.controller.ts:67`, `crypto-news-path-builder.ts` config root) al segmento `feed`. Actualizar `scripts/crypto-news-media-cleanup.mjs:39` regex a dual-match `feed/media` (transición). Ruta HTTP `/api/media/...` INTACTA. Specs actualizados (fixtures con nuevo segmento).
  Must NOT do: cambiar semántica 400/404/cache del controller; tocar KOL (sin media por política); cambiar URLs públicas.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: —
  References: `apps/ingestion-telegram/src/media/application/services/media-downloader.service.ts:44-45`, `apps/ingestion-telegram/src/media/api/http/media.controller.ts:43-67` (glob por {messageId}_{index}.*, NO usa file_path para servir), `apps/ingestion-telegram/src/media/infrastructure/crypto-news-path-builder.ts:53-105` (parse abstrato basename/dirname — reusar), specs media con fixtures `crypto-news/media/...`.
  Acceptance criteria: post-migración boot dev en puerto libre + `curl -s -o /dev/null -w '%{http_code}' http://localhost:3039/api/media/<channel>/<msg>/<idx>` → 200 sirviendo archivo movido; `SELECT count(*) FROM telegram_feed_message_media WHERE file_path LIKE '<nuevo-prefijo>%';` + count no-match en evidence; `npx jest media` verde en apps/ingestion-telegram; `npx tsc --noEmit --incremental false` limpio.
  QA scenarios: happy — curl media tras move; failure — row con file_path no-match → remediada según paso documentado, no aborta. Evidence .omo/evidence/task-4-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): feed media table plus uploads feed directory move

- [ ] 5. Controller /api/feed/* + corte rutas viejas + actualizar callers + gate deploy
  What to do (PASOS ORDENADOS, el orden es el fix): (a) Actualizar `deploy.yml` gate + `smoke-prod.sh:62-65` a `GET /api/feed/sources` (dual-check feed durante la transición) ANTES de borrar nada. (b) Nuevo `telegram-feed.controller` con las 9 rutas portadas 1:1 (`POST sources` 201/409/400, `GET messages`+`GET messages/channel/:id` cap 200, `GET sources`, `GET sources/active/ids`, `GET stats`, PATCH title/handle, PATCH toggle, DELETE) + repo wiring + specs. (c) ELIMINAR viejo `crypto-news.controller` + borrar entities/repos viejos + desregistrar de app.module + DROP SOLO de `crypto_news_sources` residual con pre-check `SELECT count(*) FROM crypto_news_sources;` == 0 (las tablas messages/media viejas ya no existen post-RENAME 3/4: verificar con `SELECT to_regclass('public.crypto_news_messages') IS NULL`, NO dropear). (d) Actualizar callers: backend `CryptoNewsIngestionClient` (base URL) + `queue.controller.ts:302,307` (2º fetch sources) + frontend `shared/api/endpoints.ts:77-84`, `entities/crypto-news/api/crypto-news-queries.ts:99-167`, `entities/threads/**`, rutas filters (`/crypto-news/sources/:channelId/filters`, `/crypto-news/filters/:id`), URLs media en tests + página `/kols` (endpoints.ts:3-7, KolsPage, AddKolModal, useKols, KolLeaderboard → migrar a `/api/feed/sources?type=kol`; vistas reputación intactas). `@ApiTags('feed')` + OpenAPI.
  Must NOT do: alias de compatibilidad en API (corte duro decidido; la compat vive SOLO en el gate durante la transición); tocar lógica filter/match del backend (solo URLs); tocar media route `/api/media`.
  Parallelization: Wave 1 | Blocked by: 1, 2, 3, 4 | Blocks: —
  References (hogares post-Wave 0): viejo `src/feed/api/http/crypto-news.controller.ts` (9 rutas por decorador: :122 POST sources, :162 GET messages, :183 GET messages/channel, :240 GET sources, :264 GET sources/active/ids, :283 GET stats, :316 PATCH, :365 PATCH toggle, :397 DELETE), `src/registry/application/use-cases/register-news-source.use-case.ts` (201/409/400), `deploy.yml:231-239` (gate a actualizar), `scripts/smoke-prod.sh:62-65`, backend `CryptoNewsIngestionClient` + `queue.controller.ts:302,307`, frontend endpoints/queries/threads/newsroom/kols-page, plan anterior (su item 9 OpenAPI, patrón @ApiTags).
  Acceptance criteria: boot dev ingestion puerto libre + `curl -s -o /dev/null -w '%{http_code}' http://localhost:3039/api/feed/sources` → 200 y `curl .../api/crypto-news/sources` → 404; `npx jest crypto-news.controller telegram-feed` verde en apps/ingestion-telegram; backend specs tocadas verdes; `tsc -b` frontend verde; `npx tsc --noEmit --incremental false` limpio ambas apps.
  QA scenarios: happy — CRUD fuente vía curl (`POST /api/feed/sources` 201, `GET` lista, `PATCH toggle`, `DELETE`); failure — POST duplicado → 409, PATCH inexistente → 404, `GET /api/crypto-news/sources` → 404 post-corte. Evidence .omo/evidence/task-5-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): unified feed API replacing crypto-news routes

- [ ] 6. Backfill kols → feed_sources type=kol (idempotente, con counts)
  What to do: Script `scripts/backfill-kols-to-feed.ts` (ingestion-telegram): lee backend `GET /telegram-kol/identity/kols` (lista completa con lifecycle/handle/title) y hace `POST /api/feed/sources/batch` (crear endpoint batch idempotente por channel_id: upsert por PK — si existe, actualiza handle/title/lifecycle, no duplica) mapeando lifecycle→lifecycle_status, isActive→is_active. Corre en droplet con acceso a ambos + verifica counts (backend kols count == feed type=kol count) + reporta diffs. Specs del endpoint batch.
  Must NOT do: tocar backend (solo lee); borrar nada; escribir fuera de scripts/ + controller batch.
  Parallelization: Wave 2 | Blocked by: 2, 5 | Blocks: 8
  References: backend `GET telegram-kol/identity/kols` (KolController list), ingestion `POST /api/feed/sources` (5), `kol.seed.ts` 45 entries (volumen esperado mínimo), plan anterior (patrón backfill idempotente).
  Acceptance criteria: dry-run lista N sin escribir; run real deja counts iguales (`SELECT count(*) FROM kols;` backend vs `SELECT count(*) FROM telegram_feed_sources WHERE type='kol';` — asserts pegados en evidence) + PARIDAD A NIVEL COLUMNA en sample (`SELECT channel_id, handle, title, lifecycle_status, last_ingested_at FROM telegram_feed_sources WHERE type='kol' ORDER BY channel_id LIMIT 20;` vs backend `SELECT kol_id, handle, title, lifecycle_status, last_ingested_at FROM kols ...` — diff vacío); re-run no duplica (upsert probado).
  QA scenarios: happy — counts + sample match; failure — backend caído → script aborta con error claro sin escribir parcial (o rollback por batch). Evidence .omo/evidence/task-6-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): backfill KOL channels into feed sources

- [ ] 7. Coordinator persiste KOL + SSE con texto + lectura local de fuentes
  What to do: En `MessagePersistenceCoordinator.route()`: rama kol persiste en `telegram_feed_messages` (type='kol', content=raw.text, sin media — política C2) + `payload.text = raw.text` en SSE (Q1-B) + clasificar por `feed_sources(type)` en vez de newsIds-membership. `TelegramModule.refreshChannels()`: leer `feedSourceRepo.findAllActive()` local (muere `BackendChannelProviderService` — borrar fichero + spec + wiring) y `startListening` clasifica por type de la row; DIAGNOSTICAR Y CORREGIR gap 15 (`subscribe()` single-listener lanza "already running" ante refresh: reusar listener o reconstruir snapshot peers — spec "añadir canal sin restart"). Cablear `isDuplicate()` en route() para AMBOS tipos (C5) con specs (duplicado realtime+polling → 1 sola fila). Actualizar `MessagePayload` docs/comments (text presente ambos tipos). ENMIENDA ToS (Q1-B por escrito): crear `docs/architecture/adr-kol-raw-text.md` (decisión, blast radius, fecha) + reescribir specs invariante (`transformation-import.spec.ts:53`, adapter specs backend, message-payload specs, e2e full-message-flow) a la nueva forma + REDACTAR texto crudo de `[PAYLOAD-TRANSFORM-DEBUG]` (logs en disco = store de texto; la redacción es parte de este todo) + verificar WS `telegram.message.ingested` NO lleva texto KOL a browsers (assert en spec o evidence).
  Must NOT do: descargar media KOL (gate intacto como rama por type); tocar retention; tocar backend (8); cambiar heartbeat/SSE framing.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 8
  References (hogares post-Wave 0): `src/core/application/coordinators/message-persistence.coordinator.ts` (rama persist, buildMediaPayload), `src/core/domain/types/message-payload.ts` (shape), `src/core/core.module.ts` refresh/startListening (115-264, cold-start-0: updateSubscribedChannels también en frío + gap 15), `backend-channel-provider.service.ts` (a borrar), `deduplication.service.ts` isDuplicate (hoy 0 callers prod), adapter gate 328-332 (media solo news — mantener), `WsGateway.EVENT_MAP` backend (verificar payload WS sin texto).
  Acceptance criteria: mensaje KOL → 1 fila type=kol con content + evento SSE con text (spec integración); duplicado → 1 fila (spec); provider borrado (`grep -rn 'BackendChannelProvider' apps/ingestion-telegram/src` vacío); spec "añadir canal sin restart" verde (gap 15); spec cold-start (DB vacía → [] + updateSubscribedChannels en frío, sin crash); specs invariante reescritas verdes; `npx jest message-persistence telegram stream` verde en apps/ingestion-telegram; `npx tsc --noEmit --incremental false` limpio.
  QA scenarios: happy — flujo kol E2E a nivel coordinator (spec integración existente como base); failure — refresh con listener corriendo → reuso limpio sin throw (spec). Evidence .omo/evidence/task-7-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): persist KOL raw plus local feed channel registry

- [ ] 8. Backend: deprecate identity (501) + HTTP client + drop kols con gate
  What to do: `KolController` → 501 con hints a `/api/feed/*` (CÓDIGO ÚNICO 501 en todo el plan, consistente con split anterior); nuevo `FeedIdentityHttpClient` (infra, GET `/api/feed/sources?type=kol`) implementando SOLO lecturas de `KolRepository` (findById/findAll/findActive — writes tiran `GoneError` con hint); rewire de los 7 consumidores con paths exactos: `kol/identity/application/handlers/kol-ingestion-orchestrator.use-case.ts` (findById+save-lastIngested→ OJO: el write de last_ingested_at muere con el puerto — mover a no-op documentado o a feed PATCH si el API lo expone; decidir en código y evidenciar), `kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.ts` (findAll), `dashboard/application/handlers/get-dashboard-kpis.use-case.ts` (findAll), `telegram/ingestion/shared/application/message-routing.service.ts` (bootstrap findAll+isActive), `telegram/ingestion/shared/api/http/ingestion-health.controller.ts` (findAll), `shared/common/dev-backfill.hook.ts` (findAll+backfillKol), `telegram/ingestion/shared/infrastructure/backend-registration-client.service.ts` (BORRAR fichero + keep-alive); borrar `TypeOrmKolRepository`, in-memory impl, `KolEntity` de PERSISTED_ENTITIES (count 48→47), `KolSeeder` residues, metadata-cache si `grep` lo muestra huérfano; borrar o shims-501 `RegisterKol/SetKolLifecycle/ListKols/GetKol/ListActiveKolIds` (shims con mensaje, no borrado silencioso); migración DROP kols SOLO tras pre-check paridad (`SELECT count(*) FROM kols;` == `SELECT count(*) FROM telegram_feed_sources WHERE type='kol';` en ingestion DB + sample columnas 6) + precondición `USE_SSE_INGESTION=true` verificada en `.env.staging`/`.env.production*` (grep; si prod corre legacy-MTProto, ESCALAR al operador: legacy lee KolRepository y pasaría a HTTP — funciona por el puerto, pero registrar la decisión). Specs (HTTP client con mock fetch, fail-open [] sin tumbar boot).
  Must NOT do: tocar orchestrator/extraction/parsing (siguen recibiendo texto por SSE), reputación/scoring/known-lists (solo cambian de lector, no de lógica), Source VO en normalization (queda), stats-stub (queda); NO 410 en ningún sitio (501 único).
  Parallelization: Wave 2 | Blocked by: 6, 7 | Blocks: —
  References: `kol/identity/api/http/kol.controller.ts` (6 rutas: GET kols, GET kols/active/ids, POST kols, GET kols/:id, POST lifecycle, POST backfill), `kol/identity/application/handlers/*.use-case.ts`, `kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts` + `typeorm-kol.repository.ts` (findActive isActive+lifecycle), `shared/common/persistence/entities.ts` (count 48), los 7 consumidores listados arriba, `shared/common/persistence/migrations/1860000000001-DropIngestionOwnedCryptoNewsTables.ts` (patrón drop con FKs).
  Acceptance criteria: `GET /telegram-kol/identity/kols/active/ids` → 501 con hint a feed (spec HTTP o curl contra boot); `npx jest kol-reputation.scheduler message-routing get-dashboard-kpis dev-backfill` verdes con client mockeado; migración drop aplica (`\d kols` → no existe) y revierte (tabla vacía recreada) en dev; `npx jest` full backend verde; `npx tsc --noEmit --incremental false` limpio en apps/backend.
  QA scenarios: happy — scheduler itera KOLs vía HTTP mock; failure — ingestion caída → client fail-open [] (spec) sin tumbar boot; failure — pre-check paridad falla → migración NO corre (assert en evidence). Evidence .omo/evidence/task-8-telegram-feed-unification.txt
  Commit: Y | refactor(backend): deprecate KOL identity, read via feed API

- [ ] 9. Dedup total + eliminar puerto muerto + media-policy test
  What to do: Verificar `isDuplicate()` activo en route() para kol y news (7 lo cablea; este todo lo endurece: `MAX_CACHE_PER_CHANNEL`, prune, specs de ventana) + test explícito "KOL nunca descarga media" (adapter gate por type, spec con mensaje kol con media → 0 descargas) + BORRAR `SourceAggregatorPort` + `DefaultSourceAggregator` + `SourceModule` (0 consumidores verificados) + borrar `DeduplicationService` viejo si queda duplicado con el backend `shared/deduplication` (solo si es código muerto confirmado por grep; si no, dejarlo). Specs.
  Must NOT do: tocar dedup del backend (crypto-news/threads, en uso); cambiar thresholds sin evidencia; tocar retention.
  Parallelization: Wave 3 | Blocked by: 7 | Blocks: —
  References: `src/core/application/services/deduplication.service.ts` (isDuplicate 45-70, MAX_CACHE 10000 — el item 7 lo cablea, aquí endurecer + specs ventana), `source-aggregator.port.ts` + `default-source-aggregator.ts` + `source.module.ts` (0 consumidores — re-verificar con `grep -rn SourceAggregatorPort --include='*.ts' apps/backend/src` antes de borrar), adapter gate 328-332, `kol/source/domain/value-objects/source.vo.ts` (SE QUEDA — atribución local de normalization).
  Acceptance criteria: `grep -rn SourceAggregatorPort --include='*.ts' apps/backend/src` vacío; spec KOL-con-media → 0 downloads (`npx jest telegram-mtproto-listener` o suite del gate); `npx jest deduplication` verde; `npx tsc --noEmit --incremental false` limpio ambas apps.
  QA scenarios: happy — duplicado kol realtime+polling → 1 fila; failure — cache llena → prune sin crash (spec). Evidence .omo/evidence/task-9-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): wire dedup plus drop dead source port

- [ ] 10. Janitor feed + OpenAPI + paridad de datos pre/post
  What to do: Retention scheduler: renombrar refs a `telegram_feed_messages`/`telegram_feed_message_media` (misma semántica: daily 3AM `cleanupExpiredContent` + hourly `checkDiskAndCleanup` con `DiskMonitorService` y aggressive 48h — CITAR el schedule real, no "two-pass 72h" a secas; lock `9_421_373`, clock ingested_at; sources intacto — assert con `grep -c telegram_feed_sources` == 0 en el scheduler) + spec. OpenAPI: tags `feed` en `telegram-feed.controller` + `main.ts` description actualizada. Paridad: queries pre/post por tabla (counts + `SELECT count(*) ... WHERE type='kol'` vs `'crypto-news'`) en evidence. `migration:show` limpio (sin pendientes) en dev-ingestion.
  Must NOT do: cambiar ventanas/thresholds del janitor NI del DiskMonitor (frontera: este todo renombra refs, no toca lógica de limpieza); tocar /api/media.
  Parallelization: Wave 3 | Blocked by: 3 | Blocks: —
  References: `src/retention/crypto-news-retention-cleanup.scheduler.ts` (two-pass, batch 1000, orphan sweep, daily 3AM + hourly disk check), `src/main.ts` setupCryptoNewsDocs (actualizar título/tags), specs retention existente (+ disk spec).
  Acceptance criteria: `npx jest retention-cleanup` verde con nuevos nombres; boot dev + `curl -s http://localhost:3039/api/docs-json | grep -c '/api/feed/'` ≥ 8 paths; paridad counts en evidence; `npx tsc --noEmit --incremental false` limpio.
  QA scenarios: happy — tick janitor sobre fila expirada feed → borrada (spec); failure — fila source vieja presente → nunca borrada por janitor (spec). Evidence .omo/evidence/task-10-telegram-feed-unification.txt
  Commit: Y | feat(ingestion): feed retention plus OpenAPI and data parity

- [ ] 11. Docs nuevas + verificación final de datos + cierre
  What to do: Crear `docs/architecture/telegram-feed.md` (diseño: 1 tabla sources + type policy + rutas + ownership) + `docs/guides/ADD_FEED_SOURCE.md` (alta kol y news + rollback) + actualizar `docs/configuration/CRYPTO_NEWS_ENV_REFERENCE.md` (añadir sección feed vars si aparecen nuevas; si no, nota de rename). Verificación final: counts totales (feed_sources por type, feed_messages por type, media rows, archivos en `uploads/feed/media` vs rows) + spot-check contenido KOL crudo presente + SSE sample con texto. NO tocar overview.md del operador.
  Must NOT do: editar overview.md ni READMEs existentes más allá de lo listado; inventar datos; dejar archivos viejos huérfanos (grep final `crypto_news_sources|crypto-news-sources|IngestionCoordinator|BackendChannelProvider` vacío en src).
  Parallelization: Wave 3 (último de la wave) | Blocked by: 5, 6, 7, 8 | Blocks: —
  References: docs de la Wave anterior como patrón, rutas feed del item 5, tabla telegram_feed_sources para counts por type.
  Acceptance criteria: docs existen + `npm run docs:check` exit 0; `grep -rn 'crypto_news_sources\|crypto-news-sources\|BackendChannelProvider' --include='*.ts' apps/backend/src apps/ingestion-telegram/src apps/frontend/src` vacío; counts finales (`SELECT type, count(*) FROM telegram_feed_sources GROUP BY type;` + messages por type + media rows + `find uploads/feed/media -type f | wc -l` vs rows) en evidence.
  QA scenarios: happy — walkthrough guía contra código (cada paso mapea a ruta real verificada por grep); failure — ruta citada sin reader → corregir antes de cerrar. Evidence .omo/evidence/task-11-telegram-feed-unification.txt
  Commit: Y | docs(feed): unified telegram feed architecture and guides

## High-accuracy review (2026-09-21) — FIXES APLICADOS + ROUND 2
> Round 1 (momus APPROVE WITH CHANGES + metis pre-mortem): integrado arriba. Round 2 (momus re-review + metis delta Wave 0): nuevo APPROVE WITH CHANGES centrado en item 1 — reescrito completo abajo (disambiguation, 5 configs, e2e, rewire app.module, debug registration, spec rule, 2 commits) + refs a hogares finales en items 2,3,4,7,9,10.
> NOTA DE NUMERACIÓN: esta sección conserva los IDs originales T0–T10 (= items 1–11 del plan tras el renumerado).
> momus VERDICT fue APPROVE WITH CHANGES + metis pre-mortem. Los 7 MUST-FIX + 2 NITs + mitigaciones están integrados arriba (matriz, T4 con gate deploy y 9 rutas, DROPs con pre-checks, aceptaciones ejecutables, inventarios exactos, 501 único, gap 15 + cold-start en T6, GIN wart en T2, schedule real en T9). Detalle original abajo para auditoría.

### Momus VERDICT: APPROVE WITH CHANGES
1. [MUST-FIX] T4 dice "8 rutas" pero el controller viejo tiene 9 (falta `GET sources/active/ids`): listar las 9 y decidir su destino (portar a `/api/feed/sources/active/ids` o eliminar con grep de consumidores justificado).
2. [MUST-FIX] Matriz contradictoria: T8 → Blocked by T6; T10 → Blocked by T4,T5,T6,T7; T4 → Blocked by T1,T2,T3 (+ tabla de dependencias).
3. [MUST-FIX] DROPs inseguros: T4 solo DROPEA `crypto_news_sources` residual con pre-check `SELECT count(*)` (query exacta + DB); messages/media viejas no existen post-RENAME (verificar `to_regclass`, no DROP); T7 añade pre-check paridad counts antes del DROP kols.
4. [MUST-FIX] Aceptaciones ejecutables: en T1–T10 sustituir "suites verdes" por comandos exactos (`npm test -- <spec>` + `tsc`), cada curl con puerto+path copiable, cada count con SQL exacto (incl. probe `@>` y `file_path LIKE`).
5. [MUST-FIX] Inventarios: T7 lista paths exactos de los 7 consumidores (no "18 archivos"); T4 lista callers frontend exactos (`shared/api/endpoints.ts`, `entities/crypto-news/api/crypto-news-queries.ts`, `entities/threads/**`, rutas filters, URLs media).
6. [MUST-FIX] Un solo código de deprecación: 501 con hint (no 410/501); gate de deploy explícito (ingestion PRIMERO, verificar `GET :3032/api/feed/sources`, SOLO ENTONCES drops backend).
7. [MUST-FIX] T6 diagnostica gap 15 (restart "already running") con spec "añadir canal sin restart"; cold-start-0 promovido a acceptance propio.
8. [NIT] T2 registra el devwart GIN-vs-synchronize + workaround en evidence.
9. [NIT] T9 cita schedule real (daily 3AM + DiskMonitor 48h) y la frontera con Must NOT DiskMonitor.

### Metis TOP-3 (pre-mortem)
1. T4 hard-cut mata el deploy gate (`deploy.yml:231` curlea la ruta borrada → todos los deploys backend futuros abortan, incl. rollbacks). Mitigación AUSENTE: ventana compat 301/alias ≥1 release + actualizar gate + `smoke-prod.sh:62-65` ANTES de T4.
2. Backend-first o prod-en-MTProto-legacy = blackout silencioso total (canales [] + reputación congelada + alpha-path a oscuras; legacy crashea con 42P01 tras DROP kols). Mitigación AUSENTE: gate de orden ingestion→backend, arista T6-before-T7 en matriz, precondición `USE_SSE_INGESTION=true` en staging/prod.
3. Pérdida silenciosa en RENAMEs (writes vivos + cursor avanzado + persist-error tragado) + huérfanos media (stale file_path absolutos + janitor already-gone→delete + race con move). Mitigación PARCIAL: falta writer-freeze (o dual-write) + loss-scan intra-ventana + remediación no-match + normalización previa file_path.
- Rollback: punto de no retorno = DROP kols (T7) + corte rutas (T4) combinados con gate roto. Todo más riesgoso: T4 (destruye el mecanismo de recuperación).
- Blast radius SSE-text: specs invariante (`transformation-import.spec.ts:53`, adapter specs, message-payload specs, e2e full-message-flow) deben reescribirse EN T6; `[PAYLOAD-TRANSFORM-DEBUG]` mete texto crudo en logs en disco (nueva superficie ToS: redactar o aceptar); verificar WS `telegram.message.ingested` no lleva texto a browsers; enmendar fix-1 (ADR o docs-money).
- Acoplamientos ocultos a añadir: `queue.controller.ts:302,307` (2º fetch sources), frontend `/kols` page (endpoints.ts:3-7 — migrar a feed o dropear UI con manejo 501), `scripts/crypto-news-media-cleanup.mjs:39` (regex a `feed/media`, dual-match en transición), T5 paridad a nivel columna (no solo counts).

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
- Wave 0 primero (1 commit `refactor(ingestion): flatten telegram into registry-feed-retention-core`), luego un commit por todo (11) + final wave checkpoint; convencionales; orden Wave 0→3; migraciones viajan con su todo.
- Orden de DEPLOY (no solo de código): T4 actualiza `deploy.yml` gate + `smoke-prod.sh` a feed ANTES de borrar rutas; ingestion despliega y se verifica (`GET :3032/api/feed/sources` 200 + SSE sample con texto KOL) ANTES de cualquier drop backend (T7); T7 verifica precondición `USE_SSE_INGESTION=true` en staging/prod antes del DROP kols.

## Success criteria
- 11 todos completos con evidencias; suites verdes + tsc limpio; migración show limpio; counts + sample-column parity; deploy gate verde en feed; Final Wave F1–F4 APPROVE.
- Únicos cambios de comportamiento: tablas/API feed, texto KOL en SSE, dedup activo, 501 endpoints viejos, uploads/feed. Todo lo demás idéntico.
