# Ingestion Service — AGENTS.md

**Centralized Telegram MTProto ingestion → SSE fan-out.** Una sola sesión MTProto alimenta N backends (dev/staging/prod). Puerto **3031**. NestJS 11 + TypeScript 5.7 + `telegram` (GramJS) + Redis + Postgres (TypeORM) + Pino + Prometheus.

> Credenciales MTProto viven **SOLO aquí** (`INGESTION_TELEGRAM_*`). Nunca en `apps/backend/.env` → evita `AUTH_KEY_DUPLICATED`.

## Comandos

```bash
# Desde apps/ingestion-service/ (o root con -w @alpha-meta-token-scanner/ingestion-service;
# el root NO tiene scripts dev:*/test:* para este servicio)
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

## Estructura

```
src/
├── main.ts                          # bootstrap: Pino, ValidationPipe, CORS→:3030, listen 3031
├── app.module.ts                    # root: Config/EventEmitter/Schedule/TypeORM/Pino + 6 módulos
├── app.module.spec.ts
├── stream/                          # SSE fan-out
│   ├── stream.module.ts             # providers: StreamService, DisconnectionTracker
│   └── api/http/stream.controller.ts
│   └── application/services/stream.service.ts         # addClient/removeClient/broadcast/heartbeat @Cron 30s
│   └── application/services/disconnection-tracker.service.ts  # ventanas de desconexión (GAP 3)
├── media/                           # descarga + serving de adjuntos
│   ├── media.module.ts              # importa SharedModule (MediaDownloaderService vive ahí)
│   ├── api/http/media.controller.ts (+ .spec.ts)
│   └── application/services/media-downloader.service.ts
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
│   └── common/logging/ (structured-logger.service.ts + .spec.ts, logging.module.ts, index.ts)
└── telegram/
    ├── telegram.module.ts           # OnModuleInit: fetch canales backend → listener → coordinator; refresh 5min
    ├── debug/debug-telegram.controller.ts
    ├── kol/ (kol.module.ts + seeders/kol.seeder.ts + seeds/kol.seed.ts — 45 KOLs, DEPRECATED, solo compat)
    ├── crypto-news/ (crypto-news.module.ts — seeder ELIMINADO, 100% DB-driven)
    │   ├── seeds/crypto-news.seed.ts + seeders/crypto-news.seeder.ts (legado)
    │   └── infrastructure/persistence/typeorm/ (entities/crypto-news-source.entity.ts, repositories/crypto-news-source.repository.ts)
    └── shared/
        ├── shared.module.ts         # @Global: MTProto + coordinator + anti-ban + media + redis
        ├── ports/telegram-listener.port.ts
        ├── services/backend-channel-provider.service.ts  # GET backend :3030/.../active/ids
        ├── api/mtproto/telegram-mtproto-listener.adapter.ts
        ├── application/services/deduplication.service.ts (+ .spec.ts)
        ├── application/coordinators/ingestion.coordinator.ts (+ .integration.spec.ts)
        ├── domain/types/message-payload.ts (+ .spec.ts)
        ├── infrastructure/config/ingestion-safety.config.ts
        └── infrastructure/services/ (telegram-client-manager, telegram-peer-resolver, last-seen-manager, flood-wait-handler, flood-wait-counter, sleep-window, message-queue)
