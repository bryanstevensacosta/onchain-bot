# Mobula — Data Provider

Provider de market data multi-chain a través de la API v2 de Mobula. Diferenciador clave: métricas de concentración (snipers, bundlers, insiders, dev) y detección de bonding curve. Cubre 6 chains (EVM + Solana).

---

## Visión

Mobula se usa en el pipeline para análisis de riesgo y detección de patrones de manipulación en tokens. Es el único provider que expone:

- **Concentration metrics**: top10, insiders, bundlers, dev holdings %
- **Bonding curve detection**: porcentaje de supply en bonding curve
- **Factory fingerprinting**: identificación del factory que creó el token
- **Market data**: precio, liquidez, market cap, supply
- **Wallet portfolio**: todos los balances de una wallet
- **Price history**: datos históricos precio/volumen
- **Token metadata**: name, symbol, icon, decimals

## Plan actual (Demo — $0)

| Límite | Valor |
|--------|-------|
| Plan | **Demo** (gratuito) |
| Endpoints disponibles | Todos los v2 básicos |
| Rate limit | **60 requests/minuto** |
| Chains | 6 (Ethereum, BSC, Base, Arbitrum, Polygon, Solana) |
| API Key | Requerida (gratis en [mobula.io](https://mobula.io)) |

> No hay planes públicos detallados. La API demo permite integración y pruebas. Para producción contactar con Mobula.

## Endpoints implementados en el servicio

| Método service | Endpoint API | Descripción |
|----------------|--------------|-------------|
| `getTokenMarkets(address, blockchain)` | `GET /token/markets` | Market data + concentration metrics |
| `getWalletPortfolio(wallet)` | `GET /wallet/portfolio` | Portfolio completo de una wallet |
| `getTokenHistory(address, from?, to?)` | `GET /token/history` | Precio/volumen histórico (timestamp, price, volume) |
| `getTokenMetadata(address)` | `GET /token/metadata` | Metadata (name, symbol, icon, decimals) |

### Response types

```typescript
// MobulaMarketToken — market data + concentration
{
  address?: string;
  priceUSD?: number | null;                // Precio actual USD
  approximateReserveUSD?: number | null;    // Liquidez USD
  marketCapUSD?: number | null;            // Market cap
  marketCapDilutedUSD?: number | null;     // FDV
  totalSupply?: number | null;             // Supply total
  top10HoldingsPercentage?: number | null; // % en top 10 holders
  insidersHoldingsPercentage?: number | null; // % insiders
  bundlersHoldingsPercentage?: number | null; // % bundlers
  devHoldingsPercentage?: number | null;   // % dev wallet
  bondingPercentage?: number | null;       // % en bonding curve
  factory?: string | null;                 // Factory address
  source?: string | null;                  // Fuente de datos
}

// MobulaWalletPortfolio
{
  totalUsd?: number;                       // Valor total USD
  assets?: Array<{
    address: string;
    symbol: string;
    balanceUSD: number;
  }>;
}

// MobulaHistoryEntry
{
  timestamp: number;                       // Unix timestamp
  price: number;                           // Precio USD
  volume: number;                          // Volumen USD
}

// MobulaMetadata
{
  name?: string;
  symbol?: string;
  icon?: string;                           // URL del logo
  decimals?: number;
}
```

### Métodos sugeridos para agregar

| Método service sugerido | Endpoint | Para qué sirve |
|-------------------------|----------|----------------|
| `getTokenMarketsBatch(addresses)` | `POST /token/markets/batch` | Market data de múltiples tokens |
| `getTokenPrice(address)` | `GET /token/price` | Precio rápido |
| `getSearch(query)` | `GET /search` | Buscar tokens por nombre/símbolo |
| `getTokenHolders(address)` | `GET /token/holders` | Holders de un token |

## Todos los endpoints de la API v2

| # | Endpoint | Método | Descripción |
|---|----------|--------|-------------|
| 1 | `/token/markets` | GET | Market data de un token |
| 2 | `/token/markets/batch` | POST | Market data batch |
| 3 | `/token/price` | GET | Precio de un token |
| 4 | `/token/history` | GET | Precio histórico |
| 5 | `/token/metadata` | GET | Metadata (name, symbol, icon) |
| 6 | `/token/holders` | GET | Holders de un token |
| 7 | `/wallet/portfolio` | GET | Portfolio de una wallet |
| 8 | `/search` | GET | Buscar tokens |

## Autenticación

- **Header**: `Authorization` con el API key
  ```
  Authorization: YOUR_API_KEY
  ```
- **Base URL**: `https://api.mobula.io/api/2`
- **API Key**: Gratuita en [mobula.io dashboard](https://mobula.io)

### Ejemplo curl

```bash
curl -s --request GET \
  --url 'https://api.mobula.io/api/2/token/markets?address=So11111111111111111111111111111111111111112&blockchain=solana' \
  --header 'Authorization: YOUR_API_KEY'
```

## Chains soportadas (6)

| # | Chain | CHAIN_MAP slug | Estado |
|---|-------|----------------|--------|
| 1 | **Ethereum** | `ethereum` | ✅ |
| 2 | **BSC** | `bsc` | ✅ |
| 3 | **Base** | `base` | ✅ |
| 4 | **Arbitrum** | `arbitrum` | ✅ |
| 5 | **Polygon** | `polygon` | ✅ |
| 6 | **Solana** | `solana` | ✅ |

## Valor único: Concentration Metrics

Mobula es el único provider que ofrece métricas de concentración, críticas para detectar tokens manipulados:

### Insiders Holdings %
Porcentaje de supply en manos de wallets "insider" (wallets sospechosas de pertenecer al equipo/insiders). Un valor >20% es señal de alerta.

### Bundlers Holdings %
Porcentaje de supply comprado en bloque en el momento del launch. Un valor >30% sugiere que un grupo coordinado controla gran parte del supply.

### Dev Holdings %
Porcentaje de supply controlado directamente por el deployer. Dev >10% puede indicar riesgo de rug pull.

### Top 10 Holdings %
Porcentaje de supply en las 10 wallets más grandes. >50% es alta concentración.

### Bonding Percentage %
Porcentaje del supply que está en la bonding curve de un AMM (típicamente pump.fun). Referencia para saber cuánto supply está en circulación.

### Factory
Address del factory contract que creó el token. Útil para identificar si el token fue creado con un factory conocido o sospechoso.

### Interpretación rápida

| Métrica | Normal | Alerta | Riesgo alto |
|---------|--------|--------|-------------|
| Top 10 % | <30% | 30-50% | >50% |
| Insiders % | <5% | 5-15% | >15% |
| Bundlers % | <10% | 10-25% | >25% |
| Dev % | <3% | 3-10% | >10% |
| Bonding % | — | <10% | >50% (mucho supply fuera de circulación) |

## Manejo de errores

| HTTP | Significado | Acción |
|------|-------------|--------|
| 400 | Invalid parameters | Revisar address/blockchain |
| 401 | API key inválida | Verificar `.env` |
| 404 | Token no encontrado | Probablemente no listado en Mobula |
| 429 | Rate limit | Esperar y retry |
| 500 | Internal error | Retry con backoff |

El service actual retorna `null` silenciosamente en errores y logea en debug.

## Rate limits

| Límite | Valor |
|--------|-------|
| Rate limit | **60 requests/minuto** |
| Plan Demo | Sin CU, sin costos por request |
| Batch | No disponible en Demo |

## Ejemplos de uso

### Uso básico del service

```typescript
import { MobulaService } from 'data-provider/mobula';

// 1. Market data + concentration de un token
const markets = await mobula.getTokenMarkets(
  'So11111111111111111111111111111111111111112', // wSOL
  'solana',
);
if (markets) {
  console.log(`Price: $${markets.priceUSD}`);
  console.log(`Liquidity: $${markets.approximateReserveUSD}`);
  console.log(`Market Cap: $${markets.marketCapUSD}`);
  console.log(`Top 10: ${markets.top10HoldingsPercentage}%`);
  console.log(`Insiders: ${markets.insidersHoldingsPercentage}%`);
  console.log(`Bundlers: ${markets.bundlersHoldingsPercentage}%`);
  console.log(`Dev: ${markets.devHoldingsPercentage}%`);
  console.log(`Bonding curve: ${markets.bondingPercentage}%`);
  console.log(`Factory: ${markets.factory}`);
}

// 2. Wallet portfolio
const portfolio = await mobula.getWalletPortfolio('9x...');
if (portfolio) {
  console.log(`Total USD: $${portfolio.totalUsd}`);
  for (const asset of portfolio.assets ?? []) {
    console.log(`${asset.symbol}: $${asset.balanceUSD}`);
  }
}

// 3. Price history
const history = await mobula.getTokenHistory(
  'So11111111111111111111111111111111111111112',
  Math.floor(Date.now() / 1000) - 86400, // 24h ago
);
if (history) {
  for (const entry of history) {
    console.log(`${new Date(entry.timestamp * 1000).toISOString()}: $${entry.price}`);
  }
}

// 4. Token metadata
const metadata = await mobula.getTokenMetadata(
  'So11111111111111111111111111111111111111112',
);
if (metadata) {
  console.log(`${metadata.name} (${metadata.symbol})`);
  console.log(`Icon: ${metadata.icon}`);
  console.log(`Decimals: ${metadata.decimals}`);
}
```

### Uso en análisis de riesgo

```typescript
// Evaluar si un token tiene concentración riesgosa
async function assessConcentrationRisk(address: string, chain: string) {
  const markets = await mobula.getTokenMarkets(address, chain);
  if (!markets) return null;

  const alerts: string[] = [];
  let riskScore = 0;

  if ((markets.top10HoldingsPercentage ?? 0) > 50) {
    alerts.push(`Top 10 holders: ${markets.top10HoldingsPercentage}% (riesgo alto)`);
    riskScore += 3;
  }
  if ((markets.insidersHoldingsPercentage ?? 0) > 15) {
    alerts.push(`Insiders: ${markets.insidersHoldingsPercentage}%`);
    riskScore += 3;
  }
  if ((markets.bundlersHoldingsPercentage ?? 0) > 25) {
    alerts.push(`Bundlers: ${markets.bundlersHoldingsPercentage}%`);
    riskScore += 2;
  }
  if ((markets.devHoldingsPercentage ?? 0) > 10) {
    alerts.push(`Dev holdings: ${markets.devHoldingsPercentage}%`);
    riskScore += 3;
  }
  if ((markets.bondingPercentage ?? 0) > 50) {
    alerts.push(`Bonding curve: ${markets.bondingPercentage}% (mucho supply bloqueado)`);
    riskScore += 1;
  }

  return { riskScore, alerts, factory: markets.factory };
}
// Risk score: 0-3 bajo, 4-7 medio, 8+ alto
```

### Diferencia con otros providers

| Aspecto | Mobula | Birdeye | Moralis |
|---------|--------|---------|---------|
| Concentration metrics | ✅ (único) | ❌ | ❌ |
| Multi-chain | 6 chains | 14 chains | 5 EVM |
| Solana | ✅ | ✅ (mejor) | ❌ |
| EVM | ✅ | Limitado | ✅ (mejor) |
| Wallet portfolio | ✅ | Solo Solana | ✅ |
| Price history | ✅ | ✅ | ❌ |
| Free tier | Demo (60 req/min) | 30k CU/mes | 40k CU/día |

## Estrategia de integración en el pipeline

Mobula se usa en la fase de **análisis de riesgo** del pipeline, después del enrichment inicial con DexScreener.

```
1. DexScreener.getPairsByToken(address)
   └── Si tiene liquidez > $1,000
       ├── DexScreener.getBestPairSummary(address) → precio, volumen, liquidity
       │
2. Mobula.getTokenMarkets(address, chain) → concentration metrics
   ├── Si top10Holdings > 50% → ALERTA de alta concentración
   ├── Si insiders > 15% → ALERTA de insiders
   ├── Si dev > 10% → ALERTA de rug pull potencial
   └── bondingPercentage → cuánto supply está en bonding curve
       │
3. Decisión del pipeline
   ├── Concentration riesgo bajo + bonding normal → continuar a scoring
   └── Concentration riesgo alto → flag para revisión manual
```

### Integración con scoring

```typescript
// Mobula aporta 3 factores al score de riesgo (0-100):
// 1. Concentration penalty: top10 > 30% → -10, > 50% → -25
// 2. Insider penalty: insiders > 10% → -15, > 20% → -30
// 3. Dev penalty: dev holdings > 5% → -10, > 15% → -20

async function calculateMobulaRiskScore(address: string, chain: string) {
  const markets = await mobula.getTokenMarkets(address, chain);
  if (!markets) return null;

  let penalty = 0;

  // Top 10 concentration
  const top10 = markets.top10HoldingsPercentage ?? 0;
  if (top10 > 50) penalty += 25;
  else if (top10 > 30) penalty += 10;

  // Insiders
  const insiders = markets.insidersHoldingsPercentage ?? 0;
  if (insiders > 20) penalty += 30;
  else if (insiders > 10) penalty += 15;

  // Dev holdings
  const dev = markets.devHoldingsPercentage ?? 0;
  if (dev > 15) penalty += 20;
  else if (dev > 5) penalty += 10;

  // Bundlers
  const bundlers = markets.bundlersHoldingsPercentage ?? 0;
  if (bundlers > 25) penalty += 15;

  // Bonding curve — si > 50%, mucho supply está bloqueado
  const bonding = markets.bondingPercentage ?? 0;
  if (bonding > 80) penalty += 5;

  return {
    baseScore: 100,
    penalty,
    finalScore: Math.max(0, 100 - penalty),
    breakdown: {
      top10,
      insiders,
      dev,
      bundlers,
      bonding,
    },
  };
}
// Score final: 80-100 = bajo riesgo, 50-79 = medio, <50 = alto riesgo
```

## Estrategias de optimización

### 1. Cache de concentration metrics

Las métricas de concentración cambian lentamente. Se puede cachear por 5-10 minutos.

```typescript
const concentrationCache = new Map<string, {
  data: MobulaMarketToken;
  timestamp: number;
}>();
const CONCENTRATION_TTL = 300_000; // 5 minutos

async function getCachedConcentration(
  address: string,
  chain: string,
): Promise<MobulaMarketToken | null> {
  const key = `${chain}:${address}`;
  const cached = concentrationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CONCENTRATION_TTL) {
    return cached.data;
  }
  const data = await mobula.getTokenMarkets(address, chain);
  if (data) concentrationCache.set(key, { data, timestamp: Date.now() });
  return data ?? null;
}
```

### 2. Priorizar llamadas según chain

Para chains sin soporte Mobula (ej: Sui, Aptos, Optimism), este provider se salta automáticamente. Solo se llama cuando `chain ∈ ['ethereum', 'bsc', 'base', 'arbitrum', 'polygon', 'solana']`.

### 3. Rate limit awareness

Con 60 req/min, hay que distribuir las llamadas. Si el pipeline procesa muchos tokens, Mobula puede ser el cuello de botella.

```typescript
// Ejemplo: distribuir 60 llamadas/min entre tokens en cola
const MOBULA_RATE = 60; // req/min
const MOBULA_INTERVAL = 60_000 / MOBULA_RATE; // ~1s entre llamadas

async function rateLimitedMobulaCall<T>(
  fn: () => Promise<T>,
): Promise<T> {
  await new Promise(r => setTimeout(r, MOBULA_INTERVAL));
  return fn();
}
```

## Análisis profundo de concentration metrics

### Top 10 Holdings %

Mide el porcentaje del supply total en manos de las 10 wallets más grandes. Es la métrica más básica de concentración.

| Rango | Interpretación | Acción recomendada |
|-------|----------------|--------------------|
| 0-20% | Distribución saludable | Continuar |
| 20-40% | Concentración moderada | Monitorear |
| 40-60% | Alta concentración | Investigar |
| >60% | Extremadamente concentrado | Rechazar token |

### Insider Holdings %

Porcentaje de supply en wallets que Mobula clasifica como "insiders". Esto incluye wallets del equipo, inversores tempranos y wallets vinculadas.

```typescript
// Interpretación de insiders holdings
function interpretInsiders(pct: number | null): string {
  if (pct === null) return 'No disponible';
  if (pct < 3) return '✅ Normal — pocos insiders';
  if (pct < 10) return '⚠️ Moderado — posible riesgo controlado';
  if (pct < 20) return '🔴 Alto — muchos insiders con supply significativo';
  return '🚨 Crítico — el token podría estar controlado por un grupo';
}
```

### Dev Holdings %

Porcentaje en manos de la wallet que desplegó el contrato. Un dev con >10% puede hacer dump en cualquier momento.

### Bundlers Holdings %

Porcentaje comprado en el momento del launch por wallets coordinadas (bundlers). Es común en memecoins y tokens con manipulación de precio inicial.

### Bonding Curve %

Porcentaje del supply que está bloqueado en una bonding curve (típicamente pump.fun). Cuando el bondingPercentage es bajo, significa que la mayor parte del supply ya salió de la curva y está en circulación libre.

### Factory Fingerprinting

El campo `factory` revela qué factory contract creó el token. Esto permite:
- Detectar factories conocidos (UniswapV2, pancakeswap, pumpfun)
- Identificar factories sospechosos
- Correlacionar con riesgos conocidos

```typescript
const KNOWN_FACTORIES: Record<string, { name: string; risk: 'low' | 'medium' | 'high' }> = {
  '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f': { name: 'Uniswap V2', risk: 'low' },
  '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6': { name: 'PancakeSwap V2', risk: 'low' },
  '0x6A2d1E4c1bF66B6E64b1F5fC8D6D3b9b6e8a9b0c': { name: 'PumpFun Factory', risk: 'medium' },
};

function assessFactoryRisk(factory: string | null): string {
  if (!factory) return 'No disponible';
  const known = KNOWN_FACTORIES[factory];
  if (!known) return `⚠️ Factory desconocido: ${factory} — investigar`;
  return `✅ Factory conocido: ${known.name} (riesgo ${known.risk})`;
}
```

## Comparativa con DexScreener

Mobula y DexScreener son complementarios, no sustitutos:

| Aspecto | Mobula | DexScreener |
|---------|--------|-------------|
| Concentration metrics | ✅ Único | ❌ |
| Bonding curve % | ✅ Único | ❌ |
| Factory fingerprinting | ✅ Único | ❌ |
| Cross-chain pairs | ❌ (1 chain por call) | ✅ (automático) |
| Price/liquidity/volume | ✅ | ✅ (más completo) |
| Search | ❌ (sugerido) | ✅ |
| Token profiles/boosts | ❌ | ✅ |
| Rate limit | 60 req/min | 60 req/min |
| API Key | ✅ Requerida | ❌ No requiere |
| Wallet portfolio | ✅ | ❌ |

### Flujo combinado recomendado

```
1. DexScreener → detectar chains + obtener precio/liquidez
2. Mobula → concentration metrics en la chain principal
3. Si concentration es baja → continuar a scoring
4. Si concentration es alta → alertar o rechazar
```

## Referencias

- [Mobula API Docs](https://docs.mobula.io/)
- [Mobula Dashboard](https://mobula.io/dashboard)
- [Mobula API Playground](https://docs.mobula.io/api-playground)
- [Mobula GitHub](https://github.com/mobula)
