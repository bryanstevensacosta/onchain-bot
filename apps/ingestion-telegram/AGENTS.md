# Ingestion Service — AGENTS.md

**Per-env Telegram MTProto ingestion → SSE fan-out.** Una sesión MTProto POR instancia/env — dev local, staging y prod corren la misma imagen, cada una con SU triple (jamás compartida). Puerto **3031** dentro del container (hosts: dev `:3031`, staging `:3033`, prod `:3032`). NestJS 11 + TypeScript 5.7 + `telegram` (GramJS) + Redis + Postgres (TypeORM) + Pino + Prometheus.

> Nombres canónicos por env (**P31**, 2026-09-25): dev = `ingestion-telegram` local (`:3031`); staging = `ingestion-telegram-staging` (`:3033`); prod = `ingestion-telegram` (`:3032`, alias docs-only `ingestion-telegram-production`). Prohibido "twin" para la instancia.

> Credenciales MTProto viven **SOLO en el `.env` de CADA instancia** (`INGESTION_TELEGRAM_*`). Nunca en `apps/backend/.env`, nunca compartidas entre envs → evita `AUTH_KEY_DUPLICATED`.

> Versión v1.2.0 (source of truth: `package.json` + `CHANGELOG.md`; verificado 2026-09-24).

## Doc set purpose (DB.md / BC.md / CHANGELOG.md / AGENTS.md)

