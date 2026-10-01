# Naming & Hexagonal Architecture — Data BC

**Created:** 2026-09-24  
**Context:** Propuestas de nombres + estructuras hexagonales para el nuevo BC de datos onchain/off-chain

---

## 10 PROPUESTAS DE NOMBRE

### 1. **market-data** ✅ RECOMENDADO

**Razón:** Enfoque en datos de mercado (precio, liquidez, volumen, holders). Es el núcleo del dominio.

**Pros:**

- Claro y conciso
- Alineado con uso principal (enrichment de tokens)
- Familiar para desarrolladores crypto

**Contras:**

- No cubre RPC/blockchain data explícitamente
- Podría confundirse con solo precios

**Ejemplo de uso:**

```typescript
import { MarketDataService } from '@market-data/application';
```

---

### 2. **onchain-data** ⭐ RECOMENDADO

**Razón:** Genérico pero preciso. Cubre todos los datos onchain (market + RPC + security).

**Pros:**

- Scope amplio (market data + RPC + security)
- Explícito sobre origen de datos (blockchain)
- Nombre técnico pero accesible

**Contras:**

- Excluye conceptualmente datos off-chain (CoinMarketCap, CoinGecko)
- Podría ser demasiado genérico

**Ejemplo de uso:**

```typescript
import { OnchainDataService } from '@onchain-data/application';
```

---

### 3. **token-intelligence**

**Razón:** Enfoque en "inteligencia" agregada sobre tokens (multi-source fusion).

**Pros:**

- Suena premium/empresarial
- Implica valor agregado (no solo datos crudos)
- Diferenciación clara vs data providers

**Contras:**

- Puede sonar pretencioso
- "Intelligence" es ambiguo (¿análisis? ¿ML?)

**Ejemplo de uso:**

```typescript
import { TokenIntelligenceService } from '@token-intelligence/application';
```

---

### 4. **chain-explorer**

**Razón:** Enfoque en "explorar" datos blockchain (multi-chain).

**Pros:**

- Evoca block explorers (familiar)
- Implica multi-chain
- Suena accesible

**Contras:**

- Confusión con Etherscan/Solscan
- No cubre off-chain data

**Ejemplo de uso:**

```typescript
import { ChainExplorerService } from '@chain-explorer/application';
```

---

### 5. **asset-registry**

**Razón:** Enfoque en "registro" de assets (tokens) con metadata completa.

**Pros:**

- Implica fuente de verdad (registry)
- Término técnico preciso
- Cubre metadata + market data

**Contras:**

- Suena estático (registry = read-only?)
- No evoca datos en tiempo real

**Ejemplo de uso:**

```typescript
import { AssetRegistryService } from '@asset-registry/application';
```

---

### 6. **blockchain-insights**

**Razón:** Enfoque en "insights" derivados de datos blockchain.

**Pros:**

- Implica análisis + agregación
- Suena premium
- Diferenciación vs raw data

**Contras:**

- "Insights" es ambiguo
- Overlap con analytics/BI tools

**Ejemplo de uso:**

```typescript
import { BlockchainInsightsService } from '@blockchain-insights/application';
```

---

### 7. **token-oracle** ⭐ RECOMENDADO

**Razón:** "Oracle" en sentido técnico (fuente de verdad off-chain para smart contracts).

**Pros:**

- Término preciso en crypto (Chainlink oracles)
- Implica agregación multi-source
- Suena técnico y confiable

**Contras:**

- Confusión con Chainlink/Band Protocol
- "Oracle" tiene significado específico en Web3

**Ejemplo de uso:**

```typescript
import { TokenOracleService } from '@token-oracle/application';
```

---

### 8. **data-mesh**

**Razón:** Arquitectura "data mesh" (datos distribuidos, domain-driven).

**Pros:**

- Término moderno (data mesh = anti-data-lake)
- Implica dominio descentralizado
- Suena técnico/avanzado

**Contras:**

- Data mesh es una arquitectura, no un dominio
- Puede ser confuso para no-expertos

**Ejemplo de uso:**

```typescript
import { DataMeshService } from '@data-mesh/application';
```

---

### 9. **market-aggregator**

**Razón:** Enfoque en "agregación" de datos de mercado (multi-source).

**Pros:**

- Explícito sobre responsabilidad (agregación)
- "Aggregator" es término familiar (Uniswap aggregator)
- Claro que NO es fuente primaria

**Contras:**

- Excluye RPC/security data
- Suena más técnico que de negocio

**Ejemplo de uso:**

```typescript
import { MarketAggregatorService } from '@market-aggregator/application';
```

---

### 10. **crypto-index** ✅ RECOMENDADO

**Razón:** "Index" como en índice/catálogo de crypto assets con datos completos.

**Pros:**

- Evoca database index (optimizado)
- Suena profesional
- Amplio scope (market + metadata + security)

**Contras:**

- Confusión con index funds (DeFi Pulse Index)
- "Crypto" es más genérico que "token"

**Ejemplo de uso:**

```typescript
import { CryptoIndexService } from '@crypto-index/application';
```

---

## COMPARACIÓN FINAL

