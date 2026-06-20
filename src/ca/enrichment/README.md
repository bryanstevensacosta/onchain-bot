# Enrichment — Bounded Context

> Agrega datos de mercado en tiempo real (precio, liquidez, FDV, market cap, holders, pares) consultando múltiples proveedores externos en paralelo y fusionando los resultados.

Forma parte de `src/ca/` y se monta vía `EnrichmentModule` (`enrichment.module.ts:30`).

---

## 1. Propósito

Este BC produce una **fotografía del estado de mercado** de un token a partir de N proveedores (DexScreener, GeckoTerminal, Birdeye). Su rol es ortogonal al parsing: el parsing extrae datos del texto del mensaje, el enrichment consulta APIs externas. La salida alimenta `classification`, `scoring`, `filters` y potencialmente `trading`.

Tres preguntas clave que el BC resuelve:

1. ¿Hay datos de mercado disponibles para este token en alguna fuente externa?
2. Si hay varias fuentes, ¿cuál es el merge correcto (first non-null por campo)?
3. ¿Qué tan completo es el snapshot (qué porcentaje de campos no son null)?

**Inputs:**

- HTTP: `POST /ca/enrichment/enrich` con `{ chain, address, force? }`.
- Evento: `normalization.call.normalized` con `chain ∈ {evm, solana}`.

**Outputs:**

- HTTP: `{ snapshot: TokenSnapshotView, errors: { provider, message }[] }` (`EnrichResult`, `enrich-token.use-case.ts:25-28`).
- Evento: `enrichment.token.enriched` si hubo data, o `enrichment.token.failed` si todos los providers fallaron o devolvieron `null`.

---

## 2. Responsabilidades del BC

| Responsabilidad | Dónde vive |
|---|---|
| Multi-binding de providers vía `Symbol(PROVIDERS)` | `enrichment.tokens.ts:7` + factory `enrichment.module.ts:48-56` |
| `DexScreenerAdapter` (free, EVM + Solana) | `infrastructure/providers/dexscreener.adapter.ts:37` |
| `GeckoTerminalAdapter` (free, holders + top10) | `infrastructure/providers/geckoterminal.adapter.ts:53` |
| `BirdeyeAdapter` (premium, Solana-only, mejor price accuracy) | `infrastructure/providers/birdeye.adapter.ts:37` |
| Merge first-non-null por campo entre providers | `application/handlers/enrich-token.use-case.ts:153-180` |
| Dedupe de pares por `${dexId}:${address}` (max `reserveUsd`) | `application/handlers/enrich-token.use-case.ts:182-191` |
| Cache con TTL (5 min) | `enrich-token.use-case.ts:49, 69-78` |
| Selección de "primary pair" (max `reserveUsd`) | `domain/entities/token-snapshot.entity.ts:188-196` |
| Cálculo de completenessScore (ratio sobre 8 campos) | `domain/entities/token-snapshot.entity.ts:140-153` |
| Escucha de `normalization.call.normalized` | `infrastructure/event-bus/call-normalized.handler.ts:14-41` |
| Publicación de `enrichment.token.enriched` o `enrichment.token.failed` | `enrich-token.use-case.ts:136-147` |

**Fuera del scope:**

- Scoring o filtrado — `scoring`, `filters`.
- Categorización — `classification`.
- Detección de chain — `chain-detection`.
- Ejecución de trades — `trading`.

---

## 3. Límites transaccionales

- **Agregado raíz:** `TokenSnapshot` (`domain/entities/token-snapshot.entity.ts:48`). Id compuesto `${chain.value}:${address.toLowerCase()}` (`:60`) — idempotente.
- **Atomicidad local:** `save` + `publishAll` (o `publish` para `EnrichmentFailedEvent`) tras `commit()`. Mismo caveat (sin outbox).
- **Eventos:** emite `enrichment.token.enriched` (`domain/events/token-enriched.event.ts:13`) o `enrichment.token.failed` (`domain/events/enrichment-failed.event.ts:7`).
- **Cache:** si snapshot existe y `age <= 5 * 60 * 1000` ms, devuelve cached view sin tocar providers (`enrich-token.use-case.ts:69-78`). `force: true` lo salta.
- **LRU eviction:** el repositorio descarta la entrada más antigua cuando supera `MAX_ENTRIES = 500` (`in-memory-token-snapshot.repository.ts:14-20`).
- **Concurrencia:** `Map` keyed por id compuesto, sin race conditions.

