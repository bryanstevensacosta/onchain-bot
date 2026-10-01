# Data & API Infrastructure — Refactor Overview

**Created:** 2026-09-24  
**Status:** Planning  
**Goal:** Centralizar fuente de información onchain/off-chain + crear APIs para servirlos + bot Dexter asociado

---

## VISION

Crear un servicio centralizado que:

1. **Consolida fuentes de datos** — onchain (Solana RPC, EVM RPC, indexers) + off-chain (CoinMarketCap, CoinGecko, exchanges)
2. **Elimina lógica de negocio** — SOLO obtiene, estructura y sirve datos (no scoring, no filtering, no publishing)
3. **Expone APIs REST/GraphQL** — para consumo por otros servicios (backend principal, bots, frontend)
4. **Integra bot Dexter** — bot de Telegram para consultas on-demand (`/x`, `/z`, `/c` commands)
5. **Escalabilidad horizontal** — caché inteligente, rate-limiting, fallbacks automáticos

**Anti-patrón actual:** Data providers viven dentro del backend principal, acoplados a la lógica de negocio del pipeline de alpha-calls, sin capacidad de reutilización independiente.

**Arquitectura objetivo:**

```
┌──────────────────────────────────────────────────────────────────┐
│                    DATA SERVICE (nuevo)                           │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  DATA PROVIDERS (13 adaptadores actuales)                   │  │
│  │  ├─ Market Data: DexScreener, GeckoTerminal, Birdeye,      │  │
│  │  │              CoinGecko, CoinMarketCap, Mobula, Moralis   │  │
│  │  ├─ RPC/Blockchain: Alchemy (EVM), Helius (Solana),        │  │
│  │  │                  FluxRPC (Solana HTTP/3), Solana-RPC     │  │
│  │  ├─ Security: RugCheck                                      │  │
│  │  └─ Trading: PumpDev (pump.fun)                            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  AGGREGATION LAYER (nueva capa)                            │  │
│  │  ├─ Token info aggregator (multi-source fusion)            │  │
│  │  ├─ Price aggregator (best-price + fallbacks)              │  │
│  │  ├─ Holder aggregator (cross-chain normalization)          │  │
│  │  └─ Liquidity aggregator (DEX pool aggregation)            │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  CACHING LAYER (Redis + TTL strategies)                    │  │
│  │  ├─ Real-time data: 30s TTL (price, volume)                │  │
│  │  ├─ Semi-static data: 5min TTL (holders, liquidity)        │  │
│  │  └─ Static data: 1h TTL (metadata, chain info)             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  API LAYER (REST + GraphQL)                                │  │
│  │  ├─ GET /api/tokens/:chain/:address                        │  │
│  │  ├─ GET /api/tokens/:chain/:address/price                  │  │
│  │  ├─ GET /api/tokens/:chain/:address/holders                │  │
│  │  ├─ GET /api/tokens/:chain/:address/liquidity              │  │
│  │  ├─ GET /api/chains (lista de chains soportadas)           │  │
│  │  ├─ POST /api/tokens/batch (batch queries)                 │  │
│  │  └─ GraphQL /graphql (consultas flexibles)                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            ↓                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  DEXTER BOT (Telegram Bot API)                             │  │
│  │  ├─ /x <address> — full token scan (19 fields)             │  │
│  │  ├─ /z <address> — quick scan (7 fields)                   │  │
│  │  ├─ /c <address> — chart links (Dexscreener, Photon...)    │  │
│  │  ├─ /cc <address> — compact chart view                     │  │
│  │  └─ /settings — user preferences                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
┌───────────────┐   ┌───────────────┐   ┌──────────────┐
│ Backend       │   │ Frontend      │   │ External     │
│ (alpha-calls) │   │ (dashboard)   │   │ Consumers    │
└───────────────┘   └───────────────┘   └──────────────┘
```

---

## ESTADO ACTUAL

### Data Providers (apps/backend/src/data-provider/)

**13 proveedores activos** divididos en 3 categorías:

#### 1. Market Data / Enrichment (7 providers)

| Provider          | Capacidad                                        |     Costo Free      |          Coverage           | Usado en                              |
| ----------------- | ------------------------------------------------ | :-----------------: | :-------------------------: | ------------------------------------- |
| **DexScreener**   | Pairs cross-chain, search, profiles, boosts      |   $0 (60 req/min)   |    40+ chains, 80+ DEXes    | Enrichment (1º cascada), Chain Dexter |
| **GeckoTerminal** | Holders, top10%, GT score, precio, volumen       | $0 (~10-30 req/min) | 200+ networks, 1,500+ DEXes | Enrichment (2º cascada), Chain Dexter |
| **Birdeye**       | Token overview, price, trades, security          |     30k CU/mes      |   14 chains (Solana full)   | Enrichment (5º cascada), Chain Dexter |
| **Mobula**        | Concentration metrics, bonding curve, factory    |     60 req/min      |          6 chains           | Enrichment (6º cascada)               |
| **Moralis**       | Token analytics, holders, price, wallet balances |     40k CU/día      |        5 EVM chains         | Enrichment (7º cascada)               |
| **CoinGecko**     | Price, MC, FDV (fallback blue chips)             |  10k créditos/mes   |    100+ asset platforms     | Enrichment (3º cascada), Chain Dexter |
| **CoinMarketCap** | Quotes, metadata, listings, global metrics       |  20k créditos/mes   |       Chain-agnostic        | Enrichment (4º cascada), Chain Dexter |

#### 2. RPC / Blockchain Data (4 providers)

| Provider       | Capacidad                                       | Costo Free |  Coverage  | Usado en                                    |
| -------------- | ----------------------------------------------- | :--------: | :--------: | ------------------------------------------- |
| **Alchemy**    | JSON-RPC EVM, token balances, logs, tx receipts | 30M CU/mes | 80+ chains | Chain Detection (EVM prober)                |
| **Helius**     | Solana RPC + DAS API + Enhanced Transactions    | 1M CU/mes  |   Solana   | Chain Detection (Solana prober), Enrichment |
| **FluxRPC**    | Solana JSON-RPC HTTP/3 + QUIC                   |  Por byte  |   Solana   | Fallback RPC                                |
| **Solana-RPC** | JSON-RPC holders + probing                      |     —      |   Solana   | Holders fallback                            |

#### 3. Security / Trading (2 providers)