| Nombre                  |  Claridad  |   Scope    |  Técnico   | Empresarial | Recomendación |
| ----------------------- | :--------: | :--------: | :--------: | :---------: | :-----------: |
| **market-data**         | ⭐⭐⭐⭐⭐ |   ⭐⭐⭐   |  ⭐⭐⭐⭐  |  ⭐⭐⭐⭐   |   ✅ TOP 3    |
| **onchain-data**        | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |  ⭐⭐⭐⭐  |   ⭐⭐⭐    |   ⭐ TOP 1    |
| **token-intelligence**  |   ⭐⭐⭐   |  ⭐⭐⭐⭐  |    ⭐⭐    | ⭐⭐⭐⭐⭐  |       —       |
| **chain-explorer**      |  ⭐⭐⭐⭐  |   ⭐⭐⭐   |   ⭐⭐⭐   |   ⭐⭐⭐    |       —       |
| **asset-registry**      |  ⭐⭐⭐⭐  |  ⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐ |   ⭐⭐⭐    |       —       |
| **blockchain-insights** |   ⭐⭐⭐   |  ⭐⭐⭐⭐  |    ⭐⭐    | ⭐⭐⭐⭐⭐  |       —       |
| **token-oracle**        |  ⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |  ⭐⭐⭐⭐   |   ⭐ TOP 2    |
| **data-mesh**           |    ⭐⭐    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |    ⭐⭐     |       —       |
| **market-aggregator**   | ⭐⭐⭐⭐⭐ |   ⭐⭐⭐   | ⭐⭐⭐⭐⭐ |   ⭐⭐⭐    |       —       |
| **crypto-index**        |  ⭐⭐⭐⭐  | ⭐⭐⭐⭐⭐ |  ⭐⭐⭐⭐  |  ⭐⭐⭐⭐   |   ✅ TOP 3    |

**Recomendación final:**

1. **`onchain-data`** — Más versátil, cubre todo el scope (market + RPC + security)
2. **`token-oracle`** — Más técnico, posicionamiento como "fuente de verdad"
3. **`market-data`** — Más simple, enfoque en uso principal (enrichment)

---

## ARQUITECTURA HEXAGONAL

Siguiendo el patrón del proyecto (`apps/backend/docs/spydefi/arch/`), propongo **2 variantes** de estructura hexagonal.

---

## VARIANTE A: BC Único (Monolito Modular)

**Contexto:** Un solo BC `onchain-data/` con múltiples agregados + puertos/adapters.

