# DexScreener — Data Provider

Provider de market data DEX a través de la API pública de DexScreener. Fuente principal para pares de trading, búsqueda de tokens, perfiles recién listados y boosts en exchanges descentralizados (80+ DEXes en 40+ chains).

**Totalmente gratuito — sin API key requerida.**

---

## Visión

DexScreener ofrece datos en tiempo real de pares DEX en múltiples blockchains. Usado principalmente para:

- **Token pairs**: pares de trading por dirección de contrato (cross-chain)
- **Search**: búsqueda de tokens/pares por symbol, nombre o address
- **Token profiles**: perfiles de tokens recién listados con metadata, iconos, links
- **Boosts**: tokens promocionados (pagos) — latest y top
- **Orders**: órdenes abiertas de compra/venta por chain + token
- **Trending metas**: categorías de mercado agregadas con market cap, liquidez, volumen
- **Batch info**: información de múltiples tokens en una chain (comma-separated)
- **Best pair summary**: par con mayor liquidez USD para un token (cross-chain)

---

## Plan (totalmente gratuito)

| Límite | Valor |
|--------|-------|
| Costo | **$0 — sin API key** |
| Rate limit | **60 requests/minuto** |
| Endpoints | **12 endpoints públicos** |
| Cobertura | 80+ DEXes, 40+ chains |
| WebSocket | No disponible vía API REST |

> ✅ **No hay costos ocultos, tiers, ni CU.** El límite de 60 req/min es compartido entre todas las IPs de un mismo origen. Para producción se recomienda cache agresivo y respetar el rate limit.

---

## Endpoints disponibles

### Pairs & Search (4 endpoints)

| # | Endpoint | Descripción |
|---|----------|-------------|
| 1 | `GET /latest/dex/tokens/{tokenAddress}` | Pares DEX para un token (cross-chain) |
| 2 | `GET /latest/dex/pairs/{chainId}/{pairAddress}` | Par específico por chain + pair address |
| 3 | `GET /latest/dex/search?q={query}` | Búsqueda por symbol, name o address |
| 4 | `GET /token-pairs/v1/{chainId}/{tokenAddress}` | Pares de un token en una chain específica |

### Token Profiles (2 endpoints)

| # | Endpoint | Descripción |
|---|----------|-------------|
| 5 | `GET /token-profiles/latest/v1` | Últimos perfiles de tokens listados |
| 6 | `GET /token-profiles/recent-updates/v1` | Perfiles actualizados recientemente |

### Boosts (2 endpoints)

| # | Endpoint | Descripción |
|---|----------|-------------|
| 7 | `GET /token-boosts/latest/v1` | Últimos boosts (promociones pagas) |
| 8 | `GET /token-boosts/top/v1` | Top boosts |

### Orders (1 endpoint)

| # | Endpoint | Descripción |
|---|----------|-------------|
| 9 | `GET /orders/v1/{chainId}/{tokenAddress}` | Órdenes abiertas (buy/sell) |

### Metas (1 endpoint)

| # | Endpoint | Descripción |
|---|----------|-------------|
| 10 | `GET /metas/trending/v1` | Categorías de mercado trending |

### Token Info (1 endpoint)

| # | Endpoint | Descripción |
|---|----------|-------------|
| 11 | `GET /tokens/v1/{chainId}/{tokenAddresses}` | Info de 1+ tokens en una chain (comma-separated) |

---

## Endpoints implementados en el servicio

| Método service | Endpoint | Descripción |
|----------------|----------|-------------|
| `getPairsByToken(address)` | `GET /latest/dex/tokens/{address}` | Todos los pares DEX para un token (cross-chain) |
| `getPairByAddress(chainId, pairAddress)` | `GET /latest/dex/pairs/{chainId}/{pairAddress}` | Par específico |
| `search(query)` | `GET /latest/dex/search?q={query}` | Buscar por symbol/name/address |
| `getPairsByChain(chainId, tokenAddress)` | `GET /token-pairs/v1/{chainId}/{tokenAddress}` | Pares en una chain específica |
| `getLatestProfiles()` | `GET /token-profiles/latest/v1` | Últimos perfiles listados |
| `getRecentUpdates()` | `GET /token-profiles/recent-updates/v1` | Perfiles actualizados |
| `getLatestBoosts()` | `GET /token-boosts/latest/v1` | Últimos boosts |
| `getTopBoosts()` | `GET /token-boosts/top/v1` | Top boosts |
| `getOrders(chainId, tokenAddress)` | `GET /orders/v1/{chainId}/{tokenAddress}` | Órdenes abiertas |
| `getTrendingMetas()` | `GET /metas/trending/v1` | Metas trending |
| `getTokensInfo(chainId, tokenAddresses)` | `GET /tokens/v1/{chainId}/{tokenAddresses}` | Info batch de tokens |
| `getBestPairSummary(address)` | Convenience | Mejor par por liquidez (usa `getPairsByToken`) |