test/  (app.e2e-spec.ts, full-message-flow, stream-reconnection, load-test-concurrent-clients, metrics, E2E-TESTING-GUIDE.md, jest-e2e.json)
scripts/ (telegram-gen-session.ts, check-telegram-message.ts)
Raíz: package.json (@alpha-meta-token-scanner/ingestion-service), Dockerfile (multi-stage node:22-alpine, dumb-init, user nodejs, HEALTHCHECK :3031/api/health), .env{,.example,.production.template,.backup-before-regen}, eslint.config.mjs, nest-cli.json (deleteOutDir), tsconfig{,.build,.eslint}.json, jest.setup.ts, uploads/ (crypto-news/media/{channelId}/{messageId}_{index}.ext), coverage/, dist/
```

## Módulos (app.module.ts)

| Módulo                                        | Provee                                                                                                                                                                                                                                                                                                                                                | Notas                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SharedModule` (`telegram/shared`, `@Global`) | RedisService, IngestionSafetyConfig, BackendChannelProviderService, CryptoNewsSourceRepository, TelegramClientManager, `TelegramListenerPort`→`TelegramMtprotoListenerAdapter`, DeduplicationService, IngestionCoordinator, LastSeenManager, FloodWaitHandler/Counter, SleepWindowService, TelegramPeerResolver, MessageQueue, MediaDownloaderService | Evita circulares con Kol/CryptoNews/Media                                                                                                                     |
| `TelegramModule`                              | `DebugTelegramController`; `onModuleInit()` + `refreshChannels()` + `startListening()` + `scheduleChannelRefresh()` (5 min)                                                                                                                                                                                                                           | Sin canales → warn + no escucha; restart listener si cambia la lista                                                                                          |
| `KolModule`                                   | `KolSeeder` (`@deprecated`, env `INGESTION_TELEGRAM_SEED_CHANNELS` formato `kolId[,kolId]` o `kolId\|handle\|title`, o `kol.seed.ts` con 45 entradas)                                                                                                                                                                                                 | **DEPRECATED y doblemente inactivo**: `INGESTION_TELEGRAM_SEED_ENABLED` default `false` y `TelegramModule` ni lo invoca — canales reales vienen de backend DB |
| `CryptoNewsModule`                            | vacío (repo vía SharedModule)                                                                                                                                                                                                                                                                                                                         | Seeder eliminado; alta vía `POST /api/crypto-news/sources` en backend                                                                                         |
| `StreamModule`                                | StreamService, DisconnectionTracker, StreamController                                                                                                                                                                                                                                                                                                 | `ScheduleModule.forRoot()` para heartbeat                                                                                                                     |
| `MediaModule`                                 | MediaController (downloader importado de SharedModule)                                                                                                                                                                                                                                                                                                |                                                                                                                                                               |
| `HealthModule` / `MetricsModule`              | HealthController / MetricsService+Controller                                                                                                                                                                                                                                                                                                          | Prometheus vía `@willsoto/nestjs-prometheus` + `prom-client`                                                                                                  |
| Infra global                                  | `EventEmitterModule` (wildcard `.`, max 20), `ScheduleModule`, `LoggerModule` (pino-http + pino-pretty en no-prod), `TypeOrmModule` postgres solo `CryptoNewsSourceEntity`, `ValidationPipe{whitelist, forbidNonWhitelisted, transform}`                                                                                                              | CORS: `:3030` + `BACKEND_STAGING_URL` + `BACKEND_PROD_URL`, credentials true                                                                                  |

## Endpoints HTTP (10)

| Método + ruta                                                   | Controlador                      | Respuesta / notas                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/ingestion/stream`                                     | StreamController.stream          | SSE infinito; registra `clientId=randomUUID()`; `connection:established` inicial; cleanup en `close`/`error`                                                                                                                                                                                                                         |
| `GET /api/ingestion/backfill/:channelId?limit=1..100` (def 100) | StreamController.backfill        | ⚠️ **NO implementado**: `TelegramMtprotoListenerAdapter.backfill()` lanza `Error('Backfill not supported')` → siempre responde SSE `backfill:error` (tras headers 200). 503 si MTProto no listo; 400 en límite inválido                                                                                                              |
| `GET /api/ingestion/stream/status`                              | StreamController.getStreamStatus | `{status, connectedClients, clients[{id, connectedAt, uptimeSeconds}]}`                                                                                                                                                                                                                                                              |
| `GET /api/media/:channelId/:messageId/:index`                   | MediaController.serveMedia       | Stream archivo `{messageId}_{index}.*` desde `uploads/crypto-news/media/{channelId}/`; 400 params no numéricos; 404 dir/archivo; `Cache-Control: public, max-age=31536000` + ETag + Accept-Ranges                                                                                                                                    |
| `GET /api/health`                                               | HealthController.getHealth       | ⚠️ **Stubs**: `HealthModule` provee `'TelegramClientManager' → null` y `'FloodWaitCounter' → null` → responde `mtproto{connected:true, authorized:true}` por fallback, `channels` todo `0`, sin `floodWait`. El manager real ni implementa esa interfaz (ver Gaps). `warnings[]` sí funciona (ventanas >60 s); 200 ok / 503 degraded |
| `GET /api/health/ready` / `GET /api/health/live`                | HealthController                 | readiness (acepta SSE) / liveness (proceso vivo) — únicos endpoints con datos reales                                                                                                                                                                                                                                                 |
| `GET /api/health/channels`                                      | HealthController.getChannels     | ⚠️ Siempre `[]` (ClientManager stub null)                                                                                                                                                                                                                                                                                            |
| `GET /metrics`                                                  | MetricsController                | ⚠️ Expone el endpoint pero **nadie actualiza las métricas** (ver Gaps): gauges en 0 + defaults de Node                                                                                                                                                                                                                               |
| `GET /debug/telegram/message/:channelId/:messageId`             | DebugTelegramController          | Inspección cruda (text fields, fwdFrom, media, entities, groupedId) — solo debug                                                                                                                                                                                                                                                     |

Eventos SSE: `connection:established`, `message:telegram`, `backfill:message`, `backfill:complete`, `backfill:error`, `health:ping` (cada 30 s, con `uptime`+`connectedClients`). Formato: `event: <type>\ndata: <json>\n\n`.

## Pipeline de mensajes

```
MTProto listener — doble vía:
 (a) realtime: NewMessage({}) → handleEvent → filtra subscribedChannelIds → transformMessage → MessageQueue
 (b) polling cada 30 s fijos: getMessages(peer, {minId: lastSeen, limit: 50}) con FloodWaitHandler.withRetry → transformMessage → MessageQueue
 → subscribe() yield cola → TelegramModule.startListening clasifica kol|crypto-news (pertenencia a newsIds)
 → IngestionCoordinator.route(raw, type): lastSeen.set → transformToPayload → stream.broadcast({type:'message:telegram'})
 → backends SSE (dev/staging/prod) consumen
