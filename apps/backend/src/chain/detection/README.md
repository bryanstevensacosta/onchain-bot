# Chain Detection — Bounded Context

> Determina en qué chain vive una dirección de contrato, sondeando múltiples chain probers en paralelo, scoreando cada candidato y eligiendo el ganador por puntos.

Forma parte de `src/discovery/` y se monta vía `ChainDetectionModule` (`chain-detection.module.ts:33`).

---

## 1. Propósito

Este BC resuelve la ambigüedad de una dirección de contrato. Una CA EVM puede vivir en Ethereum, BSC, Base, Arbitrum, Polygon; una CA Solana solo en Solana, pero el formato Base58-32 podría coincidir con strings accidentales. Para responder "¿dónde está este contrato?" el BC ejecuta todos los probers registrados en paralelo y puntúa cada respuesta.

Tres preguntas clave que el BC resuelve:

1. ¿Es esta dirección un contrato real en alguna de las chains probadas?
2. Si está en múltiples EVMs (mismo formato), ¿en cuál concretamente?
3. ¿Qué tan confiable es la asignación chain → address?

**Inputs:**

- HTTP: `POST /ca/chain-detection/detect` con `{ address }`.
- Evento: `normalization.call.normalized` con `chain !== 'evm' && chain !== 'solana'` (safety net; en v1 no se dispara).

**Outputs:**

- HTTP: `ChainDetectionResultView` (`address`, `resolvedChain`, `confidence`, `isContract`, `scores[]`, `detectedAt`).
- Evento: `chain-detection.chain.detected` con el mismo shape aplanado.

---

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Multi-binding de probers vía `Symbol(CHAIN_PROBERS)` | `chain-detection.module.ts:19`, factory `:50-57` |
| Probing EVM mainnet vía Alchemy (`eth_getCode`) | `infrastructure/probers/evm-chain-prober.adapter.ts:24` |
| Probing Solana vía Helius (`getAccountInfo`) | `infrastructure/probers/solana-chain-prober.adapter.ts:27` |
| Cliente JSON-RPC 2.0 ligero (axios, 5s timeout) | `infrastructure/http/json-rpc.client.ts:23` |
| Score por chain + selección de ganador | `domain/entities/chain-detection-result.entity.ts:101-112`, scoring en `application/handlers/detect-chain.use-case.ts:108-154` |
| Cálculo de confidence (winner vs. resto) | `domain/entities/chain-detection-result.entity.ts:114-130` |
| Orquestación con cache y `Promise.allSettled` | `application/handlers/detect-chain.use-case.ts:45-105` |
| Escucha selectiva de `normalization.call.normalized` | `infrastructure/event-bus/call-normalized.handler.ts:15` |
| Publicación de `chain-detection.chain.detected` | `application/handlers/detect-chain.use-case.ts:102` |

**Fuera del scope:**

- Decidir qué CA es la primaria de un call (`parsing`, `normalization`).
- Scoring o filtrado de tokens (`scoring`, `filters`).
- Obtener datos de mercado (`enrichment`).
- Validar formato de direcciones — eso es trabajo de `extraction` (`ContractAddress`) y `normalization` (`NormalizedAddress`).

---

## 3. Límites transaccionales

- **Agregado raíz:** `ChainDetectionResult` (`domain/entities/chain-detection-result.entity.ts:23`). Id = `address.toLowerCase()` (`:46`), lo que garantiza idempotencia: misma dirección → mismo id → re-detección sobrescribe.
- **Atomicidad local:** `save` + `publishAll` tras `commit()`. Mismo caveat (sin outbox) que el resto de BCs.
- **Eventos:** emite `chain-detection.chain.detected` (`domain/events/chain-detected.event.ts:7`).
- **Concurrencia:** `Map` keyed por address lowercase, sin race conditions en el repo in-memory.
- **Cache:** `DetectChainUseCase.execute` (`:54-58`) devuelve la vista cacheada si `findByAddress` resuelve antes de tocar los probers.
- **Concurrencia en probing:** `Promise.allSettled` (`:60-62`) garantiza que un fallo de un RPC no bloquea al resto.
- **Fail-fast DI:** `DetectChainUseCase` lanza `Error` si el array de probers está vacío (`:38-42`).

