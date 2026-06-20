# Telegram Ingestion — Bounded Context

> BC responsable de **registrar, persistir y consumir en tiempo real** los mensajes provenientes de canales de Telegram que el sistema monitoriza en busca de alpha sobre on-chain tokens.

Forma parte de `src/ca/ingestion/telegram` y se monta en la aplicación a través de `telegram-ingestion.module.ts:24`.

---

## 1. Propósito

Convertir un *firehose* de mensajes crudos de Telegram en **eventos de dominio normalizados** que el siguiente BC (extracción / NLP) pueda consumir, manteniendo un registro de los canales monitorizados, su estado de escucha y la última marca de ingesta.

El BC resuelve cuatro preguntas:

1. **¿Qué canales se monitorizan?** — `TelegramChannel` agregado (`domain/entities/telegram-channel.entity.ts:13`).
2. **¿Cómo se obtienen los mensajes?** — `TelegramListenerPort` (`domain/ports/telegram-listener.port.ts:8`).
3. **¿Cómo se notifica al resto del sistema?** — `MessageIngestedEvent` (`domain/events/message-ingested.event.ts:12`).
4. **¿Cómo se siembran los canales por defecto en el arranque?** — `TelegramChannelSeeder` (`infrastructure/seeders/telegram-channel.seeder.ts:27`).

---

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Modelar el canal monitorizado y sus invariantes | `domain/entities/telegram-channel.entity.ts` |
| Validar identificadores (channel id, username, message id) | `domain/value-objects/*` |
| Exponer casos de uso (add/get/list/start-listening) | `application/handlers/*.use-case.ts` |
| Mapear entidades → view models de salida | `application/mappers/channel.mapper.ts` |
| Adaptar el protocolo de Telegram (MTProto) | `api/mtproto/telegram-mtproto.adapter.ts` |
| Exponer HTTP de administración | `api/http/telegram-ingestion.controller.ts` |
| Persistir canales | `infrastructure/repositories/in-memory-telegram-channel.repository.ts` |
| Publicar eventos de dominio (vía EventEmitter2) | `infrastructure/messaging/in-process-telegram-event.publisher.ts` |
| Sembrar canales por defecto en bootstrap | `infrastructure/seeders/telegram-channel.seeder.ts` (+ `infrastructure/seeds/`) |

Lo que **NO** hace:

- No interpreta el contenido de los mensajes (delega al BC de extracción).
- No traduce tokens ni enruta llamadas a chain (delega a BCs downstream).
- No gestiona autenticación de usuarios finales (rutas admin-only, ver `api/http/telegram-ingestion.controller.ts:13`).

---

## 3. Límites transaccionales

- **Agregado único:** `TelegramChannel`. Cualquier cambio de estado (alta, activación, ingesta) pasa por el agregado (`telegram-channel.entity.ts:79`, `:94`, `:98`).
- **Persistencia atómica:** una sola operación `save(channel)` por mutación. El repositorio se inyecta como token NestJS en `telegram-ingestion.module.ts:32`.
- **Eventos:** las mutaciones del agregado se aplican con `apply(...)` y se recolectan vía `commit()` (`add-channel.use-case.ts:44`, `start-listening.use-case.ts:37`, `:54`). `TelegramEventPublisher.publishAll` los emite secuencialmente (`application/ports/telegram-event.publisher.ts:11`).
- **Concurrencia del listener:** el adaptador MTProto garantiza una única suscripción activa mediante `this.running` (`api/mtproto/telegram-mtproto.adapter.ts:41`, chequeo en `:81`).
- **Seeder idempotente:** canales ya registrados se omiten (`infrastructure/seeders/telegram-channel.seeder.ts:75`, `:92`); los inválidos se cuentan como `failed` sin abortar el batch.
- **No hay transacciones multi-agregado:** cada canal es independiente y su estado se persiste de forma aislada.

---

## 4. Lenguaje ubicuo

