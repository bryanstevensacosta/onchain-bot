# Classification — Bounded Context

> Clasifica tokens (TOKEN/POOL/ROUTER/NFT/SCAM/UNKNOWN) y emite señales de riesgo (LOW_LIQUIDITY, NO_HOLDERS, POSSIBLE_RUG, etc.) basándose exclusivamente en el `TokenSnapshot` producido por `enrichment`.

Forma parte de `src/ca/` y se monta vía `ClassificationModule` (`classification.module.ts:21`).

---

## 1. Propósito

Este BC toma la "foto" del mercado de un token (MC, LP, holders, top10, change 24h, pares) y produce una **categoría discreta** + un conjunto de **señales de riesgo**. Es puramente heurístico en v1 — no analiza bytecode ni ABIs. La categoría y las señales son el insumo principal de los BCs `scoring` y `filters` aguas abajo.

Tres preguntas clave que el BC resuelve:

1. ¿Este contrato parece un token tradeable o un pool/router/NFT/scam?
2. ¿Qué señales de riesgo observables tiene (liquidez baja, holders concentrados, microcap)?
3. ¿Qué tan confiable es la clasificación dados los datos disponibles?

**Inputs:**

- HTTP: `POST /ca/classification/classify` con el snapshot manual.
- Evento: `enrichment.token.enriched` (traducido a `SnapshotSignals`).

**Outputs:**

- HTTP: `TokenClassificationView` (con `riskWeight` y `highestSeverity` calculados en runtime).
- Evento: `classification.token.classified` con el mismo shape aplanado.

---

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Categorías discretas (`TOKEN`/`POOL`/`ROUTER`/`NFT`/`SCAM`/`UNKNOWN`) | `domain/value-objects/classification.vo.ts:27` |
| Señales de riesgo tipadas con severidad | `domain/value-objects/risk-signal.vo.ts:30` |
| Reglas heurísticas de clasificación | `application/handlers/classify-token.use-case.ts:74-199` |
| Cálculo de confidence (base + completeness − risk penalty) | `domain/entities/token-classification.entity.ts:148-184` |
| Cálculo de risk weight por severidad | `domain/value-objects/risk-signal.vo.ts:94-105` |
| Ensamblado del agregado `TokenClassification` | `domain/entities/token-classification.entity.ts:44-70` |
| Orquestación HTTP (admin) | `application/handlers/classify-token.use-case.ts:53-72` |
| Escucha de `enrichment.token.enriched` | `infrastructure/event-bus/token-enriched.handler.ts:12-40` |
| Publicación de `classification.token.classified` | `application/handlers/classify-token.use-case.ts:69` |

**Fuera del scope:**

- Análisis on-chain (bytecode, selectors) — v2 documentado en `classification.module.ts:19`.
- Filtrado o scoring — solo clasifica.
- Enriquecer datos — eso es `enrichment`.
- Detectar chain — eso es `chain-detection`.

---

## 3. Límites transaccionales

- **Agregado raíz:** `TokenClassification` (`domain/entities/token-classification.entity.ts:36`). Id compuesto `${chain}:${address.toLowerCase()}` (`:54`) — idempotente.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat (sin outbox).
- **Eventos:** emite `classification.token.classified` (`domain/events/token-classified.event.ts:7`).
- **Concurrencia:** `Map` keyed por id compuesto, sin race conditions.
- **LRU eviction:** el repositorio descarta la entrada más antigua cuando supera `MAX_ENTRIES = 500` (`in-memory-token-classification.repository.ts:14-22`).
- **Sin event sourcing:** `mutate(_event)` es **no-op** (`token-classification.entity.ts:137-139`); la re-clasificación sobrescribe el agregado.