```

Notas de path real:

- `transformMessage` extrae texto con prioridad `message → text → media.caption → fwdFrom.message` (`''` si nada) y descarga media **solo para crypto-news** (cache DB `crypto_news_sources`, refresh 5 min; KOL nunca descarga; solo `MessageMediaPhoto` + documentos video).
- ⚠️ `DeduplicationService` está inyectado en el coordinator pero `route()` **nunca llama `isDuplicate()`** — la "dedup at source" no se aplica (realtime no filtra; solo el polling salta `id <= lastSeen`).
- `subscribe()` lanza si ya corre (single-listener); sin sesión autorizada queda en idle silencioso (`running=true`, sin yield); `disconnect()` solo hace `queue.flush()` (despierta UN waiter), no cierra el cliente MTProto.
- Logs de debug verbosos activos en el path (`[MSG-TRANSFORM-DEBUG]`, `[TEXT-EXTRACTION-DEBUG]`, `[MEDIA-DEBUG]`, `[PAYLOAD-TRANSFORM-DEBUG]`, caso especial mensaje 167) — candidatos a limpiar/bajar a `debug`.

`MessagePayload` (`telegram/shared/domain/types/message-payload.ts`): `{peerId, messageId, occurredAt(ISO), text?, media: MediaPayload[], entities?, groupedId?, messageType}`.

- **Invariante ToS**: `text` **excluido para KOL** (el backend lo extrae por su pipeline), **incluido para crypto-news** (contenido opaco, se guarda tal cual).
- `MediaPayload`: `{type: photo|video, index, url: {baseUrl}/api/media/{channelId}/{messageId}/{index}, mimeType, fileSize}`.
- Broadcast secuencial por canal; errores por mensaje se loguean sin tumbar el listener; dedup stats vía `getStats()`.

`BackendChannelProviderService`: `fetchActiveKolIds()` → `GET localhost:{BACKEND_PORT}/telegram-kol/identity/kols/active/ids`; `fetchActiveCryptoNewsSourceIds()` → `GET .../crypto-news/sources/active/ids`; `fetchAllActiveChannelIds()` combina. Fallo → `[]` (conserva lista previa).

## Servicios clave

- `TelegramClientManager` — singleton lazy (`ensureClient`, `connect`, `disconnect`, `markAuthorizedIfTrue` con timeout 20 s, `isAuthorized()` sync). ⚠️ Lee `cfg.telegram.mtprotoLogLevel/mtprotoUseWss/mtprotoStartupDelayMs`, keys que `app.config` nunca expone → siempre defaults (GramJS log ERROR, sin WSS, sin delay). `getClient()` usado por debug controller.
- `TelegramMtprotoListenerAdapter` — implementa `TelegramListenerPort` (`subscribe`, `resolveChannelMetadata`/`joinChannel` vía `TelegramPeerResolver`, `disconnect`). ⚠️ Su `onModuleInit` chequea `cfg?.telegram?.mtprotoApiId/mtprotoApiHash` (keys inexistentes) → `markAuthorizedIfTrue()` nunca se invoca ahí; el subscribe hace su propio `connect()+isUserAuthorized()`. `filterChannels()` es código muerto (se pollean todos los peers, incluidos bots). Comentario de cabecera desactualizado ("no media download" — sí descarga para crypto-news).
- `MediaDownloaderService.download(client, channelId, messageId, index, media)` → `{filePath(abs), mimeType, fileSize}`; sanitiza channelId (`[^a-zA-Z0-9-]`), ext por tipo (photo→`.jpg`, document por mimeMap o `.bin`), `mkdir -p`, `client.downloadMedia` con `FloodWaitHandler.withRetry`, buffer→`uploads/crypto-news/media/{channel}/`. Ojo: `fileReference` de Telegram expira (~1 h) — la descarga es síncrona a ingestión por diseño.
- Anti-ban: `IngestionSafetyConfig` (maxChannels ≤100, pollBase ≥30 s, jitter %, sleep window `04:00–08:00 UTC`, flood backoff 5 s×2 hasta 1 h, 5 intentos, umbral 10/24 h) + `FloodWaitHandler.withRetry` (extrae segundos solo de errores con marcador `FLOOD_WAIT`; pausa 1 h tras agotar intentos) + `FloodWaitCounter` (ventana 24 h; ⚠️ `getConsecutiveFailures()` hardcodeado a 0) + `MessageQueue` + `LastSeenManager` (cursor Redis `ingestion:lastSeen:{peer normalizado sin @/-100}`, sin TTL) + `TelegramPeerResolver` (resuelve `@user`, numérico, `-100`; fallback sin prefijo para legacy) + `joinChannel` (`Api.channels.JoinChannel`, taxonomía: `USER_ALREADY_PARTICIPANT`→ya miembro, `CHANNEL_PRIVATE/INVALID`, `CHANNELS_TOO_MUCH`, `FLOOD_WAIT` passthrough).
- ⚠️ `SleepWindowService.isAsleep()/getNextWakeTime()` (rotación diaria ±30 min) **nadie lo llama** — el polling no respeta sleep window.
- `StreamService` — Map clientes, headers SSE (`no-cache`, `X-Accel-Buffering: no`), `broadcast` con purga de muertos, `shutdown()`.
- `DisconnectionTracker` — `recordReconnection/recordDisconnection`, `getDisconnectionWindows/hasLongDisconnectionWindow` (>60 s → warning en `/api/health`), `getStatistics()`, máx 100 ventanas.
- `MetricsService` — define `ingestion_mtproto_connected`, `messages_received_total{channelId,type}`, `messages_broadcast_total`, `messages_broadcast_duration_seconds` (p95 <500 ms), `sse_clients_connected`, `flood_wait_count_24h`, `media_downloads_total{type}`, `api_request_duration_seconds{endpoint,method,status}` sobre `Registry` propio (`PrometheusModule` con defaults activados). ⚠️ **Ningún servicio lo inyecta**: contadores/gauges siempre en 0. (`InjectMetric` importado sin uso.)
- `RedisService` (`shared/common/`) — `lazyConnect`, retry máx 3 (200 ms×n, cap 2 s); `getClient()` lanza si disabled → `LastSeenManager.load` lo captura por peer (warn); `persist` chequea `isEnabled()`. Sin TTL en cursores.
- `StructuredLoggerService` (`shared/common/logging/`) — logs estructurados (`sse:client:connected`, `message:received`, `flood_wait:detected`).

## Configuración (`shared/common/config/app.config.ts`)

`registerAs('app')` → `{nodeEnv, telegram{apiId,apiHash,sessionString}, seedKols, seedNews, api{port,host,baseUrl}, redis{enabled,host,port,password,db}, uploads{root,mediaPath}, ingestionSafety{...}, database{...}, logging{level}}`. Validación class-validator (telegram/api/redis/uploads/safety/database/logging). Seeds: `INGESTION_TELEGRAM_SEED_KOLS` (JSON, `[]` si falla); `INGESTION_TELEGRAM_SEED_NEWS` (JSON o fallback `CRYPTO_NEWS_SEED`). Safety: env > `config/ingestion.config.json` > defaults. DB opcional (`DATABASE_ENABLED`), `synchronize:false` en prod.

Vars (ver `.env.example` / `.env.production.template` — prod usa hosts docker `onchain-bot-ingestion:3031`, `onchain-bot-redis`, `onchain-bot-postgres`, 45 KOLs en seed): `INGESTION_TELEGRAM_MTPROTO_API_ID/HASH/SESSION`, `INGESTION_PORT` (ojo: código lee `INGESTION_API_PORT` en app.config y `PORT` en main.ts — mantener los tres alineados a 3031), `INGESTION_API_HOST/BASE_URL`, `INGESTION_REDIS_*`, `INGESTION_DATABASE_*` (+`DATABASE_ENABLED`), `INGESTION_TELEGRAM_SEED_KOLS/NEWS`, `INGESTION_SAFETY_*`, `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` (72 h), `INGESTION_LOG_LEVEL/FORMAT`, `INGESTION_UPLOADS_ROOT`, `BACKEND_PORT`, `BACKEND_STAGING_URL/BACKEND_PROD_URL`, `NODE_ENV`.

⚠️ **Doble lectura de safety config, con schemas incompatibles**: `app.config.ts loadSafetyConfig()` espera `sleepWindow{start,end,timezone}` + `floodProtection{initialBackoffMs,...}` (coincide con `config/ingestion.config.json` del repo root), mientras la clase `IngestionSafetyConfig` espera `sleepWindow{startUtc,endUtc}` + `floodProtection{initialMs,multiplier,maxMs}` → del archivo solo matchean los defaults numéricos; además la clase ignora env vars. Y en dev (`cwd=apps/ingestion-service`) el archivo ni existe → siempre defaults + warn; solo en Docker (`cwd=/app`, el Dockerfile copia `config/`) se encuentra.

## Gaps conocidos (verificados contra código — no reintroducir como "features")

1. **Backfill roto**: `adapter.backfill()` lanza siempre. El endpoint existe pero solo emite `backfill:error`.
2. **Health con stubs null**: `/api/health` y `/api/health/channels` no reflejan estado real. Cablear `TelegramClientManager`/`FloodWaitCounter` reales (la interfaz que `HealthController` espera — `isConnected()`, `getChannelCount()`, etc. — no existe en el manager actual).
3. **Dedup sin aplicar**: llamar `deduplicationService.isDuplicate()` en `IngestionCoordinator.route()` (o en el adapter) para cumplir Invariante 3.
4. **Métricas sin alimentar**: inyectar `MetricsService` en adapter/coordinator/stream y actualizar contadores (el README de `src/metrics/` ya documenta cómo).
5. **Sleep window sin aplicar**: chequear `sleepWindowService.isAsleep()` en `startPollingLoop()`.
6. **`TelegramClientManager` lee keys inexistentes** (`mtprotoLogLevel/mtprotoUseWss/mtprotoStartupDelayMs`): exponerlas en `app.config` o eliminar la lectura.
7. **Adapter `onModuleInit` muerto**: usa `telegram.mtprotoApiId/mtprotoApiHash` en vez de `telegram.apiId/apiHash`.
8. **`FloodWaitCounter.getConsecutiveFailures()` hardcodeado a 0** (lo trackea el handler).
9. **`MessageQueue.flush()` despierta un solo waiter y no vacía la cola**; `disconnect()` no cierra el cliente.
10. **Logs debug verbosos en path caliente** (`[MSG-TRANSFORM-DEBUG]`, `[TEXT-EXTRACTION-DEBUG]`, `[MEDIA-DEBUG]`, `[PAYLOAD-TRANSFORM-DEBUG]`, branch mensaje 167): bajar a `debug` o eliminar.
11. **`scripts/check-telegram-message.ts` desactualizado**: lee `TELEGRAM_MTPROTO_*` (sin prefijo `INGESTION_`) y trae canal/mensaje hardcodeados (`-1004466661332:167`).
12. **Triple var de puerto** (`INGESTION_PORT` vs `INGESTION_API_PORT` vs `PORT`): unificar.
13. **Sin script root**: el root `package.json` no tiene `dev:ingestion`; se corre con `npm run start:dev -w @alpha-meta-token-scanner/ingestion-service` o `cd apps/ingestion-service`.
14. **Fail-open silencioso**: si la DB falla, `findAllActive()` retorna `[]` → cero canales news (todo se etiqueta `kol`, sin descarga de media) y el provider HTTP retorna `[]` → el servicio queda sin escucha con solo un warn. Considerar `degraded` explícito en `/api/health/live`.

## Gaps nuevos (segunda pasada — verificados con grep contra `src/`)

15. **El refresh de canales cada 5 min es inefectivo**: `TelegramModule.refreshChannels()` llama `startListening()` de nuevo, pero `adapter.subscribe()` lanza `Error('Telegram listener already running')` (single-listener) → queda atrapado como "Listener restart failed". Canales nuevos requieren reinicio del proceso. El snapshot `peers` del polling loop tampoco se actualiza.
16. **Config anti-ban decorativa**: `maxChannels`, `pollIntervalBaseMs`, `jitterPercent` se parsean/testean pero **ningún código runtime los consume** — el polling es 30 s fijos sin jitter y sin tope de canales. Solo `floodInitialMs/Multiplier/MaxMs/MaxAttempts` llegan a usarse (vía `FloodWaitHandler`).
17. **`seedKols`/`seedNews` muertos**: `app.config` los produce (incluye import de `CRYPTO_NEWS_SEED` como fallback) pero nada fuera de `app.config.spec.ts` los lee. `validateConfig()` definida y jamás invocada → sin fail-fast (ej. `apiId=0`, hash vacío se detectan tarde, como listener en idle).
18. **Retención de media sin janitor**: `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS` no la consume ningún cron/servicio → `uploads/` crece sin límite. `floodProtection.threshold24h` igual: nadie lo evalúa.
19. **Sin auth en ningún endpoint**: SSE, media, health, metrics y `debug/telegram/message/:channelId/:messageId` (acceso MTProto arbitrario) expuestos sin guard/API key. `MediaController` no sanitiza `channelId` (el downloader sí) → `path.join` con `../` permite listar/servir fuera de `uploads/` (traversal de lectura).
20. **`Accept-Ranges` ficticio**: se anuncia `Accept-Ranges: bytes` pero siempre se sirve 200 con el archivo completo — sin 206 ni `If-None-Match` (el ETag emitido nunca se evalúa). Seeking de video roto.
21. **Inundación en arranque frío**: `LastSeenManager.get()` default `-1` → primer polling pide `{minId: -1, limit: 50}` y emite hasta 50 mensajes históricos como nuevos; realtime+polling pueden duplicar el mismo mensaje (sin dedup, gap 3). Si Redis cae, los cursores se pierden y el reflood se repite en cada reinicio.
22. **SSE sin recuperación**: sin `Last-Event-ID`/buffer de replay; el cliente que se desconecta pierde mensajes y el único camino de recuperación (backfill) está roto (gap 1). Pérdida silenciosa garantizada ante cortes.
23. **Arranque acoplado a Postgres**: `TypeOrmModule.forRootAsync` sin retry — caída de Postgres en boot tumba todo el servicio aunque el streaming no necesita la DB. Y el `HEALTHCHECK` Docker contra `/api/health` siempre da 200 por los stubs (gap 2) → contenedor "healthy" con MTProto muerto.
24. **Código muerto que embarca**: `KolSeeder.seed()` jamás invocado, `seeders/crypto-news.seeder.ts` fuera de providers, `KOL_SEED` (45 entradas) y `CRYPTO_NEWS_SEED` sin consumidores runtime, `filterChannels()` sin llamadas, `ImportMetric` importado sin uso.
25. **Provider HTTP frágil**: `BackendChannelProviderService` usa `fetch` global sin timeout contra `localhost:{BACKEND_PORT}` hardcodeado — en Docker eso no resuelve al backend (nombres `onchain-bot-*`), y un backend colgado congela `refreshChannels()` sin límite (solapa intervalos de 5 min).

## Persistencia / Docker

- **TypeORM**: solo `CryptoNewsSourceEntity` (tabla `crypto_news_sources`, **read-only** aquí — altas por API del backend; filtro `lifecycleStatus='ACTIVE' AND isActive=true` en `CryptoNewsSourceRepository.findAllActive()`); resto es streaming sin escritura local. Migraciones del backend, no aquí.
- **Dockerfile**: build `node:22-alpine` (`npm ci --workspace=... --ignore-scripts`, `HUSKY=0`) → runtime con `dumb-init`, usuario `nodejs`, `uploads/crypto-news/media`, `EXPOSE 3031`, `HEALTHCHECK /api/health` (ver gap 23: siempre 200 por stubs), `CMD node apps/ingestion-service/dist/src/main.js`.
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

Unit co-locados (`*.spec.ts`): `app.module`, `stream.service`, `disconnection-tracker`, `stream.controller`, `media.controller`, `health.controller`, `metrics.service`+`controller`, `app.config`, `structured-logger`, `deduplication`, `message-payload`, `ingestion.coordinator.integration`.

| E2E (`test/`)                        | Qué valida                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `app.e2e-spec.ts` (25)               | smoke mínimo: solo verifica 404 en `GET /` con `AppModule` completo                                               |
| `full-message-flow` (703 líneas)     | inyecta vía `StreamService.broadcast()` (simula MTProto), formato payload, URLs de media, latencia <500 ms        |
| `stream-reconnection` (462)          | reconexión con backoff exponencial 1 s→30 s, reconexión <30 s, Req 2.4/8.4                                        |
| `load-test-concurrent-clients` (664) | 10 clientes, 100 msg/min, p50/p95/p99, memoria, cero drops (Req 8.1/8.2/8.5)                                      |
| `metrics` (72)                       | `GET /metrics` 200 + `text/plain` + formato Prometheus                                                            |
| `E2E-TESTING-GUIDE.md`               | estrategia + troubleshooting (`AUTH_KEY_DUPLICATED`, SSH túneles, validación side-by-side prod-vs-staging ≥99.9%) |

⚠️ **Restricción MTProto en tests**: prohibido inicializar `TelegramClient` en tests locales mientras el droplet corre (sesión única → `406 AUTH_KEY_DUPLICATED`). Los e2e levantan `AppModule` completo en memoria e inyectan por `StreamService`; contra droplet usan `INGESTION_SERVICE_URL=http://144.126.203.139:3032` + `eventsource`.
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