---

## 4. Lenguaje ubicuo

| Término | Definición | Referencia |
|---|---|---|
| `TokenSnapshot` | Agregado con datos de mercado agregados | `domain/entities/token-snapshot.entity.ts:48` |
| `Pair` | VO `{ address, dexId, quoteToken, reserveUsd }` | `domain/value-objects/pair.vo.ts:20` |
| `Price` | VO USD, permite 0 pero rechaza negativos/no-finitos | `domain/value-objects/price.vo.ts:14` |
| `Liquidity` | VO USD, mismas reglas que `Price` (sin shorthand) | `domain/value-objects/liquidity.vo.ts:13` |
| `MarketDataProviderPort` | Puerto outbound para una fuente externa | `domain/ports/market-data-provider.port.ts:28` |
| `MarketData` | Tipo de retorno del provider (`pairs[]` + 8 campos nullable) | `domain/ports/market-data-provider.port.ts:3-18` |
| `PROVIDERS` | Token `Symbol` para multi-binding en el módulo | `enrichment.tokens.ts:7` (separado del módulo para evitar import circular) |
| `primaryPair` | par con mayor `reserveUsd` | `domain/entities/token-snapshot.entity.ts:188-196` |
| `completenessScore` | ratio de campos no-null sobre **8** (price/liquidity/volume/MC/FDV/change/holders/top10) | `domain/entities/token-snapshot.entity.ts:140-153` |
| `hasMarketData` | true si `priceUsd`/`liquidityUsd`/`marketCapUsd` no-null o `pairs.length > 0` | `domain/entities/token-snapshot.entity.ts:131-138` |
| `MAX_CACHE_AGE_MS` | TTL del cache en memoria (5 min) | `enrich-token.use-case.ts:49` |
| `EnrichResult` | Tipo de retorno del use case (`{ snapshot, errors }`) | `enrich-token.use-case.ts:25-28` |
| `TokenEnrichedEvent` | Evento de dominio cuando hay datos | `domain/events/token-enriched.event.ts:13` |
| `EnrichmentFailedEvent` | Evento de dominio cuando TODOS los providers fallan o devuelven `null` | `domain/events/enrichment-failed.event.ts:7` |

---

## 5. API (HTTP — inbound)

Base path: `/ca/enrichment` (`api/http/enrichment.controller.ts:8`).

| Método | Ruta | Handler | Caso de uso |
|---|---|---|---|
| `POST` | `/ca/enrichment/enrich` | `EnrichmentController.run` (`:16-26`) | `EnrichTokenUseCase.execute` (`:65`) |
| `GET` | `/ca/enrichment/snapshots/recent?limit=N` | `EnrichmentController.recent` (`:28-34`) | `ListSnapshotsUseCase.execute` (`:13`) |
| `GET` | `/ca/enrichment/snapshots/:chain/:address` | `EnrichmentController.get` (`:36-42`) | `GetSnapshotUseCase.execute` (`:14`) |

`limit` por defecto `10`, máximo `500`. Validación: entero en `[1, 500]`, sino `DomainError(VALIDATION)` (`list-snapshots.use-case.ts:16-20`).

`POST /enrich` valida con `class-validator` (`api/input/enrich-token.input.ts:3-15`): `chain` y `address` requeridos; `force?: boolean` opcional (skip cache).

**Output** (`application/mappers/token-snapshot.mapper.ts:3-25`):

```ts
interface TokenSnapshotView {
  readonly id: string;                                  // `${chain}:${address}`
  readonly chain: string;
  readonly address: string;                             // lowercased
  readonly priceUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly primaryPair: { address; dexId; quoteToken; reserveUsd } | null;
  readonly pairCount: number;
  readonly sources: ReadonlyArray<string>;
  readonly completeness: number;                        // 0..1
  readonly enrichedAt: string;                          // ISO-8601
}

interface EnrichResult {
  readonly snapshot: TokenSnapshotView;
  readonly errors: ReadonlyArray<{ provider: string; message: string }>;
}
```