```
apps/onchain-data/
├── src/
│   ├── main.ts                                    # Bootstrap NestJS
│   ├── app.module.ts                              # Imports 6 módulos de dominio
│   │
│   ├── token/                                     # AGGREGATE: Token data
│   │   ├── domain/
│   │   │   ├── aggregates/
│   │   │   │   └── token-snapshot.aggregate.ts   # Snapshot de token (precio, MC, holders)
│   │   │   ├── value-objects/
│   │   │   │   ├── token-id.vo.ts                # {chain, address}
│   │   │   │   ├── price-data.vo.ts              # {usd, change24h, source}
│   │   │   │   ├── liquidity-data.vo.ts          # {totalUsd, pools[]}
│   │   │   │   └── holders-data.vo.ts            # {total, top10%, concentration}
│   │   │   ├── events/
│   │   │   │   ├── token-snapshot-created.event.ts
│   │   │   │   └── token-data-updated.event.ts
│   │   │   └── ports/
│   │   │       ├── token-repository.port.ts      # OUT: Persistence
│   │   │       ├── price-provider.port.ts        # OUT: Price data source
│   │   │       ├── holders-provider.port.ts      # OUT: Holders data source
│   │   │       └── security-provider.port.ts     # OUT: Security data source
│   │   │
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   │   ├── get-token-snapshot.use-case.ts        # Query
│   │   │   │   ├── aggregate-token-data.use-case.ts      # Command (multi-source)
│   │   │   │   └── batch-aggregate-tokens.use-case.ts    # Command (batch)
│   │   │   └── services/
│   │   │       ├── token-aggregator.service.ts           # Orchestrator (price + holders + security)
│   │   │       ├── price-aggregator.service.ts           # Cascada de providers
│   │   │       ├── holders-aggregator.service.ts         # Chain-specific logic
│   │   │       └── security-aggregator.service.ts        # Heuristics + providers
│   │   │
│   │   └── infrastructure/
│   │       ├── persistence/
│   │       │   ├── typeorm/
│   │       │   │   ├── entities/
│   │       │   │   │   └── token-snapshot.entity.ts
│   │       │   │   └── repositories/
│   │       │   │       └── typeorm-token.repository.ts   # Implements TokenRepositoryPort
│   │       │   └── in-memory/
│   │       │       └── in-memory-token.repository.ts
│   │       │
│   │       ├── providers/                                # Adapters OUT
│   │       │   ├── price/
│   │       │   │   ├── dexscreener-price.adapter.ts      # Implements PriceProviderPort
│   │       │   │   ├── geckoterminal-price.adapter.ts
│   │       │   │   └── coingecko-price.adapter.ts
│   │       │   ├── holders/
│   │       │   │   ├── geckoterminal-holders.adapter.ts  # Implements HoldersProviderPort
│   │       │   │   ├── helius-holders.adapter.ts
│   │       │   │   └── moralis-holders.adapter.ts
│   │       │   └── security/
│   │       │       ├── rugcheck-security.adapter.ts      # Implements SecurityProviderPort
│   │       │       └── birdeye-security.adapter.ts
│   │       │
│   │       └── http/                                     # Adapters IN (REST + GraphQL)
│   │           ├── rest/
│   │           │   ├── token.controller.ts               # GET /api/v1/tokens/:chain/:address
│   │           │   └── batch.controller.ts               # POST /api/v1/tokens/batch
│   │           └── graphql/
│   │               ├── token.resolver.ts                 # Query.token, Query.tokens
│   │               └── token.types.ts                    # GraphQL types
│   │
│   ├── chain/                                     # AGGREGATE: Chain metadata
│   │   ├── domain/
│   │   │   ├── aggregates/
│   │   │   │   └── chain.aggregate.ts                    # Chain info (id, name, family, RPC URLs)
│   │   │   ├── value-objects/
│   │   │   │   ├── chain-id.vo.ts                        # Shared kernel VO
│   │   │   │   └── chain-capability.vo.ts                # ['market_data', 'rpc', 'holders']
│   │   │   └── ports/
│   │   │       ├── chain-repository.port.ts              # OUT: Persistence (static catalog)
│   │   │       └── chain-detector.port.ts                # OUT: Detect chain from address
│   │   │
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   │   ├── detect-chain.use-case.ts              # Command (probe RPC)
│   │   │   │   ├── get-chain.use-case.ts                 # Query
│   │   │   │   └── list-chains.use-case.ts               # Query
│   │   │   └── services/
│   │   │       └── chain-detector.service.ts             # Orchestrator (multi-prober)
│   │   │
│   │   └── infrastructure/
│   │       ├── persistence/
│   │       │   └── static-chain.repository.ts            # Static catalog (no DB)
│   │       ├── probers/                                  # Adapters OUT
│   │       │   ├── evm-chain-prober.adapter.ts           # Alchemy eth_getCode
│   │       │   └── solana-chain-prober.adapter.ts        # Helius getAccountInfo
│   │       └── http/
│   │           └── chain.controller.ts                   # GET /api/v1/chains
│   │
│   ├── provider/                                  # AGGREGATE: Provider metadata
│   │   ├── domain/
│   │   │   ├── aggregates/
│   │   │   │   └── provider-status.aggregate.ts          # Health, latency, rate limit
│   │   │   ├── value-objects/
│   │   │   │   ├── provider-name.vo.ts
│   │   │   │   └── rate-limit-info.vo.ts
│   │   │   └── ports/
│   │   │       └── provider-health-checker.port.ts       # OUT: Health check
│   │   │
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   │   ├── check-provider-health.use-case.ts
│   │   │   │   └── get-provider-status.use-case.ts
│   │   │   └── services/
│   │   │       └── health-checker.service.ts
│   │   │
│   │   └── infrastructure/
│   │       ├── health-checkers/                          # Adapters OUT
│   │       │   ├── dexscreener-health.adapter.ts
│   │       │   └── helius-health.adapter.ts
│   │       └── http/
│   │           └── provider.controller.ts                # GET /api/v1/providers
│   │
│   ├── cache/                                     # INFRAESTRUCTURA: Caché transversal
│   │   ├── domain/
│   │   │   └── ports/
│   │   │       └── cache.port.ts                         # OUT: Cache storage
│   │   ├── application/
│   │   │   └── services/
│   │   │       └── cache.service.ts                      # TTL strategies
│   │   └── infrastructure/
│   │       ├── adapters/
│   │       │   ├── redis-cache.adapter.ts                # Redis implementation
│   │       │   └── memory-cache.adapter.ts               # In-memory fallback
│   │       └── interceptors/
│   │           └── cache.interceptor.ts                  # NestJS HTTP interceptor
│   │
│   ├── rate-limiter/                              # INFRAESTRUCTURA: Rate limiting
│   │   ├── domain/
│   │   │   ├── value-objects/
│   │   │   │   └── rate-limit-config.vo.ts
│   │   │   └── ports/
│   │   │       └── rate-limiter.port.ts                  # OUT: Rate limit storage
│   │   ├── application/
│   │   │   └── services/
│   │   │       ├── rate-limiter.service.ts               # Sliding window
│   │   │       └── circuit-breaker.service.ts            # Circuit breaker
│   │   └── infrastructure/
│   │       └── adapters/
│   │           └── redis-rate-limiter.adapter.ts         # Redis-based limiter
│   │
│   └── shared/                                    # SHARED KERNEL
│       ├── kernel/
│       │   ├── aggregate-root.ts
│       │   ├── entity.ts
│       │   ├── value-object.ts
│       │   └── domain-event.ts
│       ├── value-objects/                                # Shared VOs
│       │   ├── chain-id.vo.ts                            # Usado por token/ + chain/
│       │   └── token-id.vo.ts                            # {chain, address}
│       └── guards/
│           └── api-key.guard.ts                          # Autenticación HTTP
```