| Provider     | Capacidad                                      |     Costo      |     Coverage      | Usado en          |
| ------------ | ---------------------------------------------- | :------------: | :---------------: | ----------------- |
| **RugCheck** | Token safety (locked LP, burned %)             |       —        |      Solana       | Honeypot analysis |
| **PumpDev**  | Pump.fun trading, token creation, Jito bundles | Comisión 0.25% | Solana (pump.fun) | Trading execution |

### Arquitectura DataProviderPort

```typescript
// apps/backend/src/data-provider/core/data-provider.port.ts
export abstract class DataProviderPort {
  public abstract readonly name: string;
  protected abstract readonly logger: Logger;

  public async onModuleInit(): Promise<void> {
    // Hook opcional para validar API keys
  }
}
```

**Patrón canónico** (cada provider sigue esta estructura):

```
{provider}/
├── {provider}.config.ts      # Token de inyección + interfaz de config
├── {provider}.module.ts      # Módulo NestJS con forRoot()
├── {provider}.service.ts     # Servicio que extiende DataProviderPort
├── {provider}.types.ts       # Interfaces de request/response (readonly)
├── index.ts                  # Barrel export
└── README.md                 # Documentación del provider
```

**Ejemplo: DexScreenerService**

```typescript
// apps/backend/src/data-provider/dexscreener/dexscreener.service.ts
@Injectable()
export class DexScreenerService extends DataProviderPort {
  public readonly name = 'dexscreener';
  protected readonly logger = new Logger(DexScreenerService.name);

  constructor(@Inject(DEXSCREENER_CONFIG) private config: DexScreenerConfig) {
    super();
  }

  async getPair(chainId: string, pairAddress: string): Promise<DexPair | null> {
    // Raw axios, silent nulls, consumer-side caching
  }
}
```

### Chain Dexter Bot (apps/backend/src/telegram/chain-dexter-bot/)

**Bot de Telegram** que consume data providers DIRECTAMENTE (rompe aislamiento de BCs):

```
chain-dexter-bot/
├── application/
│   ├── token-scan.service.ts        # TokenScanResult (19 campos)
│   ├── handlers/                    # 7 command handlers
│   │   ├── scan-command.handler.ts         # /x full scan
│   │   ├── compact-scan.handler.ts         # /z quick scan
│   │   ├── chart-command.handler.ts        # /c chart links
│   │   ├── compact-chart.handler.ts        # /cc compact
│   │   ├── trade-buttons.handler.ts        # DEX/PHO/TRO buttons
│   │   ├── settings-command.handler.ts     # /settings
│   │   └── start-help.handler.ts           # /start /help
│   ├── command-router.ts            # Dispatcher /cmd → handler
│   └── context-resolver.ts          # Chat/user context
├── domain/
│   ├── token-scan.pipeline.ts       # Pipeline: detect → enrich → format
│   └── chat-settings.entity.ts      # User preferences (DB)
├── infrastructure/
│   └── telegram/
│       ├── chain-dexter-bot.adapter.ts  # Bot API client
│       ├── webhook.controller.ts        # POST /chain-dexter/webhook
│       └── polling.service.ts           # Polling ingest (1s interval)
└── bot.config.ts                    # CHAIN_DEXTER_BOT_TOKEN, ingest mode
```

**Problema actual:** Chain Dexter importa `DetectChainUseCase` y `EnrichTokenUseCase` directamente desde otros BCs (gap 7 — violación de aislamiento).

**TokenScanService resultado:**

```typescript
interface TokenScanResult {
  // Identificación
  chain: string;
  address: string;
  name: string | null;
  ticker: string | null;

  // Precio & Market Cap
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;

  // Liquidez & Volumen
  liquidityUsd: number | null;
  volume24h: number | null;

  // ATH
  athPriceUsd: number | null;
  athTimestamp: Date | null;
  athChangePercent: number | null;

  // Holders & Distribution
  holdersCount: number | null;
  top10HoldersPercent: number | null;
  top20HoldersPercent: number | null;

  // Security & Risk
  isHoneypot: boolean | null;
  rugCheckScore: number | null;

  // Metadata
  scanTimestamp: Date;
  dataSources: string[]; // ['dexscreener', 'geckoterminal', ...]
}
```

### Consumidores Actuales

**Backend (apps/backend/)**

1. **Enrichment BC** (`token/enrichment/infrastructure/adapters/`)
   - Cascada de 7 adapters: DexScreener → GeckoTerminal → CoinGecko → CoinMarketCap → Birdeye → Mobula → Moralis
   - `allSettled()`, first-non-null-wins merge
   - 5-min snapshot cache (`isFresh()`)
   - Todos importan services desde `data-provider/*`

2. **Chain Detection BC** (`chain/detection/infrastructure/probers/`)
   - `evm-chain-prober.adapter.ts` → `AlchemyService.rpcCall('eth_getCode')`
   - `solana-chain-prober.adapter.ts` → raw `JsonRpcClient` (NO usa HeliusService)
   - `Promise.allSettled()` + result cache

3. **Publishing BC** (`telegram/vip-calls/vip-channel/`)
   - `TickerResolverService` → 9-level cascade: DB → DexScreener → GeckoTerminal → CoinGecko → Moralis → Helius → name → `'ANON'`
   - Sanctioned exception to provider isolation

4. **Chain Dexter Bot** (`telegram/chain-dexter-bot/`)
   - Importa `DetectChainUseCase` + `EnrichTokenUseCase` DIRECTAMENTE (gap 7)
   - TokenScanService compone ambos para generar `TokenScanResult`

**Frontend (apps/frontend/)**

- NO consume data providers directamente
- Consulta endpoints del backend: `/api/token/market-data/:chain/:address`, `/api/chain/detection/:address`
- Dashboard consume WebSocket events (`enrichment.token.enriched`, `scoring.token.scored`)

---

## PROBLEMAS ACTUALES

### 1. Acoplamiento Backend ↔ Data Providers

**Problema:** Data providers viven DENTRO del backend, acoplados al pipeline de alpha-calls.

**Síntomas:**

- No se pueden reutilizar data providers sin levantar todo el backend
- Chain Dexter bot necesita el backend completo para funcionar
- Frontend no puede consultar datos onchain directamente (necesita backend intermediario)
- Duplicación de lógica de agregación en múltiples BCs

**Evidencia:**

```typescript
// apps/backend/src/token/enrichment/infrastructure/adapters/dexscreener.adapter.ts
constructor(
  private readonly dex: DexScreenerService, // inyección directa del provider
) {}
```

### 2. Violación de Aislamiento entre BCs

**Problema:** Chain Dexter importa use-cases de otros BCs directamente.

**Evidencia:**

