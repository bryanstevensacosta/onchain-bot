# Telegram Publishing — Bounded Context

> Cierra el pipeline discovery: toma calls APPROVED por `filters`, los formatea como mensaje de Telegram y los envía a uno o más canales de output (mock por defecto, MTProto real opcional).

Forma parte de `src/discovery/publishing/telegram/` y se monta vía `TelegramPublishingModule` (`publishing.module.ts:57`).

---

## 1. Propósito

Este BC es el **terminal del pipeline discovery**. Una vez que un call pasa los filtros (`filters.token.approved`), este BC:

1. Resuelve qué canales de output deben recibirlo (filtrados por tier + score).
2. Formatea el call como mensaje de Telegram (markdown).
3. Envía a cada canal en paralelo (mock o MTProto real).
4. Persiste el resultado (`PublishedCall`) con audit trail de qué canales succeeded vs failed.
5. Emite `publishing.telegram.published` o `publishing.telegram.failed`.

Tres preguntas clave que el BC resuelve:

1. ¿A qué canales de output debe ir este call aprobado?
2. ¿Qué markdown/texto producimos para Telegram?
3. ¿Se envió OK a al menos un canal (PUBLISHED) o falló en todos (FAILED)?

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Selección de canales por tier + score | `domain/value-objects/output-channel.vo.ts:56-60` |
| `OutputChannel` VO + validación de `channelId` (regex Telegram) | `domain/value-objects/output-channel.vo.ts:20` |
| Resolución de canales (lista estática v1) | `domain/ports/output-channel-resolver.port.ts:10` |
| Formateo del mensaje | `domain/ports/message-formatter.port.ts:22` |
| Envío al chat (mock/real MTProto) | `domain/ports/telegram-publisher.port.ts:10` |
| `PublishedCall` agregado con audit trail | `domain/entities/published-call.entity.ts:42` |
| `PublishStatus` VO | `domain/value-objects/publish-status.vo.ts:16` |
| Orquestación (resolver → format → send → persist → emit) | `application/handlers/publish-approved-call.use-case.ts:31` |
| Selección mock vs MTProto real via config | `publishing.module.ts:40-46, 78-91` |
| Escucha de `filters.token.approved` | `infrastructure/event-bus/filters-approved.handler.ts:14` |
| Publicación de `publishing.telegram.published`/`failed` | `domain/entities/published-call.entity.ts:130-156` |

**Fuera del scope:**

- Calcular el score o aplicar filtros (`scoring`, `filters`).
- Decidir si publicar (gate de filters).
- Persistir calls (delegado al publisher de Telegram; este BC solo guarda audit local).
- Soporte multi-canal (discord, x.com, etc.) — el nombre del BC es `telegram/` específicamente.

## 3. Límites transaccionales

- **Agregado raíz:** `PublishedCall` (`domain/entities/published-call.entity.ts:42`). Id compuesto `${chain}:${addressLowercased}` — idempotente. Re-publicar sobrescribe.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat (sin outbox).
- **Eventos:** emite `publishing.telegram.published` (`domain/events/call-published.event.ts:30`) si `published.length > 0`, o `publishing.telegram.failed` (`domain/events/call-publish-failed.event.ts:25`) si `published.length === 0`.
- **Concurrencia:** `Map` keyed por id compuesto.

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `OutputChannel` | VO `{ channelId, username, tier }` con regex Telegram validation | `domain/value-objects/output-channel.vo.ts:20` |
| `OutputChannel.tier` | `'PRIMARY' \| 'SECONDARY' \| 'PREMIUM'` | `domain/value-objects/output-channel.vo.ts:7` |
| `OutputChannel.shouldPublish(score)` | PRIMARY: siempre; SECONDARY: `score ≥ 70`; PREMIUM: `score ≥ 80` | `domain/value-objects/output-channel.vo.ts:56-60` |
| `PublishStatus` | VO `'PUBLISHED' \| 'FAILED' \| 'SKIPPED'` | `domain/value-objects/publish-status.vo.ts:16` |
| `MessageFormatterPort` | Puerto outbound: format(input) → string | `domain/ports/message-formatter.port.ts:22` |
| `OutputChannelResolverPort` | Puerto outbound: `listAll()`, `listForScore(score)` | `domain/ports/output-channel-resolver.port.ts:10` |
| `TelegramPublisherPort` | Puerto outbound: `sendMessage(chatId, text)` → `{ ok, messageId, error }` | `domain/ports/telegram-publisher.port.ts:10` |
| `PublishedCall` | Agregado chain+address+message+status+audit | `domain/entities/published-call.entity.ts:42` |
| `tier` (del PublishedCall) | Mapeo del score: `≥80=STRONG`, `≥60=DECENT`, else `NEUTRAL` | `application/handlers/publish-approved-call.use-case.ts:72-77` |
| `MESSAGE_FORMATTER` | Token `Symbol` para multi-binding | `publishing.module.ts:23` |