**Características:**

- **6 módulos de dominio**: `token/`, `chain/`, `provider/`, `cache/`, `rate-limiter/`, `shared/`
- **Puertos claramente separados**: `domain/ports/` para interfaces, `infrastructure/adapters/` para implementaciones
- **Agregados por responsabilidad**: `TokenSnapshot`, `Chain`, `ProviderStatus`
- **Shared kernel**: `ChainId` VO compartido entre `token/` y `chain/`
- **Infraestructura transversal**: `cache/` y `rate-limiter/` son módulos de infraestructura reutilizables

**Ventajas:**

- ✅ Un solo servicio deployable (simplicidad operativa)
- ✅ Shared kernel claro entre agregados
- ✅ Puertos/adapters bien definidos por agregado

**Desventajas:**

- ❌ Monolito (no escala independientemente por agregado)
- ❌ Acoplamiento entre módulos (cache/rate-limiter son transversales)

---

## VARIANTE B: BC Multi-App (Microservicios)

**Contexto:** Repo `onchain-data/` con múltiples apps (API + Bot + Worker) + libs compartidas.

```
onchain-data/
├── apps/
│   ├── api/                                       # API REST + GraphQL
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts                     # Imports token, chain, provider modules
│   │   │   ├── token/
│   │   │   │   └── infrastructure/
│   │   │   │       └── http/
│   │   │   │           ├── token.controller.ts   # REST endpoints
│   │   │   │           └── token.resolver.ts     # GraphQL resolver
│   │   │   ├── chain/
│   │   │   │   └── infrastructure/
│   │   │   │       └── http/
│   │   │   │           └── chain.controller.ts
│   │   │   └── provider/
│   │   │       └── infrastructure/
│   │   │           └── http/
│   │   │               └── provider.controller.ts
│   │   └── Dockerfile
│   │
│   ├── bot/                                       # Dexter bot standalone
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── commands/
│   │   │   │   ├── scan.handler.ts               # /x command
│   │   │   │   └── chart.handler.ts              # /c command
│   │   │   ├── token-scan/
│   │   │   │   └── token-scan.service.ts         # Consume libs/token/application
│   │   │   └── telegram/
│   │   │       ├── bot.adapter.ts                # Bot API client
│   │   │       └── webhook.controller.ts
│   │   └── Dockerfile
│   │
│   └── worker/                                    # Background jobs
│       ├── src/
│       │   ├── main.ts
│       │   ├── cache-warmer/
│       │   │   └── cache-warmer.service.ts       # Consume libs/cache
│       │   └── health-checker/
│       │       └── health-checker.service.ts     # Consume libs/provider
│       └── Dockerfile
│
├── libs/
│   ├── token/                                     # Lib: Token BC (domain + application)
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── aggregates/
│   │   │   │   │   └── token-snapshot.aggregate.ts
│   │   │   │   ├── value-objects/
│   │   │   │   │   ├── token-id.vo.ts
│   │   │   │   │   ├── price-data.vo.ts
│   │   │   │   │   └── holders-data.vo.ts
│   │   │   │   ├── events/
│   │   │   │   │   └── token-snapshot-created.event.ts
│   │   │   │   └── ports/
│   │   │   │       ├── token-repository.port.ts
│   │   │   │       ├── price-provider.port.ts
│   │   │   │       └── holders-provider.port.ts
│   │   │   ├── application/
│   │   │   │   ├── use-cases/
│   │   │   │   │   ├── get-token-snapshot.use-case.ts
│   │   │   │   │   └── aggregate-token-data.use-case.ts
│   │   │   │   └── services/
│   │   │   │       ├── token-aggregator.service.ts
│   │   │   │       ├── price-aggregator.service.ts
│   │   │   │       └── holders-aggregator.service.ts
│   │   │   └── infrastructure/
│   │   │       ├── persistence/
│   │   │       │   └── typeorm-token.repository.ts
│   │   │       └── providers/
│   │   │           ├── dexscreener-price.adapter.ts
│   │   │           └── geckoterminal-holders.adapter.ts
│   │   └── index.ts                              # Barrel exports
│   │
│   ├── chain/                                     # Lib: Chain BC
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── aggregates/
│   │   │   │   │   └── chain.aggregate.ts
│   │   │   │   └── ports/
│   │   │   │       └── chain-detector.port.ts
│   │   │   ├── application/
│   │   │   │   └── use-cases/
│   │   │   │       └── detect-chain.use-case.ts
│   │   │   └── infrastructure/
│   │   │       └── probers/
│   │   │           ├── evm-chain-prober.adapter.ts
│   │   │           └── solana-chain-prober.adapter.ts
│   │   └── index.ts
│   │
│   ├── provider/                                  # Lib: Provider metadata BC
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   └── aggregates/
│   │   │   │       └── provider-status.aggregate.ts
│   │   │   ├── application/
│   │   │   │   └── use-cases/
│   │   │   │       └── check-provider-health.use-case.ts
│   │   │   └── infrastructure/
│   │   │       └── health-checkers/
│   │   │           └── dexscreener-health.adapter.ts
│   │   └── index.ts
│   │
│   ├── cache/                                     # Lib: Caché (infraestructura compartida)
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   └── ports/
│   │   │   │       └── cache.port.ts
│   │   │   ├── application/
│   │   │   │   └── services/
│   │   │   │       └── cache.service.ts
│   │   │   └── infrastructure/
│   │   │       └── adapters/
│   │   │           ├── redis-cache.adapter.ts
│   │   │           └── memory-cache.adapter.ts
│   │   └── index.ts
│   │
│   ├── rate-limiter/                              # Lib: Rate limiting (infraestructura compartida)
│   │   ├── src/
│   │   │   ├── application/
│   │   │   │   └── services/
│   │   │   │       ├── rate-limiter.service.ts
│   │   │   │       └── circuit-breaker.service.ts
│   │   │   └── infrastructure/
│   │   │       └── adapters/
│   │   │           └── redis-rate-limiter.adapter.ts
│   │   └── index.ts
│   │
│   ├── shared-kernel/                             # Lib: Shared kernel (VOs compartidos)
│   │   ├── src/
│   │   │   ├── kernel/
│   │   │   │   ├── aggregate-root.ts
│   │   │   │   ├── entity.ts
│   │   │   │   ├── value-object.ts
│   │   │   │   └── domain-event.ts
│   │   │   └── value-objects/
│   │   │       ├── chain-id.vo.ts                # Shared entre token + chain
│   │   │       └── token-id.vo.ts
│   │   └── index.ts
│   │
│   └── data-providers/                            # Lib: 13 data providers (raw HTTP clients)
│       ├── src/
│       │   ├── core/
│       │   │   └── data-provider.port.ts
│       │   ├── dexscreener/
│       │   │   ├── dexscreener.service.ts
│       │   │   └── dexscreener.types.ts
│       │   ├── geckoterminal/
│       │   ├── helius/
│       │   └── ... (11 más)
│       └── index.ts
│
├── nx.json
├── package.json
└── tsconfig.base.json
```