```typescript
// apps/backend/src/telegram/chain-dexter-bot/application/token-scan.service.ts
import { DetectChainUseCase } from '../../../chain/detection/application/use-cases/detect-chain.use-case';
import { EnrichTokenUseCase } from '../../../token/enrichment/application/use-cases/enrich-token.use-case';
```

**Consecuencias:**

- Cambios en chain/detection rompen chain-dexter-bot
- No se puede extraer chain-dexter-bot como servicio independiente
- Testing difícil (necesita mockar BCs completos)

### 3. Lógica de Agregación Dispersa

**Problema:** Lógica de "mejor precio" / "fallback providers" duplicada en múltiples lugares.

**Ubicaciones actuales:**

- `EnrichTokenUseCase`: cascada de 7 adapters con `first-non-null-wins`
- `TickerResolverService`: cascada de 9 niveles para resolver ticker
- `TokenScanService`: composición ad-hoc de detección + enrichment

**Consecuencia:** Cambiar orden de fallbacks requiere tocar 3+ archivos.

### 4. Caché Inconsistente

**Problema:** Cada BC cachea a su manera, sin estrategia global.

**Evidencia:**

- Enrichment: 5-min snapshot cache
- Settings: 30s config cache
- TokenImage: LRU cache (in-memory) o Redis
- Chain Detection: result cache sin TTL explícito

**Consecuencia:** Misma query en 2 BCs = 2 llamadas al provider (rate limit desperdiciado).

### 5. Rate Limiting Descentralizado

**Problema:** No hay rate-limiting global — cada provider gestiona su propio rate limit.

**Riesgo:**

- Backend + Chain Dexter bot pueden consumir TODA la cuota en paralelo
- Sin circuit breaker → cascadas de fallos cuando provider cae
- Sin backoff inteligente → reintentos agresivos agotan cuota

### 6. Chain Dexter Acoplado al Backend

**Problema:** Bot Dexter vive DENTRO del backend principal, no puede escalar independientemente.

**Limitaciones:**

- No puede escalar horizontalmente (1 instancia = 1 bot)
- Reiniciar backend = reiniciar bot (downtime innecesario)
- Bot webhook/polling comparten puerto con backend (:3030)
- No se puede deployar bot en región diferente (latency Telegram)

### 7. Sin GraphQL ni Batch Queries

**Problema:** Solo REST endpoints individuales, sin queries flexibles.

**Uso actual:**

```typescript
// Frontend necesita 3 requests separados:
await fetch('/api/token/market-data/solana/So11111...');
await fetch('/api/chain/detection/So11111...');
await fetch('/api/token/classification/solana/So11111...');
```

**Ideal:**

```graphql
query TokenInfo($chain: String!, $address: String!) {
  token(chain: $chain, address: $address) {
    marketData {
      price
      marketCap
      liquidity
    }
    chainInfo {
      detected
      confidence
    }
    classification {
      category
      signals
    }
  }
}
```

---

## PROPUESTA: DATA SERVICE

### Arquitectura

**Nuevo repositorio mono-app**: `onchain-data-service/`

```
onchain-data-service/
├── apps/
│   ├── api/                    # REST + GraphQL API (NestJS)
│   ├── bot/                    # Dexter bot standalone (NestJS)
│   └── worker/                 # Background jobs (cache warm-up, indexing)
├── libs/
│   ├── providers/              # Data providers (migrados de backend)
│   ├── aggregators/            # Lógica de agregación multi-source
│   ├── cache/                  # Estrategias de caché (Redis)
│   └── rate-limiter/           # Rate limiting global + circuit breaker
└── infra/
    ├── docker-compose.yml      # Redis + Postgres (metadatos)
    └── k8s/                    # Kubernetes manifests (escalabilidad)
```

### apps/api/ — REST + GraphQL API

**Responsabilidades:**

1. Exponer endpoints REST para compatibilidad backward
2. Exponer GraphQL para queries flexibles
3. Implementar autenticación/autorización (API keys)
4. Rate limiting por consumer (backend vs frontend vs externos)

**Endpoints REST:**

```
GET  /api/v1/tokens/:chain/:address          # Token completo (agregado)
GET  /api/v1/tokens/:chain/:address/price    # Solo precio (optimizado)
GET  /api/v1/tokens/:chain/:address/holders  # Solo holders
GET  /api/v1/tokens/:chain/:address/security # Security score (RugCheck + heuristics)
POST /api/v1/tokens/batch                    # Batch queries (hasta 50 tokens)

GET  /api/v1/chains                          # Lista de chains soportadas
GET  /api/v1/chains/:chainId/info            # Metadata de chain

GET  /api/v1/providers                       # Lista providers activos
GET  /api/v1/providers/:name/status          # Health check de provider

GET  /api/v1/health                          # Service health
GET  /api/v1/metrics                         # Prometheus metrics
```

**GraphQL Schema:**

```graphql
type Query {
  token(chain: String!, address: String!): Token
  tokens(chain: String!, addresses: [String!]!): [Token!]!
  chains: [Chain!]!
  providers: [Provider!]!
}

type Token {
  chain: String!
  address: String!
  name: String
  symbol: String
  decimals: Int

  # Market data
  price: PriceData
  marketCap: Float
  fdv: Float
  liquidity: LiquidityData
  volume24h: Float

  # Holders
  holders: HoldersData

  # Security
  security: SecurityData

  # Metadata
  metadata: TokenMetadata

  # Data freshness
  cachedAt: DateTime
  sources: [String!]!
}

type PriceData {
  usd: Float!
  change24h: Float
  change7d: Float
  ath: AthData
  updatedAt: DateTime!
  source: String!
}

type LiquidityData {
  totalUsd: Float!
  pools: [PoolData!]!
}

type HoldersData {
  total: Int
  top10Percent: Float
  top20Percent: Float
  concentration: ConcentrationMetrics
}

type SecurityData {
  isHoneypot: Boolean
  rugCheckScore: Float
  signals: [SecuritySignal!]!
  lockedLiquidity: Float
  burnedSupply: Float
}

type ConcentrationMetrics {
  insiders: Float # % held by insiders
  bundlers: Float # % held by bundlers
  dev: Float # % held by dev wallets
  source: String! # 'mobula'
}

type SecuritySignal {
  type: SecuritySignalType!
  severity: SeverityLevel!
  message: String!
}

enum SecuritySignalType {
  HONEYPOT_SUSPECTED
  LOW_LIQUIDITY
  LOW_HOLDERS
  HIGH_CONCENTRATION
  UNLOCKED_LIQUIDITY
  MUTABLE_METADATA
}

enum SeverityLevel {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

type Chain {
  id: String!
  name: String!
  family: String! # 'evm' | 'solana' | 'cosmos' | ...
  nativeCurrency: String!
  rpcUrls: [String!]!
  explorers: [String!]!
  capabilities: [String!]! # ['market_data', 'rpc', 'holders', 'security']
}

type Provider {
  name: String!
  status: ProviderStatus!
  latency: Float
  rateLimit: RateLimitInfo
  coverage: ProviderCoverage!
}

type ProviderStatus {
  healthy: Boolean!
  lastCheck: DateTime!
  errorRate: Float
  message: String
}

type RateLimitInfo {
  limit: Int
  remaining: Int
  resetAt: DateTime
}

type ProviderCoverage {
  chains: [String!]!
  capabilities: [String!]!
}
```