---

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `Classification` | VO categoría discreta (`TOKEN`/`POOL`/`ROUTER`/`NFT`/`SCAM`/`UNKNOWN`) | `domain/value-objects/classification.vo.ts:27` |
| `ClassificationValue` | Tipo union de las 6 categorías válidas | `domain/value-objects/classification.vo.ts:4-10` |
| `RiskSignal` | VO `{ type, severity, description }` con `weight()` | `domain/value-objects/risk-signal.vo.ts:30` |
| `SignalType` | Tipo union de los 9 tipos posibles (`LOW_LIQUIDITY`/`NO_HOLDERS`/`NO_PAIRS`/`CONCENTRATED_HOLDERS`/`EXTREME_PRICE_CHANGE`/`MICROCAP`/`NO_NAME`/`NO_MARKET_DATA`/`POSSIBLE_RUG`) | `domain/value-objects/risk-signal.vo.ts:4-13` |
| `Severity` | enum `'LOW' \| 'MEDIUM' \| 'HIGH' \| 'CRITICAL'` | `domain/value-objects/risk-signal.vo.ts:15` |
| `TokenClassification` | Agregado categoría + señales + confidence | `domain/entities/token-classification.entity.ts:36` |
| `riskWeight` | suma de `weight()` de todas las señales | `domain/entities/token-classification.entity.ts:114-116` |
| `highestSeverity` | señal con mayor severidad (CRITICAL=3 > HIGH=2 > MEDIUM=1 > LOW=0) | `domain/entities/token-classification.entity.ts:98-112` |
| `snapshotCompleteness` | input 0..1: ratio de campos no-null del snapshot | calculado en `enrichment` (`enrich-token.use-case.ts:140-153`), consumido aquí |
| `SnapshotSignals` | DTO de input del use case con los 12 campos del snapshot | `application/handlers/classify-token.use-case.ts:13-26` |
| `TokenClassifiedEvent` | Evento de dominio emitido tras clasificar | `domain/events/token-classified.event.ts:7` |

> `NO_PAIRS` está definido en `SignalType` (`:7`) pero **no se usa en las reglas heurísticas de v1**; queda reservado para v2.

---

## 5. API (HTTP — inbound)

