# Extraction — Bounded Context

> Extrae candidatos crudos (CAs EVM/Solana, tickers, URLs) del texto plano de un mensaje de Telegram, sin aplicar reglas de negocio semánticas.

Forma parte de `src/discovery/` y se monta vía `ExtractionModule` (`extraction.module.ts:26`).

---

## 1. Propósito

Este BC convierte texto crudo en una estructura tipada de **candidatos** (direcciones de contrato, tickers, URLs). Es un paso de transformación sin invariantes de negocio más allá de la validación estructural de cada VO. La semántica (qué CA es la primaria, si el ticker coincide con el contrato, métricas válidas, etc.) la resuelven BCs posteriores (`parsing`, `chain-detection`, `normalization`).

Tres preguntas clave que el BC resuelve:

1. ¿Hay una o más CAs EVM (`0x` + 40 hex) o Solana (Base58 32 bytes) en el mensaje?
2. ¿Hay tickers mencionados (con `$` opcional y filtrado de palabras comunes)?
3. ¿Hay URLs (http/https/t.me) que merecen ser clasificadas más adelante?

**Inputs:**

- HTTP: `POST /ca/extraction/extract` con `{ channelId, messageId, occurredAt, text }`.
- Evento: `telegram.message.ingested` (solo si `text` está presente; lifecycle events sin `text` se descartan).

**Outputs:**

- HTTP: `ExtractionResultView` con `id` compuesto, `occurredAt` ISO, arrays aplanados de CAs (`{ value, chainHint }`), tickers (`string[]`) y URLs (`{ value, scheme }`).
- Evento: `extraction.candidates.extracted` con el mismo shape aplanado.

---

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Patrón regex de CAs EVM (boundary-aware) | `infrastructure/adapters/regex-based-extractor.adapter.ts:30-31` |
| Patrón regex de candidatos Solana | `infrastructure/adapters/regex-based-extractor.adapter.ts:32-33` |
| Patrón regex de tickers | `infrastructure/adapters/regex-based-extractor.adapter.ts:34` |
| Patrón regex de URLs | `infrastructure/adapters/regex-based-extractor.adapter.ts:35-36` |
| Blocklist de tickers (~70 palabras comunes/meta-términos) | `infrastructure/adapters/regex-based-extractor.adapter.ts:38-114` |
| Validación de Base58 32 bytes para Solana | `infrastructure/adapters/regex-based-extractor.adapter.ts:146-147` |
| Validación de `ContractAddress` | `domain/value-objects/contract-address.vo.ts:20` |
| Validación de `Ticker` | `domain/value-objects/ticker.vo.ts:16` |
| Validación de `Url` (esquema http/https/telegram) | `domain/value-objects/url.vo.ts:22` |
| Ensamblado del agregado `ExtractionResult` | `domain/entities/extraction-result.entity.ts:36-63` |
| Orquestación HTTP (admin) | `application/handlers/extract-from-message.use-case.ts:30-51` |
| Escucha de eventos upstream | `infrastructure/event-bus/message-ingested.handler.ts:13-40` |
| Publicación de `extraction.candidates.extracted` | `application/handlers/extract-from-message.use-case.ts:48` |

**Fuera del scope:**

- Decidir qué CA es la primaria de un call (`parsing`).
- Validar que el ticker corresponde al contrato (`normalization`).
- Detectar honeypots, holders reales o chain semantics (`chain-detection`, `enrichment`).
- Scoring o filtrado de mensajes (`scoring`, `filters`).

---

## 3. Límites transaccionales

- **Agregado raíz:** `ExtractionResult` (`domain/entities/extraction-result.entity.ts:28`). Id compuesto `${channelId}:${messageId}` (`:54`) — idempotente.
- **Atomicidad local:** una `save` en el repo + `publishAll` en el publisher tras `commit()`. No hay transacción distribuida: si el repo persiste pero el publish falla, el evento se pierde (mitigación futura: outbox pattern).
- **Eventos:** emite `extraction.candidates.extracted` (`domain/events/candidates-extracted.event.ts:34`).
- **Concurrencia:** in-memory repos usan `Map` con clave compuesta; no hay race conditions porque cada mensaje tiene id único.
- **FIFO eviction:** el repo descarta la entrada más antigua cuando supera `MAX_ENTRIES = 1000` (`in-memory-extraction-result.repository.ts:13, 19-25`).
- **Sin event sourcing:** `mutate(_event)` es **no-op** (`extraction-result.entity.ts:117-120`); el agregado es puro data.