## 5. API (HTTP — inbound)

Base path: `/ca/publishing/telegram` (`api/http/publishing.controller.ts:8`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/publishing/telegram/publish` | `PublishingController.run` (`:16`) | `PublishApprovedCallUseCase.execute` (`:42`) |
| `GET` | `/ca/publishing/telegram/calls/published?limit=N` | `PublishingController.published` (`:34`) | `ListPublishedCallsUseCase.execute('published', limit)` |
| `GET` | `/ca/publishing/telegram/calls/failed?limit=N` | `PublishingController.failed` (`:41`) | `ListPublishedCallsUseCase.execute('failed', limit)` |
| `GET` | `/ca/publishing/telegram/calls/recent?limit=N` | `PublishingController.recent` (`:48`) | `ListPublishedCallsUseCase.execute('recent', limit)` |
| `GET` | `/ca/publishing/telegram/calls/:chain/:address` | `PublishingController.get` (`:55`) | `GetPublishedCallUseCase.execute` (`:15`) |

`limit` defaults: `published/failed` = 20, `recent` = 10.

`POST /publish` valida con `class-validator` (`api/input/publish-call.input.ts:10-60`): `chain`, `address`, `score`, `classification` requeridos; resto opcional (`ticker`, `name`, `marketCapUsd`, `liquidityUsd`, `holders`, `sourceCount`, `mentionCount`, `chart`).

## 6. Objetos y modelado del dominio

### 6.1 Agregado `PublishedCall`

Archivo: `domain/entities/published-call.entity.ts:42`.

```
PublishedCall {
  readonly id: string;                  // `${chain}:${addressLowercased}`
  chain: ChainId;
  address: string;
  ticker: string | null;
  score: number;
  tier: string;                          // STRONG / DECENT / NEUTRAL
  classification: string;
  message: string;                       // texto ya formateado
  targetChannels: ReadonlyArray<string>; // canales a los que intentamos enviar
  status: PublishStatus;                 // PUBLISHED si ≥1 ok, FAILED si 0
  publishedChannelIds: ReadonlyArray<string>;
  failedChannelIds: ReadonlyArray<string>;
  publishedAt: Date;
}
```

- `static create(input, results)` (`:50-82`) — valida `address` no vacío y `message.trim()` no vacío; id compuesto; `status = PUBLISHED si results.published.length > 0 else FAILED`.
- `isPublished` / `isFailed` / `successCount` (`:120-128`).
- `emit()` (`:130-156`) — emite `CallPublishedEvent` si isPublished o `CallPublishFailedEvent` si isFailed.
- `mutate(_event)` (`:158-160`) — no-op.

### 6.2 Value Objects

- `OutputChannel` (`domain/value-objects/output-channel.vo.ts:20`)
  - `create({ channelId, username?, tier? })` (`:27-44`) — valida `channelId` con regex `/^[A-Za-z][A-Za-z0-9_]{4,31}$/` (Telegram username format). `tier` default `PRIMARY`.
  - `shouldPublish(score)` (`:56-60`) — PRIMARY: true; SECONDARY: `score >= 70`; PREMIUM: `score >= 80`.
- `PublishStatus` (`domain/value-objects/publish-status.vo.ts:16`)
  - Singletons `PUBLISHED`/`FAILED`/`SKIPPED` (`:17-19`).
  - `fromString(raw)` (`:31-37`) — lanza `Error` plain si inválido.
  - `SKIPPED` está definido pero no se asigna en el flujo actual —预留 para dedupe window.

### 6.3 Eventos

- `CallPublishedEvent` (`domain/events/call-published.event.ts:7`) — `eventName = 'publishing.telegram.published'` (`:30`).
- `CallPublishFailedEvent` (`domain/events/call-publish-failed.event.ts:7`) — `eventName = 'publishing.telegram.failed'` (`:25`); payload incluye `targetChannels` y `failedChannelIds`.

### 6.4 Puertos de dominio

- `MessageFormatterPort` (`domain/ports/message-formatter.port.ts:22`) — `format(input: ApprovedCallInput): string`.
- `OutputChannelResolverPort` (`domain/ports/output-channel-resolver.port.ts:10`) — `listAll()`, `listForScore(score)`.
- `TelegramPublisherPort` (`domain/ports/telegram-publisher.port.ts:10`) — `sendMessage(chatId, text): Promise<{ ok, messageId, error }>`.

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `PublishedCallRepository` | `application/ports/published-call.repository.ts:4` | `save`, `findByChainAndAddress`, `findRecent`, `findPublished`, `findFailed` |
| `PublishingEventPublisher` | `application/ports/publishing-event.publisher.ts:3` | `publish`, `publishAll` |

Mappers:

- `PublishedCallMapper.toView` (`application/mappers/published-call.mapper.ts:19-36`) — view con `successCount` calculado y `publishedAt.toISOString()`.

## 8. Infraestructura

### 8.1 `DefaultMessageFormatterAdapter`

Archivo: `infrastructure/formatters/default-message-formatter.adapter.ts` (existe, tiene spec).

- Genera markdown fijo con secciones: header, contract, ticker, name, metrics, sources, chart, links.
- Spec cubre el formato exacto.

### 8.2 `DefaultOutputChannelResolverAdapter`

Archivo: `infrastructure/channels/default-output-channel-resolver.adapter.ts`.

- Lista hardcoded de canales de output (PRIMARY/SECONDARY/PREMIUM).
- `listForScore(score)` filtra con `OutputChannel.shouldPublish(score)`.

### 8.3 `MockTelegramPublisherAdapter` (default)

Archivo: `infrastructure/senders/mock-telegram-publisher.adapter.ts`.

- Loggea `would send to ${chatId}` y devuelve `{ ok: true, messageId: <random>, error: null }`.
- Usado en dev/tests para no tocar Telegram real.

### 8.4 `MtprotoPublishingAdapter` (real, opt-in)

Archivo: `infrastructure/senders/mtproto-publishing.adapter.ts` (con spec en `mtproto-publishing.adapter.spec.ts`).

- Implementa `TelegramPublisherPort` usando el cliente MTProto real.
- Cliente MTProto compartido: `mtproto-sender.client.ts` (componente bajo nivel).
- Configuración: `TELEGRAM_MTPROTO_API_ID/HASH/SESSION` (de `AppConfig`, ver `src/shared/config/app.config.ts:42-47`).

### 8.5 Selección mock vs real — `useFactory`

Archivo: `publishing.module.ts:78-91`.

```ts
{
  provide: TelegramPublisherPort,
  useFactory: (cfg, mock, mtproto): TelegramPublisherPort =>
    publisherFactory.useMtproto(cfg) ? mtproto : mock,
  inject: [ConfigService, MockTelegramPublisherAdapter, MtprotoPublishingAdapter],
}
```

- `useMtproto(cfg)` (`:41-45`) — lee `app.publishing.telegram.useRealMtproto`. Default `false`.
- Switch via env `PUBLISHING_TELEGRAM_USE_REAL_MTPROTO=true` activa el real.

> **Importante:** ambos adapters (`MockTelegramPublisherAdapter` y `MtprotoPublishingAdapter`) son providers (`:66-67`) aunque solo uno se inyecte efectivamente al `TelegramPublisherPort`. Ambos se construyen en boot — si `MtprotoPublishingAdapter` falla al inicializarse (e.g., falta config), rompe el módulo. Considerar lazy-init.

### 8.6 `InMemoryPublishedCallRepository`

Archivo: `infrastructure/repositories/in-memory-published-call.repository.ts:7`.

- `Map<string, PublishedCall>` con `MAX_ENTRIES = 500` (`:8`).
- `findPublished`/`findFailed` (`:40-58`) — filtra por `isPublished`/`isFailed`, ordena por `publishedAt` desc.

### 8.7 `InProcessPublishingEventPublisher`

Archivo: `infrastructure/messaging/in-process-publishing-event.publisher.ts:7`. Wrapper sobre `EventEmitter2`.

### 8.8 `FiltersApprovedHandler`

Archivo: `infrastructure/event-bus/filters-approved.handler.ts:14`.

- `@OnEvent('filters.token.approved', { async: true })` (`:19`).
- `ticker`, `name`, métricas, `chart` → `null` (`:25-35`) porque el evento `TokenFilteredEvent` no los carga.
- `sourceCount`/`mentionCount` → 1 (defaults).
- Try/catch que traga errores (`:36-41`).

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `PublishApprovedCallUseCase.execute` | `application/handlers/publish-approved-call.use-case.ts:42` | `ChainId.fromString`; `channelResolver.listForScore(score)`; `formatter.format(input)`; `Promise.allSettled` sobre `publisher.sendMessage`; agrega `published[]`/`failed[]`; construye `PublishedCall`; `save` → `emit` → `publishAll`. |
| `GetPublishedCallUseCase.execute` | `application/handlers/get-published-call.use-case.ts:15` | `findByChainAndAddress`; lanza `DomainError(NOT_FOUND)` si null. |
| `ListPublishedCallsUseCase.execute` | `application/handlers/list-published-calls.use-case.ts:15` | Valida `limit` (1..500); dispatch por `kind` (`published`/`failed`/`recent`); map. |

## 10. Flujo (happy path)

```
filters.token.approved
        |
        v
FiltersApprovedHandler (event-bus)
        |
        v
PublishApprovedCallUseCase.execute
        |
        +--> OutputChannelResolverPort.listForScore(score)
        |       filtra por tier (PRIMARY siempre, SECONDARY ≥70, PREMIUM ≥80)
        |
        +--> MessageFormatterPort.format(input)  → message: string
        |
        +--> Promise.allSettled(
        |       channels.map(c => publisher.sendMessage(c.channelId, message))
        |     )
        |       [mock o MTProto según config]
        |
        +--> agrega resultados:
        |       published[] = ok
        |       failed[]    = error
        |
        +--> PublishedCall.create(input, { published, failed })
        |       status = PUBLISHED si ≥1 ok, else FAILED
        |
        +--> PublishedCallRepository.save
        |
        +--> call.emit()
        |       PUBLISHED → CallPublishedEvent    → 'publishing.telegram.published'
        |       FAILED    → CallPublishFailedEvent → 'publishing.telegram.failed'
        |
        +--> PublishingEventPublisher.publishAll
        |
        v
publishing.telegram.published  -->  Analytics / dashboards
publishing.telegram.failed    -->  ops alerting (nunca al usuario)
```

## 11. Wiring (NestJS DI)

Archivo: `publishing.module.ts:57-101`.

| Token | Implementación |
|---|---|
| `MessageFormatterPort` | `DefaultMessageFormatterAdapter` (`:72`) |
| `MESSAGE_FORMATTER` (Symbol) | `useExisting: DefaultMessageFormatterAdapter` (`:69-71`) |
| `OutputChannelResolverPort` | `DefaultOutputChannelResolverAdapter` (`:75`) |
| `TelegramPublisherPort` | `useFactory` mock↔MTProto (`:78-91`) |
| `PublishedCallRepository` | `InMemoryPublishedCallRepository` (`:94`) |
| `PublishingEventPublisher` | `InProcessPublishingEventPublisher` (`:98`) |
| `PublishApprovedCallUseCase` | self-provide, `@Inject(MESSAGE_FORMATTER)` (`:35, 8`) |
| `GetPublishedCallUseCase` | self-provide (`:9`) |
| `ListPublishedCallsUseCase` | self-provide (`:10`) |
| `FiltersApprovedHandler` | self-provide (`:17`) |
| `MockTelegramPublisherAdapter` | self-provide (`:13`) |
| `MtprotoPublishingAdapter` | self-provide (`:14`) |
| `DefaultMessageFormatterAdapter` | self-provide (`:11`) |
| `DefaultOutputChannelResolverAdapter` | self-provide (`:12`) |
| `PublishingController` | controller (`:18`) |

**Exports** (`:101`): `PublishedCallRepository`, `PublishingEventPublisher`.

> **Acoplamiento a `chain-detection`:** el agregado importa `ChainId` de `ca/chain-detection/domain/value-objects/chain-id.vo` (`published-call.entity.ts:4`). Misma convención que en otros BCs downstream.

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `PublishedCall.create` — `address` o `message` vacío | `domain/entities/published-call.entity.ts:57-62` |
| `VALIDATION` | `OutputChannel.create` — `channelId` no matchea regex | `domain/value-objects/output-channel.vo.ts:32-37` |
| `UNSUPPORTED_CHAIN` | `ChainId.fromString` (en `PublishApprovedCallUseCase.execute`) | `domain/value-objects/chain-id.vo.ts:51-57` (via dependency) |
| `NOT_FOUND` | `GetPublishedCallUseCase.execute` | `application/handlers/get-published-call.use-case.ts:23-29` |
| `VALIDATION` | `ListPublishedCallsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/list-published-calls.use-case.ts:19-23` |

> **No-`DomainError`s:**
> - `PublishStatus.fromString` lanza `Error` plain (`publish-status.vo.ts:34`).

## 13. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/publish-approved-call.use-case.spec.ts` — orquesta format → send parallel → persist → emit. Verifica `PUBLISHED`/`FAILED` según resultados.
- `infrastructure/formatters/default-message-formatter.adapter.spec.ts` — output del formatter.
- `infrastructure/senders/mtproto-publishing.adapter.spec.ts` — cliente MTProto mockeado.
- `infrastructure/event-bus/filters-approved.handler.spec.ts` — suscripción y traducción del evento a `ApprovedCallInput`.

**Gaps conocidos:**

- No hay spec de `MockTelegramPublisherAdapter`.
- No hay spec de `DefaultOutputChannelResolverAdapter`.
- No hay spec de `PublishedCall`/`OutputChannel`/`PublishStatus` validation.
- No hay spec de `InMemoryPublishedCallRepository`.
- No hay spec de `GetPublishedCallUseCase`/`ListPublishedCallsUseCase`.

## 14. Extensiones sugeridas

1. **Dedupe window** — actualmente no hay protección contra republish del mismo `(chain, address)` dentro de X horas. Usar el `SKIPPED` status预留 en `PublishStatus`.
2. **Templates por canal** — `MessageFormatterPort` con N implementaciones (una por tier) o templating engine.
3. **Markdown variants** — `parse_mode: MarkdownV2` vs HTML según canal.
4. **Multi-target** — discord, x.com, webhooks (cada uno en su propio subdir de `ca/publishing/`).
5. **Rate limiting** — actualmente `Promise.allSettled` envía paralelo sin control. Añadir `Bottleneck` o similar para respetar límites de Telegram (30 msg/s global, 1 msg/s por chat).
6. **Lazy init MTProto** — actualmente ambos adapters se construyen en boot. Si MTProto falla init, rompe el módulo aunque no se use.
7. **Outbox pattern** — atomicidad save+publish.
8. **Persistencia real** — TypeORM/Prisma.
9. **Retry con backoff** — si `sendMessage` falla con transient error, reintentar antes de contar como failed.

## 15. Mapa rápido de archivos

```
src/discovery/publishing/telegram/
├── api/
│   ├── http/publishing.controller.ts
│   └── input/publish-call.input.ts
├── application/
│   ├── handlers/
│   │   ├── get-published-call.use-case.ts
│   │   ├── list-published-calls.use-case.ts
│   │   ├── publish-approved-call.use-case.ts
│   │   └── publish-approved-call.use-case.spec.ts
│   ├── mappers/published-call.mapper.ts
│   └── ports/
│       ├── published-call.repository.ts
│       └── publishing-event.publisher.ts
├── domain/
│   ├── entities/published-call.entity.ts
│   ├── events/
│   │   ├── call-publish-failed.event.ts
│   │   └── call-published.event.ts
│   ├── ports/
│   │   ├── message-formatter.port.ts
│   │   ├── output-channel-resolver.port.ts
│   │   └── telegram-publisher.port.ts
│   └── value-objects/
│       ├── output-channel.vo.ts
│       └── publish-status.vo.ts
├── infrastructure/
│   ├── channels/default-output-channel-resolver.adapter.ts
│   ├── event-bus/
│   │   ├── filters-approved.handler.ts
│   │   └── filters-approved.handler.spec.ts
│   ├── formatters/
│   │   ├── default-message-formatter.adapter.ts
│   │   └── default-message-formatter.adapter.spec.ts
│   ├── messaging/in-process-publishing-event.publisher.ts
│   ├── repositories/in-memory-published-call.repository.ts
│   └── senders/
│       ├── mock-telegram-publisher.adapter.ts
│       ├── mtproto-publishing.adapter.ts
│       ├── mtproto-publishing.adapter.spec.ts
│       └── mtproto-sender.client.ts
├── publishing.module.ts
└── README.md
```