Base path: `/ca/classification` (`api/http/classification.controller.ts:8`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/classification/classify` | `ClassificationController.run` (`:16-34`) | `ClassifyTokenUseCase.execute` (`:53`) |
| `GET` | `/ca/classification/tokens/recent?limit=N` | `ClassificationController.recent` (`:36-42`) | `ListClassificationsUseCase.execute` (`:13`) |
| `GET` | `/ca/classification/tokens/:chain/:address` | `ClassificationController.get` (`:44-50`) | `GetClassificationUseCase.execute` (`:14`) |

`limit` por defecto `10`, máximo `500`. Validación: entero en `[1, 500]`, sino `DomainError(VALIDATION)` (`list-classifications.use-case.ts:16-20`).

`POST /classify` valida con `class-validator` (`api/input/classify-token.input.ts:12-66`): `chain`, `address`, `hasPairs`, `pairCount` requeridos; resto opcional (`liquidityUsd`, `marketCapUsd`, `priceChange24h`, `holders`, `top10HolderPercent`, `hasName`, `hasTicker`, `completeness`, `signals`).

> El campo `signals` del input existe pero **no se usa** en el flujo HTTP normal (las señales las computa el use case a partir del snapshot). Probablemente legado de un input anterior o预留 para v2.

**Output** (`application/mappers/token-classification.mapper.ts:9-20`):

```ts
interface TokenClassificationView {
  readonly id: string;                                  // `${chain}:${address}`
  readonly chain: string;
  readonly address: string;                             // lowercased
  readonly classification: string;
  readonly confidence: number;                          // 0..1
  readonly signals: ReadonlyArray<RiskSignalView>;
  readonly riskWeight: number;                          // calculado en runtime
  readonly highestSeverity: string | null;             // calculado en runtime
  readonly snapshotCompleteness: number;
  readonly classifiedAt: string;                       // ISO-8601
}
```

---

## 6. Objetos y modelado del dominio

### 6.1 Agregado `TokenClassification`

Archivo: `domain/entities/token-classification.entity.ts:36`.

```
TokenClassification {
  readonly id: string;                  // `${chain.value}:${address.toLowerCase()}` (entity.ts:54)
  chain: ChainId;
  address: string;                      // lowercased (entity.ts:63)
  classification: Classification;
  signals: ReadonlyArray<RiskSignal>;
  snapshotCompleteness: number;         // 0..1
  confidence: number;                   // 0..1
  classifiedAt: Date;
}
```

Métodos relevantes:

- `static create(input)` (`:44-70`) — valida `address` no vacío (`:45-47`) y `snapshotCompleteness ∈ [0, 1]` (`:48-53`). Computa `confidence` con `computeConfidence` (`:55-59`). Normaliza address a lowercase (`:63`).
- `hasSignal(type)` (`:94-96`) — búsqueda lineal sobre signals.
- `highestSeverity()` (`:98-112`) — orden numérico (`LOW=0`, `MEDIUM=1`, `HIGH=2`, `CRITICAL=3`). El `order` map se construye inline en el método.
- `riskWeight()` (`:114-116`) — suma de `signal.weight()`.
- `emitClassified()` (`:118-135`) — emite `TokenClassifiedEvent` con signals aplanados y `riskWeight` calculado en runtime (`:130`).
- `mutate(_event)` (`:137-139`) — **no-op**.
- `computeConfidence(classification, signals, completeness)` (`:148-184`) — función top-level:
  - `base` por tipo: `TOKEN=0.7`, `POOL/ROUTER/NFT=0.5`, `SCAM=0.6`, `UNKNOWN=0.4`.
  - `completenessBonus = completeness * 0.2`.
  - `riskPenalty = min(0.4, sum(weight() / 100))`.
  - `result = clamp(base + bonus − penalty, 0, 1)`, redondeado a 2 decimales.

### 6.2 Value Objects

- `Classification` (`domain/value-objects/classification.vo.ts:27`)
  - Singletons `TOKEN`/`POOL`/`ROUTER`/`NFT`/`SCAM`/`UNKNOWN` (`:28-33`).
  - `fromString(raw)` (`:48-58`) — `toUpperCase`, valida contra `VALID` set (`:35-42`), lanza `VALIDATION` si no match (`:50-56`).
- `RiskSignal` (`domain/value-objects/risk-signal.vo.ts:30`)
  - `create({ type, severity, description })` (`:54-78`) — valida type (`:59-64`), severity (`:65-70`) y `description.trim()` no vacío (`:71-76`). Cualquier inconsistencia lanza `VALIDATION`.
  - `weight()` (`:94-105`): `CRITICAL=40`, `HIGH=20`, `MEDIUM=10`, `LOW=3`.
  - `isCritical()` (`:90-92`).

### 6.3 Eventos

- `TokenClassifiedEvent` (`domain/events/token-classified.event.ts:7`)
  - `eventName = 'classification.token.classified'` (`:38`).
  - `aggregateId = ${chain}:${address}` (`:39`).
  - Payload aplanado (`:8-21`): `chain`, `address`, `classification`, `confidence`, `signals[]`, `riskWeight`, `snapshotCompleteness`, `classifiedAt`.
  - Constructor freezea el payload completo y el array de signals (`:41-44`).
  - `toPayload()` (`:47-52`) — `classifiedAt` a ISO; el resto se aplana con spread.

### 6.4 Puertos de dominio

- Ninguno. `ClassifyTokenUseCase` es puro: no consulta APIs externas ni RPC. Solo reglas sobre los datos del evento upstream.

---

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `TokenClassificationRepository` | `application/ports/token-classification.repository.ts:4` | `save`, `findByChainAndAddress`, `findRecent` |
| `ClassificationEventPublisher` | `application/ports/classification-event.publisher.ts:3` | `publish`, `publishAll` |

Mappers:

- `TokenClassificationMapper.toView` (`application/mappers/token-classification.mapper.ts:23-40`) — convierte a view con `riskWeight` y `highestSeverity` calculados en runtime (`:35-36`).

---

## 8. Infraestructura

### 8.1 Reglas heurísticas

Archivo: `application/handlers/classify-token.use-case.ts:74-199` (método privado `classify(input)`).

**Señales emitidas (en orden de evaluación):**

| Señal | Severidad | Condición real |
|---|---|---|
| `POSSIBLE_RUG` | CRITICAL | `liquidityUsd !== null && liquidityUsd < 1000 && holders !== null && holders < 10` (`:80-93`) |
| `LOW_LIQUIDITY` | HIGH | `liquidityUsd !== null && liquidityUsd < 1000` (`:95-103`) |
| `LOW_LIQUIDITY` | MEDIUM | `liquidityUsd !== null && 1000 <= liquidityUsd < 5000` (`:104-112`) |
| `NO_HOLDERS` | HIGH | `holders === null OR holders === 0` (`:115-125`) |
| `NO_HOLDERS` | MEDIUM | `0 < holders < 50` (`:126-134`) |
| `CONCENTRATED_HOLDERS` | HIGH | `top10HolderPercent !== null && top10HolderPercent > 80` (`:136-144`) |
| `EXTREME_PRICE_CHANGE` | HIGH | `priceChange24h !== null && \|priceChange24h\| > 500` (`:146-154`) |
| `MICROCAP` | HIGH | `marketCapUsd !== null && marketCapUsd < 1000` (`:156-164`) |
| `NO_NAME` | LOW | `!hasName && !hasTicker` (`:166-174`) |
| `NO_MARKET_DATA` | MEDIUM | solo si classification = `UNKNOWN` (`:187-193`) |

> ⚠️ El JSDoc del use case (`:34`) dice "Liquidity < $100 AND no holders AND no name → SCAM" — esto **no coincide con el código real**, que usa `< $1000 AND holders < 10` y no requiere `noName`. El código real es la fuente de verdad.

**Decisión de categoría:**

| Categoría | Condición |
|---|---|
| `SCAM` | `POSSIBLE_RUG` presente (`:183-184`) |
| `UNKNOWN` | `!hasPairs AND (holders === null OR holders === 0) AND completeness < 0.3` (`:178-181, 185-186`) |
| `TOKEN` | default (`:194-196`) — puede llevar señales de riesgo |

> `POOL`/`ROUTER`/`NFT` están definidos en el VO pero **no se asignan en v1** — necesitarían signals on-chain (function selectors, `tokenURI`/`ownerOf`). El módulo lo documenta como v2 (`classification.module.ts:19`).

### 8.2 `InProcessClassificationEventPublisher`

Archivo: `infrastructure/messaging/in-process-classification-event.publisher.ts:7`. Wrapper sobre `EventEmitter2` de `@nestjs/event-emitter`. Log debug con `eventName` + `aggregateId` (`:17-19`).

### 8.3 `InMemoryTokenClassificationRepository`

Archivo: `infrastructure/repositories/in-memory-token-classification.repository.ts:7`.

- `Map<string, TokenClassification>` con `MAX_ENTRIES = 500` (`:8`) — menor que chain-detection/extraction porque las clasificaciones suelen ser más "estables".
- `save` (`:11-23`) — LRU eviction: si el store supera `MAX_ENTRIES`, borra la entrada más antigua (primera key del Map).
- `findByChainAndAddress` (`:25-31`) — clave `${chain.value}:${address.toLowerCase()}`.
- `findRecent` (`:33-40`) — sort por `classifiedAt` descendente, slice `limit`.

### 8.4 `TokenEnrichedHandler`

Archivo: `infrastructure/event-bus/token-enriched.handler.ts:12`.

- `@OnEvent('enrichment.token.enriched', { async: true })` (`:17`).
- Traduce `TokenEnrichedEvent` → `SnapshotSignals` (`:20-33`):
  - `hasPairs = pairCount > 0` (`:23`).
  - `hasName = false` y `hasTicker = false` hardcodeados (`:30-31`) — el evento de enrichment no los carga. El comentario inline lo admite.
- Try/catch que traga errores (`:34-39`) — la clasificación fallida de un token no debe tumbar el handler.

---

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `ClassifyTokenUseCase.execute` | `application/handlers/classify-token.use-case.ts:53-72` | Construye `ChainId.fromString(input.chain)` (`:56`); llama `classify(input)` (`:57`) para obtener `{classification, signals}`; crea agregado (`:59-65`); `save` → `emitClassified` → `publishAll` (`:67-69`) → view (`:71`). |
| `GetClassificationUseCase.execute` | `application/handlers/get-classification.use-case.ts:14-31` | Construye `ChainId.fromString(chain)` (`:18`); `findByChainAndAddress` con address lowercased (`:19-22`); lanza `DomainError(NOT_FOUND)` si null (`:23-29`). |
| `ListClassificationsUseCase.execute` | `application/handlers/list-classifications.use-case.ts:13-23` | Valida `limit` (entero en `[1, 500]`) con `DomainError(VALIDATION)` si fuera de rango (`:16-20`); `findRecent` → mapea a view. |

---

## 10. Flujo (happy path)

```
enrichment.token.enriched
        |
        v
TokenEnrichedHandler (event-bus)
        |
        v
ClassifyTokenUseCase.execute
        |
        +--> classify(input)  [reglas heurísticas]
        |       signals: RiskSignal[]
        |       classification: Classification
        |
        +--> TokenClassification.create (computeConfidence)
        |
        +--> TokenClassificationRepository.save  (LRU evict si >500)
        |
        +--> TokenClassification.emitClassified
        |
        +--> ClassificationEventPublisher.publishAll  (EventEmitter2)
        |
        v
classification.token.classified  -->  Scoring / Filters (siguiente)
```

---

## 11. Wiring (NestJS DI)

Archivo: `classification.module.ts:21-38`.

| Token | Implementación |
|---|---|
| `ClassificationController` | controller (`:22`) |
| `ClassifyTokenUseCase` | self-provide (`:24`) |
| `GetClassificationUseCase` | self-provide (`:25`) |
| `ListClassificationsUseCase` | self-provide (`:26`) |
| `TokenEnrichedHandler` | self-provide (`:27`) |
| `TokenClassificationRepository` | `InMemoryTokenClassificationRepository` (`:28-31`) |
| `ClassificationEventPublisher` | `InProcessClassificationEventPublisher` (`:32-35`) |

**Exports** (`:37`): `TokenClassificationRepository`, `ClassificationEventPublisher`.

> **Acoplamiento entre BCs (no entre módulos):** el agregado y el repositorio importan `ChainId` de `ca/chain-detection/domain/value-objects/chain-id.vo` (`token-classification.entity.ts:4`, `in-memory-token-classification.repository.ts:2`, `token-classification.repository.ts:2`). Es code-share tolerable pero conviene documentar si crece — una alternativa es mover `ChainId` a `shared/domain/` o duplicar el VO en classification.

---

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `TokenClassification.create` — `address` vacío | `domain/entities/token-classification.entity.ts:45-47` |
| `VALIDATION` | `TokenClassification.create` — `snapshotCompleteness` fuera de [0,1] | `domain/entities/token-classification.entity.ts:48-53` |
| `VALIDATION` | `Classification.fromString` — valor fuera del set | `domain/value-objects/classification.vo.ts:50-56` |
| `VALIDATION` | `RiskSignal.create` — type inválido | `domain/value-objects/risk-signal.vo.ts:59-64` |
| `VALIDATION` | `RiskSignal.create` — severity inválida | `domain/value-objects/risk-signal.vo.ts:65-70` |
| `VALIDATION` | `RiskSignal.create` — `description.trim()` vacío | `domain/value-objects/risk-signal.vo.ts:71-76` |
| `UNSUPPORTED_CHAIN` | `ChainId.fromString` (vía dependency) — usado en `ClassifyTokenUseCase.execute:56` y `GetClassificationUseCase.execute:18` | `ca/chain-detection/domain/value-objects/chain-id.vo.ts:51-57` |
| `NOT_FOUND` | `GetClassificationUseCase.execute` | `application/handlers/get-classification.use-case.ts:23-29` |
| `VALIDATION` | `ListClassificationsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/list-classifications.use-case.ts:16-20` |

---

## 13. Pruebas

Existentes (todas pasan con Jest):

- `domain/entities/token-classification.entity.spec.ts` — `riskWeight` (suma), `highestSeverity` (peor), `hasSignal`, validación de completeness y address, `emitClassified` + `commit`.
- `application/handlers/classify-token.use-case.spec.ts` — orquestación + reglas heurísticas:
  - Token sano → `TOKEN` sin signals.
  - Liquidity $50 + 0 holders → `SCAM` con `POSSIBLE_RUG` CRITICAL + `LOW_LIQUIDITY` HIGH.
  - No pairs + no holders + completeness 0.1 → `UNKNOWN` con `NO_MARKET_DATA`.
  - `LOW_LIQUIDITY` MEDIUM (liquidity $3000), `CONCENTRATED_HOLDERS` HIGH (top10 95%), `EXTREME_PRICE_CHANGE` HIGH (|change|=800), `MICROCAP` HIGH (mc $500), `NO_HOLDERS` HIGH (holders=0), `NO_NAME` LOW.
  - Persistencia + publicación de evento.
  - Agregación de `riskWeight` con 4 HIGH + 1 MEDIUM ≥ 80.
  - Comparación de `confidence` entre token risky vs healthy.
- `infrastructure/event-bus/token-enriched.handler.spec.ts` — 2 tests: traducción de evento a `SnapshotSignals` (incluido `hasName=false`/`hasTicker=false`), absorción de errores.

**Gaps conocidos:**

- No hay spec de `Classification.fromString` ni `RiskSignal.create` validation (cubierto por transitividad).
- No hay spec de `InMemoryTokenClassificationRepository` ni `InProcessClassificationEventPublisher`.
- No hay spec de `GetClassificationUseCase` ni `ListClassificationsUseCase` (análogo a los demás BCs).

---

## 14. Extensiones sugeridas

1. **Análisis on-chain** — v2 documentado en `classification.module.ts:19`. Añadir `BytecodeProberPort` y reglas basadas en function selectors (e.g. `transfer(from,to,amount)` → TOKEN, `swap()` → POOL, `getReserves()` → ROUTER, `tokenURI()` → NFT).
2. **Persistir `hasName`/`hasTicker`** — actualmente el handler siempre pasa `false` (`token-enriched.handler.ts:30-31`). Subir el dato desde `parsing` a través del pipeline o añadir un evento `parsing.metadata.extracted`.
3. **ML classification** — modelo supervisado sobre los mismos features para casos ambiguos (especialmente `POOL` vs `ROUTER` vs `TOKEN`).
4. **Whitelist de tokens conocidos** — reducir falsos positivos en SCAM para tokens legítimos (USDC, WETH) mediante una tabla de overrides.
5. **Outbox pattern** — atomicidad save+publish.
6. **Persistencia real** — TypeORM/Prisma con índice único `(chain, address)`.
7. **Corregir el JSDoc del use case** — la línea `classify-token.use-case.ts:34` describe "Liquidity < $100 AND no holders AND no name → SCAM", pero el código usa `< $1000 AND holders < 10` y no chequea `noName`.
8. **Migrar `ChainId` a `shared/domain/`** — eliminar el acoplamiento entre classification y chain-detection.

---

## 15. Mapa rápido de archivos

```
src/ca/classification/
├── api/
│   ├── http/classification.controller.ts
│   └── input/classify-token.input.ts
├── application/
│   ├── handlers/
│   │   ├── classify-token.use-case.ts
│   │   └── classify-token.use-case.spec.ts
│   ├── mappers/token-classification.mapper.ts
│   └── ports/
│       ├── classification-event.publisher.ts
│       └── token-classification.repository.ts
├── domain/
│   ├── entities/
│   │   ├── token-classification.entity.ts
│   │   └── token-classification.entity.spec.ts
│   ├── events/token-classified.event.ts
│   └── value-objects/
│       ├── classification.vo.ts
│       └── risk-signal.vo.ts
├── infrastructure/
│   ├── event-bus/
│   │   ├── token-enriched.handler.ts
│   │   └── token-enriched.handler.spec.ts
│   ├── messaging/in-process-classification-event.publisher.ts
│   └── repositories/in-memory-token-classification.repository.ts
├── classification.module.ts
└── README.md
```