**Características:**

- **3 apps deployables**: `api/` (REST+GraphQL), `bot/` (Telegram), `worker/` (background jobs)
- **6 libs de dominio/infra**: `token/`, `chain/`, `provider/`, `cache/`, `rate-limiter/`, `shared-kernel/`
- **1 lib técnica**: `data-providers/` (13 providers HTTP)
- **Apps consumen libs**: `apps/api/` importa `libs/token/application`, `apps/bot/` importa `libs/token/application`
- **HTTP controllers viven en apps**: `apps/api/src/token/infrastructure/http/token.controller.ts`

**Ventajas:**

- ✅ Escalabilidad independiente (api, bot, worker por separado)
- ✅ Libs reutilizables (bot + worker consumen misma lógica de dominio)
- ✅ Deploy granular (actualizar bot sin tocar API)

**Desventajas:**

- ❌ Complejidad operativa (3 deployments en lugar de 1)
- ❌ Overhead de comunicación (si apps se comunican entre sí)

---

## DETALLE: PUERTOS & ADAPTERS (Hexagonal Pattern)

### Ejemplo Completo: `token/` BC

```
token/
├── domain/                                # CAPA INTERNA (sin dependencias externas)
│   ├── aggregates/
│   │   └── token-snapshot.aggregate.ts   # Raíz del agregado
│   ├── value-objects/
│   │   ├── token-id.vo.ts                # {chain: string, address: string}
│   │   ├── price-data.vo.ts              # {usd: number, change24h, source}
│   │   ├── liquidity-data.vo.ts          # {totalUsd, pools[]}
│   │   └── holders-data.vo.ts            # {total, top10%, concentration}
│   ├── events/
│   │   ├── token-snapshot-created.event.ts
│   │   └── token-data-updated.event.ts
│   └── ports/                            # INTERFACES (contratos)
│       ├── OUT/                          # Puertos de salida (dependencias)
│       │   ├── token-repository.port.ts      # Persistencia
│       │   ├── price-provider.port.ts        # Price data source
│       │   ├── holders-provider.port.ts      # Holders data source
│       │   ├── security-provider.port.ts     # Security data source
│       │   └── cache.port.ts                 # Caché (opcional)
│       └── IN/                           # Puertos de entrada (use cases)
│           └── (use cases live here conceptually)
│
├── application/                          # CAPA DE APLICACIÓN (orquestación)
│   ├── use-cases/                        # Puertos IN (entradas al dominio)
│   │   ├── get-token-snapshot.use-case.ts        # Query (read)
│   │   ├── aggregate-token-data.use-case.ts      # Command (write)
│   │   └── batch-aggregate-tokens.use-case.ts    # Command (batch)
│   └── services/                         # Application services (coordinadores)
│       ├── token-aggregator.service.ts           # Orchestrates price + holders + security
│       ├── price-aggregator.service.ts           # Cascada: DexScreener → Gecko → CoinGecko
│       ├── holders-aggregator.service.ts         # Chain-specific: Solana vs EVM
│       └── security-aggregator.service.ts        # Rugcheck + Birdeye + heuristics
│
└── infrastructure/                       # CAPA EXTERNA (adaptadores)
    ├── persistence/                      # Adapters OUT (implementan TokenRepositoryPort)
    │   ├── typeorm/
    │   │   ├── entities/
    │   │   │   └── token-snapshot.entity.ts      # ORM entity (NO es el agregado)
    │   │   └── repositories/
    │   │       └── typeorm-token.repository.ts   # implements TokenRepositoryPort
    │   └── in-memory/
    │       └── in-memory-token.repository.ts     # implements TokenRepositoryPort
    │
    ├── providers/                        # Adapters OUT (implementan *ProviderPort)
    │   ├── price/
    │   │   ├── dexscreener-price.adapter.ts      # implements PriceProviderPort
    │   │   ├── geckoterminal-price.adapter.ts    # implements PriceProviderPort
    │   │   └── coingecko-price.adapter.ts        # implements PriceProviderPort
    │   ├── holders/
    │   │   ├── geckoterminal-holders.adapter.ts  # implements HoldersProviderPort
    │   │   ├── helius-holders.adapter.ts         # implements HoldersProviderPort (Solana)
    │   │   └── moralis-holders.adapter.ts        # implements HoldersProviderPort (EVM)
    │   └── security/
    │       ├── rugcheck-security.adapter.ts      # implements SecurityProviderPort
    │       └── birdeye-security.adapter.ts       # implements SecurityProviderPort
    │
    └── http/                             # Adapters IN (invocan use cases)
        ├── rest/
        │   ├── token.controller.ts               # GET /api/v1/tokens/:chain/:address
        │   ├── batch.controller.ts               # POST /api/v1/tokens/batch
        │   └── dtos/
        │       ├── get-token.dto.ts              # Input validation
        │       └── token-response.dto.ts         # Output serialization
        └── graphql/
            ├── token.resolver.ts                 # Query.token, Query.tokens
            └── token.types.ts                    # GraphQL schema types
```