**Implementación NestJS:**

```typescript
// apps/api/src/token/token.resolver.ts
@Resolver(() => Token)
export class TokenResolver {
  constructor(
    private readonly aggregator: TokenAggregatorService,
    private readonly cache: CacheService,
  ) {}

  @Query(() => Token)
  async token(
    @Args('chain') chain: string,
    @Args('address') address: string,
  ): Promise<Token> {
    // 1. Check cache
    const cached = await this.cache.get(`token:${chain}:${address}`);
    if (cached && this.cache.isFresh(cached, 30_000)) {
      return cached;
    }

    // 2. Aggregate from multiple sources
    const token = await this.aggregator.aggregateToken(chain, address);

    // 3. Cache result
    await this.cache.set(`token:${chain}:${address}`, token, 30_000);

    return token;
  }

  @Query(() => [Token])
  async tokens(
    @Args('chain') chain: string,
    @Args('addresses', { type: () => [String] }) addresses: string[],
  ): Promise<Token[]> {
    // Batch query optimizado
    return this.aggregator.aggregateTokensBatch(chain, addresses);
  }
}
```

### libs/aggregators/ — Lógica de Agregación

**Responsabilidad:** Combinar datos de múltiples providers con fallbacks inteligentes.

```typescript
// libs/aggregators/src/token-aggregator.service.ts
@Injectable()
export class TokenAggregatorService {
  constructor(
    private readonly dex: DexScreenerService,
    private readonly gecko: GeckoTerminalService,
    private readonly coingecko: CoinGeckoService,
    private readonly cmc: CoinMarketCapService,
    private readonly birdeye: BirdeyeService,
    private readonly mobula: MobulaService,
    private readonly moralis: MoralisService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async aggregateToken(chain: string, address: string): Promise<Token> {
    // Parallel queries con rate limiting
    const [price, liquidity, holders, security] = await Promise.allSettled([
      this.aggregatePrice(chain, address),
      this.aggregateLiquidity(chain, address),
      this.aggregateHolders(chain, address),
      this.aggregateSecurity(chain, address),
    ]);

    return {
      chain,
      address,
      price: price.status === 'fulfilled' ? price.value : null,
      liquidity: liquidity.status === 'fulfilled' ? liquidity.value : null,
      holders: holders.status === 'fulfilled' ? holders.value : null,
      security: security.status === 'fulfilled' ? security.value : null,
      cachedAt: new Date(),
      sources: this.extractSources([price, liquidity, holders, security]),
    };
  }

  private async aggregatePrice(chain: string, address: string): Promise<PriceData> {
    // Cascada con rate limiting
    const providers = [
      { name: 'dexscreener', fn: () => this.dex.getPrice(chain, address) },
      { name: 'geckoterminal', fn: () => this.gecko.getPrice(chain, address) },
      { name: 'coingecko', fn: () => this.coingecko.getPrice(chain, address) },
      { name: 'coinmarketcap', fn: () => this.cmc.getPrice(chain, address) },
    ];

    for (const provider of providers) {
      try {
        // Check rate limit before calling
        if (!await this.rateLimiter.canCall(provider.name)) {
          continue; // Skip to next provider
        }

        const result = await provider.fn();
        if (result) {
          return { ...result, source: provider.name };
        }
      } catch (error) {
        // Log + continue to next provider
        this.logger.warn(`Price fetch failed from ${provider.name}:`, error);
      }
    }

    throw new Error('All price providers exhausted');
  }

  private async aggregateHolders(chain: string, address: string): Promise<HoldersData> {
    // Chain-specific logic
    if (chain === 'solana') {
      return this.aggregateSolanaHolders(address);
    } else {
      return this.aggregateEvmHolders(chain, address);
    }
  }

  private async aggregateSolanaHolders(address: string): Promise<HoldersData> {
    // Try GeckoTerminal first (free, 200+ networks)
    try {
      const gecko = await this.gecko.getHolders('solana', address);
      if (gecko) return gecko;
    } catch {}

    // Fallback to Helius DAS API
    try {
      const helius = await this.helius.getHolders(address);
      if (helius) return helius;
    } catch {}

    throw new Error('Solana holders data unavailable');
  }

  private async aggregateEvmHolders(chain: string, address: string): Promise<HoldersData> {
    // Try Moralis first (40k CU/day free)
    try {
      const moralis = await this.moralis.getHolders(chain, address);
      if (moralis) return moralis;
    } catch {}

    // Fallback to Alchemy (if supported)
    if (this.alchemy.supportsChain(chain)) {
      const alchemy = await this.alchemy.getHolders(chain, address);
      if (alchemy) return alchemy;
    }

    throw new Error(`EVM holders data unavailable for ${chain}`);
  }

  private async aggregateSecurity(chain: string, address: string): Promise<SecurityData> {
    const signals: SecuritySignal[] = [];

    // RugCheck (Solana only)
    if (chain === 'solana') {
      const rugCheck = await this.rugcheck.analyze(address);
      signals.push(...this.convertRugCheckSignals(rugCheck));
    }

    // Birdeye token_security (multi-chain)
    if (this.birdeye.supportsChain(chain)) {
      const birdeye = await this.birdeye.getTokenSecurity(chain, address);
      signals.push(...this.convertBirdeyeSignals(birdeye));
    }

    // Heuristic signals (always run)
    const heuristics = await this.computeHeuristicSignals(chain, address);
    signals.push(...heuristics);

    return {
      isHoneypot: signals.some(s => s.type === SecuritySignalType.HONEYPOT_SUSPECTED),
      rugCheckScore: chain === 'solana' ? await this.rugcheck.getScore(address) : null,
      signals,
      lockedLiquidity: await this.getLocked LiquidityPercent(chain, address),
      burnedSupply: await this.getBurnedSupplyPercent(chain, address),
    };
  }
}
```