---

## 6. Objetos y modelado del dominio

### 6.1 Agregado `TokenSnapshot`

Archivo: `domain/entities/token-snapshot.entity.ts:48`.

```
TokenSnapshot {
  readonly id: string;                  // `${chain.value}:${address.toLowerCase()}` (entity.ts:60)
  chain: ChainId;
  address: string;                      // lowercased (entity.ts:65)
  pairs: ReadonlyArray<Pair>;
  primaryPair: Pair | null;              // max reserveUsd, null si pairs vacío
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  priceChange24h: number | null;
  holders: number | null;
  top10HolderPercent: number | null;
  sources: ReadonlyArray<string>;       // nombres de providers que aportaron data
  enrichedAt: Date;
}
```

Métodos relevantes:

- `static create(input)` (`:56-79`) — valida `address` no vacío (`:57-59`), normaliza lowercase (`:60, 65`), freezea `pairs` y `sources` (`:66, 76`), llama `pickPrimaryPair`.
- `pickPrimaryPair(pairs)` (`:188-196`) — max `reserveUsd`; null si vacío. Función top-level.
- `age` (`:123-125`) — `Date.now() - enrichedAt.getTime()`.
- `isFresh(maxAgeMs)` (`:127-129`) — `age <= maxAgeMs`.
- `hasMarketData()` (`:131-138`) — true si algún campo de mercado (`priceUsd`, `liquidityUsd`, `marketCapUsd`) es no-null o `pairs.length > 0`.
- `completenessScore()` (`:140-153`) — ratio de campos no-null sobre **8** (`priceUsd`/`liquidityUsd`/`volume24hUsd`/`marketCapUsd`/`fdvUsd`/`priceChange24h`/`holders`/`top10HolderPercent`). No incluye `primaryPair`.
- `emitEnriched()` (`:155-181`) — emite `TokenEnrichedEvent` con payload aplanado (incluye `primaryPair` como `{ address, dexId, quoteToken }` — sin `reserveUsd`, `:168-174`).
- `mutate(_event)` (`:183-185`) — **no-op**.

### 6.2 Value Objects

- `Pair` (`domain/value-objects/pair.vo.ts:20`)
  - `create({ address, dexId, quoteToken, reserveUsd })` (`:25-52`) — valida `address` no vacío (`:31-36`), `dexId` no vacío (`:37-39`) y `reserveUsd` finito `>= 0` (`:40-45`).
  - `key` (`:54-56`) — `${dexId}:${address}`. Usado para dedupe.
- `Price` (`domain/value-objects/price.vo.ts:14`)
  - `fromNumber(raw)` (`:19-26`) — `Number.isFinite && raw >= 0`.
  - `fromShorthand(raw)` (`:34-51`) — soporta `180K`, `1.2M`, `2.5B`. Devuelve `null` si no matchea regex `/^([\d.]+)([KkMmBb])?$/` (`:37`).
- `Liquidity` (`domain/value-objects/liquidity.vo.ts:13`)
  - `fromNumber(raw)` (`:18-25`) — mismas reglas que `Price.fromNumber`. Sin shorthand.

### 6.3 Eventos

- `TokenEnrichedEvent` (`domain/events/token-enriched.event.ts:13`)
  - `eventName = 'enrichment.token.enriched'` (`:49`).
  - `aggregateId = ${chain}:${address}` (`:49`).
  - Payload aplanado (`:14-30`): `chain`, `address`, `priceUsd`, `liquidityUsd`, `volume24hUsd`, `marketCapUsd`, `fdvUsd`, `priceChange24h`, `holders`, `top10HolderPercent`, `primaryPair` (`{ address, dexId, quoteToken } | null`, sin `reserveUsd`), `pairCount`, `sources`, `completeness`, `enrichedAt`.
  - Constructor freezea el payload completo y el array `sources` (`:50-53`).
  - `toPayload()` (`:56-62`) — `enrichedAt` a ISO; `sources` shallow-copy.
