# Moralis — Data Provider

Provider de market data EVM a través de la API v2.2 de Moralis. Analytics de tokens, holders, metadata, precios y balances de wallet. Cubre 5 chains EVM.

---

## Visión

Moralis se usa en el pipeline para enriquecimiento de tokens en chains EVM (Ethereum, BSC, Base, Arbitrum, Polygon). Ofrece:

- **Token analytics**: precio, liquidez, FDV, cambio 24h
- **Token holders**: total holders + top 10 supply %
- **Token metadata**: logo, logo_hash
- **Token price**: precio actual formateado
- **Wallet balances**: todos los token balances de una wallet

## Plan actual (Free — $0)

| Límite | Valor |
|--------|-------|
| Plan | **Free** |
| Compute Units (CU) por día | **40,000** (se resetea cada 24h) |
| Rate limit | Depende del endpoint |
| Endpoints disponibles | Todos los básicos |
| Chains | 5 EVM (Ethereum, BSC, Base, Arbitrum, Polygon) |
| API Key | Requerida (gratis en [moralis.io](https://moralis.io)) |

> Con 40,000 CU/día, ~28 llamadas/minuto promedio es sostenible. Para producción, los planes superiores ofrecen 200k+ CU/día.

### Comparativa de planes

| Feature | Free | Pro | Enterprise |
|---------|:----:|:---:|:----------:|
| CU/día | 40,000 | 200,000+ | Custom |
| Speed | Standard | High | Ultra |
| Endpoints | Todos | Todos | Todos |
| Chains | 5 EVM | 5+ EVM | Full |

## Endpoints implementados en el servicio

| Método service | Endpoint Moralis | CU | Descripción |
|----------------|-------------------|:--:|-------------|
| `getTokenAnalytics(address, chain)` | `GET /tokens/{address}/analytics` | — | Price, liquidity, FDV, 24h change |
| `getTokenHolders(address, chain)` | `GET /erc20/{address}/holders` | — | Total holders + top10 supply % |
| `getTokenMetadata(address, chain)` | `GET /erc20/metadata` | — | Logo del token |
| `getTokenPrice(address, chain)` | `GET /erc20/{address}/price` | — | Precio formateado |
| `getWalletBalances(wallet, chain)` | `GET /wallets/{wallet}/tokens` | — | Token balances de wallet |

### Response types

```typescript
// Token Analytics
{
  priceUsd: number | null;
  liquidityUsd: number | null;
  fdvUsd: number | null;
  priceChange24h: number | null;
}

// Token Holders
{
  holders: number | null;           // Total holders
  top10HolderPercent: number | null; // % supply en top 10
}

// Metadata
{
  logo?: string | null;              // URL del logo
  logo_hash?: string | null;
}

// Token Price (MoralisTokenPriceResponse)
{
  usdPrice?: string;
  usdPriceFormatted?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
}

// Wallet Balance
{
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  logo?: string;
  balance?: string;
  balanceFormatted?: string;
  usdValue?: string;
  percentageRelativeToTotal?: string;
}
```

### Métodos sugeridos para agregar

| Método service sugerido | Endpoint Moralis | Para qué sirve |
|-------------------------|------------------|----------------|
| `getTokenSwaps(address, chain)` | `GET /erc20/{address}/swaps` | Historial de swaps |
| `getWalletNetWorth(wallet, chain)` | `GET /wallets/{wallet}/net-worth` | Net worth de wallet |
| `getTokenTransfers(address, chain)` | `GET /erc20/{address}/transfers` | Transfers del token |
| `getPairReserves(pairAddress, chain)` | `GET /{pair}/reserves` | Reserves de un pair DEX |

## Todos los endpoints relevantes de la API

| # | Endpoint | Método | Descripción |
|---|----------|--------|-------------|
| 1 | `GET /tokens/{address}/analytics` | GET | Token analytics (price, liquidity, FDV) |
| 2 | `GET /erc20/{address}/holders` | GET | Holders + distribución |
| 3 | `GET /erc20/metadata` | GET | Metadata de tokens ERC-20 |
| 4 | `GET /erc20/{address}/price` | GET | Precio actual |
| 5 | `GET /wallets/{wallet}/tokens` | GET | Token balances de wallet |
| 6 | `GET /erc20/{address}/swaps` | GET | Swaps históricos |
| 7 | `GET /wallets/{wallet}/net-worth` | GET | Net worth |
| 8 | `GET /erc20/{address}/transfers` | GET | Transfer history |

## Autenticación

- **Header**: `X-API-Key`
  ```
  X-API-Key: YOUR_API_KEY
  ```
- **Base URL**: `https://deep-index.moralis.io/api/v2.2`
- **API Key**: [Moralis Admin](https://admin.moralis.io/)

### Ejemplo curl

```bash
curl -s --request GET \
  --url 'https://deep-index.moralis.io/api/v2.2/erc20/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/price?chain=eth' \
  --header 'X-API-Key: YOUR_API_KEY'
```

## Chains soportadas (5 EVM)

| # | Chain | CHAIN_MAP slug | Chain ID |
|---|-------|----------------|----------|
| 1 | **Ethereum** | `eth` | 1 |
| 2 | **BSC** | `bsc` | 56 |
| 3 | **Base** | `base` | 8453 |
| 4 | **Arbitrum** | `arbitrum` | 42161 |
| 5 | **Polygon** | `polygon` | 137 |

## Manejo de errores

| HTTP | Significado | Acción |
|------|-------------|--------|
| 400 | Invalid parameters | Revisar address/chain |
| 401 | API key inválida | Verificar `.env` |
| 404 | Token no encontrado | No existe en esa chain |
| 429 | Rate limit excedido | Esperar y retry |
| 500 | Internal error | Retry con backoff |

El service actual retorna `null` silenciosamente en errores y logea en debug. Handleo de errores interno en cada método.

## Costos estimados (CU)

Moralis no publica costos exactos de CU por endpoint en su documentación pública. Estimaciones basadas en documentación:

| Endpoint | CU estimado | Requests/día posibles (40k CU) |
|----------|:-----------:|:-----------------------------:|
| `GET /tokens/{address}/analytics` | ~2 | ~20,000 |
| `GET /erc20/{address}/holders` | ~5 | ~8,000 |
| `GET /erc20/metadata` | ~1 | ~40,000 |
| `GET /erc20/{address}/price` | ~1 | ~40,000 |
| `GET /wallets/{wallet}/tokens` | ~5 | ~8,000 |

> Recomendación: usar `getTokenPrice` (ligero) para checks rápidos y `getTokenAnalytics` solo cuando se necesita el detalle completo.

## Ejemplos de uso

### Uso básico del service

```typescript
import { MoralisService } from 'data-provider/moralis';

// 1. Token analytics (price, liquidity, FDV, 24h change)
const analytics = await moralis.getTokenAnalytics(
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  'ethereum',
);
if (analytics) {
  console.log(`Price: $${analytics.priceUsd}`);
  console.log(`Liquidity: $${analytics.liquidityUsd}`);
  console.log(`FDV: $${analytics.fdvUsd}`);
  console.log(`24h change: ${analytics.priceChange24h}%`);
}

// 2. Token holders
const holders = await moralis.getTokenHolders(
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'ethereum',
);
if (holders) {
  console.log(`Total holders: ${holders.holders}`);
  console.log(`Top 10 supply %: ${holders.top10HolderPercent}%`);
}

// 3. Token price (más rápido que analytics)
const price = await moralis.getTokenPrice(
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'ethereum',
);
if (price) {
  console.log(`${price.tokenName} (${price.tokenSymbol}): $${price.usdPriceFormatted}`);
}

// 4. Wallet balances
const balances = await moralis.getWalletBalances(
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth
  'ethereum',
);
if (balances) {
  for (const token of balances) {
    console.log(`${token.symbol}: ${token.balanceFormatted} ($${token.usdValue})`);
  }
}

// 5. Token metadata (logo)
const metadata = await moralis.getTokenMetadata(
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  'ethereum',
);
if (metadata) {
  console.log(`Logo: ${metadata.logo}`);
}
```

### Uso en enrichment del pipeline

```typescript
// Enriquecimiento completo de un token EVM
async function enrichEVM(address: string, chain: string) {
  // Las 3 llamadas paralelas que hace el service
  const [analytics, holders, metadata] = await Promise.all([
    moralis.getTokenAnalytics(address, chain),
    moralis.getTokenHolders(address, chain),
    moralis.getTokenMetadata(address, chain),
  ]);

  if (!analytics) return null;

  return {
    priceUsd: analytics.priceUsd,
    liquidityUsd: analytics.liquidityUsd,
    fdvUsd: analytics.fdvUsd,
    priceChange24h: analytics.priceChange24h,
    holders: holders?.holders,
    top10HolderPercent: holders?.top10HolderPercent,
    logo: metadata?.logo,
  };
}
```

### Comparativa con otros providers

| Aspecto | Moralis | Mobula | Birdeye |
|---------|---------|--------|---------|
| Coverage | 5 EVM | 6 chains | 14 chains |
| Token analytics | ✅ | ✅ | ✅ |
| Holders | ✅ (top10) | ❌ | ✅ (Solana) |
| Wallet balances | ✅ | ✅ (portfolio) | Solo Solana |
| Price | ✅ | ✅ | ✅ |
| Concentration | ❌ | ✅ (único) | ❌ |
| Free tier | 40k CU/día | 60 req/min | 30k CU/mes |

## Estrategia de integración en el pipeline

Moralis se usa como fuente de datos EVM en el pipeline, complementando a DexScreener (cross-chain) y Mobula (concentration).

```
1. DexScreener.getPairsByToken(address)
   └── Si el token está en una chain EVM
       │
2. Moralis.getTokenAnalytics(address, chain)
   ├── priceUsd → precio actual
   ├── liquidityUsd → liquidez en DEX
   ├── fdvUsd → fully diluted valuation
   └── priceChange24h → cambio porcentual 24h
       │
3. Moralis.getTokenHolders(address, chain)
   ├── holders → cantidad total de holders
   └── top10HolderPercent → % de supply en top 10
       │
4. Moralis.getTokenMetadata(address, chain)
   └── logo → URL del logo del token
       │
5. Scoring: combinar analytics + holders con concentration de Mobula
```

### Enriquecimiento EVM completo

```typescript
async function enrichEVMFull(address: string, chain: string) {
  // Paso 1: Analytics (rápido, ~2 CU)
  const analytics = await moralis.getTokenAnalytics(address, chain);

  // Paso 2: Holders (~5 CU) — solo si hay analytics
  let holders = null;
  if (analytics) {
    holders = await moralis.getTokenHolders(address, chain);
  }

  // Paso 3: Metadata (~1 CU) — siempre
  const metadata = await moralis.getTokenMetadata(address, chain);

  if (!analytics) return null;

  // Paso 4: Enriquecer con wallet balances del deployer (opcional)
  // const deployerBalances = await moralis.getWalletBalances(deployerAddress, chain);

  return {
    priceUsd: analytics.priceUsd,
    liquidityUsd: analytics.liquidityUsd,
    fdvUsd: analytics.fdvUsd,
    priceChange24h: analytics.priceChange24h,
    holders: holders?.holders,
    top10HolderPercent: holders?.top10HolderPercent,
    logo: metadata?.logo,
    chain,
  };
}
// Costo estimado: ~8 CU por enriquecimiento
// Con 40,000 CU/día → ~5,000 enriquecimientos/día
```

### Detección de spam tokens

Moralis permite filtrar tokens spam al consultar wallet balances, usando el flag `exclude_spam` y el campo `possible_spam` en los responses.

```typescript
// Consultar wallet balances excluyendo spam
async function getCleanWalletBalances(wallet: string, chain: string) {
  const balances = await moralis.getWalletBalances(wallet, chain);

  if (!balances) return [];

  return balances.filter(t => {
    const isSpam = (t as any).possible_spam === true;
    if (isSpam) {
      console.log(`Excluyendo spam: ${t.symbol} (${t.tokenAddress})`);
    }
    return !isSpam;
  });
}
```

### Integración con wallet net worth

```typescript
// Ejemplo de integración futura con wallet net worth
// Endpoint: GET /wallets/{address}/net-worth

interface WalletNetWorth {
  total_net_worth_usd: string;
  token_balances: Array<{
    token_address: string;
    symbol: string;
    name: string;
    balance_usd: string;
    token_price_usd: string;
  }>;
}

// Útil para análisis de wallets de KOLs
async function analyzeKolWallet(wallet: string, chain: string) {
  const balances = await moralis.getWalletBalances(wallet, chain);
  if (!balances) return null;

  const totalValue = balances.reduce(
    (sum, t) => sum + parseFloat(t.usdValue ?? '0'), 0,
  );

  const topTokens = [...balances]
    .sort((a, b) => parseFloat(b.usdValue ?? '0') - parseFloat(a.usdValue ?? '0'))
    .slice(0, 5);

  return {
    totalValue,
    tokenCount: balances.length,
    topTokens: topTokens.map(t => ({
      symbol: t.symbol,
      value: parseFloat(t.usdValue ?? '0'),
      percentage: parseFloat(t.percentageRelativeToTotalSupply ?? '0'),
    })),
  };
}
```

## Optimización de costos CU

### Estrategia por capas

| Capa | Endpoint | CU | Frecuencia | Propósito |
|------|----------|:--:|:----------:|-----------|
| 1 | `getTokenPrice(address, chain)` | ~1 | Siempre | Check rápido de precio |
| 2 | `getTokenAnalytics(address, chain)` | ~2 | Si hay precio | Analytics completo |
| 3 | `getTokenHolders(address, chain)` | ~5 | Si hay liquidez | Distribución de holders |
| 4 | `getTokenMetadata(address, chain)` | ~1 | Una vez | Logo (cacheable) |

### Cálculo de capacidad (40,000 CU/día)

```typescript
const DAILY_CU = 40_000;

// Escenario A: solo price checks (1 CU)
const priceOnly = DAILY_CU / 1; // 40,000 tokens/día ✅

// Escenario B: price + analytics (3 CU)
const priceAndAnalytics = DAILY_CU / 3; // ~13,333 tokens/día ✅

// Escenario C: enrichment completo (8 CU)
const fullEnrich = DAILY_CU / 8; // 5,000 tokens/día ✅

// Escenario D: pipeline con 5 chains paralelas
const chains = ['eth', 'bsc', 'base', 'arbitrum', 'polygon'];
const cuPerToken = chains.length * 8; // 40 CU/token
const tokensPerDay = DAILY_CU / cuPerToken; // 1,000 tokens/día

// Recomendación: cachear metadata (1 CU) una vez por token
// y solo repetir analytics (2 CU) + holders (5 CU) cada N minutos.
```

### Cache de metadata

```typescript
const metadataCache = new Map<string, { logo: string | null; timestamp: number }>();
const METADATA_TTL = 86_400_000; // 24 horas

async function getCachedMetadata(address: string, chain: string) {
  const key = `${chain}:${address}`;
  const cached = metadataCache.get(key);
  if (cached && Date.now() - cached.timestamp < METADATA_TTL) {
    return cached;
  }
  const metadata = await moralis.getTokenMetadata(address, chain);
  if (metadata) {
    metadataCache.set(key, {
      logo: metadata.logo ?? null,
      timestamp: Date.now(),
    });
  }
  return metadata;
}
// El logo de un token no cambia frecuentemente → cachear 24h es seguro.
```

## Chains soportadas completas (30+ EVM)

Moralis soporta muchas más chains de las 5 principales. La lista completa vía API v2.2 incluye:

| # | Chain | Chain ID | slug |
|---|-------|:--------:|------|
| 1 | **Ethereum** | 1 | `eth` |
| 2 | **BSC** | 56 | `bsc` |
| 3 | **Base** | 8453 | `base` |
| 4 | **Arbitrum** | 42161 | `arbitrum` |
| 5 | **Polygon** | 137 | `polygon` |
| 6 | **Avalanche** | 43114 | `avalanche` |
| 7 | **Optimism** | 10 | `optimism` |
| 8 | **Fantom** | 250 | `fantom` |
| 9 | **Cronos** | 25 | `cronos` |
| 10 | **Gnosis** | 100 | `gnosis` |
| 11 | **Chiliz** | 88888 | `chiliz` |
| 12 | **Linea** | 59144 | `linea` |
| 13 | **Moonbeam** | 1284 | `moonbeam` |
| 14 | **Moonriver** | 1285 | `moonriver` |
| 15 | **Pulse** | 369 | `pulse` |
| 16 | **Ronin** | 2020 | `ronin` |
| 17 | **Lisk** | 1135 | `lisk` |
| 18 | **Sei** | 1329 | `sei` |
| 19 | **Monad** | 10143 | `monad` |
| 20+ | Testnets | — | sepolia, base sepolia, etc. |

> Las chains 1-5 son las implementadas actualmente en el servicio. Las chains 6-19+ están disponibles en la API v2.2 y se pueden agregar fácilmente extendiendo el CHAIN_MAP.

## Análisis detallado de endpoints

### GET /tokens/{address}/analytics

Endpoint principal para obtener analytics de un token. Response incluye:

```typescript
// TokenAnalytics response de la API oficial
{
  chainId: string;                    // "0x1" para Ethereum
  categoryId: string;                 // "0x1"
  totalBuyVolume: {                   // Volumen de compras
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  totalSellVolume: {                  // Volumen de ventas
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  totalBuyers: {                      // Compradores únicos
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  totalSellers: {                     // Vendedores únicos
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  totalBuys: {                        // Transacciones de compra
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  totalSells: {                       // Transacciones de venta
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  uniqueWallets: {                    // Wallets únicas
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  pricePercentChange: {               // Cambio % de precio
    5m: number; 1h: number; 6h: number; 24h: number;
  };
  usdPrice: string;                   // Precio USD
  totalLiquidity: string;             // Liquidez total USD
  totalFullyDilutedValuation: string; // FDV
}
```

### GET /erc20/{address}/price

Endpoint liviano (~1 CU) para obtener precio formateado:

```typescript
// TokenPrice response (API oficial)
{
  usdPrice: number;                    // Precio USD
  usdPriceFormatted: string;           // Precio formateado
  tokenName: string;                   // Nombre del token
  tokenSymbol: string;                 // Símbolo
  tokenLogo: string;                   // URL del logo
  tokenDecimals: string;               // Decimales
  nativePrice: {                       // Precio en token nativo
    value: string; decimals: number; name: string; symbol: string;
  };
  usdPrice24hrPercentChange: string;   // Cambio % 24h
  exchangeName: string;                // DEX (p.ej. "Uniswap v3")
  pairAddress: string;                 // Dirección del par
  pairTotalLiquidityUsd: string;       // Liquidez total del par
  securityScore: number;               // Score de seguridad
  possibleSpam: boolean;               // Flag de spam
  verifiedContract: boolean;           // Contrato verificado
}
```

### GET /wallets/{address}/tokens

Endpoint para obtener token balances de una wallet con precios y metadata:

```typescript
// WalletBalance response de la API oficial
{
  name: string;                         // Nombre del token
  symbol: string;                       // Símbolo
  decimals: number;                     // Decimales
  balance: string;                      // Balance en unidades nativas
  balance_formatted: string;            // Balance formateado
  usd_price: string;                    // Precio USD del token
  usd_value: number;                    // Valor total en USD
  portfolio_percentage: number;         // % del portfolio
  token_address: string;                // Dirección del contrato
  logo: string;                         // URL del logo
  thumbnail: string;                    // URL del thumbnail
  verified_contract: boolean;           // Contrato verificado
  possible_spam: boolean;               // Flag de spam
  total_supply: string;                 // Supply total
  percentage_relative_to_total_supply: number; // % del supply total
  native_token: boolean;                // Es token nativo?
}
```

## Endpoints adicionales disponibles en API v2.2

| Endpoint | Método | Descripción | Útil para |
|----------|--------|-------------|-----------|
| `GET /wallets/{address}/net-worth` | GET | Net worth total de wallet USD | Análisis de KOLs |
| `GET /wallets/{address}/token-transfers` | GET | Historial de transfers | Tracking de actividad |
| `GET /wallets/balances` | GET | Native balances batch (hasta 25 wallets) | Monitoreo multi-wallet |
| `GET /erc20/{address}/swaps` | GET | Swaps históricos buy/sell | Análisis de trading |
| `POST /erc20/{address}/owners` | GET | Owners con balances y % | Holder analysis detallado |
| `GET /erc20/metadata` | GET | Metadata simbólica | Cache de logos |

### Wallet Net Worth

```typescript
// Ejemplo de uso del endpoint de net worth (no implementado aún)
async function getWalletNetWorth(wallet: string, chain: string) {
  // GET /wallets/{wallet}/net-worth?chain={chain}
  // Response:
  // {
  //   total_net_worth_usd: "12345.67",
  //   token_balances: [{ token_address, symbol, name, balance_usd, token_price_usd }]
  // }
  return null; // Pendiente de implementar
}
```

### Native Balances Batch

```typescript
// Consultar balances nativos de múltiples wallets en una llamada
// GET /wallets/balances?chain=eth&wallet_addresses=0x1,0x2,0x3
// Útil para monitorear wallets de KOLs o deployers

async function batchNativeBalances(wallets: string[], chain: string) {
  // Llamada batch: hasta 25 wallets por request
  // Response incluye balance formateado por wallet
  return wallets.map(w => ({ address: w, balance: '0', balance_formatted: '0' }));
}
```

## Comparativa detallada con otros providers EVM

| Aspecto | Moralis | Mobula | Alchemy |
|---------|---------|--------|---------|
| Chains EVM | 30+ | 6 | 10+ |
| Token analytics (buy/sell volume) | ✅ Desglosado 5m/1h/6h/24h | ❌ | ❌ |
| Token holders | ✅ top10 % + owners detail | ❌ | ❌ |
| Wallet balances con precios | ✅ spam filter, verified, portfolio % | ✅ (portfolio) | ❌ |
| Wallet net worth | ✅ | ❌ | ❌ |
| Token price | ✅ exchangeName, pairAddress, securityScore | ✅ | ✅ |
| Metadata (logo) | ✅ verifiedContract, possibleSpam | ✅ | ❌ |
| Concentration metrics | ❌ | ✅ (único) | ❌ |
| Free tier | 40k CU/día | 60 req/min | 300M CU/mes |
| Rate limit | ~30 req/s | 60 req/min | ~100 req/s |
| Token swaps | ✅ | ❌ | ❌ |
| Token transfers | ✅ | ❌ | ❌ |
| Batch native balances | ✅ (hasta 25 wallets) | ❌ | ❌ |

## Preguntas frecuentes

### ¿Por qué Moralis en vez de Alchemy para EVM?

Moralis ofrece datos de más alto nivel: holders, analytics con desglose temporal (5m/1h/6h/24h), wallet net worth y detección de spam. Alchemy es mejor para RPC raw y eventos en tiempo real, pero requiere más procesamiento propio.

### ¿Moralis soporta Solana?

Sí, Moralis tiene endpoints para Solana (token analytics, price, holders), pero en este pipeline se usa solo para EVM. Para Solana se usan Helius y Birdeye.

### ¿Cómo manejar rate limits?

El plan Free tiene rate limit de ~30 requests/segundo. Con 5 chains implementadas, es ~6 req/s por chain. Para producción, el plan Pro ofrece speed "High" con mejor throughput.

### ¿Los CU se resetean?

Sí, 40,000 CU/día se resetean cada 24h. No acumulan. Si se excede, los requests fallan con 429 hasta el siguiente reset.

## Referencias

- [Moralis API Docs](https://docs.moralis.io/)
- [Moralis Admin](https://admin.moralis.io/)
- [Moralis API Reference](https://docs.moralis.io/web3-data-api/evm/reference)
- [Moralis Token Price](https://docs.moralis.io/data-api/evm/price/token-price)
- [Moralis Token Analytics](https://docs.moralis.io/data-api/solana/token/market-metrics/token-analytics)
- [Moralis Wallet Balances](https://docs.moralis.io/data-api/evm/wallet/token-balances)
- [Moralis Token Holders](https://docs.moralis.io/data-api/evm/token/holders/token-holders)
- [Moralis Token Transfers](https://docs.moralis.io/data-api/evm/wallet/token-transfers)
- [Moralis Pricing](https://moralis.io/pricing/)