### Flujo de Datos (Hexagonal)

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE (HTTP)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              ADAPTER IN (HTTP Controller)                        │
│  token.controller.ts                                             │
│  - Valida input (DTO)                                            │
│  - Invoca use case                                               │
│  - Serializa response (DTO)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              APPLICATION LAYER (Use Case)                        │
│  aggregate-token-data.use-case.ts                                │
│  - Valida reglas de negocio                                      │
│  - Coordina servicios de aplicación                              │
│  - Emite eventos de dominio                                      │
└────────┬────────────────────────────┬───────────────────────────┘
         │                            │
         ▼                            ▼
┌──────────────────────┐    ┌──────────────────────────────────┐
│  Application Service │    │  Application Service             │
│  price-aggregator    │    │  holders-aggregator              │
│  - Cascada providers │    │  - Chain-specific logic          │
│  - First-non-null    │    │  - Solana: Gecko → Helius        │
│  - Rate limiting     │    │  - EVM: Moralis → Alchemy        │
└──────────┬───────────┘    └──────────┬───────────────────────┘
           │                           │
           ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    DOMAIN LAYER                               │
│  token-snapshot.aggregate.ts                                  │
│  - Invariantes (price > 0, holders >= 0)                      │
│  - Lógica de negocio pura                                     │
│  - Emite eventos (token-snapshot-created)                     │
└──────────┬───────────────────────────────┬───────────────────┘
           │                               │
           ▼                               ▼
┌────────────────────┐          ┌────────────────────────────┐
│   PORT OUT         │          │   PORT OUT                 │
│   PriceProviderPort│          │   HoldersProviderPort      │
│   (interface)      │          │   (interface)              │
└────────────────────┘          └────────────────────────────┘
           │                               │
           ▼                               ▼
┌────────────────────┐          ┌────────────────────────────┐
│  ADAPTER OUT       │          │  ADAPTER OUT               │
│  dexscreener-price │          │  geckoterminal-holders     │
│  - HTTP client     │          │  - HTTP client             │
│  - Error handling  │          │  - Response mapping        │
│  - Retry logic     │          │  - Null handling           │
└────────────────────┘          └────────────────────────────┘
           │                               │
           ▼                               ▼
┌────────────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES (APIs)                       │
│  DexScreener API, GeckoTerminal API, Helius RPC, etc.          │
└────────────────────────────────────────────────────────────────┘
```

### Código de Ejemplo: Port + Adapter

```typescript
// ============================================================================
// DOMAIN LAYER: Port (interface)
// ============================================================================
// libs/token/src/domain/ports/price-provider.port.ts

export interface PriceData {
  readonly usd: number;
  readonly change24h: number | null;
  readonly source: string;
  readonly timestamp: Date;
}

export abstract class PriceProviderPort {
  abstract getPrice(chain: string, address: string): Promise<PriceData | null>;
}

// ============================================================================
// INFRASTRUCTURE LAYER: Adapter OUT (implementa port)
// ============================================================================
// libs/token/src/infrastructure/providers/price/dexscreener-price.adapter.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  PriceProviderPort,
  PriceData,
} from '../../../domain/ports/price-provider.port';
import { DexScreenerService } from '@onchain-data/data-providers/dexscreener';