Ejemplo `message:telegram` (KOL: sin `text`; crypto-news: con `text`):

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

Requisitos del cliente (Req 2.4): reconexión con backoff 1 s→30 s; **sin** `Last-Event-ID`/replay (gap 22) — diseña el consumidor tolerante a huecos. Backends resuelven la URL base por `INGESTION_SERVICE_URL`.

## Deploy

Imagen: `ghcr.io/bryanstevensacosta/onchain-bot-ingestion:latest`.

| Compose (`apps/backend/`)           | Uso                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.ingestion.yml`      | standalone en droplet: host `127.0.0.1:3032` → container `3031` (3032 evita choque con staging en 3031); `INGESTION_PORT: 3031` interno; healthcheck a `:3031/api/health`                                       |
| `docker-compose.with-ingestion.yml` | extiende prod: build local del Dockerfile, `PORT: 3031`, backend con `INGESTION_SERVICE_URL: http://ingestion-service:3031` + volumen de media en **read-only** (ingestion owns writes), `depends_on` ingestion |

Notas: `with-ingestion` referencia `../ingestion-service/.env.production` — **no existe en el repo** (solo `.env.production.template`); crearlo desde la plantilla en el droplet, nunca commitear. Los e2e contra droplet usan el puerto host **3032**. En red Docker el provider HTTP a `localhost:3030` no resuelve al backend (gap 25).