### Response types

```typescript
// DexScreenerPair — par DEX completo
{
  chainId: string;              // ej: "solana", "ethereum"
  dexId: string;                // ej: "raydium", "uniswap"
  url: string;                  // URL a DexScreener
  pairAddress: string;          // dirección del par
  labels?: string[] | null;     // etiquetas (ej: ["V2"])
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string | null;
    name: string | null;
    symbol: string | null;
  };
  priceNative: string;          // precio en token nativo
  priceUsd: string | null;      // precio USD
  txns: Record<string, { buys: number; sells: number }>;  // transacciones por timeframe
  volume: Record<string, number>;   // volumen por timeframe
  priceChange: Record<string, number> | null;  // cambio % por timeframe
  liquidity: { usd: number | null; base: number; quote: number } | null;
  fdv: number | null;           // fully diluted valuation
  marketCap: number | null;
  pairCreatedAt: number | null;  // timestamp creación
  info?: {
    imageUrl?: string | null;
    websites?: Array<{ url: string }> | null;
    socials?: Array<{ platform: string; handle: string }> | null;
  } | null;
  boosts?: { active: number } | null;
}

// DexScreenerTokenProfile — perfil de token listado
{
  url: string;
  chainId: string;
  tokenAddress: string;
  icon: string;
  header: string | null;
  description: string | null;
  links: Array<{
    type: string | null;
    label: string | null;
    url: string;
  }> | null;
}

// DexScreenerTokenBoost — boost de token
{
  chainId: string;
  tokenAddress: string;
  url: string;
  icon: string;
  header: string | null;
  description: string | null;
  links: Array<{ type: string | null; label: string | null; url: string }> | null;
  totalBoosts: number;
  amount: number;
}

// DexScreenerOrder — orden abierta
{
  chainId: string;
  tokenAddress: string;
  type: 'buy' | 'sell';
  price: number;
  volume: number;
  amount: number;
  total: number;
}

// DexScreenerMeta — categoría trending
{
  description: string;
  icon: { type: string; value: string };
  name: string;
  slug: string;
  marketCap: number;
  liquidity: number;
  volume: number;
  tokenCount: number;
  marketCapChange: { m5: number; h1: number; h6: number; h24: number };
  marketCapDelta: { m5: number; h1: number; h6: number; h24: number };
}

// DexScreenerPairSummary — resumen del mejor par
{
  pairAddress: string;
  dexId: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string | null;
  priceNative: string;
  liquidityUsd: number | null;
  volume24h: number;
  fdv: number | null;
  marketCap: number | null;
  priceChange24h: number | null;
  txns24h: { buys: number; sells: number };
}
```

### Métodos sugeridos para agregar

| Método service sugerido | Endpoint | Para qué sirve |
|-------------------------|----------|----------------|
| `getMetaBySlug(slug)` | `GET /metas/meta/v1/{slug}` | Categoría específica + sus pairs |
| `getLatestTakeovers()` | `GET /community-takeovers/latest/v1` | Community takeovers |
| `getLatestAds()` | `GET /ads/latest/v1` | Ads publicados |
| `getBestPairByChain(address, chainId)` | Convenience | Mejor par en una chain específica |
| `getTotalVolume24h(address)` | Convenience | Volumen 24h sumado cross-chain |

---

## Autenticación

- **API key**: No requerida
- **Rate limit**: 60 requests por minuto (compartido por IP)
- **Base URL**: `https://api.dexscreener.com`
- **Formato response**: varía por endpoint (arreglo directo u objeto con campo `pairs`)

### Response patterns

```typescript
// Endpoints de pairs: response.pairs
interface PairsResponse { pairs: DexScreenerPair[] | null }

// Endpoints de profiles/boosts/metas: arreglo directo
type ProfilesResponse = DexScreenerTokenProfile[];
type BoostsResponse = DexScreenerTokenBoost[];
type MetasResponse = DexScreenerMeta[];
```

### Ejemplo curl