| Doc            | What it is for                                                                                                                                                                                                      | Update rule                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DB.md`        | Plain-words English reference: databases per env + the 3 tables + columns, non-Postgres state, files, schema history.                                                                                               | Update when any table, column, DB name, Redis key, on-disk layout, or migration changes.                                          |
| `BC.md`        | Plain-words English guide per area (core, feed, registry, stream, retention, media, avatar, shared, health/metrics/debug): what/how with paths, HTTP APIs with inputs/outputs, classes + technical names explained. | Update when any area gains/loses an endpoint, changes behavior, or adds/removes a class. Keep every cited path real.              |
| `CHANGELOG.md` | Manual release history + `Unreleased` tracker for this branch.                                                                                                                                                      | Every behavior or schema change lands an `Unreleased` entry first (continuous updates of the 4-doc set, never batch-at-release).  |
| `AGENTS.md`    | Contributor knowledge base (this file): commands, wiring, gaps, invariants, env vars — the working reference.                                                                                                       | Update alongside code changes; keep the PURPOSE table above and the gaps list truthful (no reintroducing fixed gaps as features). |

## Comandos

```bash
# Desde la raíz: `npm run dev:ingestion` (:3031, con port-cleanup). Desde aquí
# (o root con -w @onchain-bot/ingestion-telegram; también hay
# `lint/build/test:ingestion` en el root)
npm run start:dev   # watch, puerto 3031
npm run build && npm run start:prod  # prod: node dist/main
npm test            # jest unit (*.spec.ts, timeout 30s, --forceExit)
npm run test:e2e    # jest --config ./test/jest-e2e.json
npm run test:cov    # coverage → ./coverage
npm run lint        # eslint "{src,test}/**/*.ts" --fix
npm run format      # prettier src + test
npm run telegram:gen-session  # genera INGESTION_TELEGRAM_MTPROTO_SESSION (scripts/telegram-gen-session.ts)
```

Env: `ConfigModule.forRoot({ envFilePath: ['.env.dev', '.env'] })` — `.env.dev` gana. `jest.setup.ts` fuerza `DATABASE_ENABLED=true`, `NODE_ENV=test`.

Boot: tsconfig paths are compile-only — tsc emits alias specifiers verbatim, so `src/main.ts` registers them at runtime via `tsconfig-paths` before any imports; without it the compiled `dist` boot crashes with `Cannot find module`.

## Estructura

```
src/
├── main.ts                          # bootstrap: Pino, ValidationPipe, CORS→:3030, listen 3031
├── app.module.ts                    # root: Config/EventEmitter/Schedule/TypeORM/Pino + ApiKeyGuard global + Shared/Stream/Media/Health/Metrics/Core
├── app.module.spec.ts
├── core/                            # MTProto + coordinator (antes telegram/shared; rename crypto→feed 2026-09-25)
│   ├── core.module.ts               # importa + re-exporta RetentionModule; refreshChannels 5min, channelTypeMap kol|crypto-news (valor wire preservado)
│   ├── shared.module.ts             # @Global: MTProto + coordinator + anti-ban + media + redis
│   ├── ports/telegram-listener.port.ts
│   ├── api/mtproto/telegram-mtproto-listener.adapter.ts (+ media-policy/polling specs)
│   ├── application/services/deduplication.service.ts (+ .spec.ts)
│   ├── application/coordinators/message-persistence.coordinator.ts (+ .integration.spec.ts)
│   ├── domain/types/message-payload.ts (+ .spec.ts)  # messageType 'kol'|'crypto-news' = valor de wire/DB PRESERVADO post-rename
│   ├── infrastructure/config/ingestion-safety.config.ts
│   └── infrastructure/services/ (telegram-client-manager, telegram-peer-resolver, last-seen-manager, flood-wait-handler, flood-wait-counter, sleep-window, message-queue)
├── feed/                            # reads de feed (rename 2026-09-25)
│   ├── api/http/feed.controller.ts (+ .spec.ts)  # GET messages | messages/channel/:channelId | stats
│   └── infrastructure/persistence/typeorm/ (entities/telegram-feed-message{,-media}.entity.ts, repositories/telegram-feed-message.repository.ts (+ .spec.ts))
├── registry/                        # alta + sources (rename 2026-09-25)
│   ├── api/http/sources.controller.ts (+ .spec.ts)  # POST sources | sources/batch, GET sources | sources/active/ids
│   ├── application/use-cases/register-news-source.use-case.ts  # fetch-ONCE avatar P19 (@Optional KolAvatarService, fire-and-forget) + P58 dual-write (@Optional MetadataService.adoptRegistryRow)
│   └── infrastructure/persistence/typeorm/ (entities/telegram-feed-source.entity.ts (+ avatar_path/avatar_updated_at, migración 1790300000000), repositories/typeorm-feed-source.repository.ts (+ .spec.ts))
├── retention/                       # janitor + disk (archivos crypto-news-retention-* renombrados a feed-* 2026-09-25; clase FeedRetentionCleanupScheduler conserva nombre)
│   ├── retention.module.ts          # importa SharedModule + AvatarModule (deprecated) + MetadataModule; expone Feed/Sources controllers + use-case + janitor + DiskMonitor
│   └── infrastructure/scheduling/ (feed-retention-cleanup.scheduler.ts (+ .spec.ts + .disk.spec.ts), disk-monitor.service.ts (+ .spec.ts))
├── stream/                          # SSE fan-out (per-env: stream abierto, sin gate)
│   ├── stream.module.ts             # providers: StreamService (tracker/broadcast/registry/backfill/breaker ELIMINADOS per-env T4)
│   ├── stream.config.ts (+ .spec.ts) # SSE_HEARTBEAT_INTERVAL_MS + reconnect knobs (KEEP)
│   └── api/http/sse-stream.controller.ts (+ .spec.ts)  # GET /api/ingestion/stream abierto (sin backendId, sin register)
│   └── application/services/stream.service.ts         # addClient/removeClient/broadcast/heartbeat @Cron 30s
├── feed-media/                     # descarga + serving de adjuntos (antes src/media/, unificación 2026-09-27; clases Media* conservan nombre)
│   ├── media.module.ts              # importa SharedModule (MediaDownloaderService vive ahí)
│   ├── api/http/media.controller.ts (+ .spec.ts + media-serve-feed-media-root.spec.ts)
│   ├── application/services/media-downloader.service.ts  # disco: uploads/feed-media/ (unificación 2026-09-27)
│   └── infrastructure/feed-path-builder.ts (+ .spec.ts)  # antes crypto-news-path-builder.ts
├── avatar/                          # DEPRECATED P58 (absorbed into metadata/; deletion after staging green) — KOL channel avatars (Tramo 1, todo 13, P19+P29)
│   ├── avatar.module.ts             # importa SharedModule; lo importa RetentionModule (fetch-once al alta)
│   ├── avatar.constants.ts          # KOL_AVATAR_DIR_NAME='avatar', '.jpg', placeholder SVG, kolAvatarUrlFor, sanitizeAvatarChannelId + sanitizeAvatarHandle/avatarFileNameFor/sourceUrlFor (P57 todo 12)
│   ├── kol-avatar-photo.port.ts     # @deprecated → MetadataPhotoPort; KolAvatarPhotoPort.fetchChannelPhoto → Buffer|null
│   ├── kol-avatar.service.ts        # @deprecated → MetadataService; fetchOnce/refresh(channelId, handle?) + backfillMissing + findAvatarFile/migrateFilename + bookkeeping avatar_path/avatar_updated_at
│   ├── kol-avatar.controller.ts (+ .spec.ts + .backfill.spec.ts + .backfill-endpoint.spec.ts)  # @deprecated routes (Deprecation/Sunset/Link headers) — GET /api/kol-avatar/:channelId + POST .../refresh[?handle=] + POST .../backfill
│   └── mtproto-avatar-photo.adapter.ts (+ .spec.ts)  # downloadProfilePhoto vía FloodWaitHandler.withRetry('kol-avatar', …)
│   └── kol-avatar.service.spec.ts + kol-avatar.janitor.spec.ts (pin de exclusión del janitor) + avatar-filename.spec.ts (P57 nombres + colisiones + t.me)
├── metadata/                        # central channel metadata (P58, absorbs avatar/)
│   ├── metadata.module.ts           # importa SharedModule; lo importa RetentionModule (dual-write) + AppModule
│   ├── metadata-kind.ts (+ .spec.ts) # MetadataKind/MetadataPeerType taxonomy + peerTypeForKind + isSubscribableMetadataKind (kind matrix)
│   ├── metadata.constants.ts        # re-exports avatar constants (single owner) + metadataAvatarUrlFor + avatarDeprecationHeaders
│   ├── channel-metadata.entity.ts   # TelegramChannelMetadataEntity → telegram_channel_metadata (phone select:false, never exposed)
│   ├── metadata.repository.ts       # MetadataRepository (phone excluded by the entity; fail-open reads)
│   ├── metadata-photo.port.ts       # MetadataPhotoPort.fetchChannelPhoto → Buffer|null (absorbed contract)
│   ├── metadata.service.ts          # MetadataService: identity resolve/refresh/adoptRegistryRow + absorbed avatar fetch-serve (fetchOnce/refresh/backfillMissing/findAvatarFile/migrateFilename)
│   ├── metadata.controller.ts       # GET /api/metadata/:channelId + GET .../:channelId/avatar (canonical) + POST .../refresh + POST .../backfill
│   └── mtproto-metadata-photo.adapter.ts  # downloadProfilePhoto vía FloodWaitHandler.withRetry('metadata-photo', …) (P29)
│   └── metadata-absorption.spec.ts (parity) + metadata-no-dup.spec.ts (phone/mirror guards)
├── health/                          # health + readiness/liveness + channels
│   ├── health.module.ts
│   └── api/http/health.controller.ts (+ .spec.ts)
├── metrics/                         # Prometheus
│   ├── metrics.module.ts
│   ├── metrics.service.ts (+ .spec.ts)
│   └── api/http/metrics.controller.ts (+ .spec.ts)
├── shared/
│   ├── common/config/app.config.ts (+ .spec.ts)  # registerAs('app'), class-validator, safety defaults
│   ├── common/cache/redis.service.ts              # cursor tracking / dedup
│   ├── common/logging/ (structured-logger.service.ts + .spec.ts, logging.module.ts, index.ts)
│   ├── common/persistence/ (data-source.ts + migrations/ incl. 1790300000000-KolAvatarColumns + 1790600000000-ChannelMetadata)
│   ├── media/                       # Shared media abstractions
│   │   ├── core/ (base-telegram-media-downloader.ts, base-file-system-adapter.ts, base-media-http-server.ts, base-media-path-builder.ts, base-media-retention-policy.ts)
│   │   ├── types/media-metadata.ts
│   │   ├── utils/ (+ specs)
│   │   └── index.ts                 # barrel export
│   └── transformation/     # extractors/transformers renombrados crypto-news-* → feed-* 2026-09-25
│       ├── extractors/ (feed-text-extractor.ts, kol-text-extractor.ts, telegram-entity-normalizer.ts, telegram-media-extractor.ts + specs)
│       └── transformers/ (feed-message-transformer.ts, kol-message-transformer.ts + specs)
├── debug/debug-telegram.controller.ts
test/  (app.e2e-spec.ts, full-message-flow, stream-reconnection, load-test-concurrent-clients, metrics, E2E-TESTING-GUIDE.md, jest-e2e.json)
scripts/ (telegram-gen-session.ts, check-telegram-message.ts)
Raíz: package.json (@onchain-bot/ingestion-telegram), Dockerfile (multi-stage node:22-alpine, dumb-init, user nodejs, HEALTHCHECK :3031/api/health), .env{,.example,.production.template,.backup-before-regen}, eslint.config.mjs, nest-cli.json (deleteOutDir), tsconfig{,.build,.eslint}.json, jest.setup.ts, uploads/ (feed-media/{channelId}/{messageId}_{index}.ext + avatar/{channelId}.jpg), coverage/, dist/
```

## Módulos (app.module.ts)

| Módulo                                                                                                               | Provee                                                                                                                                                                                                                                                                                                                                                                                                                    | Notas                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SharedModule` (`core/shared.module.ts`, `@Global`)                                                                  | RedisService, IngestionSafetyConfig, TelegramFeedSourceRepository, MetadataRepository (P58), TelegramClientManager, `TelegramListenerPort`→`TelegramMtprotoListenerAdapter`, DeduplicationService, MessagePersistenceCoordinator, LastSeenManager, FloodWaitHandler/Counter, SleepWindowService, TelegramPeerResolver, MessageQueue, MediaDownloaderService, TelegramMediaExtractorService                                | Evita circulares con Core/Retention/Media. Wiring: `AppModule` → `CoreModule` → (`SharedModule` + `RetentionModule`)                                                                                                                                          |
| `CoreModule` (`core/core.module.ts`)                                                                                 | `TelegramMtprotoListenerAdapter` (subscribe/polling 30 s), `onModuleInit()` + `refreshChannels()` (5 min, swap snapshot + `lastSeen.load(added)`) + `startListening()` + clasificación kol\|feed por `channelTypeMap`                                                                                                                                                                                                     | Sin canales → warn + no escucha; restart listener si cambia la lista. Registro 100% LOCAL (`findAllActiveWithTypes()`); el backend lee identidad vía `GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`                                                 |
| `RetentionModule` (`retention/retention.module.ts`, importado por `CoreModule`)                                      | `SourcesController` + `FeedController` + `RegisterNewsSourceUseCase` + `FeedRetentionCleanupScheduler` + `DiskMonitorService` (importa `SharedModule` + `AvatarModule` (deprecated) + `MetadataModule`)                                                                                                                                                                                                                   | Módulo unificado feed: alta/sources, reads, janitor 72h, disco. El repo de sources lo provee `SharedModule` (lectura/escritura en DB propia)                                                                                                                  |
| ~~`KolModule` / seeder 45 KOLs~~                                                                                     | **ELIMINADOS del tree** (no queda `src/**/kol.module.ts` ni `*seed*` en `src/`)                                                                                                                                                                                                                                                                                                                                           | Alta solo por `POST /api/feed/sources` (registry); canales reales desde DB local                                                                                                                                                                              |
| ~~`FeedModule` / `TelegramModule`~~                                                                                  | **RENOMBRADOS**: `TelegramModule`→`CoreModule`, feed-module→`RetentionModule` (`core/` + `feed/` + `registry/` + `retention/`, rename crypto→feed 2026-09-25, evidencia `.omo/evidence/rename-feed.log`)                                                                                                                                                                                                                  | `messageType`/`type` `'kol'\|'crypto-news'` se PRESERVAN como valores de wire/DB (backward compat); solo nombres de archivos/dirs/entidades (`telegram-feed-*`) y disco (`uploads/feed-media/`, unificación 2026-09-27) cambian                               |
| `StreamModule`                                                                                                       | StreamService + SSEStreamController (`GET /api/ingestion/stream` abierto) — registry/broadcast-dual/backfill-buffer/tracker/circuit/legacy-controller ELIMINADOS (per-env T4, misma imagen rige para prod)                                                                                                                                                                                                                | `ScheduleModule.forRoot()` para heartbeat                                                                                                                                                                                                                     |
| `MediaModule` (`src/feed-media/`, clases `Media*` sin renombrar)                                                     | MediaController (downloader importado de SharedModule; unified home `uploads/feed-media/` + fallback legacy con log)                                                                                                                                                                                                                                                                                                      |                                                                                                                                                                                                                                                               |
| ~~`AvatarModule` (`src/avatar/`)~~ `AvatarModule` (`src/avatar/`, lo importa `RetentionModule`) — **DEPRECATED P58** | `KolAvatarService` (fetchOnce/refresh, cola serializada por promise-tail, bookkeeping `avatar_path`/`avatar_updated_at`) + `KolAvatarPhotoPort`→`MtprotoAvatarPhotoAdapter` (`downloadProfilePhoto` vía `FloodWaitHandler.withRetry('kol-avatar', …)`) + `KolAvatarController` (rutas con headers `Deprecation`/`Sunset`/`Link` al sucesor)                                                                               | Sin limiter ni cliente MTProto propios (reusa `SharedModule`: client manager, peer resolver, flood guard, source repo); sin loop periódico — solo fetch-ONCE al alta + refresh explícito (P19/P29). Ownership en `MetadataModule`; borrado tras staging green |
| `MetadataModule` (`src/metadata/`, lo importa `RetentionModule` + `AppModule`) — **P58 owner**                       | `MetadataService` (identity resolve/refresh/adoptRegistryRow + avatar fetch-serve absorbido) + `MetadataPhotoPort`→`MtprotoMetadataPhotoAdapter` (`downloadProfilePhoto` vía `FloodWaitHandler.withRetry('metadata-photo', …)`) + `MetadataController` (`GET /api/metadata/:channelId`, `GET .../avatar` canónico, `POST .../refresh`, `POST .../backfill`) + `MetadataRepository` (vía `SharedModule`; `phone` excluido) | Reusa `SharedModule` (sin limiter ni cliente MTProto propios); `telegram_channel_metadata` (migración `1790600000000`) + `uploads/avatar/` permanente (janitor-excluido). Registry dual-escribe aquí (schema §4 paso 1)                                       |
| `HealthModule` / `MetricsModule`                                                                                     | HealthController / MetricsService+Controller                                                                                                                                                                                                                                                                                                                                                                              | Prometheus vía `@willsoto/nestjs-prometheus` + `prom-client`                                                                                                                                                                                                  |
| Infra global                                                                                                         | `EventEmitterModule` (wildcard `.`, max 20), `ScheduleModule`, `LoggerModule` (pino-http + pino-pretty en no-prod), `TypeOrmModule` postgres con las 5 entidades propias (ver Persistencia), `ValidationPipe{whitelist, forbidNonWhitelisted, transform}`                                                                                                                                                                 | CORS: `:3030` + `BACKEND_STAGING_URL` + `BACKEND_PROD_URL`, credentials true                                                                                                                                                                                  |

## Endpoints HTTP (21)