## Variables de entorno (`.env.example`, 102 líneas)

| Var                                                                   | Default ejemplo                                            | Consume                                                                      | Notas                                                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INGESTION_TELEGRAM_MTPROTO_API_ID/HASH/SESSION`                      | `12345678`/…                                               | `telegram.*` (requerido)                                                     | De `https://my.telegram.org/apps`; sesión vía `npm run telegram:gen-session`. ⚠️ El ejemplo dice `cd apps/backend && npm run telegram:gen-session` — stale, el script vive aquí |
| `INGESTION_PORT`                                                      | `3031`                                                     | ⚠️ **Nada**: app.config lee `INGESTION_API_PORT`, main `PORT` (gap 12)       | Solo documentada; el ejemplo ni menciona las que sí se leen                                                                                                                     |
| `INGESTION_API_BASE_URL`                                              | `http://localhost:3031`                                    | URLs de media en SSE                                                         | En prod es `http://onchain-bot-ingestion:3031` (template)                                                                                                                       |
| `INGESTION_REDIS_HOST/PORT/DB/PASSWORD`                               | `localhost/6379/0/(vacío)`                                 | `redis.*` (habilitado salvo `INGESTION_REDIS_ENABLED=false`)                 | Sin Redis: cursores en memoria, reflood al reiniciar (gap 21)                                                                                                                   |
| `INGESTION_DATABASE_HOST/PORT/NAME/USER/PASSWORD/SYNCHRONIZE/LOGGING` | `localhost/5432/onchain_bot/postgres/postgres/false/false` | `database.*` + `DATABASE_ENABLED`                                            | ⚠️ El ejemplo dice "REQUIRED for raw text storage" — stale: aquí no se guarda texto, la DB solo se lee (`crypto_news_sources`)                                                  |
| `INGESTION_TELEGRAM_SEED_KOLS/NEWS`                                   | `[]`                                                       | ⚠️ **Nada runtime** (gap 17)                                                 | Formato `[{channelId, displayName}]` según ejemplo; el seeder real espera `kolId[,kolId]`/`kolId\|handle\|title` — formatos inconsistentes                                      |
| `INGESTION_SAFETY_*` (12 vars)                                        | ver ejemplo                                                | `ingestionSafety.*` (mayoría decorativa, gap 16)                             | Solo flood backoff/attempts tienen efecto                                                                                                                                       |
| `INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS`                         | `72`                                                       | ⚠️ **Nada** (gap 18)                                                         | Sin janitor                                                                                                                                                                     |
| `INGESTION_LOG_LEVEL/FORMAT`                                          | `info/json`                                                | `logging.level` (⚠️ `FORMAT` no se consume: pretty se decide por `NODE_ENV`) |                                                                                                                                                                                 |
| `NODE_ENV`                                                            | `production`                                               | `nodeEnv`, pretty vs JSON                                                    |                                                                                                                                                                                 |
| `BACKEND_PORT` / `BACKEND_STAGING_URL` / `BACKEND_PROD_URL`           | —                                                          | provider (`localhost:{BACKEND_PORT}`), CORS                                  | ⚠️ Ausentes en `.env.example` aunque el código las lee — solo están en `.env.production.template`                                                                               |