```bash
# Pares cross-chain para un token
curl -s 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112'

# Búsqueda por symbol
curl -s 'https://api.dexscreener.com/latest/dex/search?q=BONK'

# Últimos perfiles listados
curl -s 'https://api.dexscreener.com/token-profiles/latest/v1'

# Top boosts
curl -s 'https://api.dexscreener.com/token-boosts/top/v1'

# Órdenes de un token en Solana
curl -s 'https://api.dexscreener.com/orders/v1/solana/So11111111111111111111111111111111111111112'

# Trending metas
curl -s 'https://api.dexscreener.com/metas/trending/v1'
```

---

## Chains soportadas (40+ chains, 80+ DEXes)

DexScreener cubre la mayoría de las blockchains con actividad DEX. Algunas de las principales:

| # | Chain | chainId value | DEXes principales |
|---|-------|---------------|-------------------|
| 1 | **Solana** | `solana` | Raydium, Orca, Jupiter, Meteora, Pump.fun |
| 2 | **Ethereum** | `ethereum` | Uniswap V2/V3, SushiSwap, ShibaSwap |
| 3 | **BNB Chain** | `bsc` | PancakeSwap V2/V3, Biswap |
| 4 | **Base** | `base` | Uniswap V3, Aerodrome, BaseSwap |
| 5 | **Arbitrum** | `arbitrum` | Uniswap V3, Camelot, SushiSwap |
| 6 | **Polygon** | `polygon` | QuickSwap, Uniswap V3, SushiSwap |
| 7 | **Avalanche** | `avalanche` | Trader Joe, Pangolin |
| 8 | **Optimism** | `optimism` | Uniswap V3, Velodrome |
| 9 | **Fantom** | `fantom` | SpookySwap, Beethoven X |
| 10 | **Cronos** | `cronos` | VVS Finance, CronaSwap |
| 11 | **Aurora** | `aurora` | Trisolaris, WannaSwap |
| 12 | **zkSync** | `zksync` | SyncSwap, Mute.io |
| 13 | **Polygon zkEVM** | `polygonzkevm` | QuickSwap, Balancer |
| 14 | **Linea** | `linea` | Lynex, Nile |
| 15 | **Blast** | `blast` | Blasterswap, Fenix |
| 16 | **Manta** | `manta` | Axiom, StakeStone |
| 17 | **Scroll** | `scroll` | SyncSwap, Skydrome |
| 18 | **Mode** | `mode` | ModeSwap, Kim Exchange |
| 19 | **Sui** | `sui` | Cetus, Turbos, FlowX |
| 20 | **Aptos** | `aptos` | LiquidSwap, PancakeSwap |
| 21+ | **Otras** | — | PulseChain, Telos, Kava, Celo, Gnosis, etc. |

> El valor `chainId` en los responses usa el nombre estandarizado de la chain (ej: `solana`, `ethereum`, `bsc`). Para el endpoint `token-pairs/v1/{chainId}` se usa el mismo valor.

---

## Rate limits

| Límite | Valor |
|--------|-------|
| Requests por minuto | **60** |
| Requests por segundo | ~1 (default burst) |
| Tipo de limit | **IP-based** (no API key) |

> El rate limit es **por dirección IP**. Si varias instancias del backend comparten la misma IP pública, el límite de 60 req/min es compartido. Para producción con alto throughput se recomienda:
> 1. Cache agresivo con TTL corto (30-60s)
> 2. `getBestPairSummary()` en vez de `getPairsByToken()` cuando solo se necesita el mejor par
> 3. Múltiples IPs (si es necesario)

### Manejo de rate limit

DexScreener no documenta explícitamente headers de rate limit en sus respuestas, pero el código maneja errores HTTP y retorna `null` en caso de fallo. Si se excede el rate limit, la API típicamente responde con HTTP 429 o timeout. El servicio ya implementa manejo de errores 404 y timeouts.

```typescript
// El servicio ya maneja errores silenciosamente:
try {
  const { data } = await axios.get(url, { timeout: 8_000 });
  return data;
} catch (err) {
  if (axios.isAxiosError(err) && err.response?.status === 404) return null;
  // Log y retorno null para cualquier error
  return null;
}
```

---

## Tipos de datos que ofrece

### Market Data

- **Price**: precio USD y nativo por par, cambio % (5m, 1h, 6h, 24h)
- **Liquidity**: liquidez USD, base, quote por par
- **Volume**: volumen por timeframe (5m, 1h, 6h, 24h)
- **Market Cap**: market cap y FDV por token
- **Transactions**: número de buys/sells por timeframe
- **Boosts**: cantidad de boosts activos, total, monto pagado