---

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `ExtractionResult` | Agregado inmutable con los candidatos extraídos de un mensaje | `domain/entities/extraction-result.entity.ts:28` |
| `ExtractedCandidates` | DTO retornado por el extractor (`{ contractAddresses, tickers, urls }`) | `domain/ports/extractor.port.ts:5-9` |
| `ExtractorInput` | DTO de entrada del extractor (`{ channelId, messageId, occurredAt, text }`) | `domain/ports/extractor.port.ts:11-16` |
| `ContractAddress` | VO con `value` + `chainHint` (`evm`/`solana`/`unknown`) | `domain/value-objects/contract-address.vo.ts:20` |
| `ChainHint` | VO que clasifica la familia de chain de una CA | `domain/value-objects/chain-hint.vo.ts:15` |
| `Ticker` | VO símbolo 2-10 chars uppercase alfanumérico, `$` strippeado | `domain/value-objects/ticker.vo.ts:16` |
| `Url` | VO con `value` + `scheme` (`http`/`https`/`telegram`) | `domain/value-objects/url.vo.ts:22` |
| `ExtractorPort` | Puerto outbound para extraer candidatos del texto | `domain/ports/extractor.port.ts:24` |
| `ExtractionEventPublisher` | Puerto outbound para emitir eventos | `application/ports/extraction-event.publisher.ts:8` |
| `ExtractionResultRepository` | Puerto outbound de persistencia | `application/ports/extraction-result.repository.ts:8` |
| `CandidatesExtractedEvent` | Evento de dominio con payload de VOs aplanados | `domain/events/candidates-extracted.event.ts:7` |

---

## 5. API (HTTP — inbound)