## Dependencias (`package.json`)

Runtime: `telegram@^2.26.22` (GramJS MTProto), `@nestjs/*` v11 + `@willsoto/nestjs-prometheus`, `nestjs-pino@^4.6.1` + `pino@^10.3.1`, `ioredis@^5.4.1`, `typeorm@^0.3.30` + `pg@^8.22.0`, `prom-client@^15.1.3`, `class-validator/transformer`, `dotenv@^17.4.2`. Dev/test: `eventsource@^5.1.1` (cliente SSE en e2e), `supertest@^7`, `ts-jest@^29`, `typescript@^5.7.3`. Workspace npm `apps/*` (`@alpha-meta-token-scanner/ingestion-service`).

## Relaciones con otras apps

```
apps/backend ──GET :3030/telegram-kol/identity/kols/active/ids ──→ ingestion (canales KOL)
apps/backend ──GET :3030/crypto-news/sources/active/ids ─────────→ ingestion (canales news)
apps/backend ──SSE GET :3031/api/ingestion/stream ───────────────→ ingestion (consume MessagePayload)
apps/backend ──GET :3031/api/media/... (INGESTION_SERVICE_URL) ──→ ingestion (adjuntos; volumen compartido ro en with-ingestion)
ingestion ──lee──→ crypto_news_sources (misma Postgres del backend, read-only)
```