### libs/cache/ — Estrategias de Caché

**Responsabilidad:** TTL strategies por tipo de dato + invalidación inteligente.

```typescript
// libs/cache/src/cache.service.ts
export enum CacheTTL {
  REALTIME = 30_000, // 30s (price, volume)
  SEMI_STATIC = 300_000, // 5min (holders, liquidity)
  STATIC = 3600_000, // 1h (metadata, chain info)
}

@Injectable()
export class CacheService {
  constructor(
    private readonly redis: Redis,
    private readonly metrics: MetricsService,
  ) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const raw = await this.redis.get(key);
    if (!raw) {
      this.metrics.recordCacheMiss(key);
      return null;
    }

    this.metrics.recordCacheHit(key);
    return JSON.parse(raw);
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };

    await this.redis.setex(key, Math.ceil(ttl / 1000), JSON.stringify(entry));
  }

  isFresh<T>(entry: CacheEntry<T>, ttl: number): boolean {
    return Date.now() - entry.cachedAt < ttl;
  }

  async invalidate(pattern: string): Promise<number> {
    // Invalidar por patrón (ej: "token:solana:*")
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return 0;

    const deleted = await this.redis.del(...keys);
    this.metrics.recordInvalidation(pattern, deleted);
    return deleted;
  }

  async warmUp(keys: string[]): Promise<void> {
    // Pre-cache hot keys (llamado por worker)
    this.logger.log(`Warming up cache with ${keys.length} keys`);
    // Implementación delegada a worker
  }
}

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}
```

### libs/rate-limiter/ — Rate Limiting Global

**Responsabilidad:** Prevenir rate limit exhaustion + circuit breaker.

```typescript
// libs/rate-limiter/src/rate-limiter.service.ts
@Injectable()
export class RateLimiterService {
  private readonly limiters = new Map<string, RateLimiter>();

  constructor(
    private readonly redis: Redis,
    private readonly config: RateLimiterConfig,
  ) {
    // Inicializar limiters por provider
    for (const [provider, limits] of Object.entries(config.providers)) {
      this.limiters.set(provider, new RateLimiter(provider, limits, redis));
    }
  }

  async canCall(provider: string): Promise<boolean> {
    const limiter = this.limiters.get(provider);
    if (!limiter) return true; // No limit configured

    return limiter.tryAcquire();
  }

  async getStatus(provider: string): Promise<RateLimitStatus> {
    const limiter = this.limiters.get(provider);
    if (!limiter) return { available: true, remaining: Infinity };

    return limiter.getStatus();
  }
}

class RateLimiter {
  private circuitBreaker: CircuitBreaker;

  constructor(
    private readonly name: string,
    private readonly limits: ProviderLimits,
    private readonly redis: Redis,
  ) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60_000, // 1 min
    });
  }

  async tryAcquire(): Promise<boolean> {
    // Check circuit breaker first
    if (this.circuitBreaker.isOpen()) {
      return false;
    }

    // Check rate limit (sliding window)
    const key = `rate_limit:${this.name}:${Date.now()}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      // Set TTL on first increment
      await this.redis.expire(key, this.limits.windowSeconds);
    }

    if (count > this.limits.maxRequests) {
      this.circuitBreaker.recordFailure();
      return false;
    }

    this.circuitBreaker.recordSuccess();
    return true;
  }

  async getStatus(): Promise<RateLimitStatus> {
    const key = `rate_limit:${this.name}:${Date.now()}`;
    const count = await this.redis.get(key);
    const used = count ? parseInt(count) : 0;

    return {
      available: used < this.limits.maxRequests,
      remaining: Math.max(0, this.limits.maxRequests - used),
      resetAt: new Date(Date.now() + this.limits.windowSeconds * 1000),
    };
  }
}

interface ProviderLimits {
  maxRequests: number; // 60 req for dexscreener
  windowSeconds: number; // 60 for 1 minute window
}

interface RateLimitStatus {
  available: boolean;
  remaining: number;
  resetAt?: Date;
}
```

### apps/bot/ — Dexter Bot Standalone

**Responsabilidad:** Bot de Telegram DESACOPLADO del backend principal.

```typescript
// apps/bot/src/main.ts
async function bootstrap() {
  const app = await NestFactory.create(BotModule);

  // NO expone puerto HTTP (solo webhook endpoint interno)
  const ingestMode = process.env.CHAIN_DEXTER_INGEST_MODE;

  if (ingestMode === 'webhook') {
    // Start webhook listener
    await app.listen(3000); // Puerto interno, no expuesto
  } else {
    // Start polling
    await app.init();
  }

  logger.log(`Dexter bot started in ${ingestMode} mode`);
}
```

**Comunicación con Data Service:**

```typescript
// apps/bot/src/token-scan/token-scan.service.ts
@Injectable()
export class TokenScanService {
  constructor(
    private readonly dataService: DataServiceClient, // HTTP client to data-service API
  ) {}

  async scanToken(address: string): Promise<TokenScanResult> {
    // 1. Detect chain (call data-service API)
    const chain = await this.dataService.detectChain(address);

    // 2. Fetch full token data (GraphQL query)
    const token = await this.dataService.queryToken(chain, address, {
      fields: ['price', 'marketCap', 'holders', 'security', 'liquidity'],
    });

    // 3. Format for Telegram
    return this.formatForTelegram(token);
  }

  async quickScan(address: string): Promise<QuickScanResult> {
    // Solo campos esenciales (optimizado)
    const chain = await this.dataService.detectChain(address);
    const token = await this.dataService.queryToken(chain, address, {
      fields: ['price', 'marketCap', 'change24h'],
    });

    return this.formatQuickScan(token);
  }
}

// HTTP client to data-service
@Injectable()
export class DataServiceClient {
  constructor(
    private readonly http: HttpService,
    @Inject('DATA_SERVICE_URL') private readonly baseUrl: string,
  ) {}

  async detectChain(address: string): Promise<string> {
    const { data } = await this.http
      .get(`${this.baseUrl}/api/v1/chains/detect`, {
        params: { address },
      })
      .toPromise();

    return data.chain;
  }

  async queryToken(
    chain: string,
    address: string,
    options: QueryOptions,
  ): Promise<Token> {
    // GraphQL query
    const query = this.buildGraphQLQuery(options.fields);
    const { data } = await this.http
      .post(`${this.baseUrl}/graphql`, {
        query,
        variables: { chain, address },
      })
      .toPromise();

    return data.data.token;
  }