- `EnrichmentFailedEvent` (`domain/events/enrichment-failed.event.ts:7`)
  - `eventName = 'enrichment.token.failed'` (`:24`).
  - Payload (`:8-16`): `chain`, `address`, `errors: { provider, message }[]`, `failedAt`.
  - Constructor freezea payload + `errors` (`:25-28`).
  - `toPayload()` (`:31-38`) — `failedAt` a ISO; `errors` shallow-copy.

### 6.4 Puertos de dominio

- `MarketDataProviderPort` (`domain/ports/market-data-provider.port.ts:28`) — `name`, `supportedChains`, `fetch(chain, address): Promise<MarketData | null>`. `null` significa "no hay data" (404, no pairs), no es un error de transporte (`:24-26`).

---

## 7. Puertos de aplicación

| Puerto | Archivo | Métodos |
|---|---|---|
| `TokenSnapshotRepository` | `application/ports/token-snapshot.repository.ts:4` | `save`, `findByChainAndAddress`, `findRecent` |
| `EnrichmentEventPublisher` | `application/ports/enrichment-event.publisher.ts:3` | `publish`, `publishAll` |

Mappers:

- `TokenSnapshotMapper.toView` (`application/mappers/token-snapshot.mapper.ts:28-54`) — convierte a view con `primaryPair` aplanado (`:41-48`), `pairCount` desde `pairs.length` (`:49`), `completeness` calculado (`:51`), `enrichedAt.toISOString()` (`:52`).

---

## 8. Infraestructura

### 8.1 `DexScreenerAdapter`

Archivo: `infrastructure/providers/dexscreener.adapter.ts:37`.

- Free, sin API key. Endpoint: `GET https://api.dexscreener.com/latest/dex/tokens/{address}` (`:49-50, 59-60`).
- `supportedChains` (`:39-46`): todos los EVM (`ethereum`/`bsc`/`base`/`arbitrum`/`polygon`) + `solana`.
- `fetch` (`:52-69`): si la chain no está soportada → `null`. 404 → `null`. Otros errores → throw.
- `toMarketData` (`:71-95`):
  - Selecciona el "best pair" por `liquidity.usd` máximo (`:72-75`) — los demás campos se extraen del best.
  - Devuelve todos los pairs mapeados a `{ address, dexId, quoteToken, reserveUsd }`.
  - `holders` y `top10HolderPercent` siempre `null` (DexScreener no los provee).

### 8.2 `GeckoTerminalAdapter`

Archivo: `infrastructure/providers/geckoterminal.adapter.ts:53`.

- Free, sin API key. Endpoint: `GET https://api.geckoterminal.com/api/v2/networks/{slug}/tokens/{address}/info` (`:65, 74-77`).
- `supportedChains` (`:55-62`): ethereum/solana/bsc/base/arbitrum/polygon.
- Slug map `CHAIN_TO_GT_SLUG` (`:33-41`) — convierte `chain.value` → slug de GeckoTerminal (`eth`/`bsc`/`polygon_pos`/`base`/`arbitrum`/`solana`). `unknown` → `null` (`:40`).
- `fetch` (`:67-101`): si no hay slug → `null` (`:71-72`). 404 → `null`. Otros errores → throw.
- Devuelve: `priceUsd`, `volume24hUsd`, `marketCapUsd`, `fdvUsd`, `priceChange24h`, `holders` (de `a.holders.count`, `:89`), `top10HolderPercent` (de `a.top_10_percent_holders`, `:90-92`). **`liquidityUsd` siempre `null`** desde este adapter (`:82`). `pairs` siempre `[]`.

### 8.3 `BirdeyeAdapter`

Archivo: `infrastructure/providers/birdeye.adapter.ts:37`.

- Premium, requiere `BIRDEYE_API_KEY` (`cfg.birdeye.apiKey`, `:46-47`). Si falta, log warn y devuelve `null`.
- `supportedChains = [SOLANA]` (`:39`). `chain !== 'solana'` → `null` sin HTTP call (`:59`).
- Endpoint: `GET https://public-api.birdeye.so/defi/token_overview` con header `x-chain: solana` (`:62-72`).
- 404 → `null` (`:87`). Otros errores → throw.
- Devuelve: `priceUsd`, `liquidityUsd`, `volume24hUsd`, `marketCapUsd`, `priceChange24h`. `fdvUsd`/`holders`/`top10HolderPercent` siempre `null`. `pairs` siempre `[]`.
- Mejor accuracy de precio para SPL tokens de baja liquidez que DexScreener (JSDoc `:30-32`).