La ingestión no escribe en DB del backend ni publica en su event bus: todo el acoplamiento son 2 endpoints HTTP de lectura + SSE + media. Credenciales MTProto: propiedad exclusiva de este servicio.

## Actividad reciente (git, `apps/ingestion-service`)

Últimos commits (hasta 2026-09-03): migración seed→DB (`replace seed-based subscription with DB-driven channel lists`, `replace crypto-news seed with DB query`, `remove crypto-news seeder and enforce DB-driven architecture`), fixes de ingestión crypto-news + DB cache, `prevent AUTH_KEY_UNREGISTERED filtering users/bots`, `remove /api prefix from backend endpoint URLs`, limpieza de credenciales reales en templates. Dirección: eliminar listas estáticas y endurecer anti-ban/sesión — coherente con gaps 15/17/24 (quitar, no revivir, el código seed).

## Convenciones

- **Aliases** (`tsconfig.json`, espejados en `package.json` jest `moduleNameMapper`): `shared/*`, `telegram/*`, `stream/*`, `media/*`, `health/*`, `src/*` (+ `shared/kernel/*`, `shared/common/*`). No `@/*` aquí.
- **ESLint flat** (`eslint.config.mjs`, `recommendedTypeChecked` + prettier): `no-explicit-any off`, `require-await off`, `no-floating-promises/no-unsafe-*/await-thenable/no-useless-catch/prefer-promise-reject-errors warn`, `no-unused-vars warn (^_)`, `prettier/prettier error (endOfLine auto)`; specs relajan `unbound-method` + `no-unsafe-*`. Excluye `src/**/*.spec.ts(.bak)` del build (`tsconfig.json`), `nest-cli.json: deleteOutDir`.
- **Estilo**: comentarios `Per Requirement X / Per GAP N / Per Invariant N` obligatorios en cambios de pipeline; `Logger` por clase; no `any` cruzando `MessagePayload`; nunca publicar sin `commit`-equivalente (broadcast solo tras transformar); no tocar `uploads/` a mano.

## Antipatrones del servicio

- Texto crudo KOL nunca sale con `text` por SSE (ToS fix-1); crypto-news sí.
- `MediaDownloaderService` solo en SharedModule — no duplicar providers (rompe circulares con MediaModule).
- `TelegramModule.refreshChannels()` conserva lista previa ante fallo de backend; no vaciar canales en error.
- `KolSeeder/CryptoNewsSeeder` legado: no añadir canales por seeds; alta por API del backend.
- `parseLimit` backfill 1–100 estricto; heartbeat 30 s no desactivar (proxies cortan SSE idle).