### Metadata

- **Token base**: address, name, symbol
- **Token quote**: address, name, symbol
- **DEX**: dexId (ej: `raydium`, `uniswap`)
- **Pair**: pairAddress, labels (ej: `V2`, `V3`), URL a DexScreener
- **Profile**: icon, header, description, links (website, socials)
- **Created**: timestamp de creación del par

### Activity / Discovery

- **Token profiles**: nuevos tokens listados con metadata completa
- **Boosts**: tokens promocionados (latest y top)
- **Orders**: órdenes abiertas de compra/venta (limit orders)
- **Trending metas**: categorías de mercado emergentes con stats agregados

### Convenience

- **Best pair summary**: resumen del par con mayor liquidez USD para un token (cross-chain)

---

## Ejemplos de uso

### Uso básico del service

```typescript
import { DexScreenerService } from 'data-provider/dexscreener';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Obtener todos los pares de un token (cross-chain)
const pairs = await dex.getPairsByToken(
  'So11111111111111111111111111111111111111112', // wSOL
);
if (pairs) {
  for (const pair of pairs) {
    console.log(`${pair.dexId} on ${pair.chainId}: $${pair.priceUsd}`);
    console.log(`  Liq: $${pair.liquidity?.usd}`);
    console.log(`  Vol 24h: $${pair.volume?.h24}`);
  }
}

// 2. Buscar token por symbol/name
const results = await dex.search('BONK');
if (results) {
  for (const pair of results) {
    console.log(`${pair.baseToken.symbol}: $${pair.priceUsd} (${pair.chainId})`);
  }
}

// 3. Obtener el mejor par (mayor liquidez)
const best = await dex.getBestPairSummary(
  'So11111111111111111111111111111111111111112',
);
if (best) {
  console.log(`Best pair: ${best.dexId} on ${best.pairAddress}`);
  console.log(`Price: $${best.priceUsd}`);
  console.log(`Liquidity: $${best.liquidityUsd}`);
  console.log(`Volume 24h: $${best.volume24h}`);
  console.log(`Buys: ${best.txns24h.buys} / Sells: ${best.txns24h.sells}`);
}

// 4. Últimos perfiles listados
const profiles = await dex.getLatestProfiles();
if (profiles) {
  for (const p of profiles.slice(0, 5)) {
    console.log(`${p.chainId}: ${p.tokenAddress}`);
    console.log(`  ${p.description?.slice(0, 80)}`);
  }
}
```

### Uso en enrichment

```typescript
// DexScreener como fuente principal de market data cross-chain.
// Sin costos por request — se puede llamar sin restricciones económicas.

async function enrichToken(tokenAddress: string) {
  // 1. Obtener todos los pares cross-chain
  const pairs = await dex.getPairsByToken(tokenAddress);

  if (!pairs || pairs.length === 0) return null;

  // 2. Agregar métricas sumando todos los pares
  let totalVolume24h = 0;
  let totalBuys24h = 0;
  let totalSells24h = 0;
  let bestLiquidity = 0;
  let bestPair = pairs[0];

  for (const pair of pairs) {
    totalVolume24h += Object.values(pair.volume).reduce((s, v) => s + v, 0);
    totalBuys24h += pair.txns?.h24?.buys ?? 0;
    totalSells24h += pair.txns?.h24?.sells ?? 0;
    const liq = pair.liquidity?.usd ?? 0;
    if (liq > bestLiquidity) {
      bestLiquidity = liq;
      bestPair = pair;
    }
  }

  // 3. Usar getBestPairSummary para resumen ejecutivo
  const summary = await dex.getBestPairSummary(tokenAddress);

  return {
    priceUsd: summary?.priceUsd,
    priceNative: summary?.priceNative,
    liquidityUsd: bestLiquidity,
    volume24h: totalVolume24h,
    fdv: summary?.fdv,
    marketCap: summary?.marketCap,
    priceChange24h: summary?.priceChange24h,
    totalPairs: pairs.length,
    chains: [...new Set(pairs.map(p => p.chainId))],
    dexes: [...new Set(pairs.map(p => p.dexId))],
    txns24h: { buys: totalBuys24h, sells: totalSells24h },
    bestDex: bestPair.dexId,
    bestChain: bestPair.chainId,
  };
}
```

### Uso con descubrimiento de tokens