@Injectable()
export class DexScreenerPriceAdapter implements PriceProviderPort {
  private readonly logger = new Logger(DexScreenerPriceAdapter.name);

  constructor(
    private readonly dexScreener: DexScreenerService, // Raw HTTP client
  ) {}

  async getPrice(chain: string, address: string): Promise<PriceData | null> {
    try {
      const pair = await this.dexScreener.getPair(chain, address);

      if (!pair || !pair.priceUsd) {
        return null;
      }

      return {
        usd: parseFloat(pair.priceUsd),
        change24h: pair.priceChange?.h24 ?? null,
        source: 'dexscreener',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.warn(
        `DexScreener price fetch failed for ${chain}:${address}`,
        error,
      );
      return null; // Silent null (consumer tries next provider)
    }
  }
}

// ============================================================================
// APPLICATION LAYER: Service (coordina múltiples adapters)
// ============================================================================
// libs/token/src/application/services/price-aggregator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  PriceProviderPort,
  PriceData,
} from '../../domain/ports/price-provider.port';
import { RateLimiterService } from '@onchain-data/rate-limiter';

@Injectable()
export class PriceAggregatorService {
  private readonly logger = new Logger(PriceAggregatorService.name);

  constructor(
    // Inyecta MÚLTIPLES implementaciones del port (cascada)
    private readonly dexScreenerPrice: PriceProviderPort, // DexScreenerPriceAdapter
    private readonly geckoTerminalPrice: PriceProviderPort, // GeckoTerminalPriceAdapter
    private readonly coinGeckoPrice: PriceProviderPort, // CoinGeckoPriceAdapter
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async aggregatePrice(chain: string, address: string): Promise<PriceData> {
    // Cascada con rate limiting
    const providers: Array<{ name: string; port: PriceProviderPort }> = [
      { name: 'dexscreener', port: this.dexScreenerPrice },
      { name: 'geckoterminal', port: this.geckoTerminalPrice },
      { name: 'coingecko', port: this.coinGeckoPrice },
    ];

    for (const { name, port } of providers) {
      // Check rate limit ANTES de llamar
      if (!(await this.rateLimiter.canCall(name))) {
        this.logger.debug(`Skipping ${name} (rate limited)`);
        continue;
      }

      const result = await port.getPrice(chain, address);

      if (result) {
        this.logger.debug(`Price found via ${name}: $${result.usd}`);
        return result;
      }
    }

    // Todos los providers fallaron
    throw new Error(
      `Price unavailable for ${chain}:${address} (all providers exhausted)`,
    );
  }
}

// ============================================================================
// APPLICATION LAYER: Use Case (punto de entrada al dominio)
// ============================================================================
// libs/token/src/application/use-cases/aggregate-token-data.use-case.ts

import { Injectable } from '@nestjs/common';
import { TokenSnapshot } from '../../domain/aggregates/token-snapshot.aggregate';
import { TokenId } from '../../domain/value-objects/token-id.vo';
import { TokenRepositoryPort } from '../../domain/ports/token-repository.port';
import { PriceAggregatorService } from '../services/price-aggregator.service';
import { HoldersAggregatorService } from '../services/holders-aggregator.service';
import { SecurityAggregatorService } from '../services/security-aggregator.service';
import { EventBus } from '@nestjs/cqrs';

export interface AggregateTokenDataInput {
  chain: string;
  address: string;
}

@Injectable()
export class AggregateTokenDataUseCase {
  constructor(
    private readonly tokenRepo: TokenRepositoryPort,
    private readonly priceAggregator: PriceAggregatorService,
    private readonly holdersAggregator: HoldersAggregatorService,
    private readonly securityAggregator: SecurityAggregatorService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(input: AggregateTokenDataInput): Promise<TokenSnapshot> {
    const tokenId = TokenId.create(input.chain, input.address);

    // Aggregate data from multiple sources (parallel)
    const [price, holders, security] = await Promise.allSettled([
      this.priceAggregator.aggregatePrice(input.chain, input.address),
      this.holdersAggregator.aggregateHolders(input.chain, input.address),
      this.securityAggregator.aggregateSecurity(input.chain, input.address),
    ]);

    // Create aggregate (domain logic)
    const snapshot = TokenSnapshot.create(
      tokenId,
      price.status === 'fulfilled' ? price.value : null,
      holders.status === 'fulfilled' ? holders.value : null,
      security.status === 'fulfilled' ? security.value : null,
    );

    // Persist
    await this.tokenRepo.save(snapshot);

    // Publish domain events
    this.eventBus.publishAll(snapshot.commitEvents());

    return snapshot;
  }
}

// ============================================================================
// INFRASTRUCTURE LAYER: Adapter IN (HTTP Controller)
// ============================================================================
// apps/api/src/token/infrastructure/http/token.controller.ts

import { Controller, Get, Param } from '@nestjs/common';
import { AggregateTokenDataUseCase } from '@onchain-data/token/application';
import { TokenResponseDto } from './dtos/token-response.dto';

@Controller('api/v1/tokens')
export class TokenController {
  constructor(private readonly aggregateTokenData: AggregateTokenDataUseCase) {}