### 8.4 `InProcessEnrichmentEventPublisher`

Archivo: `infrastructure/messaging/in-process-enrichment-event.publisher.ts:7`. Wrapper sobre `EventEmitter2` de `@nestjs/event-emitter`. Log debug con `eventName` + `aggregateId` (`:15-17`).

### 8.5 `InMemoryTokenSnapshotRepository`

Archivo: `infrastructure/repositories/in-memory-token-snapshot.repository.ts:7`.

- `Map<string, TokenSnapshot>` con `MAX_ENTRIES = 500` (`:8`).
- `save` (`:11-21`) — LRU eviction: si el store supera `MAX_ENTRIES`, borra la entrada más antigua (primera key del Map, `:15-20`).
- `findByChainAndAddress` (`:23-29`) — clave `${chain.value}:${address.toLowerCase()}`.
- `findRecent` (`:31-38`) — sort por `enrichedAt` descendente, slice `limit`.

### 8.6 `CallNormalizedHandler`

Archivo: `infrastructure/event-bus/call-normalized.handler.ts:14`.

- `@OnEvent('normalization.call.normalized', { async: true })` (`:19`).
- Skip si `event.payload.chain !== 'evm' && chain !== 'solana'` — en v1 no hay providers para sui/aptos/etc. (`:21-23`).
- Try/catch que loggea errores sin propagar (`:24-39`).
- Log warn si hubo errores parciales de providers pero la operación retornó data (`:29-33`).

---

## 9. Casos de uso

| Use case | Archivo | Comportamiento |
|---|---|---|
| `EnrichTokenUseCase.execute` | `application/handlers/enrich-token.use-case.ts:65-150` | Construye `ChainId` (`:66`) + lowercase address (`:67`); cache check (skip si fresh y `!force`, `:69-78`); filtra providers por `chain` (`:80-85`); `Promise.allSettled` (`:87-89`); merge first-non-null + dedupe pairs + sources (`:95-117`); `TokenSnapshot.create` (`:119-132`); `save` (`:134`); emite `TokenEnrichedEvent` si `hasMarketData()` o `EnrichmentFailedEvent` si no (`:136-147`); devuelve `{ snapshot, errors }` (`:149`). |
| `GetSnapshotUseCase.execute` | `application/handlers/get-snapshot.use-case.ts:14-31` | Construye `ChainId.fromString(chain)` (`:18`); `findByChainAndAddress` con address lowercased (`:19-22`); lanza `DomainError(NOT_FOUND)` si null (`:23-29`). |
| `ListSnapshotsUseCase.execute` | `application/handlers/list-snapshots.use-case.ts:13-23` | Valida `limit` (entero en `[1, 500]`) con `DomainError(VALIDATION)` si fuera de rango (`:16-20`); `findRecent` → mapea a view. |

---

## 10. Flujo (happy path)

```
normalization.call.normalized  (chain ∈ {evm, solana})
        |
        v
CallNormalizedHandler (event-bus)
        |
        v
EnrichTokenUseCase.execute
        |  [cache hit & !force? → return cached view + empty errors]
        |
        +--> filter providers por chain
        |
        +--> Promise.allSettled([
        |       DexScreenerAdapter.fetch
        |       GeckoTerminalAdapter.fetch
        |       BirdeyeAdapter.fetch  (si chain=solana)
        |     ])
        |
        +--> mergeMarketData  (first-non-null por campo)
        +--> dedupePairs        (max reserveUsd por key)
        +--> pickPrimaryPair    (max reserveUsd)
        |
        +--> TokenSnapshot.create
        |
        +--> TokenSnapshotRepository.save  (LRU evict si >500)
        |
        +--> si hasMarketData: TokenSnapshot.emitEnriched → publishAll
        |   si no: EnrichmentFailedEvent → publish
        |
        v
enrichment.token.enriched  -->  Classification (siguiente)
enrichment.token.failed    -->  Classification (también, vía handler)
```