| Término | Definición |
|---|---|
| **Channel** | Canal público/privado de Telegram que se monitoriza. Identificado por `ChannelId` (peer id como string) y opcionalmente `ChannelUsername`. |
| **ChannelId** | VO que envuelve el peer id numérico de Telegram serializado a string (`domain/value-objects/channel-id.vo.ts:11`). Patrón `^-?\d+$` (`:12`). |
| **ChannelUsername** | VO del handle público (`@SpyDefi` o `https://t.me/SpyDefi`). Normaliza removiendo `@` y prefijo `t.me/` (`channel-username.vo.ts:20-23`). Patrón `^[A-Za-z][A-Za-z0-9_]{4,31}$` (`:13`). |
| **MessageId** | VO del id entero de un mensaje dentro de un canal (`message-id.vo.ts:11`). Entero positivo. |
| **RawTelegramMessage** | Estructura de infraestructura (NO de dominio) tal cual llega de MTProto (`domain/ports/telegram-listener.port.ts:36`). Incluye `channelId`, `messageId`, `text`, `occurredAt`, y opcionalmente `entities`/`hasMedia`. |
| **ResolvedChannelMetadata** | Salida de `TelegramListenerPort.resolveChannelMetadata` (`domain/ports/telegram-listener.port.ts:26`). Usado por el seeder para obtener `title`/`username` cuando el seed no los provee. |
| **MessageIngestedEvent** | Evento de dominio emitido cada vez que un canal ingiere un mensaje (`domain/events/message-ingested.event.ts:12`). `eventName = "telegram.message.ingested"` (`:29`). Payload: `{ channelId, username, messageId, occurredAt, text? }` (`:13`). |
| **Listening** | Estado del canal (`isActive`). Se activa con `startListening()` (idempotente, emite un evento marker con `messageId=0` y sin `text`) y se desactiva con `stopListening()` (`telegram-channel.entity.ts:79`, `:94`). |
| **Backfill** | Recuperación histórica vía `TelegramListenerPort.backfill(channelId, limit)` (`domain/ports/telegram-listener.port.ts:12`). |
| **ChannelView** | DTO de salida para HTTP (`application/mappers/channel.mapper.ts:7`). |
| **Seed** | Lista estática de peer ids registrados automáticamente al arranque (`infrastructure/seeds/telegram-channels.seed.ts:20`). Configurable vía `app.ingestion.telegram.seed.*`. |

---

## 5. API (HTTP — inbound)