```typescript
// DexScreener es excelente para descubrimiento porque no tiene costo.

// 1. Detectar nuevos tokens via token profiles
async function detectNewListings(): Promise<string[]> {
  const profiles = await dex.getLatestProfiles();
  if (!profiles) return [];

  return profiles.map(p => ({
    chainId: p.chainId,
    tokenAddress: p.tokenAddress,
    description: p.description,
    links: p.links,
  }));
}

// 2. Detectar tokens promocionados (boosts)
async function getTrendingBoosts() {
  const latest = await dex.getLatestBoosts();
  const top = await dex.getTopBoosts();

  // Combinar boosts recientes + top para tener un set completo
  const boosted = new Map<string, typeof latest[0]>();

  for (const b of latest ?? []) {
    boosted.set(`${b.chainId}:${b.tokenAddress}`, b);
  }
  for (const b of top ?? []) {
    boosted.set(`${b.chainId}:${b.tokenAddress}`, b);
  }

  return [...boosted.values()];
}

// 3. Detectar tendencias por metas trending
async function getTrendingCategories() {
  const metas = await dex.getTrendingMetas();
  if (!metas) return [];

  return metas.map(m => ({
    name: m.name,
    slug: m.slug,
    marketCap: m.marketCap,
    liquidity: m.liquidity,
    volume: m.volume,
    tokenCount: m.tokenCount,
    marketCapChange24h: m.marketCapChange.h24,
  }));
}
```

### Cross-chain discovery

```typescript
// DexScreener permite detectar en qué chains está listado un token.

async function discoverCrossChain(address: string) {
  const pairs = await dex.getPairsByToken(address);
  if (!pairs) return { chains: [], dexes: [], totalPairs: 0 };

  const chains = [...new Set(pairs.map(p => p.chainId))];
  const dexes = [...new Set(pairs.map(p => p.dexId))];

  console.log(`Token listado en ${chains.length} chains:`);
  for (const chain of chains) {
    const chainPairs = pairs.filter(p => p.chainId === chain);
    const totalLiq = chainPairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
    const totalVol = chainPairs.reduce((s, p) => {
      return s + Object.values(p.volume).reduce((a, b) => a + b, 0);
    }, 0);
    console.log(`  ${chain}: ${chainPairs.length} pairs, $${totalLiq} liq, $${totalVol} vol`);
  }

  return { chains, dexes, totalPairs: pairs.length };
}
```

### Monitoreo de nuevos listings

```typescript
// Sin costo por request, ideal para polling frecuente.
// Respetando rate limit de 60 req/min, se puede consultar
// perfiles cada ~5 segundos.

async function pollNewListings(
  intervalMs = 10_000,
  onNew: (profile: DexScreenerTokenProfile) => void,
) {
  const seen = new Set<string>();

  // Cargar estado inicial
  const initial = await dex.getLatestProfiles();
  for (const p of initial ?? []) {
    seen.add(p.tokenAddress);
  }

  // Polling
  setInterval(async () => {
    const profiles = await dex.getLatestProfiles();
    if (!profiles) return;

    for (const p of profiles) {
      if (!seen.has(p.tokenAddress)) {
        seen.add(p.tokenAddress);
        onNew(p);
      }
    }
  }, intervalMs);
}

// Uso:
// pollNewListings(10_000, (profile) => {
//   console.log(`Nuevo token: ${profile.tokenAddress} en ${profile.chainId}`);
//   // Encolar para enrichment...
// });
```

---

## Manejo de errores

| HTTP | Significado | Acción |
|------|-------------|--------|
| 200 | OK | Response válido |
| 404 | No encontrado | Token/pair sin datos o address inválido |
| 429 | Rate limit excedido | Esperar antes de reintentar |
| 5xx | Error interno del servidor | Reintentar con backoff |
| Timeout (>8s) | Timeout de conexión | Reintentar |

**El servicio maneja errores así:**
- **404**: retorna `null` (no es error, es "no hay datos")
- **429/5xx/timeout**: retorna `null` y loggea en debug
- **Excepciones**: capturadas, loggeadas, retorna `null`

### Estrategia de retry recomendada

```typescript
async function dexFetchWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries - 1) return null;
      const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}

// Uso:
const pairs = await dexFetchWithRetry(
  () => dex.getPairsByToken(address),
);
```

---

## ¿Por qué DexScreener en vez de otros providers?

