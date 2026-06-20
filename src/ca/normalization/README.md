# Normalization — Bounded Context

> Dedupica menciones del mismo token a lo largo de múltiples canales/mensajes y produce una entrada canónica `CanonicalTokenCall` agregada por identidad `(chain, address)`.

Forma parte de `src/ca/` y se monta vía `NormalizationModule` (`normalization.module.ts:22`).

---

## 1. Propósito

Este BC es el **punto de convergencia del pipeline CA**: muchos `parsing.call.parsed` events pueden referirse al mismo token. Normalization los une en una sola entrada canónica, conservando el historial de fuentes (qué canales lo mencionaron, cuántos mensajes, primera/última mención) y eligiendo los mejores valores por campo (ticker por confianza, name/chart por recencia, métricas por presencia no-null).

Tres preguntas clave que el BC resuelve:

1. ¿Este nuevo `parsing.call.parsed` es del mismo token que ya conozco?
2. Si sí, ¿qué campo de la entrada canónica debería actualizarse con los datos nuevos?
3. ¿Cuántas menciones tiene acumuladas y en qué canales?

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Validar + canonicalizar dirección según chain | `domain/value-objects/normalized-address.vo.ts:20` |
| Set restringido de chains (`evm`/`solana`) | `domain/value-objects/chain.vo.ts:15` |
| Identidad compuesta `(chain, address)` | `domain/value-objects/token-identity.vo.ts:15` |
| Source (canal + mensajes) | `domain/value-objects/source.vo.ts:16` |
| Reglas de merge entre menciones | `domain/entities/canonical-token-call.entity.ts:88-151` |
| Helpers de merge (`mergeSources`, `mergeMetrics`, `pickBetter`, `pickLatestNonNull`) | `domain/entities/canonical-token-call.entity.ts:219-280` |
| Orquestación con cache `findByIdentity` | `application/handlers/normalize-call.use-case.ts:64-72` |
| Escucha de `parsing.call.parsed` | `infrastructure/event-bus/call-parsed.handler.ts:14` |
| Publicación de `normalization.call.normalized` | `application/handlers/normalize-call.use-case.ts:72` |

**Fuera del scope:**

- Scoring o filtrado.
- Detección de chain (`chain-detection`) — solo consume `chain` ya resuelto como `evm`/`solana`.
- Clasificación, enrichment.
- Validar existencia on-chain — solo normaliza lo que llega del parsing.

## 3. Límites transaccionales

- **Agregado raíz:** `CanonicalTokenCall` (`domain/entities/canonical-token-call.entity.ts:55`). Id = `TokenIdentity.key` = `${chain}:${addressLowercased}`.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat (sin outbox).
- **Eventos:** emite `normalization.call.normalized` (`domain/events/call-normalized.event.ts:43`).
- **Concurrencia:** `Map` keyed por id compuesto, sin race conditions en el repo in-memory.
- **Inmutabilidad:** `mergeWith(mention)` retorna un NUEVO `CanonicalTokenCall` (`canonical-token-call.entity.ts:88-151`) — el original no se muta. La entidad es tratada como value object para efectos prácticos aunque extienda `AggregateRoot`.

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `CanonicalTokenCall` | Agregado que agrega menciones de un mismo token | `domain/entities/canonical-token-call.entity.ts:55` |
| `MentionInput` | Input shape del use case (chain, address, ticker, métricas, contexto del mensaje) | `domain/entities/canonical-token-call.entity.ts:11-23` |
| `TokenIdentity` | VO `{ chain, address }` con `key` para Map | `domain/value-objects/token-identity.vo.ts:15` |
| `NormalizedAddress` | VO address validado por chain (lowercase EVM, Base58 32B Solana) | `domain/value-objects/normalized-address.vo.ts:20` |
| `Chain` | VO `'evm' \| 'solana'` (NO incluye `unknown`, `bsc`, etc.) | `domain/value-objects/chain.vo.ts:15` |
| `Source` | VO canal + lista de messageIds + username | `domain/value-objects/source.vo.ts:16` |
| `mergeWith` | método del agregado que retorna NUEVO agregado con mention merged | `domain/entities/canonical-token-call.entity.ts:88` |
| `bestMetrics` | métricas merged (incoming non-null gana) | `domain/entities/canonical-token-call.entity.ts:104-107, 240-250` |
| `mentionCount` | total de menciones acumuladas (sum across sources) | `domain/entities/canonical-token-call.entity.ts:171-173` |
| `firstSeenAt` / `lastSeenAt` | min/max de occurredAt | `domain/entities/canonical-token-call.entity.ts:130-137` |
| `CallNormalizedEvent` | Evento de dominio emitido tras cada create/merge | `domain/events/call-normalized.event.ts:8` |

## 5. API (HTTP — inbound)