  private buildGraphQLQuery(fields: string[]): string {
    return `
      query TokenInfo($chain: String!, $address: String!) {
        token(chain: $chain, address: $address) {
          ${fields.join('\n')}
        }
      }
    `;
  }
}
```

### apps/worker/ — Background Jobs

**Responsabilidad:** Cache warm-up, indexing, health checks.

```typescript
// apps/worker/src/cache-warmer/cache-warmer.service.ts
@Injectable()
export class CacheWarmerService {
  constructor(
    private readonly aggregator: TokenAggregatorService,
    private readonly cache: CacheService,
    private readonly popularTokens: PopularTokensService,
  ) {}

  @Cron('*/5 * * * *') // Every 5 minutes
  async warmUpCache(): Promise<void> {
    // Pre-cache top 100 tokens
    const popular = await this.popularTokens.getTop(100);

    await Promise.allSettled(
      popular.map(async (token) => {
        const data = await this.aggregator.aggregateToken(
          token.chain,
          token.address,
        );
        await this.cache.set(
          `token:${token.chain}:${token.address}`,
          data,
          CacheTTL.SEMI_STATIC,
        );
      }),
    );

    this.logger.log(`Warmed up cache with ${popular.length} tokens`);
  }
}

// apps/worker/src/health-checker/health-checker.service.ts
@Injectable()
export class HealthCheckerService {
  constructor(
    private readonly providers: DataProviderPort[],
    private readonly metrics: MetricsService,
  ) {}

  @Cron('*/1 * * * *') // Every minute
  async checkProviders(): Promise<void> {
    for (const provider of this.providers) {
      try {
        const start = Date.now();
        await this.healthCheck(provider);
        const latency = Date.now() - start;

        this.metrics.recordProviderHealth(provider.name, true, latency);
      } catch (error) {
        this.metrics.recordProviderHealth(provider.name, false);
        this.logger.error(
          `Provider ${provider.name} health check failed:`,
          error,
        );
      }
    }
  }