| Aspecto | DexScreener | Birdeye (Standard) | Helius |
|---------|:-----------:|:------------------:|:------:|
| Costo | **$0** | $0 (30K CU/mes) | $0 (limitado) |
| API Key | ❌ No | ✅ Sí | ✅ Sí |
| Rate limit | 60 req/min | 1 req/s | Variable |
| Cobertura cross-chain | ✅ 40+ chains | ✅ 14 chains | ❌ Solana |
| DEXes cubiertos | 80+ | ~10-20 por chain | N/A (RPC) |
| Token profiles / nuevos listings | ✅ Sí | ⚠️ Limitado | ❌ No |
| Boosts / promociones | ✅ Sí | ❌ No | ❌ No |
| Órdenes abiertas | ✅ Sí | ❌ No | ❌ No |
| Trending metas | ✅ Sí | ❌ No | ❌ No |
| Batch por chain | ✅ Comma-separated | ❌ Solo single (Standard) | — |
| Precio histórico | ❌ No | ✅ Sí | — |
| Holders / wallets | ❌ No | ✅ Sí (Solana) | ✅ Sí |
| Seguridad / honeypot | ❌ No | ✅ Sí | — |

### Casos de uso ideales para DexScreener

1. **Enriquecimiento inicial**: precio, liquidez, volumen, pares cross-chain — sin costo
2. **Descubrimiento de tokens**: nuevos listings, boosts, trending metas
3. **Búsqueda**: resolver symbol/name a dirección de contrato
4. **Cross-chain analysis**: detectar en qué chains está listado un token
5. **Pre-enrichment filter**: verificar si un token tiene liquidez antes de llamar providers costosos

### Casos donde DexScreener NO es suficiente

1. **Precio histórico / OHLCV**: usar Birdeye o GeckoTerminal
2. **Holders y wallets**: usar Birdeye o Helius
3. **Seguridad / honeypot**: usar Birdeye token_security
4. **Datos en tiempo real (WebSocket)**: Birdeye Premium o Helius WebSocket

---

## Estrategia de integración en el pipeline

DexScreener es el proveedor ideal para la **primera fase de enrichment** porque:

1. **Sin costo** → se puede llamar siempre sin preocuparse por CU
2. **Cross-chain nativo** → detecta automáticamente en qué chains está listado
3. **`getPairsByToken`** → un solo request descubre todos los pares en todas las chains

Flujo recomendado:

```
1. DexScreener.getPairsByToken(address)
   ├── Si tiene pares con liquidez > $1,000 → continuar
   │   ├── DexScreener.getBestPairSummary(address)
   │   └── Birdeye.getTokenOverview(address, chain) — solo si en Solana
   └── Si no tiene pares → retornar null, no enrichment posible
```

```typescript
async function enrichmentStrategy(address: string) {
  // Fase 1: DexScreener (gratuito, cross-chain) — siempre se llama
  const pairs = await dex.getPairsByToken(address);
  if (!pairs || pairs.length === 0) {
    return { found: false, reason: 'No DEX pairs found' };
  }

  const bestLiquidity = Math.max(...pairs.map(p => p.liquidity?.usd ?? 0));
  if (bestLiquidity < 1000) {
    return { found: false, reason: 'Insufficient liquidity (< $1,000)' };
  }

  // Fase 2: Resumen ejecutivo del mejor par
  const summary = await dex.getBestPairSummary(address);

  // Fase 3: Datos adicionales solo en chains prioritarias (ej: Solana)
  let birdeyeData = null;
  const solanaPairs = pairs.filter(p => p.chainId === 'solana');
  if (solanaPairs.length > 0) {
    // birdeyeData = await birdeye.getTokenOverview(address, 'solana');
    // 25 CU — solo se gasta si el token tiene presencia en Solana
  }

  return {
    found: true,
    dexScreener: summary,
    pairsCount: pairs.length,
    chains: [...new Set(pairs.map(p => p.chainId))],
    birdeye: birdeyeData,
  };
}
```

---

## Referencias

- [DexScreener API Reference](https://docs.dexscreener.com/api/reference)
- [DexScreener WebSockets](https://docs.dexscreener.com/api/websockets)
- [DexScreener FAQ](https://docs.dexscreener.com/faq)
- [DexScreener Boosting](https://docs.dexscreener.com/boosting)
- [DexScreener Trending](https://docs.dexscreener.com/trending)
- [DexScreener Metas](https://docs.dexscreener.com/metas)
- [DexScreener Token Listing](https://docs.dexscreener.com/token-listing)
- [API Terms & Conditions](https://docs.dexscreener.com/api/api-terms-and-conditions)