---

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `ChainId` | VO con la chain canónica (`ethereum`/`solana`/`bsc`/`base`/`arbitrum`/`polygon`/`unknown`) | `domain/value-objects/chain-id.vo.ts:26` |
| `ChainIdValue` | Tipo union de las 7 cadenas válidas | `domain/value-objects/chain-id.vo.ts:4-11` |
| `ChainDetectionScore` | VO con `{ chain, points, reasons }` por prober | `domain/value-objects/chain-detection-score.vo.ts:19` |
| `ChainDetectionResult` | Agregado con la chain ganadora + scores + `isContract` | `domain/entities/chain-detection-result.entity.ts:23` |
| `ChainProberPort` | Puerto outbound que sondea UNA chain y devuelve `ProbeResult` | `domain/ports/chain-prober.port.ts:21` |
| `ProbeResult` | `{ responded, isContract, notes[] }` de un prober | `domain/ports/chain-prober.port.ts:8-12` |
| `JsonRpcClient` | Cliente HTTP JSON-RPC 2.0 minimal (axios + 5s timeout) | `infrastructure/http/json-rpc.client.ts:23` |
| `CHAIN_PROBERS` | Token `Symbol` para multi-binding de probers en el módulo | `chain-detection.module.ts:19` |
| `ChainDetectedEvent` | Evento de dominio emitido tras un probe ganador | `domain/events/chain-detected.event.ts:7` |
| `points` | Puntos acumulados por chain (ver esquema de scoring abajo) | `application/handlers/detect-chain.use-case.ts:108-154` |
| `isContract` | `true`/`false` si el primer prober que respondió pudo confirmar contrato; `null` si ninguno respondió o todos dieron error | `application/handlers/detect-chain.use-case.ts:65-87` |

---

## 5. API (HTTP — inbound)

