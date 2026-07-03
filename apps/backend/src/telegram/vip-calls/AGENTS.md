# telegram/vip-calls/ — VIP Calls BC

## OVERVIEW

`vip-calls` es el **Bounded Context principal** del subsistema de Telegram dedicado a publicar **alpha calls** y **milestone notifications** al canal VIP. Maneja el ciclo de vida completo desde que un token es aprobado por el pipeline de filtros hasta que se publica en Telegram, más el seguimiento de logros (multiples X) a lo largo del tiempo.

Está compuesto por **3 sub-BCs**:

1. **vip-channel/** — publicación de calls y persistencia en `vip-published-calls`.
2. **vip-decisions/** — listeners de aprobación/rechazo que orquestan el flujo.
3. **vip-achievement/** — publicación de milestone notifications (2x, 5x, 10x…) en el mismo canal.

Y un módulo transversal:

- **shared/** — ports, publishers y adaptadores compartidos por los 3 sub-BCs.

> **Convención de nombres**: los nombres de tabla deben llevar el prefijo `vip-` (e.g. `vip-published-calls`). Las BCs con nombres no prefijados están en proceso de refactorización.

## STRUCTURE

```
vip-calls/
├── shared/                     # Cross-cutting infrastructure
│   ├── index.ts
│   ├── shared.module.ts
│   ├── application/ports/
│   │   ├── vip-call-publishing.port.ts        # Puerto outbound (legacy)
│   │   └── vip-achievement-publishing.port.ts # Puerto outbound para milestones
│   └── infrastructure/senders/
│       └── bot-api-telegram-publisher.adapter.ts   # Adapter único compartido
│
├── vip-channel/                # ★ PUBLICACIÓN DE CALLS
│   ├── api/http/
│   │   └── vip-calls.controller.ts            # REST endpoints
│   ├── application/handlers/
│   │   ├── vip-calls-publish.use-case.ts      # ★ Flujo principal de publicación
│   │   ├── vip-calls-list-published.use-case.ts
│   │   └── reconcile-stuck-reservations.use-case.ts
│   ├── application/services/
│   │   └── ticker-resolver.service.ts         # Cascading fallback 9-level
│   ├── domain/                                 # (el dominio vive en telegram/shared)
│   ├── infrastructure/
│   │   ├── event-bus/
│   │   │   ├── token-approved-publish.handler.ts      # Listener principal
│   │   │   ├── token-approved-publish.handler.spec.ts
│   │   │   ├── token-approved-publish-preservation.spec.ts
│   │   │   ├── token-approved-publish-bug-exploration.spec.ts  # INVARIANT
│   │   │   ├── token-approved-publish-ticker-bug-exploration.spec.ts  # INVARIANT
│   │   │   └── ticker-null-bug-exploration.spec.ts    # INVARIANT
│   │   ├── formatters/
│   │   │   └── vip-message-formatter.adapter.ts       # Markdown + keyboards
│   │   ├── persistence/typeorm/
│   │   │   ├── entities/published-call.entity.ts      # ORM entity
│   │   │   ├── repositories/typeorm-published-call.repository.ts
│   │   │   └── mappers/published-call.mapper.ts
│   │   ├── repositories/in-memory-published-call.repository.ts
│   │   └── schedulers/
│   │       └── reconcile-stuck-reservations.scheduler.ts   # Cada 30s
│   └── vip-channel.module.ts
│
├── vip-decisions/              # ★ ORQUESTACIÓN DECISIONAL
│   ├── infrastructure/event-bus/
│   │   ├── vip-call-approved.handler.ts
│   │   └── vip-call-rejected.handler.ts
│   └── decisions.module.ts
│
└── vip-achievement/            # ★ MILESTONE NOTIFICATIONS (2x, 5x, 10x...)
    ├── infrastructure/event-bus/
    │   └── achievement-reached.handler.ts     # Listener de CallAchievementReachedEvent
    └── (esperando refactor)
```

## DATABASE — TABLAS Y COLUMNAS

### Tabla `vip-published-calls` (alias actual: `published_calls`)

Tabla principal del BC. Almacena cada intento de publicación.

| Columna | Tipo | Nulleable | Descripción |
|---------|------|-----------|-------------|
| `id` | `varchar` | NOT NULL (PK) | `${chain}:${address}` |
| `chain` | `varchar(32)` | NOT NULL | ej. `solana`, `ethereum` |
| `address` | `varchar` | NOT NULL | dirección del token |
| `ticker` | `varchar(32)` | nullable | ej. `mFGAS`, `CZ` |
| `score` | `integer` | NOT NULL | score del token |
| `tier` | `varchar(32)` | NOT NULL | ej. `NEUTRAL` |
| `classification` | `varchar(64)` | NOT NULL | ej. `TOKEN` |
| `message` | `text` | NOT NULL | contenido completo del mensaje publicado |
| `status` | `varchar(16)` | NOT NULL | `RESERVED` / `PUBLISHED` / `FAILED` |
| `published_channel_ids` | `jsonb` | nullable | canales donde se publicó |
| `failed_channel_ids` | `jsonb` | nullable | canales donde falló |
| `published_at` | `timestamptz` | NOT NULL | fecha de publicación |
| `mc_at_call` | `numeric` | nullable | market cap al momento del call |
| `telegram_message_id` | `bigint` | nullable (UNIQUE parcial) | ID del mensaje en Telegram |
| `reserved_at` | `timestamptz` | nullable | cuándo se reservó el slot |
| `correlation_id` | `varchar(64)` | nullable | correlación del pipeline |
| `failed_reason` | `text` | nullable | motivo del fallo |

### Tabla `vip-notified-achievements` (alias actual: `notified_achievements`)

Tabla para tracking de notificaciones de milestone. **Migrará desde `token/achievement/` como parte del refactor vip-calls.**

| Columna | Tipo | Nulleable | Descripción |
|---------|------|-----------|-------------|
| `id` | `uuid` (auto) | NOT NULL (PK) | UUID generado |
| `call_id` | `varchar` | NOT NULL | `${chain}:${address}` del call original |
| `threshold` | `double precision` | NOT NULL | ej. 86 (representa 86x) |
| `notified_at` | `timestamptz` | NOT NULL | cuándo se notificó |
| `telegram_message_id` | `bigint` | nullable | ID del mensaje de milestone |

### Relación entre tablas

```
vip-published-calls (1) ──── (N) vip-notified-achievements
       call_id = id
```

Cada published call puede tener múltiples notificaciones de milestone (una por cada threshold cruzado: 2x, 5x, 10x, 86x, etc.).

## FLUJO COMPLETO DEL PIPELINE

### Flujo de Publicación Inicial (Publish)

```
┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE PRINCIPAL (de token/)                                  │
└─────────────────────────────────────────────────────────────────┘

scoring.token.scored
    └── ApplyFiltersUseCase
            └── filters.token.approved ──┐
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  vip-calls/vip-decisions                                         │
│  VipCallApprovedHandler (orchestrator listener, logs)           │
└──────────────────┬──────────────────────────────────────────────┘
                   │ (vip-call.approval.approved)
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  vip-calls/vip-channel                                          │
│  TokenApprovedPublishHandler                                     │
│   1. Check dedup via PublishedCallRepository                     │
│   2. Resolve ticker (DB → cascading fallback 9-levels)           │
│   3. Hydrate desde CanonicalTokenCall + TokenSnapshot            │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
       VipCallsPublishUseCase
   ┌─ (1) entered ─ correlationId
   ├─ (2) tryReserve ─ atomic insert RESERVED
   │      ├─ si row existe → return snapshot
   │      └─ si no → RESERVED row creada
   ├─ (3) before_sendMessage
   ├─ (3a) sendMessage via VipCallsBotApiPublisherAdapter
   │         ├─ si ok → messageId
   │         └─ si throw → markFailed + rethrow
   ├─ (3b) after_sendMessage
   ├─ (4) before_finalize
   ├─ (4) finalize(id, {status, telegramMessageId, failedReason})
   │         ├─ PUBLISHED → publishedAt=new Date(), publishedChannelIds=[vip-calls]
   │         └─ FAILED    → failedChannelIds=[vip-calls], failedReason=...
   ├─ (5) after_finalize
   ├─ (5) publishAll(call.commit())  ← emite CallPublishedEvent o CallPublishFailedEvent
   ├─ (6) SI isPublished && mcAtCall>0:
   │         emit RegisterCallForAchievementsEvent
   └─ (7) returning output
       │
       ▼
   emit filters.token.approved (entrante)
       │
       ▼
   vip-calls/published_calls row creada (status=PUBLISHED)
```

### Flujo de Milestone Notifications (Achievement)

```
┌─────────────────────────────────────────────────────────────────┐
│  vip-calls/vip-channel (paso 6)                                  │
│  emit RegisterCallForAchievementsEvent                            │
│   payload: { callId, chain, address, publishedAt }                │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  token/achievement/ (PERO migrará a vip-calls/vip-achievement/)  │
│  RegisterCallForAchievementsHandler → RegisterMonitoredCallUseCase│
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
   monitored_calls row creada (mcAtCall)
       │
       ▼ (cron: LiveAchievementScheduler)
   EvaluateActiveCallsUseCase (cada batchSize, default 30)
       │
       ├─ fetch current MC via LiveMarketDataPort (DexScreener)
       ├─ compute athMultiple = mcNow / mcAtCall
       ├─ detect crossed thresholds (2x, 5x, ... 86x)
       └─ RecordNotifiedAchievementUseCase
           ├─ INSERT notified_achievements
           └─ publish CallAchievementReachedEvent
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│  vip-calls/vip-achievement                                      │
│  AchievementReachedHandler                                       │
│   1. formatMilestoneMessage() ← "🚀 MILESTONE 86x 🟣 $SOLANA"  │
│   2. sendMessage via VipCallsBotApiPublisherAdapter              │
│   3. notifiedRepo.updateTelegramMessageId(callId, threshold, msgId)
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
   notified_achievements row updated (telegram_message_id)
   + Telegram message posted en el mismo canal VIP
```

### Flujo de Reconciliación (Recovery)

```
Cada 30 segundos (CronExpression.EVERY_30_SECONDS):
   ReconcileStuckReservationsScheduler
       │
       ▼
   ReconcileStuckReservationsUseCase
       1. findStuckReservations(>2 min old, RESERVED status)
       2. Para cada una:
           ├─ si telegramMessageId existe → mark PUBLISHED
           └─ si no existe → mark FAILED
```

## EVENTS INVOLUCRADOS

| Event | Emisor | Receptor | Propósito |
|-------|--------|----------|-----------|
| `vip-call.approval.approved` | `token/vip-call-approval` | `VipCallApprovedHandler` | orchestrator logs |
| `vip-call.approval.rejected` | `token/vip-call-approval` | `VipCallRejectedHandler` | orchestrator logs |
| `CallPublishedEvent` | `PublishedCall.markPublished()` (in repo) | `PublishingEventPublisher.publishAll()` | post-commit broadcast |
| `CallPublishFailedEvent` | `PublishedCall.markFailed()` (in repo) | `PublishingEventPublisher.publishAll()` | post-commit broadcast |
| `RegisterCallForAchievementsEvent` | `VipCallsPublishUseCase.execute` step (6) | `RegisterCallForAchievementsHandler` (achievement) | enqueue milestone tracking |
| `CallAchievementReachedEvent` | `RecordNotifiedAchievementUseCase` | `AchievementReachedHandler` (vip-achievement) | publish milestone message |

## CLASSES PRINCIPALES

### vip-channel

| Símbolo | Tipo | Ubicación | Rol |
|---------|------|-----------|-----|
| `VipCallsModule` | class | `vip-channel/vip-channel.module.ts:79` | Wires all infra |
| `VipCallsPublishUseCase` | class | `vip-channel/application/handlers/vip-calls-publish.use-case.ts:51` | **STAR** — flujo de publicación |
| `VipCallsListPublishedUseCase` | class | `vip-channel/application/handlers/vip-calls-list-published.use-case.ts:11` | Listado queries |
| `ReconcileStuckReservationsUseCase` | class | `vip-channel/application/handlers/reconcile-stuck-reservations.use-case.ts` | Recovery cron job |
| `ReconcileStuckReservationsScheduler` | class | `vip-channel/infrastructure/schedulers/reconcile-stuck-reservations.scheduler.ts:7` | Every 30s |
| `TokenApprovedPublishHandler` | class | `vip-channel/infrastructure/event-bus/token-approved-publish.handler.ts:15` | Listener principal del evento approval |
| `TickerResolverService` | class | `vip-channel/application/services/ticker-resolver.service.ts:30` | 9-level cascading ticker fallback |
| `VipCallsBotApiPublisherAdapter` | class | `shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts:20` | Único publisher Bot API, shared por todos los sub-BCs |
| `VipCallsMessageFormatterAdapter` | class | `vip-channel/infrastructure/formatters/vip-message-formatter.adapter.ts:22` | Markdown + keyboard + milestone format |
| `VipCallsController` | class | `vip-channel/api/http/vip-calls.controller.ts:6` | REST: POST /publish, GET /calls/{published,failed,recent} |
| `InMemoryPublishedCallRepository` | class | `vip-channel/infrastructure/repositories/in-memory-published-call.repository.ts` | In-memory repo (cuando DATABASE_ENABLED=false) |
| `TypeOrmPublishedCallRepository` | class | `vip-channel/infrastructure/persistence/typeorm/repositories/typeorm-published-call.repository.ts` | TypeORM repo (DB persistente) |
| `PublishedCallEntity` | class | `vip-channel/infrastructure/persistence/typeorm/entities/published-call.entity.ts` | TypeORM entity |

### vip-decisions

| Símbolo | Tipo | Ubicación | Rol |
|---------|------|-----------|-----|
| `VipDecisionsModule` | class | `vip-decisions/decisions.module.ts:9` | Wires handlers |
| `VipCallApprovedHandler` | class | `vip-decisions/infrastructure/event-bus/vip-call-approved.handler.ts:15` | Thin orchestrator listener for approval events (logs) |
| `VipCallRejectedHandler` | class | `vip-decisions/infrastructure/event-bus/vip-call-rejected.handler.ts:7` | Thin orchestrator listener for rejection events (logs) |

### vip-achievement

| Símbolo | Tipo | Ubicación | Rol |
|---------|------|-----------|-----|
| `AchievementReachedHandler` | class | `vip-achievement/infrastructure/event-bus/achievement-reached.handler.ts:9` | Reacts to `CallAchievementReachedEvent`, posts milestone message to VIP channel and persists message_id |

### shared (transversal)

| Símbolo | Tipo | Ubicación | Rol |
|---------|------|-----------|-----|
| `VipCallsSharedModule` | class | `shared/shared.module.ts:8` | Wires bot publisher adapter |
| `VipCallPublishingPort` | abstract | `shared/application/ports/vip-call-publishing.port.ts:21` | Outbound port (legacy) |
| `VipAchievementPublishingPort` | abstract | `shared/application/ports/vip-achievement-publishing.port.ts:15` | Outbound port (milestone) |
| `VipCallsBotApiPublisherAdapter` | class | `shared/infrastructure/senders/bot-api-telegram-publisher.adapter.ts:20` | Único adapter compartido |

### Dominio (en telegram/shared)

| Símbolo | Tipo | Ubicación | Rol |
|---------|------|-----------|-----|
| `PublishedCall` | class | `telegram/shared/domain/entities/published-call.entity.ts:55` | AggregateRoot, state machine RESERVED→PUBLISHED/FAILED |
| `PublishStatus` | class | `telegram/shared/domain/value-objects/publish-status.vo.ts:13` | VO: `RESERVED`, `PUBLISHED`, `FAILED`, `SKIPPED` |
| `PublishedCallRepository` | abstract | `telegram/shared/application/ports/published-call.repository.ts:29` | Repo port (tryReserve, finalize, etc.) |
| `CallPublishedEvent` | class | `telegram/shared/domain/events/call-published.event.ts` | Domain event |
| `CallPublishFailedEvent` | class | `telegram/shared/domain/events/call-publish-failed.event.ts` | Domain event |
| `TelegramPublisherPort` | abstract | `telegram/shared/domain/ports/telegram-publisher.port.ts:8` | Outbound port |
| `MessageFormatterPort` | abstract | `telegram/shared/domain/ports/message-formatter.port.ts:27` | Format port |
| `PublishingEventPublisher` | abstract | `telegram/shared/application/ports/publishing-event.publisher.ts:3` | Event bus port |
| `InProcessPublishingEventPublisher` | class | `telegram/shared/infrastructure/messaging/in-process-publishing-event.publisher.ts` | In-process adapter |

## API ENDPOINTS

Base: `/vip-calls`

| Method | Path | Body / Query | Return | Use case |
|--------|------|--------------|--------|----------|
| `POST` | `/vip-calls/publish` | `VipCallsPublishInput` | `VipCallsPublishOutput` | `VipCallsPublishUseCase` |
| `GET` | `/vip-calls/calls/published?limit=N` | — | `VipCallsPublishOutput[]` | `VipCallsListPublishedUseCase` (kind=published) |
| `GET` | `/vip-calls/calls/failed?limit=N` | — | `VipCallsPublishOutput[]` | `VipCallsListPublishedUseCase` (kind=failed) |
| `GET` | `/vip-calls/calls/recent?limit=N` | — | `VipCallsPublishOutput[]` | `VipCallsListPublishedUseCase` (kind=recent) |

## DEPENDENCIES EXTERNAS (puertos cruzados)

vip-channel NO depende de otros BCs del proyecto. Solo importa módulos transversales y adaptation ports:

- `chain/registry/` — para `ChainId.fromString()`
- `settings/` — para `SettingsService.getScoringTierThresholds()`
- `shared/common/persistence/` — para `isDatabaseEnabled()`
- `EventEmitter2` — para emitir `RegisterCallForAchievementsEvent`

> **Aislamiento**: vip-channel NO cruza el bus de eventos hacia el achievement BC. El acoplamiento es a través del event bus (`emit('RegisterCallForAchievementsEvent')`), NO a través de imports directos.

## CRON JOBS / SCHEDULERS

| Nombre | Cron | Config Key | Función |
|--------|------|-----------|---------|
| `ReconcileStuckReservationsScheduler` | `*/30 * * * * *` (cada 30s) | `app.publishing.reconciliation.enabled` | Recupera reservations stuck en `RESERVED` > 2 min |
| `LiveAchievementScheduler` (en `token/achievement/`) | `app.milestone.schedulerCron` | `app.milestone.schedulerEnabled` | Evalúa milestones (debería migrar a `vip-calls/vip-achievement`) |

## CONVENTIONS

- **BC isolation**: Cada sub-BC tiene su propio `*.module.ts`. NO comparten providers a través de imports directos de módulos — solo a través de shared ports.
- **State machine**: `PublishedCall` solo transiciona RESERVED→PUBLISHED/FAILED. Cualquier otra transición throws `DomainError(INVALID_STATE_TRANSITION)`.
- **Idempotencia**: `tryReserve()` es la guardia atómica de duplicados. Si ya existe un row con `id = ${chain}:${address}`, retorna el snapshot sin enviar mensaje de nuevo.
- **Doble guardado**: Para evitar leaks de mensajes sin guardar en DB, el use case usa `tryReserve` (step 2) ANTES de sendMessage, y `finalize` (step 4) después. Si sendMessage throws, `markFailed` se ejecuta (best-effort) y se re-throw del error original.
- **Markdown**: Los mensajes usan Markdown con `disable_web_page_preview: false` para que Dexscreener link abra preview.
- **Ticker nullable**: TODO ticker se resuelve con cascading fallback 9-levels (DB → DexScreener → GeckoTerminal → CoinGecko → Moralis → Helius → name extraction → 'ANON').
- **Bot API rate limit**: `RATE_LIMIT_MS = 60_000` (1 mensaje/min). Mensajes >4096 chars se parten en chunks.
- **Correlation ID**: Cada `execute()` genera `pub-${randomUUID()}` y logea eventos `entered/before_sendMessage/after_sendMessage/before_finalize/after_finalize/returning` en JSON.

## ANTI-PATTERNS

- **NO emitir eventos antes de `finalize()`**: Los domain events (`CallPublishedEvent`, `CallPublishFailedEvent`) se publican DESPUÉS del UPDATE de la DB (`publishAll(call.commit())`). Nunca antes.
- **NO fix `*-bug-exploration.spec.ts`**: Estos archivos son **invariantes documentadas**, no bugs.
  - `token-approved-publish-bug-exploration.spec.ts`
  - `token-approved-publish-ticker-bug-exploration.spec.ts`
  - `ticker-null-bug-exploration.spec.ts`
- **NO usar `as any` cruzando BC boundaries**: Usar siempre DTOs fuertemente tipados de los ports.
- **NO importar módulos de otros BCs**: Solo ports abstract + event bus subscription.
- **NO permitir ticker=null en el publish flow**: Si `tickerResolver.resolveTicker()` retorna null y la DB no lo tiene, el handler usa `'ANON'` como fallback final.

## UNIQUE STYLES

- **Un solo adapter para todos los sends**: `VipCallsBotApiPublisherAdapter` es compartido por todos los sub-BCs. Tiene rate-limit interno (1 msg/min) y queue async.
- **State machine explícita**: `PublishedCall` es un `AggregateRoot` con transiciones estrictas. Los repos in-memory enqueue events via `aggregate.apply()`, los repos TypeORM no (porque son UPDATEs SQL directos — por eso `commit()` se llama después).
- **Reservation pattern**: El publish flow es `(1) RESERVE → (2) SEND → (3) FINALIZE`. La reservation previene duplicados y la reconciliación limpia las stuck.
- **Cascading ticker resolver**: 9 niveles de fallback en `TickerResolverService`. Es la única pieza que toca providers externos desde vip-channel.
- **Correlation IDs en logs**: Cada publish genera `pub-${randomUUID()}` y emite 6 logs JSON estructurados con el mismo ID.
- **Bug-exploration specs como invariantes**: Los tests en `vip-channel/infrastructure/event-bus/*-bug-exploration.spec.ts` documentan comportamiento esperado post-fix.

## TICKER RESOLVER — CASCADING FALLBACK (9-LEVEL)

Cuando la DB no tiene ticker para un token, `TickerResolverService.resolveTicker()` intenta secuencialmente:

1. `DexScreener.getPairsByToken(address).pairs[0].baseToken.symbol`
2. `GeckoTerminal.getTokenInfo(networkSlug, address).symbol`
3. `CoinGecko.fetchCoinGeckoSymbol(platform, address)` (raw API)
4. `Moralis.getTokenPrice(address, chain).tokenSymbol` (EVM only)
5. `Helius.getAsset(address).content.metadata.symbol` (Solana only)
6. `extractTickerFromName(name)` (regex de primera palabra, 2-10 alfanum chars)
7. Retorna `null` → caller usa `'ANON'`

Cada nivel try-catch + log + continúa. Ningún provider exceptions rompe el cascade.

## MESSAGE FORMATTER

`VipCallsMessageFormatterAdapter` produce 2 tipos de mensajes:

### Publish format
```
🟣 $SOLANA | $mFGAS

**MC**: `$187.5K`

`8rvdmt5uac1bwyf68xrabxpx8hdjmvnsicygkxrgorpj`

🦅 [Dexscreener](https://dexscreener.com/solana/...)
```

### Milestone format
```
🚀 MILESTONE 86x 🟣 $SOLANA

MC: `$2.2K` → `$187.5K`
`8rvdmt5uac1bwyf68xrabxpx8hdjmvnsicygkxrgorpj`
```

## NOTES

- **Doble dual-protocol**: este BC sigue el patrón MTProto (read) + Bot API (write) del `telegram/` general — VIP usa solo Bot API.
- **Shared rates**: `VipCallsBotApiPublisherAdapter` tiene un solo `botToken` y un solo `outputChannel` configurados en `app.publishing.vipCalls.{botToken, outputChannel}`.
- **Bot API tokens**: `VIP_CALLS_BOT_TOKEN` y `VIP_CALLS_OUTPUT_CHANNEL` en `AppConfig`.
- **`synchronize: true`**: En dev, TypeORM auto-crea la tabla `published_calls` con `synchronize: true`. En prod, la migración se hace vía `migration:run`.
- **Refactor plan**: Las tablas `published_calls` y `notified_achievements` deberían renombrarse a `vip-published-calls` y `vip-notified-achievements`. Toda la lógica de `token/achievement/` (incluyendo los repos) debería migrar a `vip-calls/vip-achievement/` ya que el output del milestone es al **mismo canal VIP**.