Base path: `/ca/normalization` (`api/http/normalization.controller.ts:11`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `GET` | `/ca/normalization/tokens/recent?limit=N` | `NormalizationController.recent` (`:18`) | `ListCanonicalCallsUseCase.execute` (`:13`) |
| `GET` | `/ca/normalization/tokens/:chain/:address` | `NormalizationController.get` (`:26`) | `GetCanonicalCallUseCase.execute` (`:15`) |

> **Read-only.** No hay endpoint POST. Normalization es puramente event-driven en v1 (`normalization.controller.ts:7-10`).

`limit` por defecto `10`, máximo `500` (`application/handlers/list-canonical-calls.use-case.ts:16`).

## 6. Objetos y modelado del dominio

### 6.1 Agregado `CanonicalTokenCall`

Archivo: `domain/entities/canonical-token-call.entity.ts:55`.

```
CanonicalTokenCall {
  readonly id: string;                  // `${chain}:${addressLowercased}`
  identity: TokenIdentity;
  ticker: string | null;
  name: string | null;
  chart: string | null;
  bestMetrics: TokenMetrics;            // heredado de TokenMetrics de parsing
  sources: ReadonlyArray<Source>;
  mentionCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastConfidence: number;
}
```

- `static create(input: MentionInput)` (`:63-82`) — construye `TokenIdentity` y primer `Source` desde la primera mención. `mentionCount=1`, `firstSeenAt=lastSeenAt=occurredAt`.
- `mergeWith(mention: MentionInput)` (`:88-151`) — retorna NUEVA instancia:
  1. Valida identidad (`:89-101`) — lanza `DomainError(VALIDATION)` si la identity difiere.
  2. `mergeSources` (`:219-238`) — si el canal ya existe, `addMessage`; si no, push nuevo `Source`.
  3. `mergeMetrics` (`:240-250`) — `incoming ?? existing` por campo.
  4. `pickBetter` para ticker (`:256-269`) — gana mayor confidence; tie → más reciente.
  5. `pickLatestNonNull` para name/chart (`:271-280`).
  6. Actualiza `mentionCount`, `firstSeenAt` (min), `lastSeenAt` (max), `lastConfidence`.
- `emitNormalized()` (`:193-212`) — emite `CallNormalizedEvent` con todos los campos merged.
- `mutate(_event)` (`:214-216`) — no-op.

### 6.2 Value Objects

- `Chain` (`domain/value-objects/chain.vo.ts:15`)
  - Solo `EVM` y `SOLANA` (`:16-17`).
  - `fromString(raw)` (`:28-38`) — lanza `UNSUPPORTED_CHAIN` si no es uno de los dos.
  - `tryFromString(raw)` (`:44-47`) — devuelve `null` si no match (usado por event handler para skip silencioso).
- `NormalizedAddress` (`domain/value-objects/normalized-address.vo.ts:20`)
  - `fromEvm(raw)` (`:27-39`) — regex `^0x[a-fA-F0-9]{40}$`, lowercase, `INVALID_ADDRESS` si falla.
  - `fromSolana(raw)` (`:41-58`) — `bs58.decode` → 32 bytes; `INVALID_ADDRESS` si falla.
  - `fromChainHint(raw, hint)` (`:60-73`) — combina `tryFromString(hint)` + factory correspondiente; `null` si hint inválido o formato inválido (usado por use case para skip).
- `TokenIdentity` (`domain/value-objects/token-identity.vo.ts:15`)
  - `create(chain, address)` (`:20-30`) — valida `chain.value === address.chain.value`, lanza `Error` (NO `DomainError`) si mismatch.
  - `key` (`:36-38`) — `${chain.value}:${address.value}`.
- `Source` (`domain/value-objects/source.vo.ts:16`)
  - `firstMention(channelId, messageId, username)` (`:21-27`) — crea con `messageIds: [messageId]`.
  - `addMessage(messageId)` (`:29-38`) — append si no existe, retorna `Source` (es VO inmutable).

### 6.3 Eventos

- `CallNormalizedEvent` (`domain/events/call-normalized.event.ts:8`)
  - `eventName = 'normalization.call.normalized'` (`:43`).
  - `aggregateId = ${chain}:${address}`.
  - Payload aplanado (`:9-24`): `chain`, `address`, `ticker`, `name`, `chart`, métricas, `sourceCount`, `mentionCount`, `firstSeenAt`, `lastSeenAt`, `confidence`.
  - `toPayload()` (`:53-59`) — ambas fechas a ISO.

### 6.4 Puertos de dominio

- Ninguno. `NormalizeCallUseCase` no consulta APIs externas.

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `CanonicalTokenCallRepository` | `application/ports/canonical-token-call.repository.ts:10` | `save`, `findByIdentity`, `findRecent` |
| `NormalizationEventPublisher` | `application/ports/normalization-event.publisher.ts:6` | `publish`, `publishAll` |

Mappers:

- `CanonicalTokenCallMapper.toView` (`application/mappers/canonical-token-call.mapper.ts:32-58`) — convierte a view con sources aplanados y fechas ISO.

## 8. Infraestructura

### 8.1 `InProcessNormalizationEventPublisher`

Archivo: `infrastructure/messaging/in-process-normalization-event.publisher.ts:7`. Wrapper sobre `EventEmitter2`.

### 8.2 `InMemoryCanonicalTokenCallRepository`

Archivo: `infrastructure/repositories/in-memory-canonical-token-call.repository.ts:15`.

- `Map<string, CanonicalTokenCall>` con `MAX_ENTRIES = 5000` (`:16`) — **mayor** que los demás repos (500-1000) porque es el agregador central del pipeline CA.
- `findByIdentity` (`:31-37`) — `${chain.value}:${address.value}`.
- `findRecent` (`:39-46`) — sort por `lastSeenAt` descendente.

### 8.3 `CallParsedHandler`

Archivo: `infrastructure/event-bus/call-parsed.handler.ts:14`.

- `@OnEvent('parsing.call.parsed', { async: true })` (`:19`).
- Reconstruye `TokenMetrics` desde el payload aplanado (`:28-34`).
- `username` se pasa `null` (`:36`) — el evento de parsing no lo carga. No es required porque `channelId` es la dedupe key.
- Try/catch que traga errores (`:46-51`).
- Log debug cuando `result === null` (cadena no soportada — sucede si chain-detection aún no resolvió) (`:41-45`).

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `NormalizeCallUseCase.execute` | `application/handlers/normalize-call.use-case.ts:38` | `Chain.tryFromString(chainHint)` → `null` si no es `evm`/`solana` (skip). `NormalizedAddress.fromChainHint` → `null` si formato inválido (skip). Construye `MentionInput`. `findByIdentity` → si existe `mergeWith`, si no `create`. `save` → `emitNormalized` → `publishAll` → view. |
| `GetCanonicalCallUseCase.execute` | `application/handlers/get-canonical-call.use-case.ts:15` | `Chain.tryFromString` → `UNSUPPORTED_CHAIN` si no es `evm`/`solana`. `NormalizedAddress.fromChainHint` → `INVALID_ADDRESS` si formato mal. `findByIdentity` → `NOT_FOUND` si null. |
| `ListCanonicalCallsUseCase.execute` | `application/handlers/list-canonical-calls.use-case.ts:13` | Valida `limit` (1..500); `findRecent` → mapea a view. |

## 10. Flujo (happy path)

```
parsing.call.parsed
        |
        v
CallParsedHandler (event-bus)
        |
        v
NormalizeCallUseCase.execute
        |  [chainHint ∈ {evm, solana}? address válido? si no → return null]
        |
        +--> findByIdentity(chain, address)
        |       null → CanonicalTokenCall.create(mention)
        |       else → existing.mergeWith(mention)  [NUEVA instancia]
        |
        +--> CanonicalTokenCallRepository.save
        |
        +--> CanonicalTokenCall.emitNormalized
        |
        +--> NormalizationEventPublisher.publishAll  (EventEmitter2)
        |
        v
normalization.call.normalized  -->  ChainDetection / Enrichment (siguiente)
```

> **Skip silencioso** (no error): si `chainHint !== 'evm' && !== 'solana'` (e.g. `unknown`, `bsc` en v1), el use case retorna `null` y el handler loggea debug. El mensaje no se pierde — chain-detection BC resolverá la chain y emitirá `chain-detection.chain.detected`, que eventualmente re-provocará enrichment.

## 11. Wiring (NestJS DI)

Archivo: `normalization.module.ts:22-38`.

| Token | Implementación |
|---|---|
| `CanonicalTokenCallRepository` | `InMemoryCanonicalTokenCallRepository` (`:31`) |
| `NormalizationEventPublisher` | `InProcessNormalizationEventPublisher` (`:35`) |
| `NormalizeCallUseCase` | self-provide (`:25`) |
| `GetCanonicalCallUseCase` | self-provide (`:26`) |
| `ListCanonicalCallsUseCase` | self-provide (`:27`) |
| `CallParsedHandler` | self-provide (`:28`) |
| `NormalizationController` | controller (`:23`) |

**Exports** (`:38`): `CanonicalTokenCallRepository`, `NormalizationEventPublisher`.

> **Acoplamiento a `parsing`:** `TokenMetrics` se importa de `ca/parsing/domain/value-objects/token-metrics.vo` (`canonical-token-call.entity.ts:8`). Es dependencia cross-BC a nivel de código (no de módulo). Aceptable mientras `TokenMetrics` sea estable; documentar si cambia.

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `CanonicalTokenCall.mergeWith` — identity mismatch | `domain/entities/canonical-token-call.entity.ts:89-101` |
| `UNSUPPORTED_CHAIN` | `Chain.fromString` (en `GetCanonicalCallUseCase.execute`) | `domain/value-objects/chain.vo.ts:30-36` |
| `INVALID_ADDRESS` | `NormalizedAddress.fromEvm` / `fromSolana` (en `GetCanonicalCallUseCase.execute`) | `domain/value-objects/normalized-address.vo.ts:28-53` |
| `NOT_FOUND` | `GetCanonicalCallUseCase.execute` | `application/handlers/get-canonical-call.use-case.ts:36-42` |
| `VALIDATION` | `ListCanonicalCallsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/list-canonical-calls.use-case.ts:16-20` |

> **No-`DomainError`s**:
> - `TokenIdentity.create` lanza `Error` plain (no `DomainError`) si hay mismatch de chain (`:25-28`). Convendría migrar a `DomainError(VALIDATION)`.
> - `NormalizeCallUseCase.execute` retorna `null` (no lanza) cuando `chain`/`address` no son normalizables. Es la decisión correcta porque es la frontera event-driven.

## 13. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/normalize-call.use-case.spec.ts` — first-time create, merge con mencion subsecuente, ticker mejor por confidence, métricas mergeadas con `??`, dedupe de sources por channel, skip silencioso de chains no soportadas.
- `domain/entities/canonical-token-call.entity.spec.ts` — `mergeWith` con identity mismatch, `mergeSources` (canal nuevo vs existente), `mergeMetrics`, `pickBetter` (mayor confidence, tie → más reciente), `pickLatestNonNull`, invariants de `firstSeenAt`/`lastSeenAt`.
- `domain/value-objects/normalization-vos.spec.ts` — `Chain.fromString`/`tryFromString`, `NormalizedAddress.fromEvm`/`fromSolana`/`fromChainHint`, `TokenIdentity.create` (mismatch), `Source.firstMention`/`addMessage`.
- `infrastructure/event-bus/call-parsed.handler.spec.ts` — traducción de evento a `NormalizeCallInput`, reconstrucción de `TokenMetrics`, manejo de `result=null`.

**Gaps conocidos:**

- No hay spec de `InMemoryCanonicalTokenCallRepository` (FIFO eviction + dedupe).
- No hay spec de `InProcessNormalizationEventPublisher`.
- No hay spec de `ListCanonicalCallsUseCase`.

## 14. Extensiones sugeridas

1. **Soportar más chains** — actualmente `Chain` solo tiene `evm`/`solana`. Ampliar el set cuando chain-detection BC empiece a resolver `bsc`/`base`/`arbitrum`/`polygon` (las VOs ya existen en `ca/chain-detection`).
2. **TTL en entries** — entradas antiguas con `timeSinceLastMention > X` deberían caducar (no son trending). Hoy el FIFO `MAX_ENTRIES=5000` es la única protección.
3. **Métricas de consenso** — un token mencionado por N canales con confidence > X probablemente merece un boost. Añadir `consensusScore` al evento.
4. **Persistencia real** — TypeORM/Prisma con índice único `(chain, address)`.
5. **Outbox pattern** — atomicidad save+publish.
6. **Migrar `TokenIdentity.create` Error → DomainError** — consistencia con el resto del BC.
7. **Auditoría de merges** — opcional: log cada merge con diff de campos (ticker old/new, metrics changes) para debugging.

## 15. Mapa rápido de archivos

```
src/ca/normalization/
├── api/
│   └── http/normalization.controller.ts
├── application/
│   ├── handlers/
│   │   ├── get-canonical-call.use-case.ts
│   │   ├── list-canonical-calls.use-case.ts
│   │   ├── normalize-call.use-case.ts
│   │   └── normalize-call.use-case.spec.ts
│   ├── mappers/canonical-token-call.mapper.ts
│   └── ports/
│       ├── canonical-token-call.repository.ts
│       └── normalization-event.publisher.ts
├── domain/
│   ├── entities/
│   │   ├── canonical-token-call.entity.ts
│   │   └── canonical-token-call.entity.spec.ts
│   ├── events/call-normalized.event.ts
│   └── value-objects/
│       ├── chain.vo.ts
│       ├── normalized-address.vo.ts
│       ├── normalization-vos.spec.ts
│       ├── source.vo.ts
│       └── token-identity.vo.ts
├── infrastructure/
│   ├── event-bus/
│   │   ├── call-parsed.handler.ts
│   │   └── call-parsed.handler.spec.ts
│   ├── messaging/in-process-normalization-event.publisher.ts
│   └── repositories/in-memory-canonical-token-call.repository.ts
├── normalization.module.ts
└── README.md
```