---

## 11. Wiring (NestJS DI)

Archivo: `enrichment.module.ts:30-59`.

| Token | Implementación |
|---|---|
| `EnrichmentController` | controller (`:31`) |
| `EnrichTokenUseCase` | self-provide, `@Inject(PROVIDERS)` (`:33`) |
| `GetSnapshotUseCase` | self-provide (`:34`) |
| `ListSnapshotsUseCase` | self-provide (`:35`) |
| `DexScreenerAdapter` | self-provide (`:36`) |
| `GeckoTerminalAdapter` | self-provide (`:37`) |
| `BirdeyeAdapter` | self-provide (`:38`) |
| `CallNormalizedHandler` | self-provide (`:39`) |
| `TokenSnapshotRepository` | `InMemoryTokenSnapshotRepository` (`:40-43`) |
| `EnrichmentEventPublisher` | `InProcessEnrichmentEventPublisher` (`:44-47`) |
| `PROVIDERS` (Symbol) | `useFactory` que combina `[DexScreener, GeckoTerminal, Birdeye]` (`:48-56`) |

**Exports** (`:58`): `TokenSnapshotRepository`, `EnrichmentEventPublisher`. Los providers NO se exportan (encapsulación del multi-binding).

> **Token `PROVIDERS`:** vive en `enrichment.tokens.ts:7` (separado del módulo para evitar import circular entre `enrichment.module.ts` y `enrich-token.use-case.ts`).

> **Fail-fast en boot:** `EnrichTokenUseCase` lanza `Error` si `providers` está vacío (`enrich-token.use-case.ts:58-62`).

---

## 12. Errores de dominio

| `ErrorCode` | Dónde se lanza | Referencia |
|---|---|---|
| `VALIDATION` | `TokenSnapshot.create` — `address` vacío | `domain/entities/token-snapshot.entity.ts:57-59` |
| `VALIDATION` | `Price.fromNumber` — no finito o negativo | `domain/value-objects/price.vo.ts:20-24` |
| `VALIDATION` | `Liquidity.fromNumber` — no finito o negativo | `domain/value-objects/liquidity.vo.ts:19-23` |
| `VALIDATION` | `Pair.create` — `address` vacío | `domain/value-objects/pair.vo.ts:31-36` |
| `VALIDATION` | `Pair.create` — `dexId` vacío | `domain/value-objects/pair.vo.ts:37-39` |
| `VALIDATION` | `Pair.create` — `reserveUsd` inválido | `domain/value-objects/pair.vo.ts:40-45` |
| `UNSUPPORTED_CHAIN` | `ChainId.fromString` (vía dependency) — usado en `EnrichTokenUseCase.execute:66` y `GetSnapshotUseCase.execute:18` | `ca/chain-detection/domain/value-objects/chain-id.vo.ts:51-57` |
| `NOT_FOUND` | `GetSnapshotUseCase.execute` | `application/handlers/get-snapshot.use-case.ts:23-29` |
| `VALIDATION` | `ListSnapshotsUseCase.execute` — `limit` fuera de [1, 500] | `application/handlers/list-snapshots.use-case.ts:16-20` |

> `Price.fromShorthand` y la deserialización de números desde providers NO lanza — devuelve `null` si el formato no matchea. La inferencia de tipos en `GeckoTerminalAdapter.fetch` (`parseFloat`) puede producir `NaN` si el upstream es corrupto; el merge lo trata como "no data".

---

## 13. Pruebas

Existentes (todas pasan con Jest):