  private async healthCheck(provider: DataProviderPort): Promise<void> {
    // Provider-specific health check
    // (cada provider implementa su propio ping/status endpoint)
  }
}
```

---

## MIGRACIÓN GRADUAL

### Fase 1: Extraer Data Providers (2 semanas)

**Objetivo:** Mover `apps/backend/src/data-provider/` a nuevo repo `onchain-data-service/libs/providers/`.

**Steps:**

1. **Crear nuevo repo** `onchain-data-service/`

   ```bash
   mkdir onchain-data-service && cd onchain-data-service
   npm init -y
   npx nx init
   npx nx g @nx/nest:app api
   npx nx g @nx/nest:lib providers
   ```

2. **Copiar providers** desde backend

   ```bash
   cp -r ../onchain-bot/apps/backend/src/data-provider/* libs/providers/src/
   ```

3. **Refactor imports** en providers (remover dependencias de backend)

   ```typescript
   // Antes
   import { Logger } from '@nestjs/common';
   import { DataProviderPort } from '../core/data-provider.port';

   // Después (mismo código, nuevo path)
   import { Logger } from '@nestjs/common';
   import { DataProviderPort } from '@onchain-data-service/providers/core';
   ```

4. **Tests unitarios** en nuevo repo

   ```bash
   nx test providers
   ```

5. **Publicar como package privado** (NPM registry interno o GitHub Packages)

   ```bash
   npm publish --registry=<internal-registry>
   ```

6. **Consumir desde backend** (mantener backward compatibility)
   ```typescript
   // apps/backend/package.json
   {
     "dependencies": {
       "@onchain-data-service/providers": "^1.0.0"
     }
   }
   ```

**Verificación:** Backend sigue funcionando sin cambios funcionales.

### Fase 2: Implementar Aggregation Layer (3 semanas)

**Objetivo:** Centralizar lógica de cascadas + fallbacks en `libs/aggregators/`.

**Steps:**

1. **Crear lib aggregators**

   ```bash
   npx nx g @nx/nest:lib aggregators
   ```

2. **Migrar lógica de EnrichTokenUseCase** → `TokenAggregatorService`
   - Extraer cascada de 7 adapters
   - Generalizar fallback logic
   - Añadir unit tests

3. **Migrar TickerResolverService** → `TickerAggregatorService`
   - Extraer cascada de 9 niveles
   - Reutilizar TokenAggregatorService

4. **Implementar HoldersAggregatorService**
   - Chain-specific logic (Solana vs EVM)
   - GeckoTerminal → Helius → Moralis fallback

5. **Implementar SecurityAggregatorService**
   - RugCheck + Birdeye + heuristics
   - Signal normalization

**Verificación:** Aggregators funcionan standalone (sin backend dependency).

### Fase 3: API + Caché (3 semanas)

**Objetivo:** Implementar REST + GraphQL API con caché Redis.

**Steps:**

1. **Crear app API**

   ```bash
   npx nx g @nx/nest:app api
   ```

2. **Implementar REST endpoints** (`/api/v1/tokens/*`)
   - Controllers + DTOs
   - Input validation (Zod)
   - Error handling

3. **Implementar GraphQL schema**
   - Resolvers
   - DataLoader (batch queries)
   - Subscriptions (real-time updates, opcional)

4. **Implementar CacheService**
   - Redis integration
   - TTL strategies (REALTIME/SEMI_STATIC/STATIC)
   - Invalidation patterns

5. **Implementar RateLimiterService**
   - Sliding window per provider
   - Circuit breaker
   - Metrics (Prometheus)

6. **Deploy standalone** (Docker Compose)
   ```yaml
   # docker-compose.yml
   version: '3.8'
   services:
     api:
       build: .
       ports:
         - '4000:4000'
       environment:
         REDIS_URL: redis://redis:6379
       depends_on:
         - redis

     redis:
       image: redis:7-alpine
       ports:
         - '6379:6379'
   ```

**Verificación:**

- `curl http://localhost:4000/api/v1/tokens/solana/So11111...` → 200
- `curl http://localhost:4000/graphql -d '{"query": "..."}'` → 200
- Cache hit rate >80% en queries repetidas

### Fase 4: Migrar Chain Dexter Bot (2 semanas)

**Objetivo:** Desacoplar bot del backend, consumir data-service API.

**Steps:**

1. **Crear app bot**

   ```bash
   npx nx g @nx/nest:app bot
   ```

2. **Copiar lógica actual** desde `apps/backend/src/telegram/chain-dexter-bot/`

3. **Refactor TokenScanService**
   - Remover imports de `DetectChainUseCase` / `EnrichTokenUseCase`
   - Consumir data-service API vía `DataServiceClient`

4. **Implementar DataServiceClient**
   - HTTP client (axios)
   - GraphQL query builder
   - Error handling + retries

5. **Deploy standalone** (Docker Compose)
   ```yaml
   bot:
     build: ./apps/bot
     environment:
       CHAIN_DEXTER_BOT_TOKEN: ${BOT_TOKEN}
       DATA_SERVICE_URL: http://api:4000
       CHAIN_DEXTER_INGEST_MODE: polling
     depends_on:
       - api
   ```

**Verificación:**

- Bot responde a `/x So11111...` → token scan completo
- Bot NO importa código de backend
- Bot puede reiniciarse sin afectar backend

### Fase 5: Migrar Backend Consumers (4 semanas)

**Objetivo:** Backend consume data-service API en lugar de data providers locales.

**Steps:**

1. **Implementar DataServiceClient en backend**

   ```typescript
   // apps/backend/src/shared/data-service/data-service.client.ts
   @Injectable()
   export class DataServiceClient {
     constructor(
       private readonly http: HttpService,
       @Inject('DATA_SERVICE_URL') private readonly baseUrl: string,
     ) {}

     async getTokenData(chain: string, address: string): Promise<TokenData> {
       const { data } = await this.http
         .get(`${this.baseUrl}/api/v1/tokens/${chain}/${address}`)
         .toPromise();

       return data;
     }
   }
   ```

2. **Refactor EnrichTokenUseCase**

   ```typescript
   // Antes
   constructor(
     private readonly dex: DexScreenerService,
     private readonly gecko: GeckoTerminalService,
     // ... 7 adapters
   ) {}

   async execute(input: EnrichTokenInput): Promise<TokenSnapshot> {
     // Cascada manual de 7 adapters
   }

   // Después
   constructor(
     private readonly dataService: DataServiceClient,
   ) {}

   async execute(input: EnrichTokenInput): Promise<TokenSnapshot> {
     const token = await this.dataService.getTokenData(input.chain, input.address);
     return this.convertToSnapshot(token);
   }
   ```

3. **Refactor chain detection adapters**

   ```typescript
   // Antes: raw RPC calls
   await this.alchemy.rpcCall('eth_getCode', [address]);

   // Después: API call
   await this.dataService.detectChain(address);
   ```

4. **Feature flag rollout** (canary deployment)

   ```typescript
   // .env
   USE_DATA_SERVICE_API=false  # Default: use local providers
   ```

   ```typescript
   // Código con feature flag
   if (this.config.useDataServiceApi) {
     return this.dataService.getTokenData(chain, address);
   } else {
     return this.legacyEnrichment(chain, address);
   }
   ```

5. **Gradual rollout**
   - 10% traffic → data-service
   - Monitor errors + latency
   - 50% traffic → data-service
   - 100% traffic → data-service
   - Remove local data providers

**Verificación:**

- Alpha-call pipeline funciona sin cambios
- Latency P95 <500ms
- Error rate <0.1%

### Fase 6: Worker + Monitoring (2 semanas)

**Objetivo:** Background jobs + observability.

**Steps:**

1. **Crear app worker**

   ```bash
   npx nx g @nx/nest:app worker
   ```

2. **Implementar cache warmer** (ver código arriba)

3. **Implementar health checker** (ver código arriba)

4. **Prometheus metrics**

   ```typescript
   // libs/metrics/src/metrics.service.ts
   @Injectable()
   export class MetricsService {
     private readonly cacheHits = new Counter({ name: 'cache_hits_total' });
     private readonly cacheMisses = new Counter({ name: 'cache_misses_total' });
     private readonly providerLatency = new Histogram({
       name: 'provider_latency_seconds',
       labelNames: ['provider'],
     });

     recordCacheHit(key: string): void {
       this.cacheHits.inc({ key });
     }

     recordProviderLatency(provider: string, latency: number): void {
       this.providerLatency.observe({ provider }, latency / 1000);
     }
   }
   ```

5. **Grafana dashboards**
   - Cache hit rate
   - Provider latency
   - Rate limit usage
   - Error rates

**Verificación:**

- `curl http://localhost:4000/metrics` → Prometheus format
- Grafana dashboard muestra métricas en real-time

---

## ESTRUCTURA FINAL

```
onchain-data-service/
├── apps/
│   ├── api/                           # REST + GraphQL API (:4000)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── token/
│   │   │   │   ├── token.controller.ts   # REST endpoints
│   │   │   │   ├── token.resolver.ts     # GraphQL resolver
│   │   │   │   └── token.service.ts      # Orquestador
│   │   │   ├── chain/
│   │   │   │   ├── chain.controller.ts
│   │   │   │   └── chain.resolver.ts
│   │   │   └── health/
│   │   │       └── health.controller.ts
│   │   └── Dockerfile
│   │
│   ├── bot/                           # Dexter bot standalone
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── commands/
│   │   │   │   ├── scan.handler.ts       # /x command
│   │   │   │   ├── quick-scan.handler.ts # /z command
│   │   │   │   └── chart.handler.ts      # /c command
│   │   │   ├── token-scan/
│   │   │   │   ├── token-scan.service.ts
│   │   │   │   └── data-service.client.ts
│   │   │   └── telegram/
│   │   │       ├── bot.adapter.ts
│   │   │       ├── webhook.controller.ts
│   │   │       └── polling.service.ts
│   │   └── Dockerfile
│   │
│   └── worker/                        # Background jobs
│       ├── src/
│       │   ├── main.ts
│       │   ├── cache-warmer/
│       │   │   └── cache-warmer.service.ts
│       │   ├── health-checker/
│       │   │   └── health-checker.service.ts
│       │   └── indexer/
│       │       └── popular-tokens.service.ts
│       └── Dockerfile
│
├── libs/
│   ├── providers/                     # 13 data providers (migrados)
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── data-provider.port.ts
│   │   │   │   └── data-provider.module.ts
│   │   │   ├── dexscreener/
│   │   │   ├── geckoterminal/
│   │   │   ├── birdeye/
│   │   │   ├── coingecko/
│   │   │   ├── coinmarketcap/
│   │   │   ├── mobula/
│   │   │   ├── moralis/
│   │   │   ├── alchemy/
│   │   │   ├── helius/
│   │   │   ├── fluxrpc/
│   │   │   ├── solana-rpc/
│   │   │   ├── rugcheck/
│   │   │   └── pumpdev/
│   │   └── README.md
│   │
│   ├── aggregators/                   # Lógica de agregación multi-source
│   │   ├── src/
│   │   │   ├── token-aggregator.service.ts
│   │   │   ├── price-aggregator.service.ts
│   │   │   ├── holders-aggregator.service.ts
│   │   │   ├── liquidity-aggregator.service.ts
│   │   │   └── security-aggregator.service.ts
│   │   └── README.md
│   │
│   ├── cache/                         # Estrategias de caché
│   │   ├── src/
│   │   │   ├── cache.service.ts
│   │   │   ├── cache.strategies.ts       # TTL configs
│   │   │   └── cache.interceptor.ts      # NestJS interceptor
│   │   └── README.md
│   │
│   ├── rate-limiter/                  # Rate limiting + circuit breaker
│   │   ├── src/
│   │   │   ├── rate-limiter.service.ts
│   │   │   ├── circuit-breaker.ts
│   │   │   └── rate-limiter.interceptor.ts
│   │   └── README.md
│   │
│   └── metrics/                       # Observability
│       ├── src/
│       │   ├── metrics.service.ts
│       │   └── prometheus.controller.ts  # /metrics endpoint
│       └── README.md
│
├── infra/
│   ├── docker-compose.yml             # Local dev (api + bot + worker + redis)
│   ├── docker-compose.prod.yml        # Production stack
│   ├── k8s/                           # Kubernetes manifests
│   │   ├── api-deployment.yaml
│   │   ├── bot-deployment.yaml
│   │   ├── worker-deployment.yaml
│   │   ├── redis-statefulset.yaml
│   │   └── ingress.yaml
│   └── grafana/
│       └── dashboards/
│           ├── overview.json
│           ├── providers.json
│           └── cache.json
│
├── nx.json
├── package.json
├── tsconfig.base.json
└── README.md
```

---

## BENEFICIOS

### 1. Desacoplamiento

- **Backend** se enfoca en lógica de negocio (alpha-calls pipeline)
- **Data service** se enfoca en obtener/servir datos onchain/off-chain
- **Bot Dexter** puede escalar independientemente
- Cambios en data providers NO afectan backend

### 2. Reutilización

- Frontend puede consultar datos directamente (sin backend intermediario)
- Múltiples bots pueden compartir data service
- External consumers pueden integrar vía API pública

### 3. Performance

- Caché centralizado (sin duplicación)
- Rate limiting global (evita exhaustion)
- Batch queries (GraphQL DataLoader)
- Cache warm-up proactivo (worker)

### 4. Escalabilidad

- API puede escalar horizontalmente (stateless)
- Bot puede deployarse en múltiples regiones (latency Telegram)
- Worker puede escalar según carga (Kubernetes HPA)

### 5. Observability

- Métricas centralizadas (Prometheus)
- Dashboards unificados (Grafana)
- Distributed tracing (OpenTelemetry, futuro)
- Health checks por provider

### 6. Flexibilidad

- GraphQL permite queries ad-hoc (sin nuevos endpoints)
- Batch queries reducen round-trips
- API pública permite integraciones externas

---

## MÉTRICAS DE ÉXITO

| Métrica                          |    Baseline (actual)    |      Target (post-refactor)      |
| -------------------------------- | :---------------------: | :------------------------------: |
| **Latency P95** (token query)    |  ~2 s (cascada manual)  |   <500 ms (caché + agregación)   |
| **Cache hit rate**               |   ~20% (fragmentado)    |       >80% (centralizado)        |
| **Rate limit exhaustion**        |    2-3 veces/semana     |       0 (circuit breaker)        |
| **Bot downtime** (deployments)   |      ~5 min/deploy      |     <30 s (rolling restart)      |
| **Provider failures** (cascaded) | Sin fallback automático |      Fallback transparente       |
| **Code duplication**             |  3 lugares con cascada  |      1 lugar (aggregators)       |
| **API consumers**                |       1 (backend)       | 3+ (backend, frontend, externos) |

---

## PRÓXIMOS PASOS

1. **Crear repo** `onchain-data-service/` (Nx monorepo)
2. **Fase 1** (2 semanas): Migrar data providers
3. **Fase 2** (3 semanas): Implementar aggregation layer
4. **Fase 3** (3 semanas): API + caché
5. **Fase 4** (2 semanas): Migrar Dexter bot
6. **Fase 5** (4 semanas): Migrar backend consumers
7. **Fase 6** (2 semanas): Worker + monitoring

**Total:** ~16 semanas (4 meses)

---

## APÉNDICE: PROVIDER MAPPING

### Solana

| Dato          |            Provider actual            |    Provider futuro (agregado)    |
| ------------- | :-----------------------------------: | :------------------------------: |
| Price         | DexScreener (1º) → GeckoTerminal (2º) | TokenAggregatorService (cascada) |
| Market Cap    |  GeckoTerminal (1º) → CoinGecko (2º)  |      TokenAggregatorService      |
| Holders       | GeckoTerminal (1º) → Helius DAS (2º)  |     HoldersAggregatorService     |
| Liquidity     |          DexScreener (pairs)          |    LiquidityAggregatorService    |
| Security      |          RugCheck + Birdeye           |    SecurityAggregatorService     |
| Concentration |            Mobula (único)             |  MobulaService (sin agregación)  |

### EVM (Ethereum, Base, Arbitrum...)

| Dato       |             Provider actual             |    Provider futuro (agregado)    |
| ---------- | :-------------------------------------: | :------------------------------: |
| Price      |  DexScreener (1º) → GeckoTerminal (2º)  | TokenAggregatorService (cascada) |
| Market Cap | GeckoTerminal (1º) → CoinMarketCap (2º) |      TokenAggregatorService      |
| Holders    |       Moralis (1º) → Alchemy (2º)       |     HoldersAggregatorService     |
| Liquidity  |           DexScreener (pairs)           |    LiquidityAggregatorService    |
| Security   |          Birdeye (multi-chain)          |    SecurityAggregatorService     |
| RPC        |     Alchemy (eth_getCode, balances)     | AlchemyService (sin agregación)  |

---

## REFERENCIAS

- **Current code:**
  - `apps/backend/src/data-provider/` — 13 providers actuales
  - `apps/backend/src/telegram/chain-dexter-bot/` — bot actual
  - `apps/backend/src/token/enrichment/` — cascada de enrichment
  - `apps/backend/src/chain/detection/` — chain detection

- **Documentation:**
  - `apps/backend/src/data-provider/README.md` — provider index
  - `apps/backend/AGENTS.md` — backend knowledge base
  - Root `AGENTS.md` — project overview

- **Architecture patterns:**
  - DDD/Hexagonal (backend actual)
  - Microservices (data-service futuro)
  - GraphQL Federation (futuro, si múltiples services)