  @Get(':chain/:address')
  async getToken(
    @Param('chain') chain: string,
    @Param('address') address: string,
  ): Promise<TokenResponseDto> {
    // Invoca use case (punto de entrada al dominio)
    const snapshot = await this.aggregateTokenData.execute({ chain, address });

    // Serializa respuesta (DTO)
    return TokenResponseDto.fromAggregate(snapshot);
  }
}
```

---

## COMPARACIÓN: VARIANTE A vs B

| Aspecto                     |      Variante A (BC Único)      |          Variante B (Multi-App)           |
| --------------------------- | :-----------------------------: | :---------------------------------------: |
| **Complejidad operativa**   |  ⭐⭐⭐⭐⭐ Simple (1 deploy)   |         ⭐⭐⭐ Media (3 deploys)          |
| **Escalabilidad**           |         ⭐⭐⭐ Vertical         |      ⭐⭐⭐⭐⭐ Horizontal (por app)      |
| **Reutilización de código** |      ⭐⭐⭐ Módulos NestJS      |     ⭐⭐⭐⭐⭐ Libs compartidas (Nx)      |
| **Aislamiento**             | ⭐⭐⭐ Módulos en mismo proceso |      ⭐⭐⭐⭐⭐ Apps independientes       |
| **Tiempo de deploy**        |      ⭐⭐⭐ ~5 min (1 app)      | ⭐⭐⭐⭐ <2 min (rolling restart por app) |
| **Complejidad de código**   |       ⭐⭐⭐⭐ Más simple       |      ⭐⭐⭐ Más setup (Nx workspace)      |
| **Testing**                 |  ⭐⭐⭐⭐ E2E en mismo proceso  |  ⭐⭐⭐ E2E requiere múltiples procesos   |
| **Monitoring**              |       ⭐⭐⭐⭐ 1 servicio       |            ⭐⭐⭐ 3 servicios             |

**Recomendación:**

- **Fase 1-3 (MVP)**: Variante A (BC único) — simplicidad operativa, menor overhead
- **Fase 4+ (escala)**: Migrar a Variante B — cuando bot/worker necesiten escalar independientemente

---

## REGLAS HEXAGONALES (Checklist)

### ✅ Domain Layer (capa interna)

- [ ] **Zero dependencias externas** — No imports de NestJS, TypeORM, axios, etc.
- [ ] **Agregados auto-contenidos** — Invariantes en el agregado, no en servicios externos
- [ ] **Value Objects inmutables** — `readonly` properties, métodos `with*()` para mutación
- [ ] **Eventos de dominio** — `DomainEvent` base class, emitidos en el agregado
- [ ] **Puertos (interfaces)** — `abstract class` o `interface`, sin implementaciones

### ✅ Application Layer (orquestación)

- [ ] **Use cases públicos** — Punto de entrada único al dominio (no llamadas directas a agregados)
- [ ] **Services de aplicación** — Coordinan múltiples puertos/adapters, NO lógica de negocio
- [ ] **Transacciones** — Boundary de transacción en use case (no en servicios)
- [ ] **Eventos publicados** — `eventBus.publishAll(aggregate.commitEvents())` post-commit

### ✅ Infrastructure Layer (adaptadores)

- [ ] **Adapters implementan puertos** — `implements XPort`, no herencia directa
- [ ] **Repositorios NO son agregados** — Entities de ORM viven SOLO en `infrastructure/persistence/`
- [ ] **HTTP controllers invocan use cases** — NO llaman directamente a servicios de aplicación
- [ ] **Error handling en adapters** — Silent nulls en adapters OUT, HTTP errors en adapters IN

### ✅ Dependency Rule (regla de oro)

```
Dependencias SIEMPRE apuntan hacia adentro:

Infrastructure → Application → Domain
    (OUT)            ↓           (IN)
                  Ports
```

**NUNCA:**

- Domain importa de Application
- Domain importa de Infrastructure
- Application importa de Infrastructure (SOLO vía puertos)

---

## PRÓXIMOS PASOS

1. **Elegir nombre** (recomendación: `onchain-data` o `token-oracle`)
2. **Elegir variante** (recomendación: Variante A para MVP, migrar a B si escala)
3. **Crear repo** + estructura base
4. **Implementar primer agregado** (`token/` con 1 use case + 1 adapter)
5. **Validar patrón** (tests unitarios + E2E)
6. **Replicar patrón** a otros agregados (`chain/`, `provider/`)

---

## REFERENCIAS

- **Current architecture:**
  - `apps/backend/docs/spydefi/arch/` — DDD/Hexagonal patterns del proyecto
  - `apps/backend/src/token/enrichment/` — Estructura actual (inspiration)

- **Hexagonal Architecture:**
  - Alistair Cockburn "Ports and Adapters" (2005)
  - Clean Architecture (Uncle Bob, 2012)
  - DDD Blue Book (Eric Evans, 2003)

- **NestJS patterns:**
  - [NestJS CQRS](https://docs.nestjs.com/recipes/cqrs)
  - [NestJS Hexagonal Architecture](https://dev.to/deno/hexagonal-architecture-in-nestjs-4ob4)