| Método + ruta               | Controlador                | Respuesta / notas                                                                                                                                                                                           |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/ingestion/stream` | SSEStreamController.stream | SSE abierto (per-env T4): SIN gate 401, SIN param backendId, SIN register previo — cualquier backend conecta; `clientId=randomUUID()` interno; `connection:established` inicial; cleanup en `close`/`error` |

~~`GET /api/ingestion/backfill/:channelId` + `GET /api/ingestion/stream/status`~~ — **DELETED** (per-env T4 con la capa multi-backend: registry controller/DTO/service/entity, union, SSEBroadcast + bloque dual, tracker, buffer+entity, breaker, legacy controller). No hay register-flow ni status de backends; el stream es la única vía.
| `GET /api/media/:channelId/:messageId/:index` | MediaController.serveMedia | Stream archivo `{messageId}_{index}.*` desde `uploads/feed-media/{channelId}/` (unificación 2026-09-27; fallback a `feed/media/` + `crypto-news/media/` con un warn `media:serve:fallback` por hit); 400 params no numéricos; 404 dir/archivo; `Cache-Control: public, max-age=31536000` + ETag + Accept-Ranges |
| `GET /api/kol-avatar/:channelId` | KolAvatarController.serveAvatar | **DEPRECATED P58** (mismos bytes + headers `Deprecation`/`Sunset`/`Link` al sucesor `GET /api/metadata/:channelId/avatar`; borrado tras staging green). Foto permanente `{channelId}[__{handle}].jpg` desde `uploads/avatar/` (200, 1y cache; legacy + handle-qualified por glob) o placeholder SVG inline (200) si nunca se resolvió / falló MTProto; 400 id hostil. GET público (keyless, como `/api/media/*`) |
| `POST /api/kol-avatar/:channelId/refresh` | KolAvatarController.refreshAvatar | **DEPRECATED P58** (sucesor `POST /api/metadata/:channelId/refresh`; headers de deprecación). Refresh manual EXPLÍCITO (única re-descarga; sin loop periódico) vía guard serializado + flood-wait `withRetry('kol-avatar', …)` (P29); `?handle=` opcional nombra el archivo; 201 `{channelId, avatar: fetched\|cached\|placeholder, avatarUrl}`. Protegido (POST → API key si set) |
| `POST /api/kol-avatar/backfill` | KolAvatarController.backfillAvatars | **DEPRECATED P58** (sucesor `POST /api/metadata/backfill`; headers de deprecación). Catch-up P57: recorre sources y descarga SOLO las sin archivo (fetch-once respetado, serializado P29, nunca lanza); 201 `{checked, fetched, cached, placeholder}`. Protegido (POST → API key si set) |
| `GET /api/metadata/:channelId` | MetadataController.getMetadata | **P58 canonical**: vista de identidad (`channelId`, `peerType`, `kind`, `title`, `firstName`/`lastName`, `handle`, `usernames`, `about`, `isBot`, `verified`, `isScam`, `isFake`, `participantsCount`, `url`, `avatarUrl`→`/api/metadata/:channelId/avatar`, `fetchStatus`); NUNCA `phone`. 404 si el id no tiene fila. GET público (keyless, como avatar) |
| `GET /api/metadata/:channelId/avatar` | MetadataController.serveAvatar | **P58 canonical** (sucesor de `GET /api/kol-avatar/:channelId`; sin headers de deprecación): foto permanente o placeholder SVG (200); 400 id hostil. GET público (keyless) |
| `POST /api/metadata/:channelId/refresh` | MetadataController.refreshMetadata | **P58**: refresh manual EXPLÍCITO (re-resolve de identidad + re-fetch de foto, guard serializado + flood-wait `withRetry('metadata-photo', …)` P29); 201 vista de identidad. Protegido (POST → API key si set) |
| `POST /api/metadata/backfill` | MetadataController.backfillMetadata | **P58**: adopta cada fila del registry + fetch-ONCE solo missing (serializado P29, nunca lanza); 201 `{checked, fetched, cached, placeholder}`. Protegido (POST → API key si set) |
| `GET /api/feed/messages` | FeedController | Reads RAW con `?limit=50&type=kol\|crypto-news` (valores wire preservados post-rename); ver nota Feed reads abajo |
| `GET /api/feed/messages/channel/:channelId` | FeedController | Historial por canal (`?limit=50`) |
| `GET /api/feed/stats` | FeedController | Conteos por tipo |
| `POST /api/feed/sources` | SourcesController.createSource | Alta en DB propia. Body: `{channelId, title?, handle?, type?}`. Returns 201 + source view (+ `avatarUrl`; fetch-ONCE avatar P19 fire-and-forget). P57 guard: single-`getEntity()` kind probe rejects user/bot/unknown with explicit 400; stores `entity_kind`/`is_bot` (migration `1790400000000-EntityKindColumns`). Ingestion-telegram is SOLE OWNER (backend POST deprecated, returns 501) |
| `POST /api/feed/sources/batch` | SourcesController | Alta en lote (all-or-nothing 400 incl. kind guard per item) |
| `GET /api/feed/sources/resolve?input=` | SourcesController.resolveSource | P57 kind probe: `@handle`\|numeric id\|`t.me/…` URL → `{input, kind: channel\|supergroup\|group\|user\|bot\|unknown, canSubscribe, channelId, title, handle, isBot}` via single `getEntity()` under the `entity-resolve` flood guard (P29 reuse); 400 empty/invite-link, 404 unresolvable. Protected (401 without key) |
| `GET /api/feed/sources[?type=]` | SourcesController | Cada fila lleva `avatarUrl: /api/kol-avatar/:channelId` (P19 — kol-system lo consume para rankings + caller display; siempre servable: foto o placeholder 200) + `url: https://t.me/<handle>` (P57 todo 12, null sin handle; columna `url`, migración `1790500000000`) |
| `GET /api/feed/sources/active/ids` | SourcesController | Ids activos (lo consume el backend para identidad kol) |

**P41 dual-serve (T2 todo 13 Fase 1, live):** `FeedController` + `SourcesController` responden
`@Controller(['api/feed', 'api/crypto-news'])` — old `/api/crypto-news/sources|messages|stats` junto a
new `/api/feed/*` (mismos handlers). Alcance `feed-sources` SOLO aquí (el backend NO lo adopta:
su CRUD `/crypto-news/sources/:channelId/filters` queda intacto). Old cae en cutover todo 11.
| `GET /api/health` | HealthController.getHealth | ⚠️ **Stubs**: `HealthModule` provee `'TelegramClientManager' → null` y `'FloodWaitCounter' → null` → responde `mtproto{connected:true, authorized:true}` por fallback, `channels` todo `0`, sin `floodWait`. El manager real ni implementa esa interfaz (ver Gaps). `warnings[]` siempre vacío (el tracker que lo alimentaba fue eliminado per-env T4); 200 ok / 503 degraded |
| `GET /api/health/ready` / `GET /api/health/live` | HealthController | readiness (acepta SSE) / liveness (proceso vivo) — únicos endpoints con datos reales |
| `GET /api/health/channels` | HealthController.getChannels | ⚠️ Siempre `[]` (ClientManager stub null) |
| `GET /metrics` | MetricsController | ⚠️ Expone el endpoint pero **nadie actualiza las métricas** (ver Gaps): gauges en 0 + defaults de Node |
| `GET /debug/telegram/message/:channelId/:messageId` | DebugTelegramController | Inspección cruda (text fields, fwdFrom, media, entities, groupedId) — solo debug |

Eventos SSE: `connection:established`, `message:telegram`, `health:ping` (cada 30 s, con `uptime`+`connectedClients`). Formato: `event: <type>\ndata: <json>\n\n`. (Los `backfill:*` murieron con el endpoint — per-env T4.) `message:telegram` lleva desde todo 12 P57 los campos aditivos `handle`/`avatarUrl`/`sourceUrl` (lookup read-only fail-open a nulls; el filtrado sigue por `messageType` — consumers tolerantes, sin cambios fuera de este servicio).

Feed reads (`GET /api/feed/messages`): `?type=kol|crypto-news` filtra a nivel SQL (`findRecent(limit, typeFilter)`).
Valor inválido → 400 (`type must be one of kol, crypto-news`).
Sin `type` devuelve mixto (legacy default, backward compatible).
**Unificación 2026-09-27**: `src/media/` → `src/feed-media/` (alias `feed-media/*`; clases `MediaModule`/`MediaController`/`MediaDownloaderService`/`FeedPathBuilder` SIN renombrar — decisión documentada en CHANGELOG) y disco `uploads/{crypto-news/media,feed/media}/` → `uploads/feed-media/` (evidencia `.omo/evidence/media-rename.log`); lo renombrado es archivos/dirs (`feed-media`), disco (`uploads/feed-media/`) y scheduler (`feed-retention-cleanup`). Los valores `kol|crypto-news` se PRESERVAN en wire + columna DB `type` (compat, rename 2026-09-25).
Feed sources (`GET /api/feed/sources[?type=]`): cada fila lleva `avatarUrl: /api/kol-avatar/:channelId` (P19, 2026-09-25 — kol-system lo consume para rankings + caller display; siempre servable: foto o placeholder 200).

KOL avatars (todo 13, P19 + P29, 2026-09-25; avatar-total todo 12, P57, 2026-09-27): `src/avatar/` (`AvatarModule`, importado por `RetentionModule`; reusa `SharedModule` — sin limiter ni cliente MTProto propios). Fetch-ONCE al registrar source **de TODO tipo** (filtro kol-only eliminado en todo 12; `RegisterNewsSourceUseCase` → `KolAvatarService.fetchOnce(channelId, handle)` vía inyección `@Optional()`, fire-and-forget, nunca tumba el alta); filas pre-avatar se ponen al día con `POST /api/kol-avatar/backfill` (solo missing, serializado P29). Archivos `{channelId}__{handle}.jpg` (legacy `{channelId}.jpg` migran lazy con dedupe a un archivo por canal; el serve resuelve por glob). Columna `url` (`https://t.me/<handle>`, migración `1790500000000`) en `telegram_feed_sources`, expuesta en toda vista de sources + resolve + frames SSE (`handle`/`avatarUrl`/`sourceUrl` aditivos). MTProto miss → placeholder + retry diferido vía refresh explícito (`POST /api/kol-avatar/:channelId/refresh[?handle=]`, con key). Flood-guard: `MtprotoAvatarPhotoAdapter` descarga vía `FloodWaitHandlerService.withRetry('kol-avatar', …)` (P29 — serializado por promise-tail en el servicio, sin ráfagas). Storage permanente `uploads/avatar/` + columnas nullable `avatar_path`/`avatar_updated_at` en `telegram_feed_sources` (migración `1790300000000-KolAvatarColumns` verificada en `src/shared/common/persistence/migrations/`; el FILE manda al servir). EXCLUIDO del janitor 72h: sus dos pasadas SQL tocan solo `telegram_feed_message*` y el orphan-sweep camina solo `uploads/feed-media/` (pinned por `kol-avatar.janitor.spec.ts`; comentario P19 en `feed-retention-cleanup.scheduler.ts:276`).

Central metadata (P58, 2026-09-27): `src/metadata/` (`MetadataModule`, importado por `RetentionModule` + `AppModule`) ABSORBE `src/avatar/` — misma fetch-serve behavior (paridad pineada en `metadata-absorption.spec.ts`), más identidad por id (`kind`/`handle`/`url`/`type` + `phone` User-only) persistida en `telegram_channel_metadata` (migración `1790600000000-ChannelMetadata`; `phone` con `select: false` — almacenado, jamás expuesto: sin SELECT, sin DTO, sin log). `src/avatar/` queda como shim **@deprecated** (mismos bytes + headers `Deprecation`/`Sunset`/`Link rel='successor-version'`; borrado tras staging green, schema §4 paso 5). Registry adelgazado a suscripción (active/type): register/batch/PATCH dual-escriben identidad vía `MetadataService.adoptRegistryRow` (schema §4 paso 1); sus columnas de identidad son mirrors `@deprecated`. `MessagePersistenceCoordinator` enriquece SSE metadata-first (`MetadataRepository`, fallback al mirror del registry). Feed/stream/media/core son consumidores read-only (sin copias locales). Canónico: `GET /api/metadata/:channelId` + `GET /api/metadata/:channelId/avatar` + `POST .../refresh` + `POST .../backfill`. Canonical symbol naming is `profile-photo` (routes/DB columns unchanged).

## Pipeline de mensajes

```
MTProto listener — doble vía:
 (a) realtime: NewMessage({}) → handleEvent → filtra subscribedChannelIds → transformMessage → MessageQueue
 (b) polling cada 30 s fijos: getMessages(peer, {minId: lastSeen, limit: 50}) con FloodWaitHandler.withRetry → transformMessage → MessageQueue
 → subscribe() yield cola → CoreModule.startListening clasifica kol|feed (pertenencia a newsIds, `channelTypeMap`)
  → MessagePersistenceCoordinator.route(raw, type): dedup at source (`isDuplicate()` wired) → lastSeen.set → transformToPayload → stream.broadcast({type:'message:telegram'})
  → SU backend SSE (1:1 por env: dev :3031, staging :3033, prod :3032) consume
```

Notas de path real:

Fail-soft boot (P60-bis): con triple inválida/dummy el listener se desactiva (`markAuthorizedIfTrue()` traga el error de sesión, `subscribe()` queda en idle sin lanzar) pero el servicio sigue arriba — HTTP API + SSE vivos; `GET /api/health` responde `degraded` (503) con `mtproto-disconnected` en `warnings[]`.

- **Rename crypto→feed (2026-09-25, evidencia `.omo/evidence/rename-feed.log`)**: `transformMessage` delegado a `FeedMessageTransformer` (`shared/transformation/transformers/feed-message-transformer.ts`; texto vía `feed-text-extractor.ts`, cascada `message → text → media.caption → fwdFrom.message`). Media download delegado a `TelegramMediaExtractorService` (`shared/transformation/extractors/telegram-media-extractor.ts`, **solo feed**; KOL nunca descarga). El servicio encapsula: metadata extraction + `MediaDownloaderService.download()` para photos/videos.
- `transformMessage` extrae texto con prioridad `message → text → media.caption → fwdFrom.message` (`''` si nada) y descarga media **solo para feed** (discriminador wire/DB `crypto-news` preservado; cache DB `telegram_feed_sources`, refresh 5 min; KOL nunca descarga; solo `MessageMediaPhoto` + documentos video).
- ⚠️ ~~`DeduplicationService` está inyectado en el coordinator pero `route()` **nunca llama `isDuplicate()`**~~ **WIRED (feed-unification)**: `route()` llama `isDuplicate()` para realtime+polling (1 row + 1 frame); solo el polling salta `id <= lastSeen`.
- `subscribe()` lanza si ya corre (single-listener); sin sesión autorizada queda en idle silencioso (`running=true`, sin yield); `disconnect()` solo hace `queue.flush()` (despierta UN waiter), no cierra el cliente MTProto.
- Logs de debug verbosos activos en el path (`[MSG-TRANSFORM-DEBUG]`, `[TEXT-EXTRACTION-DEBUG]`, `[MEDIA-DEBUG]`, `[PAYLOAD-TRANSFORM-DEBUG]`, caso especial mensaje 167) — candidatos a limpiar/bajar a `debug`.

`MessagePayload` (`core/domain/types/message-payload.ts`): `{peerId, messageId, occurredAt(ISO), text?, media: MediaPayload[], entities?, groupedId?, messageType}` (`messageType: 'kol'|'crypto-news'` — valor preservado post-rename).

- **Invariante ToS**: `text` **excluido para KOL** (el backend lo extrae por su pipeline), **incluido para feed** (contenido opaco, se guarda tal cual).
- `MediaPayload`: `{type: photo|video, index, url: {baseUrl}/api/media/{channelId}/{messageId}/{index}, mimeType, fileSize}`.
- Broadcast secuencial por canal; errores por mensaje se loguean sin tumbar el listener; dedup stats vía `getStats()`.

~~`BackendChannelProviderService` (HTTP al backend)~~ — **REMOVED** (feed-unification): el registro de canales es LOCAL (`TelegramFeedSourceRepository.findAllActiveWithTypes()` en `core.module.ts`, KOL + feed por columna `type`; el backend lee identidad vía `GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`). Cada instancia solo escucha SUS canales. (Nota P31: cada env — dev `ingestion-telegram`, staging `ingestion-telegram-staging`, prod `ingestion-telegram` — escucha solo SU DB `<base>_ingestion`.)

**Architecture post-migration (2026-09-05, per-env 2026-09-22)**:

- **KOLs + feed**: cada ingestion-telegram lee SU DB local (`<base>_ingestion` de su env); `ingestion-telegram-staging` tiene su propia `onchain_bot_staging_ingestion` (arranca VACÍA, sin mirror prod). Nombres TARGET tras el rename — las DBs Oracle conservan el nombre pre-rename hasta que ejecute el runbook (.omo/runbooks/rename-onchain-bot-db.md, fase 3).
- **Rationale**: sin dependencia HTTP al backend, cada env arranca solo con sus datos; staging experimenta sin rozar prod

## Servicios clave

- `TelegramClientManager` — singleton lazy (`ensureClient`, `connect`, `disconnect`, `markAuthorizedIfTrue` con timeout 20 s, `isAuthorized()` sync). Lee `cfg.telegram.mtprotoLogLevel/mtprotoUseWss/mtprotoStartupDelayMs`, expuestas en `app.config` (Carril 1: `INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL/USE_WSS/STARTUP_DELAY_MS`, defaults `error/false/0` = conducta previa). `getClient()` usado por debug controller.
- `TelegramMtprotoListenerAdapter` — implementa `TelegramListenerPort` (`subscribe`, `resolveChannelMetadata`/`joinChannel` vía `TelegramPeerResolver`, `disconnect`). ⚠️ Su `onModuleInit` chequeaba `cfg?.telegram?.mtprotoApiId/mtprotoApiHash` (keys inexistentes) → **FIXED (Carril 1)**: lee `telegram.apiId/apiHash`, el guard pasa con creds reales y `markAuthorizedIfTrue()` se invoca. `filterChannels()` es código muerto (se pollean todos los peers, incluidos bots). ~~Comentario de cabecera desactualizado ("no media download" — sí descarga para feed)~~ **Phase 5.2**: refactorizado para usar `TelegramMediaExtractorService`.
- **`TelegramMediaExtractorService`** (`shared/transformation/extractors/telegram-media-extractor.ts`) — encapsula media extraction + download. Responsibilities: extract metadata from Telegram media objects (photo/video) + download files via `MediaDownloaderService`. Returns `TelegramMediaAttachment[]` with `filePath`. Used ONLY for feed channels (KOL messages skip media).
- `MediaDownloaderService.download(client, channelId, messageId, index, media)` → `{filePath(abs), mimeType, fileSize}`; sanitiza channelId (`[^a-zA-Z0-9-]`), ext por tipo (photo→`.jpg`, document por mimeMap o `.bin`), `mkdir -p`, `client.downloadMedia` con `FloodWaitHandler.withRetry`, buffer→`uploads/feed-media/{channel}/` (unificación 2026-09-27). Ojo: `fileReference` de Telegram expira (~1 h) — la descarga es síncrona a ingestión por diseño.
- Anti-ban: `IngestionSafetyConfig` (maxChannels ≤100, pollBase ≥30 s, jitter %, sleep window `04:00–08:00 UTC`, flood backoff 5 s×2 hasta 1 h, 5 intentos, umbral 10/24 h) + `FloodWaitHandler.withRetry` (extrae segundos solo de errores con marcador `FLOOD_WAIT`; pausa 1 h tras agotar intentos) + `FloodWaitCounter` (ventana 24 h; **consecutive-failures trackeado desde Carril 1**: `record()` incrementa, `recordSuccess()` resetea racha, `getConsecutiveFailures()` real — el handler lo sincroniza) + `MessageQueue` + `LastSeenManager` (cursor Redis `ingestion:lastSeen:{peer normalizado sin @/-100}`, sin TTL) + `TelegramPeerResolver` (resuelve `@user`, numérico, `-100`; fallback sin prefijo para legacy) + `joinChannel` (`Api.channels.JoinChannel`, taxonomía: `USER_ALREADY_PARTICIPANT`→ya miembro, `CHANNEL_PRIVATE/INVALID`, `CHANNELS_TOO_MUCH`, `FLOOD_WAIT` passthrough).
- `SleepWindowService.isAsleep()/getNextWakeTime()` (rotación diaria ±30 min) gatea `startPollingLoop()` (skip + log once); el push realtime no se gatea por diseño.
- `StreamService` — Map clientes, headers SSE (`no-cache`, `X-Accel-Buffering: no`), `broadcast` con purga de muertos, `shutdown()` (+ heartbeat 30 s vía `SchedulerRegistry`).
- `MetricsService` — define `ingestion_mtproto_connected`, `messages_received_total{channelId,type}`, `messages_broadcast_total`, `messages_broadcast_duration_seconds` (p95 <500 ms), `sse_clients_connected`, `flood_wait_count_24h`, `media_downloads_total{type}`, `api_request_duration_seconds{endpoint,method,status}` sobre `Registry` propio (`PrometheusModule` con defaults activados). ⚠️ **Ningún servicio lo inyecta**: contadores/gauges siempre en 0. (`InjectMetric` importado sin uso.)
- `RedisService` (`shared/common/`) — `lazyConnect`, retry máx 3 (200 ms×n, cap 2 s); `getClient()` lanza si disabled → `LastSeenManager.load` lo captura por peer (warn); `persist` chequea `isEnabled()`. Sin TTL en cursores.
- `StructuredLoggerService` (`shared/common/logging/`) — logs estructurados (`sse:client:connected`, `message:received`, `flood_wait:detected`).

## Configuración (`shared/common/config/app.config.ts`)

`registerAs('app')` → `{nodeEnv, telegram{apiId,apiHash,sessionString}, api{port,host,baseUrl}, redis{enabled,host,port,password,db}, uploads{root,mediaPath}, ingestionSafety{...}, database{...}, logging{level}}` (verificado: sin `seedKols`/`seedNews` — gap 17 removidos). Validación class-validator (telegram/api/redis/uploads/safety/database/logging). Safety: env > `config/ingestion.config.json` > defaults. DB opcional (`DATABASE_ENABLED`), `synchronize:false` en prod.

Vars (ver `.env.example` / `.env.production.template` — prod usa hosts docker `onchain-bot-ingestion-telegram:3031`, `onchain-bot-redis-production`, `onchain-bot-postgres-production`): `INGESTION_TELEGRAM_MTPROTO_API_ID/HASH/SESSION`, `INGESTION_PORT` (canónico vía `resolveIngestionPort()`: `INGESTION_PORT` > `INGESTION_API_PORT` > `PORT` > `3031`, gap 12), `INGESTION_API_HOST/BASE_URL`, `INGESTION_REDIS_*`, `INGESTION_DATABASE_*` (+`DATABASE_ENABLED`), `INGESTION_SAFETY_*`, `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` (72 h — nombre de var PRESERVADO post-rename), `INGESTION_LOG_LEVEL/FORMAT`, `INGESTION_UPLOADS_ROOT`, `BACKEND_PORT`, `BACKEND_STAGING_URL/BACKEND_PROD_URL`, `NODE_ENV`.

⚠️ **Doble lectura de safety config, con schemas incompatibles**: `app.config.ts loadSafetyConfig()` espera `sleepWindow{start,end,timezone}` + `floodProtection{initialBackoffMs,...}` (coincide con `config/ingestion.config.json` del repo root), mientras la clase `IngestionSafetyConfig` espera `sleepWindow{startUtc,endUtc}` + `floodProtection{initialMs,multiplier,maxMs}` → del archivo solo matchean los defaults numéricos; además la clase ignora env vars. Y en dev (`cwd=apps/ingestion-telegram`) el archivo ni existe → siempre defaults + warn; solo en Docker (`cwd=/app`, el Dockerfile copia `config/`) se encuentra.

## Gaps conocidos (verificados contra código — no reintroducir como "features")

1. ~~**Backfill roto**: `adapter.backfill()` lanza siempre. El endpoint existe pero solo emite `backfill:error`.~~ **DELETED (per-env T4)**: endpoint `/api/ingestion/backfill/*`, rama `lastSeenTimestamp` y eventos `backfill:*` eliminados con la capa multi-backend. No hay replay; el backend `backfill()` ahora 404 (backend gap 22).
2. **Health con stubs null**: `/api/health` y `/api/health/channels` no reflejan estado real. Cablear `TelegramClientManager`/`FloodWaitCounter` reales (la interfaz que `HealthController` espera — `isConnected()`, `getChannelCount()`, etc. — no existe en el manager actual).
3. ~~**Dedup sin aplicar**~~ **WIRED (feed-unification)**: `MessagePersistenceCoordinator.route()` llama `deduplicationService.isDuplicate()` (Invariant 3). Verificado en `core/application/coordinators/message-persistence.coordinator.ts:109`.
4. **Métricas sin alimentar**: inyectar `MetricsService` en adapter/coordinator/stream y actualizar contadores (el README de `src/metrics/` ya documenta cómo). El gauge `channelUnionSize` fue ELIMINADO (F1-fix 2026-09-22: era el cadáver de la union multi-backend, fijado a 0 y sin lectores).
5. ~~**Sleep window sin aplicar**~~ **WIRED**: `startPollingLoop()` chequea `isAsleep()` cada iteración (skip + log once con next wake); realtime push no se gatea por diseño.
6. ~~**`TelegramClientManager` lee keys inexistentes** (`mtprotoLogLevel/mtprotoUseWss/mtprotoStartupDelayMs`)~~ **RESOLVED (Carril 1)**: expuestas en `app.config` (`INGESTION_TELEGRAM_MTPROTO_LOG_LEVEL/USE_WSS/STARTUP_DELAY_MS`, opcionales con defaults).
7. ~~**Adapter `onModuleInit` muerto**~~ **RESOLVED (Carril 1)**: lee `telegram.apiId/apiHash`.
8. ~~**`FloodWaitCounter.getConsecutiveFailures()` hardcodeado a 0**~~ **RESOLVED (Carril 1)**: tracking real + `recordSuccess()` cableado al handler (spec 8 tests).
9. **`MessageQueue.flush()` despierta un solo waiter y no vacía la cola**; `disconnect()` no cierra el cliente.
10. ~~**Logs debug verbosos en path caliente**~~ **RESOLVED**: los tags `[MSG-TRANSFORM-DEBUG]`/`[TEXT-EXTRACTION-DEBUG]`/`[MEDIA-DEBUG]`/`[PAYLOAD-TRANSFORM-DEBUG]` ya no existían en `src/`; el ruido restante (`[FIRE-AND-FORGET]` ×3 por mensaje) bajado a `debug`.
11. ~~**`scripts/check-telegram-message.ts` desactualizado**~~ **RESOLVED (Carril 1)**: lee `INGESTION_TELEGRAM_MTPROTO_*` (fallback legacy) + args `--channel/--message` (defaults anteriores).
12. ~~**Triple var de puerto** (`INGESTION_PORT` vs `INGESTION_API_PORT` vs `PORT`)~~ **RESOLVED (Carril 1)**: canónico `INGESTION_PORT` > `INGESTION_API_PORT` > `PORT` > `3031` vía `resolveIngestionPort()` (main + config lo usan).
13. ~~**Sin script root**~~ **RESOLVED 2026-09-20 (T24)**: el root `package.json` ya tiene `dev:ingestion` (`port-cleanup :3031` + `start:dev -w .../ingestion-telegram`).
14. **Fail-open silencioso**: si la DB falla, `findAllActive()` retorna `[]` → cero canales news (todo se etiqueta `kol`, sin descarga de media) y el provider HTTP retorna `[]` → el servicio queda sin escucha con solo un warn. Considerar `degraded` explícito en `/api/health/live`.

## Gaps nuevos (segunda pasada — verificados con grep contra `src/`)

15. ~~**El refresh de canales cada 5 min es inefectivo**~~ **STALE+ HARDENED**: `CoreModule.refreshChannels()` ya swappea el snapshot vía `updateSubscribedChannels()` (single subscribe); endurecido con `lastSeenManager.load(added)` para no re-floodear históricos.
16. ~~**Config anti-ban decorativa**~~ **WIRED**: el polling consume `pollIntervalBaseMs` + `jitterPercent` (clamp [0,1], floor 1s) + tope `maxChannels` con warn; backoff flood intacto.
17. ~~**`seedKols`/`seedNews` muertos**~~ **REMOVIDOS**: `app.config.ts` ya no contiene `seed` alguno (verificado por grep) — sin `CRYPTO_NEWS_SEED`, sin `validateConfig()` pendiente de ese path. Alta 100% DB-driven vía `POST /api/feed/sources`.
18. ~~**Retención de media sin janitor**~~ **RESOLVED 2026-09-08**: `FeedRetentionCleanupScheduler` consume `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` (default 72) para AMBAS pasadas (media + messages). `floodProtection.threshold24h` sigue sin evaluarse.
    Seguimiento backend-media-ownership 2026-09-19: el backend es growth-zero en `uploads/feed-media/` (unificación 2026-09-27); su `queue.controller` hace proxy a este servicio cuando no tiene copia. Tabla completa en `docs/deployment/media-ownership.md`.
19. ~~**Sin auth en ningún endpoint**~~ **RESOLVED (auth full, sec1)**: `ApiKeyGuard` + `RateLimitGuard` globales (`INGESTION_API_KEY`; unset = warn-once + allow-all para dev/e2e, limiter audit-only). Auth matrix (dual-prefix parity `/api/feed` + `/api/crypto-news`, header `x-api-key` canónico, legacy `?apiKey=` deprecated pero vivo): PROTECTED (401 sin key) = `GET messages`, `messages/channel/:channelId`, `stats`, `GET sources`, `sources/resolve`, `sources/active/ids`, `POST sources`, `POST sources/batch`, `PATCH/DELETE sources/*` (ambos prefijos) + `GET /api/health/channels`, `GET /api/ingestion/stream`, `GET /metrics`, `GET /debug/*`, `POST /api/kol-avatar/:channelId/refresh`; PUBLIC = exact `GET /api/health|/ready|/live`, `GET /api/media/*`, `GET /api/kol-avatar/:channelId` (single-segment). Rate-limit: bucket A (protected+writes) 60 req/min/IP + bucket B (media/avatar) 300 req/min/IP → 429 + `Retry-After` + `X-RateLimit-*`; health trio + SSE handshake exentos; 401 precede a 429 (M1, el limiter difiere sin key válida); `x-forwarded-for` solo con `TRUST_PROXY=true` (default OFF, spoof limit). Audit: una línea `auth:access:decision` por decisión (method/path sin query/decision/guard/clientIp, jamás key material — pino-http redacta `x-api-key` + `?apiKey=` + query en `req.url`); drill en `docs/deployment/ingestion-api-key-compromise-drill.md`. Backend envía `INGESTION_TELEGRAM_API_KEY` en SSE/identity/threads clients; `CryptoNewsIngestionClient` (feed poll) aún NO la envía — follow-up backend (breaks when key is set). Browser-write ACCEPTED RISK: newsroom writes + feed reads del frontend rompen con key set (el browser no guarda secretos) — follow-up backend-proxy, NO construido aquí. ~~`MediaController` no sanitiza `channelId` → traversal de lectura~~ **TRAVERSAL RESOLVED**: `getMediaDirectory` sanitiza + `validatePathIsWithinRoot` + mapping a 400, regression spec en `media.controller.spec.ts`.
20. **`Accept-Ranges` ficticio**: se anuncia `Accept-Ranges: bytes` pero siempre se sirve 200 con el archivo completo — sin 206 ni `If-None-Match` (el ETag emitido nunca se evalúa). Seeking de video roto.
21. **Inundación en arranque frío**: `LastSeenManager.get()` default `-1` → primer polling pide `{minId: -1, limit: 50}` y emite hasta 50 mensajes históricos como nuevos; realtime+polling quedan cubiertos por dedup at source (gap 3 wired). Si Redis cae, los cursores se pierden y el reflood se repite en cada reinicio.
22. **SSE sin recuperación**: sin `Last-Event-ID`/buffer de replay; el cliente que se desconecta pierde mensajes y NO hay backfill (endpoint eliminado, gap 1). Pérdida silenciosa garantizada ante cortes.
23. **Arranque acoplado a Postgres**: `TypeOrmModule.forRootAsync` sin retry — caída de Postgres en boot tumba todo el servicio aunque el streaming no necesita la DB. Y el `HEALTHCHECK` Docker contra `/api/health` siempre da 200 por los stubs (gap 2) → contenedor "healthy" con MTProto muerto.
24. **Código muerto que embarca**: ~~`KolSeeder.seed()` jamás invocado, `seeders/crypto-news.seeder.ts` fuera de providers, `KOL_SEED` (45 entradas) y `CRYPTO_NEWS_SEED` sin consumidores runtime~~ **REMOVIDOS del tree** (verificado: ningún `*seed*` bajo `src/`, ningún `seed` en `app.config`, gap 17): queda `filterChannels()` sin llamadas e `ImportMetric` importado sin uso.
25. ~~**Provider HTTP frágil**: `BackendChannelProviderService` usa `fetch` global sin timeout contra `localhost:{BACKEND_PORT}` hardcodeado — en Docker eso no resuelve al backend (nombres `onchain-bot-*`), y un backend colgado congela `refreshChannels()` sin límite (solapa intervalos de 5 min).~~ **RESOLVED 2026-09-05**: Crypto-news sources now read from local `FeedSourceRepository` instead of HTTP. Only KOLs still fetched from backend (backend owns KOL identity). HTTP dependency reduced by 50%, ingestion-telegram can start without backend for feed ingestion.
26. ~~**Dockerfile `mkdir` pre-rename**~~ **RESOLVED (unificación 2026-09-27)**: `Dockerfile:60` crea `/app/uploads/feed-media` (el runtime escribe/sirve `uploads/feed-media/` + `uploads/avatar/` desde config).

## Persistencia / Docker

- **Database**: Uses **Docker Postgres** from `apps/backend/docker-compose.yml` (container `onchain-bot-postgres-dev`, port mapping `0.0.0.0:5432→5432`). Connection from host: `localhost:5432`. **NO** separate local Postgres installation required.
- **DB split 2026-09-08 + per-env 2026-09-22 — dedicated logical DB per env**: TARGET names tras el rename — dev local `onchain_bot_ingestion`, Oracle prod `onchain_bot_ingestion` + Oracle staging `onchain_bot_staging_ingestion` (`ingestion-telegram-staging`, arranca VACÍA por diseño — ver `docs/deployment/staging-twin-runbook.md`; estado live pre-rename en el runbook .omo/runbooks/rename-onchain-bot-db.md, fase 3). Backend `PERSISTED_ENTITIES` = 39: the 3 feed tables live ONLY here, in EACH env's own DB. pgAdmin: the extra DBs live in the SAME servers — no `servers.json` change, they just appear as another DB under the existing server entries.
- **TypeORM**: 4 entities registered in `app.module.ts` (verificado en código — `BackfillMessageEntity` ya no existe):
  - `TelegramFeedSourceEntity` — sources (**SOLE OWNER** since 2026-09-05, reads+writes; + `avatar_path`/`avatar_updated_at` P19, deprecated mirrors P58)
  - `TelegramFeedMessageEntity` — RAW message content (ingested from Telegram)
  - `TelegramFeedMessageMediaEntity` — media metadata (URLs to served files)
  - `TelegramChannelMetadataEntity` — P58 central identity per id (`telegram_channel_metadata`; `phone` stored-never-exposed)
- **NOTE**: `ChannelContentFilterConfigEntity` removed from ingestion-telegram (was residual artifact from split). Content filters are **SOLELY OWNED by backend** — backend performs CRUD operations and applies filters on-read via `ContentFilterService`. Ingestion-telegram stores RAW content only (Opción A architecture).
- **Migrations (infra added 2026-09-08, todo 2)**: `src/shared/common/persistence/data-source.ts` (mirrors backend structure) + `migration:generate/run/show/revert` scripts + `scripts/run-migrations.sh` + NODE_ENV gating in `app.module.ts` (staging/production → `synchronize:false, migrationsRun:false`; dev/test → `synchronize:true`). Baseline `1788844970659-BaselineIngestionSchema` creates exactly the 5 tables (generated against an empty scratch DB, never against populated dev). Deploys run migrations explicitly (`deploy-ingestion.yml` backup + one-off `migration:run` before recreate, abort-on-failure).
- **Schema sync**: `INGESTION_DATABASE_SYNCHRONIZE=true` in dev (auto-creates tables on boot).
- **Retention janitor (moved from backend 2026-09-08, todo 6)**: `FeedRetentionCleanupScheduler` (EVERY_HOUR, advisory lock `9_421_373` ≠ backend's old `7_421_372`) with TWO passes per tick — (a) media pass (expired by `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`, unlink + row delete, already-gone→delete, EACCES→skip+keep, else abort) + (b) NEW messages pass (`DELETE ... WHERE ingested_at < now() - 72h` batched `LIMIT 1000` loop + orphan-media sweep). Clock is `ingested_at`, never `published_at`. Absolute-age deletion (no matching-state exception; publisher queue holds content snapshots in the backend DB, so no cross-DB guard needed — task-6 audit). Window 72h per invariant; prod effective value pending operator decision (task-10 §4 dossier: prod backend cleaned media with 24h — do NOT assert 72h as prod-effective).
- **Startup**: Requires Docker Postgres running (`cd apps/backend && docker compose up -d postgres`). Service creates tables on first boot with `synchronize=true`.

### Invariantes per-env (inamovibles — split 2026-09-08 + per-env-ingestion 2026-09-22 + nombres canónicos P31 2026-09-25)

1. **Un ingestion-telegram por env, misma imagen** — prod `ingestion-telegram` (`docker-compose.ingestion.yml`, host `127.0.0.1:3032` → container `3031`) + staging `ingestion-telegram-staging` (`docker-compose.staging-ingestion.yml`, project `onchain-bot-staging-ingestion`, host `127.0.0.1:3033` → container `3031`) + dev local `ingestion-telegram` (`:3031`). Prohibido: "twin" para la instancia (P31), dos instancias con la misma triple, ingestion dentro de `docker-compose.staging.yml`/`.prod.yml`.
2. **Una triple MTProto por env, jamás compartida** (`INGESTION_TELEGRAM_MTPROTO_*` en el `.env` de SU instancia: prod cuenta actual, staging vieja-dev, local nueva). Pre-boot: triple-inequality assert por hashes (ver `docs/deployment/staging-twin-runbook.md`).
3. **Un solo storage de media por env** (`uploads/feed-media/` + `uploads/avatar/` — unificación 2026-09-27; named volume propio de `ingestion-telegram-staging`; dueño ingestion-telegram de SU env).
4. **Una DB de ingestion por env** (`<base>_ingestion`; TARGET staging: `onchain_bot_staging_ingestion`, VACÍA por diseño — nombre live pre-rename en el runbook .omo/runbooks/rename-onchain-bot-db.md, fase 3).
5. **Retención 72h messages + media** (janitor de arriba; avatares EXCLUIDOS P19; ver caveat prod en el punto anterior).

### Crear los `.env` reales en el servidor Oracle (comandos, SIN valores)

El repo solo lleva templates (`.env.production.template` con `INGESTION_DATABASE_NAME=onchain_bot_ingestion`, `.env.staging.template` con `..._staging_ingestion` + triple VACÍA pendiente de operador). Los archivos reales viven SOLO en el servidor Oracle y nunca se commitean:

```bash
ssh CryptoGanster
cp /opt/onchain-bot/apps/ingestion-telegram/.env.production.template \
   /opt/onchain-bot/apps/ingestion-telegram/.env.production
# Editar a mano: MTProto session, DB password, y (tras decisión del operador,
# ver task-10 §4) INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS. Sin valores aquí.

# ingestion-telegram-staging (nombre canónico P31 — prohibido "twin" para la instancia; misma imagen, OTRA triple — la vieja cuenta de dev):
cp /opt/onchain-bot-staging/apps/ingestion-telegram/.env.staging.template \
   /opt/onchain-bot-staging/apps/ingestion-telegram/.env.staging
# Rellenar SOLO con la triple vieja-dev + run triple-inequality assert
# (hashes, nunca valores) ANTES del primer boot — ver runbook:
# docs/deployment/staging-twin-runbook.md (nombre del runbook conserva "twin"; la instancia no)
```

### PENDING Phase B (no afirmar como hecho hasta el cutover)

- Conteos pre/post primer janitor tick en prod (se espera purga grande de historia >72h restaurada — evidenciar, no confundir con pérdida).
- `GET :3032/api/feed/sources` sirviendo las sources migradas (feed-unification; las viejas `/api/feed/*` dan 404).
- Ciclo scheduler-level en staging contra el servidor Oracle (probe source → `Found N matching messages` en logs → borrar probe).
- **Dockerfile**: build `node:22-alpine` (`npm ci --workspace=... --ignore-scripts`, `HUSKY=0`) → runtime con `dumb-init`, usuario `nodejs`, `uploads/` (+ `HEALTHCHECK /api/health`, ver gap 23: siempre 200 por stubs), `EXPOSE 3031`, `CMD node apps/ingestion-telegram/dist/src/main.js`. `mkdir -p /app/uploads/feed-media` coincide con el home unificado (unificación 2026-09-27; gap 26 resuelto). `ARG IMAGE_REVISION` declarado al FINAL a propósito (única declaración — el merge #250 había duplicado el bloque T2 original; su SHA cambia por push e invalidaría las capas de install/cache si estuviera arriba).
- **`.gitignore`**: `/dist`, `/coverage`, `.env`/`.env.dev`/`.env.*.local` (secretos fuera de git), `/uploads` (media efímera). Commiteados como plantilla: `.env.example`, `.env.production.template`.

## Spec origen

`.kiro/specs/centralized-ingestion-service/` (`requirements.md`, `design.md`, `tasks.md` + `tasks.meta.json`) — de ahí salen todos los comentarios `Per Requirement/GAP/Invariant/Architectural Decision` del código. Gaps numerados del diseño: GAP 1 = backfill por SSE, GAP 3 = tracking de desconexiones. Invariante 7 = una sola sesión MTProto (ver E2E).

## Tests

```bash
npm test            # unit: testRegex .*\.spec\.ts$, setup jest.setup.ts, --forceExit, timeout 30 s
npm run test:e2e    # test/jest-e2e.json (testRegex .e2e-spec.ts$, transformIgnorePatterns permite eventsource)
npm run test:e2e -- <archivo>   # una suite (stream-reconnection, metrics, ...)
npm run test:cov    # → ./coverage
```

Unit co-locados (`*.spec.ts`): `app.module`, `stream.service`, `sse-stream.controller` (stream abierto, sin gate), `media.controller` (+ `media-serve-feed-media-root.spec.ts`), `health.controller`, `metrics.service`+`controller`, `app.config`, `structured-logger`, `deduplication`, `message-payload` (`core/domain/types/`), `message-persistence.coordinator.integration` (`core/application/coordinators/`), **`telegram-media-extractor`** (`shared/transformation/extractors/`), **`shared/media/*` (core + types + utils)**, **`feed-retention-cleanup.scheduler` (+ `.disk.spec.ts`) + `disk-monitor.service`** (`retention/infrastructure/scheduling/`), **`typeorm-feed-source.repository` + `telegram-feed-message.repository`**, **avatar (`kol-avatar.controller/service`, `mtproto-avatar-photo.adapter`, `kol-avatar.janitor` — fetch-once/cached/placeholder, cola serializada, exclusión del janitor pineada)**, **metadata (`metadata-kind` matrix, `metadata-absorption` parity, `metadata-no-dup` phone/mirror guards)**. **Total: 784 tests across 62 suites** (2026-09-27, P58; was 815 across 43 pre-Tramo 1 — counts moved as specs were split/renamed, all green).

| E2E (`test/`)                        | Qué valida                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `app.e2e-spec.ts` (25)               | smoke mínimo: solo verifica 404 en `GET /` con `AppModule` completo                                               |
| `full-message-flow` (703 líneas)     | inyecta vía `StreamService.broadcast()` (simula MTProto), formato payload, URLs de media, latencia <500 ms        |
| `stream-reconnection` (462)          | reconexión con backoff exponencial 1 s→30 s, reconexión <30 s, Req 2.4/8.4                                        |
| `load-test-concurrent-clients` (664) | 10 clientes, 100 msg/min, p50/p95/p99, memoria, cero drops (Req 8.1/8.2/8.5)                                      |
| `metrics` (72)                       | `GET /metrics` 200 + `text/plain` + formato Prometheus                                                            |
| `E2E-TESTING-GUIDE.md`               | estrategia + troubleshooting (`AUTH_KEY_DUPLICATED`, SSH túneles, validación side-by-side prod-vs-staging ≥99.9%) |

⚠️ **Restricción MTProto en tests**: prohibido inicializar `TelegramClient` en tests locales mientras el servidor Oracle corre (sesión única → `406 AUTH_KEY_DUPLICATED`). Los e2e levantan `AppModule` completo en memoria e inyectan por `StreamService`; contra Oracle usan `INGESTION_TELEGRAM_URL=http://100.110.169.120:3032` + `eventsource` (ex-DO (suspended 2026-09-10) was `http://144.126.203.139:3032`).
⚠️ **Landmine `moduleNameMapper`** (unit y e2e): `^telegram/(.*)$` → `src/telegram/$1`, con solo `telegram/events` y `telegram/sessions` pineados a `node_modules`. Cualquier spec que importe otro subpath gramjs (`telegram/client`, `telegram/extensions/Logger`, …) resuelve a un archivo inexistente y rompe. Si agregas specs al MTProto layer, pinnea el subpath primero.

## Logging

`StructuredLoggerService` (`shared/common/logging/`, 233 líneas) sobre Nest `Logger` ← `LoggerModule` pino-http (pretty en no-prod, JSON en prod). Catálogo de eventos (`+ timestamp` ISO siempre): `message:received`, `sse:client:connected/disconnected`, `flood_wait:detected` (Req 9.3/11.2), `media:download:success/failed` (Req 9.4), `mtproto:connection:changed`, `service:started/shutdown`. Ojo: casi nadie lo inyecta — el path real loguea ad-hoc con `Logger` (incluido el ruido `[*-DEBUG]`, gap 10).

## Contrato SSE (consumidores backend)

```
GET /api/ingestion/stream  →  text/event-stream, headers no-cache + X-Accel-Buffering:no
evento inicial:  event: connection:established
mensaje:         event: message:telegram
heartbeat 30 s:  event: health:ping  {timestamp, uptime, connectedClients}
```

Ejemplo `message:telegram` (KOL: sin `text`; feed: con `text`):

```json
{
  "peerId": "-1001234567890",
  "messageId": 167,
  "occurredAt": "2026-…Z",
  "media": [
    {
      "type": "photo",
      "index": 0,
      "url": "http://localhost:3031/api/media/-1001234567890/167/0",
      "mimeType": "image/jpeg",
      "fileSize": 12345
    }
  ],
  "entities": [{ "type": "url", "offset": 0, "length": 10 }],
  "messageType": "crypto-news"
}
```

Valor `messageType: "crypto-news"` PRESERVADO post-rename 2026-09-25 (wire/DB compat — solo dirs/archivos/disco cambiaron a `feed`).

Requisitos del cliente (Req 2.4): reconexión con backoff 1 s→30 s; **sin** `Last-Event-ID`/replay (gap 22) — diseña el consumidor tolerante a huecos. Cada backend resuelve la URL de SU ingestion por `INGESTION_TELEGRAM_URL` (dev `:3031`, staging `:3033`, prod `:3032`).

## Deploy

Imagen: `ghcr.io/bryanstevensacosta/onchain-bot-ingestion-telegram:latest`.

| Compose (`apps/backend/`)              | Uso                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.ingestion.yml`         | standalone en el servidor Oracle: host `127.0.0.1:3032` → container `3031` (3032 evita choque con staging en 3031); `INGESTION_PORT: 3031` interno; healthcheck a `:3031/api/health`                                                                                                                                  |
| `docker-compose.staging-ingestion.yml` | `ingestion-telegram-staging` (nombre canónico P31, per-env 2026-09-22): project `onchain-bot-staging-ingestion`, host `127.0.0.1:3033` → container `3031`, `env_file` triple vieja-dev, DB TARGET `onchain_bot_staging_ingestion` (live pre-rename en runbook fase 3), uploads propios, red `onchain-bot-staging-net` |
| `docker-compose.with-ingestion.yml`    | extiende prod: build local del Dockerfile, `PORT: 3031`, backend con `INGESTION_TELEGRAM_URL: http://ingestion-telegram:3031` + volumen de media en **read-only** (ingestion owns writes), `depends_on` ingestion                                                                                                     |

Notas: `with-ingestion` referencia `../ingestion-telegram/.env.production` — **no existe en el repo** (solo `.env.production.template`); crearlo desde la plantilla en el servidor Oracle, nunca commitear (ver comandos en Persistencia). Los e2e contra el servidor Oracle usan el puerto host de SU env (**3032** prod, **3033** staging). `BACKEND_URL` fue eliminada del código (per-env T4, sin lector) y de ambas plantillas (`.env.production.template`, `.env.staging.template`, F1-fix 2026-09-22, doble-grep vacío); CORS sigue leyendo `BACKEND_STAGING_URL`/`BACKEND_PROD_URL` en `main.ts:73-74`.

Pipeline (desde split 2026-09-08, todo 10): `deploy-ingestion.yml` corre backup de la DB de ingestion + `migration:run` en one-off container ANTES de recrear (abort-on-failure); `deploy.yml` (backend prod) lleva un ordering gate que exige `GET :3032/api/feed/sources` healthy antes de migrar el backend. Lane staging (per-env T2): dispatch manual `target=staging` → `ingestion-telegram-staging` en `:3033` con su DB + pin `:staging-prev` (rollback T6 consume `:prev` prod / `:staging-prev` staging — nunca compartidos). Ley code-before-schema: desplegar ingestion PRIMERO y verificar `:3032` sirviendo, y SOLO ENTONCES desplegar el backend con la drop migration (el orden inverso deja al backend sin tablas que su imagen vieja exige — probado en staging, task-7).

## Variables de entorno (`.env.example`, 102 líneas)

| Var                                                                   | Default ejemplo                                            | Consume                                                                                                                                                           | Notas                                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_TELEGRAM_MTPROTO_API_ID/HASH/SESSION`                      | `12345678`/…                                               | `telegram.*` (requerido)                                                                                                                                          | De `https://my.telegram.org/apps`; sesión vía `cd apps/ingestion-telegram && npm run telegram:gen-session`                                                      |
| `INGESTION_PORT`                                                      | `3031`                                                     | `api.port` vía `resolveIngestionPort()` (`INGESTION_PORT` > `INGESTION_API_PORT` > `PORT` > `3031`, Carril 1)                                                     | Puerto runtime fijo 3031 (container-internal)                                                                                                                   |
| `INGESTION_API_BASE_URL`                                              | `http://localhost:3031`                                    | URLs de media en SSE                                                                                                                                              | En prod es `http://onchain-bot-ingestion-telegram:3031` (template)                                                                                              |
| `INGESTION_REDIS_HOST/PORT/DB/PASSWORD`                               | `localhost/6379/0/(vacío)`                                 | `redis.*` (habilitado salvo `INGESTION_REDIS_ENABLED=false`)                                                                                                      | Sin Redis: cursores en memoria, reflood al reiniciar (gap 21)                                                                                                   |
| `INGESTION_DATABASE_HOST/PORT/NAME/USER/PASSWORD/SYNCHRONIZE/LOGGING` | `localhost/5432/onchain_bot/postgres/postgres/false/false` | `database.*` + `DATABASE_ENABLED`                                                                                                                                 | ⚠️ El ejemplo dice "REQUIRED for raw text storage" — stale: la DB guarda RAW feed + sources (`telegram_feed_*`), no hay texto KOL (ToS)                         |
| ~~`INGESTION_TELEGRAM_SEED_KOLS/NEWS`~~                               | —                                                          | **REMOVIDAS** (gap 17: sin `seed` en `app.config` ni en templates `.env`)                                                                                         | Alta 100% DB-driven vía `POST /api/feed/sources`                                                                                                                |
| `INGESTION_SAFETY_*` (12 vars)                                        | ver ejemplo                                                | `ingestionSafety.*` (mayoría decorativa, gap 16)                                                                                                                  | Solo flood backoff/attempts tienen efecto                                                                                                                       |
| `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`                         | `72`                                                       | `FeedRetentionCleanupScheduler` (media + messages, gap 18 resolved)                                                                                               | 72h por invariante; valor efectivo en prod pendiente de decisión (task-10 §4)                                                                                   |
| `INGESTION_LOG_LEVEL/FORMAT`                                          | `info/json`                                                | `logging.level` (⚠️ `FORMAT` no se consume: pretty se decide por `NODE_ENV`)                                                                                      |                                                                                                                                                                 |
| `NODE_ENV`                                                            | `production`                                               | `nodeEnv`, pretty vs JSON                                                                                                                                         |                                                                                                                                                                 |
| `BACKEND_PORT` / `BACKEND_STAGING_URL` / `BACKEND_PROD_URL`           | —                                                          | ~~provider (`localhost:{BACKEND_PORT}`)~~ — el provider HTTP fue eliminado (registro local); CORS en `main.ts:73-74` lee `BACKEND_STAGING_URL`/`BACKEND_PROD_URL` | ⚠️ Ausentes en `.env.example` aunque el código las lee — solo están en `.env.production.template` (y `.env.staging.template` para `ingestion-telegram-staging`) |

## Dependencias (`package.json`)

Runtime: `telegram@^2.26.22` (GramJS MTProto), `@nestjs/*` v11 + `@willsoto/nestjs-prometheus`, `nestjs-pino@^4.6.1` + `pino@^10.3.1`, `ioredis@^5.4.1`, `typeorm@^0.3.30` + `pg@^8.22.0`, `prom-client@^15.1.3`, `class-validator/transformer`, `dotenv@^17.4.2`. Dev/test: `eventsource@^5.1.1` (cliente SSE en e2e), `supertest@^7`, `ts-jest@^29`, `typescript@^5.7.3`. Workspace npm `apps/*` (`@onchain-bot/ingestion-telegram`).

## Relaciones con otras apps

```
apps/backend ──GET :3030/telegram-kol/identity/kols/active/ids ──→ ingestion (canales KOL)
apps/backend ──~~GET :3030/feed/sources/active/ids~~ ─────→ **DEPRECATED 2026-09-05** (endpoint exists, returns [])
apps/backend ──SSE GET :3031/api/ingestion/stream ───────────────→ ingestion (consume MessagePayload)
apps/backend ──GET :3031/api/media/... (INGESTION_TELEGRAM_URL) ──→ ingestion (adjuntos; volumen compartido ro en with-ingestion)
ingestion ──reads+writes──→ telegram_feed_sources (own Postgres DB, NOT backend DB — **SOLE OWNER since 2026-09-05**)
ingestion ──POST /api/feed/sources ───────────────────────→ creates sources in OWN DB (backend POST deprecated, returns 501)
```

**Architecture post-migration (2026-09-05 — COMPLETED)**:

- **KOLs**: Backend owns identity → ingestion-telegram reads via HTTP
- **Crypto-news sources**: **Ingestion-telegram SOLE OWNER** → reads+writes from OWN DB (`FeedSourceRepository`)
  - Backend `POST /crypto-news/sources` → 501 Not Implemented (deprecated)
  - Backend `GET /crypto-news/sources/active/ids` → kept for backward compat, returns empty []
  - Backend `FeedSourceRepository.save()/delete()` → throws error
  - Backend `RegisterNewsSourceUseCase.execute()` → throws error
  - Backend `FeedSeeder.seed()` → returns early with warning if enabled (should be disabled)
- **Media**: Ingestion-telegram owns `uploads/` directory
- **Credentials**: MTProto session exclusive to ingestion-telegram (avoids `AUTH_KEY_DUPLICATED`)
- **Benefits**: Eliminates circular dependency, single source of truth, ingestion can start without backend

La ingestión no escribe en DB del backend ni publica en su event bus: acoplamiento = 1 endpoint HTTP (KOLs) + SSE + media. Credenciales MTProto: propiedad exclusiva de este servicio.

## Decisiones (índice — fuente: `.omo/drafts/mega-refactor-tramos.md` §7.6)

| ID  | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                               | Estado en este servicio                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P19 | Avatar fuente de verdad permanente (2026-09-24): ingestion-telegram resuelve foto MTProto, la almacena PERMANENTE en `uploads/avatar/` y la sirve (`GET /api/kol-avatar/:channelId` + `avatarUrl` en `GET /api/feed/sources`); fetch-ONCE al alta, refresh solo explícito; EXCLUIDA del janitor                                                                                                                                                        | Implementado (todo 13; `src/avatar/`, migración `1790300000000-KolAvatarColumns`, pin `kol-avatar.janitor.spec.ts`)                                                                       |
| P29 | Avatar bajo rate-limit ingestion: reusa safety/flood guard (`withRetry('kol-avatar', …)`), serializado sin ráfagas; sin limiter propio                                                                                                                                                                                                                                                                                                                 | Implementado (`mtproto-avatar-photo.adapter.ts:40`, promise-tail en `kol-avatar.service.ts`)                                                                                              |
| P31 | Nombres canónicos por env (2026-09-25): staging `ingestion-telegram-staging` (`:3033`); prod `ingestion-telegram` (`:3032`, alias docs-only `ingestion-telegram-production`); dev `ingestion-telegram` local (`:3031`). Prohibido "twin" para la instancia                                                                                                                                                                                             | Reflejado en este archivo (header, invariantes, `.env` staging); el runbook `docs/deployment/staging-twin-runbook.md` conserva su nombre de archivo                                       |
| P57 | Kind-resolver + guard channel/group-only (central todo 11, 2026-09-27): `GET /api/feed/sources/resolve?input=` (single-`getEntity()` taxonomy `channel\|supergroup\|group\|user\|bot\|unknown` + `isBot`, flood label `entity-resolve` reusing P29 guard); register/batch/subscribe reject user/bot/unknown with explicit 400 (fail-open NULL when MTProto unreachable); columns `entity_kind`/`is_bot` (migration `1790400000000-EntityKindColumns`)  | Implementado (`src/registry/application/entity-kind.ts` + specs, guard in `register-news-source.use-case.ts`, filter in `core.module.ts`)                                                 |
| P57 | Avatar-total + url t.me + SSE enriquecido (central todo 12, 2026-09-27): avatar fetch-once para TODO tipo (kol-only removido) + `POST /api/kol-avatar/backfill` (solo missing) + filenames `{channelId}__{handle}.jpg` (migración lazy, dedupe un archivo por canal) + columna `url` (migration `1790500000000-SourceUrlColumn`) + frames SSE con `handle`/`avatarUrl`/`sourceUrl` aditivos (consumers tolerantes, sin cambios fuera de este servicio) | Implementado (`src/avatar/` + `register-news-source.use-case.ts` + `sources.controller.ts` + `message-persistence.coordinator.ts`; specs: backfill, colisiones, SSE shape, url)           |
| P58 | Full per-id entity-metadata store (`metadata/` BC absorbing `avatar/`) — central todo (2026-09-27): `telegram_channel_metadata` (kind/handle/phone-if-present/photo/url/type per id, `phone` stored-never-exposed) + avatar fetch-serve absorbed (parity-pinned) + registry slimmed to subscription (active/type, dual-write mirrors) + feed/stream/media/core read-only + old avatar paths deprecated with headers (deletion after staging green)     | Implementado (`src/metadata/` + specs kind/absorption/no-dup, migración `1790600000000-ChannelMetadata`, dual-write en register/batch/PATCH, enrichment metadata-first en el coordinator) |

## Actividad reciente (git, `apps/ingestion-telegram`)

⚠️ STALE (resumen hasta 2026-09-03; pendiente re-verificación contra `git log` en worktree limpio — el actual está dirty, ver claim): migración seed→DB, fixes de ingestión feed + DB cache, `prevent AUTH_KEY_UNREGISTERED filtering users/bots`, limpieza de credenciales en templates. Posteriores NO reflejados aquí: rename crypto→feed 2026-09-25 (evidencia `.omo/evidence/rename-feed.log`), avatar fetch-once P19+P29 (todo 13), nombres canónicos P31. Dirección: eliminar listas estáticas y endurecer anti-ban/sesión — coherente con gaps 15/17/24 (quitar, no revivir, el código seed — ya sin `*seed*` en `src/`).

## Convenciones

- **Aliases** (`tsconfig.json`, espejados en `package.json` jest `moduleNameMapper`): `shared/*` (+`shared/kernel/*`, `shared/common/*`), `core/*`, `metadata/*`, `feed/*`, `registry/*`, `retention/*`, `stream/*`, `feed-media/*`, `health/*`, `debug/*`, `src/*`, `@/*` (= `src/*`, for 2+-level imports; 2026-09-27 migration; verificado — sin `telegram/*`).
- **ESLint flat** (`eslint.config.mjs`, `recommendedTypeChecked` + prettier): `no-explicit-any off`, `require-await off`, `no-floating-promises/no-unsafe-*/await-thenable/no-useless-catch/prefer-promise-reject-errors warn`, `no-unused-vars warn (^_)`, `prettier/prettier error (endOfLine auto)`; specs relajan `unbound-method` + `no-unsafe-*`. Excluye `src/**/*.spec.ts(.bak)` del build (`tsconfig.json`), `nest-cli.json: deleteOutDir`.
- **Estilo**: comentarios `Per Requirement X / Per GAP N / Per Invariant N` obligatorios en cambios de pipeline; `Logger` por clase; no `any` cruzando `MessagePayload`; nunca publicar sin `commit`-equivalente (broadcast solo tras transformar); no tocar `uploads/` a mano.

## Antipatrones del servicio

- Texto crudo KOL nunca sale con `text` por SSE (ToS fix-1); feed sí.
- `MediaDownloaderService` solo en SharedModule — no duplicar providers (rompe circulares con MediaModule).
- `CoreModule.refreshChannels()` conserva lista previa ante fallo; no vaciar canales en error.
- Alta de canales SOLO por `POST /api/feed/sources` (registry, DB propia) — sin seeds (eliminados del tree).
- Heartbeat SSE 30 s no desactivar (proxies cortan SSE idle). ~~`parseLimit` backfill 1–100~~ — backfill eliminado (gap 1).