- `application/handlers/enrich-token.use-case.spec.ts` — 7 tests con `FakeProvider`: merge first-non-null entre dos providers, `EnrichmentFailedEvent` cuando todos devuelven `null`, absorción de `Promise.allSettled` con un provider rejected, skip de providers que no soportan la chain, cache hit dentro de `MAX_CACHE_AGE_MS`, `force=true` bypass, dedupe de pairs por `Pair.key` (max `reserveUsd`), fail-fast si no hay providers.
- `domain/entities/token-snapshot.entity.spec.ts` — invariantes: id compuesto lowercased, `enrichedAt` actual, `pickPrimaryPair` (null si vacío, max reserveUsd), `completenessScore` (0, 1, proporcional — ej. 2 de 8 = 0.25), `hasMarketData` (false vacío, true con price/pairs), `isFresh` (true/false según `maxAgeMs`), `emitEnriched` + `commit`.
- `infrastructure/providers/birdeye.adapter.spec.ts` — 3 tests sin mock de axios: non-solana → `null` sin HTTP call, no-api-key → `null`, expone `name` + `supportedChains`. **No cubre** el path de HTTP success ni el parseo de respuesta.
- `infrastructure/event-bus/call-normalized.handler.spec.ts` — 4 tests: enrich para evm, enrich para solana, skip para sui, absorción de errores.

**Gaps conocidos:**

- No hay spec para `GeckoTerminalAdapter` ni `DexScreenerAdapter` (cubierto por transitividad vía `birdeye.adapter.spec.ts` y el use case spec).
- No hay spec de `InMemoryTokenSnapshotRepository` ni `InProcessEnrichmentEventPublisher`.
- No hay spec de `GetSnapshotUseCase` ni `ListSnapshotsUseCase`.

---

## 14. Extensiones sugeridas

1. **Más providers** — Mobula, Moralis, CoinGecko (ver `AppConfig.mobula`/`moralis` ya preparados en `src/shared/config/app.config.ts`). El multi-binding ya soporta N providers.
2. **Cache distribuido** — Redis para compartir cache entre instancias. Cambiar el `findByChainAndAddress` en repositorio.
3. **Persistencia real** — TypeORM/Prisma con índice único `(chain, address)`.
4. **Outbox pattern** — atomicidad save+publish.
5. **Probabilistic freshness** — actualmente el cache es TTL fijo. Tokens muy activos podrían tener TTL menor.
6. **Métricas** — añadir `OnEvent('enrichment.token.enriched')` listener interno que emita métricas a un BC de analytics (latencia, hit rate de cache, error rate por provider).
7. **Reintentos por provider** — hoy un 5xx del provider se cuenta como error y se traga. Añadir retry con backoff exponencial.
8. **Mockear axios en specs de providers** — los tests de Birdeye/GeckoTerminal/DexScreener no ejercitan los caminos HTTP reales; añadir `jest.mock('axios')` con respuestas controladas.

---

## 15. Mapa rápido de archivos

```
src/ca/enrichment/
├── api/
│   ├── http/enrichment.controller.ts
│   └── input/enrich-token.input.ts
├── application/
│   ├── handlers/
│   │   ├── enrich-token.use-case.ts
│   │   ├── enrich-token.use-case.spec.ts
│   │   ├── get-snapshot.use-case.ts
│   │   └── list-snapshots.use-case.ts
│   ├── mappers/token-snapshot.mapper.ts
│   └── ports/
│       ├── enrichment-event.publisher.ts
│       └── token-snapshot.repository.ts
├── domain/
│   ├── entities/
│   │   ├── token-snapshot.entity.ts
│   │   └── token-snapshot.entity.spec.ts
│   ├── events/
│   │   ├── enrichment-failed.event.ts
│   │   └── token-enriched.event.ts
│   ├── ports/market-data-provider.port.ts
│   └── value-objects/
│       ├── liquidity.vo.ts
│       ├── pair.vo.ts
│       └── price.vo.ts
├── enrichment.module.ts
├── enrichment.tokens.ts                  ← Symbol PROVIDERS (evita import circular)
├── infrastructure/
│   ├── event-bus/
│   │   ├── call-normalized.handler.ts
│   │   └── call-normalized.handler.spec.ts
│   ├── messaging/in-process-enrichment-event.publisher.ts
│   ├── providers/
│   │   ├── birdeye.adapter.ts
│   │   ├── birdeye.adapter.spec.ts
│   │   ├── dexscreener.adapter.ts
│   │   └── geckoterminal.adapter.ts
│   └── repositories/in-memory-token-snapshot.repository.ts
└── README.md
```