Base path: `ca/ingestion/telegram` (`api/http/telegram-ingestion.controller.ts:15`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `GET` | `/channels` | `list()` (`:24`) | `ListChannelsUseCase` |
| `POST` | `/channels` | `add(@Body)` (`:29`) | `AddChannelUseCase` — body: `AddChannelInput` |
| `GET` | `/channels/:channelId` | `get(@Param)` (`:34`) | `GetChannelUseCase` |
| `POST` | `/channels/start-listening` | `start(@Body)` (`:39`) | `StartListeningUseCase` — body: `StartListeningInput` |

**Inputs** (`api/input/`):

```ts
// add-channel.input.ts:5
interface AddChannelInput {
  readonly channelId: string;   // peer id numérico como string
  readonly username?: string;   // opcional, ej. "SpyDefi"
  readonly title: string;       // requerido, no vacío (validado en entity)
}

// start-listening.input.ts:5
interface StartListeningInput {
  readonly channelIds: ReadonlyArray<string>;
}
```

**Output** (`application/mappers/channel.mapper.ts:7`):

```ts
interface ChannelView {
  readonly id: string;
  readonly username: string | null;
  readonly title: string;
  readonly isActive: boolean;
  readonly lastIngestedAt: string | null;  // ISO-8601
}
```

> Las rutas son intencionalmente **admin-only**. La autenticación/autorización queda fuera de este BC (`api/http/telegram-ingestion.controller.ts:13`).

---

## 6. Objetos y modelado del dominio

### 6.1 Agregado `TelegramChannel`

Archivo: `domain/entities/telegram-channel.entity.ts`.

```
TelegramChannel (AggregateRoot<string>)
├── id: ChannelId
├── username: ChannelUsername | null
├── title: string
├── isActive: boolean
├── lastIngestedAt: Date | null
└── addedAt: Date
```

Métodos relevantes:

- `static create(input)` (`:38`) — factory que valida `title` no vacío (`:43`) y aplica `trim`.
- `startListening()` (`:79`) — idempotente; emite `MessageIngestedEvent` con `messageId=0`, sin `text` (marker de activación).
- `stopListening()` (`:94`) — solo cambia `isActive`; **no** emite evento.
- `recordMessageIngested(messageId, occurredAt, text?)` (`:98`) — actualiza `lastIngestedAt` y emite evento con `text` opcional.
- `mutate(event)` (`:115`) — aplica el evento al reconstruir (event sourcing parcial).

### 6.2 Value Objects

- `ChannelId` (`domain/value-objects/channel-id.vo.ts:11`) — string numérico, validado con regex `^-?\d+$` (`:12`); lanza `VALIDATION` en `:19-25`.
- `ChannelUsername` (`domain/value-objects/channel-username.vo.ts:12`) — normaliza `@` y `https://t.me/` (`:20-23`); valida con regex `^[A-Za-z][A-Za-z0-9_]{4,31}$` (`:13`); lanza `VALIDATION` en `:24-30`.
- `MessageId` (`domain/value-objects/message-id.vo.ts:11`) — entero positivo; lanza `VALIDATION` si no es entero positivo (`:17-23`).

### 6.3 Eventos

- `MessageIngestedEvent` (`domain/events/message-ingested.event.ts:12`)
  - `eventName = "telegram.message.ingested"` (`:29`).
  - `aggregateId = "${channelId}:${messageId}"` (`:30`).
  - Payload (`:13`):
    ```ts
    {
      channelId: string;
      username: string | null;
      messageId: number;
      occurredAt: Date;
      text?: string;
    }
    ```
  - Payload congelado con `Object.freeze` (`:32`).
  - `toPayload()` (`:35`) serializa `occurredAt` a ISO-8601.
  - Los eventos de *start-listening* llegan con `messageId=0` y `text` ausente; los BCs consumidores (extracción) deben descartarlos.

### 6.4 Puertos de dominio

- `TelegramListenerPort` (`domain/ports/telegram-listener.port.ts:8`) — outbound port hacia Telegram. Métodos:
  - `subscribe(channelIds)` (`:9`) — `AsyncIterable<RawTelegramMessage>`.
  - `backfill(channelId, limit)` (`:12`).
  - `disconnect()` (`:16`).
  - `resolveChannelMetadata(channelId)` (`:17`) — resuelve `{ channelId, title, username }` vía MTProto.
  
  Definido como `abstract class` para servir como token NestJS (`:7` comentario).

---

## 7. Puertos de aplicación

- `TelegramChannelRepository` (`application/ports/telegram-channel.repository.ts:9`) — CRUD de canales: `save`, `findById`, `findAll`, `delete` (`:13`).
- `TelegramEventPublisher` (`application/ports/telegram-event.publisher.ts:8`) — publica un evento; `publishAll` itera secuencialmente (`:11`).

### Mappers

- `ChannelMapper.toView(channel)` (`application/mappers/channel.mapper.ts:19`) — única transformación entity → view model.

---

## 8. Infraestructura

### 8.1 Adaptador MTProto (outbound hacia Telegram)

Archivo: `api/mtproto/telegram-mtproto.adapter.ts`.

- Implementa `TelegramListenerPort` + lifecycle de NestJS (`OnModuleInit`, `OnModuleDestroy`, `:32-34`).
- Usa `telegram` (gramjs) + `StringSession` (`:8-9`, `:67`).
- Lee credenciales de `ConfigService` → `app.telegram.mtprotoApiId/Hash/Session` (`:46-47`, `:60-66`).
- Si faltan credenciales en `onModuleInit`: log warn y el BC queda deshabilitado (`:48-51`); `ensureClient()` lanza `DomainError(INTERNAL)` (`:62-65`).
- **Cola interna + resolvers** (`queue`, `waitingResolvers` — `:39`, `:40`) drenan el `AsyncIterable` retornado por `subscribe()` (`:78-116`).
- `handleEvent` (`:118`) parsea el evento de `NewMessage`, llama `getChat()` para resolver el peer id, y filtra por `this.currentChannelIds.includes(channelId)` (`:134`) antes de encolar.
- `backfill(channelId, limit)` (`:161`) usa `client.getMessages` para recuperación histórica.
- `disconnect()` (`:178`) limpia la suscripción y desconecta el cliente.
- `resolveChannelMetadata(channelId)` (`:192`) resuelve `{ channelId, title, username }` vía `client.getEntity`; consumido por el seeder.

### 8.2 Repositorio en memoria

Archivo: `infrastructure/repositories/in-memory-telegram-channel.repository.ts`.

- `Map<string, TelegramChannel>` (`:14`).
- Implementa `save`, `findById`, `findAll`, `delete` (`:16-30`).
- Listo para reemplazarse por adapter TypeORM/Prisma sin tocar `application/`.

### 8.3 Publisher in-process

Archivo: `infrastructure/messaging/in-process-telegram-event.publisher.ts`.

- Usa `EventEmitter2` de `@nestjs/event-emitter` (`:2`, `:25`) para emitir con `event.eventName` como topic.
- Los BCs downstream (extracción) se suscriben con `@OnEvent('telegram.message.ingested')`.
- Para despliegues multi-instancia, sustituir por un adapter que publique a Redis/Kafka.

### 8.4 Seeder de canales

Archivos: `infrastructure/seeders/telegram-channel.seeder.ts`, `infrastructure/seeds/telegram-channels.seed.ts`.

- Implementa `OnApplicationBootstrap` (`:27`) — corre cuando el resto del grafo DI está listo.
- **Lista por defecto** (`seeds/telegram-channels.seed.ts:20`): 45 peer ids estáticos.
- **Override por env**: `app.ingestion.telegram.seed.channels` (formato `channelId[,channelId...]` o `channelId|username|title`) toma precedencia sobre el seed en código.
- **Toggle**: `app.ingestion.telegram.seed.enabled` (default `false`).
- **Auto-start**: `app.ingestion.telegram.seed.autoStartListening` (default `true`) invoca `StartListeningUseCase` al final.
- **Idempotencia**: canales ya registrados se cuentan como `skipped` (`:75-79`, `:92-96`) sin lanzar.
- **Resolución de título**: si el seed no provee `title`, intenta `TelegramListenerPort.resolveChannelMetadata`; si falla, usa el fallback `Telegram channel ${channelId}` (`:116-134`).
- **Resumen al final**: `added=N skipped=M failed=K total=T` (`:107-109`).

---

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `AddChannelUseCase` | `application/handlers/add-channel.use-case.ts:18` | Valida VO, rechaza duplicados (`CONFLICT`, `:31-36`), persiste, publica eventos, retorna `ChannelView` (`:44`). |
| `GetChannelUseCase` | `application/handlers/get-channel.use-case.ts:14` | Devuelve `ChannelView` o `NOT_FOUND` (`:20-25`). |
| `ListChannelsUseCase` | `application/handlers/list-channels.use-case.ts:12` | Devuelve todos los `ChannelView`. |
| `StartListeningUseCase` | `application/handlers/start-listening.use-case.ts:18` | Activa cada canal existente (`:35`), persiste, publica eventos y arranca el consumo del stream (`:41`, fire-and-forget). |

`StartListeningUseCase.consumeStream` (`:46`) itera sobre `listener.subscribe(...)`, rehidrata el agregado, llama `recordMessageIngested(messageId, occurredAt, text)` (`:52`) y publica los eventos.

`StartListeningUseCase` (`:43`) retorna los `ChannelView` de los canales encontrados (los ausentes se omiten silenciosamente).

---

## 10. Flujo (happy path)

```
[Admin] ─HTTP POST /channels──▶ TelegramIngestionController.add
                                       │
                                       ▼
                          AddChannelUseCase.execute
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
        ChannelId.fromString   ChannelUsername.fromString  TelegramChannel.create
                                       │
                                       ▼
                          TelegramChannelRepository.save
                                       │
                                       ▼
                          eventPublisher.publishAll(channel.commit())
                                       │
                                       ▼
                              [MessageIngestedEvent]  ──▶  BC Extracción (downstream)


[Admin] ─HTTP POST /channels/start-listening──▶ StartListeningUseCase.execute
                                       │
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
       Por cada canal:                        consumeStream() (fire-and-forget)
       channel.startListening()                            │
       repo.save(channel)                                  ▼
       publishAll(commit())              TelegramListenerPort.subscribe(channelIds)
                                                       │
                                                       ▼
                                          TelegramMtprotoAdapter.handleEvent
                                                       │
                                                       ▼
                                  channel.recordMessageIngested(...)
                                                       │
                                                       ▼
                                       repo.save + publishAll(commit())


[Bootstrap] ─OnApplicationBootstrap──▶ TelegramChannelSeeder.onApplicationBootstrap
                                              │
                                              ▼
                            Para cada channel en seed (env o estático):
                              - skip si ya registrado
                              - resolver title vía resolveChannelMetadata
                              - AddChannelUseCase.execute
                                              │
                                              ▼
                            Si autoStartListening && registeredIds.length > 0:
                              StartListeningUseCase.execute(registeredIds)
```

---

## 11. Wiring (NestJS DI)

Archivo: `telegram-ingestion.module.ts:24`.

| Token | Implementación |
|---|---|
| `AddChannelUseCase` | clase directa (`:27`) |
| `GetChannelUseCase` | clase directa (`:28`) |
| `ListChannelsUseCase` | clase directa (`:29`) |
| `StartListeningUseCase` | clase directa (`:30`) |
| `TelegramChannelRepository` | `InMemoryTelegramChannelRepository` (`:31-34`) |
| `TelegramEventPublisher` | `InProcessTelegramEventPublisher` (`:35-38`) |
| `TelegramListenerPort` | `TelegramMtprotoAdapter` (`:39`) |
| `TelegramChannelSeeder` | clase directa (`:40`) |

Los tres puertos se **reexportan** (`:42-46`) para que otros BCs (extracción) puedan consumir el publisher y consultar el repositorio sin acoplarse a este módulo.

> El módulo declara `EventEmitterModule.forRoot()` como prerequisito a nivel de `AppModule` (no vive aquí).

---

## 12. Errores de dominio relevantes

Centralizados en `shared/domain/domain-error.ts`. Casos usados por este BC:

- `VALIDATION` — `ChannelId.fromString` (`:19-25`), `ChannelUsername.fromString` (`:24-30`), `MessageId.fromNumber` (`:17-23`), `TelegramChannel.create` cuando title vacío (`:43-48`).
- `CONFLICT` — `AddChannelUseCase` cuando el id ya existe (`add-channel.use-case.ts:31-36`); `TelegramMtprotoAdapter.subscribe` cuando ya hay un listener activo (`api/mtproto/telegram-mtproto.adapter.ts:81-86`).
- `NOT_FOUND` — `GetChannelUseCase` cuando no existe el canal (`get-channel.use-case.ts:20-25`).
- `UNAUTHORIZED` — sesión MTProto no autorizada (`api/mtproto/telegram-mtproto.adapter.ts:89-94`).
- `INTERNAL` — credenciales MTProto faltantes (`api/mtproto/telegram-mtproto.adapter.ts:62-65`).

---

## 13. Pruebas

- `domain/entities/telegram-channel.entity.spec.ts` — invariantes del agregado (create, startListening idempotente, recordMessageIngested, commit/uncommit).
- `application/handlers/add-channel.use-case.spec.ts` — orquestación del caso de uso (duplicados, validación, publicación).

> Los VOs y el resto de casos de uso están pendientes de cubrir con specs alineadas al mismo estilo.

---

## 14. Extensiones sugeridas (fuera del scope actual)

1. **Persistencia real:** reemplazar `InMemoryTelegramChannelRepository` por adapter Prisma/TypeORM. El contrato del puerto (`application/ports/telegram-channel.repository.ts:9`) ya está cerrado.
2. **Publisher distribuido:** sustituir `InProcessTelegramEventPublisher` por Redis Streams o Kafka cuando se despliegue multi-instancia (`infrastructure/messaging/in-process-telegram-event.publisher.ts:11`).
3. **Reintentos por `FloodWait`:** la lógica está delegada al adaptador (`start-listening.use-case.ts:58`); conviene un wrapper que respete los `seconds` del error de Telegram.
4. **Autenticación de las rutas HTTP:** añadir guard de admin antes de exponer `TelegramIngestionController`.
5. **Backfill programado:** invocar `TelegramListenerPort.backfill` (`:12`) periódicamente para canales con `lastIngestedAt` antiguo.
6. **Eventos de dominio adicionales:** p. ej. `ChannelDeactivated`, `ChannelAdded`, `ListeningStarted`/`Stopped` para observabilidad y proyección. Hoy `stopListening` no emite eventos.
7. **Tests E2E** del controller HTTP usando `supertest` (no presentes todavía).
8. **Más casos de uso testeados**: `GetChannelUseCase`, `ListChannelsUseCase`, `StartListeningUseCase`.

---

## 15. Mapa rápido de archivos

```
src/ca/ingestion/telegram/
├── telegram-ingestion.module.ts        ← wiring DI
├── api/
│   ├── http/telegram-ingestion.controller.ts   ← REST admin
│   ├── input/
│   │   ├── add-channel.input.ts
│   │   └── start-listening.input.ts
│   └── mtproto/telegram-mtproto.adapter.ts     ← adapter Telegram
├── application/
│   ├── handlers/
│   │   ├── add-channel.use-case.ts
│   │   ├── add-channel.use-case.spec.ts
│   │   ├── get-channel.use-case.ts
│   │   ├── list-channels.use-case.ts
│   │   └── start-listening.use-case.ts
│   ├── mappers/channel.mapper.ts
│   └── ports/
│       ├── telegram-channel.repository.ts
│       └── telegram-event.publisher.ts
├── domain/
│   ├── entities/
│   │   ├── telegram-channel.entity.ts
│   │   └── telegram-channel.entity.spec.ts
│   ├── events/message-ingested.event.ts
│   ├── ports/telegram-listener.port.ts
│   └── value-objects/
│       ├── channel-id.vo.ts
│       ├── channel-username.vo.ts
│       └── message-id.vo.ts
└── infrastructure/
    ├── messaging/in-process-telegram-event.publisher.ts
    ├── repositories/in-memory-telegram-channel.repository.ts
    ├── seeders/telegram-channel.seeder.ts
    └── seeds/telegram-channels.seed.ts
```