Base path: `/ca/extraction` (`api/http/extraction.controller.ts:13`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/extraction/extract` | `ExtractionController.run` (`:21-29`) | `ExtractFromMessageUseCase.execute` (`:30`) |
| `GET` | `/ca/extraction/results/recent?limit=N` | `ExtractionController.recent` (`:31-37`) | `GetRecentResultsUseCase.execute` (`:16`) |
| `GET` | `/ca/extraction/results/:channelId/:messageId` | `ExtractionController.get` (`:39-45`) | `GetExtractionResultUseCase.execute` (`:16`) |

`limit` por defecto `10`, máximo `500`. Validación: entero en `[1, 500]`, sino `DomainError(VALIDATION)` (`get-recent-results.use-case.ts:19-23`).

`POST /extract` valida con `class-validator` (`api/input/extract.input.ts:16-32`): `channelId` no vacío, `messageId` int positivo, `occurredAt` Date, `text` no vacío.

> Las rutas son intencionalmente **admin-only** (`extraction.controller.ts:11-12`) — testing/manual extraction. El flujo normal es vía evento `telegram.message.ingested`.

**Output** (`application/mappers/extraction-result.mapper.ts:6-21`):

```ts
interface ExtractionResultView {
  readonly id: string;                          // `${channelId}:${messageId}`
  readonly channelId: string;
  readonly messageId: number;
  readonly occurredAt: string;                  // ISO-8601
  readonly rawText: string;
  readonly contractAddresses: ReadonlyArray<{
    readonly value: string;
    readonly chainHint: string;                 // 'evm' | 'solana' | 'unknown'
  }>;
  readonly tickers: ReadonlyArray<string>;
  readonly urls: ReadonlyArray<{
    readonly value: string;
    readonly scheme: string;                    // 'http' | 'https' | 'telegram'
  }>;
}
```

---

## 6. Objetos y modelado del dominio

### 6.1 Agregado `ExtractionResult`

Archivo: `domain/entities/extraction-result.entity.ts:28`.

```
ExtractionResult {
  readonly id: string;                  // `${channelId}:${messageId}` (entity.ts:54)
  channelId: string;
  messageId: number;
  occurredAt: Date;
  rawText: string;
  contractAddresses: ReadonlyArray<ContractAddress>;
  tickers: ReadonlyArray<Ticker>;
  urls: ReadonlyArray<Url>;
}
```

Métodos relevantes:

- `static create(input)` (`:36-63`) — valida `channelId` no vacío (`:45-47`) y `messageId` entero `>= 0` (`:48-53`). Congela los arrays con `Object.freeze` (`:59-61`).
- `emitCandidatesExtracted()` (`:97-115`) — aplica `CandidatesExtractedEvent` con los VOs aplanados (`value` + `chainHint` para CAs, `value` para tickers, `value` + `scheme` para URLs) en el payload (`:104-112`).
- `mutate(_event)` (`:117-120`) — **no-op** explícito; el agregado es puro data.

### 6.2 Value Objects

- `ContractAddress` (`domain/value-objects/contract-address.vo.ts:20`)
  - `EVM_PATTERN = /^0x[a-fA-F0-9]{40}$/` (`:21`).
  - `fromEvm(raw)` (`:27-39`) — valida regex, normaliza a lowercase, lanza `INVALID_ADDRESS` si falla (`:28-34`).
  - `fromSolana(raw)` (`:41-46`) — el caller pre-valida Base58→32 bytes; aquí solo envuelve con `chainHint: SOLANA`.
  - `fromUnknown(raw)` (`:48-60`) — trimpea, falla si vacío con `INVALID_ADDRESS` (`:49-54`); `chainHint: UNKNOWN`.
- `ChainHint` (`domain/value-objects/chain-hint.vo.ts:15`)
  - Singletons `EVM`/`SOLANA`/`UNKNOWN` (`:16-18`).
  - `fromString(raw)` (`:30-40`) — lowercasea y valida contra `VALUES` set (`:20-24`); lanza `VALIDATION` si no match (`:32-38`).
- `Ticker` (`domain/value-objects/ticker.vo.ts:16`)
  - `PATTERN = /^[A-Z0-9]{2,10}$/` (`:17`).
  - `fromString(raw)` (`:23-31`) — strip `$`, trim, uppercase; valida regex; lanza `VALIDATION` si no match (`:25-29`).
- `Url` (`domain/value-objects/url.vo.ts:22`)
  - `fromString(raw)` (`:27-46`) — match por regex de esquema (`https://`, `http://`, `t.me/`, `telegram.me/`). Trailing punctuation la quita el adapter (`:178`), no el VO.
  - Empty → `VALIDATION` (`:29-31`). Scheme no reconocido → `VALIDATION` (`:41-45`).

### 6.3 Eventos

- `CandidatesExtractedEvent` (`domain/events/candidates-extracted.event.ts:7`)
  - `eventName = 'extraction.candidates.extracted'` (`:34`).
  - `aggregateId = ${channelId}:${messageId}` (`:35`).
  - Payload aplanado (`:8-22`): `channelId`, `messageId`, `occurredAt`, `rawText`, `contractAddresses: { value, chainHint }[]`, `tickers: string[]`, `urls: { value, scheme }[]`. Esto evita que los VOs crucen el límite de BC.
  - Constructor freezea el payload completo (`:37`).
  - `toPayload()` (`:40-50`) — `occurredAt` a ISO; `contractAddresses`/`urls` shallow-copy; `tickers` spread.

### 6.4 Puertos de dominio

- `ExtractorPort` (`domain/ports/extractor.port.ts:24`) — `extract(input): Promise<ExtractedCandidates>` (`:25`). Implementado por `RegexBasedExtractorAdapter` (única impl actual).

---

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `ExtractionEventPublisher` | `application/ports/extraction-event.publisher.ts:8` | `publish(event)`, `publishAll(events)` (secuencial, await) |
| `ExtractionResultRepository` | `application/ports/extraction-result.repository.ts:8` | `save`, `findByChannelAndMessage`, `findRecent` |

Mappers:

- `ExtractionResultMapper.toView` (`application/mappers/extraction-result.mapper.ts:27-44`) — convierte agregado → `ExtractionResultView` con `occurredAt.toISOString()` (`:32`) y VOs aplanados.

---

## 8. Infraestructura

### 8.1 `RegexBasedExtractorAdapter`

Archivo: `infrastructure/adapters/regex-based-extractor.adapter.ts:27`.

- Implementa `ExtractorPort.extract` (`:116-123`) — retorna `Promise.resolve({...})` (sincrónico envuelto en promesa).
- Patrones:
  - `EVM_PATTERN` (`:30-31`) — `/(?<![A-Za-z0-9])0x[a-fA-F0-9]{40}(?![A-Za-z0-9])/g` boundary-aware para no capturar substrings dentro de palabras más largas.
  - `SOLANA_CANDIDATE_PATTERN` (`:32-33`) — `\b[1-9A-HJ-NP-Za-km-z]{32,44}\b` (Base58 length 32-44), se valida con `bs58.decode` → 32 bytes exactos (`:146-147`).
  - `TICKER_PATTERN` (`:34`) — `/\$?[A-Z]{2,10}\b/g`. Blocklist de ~70 palabras (`:38-114`).
  - `URL_PATTERN` (`:35-36`) — `https?:\/\/[^\s<>")']+|t\.me\/[A-Za-z0-9_]+`. Strip trailing `.,)\]}>'"` (`:178`).
- Deduplicación por `Map.set(value, vo)` en los tres métodos (`extractContractAddresses` `:128`, `extractTickers` `:159`, `extractUrls` `:176`).
- Errores de VO se loggean a `debug` y descartan; no propagan (`:134-138`, `:182-186`).
- Métodos privados:
  - `extractContractAddresses(text)` (`:125-156`) — itera EVM matches, luego Solana matches con validación Base58.
  - `extractTickers(text)` (`:158-173`) — filtra blocklist, deduplica case-insensitive.
  - `extractUrls(text)` (`:175-189`) — strip trailing punctuation, dedupe.

### 8.2 `InProcessExtractionEventPublisher`

Archivo: `infrastructure/messaging/in-process-extraction-event.publisher.ts:14`.

- Usa `EventEmitter2` (NestJS) inyectado por constructor (`:17`).
- `publish(event)` (`:21-26`) — `await Promise.resolve(eventEmitter.emit(event.eventName, event))`. Log `debug` con `eventName` + `aggregateId` (`:22-24`).

### 8.3 `InMemoryExtractionResultRepository`

Archivo: `infrastructure/repositories/in-memory-extraction-result.repository.ts:12`.

- `Map<string, ExtractionResult>` con `MAX_ENTRIES = 1000` (`:13`).
- `save` (`:16-26`) — set + FIFO eviction de los más antiguos si excede el límite (`:19-25`).
- `findByChannelAndMessage` (`:28-34`) — clave `${channelId}:${messageId}`.
- `findRecent(limit)` (`:36-41`) — `slice(-limit).reverse()` (últimos N, más recientes primero).

### 8.4 `MessageIngestedHandler`

Archivo: `infrastructure/event-bus/message-ingested.handler.ts:13`.

- `@OnEvent('telegram.message.ingested', { async: true })` (`:18`).
- Skip silencioso (con log debug) si `!event.payload.text` (lifecycle events del BC `ingestion/telegram` con `messageId=0`) (`:20-25`).
- Try/catch que traga errores del use case (`:26-38`) para no bloquear el event-bus.

> **Acoplamiento entre BCs (no entre módulos):** el handler importa `MessageIngestedEvent` de `ca/ingestion/telegram/domain/events/message-ingested.event` (`:3`). Es code-share tolerable pero conviene documentar si crece.

---

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `ExtractFromMessageUseCase.execute` | `application/handlers/extract-from-message.use-case.ts:30-51` | Llama `extractor.extract(input)` (`:33`); construye `ExtractionResult.create` (`:35-43`); `save` (`:45`); `emitCandidatesExtracted` (`:47`); `publishAll(commit())` (`:48`); devuelve `ExtractionResultView` (`:50`). |
| `GetExtractionResultUseCase.execute` | `application/handlers/get-extraction-result.use-case.ts:16-32` | `findByChannelAndMessage(channelId, messageId)` (`:20-23`); lanza `DomainError(NOT_FOUND)` si null (`:24-30`). |
| `GetRecentResultsUseCase.execute` | `application/handlers/get-recent-results.use-case.ts:16-26` | Valida `limit` (entero en `[1, 500]`) con `DomainError(VALIDATION)` si fuera de rango (`:19-23`); `findRecent` → mapea a view. |

---

## 10. Flujo (happy path)

```
telegram.message.ingested  (con text presente)
        |
        v
MessageIngestedHandler (event-bus)
        |
        v
ExtractFromMessageUseCase.execute
        |
        +--> ExtractorPort.extract (regex adapter)
        |
        +--> ExtractionResult.create
        |
        +--> ExtractionResultRepository.save  (FIFO evict si >1000)
        |
        +--> ExtractionResult.emitCandidatesExtracted
        |
        +--> ExtractionEventPublisher.publishAll  (EventEmitter2)
        |
        v
extraction.candidates.extracted  -->  Parsing BC (siguiente)
```

---

## 11. Wiring (NestJS DI)

Archivo: `extraction.module.ts:26-48`.

| Token | Implementación |
|---|---|
| `ExtractionController` | controller (`:27`) |
| `ExtractFromMessageUseCase` | self-provide (`:29`) |
| `GetExtractionResultUseCase` | self-provide (`:30`) |
| `GetRecentResultsUseCase` | self-provide (`:31`) |
| `MessageIngestedHandler` | self-provide (`:32`) |
| `ExtractorPort` | `RegexBasedExtractorAdapter` (`:33`) |
| `ExtractionEventPublisher` | `InProcessExtractionEventPublisher` (`:35-37`) |
| `ExtractionResultRepository` | `InMemoryExtractionResultRepository` (`:38-41`) |

**Exports** (`:43-47`): `ExtractorPort`, `ExtractionEventPublisher`, `ExtractionResultRepository`. Otros BCs pueden consumirlos si añaden `ExtractionModule` a su `imports`.

> **Acoplamiento entre BCs:** `MessageIngestedHandler` importa `MessageIngestedEvent` de `ca/ingestion/telegram/domain/events/message-ingested.event` (`message-ingested.handler.ts:3`). Es code-share tolerable; conviene mover el evento a `shared/domain/` si más BCs lo necesitan.

---

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `ExtractionResult.create` — `channelId` vacío | `domain/entities/extraction-result.entity.ts:45-47` |
| `VALIDATION` | `ExtractionResult.create` — `messageId` no es entero o `messageId < 0` | `domain/entities/extraction-result.entity.ts:48-53` |
| `INVALID_ADDRESS` | `ContractAddress.fromEvm` — regex no match | `domain/value-objects/contract-address.vo.ts:28-34` |
| `INVALID_ADDRESS` | `ContractAddress.fromUnknown` — string vacío | `domain/value-objects/contract-address.vo.ts:49-54` |
| `VALIDATION` | `Ticker.fromString` — formato no match | `domain/value-objects/ticker.vo.ts:25-29` |
| `VALIDATION` | `Url.fromString` — string vacío | `domain/value-objects/url.vo.ts:29-31` |
| `VALIDATION` | `Url.fromString` — scheme no reconocido | `domain/value-objects/url.vo.ts:41-45` |
| `VALIDATION` | `ChainHint.fromString` — valor fuera del set | `domain/value-objects/chain-hint.vo.ts:32-38` |
| `NOT_FOUND` | `GetExtractionResultUseCase.execute` | `application/handlers/get-extraction-result.use-case.ts:24-30` |
| `VALIDATION` | `GetRecentResultsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/get-recent-results.use-case.ts:19-23` |

---

## 13. Pruebas

Existentes (todas pasan con Jest):

- `infrastructure/adapters/regex-based-extractor.adapter.spec.ts` — ~17 specs: EVM (lowercase, normalización mixed-case, rechazo too-short, rechazo non-hex, no match dentro de palabras largas, dedupe, múltiples distintas), Solana (32-byte válido, USDC+WIF juntos, rechazo Base58 non-32-byte), Tickers (uppercase simple, strip `$`, filtro common words, filtro meta-terms, dedupe case-insensitive, lowercase no extrae), URLs (https, http, t.me, strip trailing punctuation, dedupe), mensaje alpha realista (CA+ticker+URL), texto vacío.
- `application/handlers/extract-from-message.use-case.spec.ts` — 3 tests: extract + persist + publish + view, empty candidates (igual publica), retrieve por `channelId + messageId`.
- `application/handlers/get-extraction-result.use-case.spec.ts` — 2 tests: happy path + `NOT_FOUND`.
- `application/handlers/get-recent-results.use-case.spec.ts` — 4 tests: orden, límites inválidos (0, -1), límite > 500, vacío.
- `infrastructure/event-bus/message-ingested.handler.spec.ts` — 3 tests: text presente → ejecuta, lifecycle sin text → skip, error absorption.

**Gaps conocidos:**

- No hay spec de `InMemoryExtractionResultRepository` (FIFO eviction no cubierta).
- No hay spec de `InProcessExtractionEventPublisher` (trivial wrapper de EventEmitter2).
- No hay spec de los VOs individualmente — se cubren transitivamente desde el adapter.

---

## 14. Extensiones sugeridas

1. **Outbox pattern** — actualmente save+publish no son atómicos. Implementar tabla `outbox` con job que republisha fallos.
2. **Adapter LLM-based** — implementar `ExtractorPort` con un LLM para casos ambiguos (muchas CAs, tickers conflictivos).
3. **Adapter ML/NER** — NER model entrenado sobre alpha-calls para mejor recall en tickers.
4. **Persistencia real** — sustituir `InMemoryExtractionResultRepository` por TypeORM/Prisma con índice compuesto `(channelId, messageId)`.
5. **Broker externo** — `RedisExtractionEventPublisher` / `KafkaExtractionEventPublisher` para multi-process.
6. **Tests E2E** del controller HTTP usando `supertest` (no presentes todavía).
7. **Mover `MessageIngestedEvent` a `shared/domain/events/`** — hoy `MessageIngestedHandler` lo importa directamente de `ingestion/telegram`, lo que acopla los BCs a nivel de archivos.

---

## 15. Mapa rápido de archivos

```
src/discovery/extraction/
├── api/
│   ├── http/extraction.controller.ts
│   └── input/extract.input.ts
├── application/
│   ├── handlers/
│   │   ├── extract-from-message.use-case.ts
│   │   ├── extract-from-message.use-case.spec.ts
│   │   ├── get-extraction-result.use-case.ts
│   │   ├── get-extraction-result.use-case.spec.ts
│   │   ├── get-recent-results.use-case.ts
│   │   └── get-recent-results.use-case.spec.ts
│   ├── mappers/extraction-result.mapper.ts
│   └── ports/
│       ├── extraction-event.publisher.ts
│       └── extraction-result.repository.ts
├── domain/
│   ├── entities/extraction-result.entity.ts
│   ├── events/candidates-extracted.event.ts
│   ├── ports/extractor.port.ts
│   └── value-objects/
│       ├── chain-hint.vo.ts
│       ├── contract-address.vo.ts
│       ├── ticker.vo.ts
│       └── url.vo.ts
├── infrastructure/
│   ├── adapters/
│   │   ├── regex-based-extractor.adapter.ts
│   │   └── regex-based-extractor.adapter.spec.ts
│   ├── event-bus/
│   │   ├── message-ingested.handler.ts
│   │   └── message-ingested.handler.spec.ts
│   ├── messaging/in-process-extraction-event.publisher.ts
│   └── repositories/in-memory-extraction-result.repository.ts
├── extraction.module.ts
└── README.md
```