Base path: `/ca/chain-detection` (`api/http/chain-detection.controller.ts:8`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/chain-detection/detect` | `ChainDetectionController.run` (`:16`) | `DetectChainUseCase.execute` (`:45`) |
| `GET` | `/ca/chain-detection/results/recent?limit=N` | `ChainDetectionController.recent` (`:23`) | `ListDetectionResultsUseCase.execute` (`:13`) |
| `GET` | `/ca/chain-detection/results/:address` | `ChainDetectionController.get` (`:31`) | `GetDetectionResultUseCase.execute` (`:13`) |

`limit` por defecto `10`, máximo `500`. Validación: entero en `[1, 500]`, sino `DomainError(VALIDATION)` (`list-detection-results.use-case.ts:16-20`).

`POST /detect` valida con `class-validator` (`api/input/detect-chain.input.ts:3-6`): solo `address: string` no vacío.

**Output** (`application/mappers/chain-detection-result.mapper.ts:3-14`):

```ts
interface ChainDetectionResultView {
  readonly address: string;
  readonly resolvedChain: string;
  readonly confidence: number;
  readonly isContract: boolean | null;
  readonly scores: ReadonlyArray<{
    readonly chain: string;
    readonly points: number;
    readonly reasons: ReadonlyArray<string>;
  }>;
  readonly detectedAt: string;  // ISO-8601
}
```

---

## 6. Objetos y modelado del dominio

### 6.1 Agregado `ChainDetectionResult`

Archivo: `domain/entities/chain-detection-result.entity.ts:23`.

```
ChainDetectionResult {
  readonly id: string;                  // address lowercased (entity.ts:46)
  address: string;                      // también lowercased (entity.ts:51)
  resolvedChain: ChainId;              // ganador (entity.ts:52)
  confidence: number;                   // 0..1 (entity.ts:53)
  scores: ReadonlyArray<ChainDetectionScore>;
  isContract: boolean | null;
  detectedAt: Date;
}
```

Métodos relevantes:

- `static create(input)` (`:31-58`) — valida `address` no vacío (`:36-38`) y al menos 1 score (`:39-44`). `id = address.toLowerCase()` (`:46`). Llama `pickWinner` + `computeConfidence`.
- `emitDetected()` (`:79-94`) — emite `ChainDetectedEvent` con scores aplanados (`chain`, `points`, `reasons[]`).
- `mutate(_event)` (`:96-98`) — **no-op** (la entidad es inmutable tras creación; el id lowercased garantiza idempotencia).
- `pickWinner(scores)` (`:101-112`) — elige el score con mayor `points`. Top-level function, no método.
- `computeConfidence(scores, winner)` (`:114-130`):
  - Si solo hay 1 prober: `Math.min(1, winner.points / 100)`, redondeado a 2 decimales.
  - Si hay varios: `Math.min(1, round((ratio * 0.7 + marginFactor * 0.3) * 100) / 100)` donde `ratio = winner.points/100` y `marginFactor = (winner.points - maxOther)/100`.

### 6.2 Value Objects

- `ChainId` (`domain/value-objects/chain-id.vo.ts:26`)
  - Singletons `ETHEREUM`/`SOLANA`/`BSC`/`BASE`/`ARBITRUM`/`POLYGON`/`UNKNOWN` (`:27-33`).
  - `fromString(raw)` (`:49-59`) — lowercasea y valida contra set (`:35-43`); lanza `UNSUPPORTED_CHAIN` si no match (`:51-57`).
  - Helpers `isEvm` (`:65-69`) y `isSolana` (`:71-73`).
- `ChainDetectionScore` (`domain/value-objects/chain-detection-score.vo.ts:19`)
  - `create({ chain, points, reasons })` (`:24-34`) — `Math.max(0, points)`, `Object.freeze` de reasons.
  - No lanza `DomainError` — el caller pre-validó los puntos.

### 6.3 Esquema de scoring (real, no el histórico del doc)

El scoring vive en `scoreFromProbe` (`application/handlers/detect-chain.use-case.ts:108-154`). **Puntos来自于 RPC, no desde validación de formato:**

| Chain | Condición | Puntos | Reason |
|---|---|---|---|
| EVM (`ethereum`/`bsc`/`base`/`arbitrum`/`polygon`) | `responded === true` | +20 | `rpc:responded` |
| EVM | `isContract === true` | +10 | `has_code:true` |
| Solana | `responded === true` | +30 | `rpc:responded` |
| Solana | `isContract === true` | +30 | `account:exists` |
| Cualquiera | `Promise` rejected | 0 | `probe:<chainName>:error` |
| Cualquiera | `notes` del prober | 0 | `note:<note>` |

**Importante:** la validación de formato (regex `0x[a-fA-F0-9]{40}` o Base58-32) **no suma puntos**; el prober simplemente devuelve `responded=false` con un note (`evm:format_invalid`, `solana:format_invalid_base58`, `solana:format_not_32_bytes`).

**Top score por chain (vía RPC):**
- EVM: 30 (20 rpc + 10 code)
- Solana: 60 (30 rpc + 30 exists)

> **Caveat conocido:** `computeConfidence` divide por 100, por lo que con el scoring actual EVM nunca supera `confidence=0.3` y Solana `0.6`. Esto es coherente con el código pero produce scores bajos. Si se quiere confianza más realista, hay que reescalar `pickWinner`/`computeConfidence` o cambiar el divisor. (Ver §14.8.)

### 6.4 Eventos

- `ChainDetectedEvent` (`domain/events/chain-detected.event.ts:7`)
  - `eventName = 'chain-detection.chain.detected'` (`:33`).
  - `aggregateId = payload.address` (lowercased por el caller).
  - Payload (`:8-19`): `address`, `resolvedChain`, `confidence`, `isContract`, `scores[]`, `detectedAt`.
  - Constructor freezea el payload completo y, dentro de cada score, freezea `reasons` (`:34-41`).
  - `toPayload()` (`:44-53`) — `detectedAt` a ISO, `scores` se aplana con spread.

### 6.5 Puertos de dominio

- `ChainProberPort` (`domain/ports/chain-prober.port.ts:21`) — `chainName: string` (`:22`) + `probe(address): Promise<ProbeResult>` (`:23`). Implementado por EVM y Solana adapters.

---

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `ChainDetectionRepository` | `application/ports/chain-detection.repository.ts:3` | `save`, `findByAddress`, `findRecent` |
| `ChainDetectionEventPublisher` | `application/ports/chain-detection-event.publisher.ts:3` | `publish`, `publishAll` |

Mappers:

- `ChainDetectionResultMapper.toView` (`application/mappers/chain-detection-result.mapper.ts:17-30`) — convierte a `ChainDetectionResultView` con scores aplanados y `detectedAt.toISOString()`.

---

## 8. Infraestructura

### 8.1 `EvmChainProberAdapter`

Archivo: `infrastructure/probers/evm-chain-prober.adapter.ts:24`.

- `chainName = 'ethereum'` (`:25`).
- `JsonRpcClient` contra `https://eth-mainnet.g.alchemy.com/v2/{apiKey}` si `ALCHEMY_API_KEY` está configurado (`:32-35`). Si falta, log warn y `responded=false` en cada probe.
- `probe(address)` (`:43-72`):
  1. Si no hay cliente → `{ responded: false, isContract: null, notes: ['alchemy:no_api_key'] }` (`:44-50`).
  2. Si formato inválido (`/^0x[a-fA-F0-9]{40}$/i`, `:51`) → `{ responded: false, notes: ['evm:format_invalid'] }` — ahorra RPC (`:51-57`).
  3. Llama `eth_getCode(address, 'latest')`. Si bytecode es `0x` o `0x0` → `isContract=false`. Si no → `isContract=true`. Excepción → `notes: ['evm:rpc_error']` (`:58-71`).

### 8.2 `SolanaChainProberAdapter`

Archivo: `infrastructure/probers/solana-chain-prober.adapter.ts:27`.

- `chainName = 'solana'` (`:28`).
- `JsonRpcClient` contra `HELIUS_RPC_URL_MAINNET` (`cfg.helius.mainnet.rpcUrl`) si está configurado (`:34-36`).
- `probe(address)` (`:44-88`):
  1. `bs58.decode(address)` → si falla → `notes: ['solana:format_invalid_base58']` (`:54-60`). Si decoded.length !== 32 → `notes: ['solana:format_not_32_bytes']` (`:47-53`). Ahorra RPC.
  2. Si no hay cliente → `notes: ['solana:no_rpc_url']` (`:62-68`).
  3. `getAccountInfo(address, { encoding: 'base58', commitment: 'confirmed' })`. `result !== null && result.value !== null` → `isContract=true`. Excepción → `notes: ['solana:rpc_error']` (`:70-87`).

### 8.3 `JsonRpcClient`

Archivo: `infrastructure/http/json-rpc.client.ts:23`.

- `axios.create({ timeout: timeoutMs })` con `timeoutMs = 5000` por defecto (`:28-31`).
- `call<T>(method, params, id=1)` (`:33-52`) — POST con shape `{ jsonrpc: '2.0', id, method, params }`. Lanza `Error` si `data.error` (`:43-47`) o `data.result === undefined` (`:48-50`).
- **No usa `@nestjs/axios`** — solo axios directo para mantener el BC self-contained.

### 8.4 `InMemoryChainDetectionRepository`

Archivo: `infrastructure/repositories/in-memory-chain-detection.repository.ts:6`.

- `Map<string, ChainDetectionResult>` con `MAX_ENTRIES = 1000` (`:7-8`).
- `save` (`:10-20`) — LRU eviction: si el store supera `MAX_ENTRIES`, borra la entrada más antigua (primera key del Map).
- `findByAddress` (`:22-27`) — siempre lowercasea antes del lookup.
- `findRecent` (`:29-36`) — sort por `detectedAt` descendente, slice `limit`.

### 8.5 `InProcessChainDetectionEventPublisher`

Archivo: `infrastructure/messaging/in-process-chain-detection-event.publisher.ts:7`. Wrapper sobre `EventEmitter2` de `@nestjs/event-emitter`. Equivalente a los publishers de los demás BCs. Log debug con `eventName` + `aggregateId` (`:17-19`).

### 8.6 `CallNormalizedHandler`

Archivo: `infrastructure/event-bus/call-normalized.handler.ts:15`.

- `@OnEvent('normalization.call.normalized', { async: true })` (`:20`).
- Skip si `event.payload.chain === 'evm' || chain === 'solana'` — son casos ya resueltos por `extraction`/`parsing` que no necesitan re-probing (`:22-27`). Log debug con la dirección.
- Try/catch que loggea errores sin propagar (`:29-36`).

> En v1, el campo `chain` de `CallNormalizedEvent` siempre es `evm`/`solana`, así que el handler es un safety net. Útil cuando se sumen chains (sui, aptos) o formatos ambiguos.

---

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `DetectChainUseCase.execute` | `application/handlers/detect-chain.use-case.ts:45` | Normaliza address; lanza `Error('address cannot be empty')` si vacío (`:49-51`); cache check (`:54-58`); `Promise.allSettled` sobre probers (`:60-62`); `scoreFromProbe` por chain (`:72`); si todos `points === 0` lanza `Error('No chain matched...')` (`:90-92`); `ChainDetectionResult.create` (`:94-98`) → `save` (`:100`) → `emitDetected` (`:101`) → `publishAll` (`:102`) → view (`:104`). |
| `GetDetectionResultUseCase.execute` | `application/handlers/get-detection-result.use-case.ts:13` | Lowercasea address; `findByAddress`; lanza `DomainError(NOT_FOUND)` si null (`:17-22`). |
| `ListDetectionResultsUseCase.execute` | `application/handlers/list-detection-results.use-case.ts:13` | Valida `limit` (entero en `[1, 500]`) con `DomainError(VALIDATION)` si fuera de rango (`:16-20`); `findRecent` → mapea a view. |

> `DetectChainUseCase` lanza `Error` plano (no `DomainError`) para "address vacío" y "no chain matched". Si se quiere mapear a HTTP 4xx, conviene migrar a `DomainError`.

---

## 10. Flujo (happy path)

```
normalization.call.normalized  (solo si chain != 'evm' && chain != 'solana')
        |
        v
CallNormalizedHandler (event-bus)
        |
        v
DetectChainUseCase.execute
        |  [cache hit? → return view]
        |
        +--> Promise.allSettled([
        |       EvmChainProberAdapter.probe  →  eth_getCode via Alchemy
        |       SolanaChainProberAdapter.probe  →  getAccountInfo via Helius
        |     ])
        |
        +--> ChainDetectionResult.create (pickWinner + computeConfidence)
        |
        +--> ChainDetectionRepository.save  (LRU evict si >1000)
        |
        +--> ChainDetectionResult.emitDetected
        |
        +--> ChainDetectionEventPublisher.publishAll  (EventEmitter2)
        |
        v
chain-detection.chain.detected  -->  Enrichment / Classification (siguiente)
```

---

## 11. Wiring (NestJS DI)

Archivo: `chain-detection.module.ts:33-60`.

| Token | Implementación |
|---|---|
| `ChainDetectionController` | controller (`:34`) |
| `DetectChainUseCase` | self-provide, `@Inject(CHAIN_PROBERS)` (`:36`) |
| `GetDetectionResultUseCase` | self-provide (`:37`) |
| `ListDetectionResultsUseCase` | self-provide (`:38`) |
| `EvmChainProberAdapter` | self-provide, inyecta `ConfigService` (`:39`) |
| `SolanaChainProberAdapter` | self-provide, inyecta `ConfigService` (`:40`) |
| `CallNormalizedHandler` | self-provide (`:41`) |
| `ChainDetectionRepository` | `InMemoryChainDetectionRepository` (`:42-45`) |
| `ChainDetectionEventPublisher` | `InProcessChainDetectionEventPublisher` (`:46-49`) |
| `CHAIN_PROBERS` (Symbol) | `useFactory` que combina `[EvmChainProberAdapter, SolanaChainProberAdapter]` (`:50-57`) |

**Exports** (`:59`): `ChainDetectionRepository`, `ChainDetectionEventPublisher`. Los probers NO se exportan (encapsulación del multi-binding).

> Detalle DI: `DetectChainUseCase` requiere ≥1 prober; el constructor lanza `Error` si el array está vacío (`detect-chain.use-case.ts:38-42`). Es un fail-fast en boot si alguien olvida registrar un prober.

---

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `ChainDetectionResult.create` — `address` vacío o `scores` vacío | `domain/entities/chain-detection-result.entity.ts:36-44` |
| `UNSUPPORTED_CHAIN` | `ChainId.fromString` — valor fuera del set | `domain/value-objects/chain-id.vo.ts:51-57` |
| `NOT_FOUND` | `GetDetectionResultUseCase.execute` | `application/handlers/get-detection-result.use-case.ts:17-22` |
| `VALIDATION` | `ListDetectionResultsUseCase.execute` — `limit` fuera de `[1, 500]` | `application/handlers/list-detection-results.use-case.ts:16-20` |

> Nota: `DetectChainUseCase.execute` lanza `Error('address cannot be empty')` (`:50`) y `Error('No chain matched...')` (`:91`) — NO son `DomainError`. Si quieres que sean `DomainError` para mapear a HTTP 4xx, conviene migrar.

---

## 13. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/detect-chain.use-case.spec.ts` — orquestación con probers fake (7 tests): winner EVM, winner Solana, `Promise.allSettled` con rejection, no-chain-matched, cache hit idempotente, persist + publish, fail-fast sin probers.
- `infrastructure/probers/evm-chain-prober.adapter.spec.ts` — 3 tests: `no_api_key`, `format_invalid`, `chainName`. **No mockea axios**, por lo que los caminos `eth_getCode` success/fail/rpc_error no están cubiertos.
- `infrastructure/probers/solana-chain-prober.adapter.spec.ts` — 4 tests: `no_rpc_url`, `format_invalid_base58`, `format_not_32_bytes`, `chainName`. **No mockea axios**, por lo que el path `getAccountInfo` exitoso no está cubierto.
- `infrastructure/event-bus/call-normalized.handler.spec.ts` — 4 tests: skip en evm, skip en solana, llamada en chain no soportada (sui), absorción de errores.

**Gaps conocidos:**

- No hay spec para `ChainDetectionResult.pickWinner` ni `computeConfidence` (la lógica de scoring vive solo en funciones top-level del entity file).
- No hay spec para `JsonRpcClient` (puro HTTP wrapper; trivial de mockear).
- No hay spec para `ChainId.fromString` validation (cubierto por transitividad en use case).
- No hay spec de `InMemoryChainDetectionRepository` ni `InProcessChainDetectionEventPublisher`.
- Los specs de EVM/Solana probers no mockean `axios`, así que los caminos RPC reales no están ejercitados.

---

## 14. Extensiones sugeridas

1. **Más probers EVM** — añadir `BscChainProberAdapter`, `BaseChainProberAdapter`, etc. (ya están previstas las `ChainId.BSC`/`BASE`/`ARBITRUM`/`POLYGON`). Cambia el `chainName` y el endpoint Alchemy subdomain. El multi-binding ya soporta N probers sin tocar el use case.
2. **Cache TTL configurable** — hoy el cache es por dirección sin expiry (re-detección solo manual o vía el handler). Mover a `MAX_CACHE_AGE_MS` con `isFresh()` análogo al de `enrichment`.
3. **Reintentos en RPC** — los adapters tragan el error como `notes`; añadir retry con backoff para errores transitorios.
4. **Outbox pattern** — `save` + `publishAll` no son atómicos.
5. **Persistencia real** — TypeORM/Prisma con índice en `address` (única por chain detectado).
6. **Probador de sui/aptos** — documentado en `chain-detection.module.ts:30` como v2.
7. **Bulk detection** — `POST /detect` con un array de addresses para re-procesar en lote.
8. **Reescalar scoring** — `computeConfidence` divide por 100 pero el scoring real solo llega a 30 (EVM) o 60 (Solana). Considerar un divisor dinámico o reescalar `scoreFromProbe` para que el máximo real sea 100. (Esto es coherente con el código actual pero produce `confidence` ≤ 0.6.)
9. **DomainError en `DetectChainUseCase`** — migrar los `Error` planos de `:50` y `:91` a `DomainError` para que el filtro HTTP los mapee a 4xx.

---

## 15. Mapa rápido de archivos

```
src/discovery/chain-detection/
├── api/
│   ├── http/chain-detection.controller.ts
│   └── input/detect-chain.input.ts
├── application/
│   ├── handlers/
│   │   ├── detect-chain.use-case.ts
│   │   └── detect-chain.use-case.spec.ts
│   ├── mappers/chain-detection-result.mapper.ts
│   └── ports/
│       ├── chain-detection-event.publisher.ts
│       └── chain-detection.repository.ts
├── domain/
│   ├── entities/chain-detection-result.entity.ts
│   ├── events/chain-detected.event.ts
│   ├── ports/chain-prober.port.ts
│   └── value-objects/
│       ├── chain-detection-score.vo.ts
│       └── chain-id.vo.ts
├── infrastructure/
│   ├── event-bus/
│   │   ├── call-normalized.handler.ts
│   │   └── call-normalized.handler.spec.ts
│   ├── http/json-rpc.client.ts
│   ├── messaging/in-process-chain-detection-event.publisher.ts
│   ├── probers/
│   │   ├── evm-chain-prober.adapter.ts
│   │   ├── evm-chain-prober.adapter.spec.ts
│   │   ├── solana-chain-prober.adapter.ts
│   │   └── solana-chain-prober.adapter.spec.ts
│   └── repositories/in-memory-chain-detection.repository.ts
├── chain-detection.module.ts
└── README.md
```