# CoinMarketCap — Data Provider

Provider de market data cripto a través de la API oficial de CoinMarketCap (Pro API). Fuente autoritativa #1 en rankeos y datos de listing.

---

## Visión

Obtiene precios, market cap, volumen, metadata y métricas globales del mercado cripto. Usado en el pipeline para enrichment de tokens conocidos, watchlists, y cuadros de mercado. CoinMarketCap es la fuente más referenciada para rankeos de criptomonedas.

### Tipo de datos que ofrece

- **Market data**: precio, market cap, volumen 24h, fully diluted valuation, cambio % (1h/24h/7d/30d/60d/90d/1y)
- **Metadata**: nombre, símbolo, logo, descripción, fecha de listing, platform (chain nativa), tags, categorías
- **Listings**: listado paginado de todas las criptos rankeadas por market cap
- **Mapa de IDs**: mapping symbol/address → CMC ID estable (no cambia entre listings)
- **Global metrics**: total market cap, BTC dominance, volumen global 24h, altcoin season index, fear & greed
- **Price conversion**: conversión entre cualquier par de criptos/fiat
- **Trending**: gainers/losers, most visited, latest trending, trending tokens en comunidad
- **DEX data**: precios, pairs, orders, transacciones, trending y seguridad de tokens en DEXes
- **Content**: noticias, headlines, top posts de la comunidad
- **Categories**: todas las categorías de tokens con métricas agregadas
- **Airdrops**: listado de airdrops activos con detalle

## Plan actual (Basic — gratuito)

| Límite | Valor |
|--------|-------|
| Plan | **Basic** (gratuito, sin tarjeta) |
| Créditos mensuales | **20,000** (hard cap, se resetea cada mes) |
| Rate limit | **50 requests/minuto** (con API key) |
| Endpoints habilitados | **29** (de ~60+ totales) |
| Conversiones por request | 1 (solo USD) |
| Datos históricos | Limitados |
| OHLCV histórico | No |
| Cache del lado servidor | 60 segundos (la mayoría de endpoints) |

> 💡 Con 20,000 créditos/mes y ~1 crédito por request promedio, puedes hacer ~20,000 requests/mes. Para uso intensivo, planes superiores ofrecen cientos de miles de créditos.

### Comparativa de planes

| Feature | Basic ($0) | Startup ($79) | Builder ($199) | Enterprise (custom) |
|---------|:----------:|:-------------:|:--------------:|:-------------------:|
| Créditos/mes | 20,000 | 200,000 | 600,000 | Custom |
| Rate limit/min | 50 | 100 | 500 | Custom |
| Endpoints | 29 | 36 | 40 | Todos |
| Conversiones/request | 1 (USD) | 10 | 50 | 120 |
| Datos históricos | No | 30 días | 365 días | Full |
| OHLCV histórico | No | No | Sí | Full |
| Callbacks/Push | No | No | Sí | Sí |
| Precio anual | — | $632 (-20%) | $1,599 (-20%) | Custom |

## Endpoints implementados en el servicio

| Método service | Endpoint | Créditos | Descripción |
|----------------|----------|:--------:|-------------|
| `getQuotesLatest(symbol[])` | `GET /v3/cryptocurrency/quotes/latest` | 1/100 cryptos | Precios y market data de 1+ criptos |
| `getInfo(symbol[])` | `GET /v2/cryptocurrency/info` | **0** | Metadata (logo, descripción, URLs) |
| `getListingsLatest(limit)` | `GET /v1/cryptocurrency/listings/latest` | 1/200 cryptos | Listado rankeado por market cap |
| `getMap()` | `GET /v1/cryptocurrency/map` | **0** | Mapping symbol/address → CMC ID |
| `priceConversion(amount, symbol)` | `GET /v2/tools/price-conversion` | 1 | Conversión entre criptos/fiat |
| `getGlobalMetrics()` | `GET /v1/global-metrics/quotes/latest` | 1 | Métricas globales del mercado |

### Response types (implementadas)

```typescript
// CmcQuote — quote en USD de un token
{
  price: number;                        // Precio actual USD
  volume_24h: number;                   // Volumen 24h USD
  percent_change_1h: number;            // Cambio 1h %
  percent_change_24h: number;           // Cambio 24h %
  percent_change_7d: number;            // Cambio 7d %
  market_cap: number;                   // Market cap USD
  fully_diluted_market_cap: number;     // FDV USD
  last_updated: string;                 // ISO timestamp
}

// CmcListing — entrada en listings
{
  id: number;
  name: string;                         // "Bitcoin"
  symbol: string;                       // "BTC"
  slug: string;                         // "bitcoin"
  cmc_rank: number;                     // Ranking CMC
  quote: Record<string, CmcQuote>;      // quotes por fiat
}

// CmcGlobalMetrics
{
  total_market_cap: Record<string, number>;
  total_volume_24h: Record<string, number>;
  btc_dominance: number;
  eth_dominance: number;
  active_cryptocurrencies: number;
}
```

## Todos los endpoints disponibles en Basic (29 endpoints)

### Cryptocurrency API (19 endpoints, 14 en Basic)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/cryptocurrency/map` | **0** | Basic | Mapping de símbolos/addresses a CMC ID |
| 2 | `GET /v3/cryptocurrency/listings/latest` | 1/200 | Basic | Listado rankeado de todas las criptos activas |
| 3 | `GET /v1/cryptocurrency/listings/new` | — | Startup**+** | Criptos recién añadidas |
| 4 | `GET /v1/cryptocurrency/listings/historical` | — | Basic**+** | Snapshot histórico diario del ranking |
| 5 | `GET /v3/cryptocurrency/quotes/latest` | 1/100 | Basic | Precios y market data de 1+ criptos |
| 6 | `GET /v3/cryptocurrency/quotes/historical` | Varía | Basic | Precios históricos |
| 7 | `GET /v2/cryptocurrency/ohlcv/latest` | 1 | Basic | OHLCV (velas) del día actual |
| 8 | `GET /v2/cryptocurrency/ohlcv/historical` | — | Builder | OHLCV histórico |
| 9 | `GET /v2/cryptocurrency/market-pairs/latest` | 1 | Basic | Market pairs de un token |
| 10 | `GET /v2/cryptocurrency/price-performance-stats/latest` | 1 | Basic | Estadísticas de rendimiento de precio |
| 11 | `GET /v2/cryptocurrency/info` | **0** | Basic | Metadata (logo, descripción, URLs) |
| 12 | `GET /v1/cryptocurrency/trending/latest` | 1 | Basic | Trending coins del momento |
| 13 | `GET /v1/cryptocurrency/trending/gainers-losers` | 1 | Basic | Top gainers y losers |
| 14 | `GET /v1/cryptocurrency/trending/most-visited` | 1 | Basic | Más visitados en CMC |
| 15 | `GET /v1/simple/price` | 1 | Basic | Precio simple (ligero, 1+ criptos) |
| 16 | `GET /v1/cryptocurrency/categories` | 1 | Basic | Todas las categorías con métricas |
| 17 | `GET /v1/cryptocurrency/category` | 1 | Basic | Detalle de una categoría |
| 18 | `GET /v1/cryptocurrency/airdrops` | 1 | Basic | Listado de airdrops activos |
| 19 | `GET /v1/cryptocurrency/airdrop` | 1 | Basic | Detalle de un airdrop |

### Exchange API (7 endpoints, ninguno en Basic)

| # | Endpoint | Plan mínimo | Descripción |
|---|----------|:-----------:|-------------|
| 1 | `GET /v1/exchange/map` | Startup | Mapa de exchanges |
| 2 | `GET /v1/exchange/info` | Startup | Metadata de exchanges |
| 3 | `GET /v1/exchange/listings/latest` | Startup | Exchanges rankeados por volumen |
| 4 | `GET /v1/exchange/market-pairs/latest` | Startup | Market pairs de un exchange |
| 5 | `GET /v1/exchange/quotes/latest` | Startup | Quotes de exchange |
| 6 | `GET /v1/exchange/quotes/historical` | Startup | Quotes históricas |
| 7 | `GET /v1/exchange/assets` | Startup | Proof-of-reserves |

### Global Metrics API (6 endpoints, todos en Basic)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/global-metrics/quotes/latest` | 1 | Basic | Global market metrics |
| 2 | `GET /v1/global-metrics/quotes/historical` | Varía | Basic | Global metrics históricas |
| 3 | `GET /v1/global-metrics/fear-and-greed/latest` | 1 | Basic | Fear & Greed Index |
| 4 | `GET /v1/global-metrics/fear-and-greed/historical` | Varía | Basic | Fear & Greed histórico |
| 5 | `GET /v1/global-metrics/altcoin-season-index/latest` | 1 | Basic | Altcoin Season Index |
| 6 | `GET /v1/global-metrics/altcoin-season-index/historical` | Varía | Basic | Altcoin Season Index histórico |

### Tools / Utilities API (4 endpoints)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/fiat/map` | 1 | Basic | Mapa de fiat currencies |
| 2 | `GET /v1/key/info` | 1 | Basic | Info del API key (plan, usage) |
| 3 | `GET /v2/tools/price-conversion` | 1 | Basic | Conversión entre criptos/fiat |
| 4 | `GET /v1/tools/postman` | 0 | Basic | Postman collection |

### Content API (4 endpoints, disponibles en Basic)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/content/latest` | 1 | Basic | Últimas noticias/headlines |
| 2 | `GET /v1/content/top-posts` | 1 | Basic | Top posts de CMC Community |
| 3 | `GET /v1/content/comments` | 1 | Basic | Comentarios |
| 4 | `GET /v1/content/news` | 1 | Basic | News feed |

### Community API (2 endpoints, ambos en Basic)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/community/trending/topics` | 1 | Basic | Trending topics |
| 2 | `GET /v1/community/trending/tokens` | 1 | Basic | Trending tokens en comunidad |

### CMC Index API (4 endpoints, todos en Basic)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/index/cmc100/latest` | 1 | Basic | CMC 100 Index |
| 2 | `GET /v1/index/cmc100/historical` | 1 | Basic | CMC 100 histórico |
| 3 | `GET /v1/index/cmc20/latest` | 1 | Basic | CMC 20 Index |
| 4 | `GET /v1/index/cmc20/historical` | 1 | Basic | CMC 20 histórico |

### DEX Data API — Token (16 endpoints, 6 en Basic)

| # | Endpoint | Créditos | Plan | Descripción |
|---|----------|:--------:|:----:|-------------|
| 1 | `GET /v1/dex/token/lookup` | 1 | Basic | DEX token lookup |
| 2 | `GET /v1/dex/token/prices/latest` | 1 | Basic | DEX token prices |
| 3 | `GET /v1/dex/token/pairs/latest` | 1 | Basic | DEX token pairs |
| 4 | `GET /v1/dex/token/orders/latest` | 1 | Basic | DEX token orders |
| 5 | `GET /v1/dex/token/transactions/latest` | 1 | Basic | DEX token transactions |
| 6 | `GET /v1/dex/token/trending/latest` | 1 | Basic | DEX trending tokens |
| 7 | `GET /v1/dex/token/security` | — | Startup+ | DEX token security |
| 8+ | Resto endpoints DEX | — | Builder+ | — |

### Derivatives API (3 endpoints, ninguno en Basic)

| # | Endpoint | Plan mínimo | Descripción |
|---|----------|:-----------:|-------------|
| 1 | `GET /v1/derivatives/exchange/listings/latest` | Startup | Derivatives exchange listings |
| 2 | `GET /v1/derivatives/exchange/quotes/latest` | Startup | Derivatives quotes |
| 3 | `GET /v1/derivatives/exchange/quotes/historical` | Startup | Derivatives historical |

## Cuánto dura 20,000 créditos?

| Endpoint | Créditos | Requests posibles | Escenario |
|----------|:--------:|:-----------------:|-----------|
| `/v2/cryptocurrency/info` | **0** | ∞ (50 req/min) | Metadata de cualquier token |
| `/v1/cryptocurrency/map` | **0** | ∞ (50 req/min) | Mapping symbo→ID |
| `/v3/cryptocurrency/quotes/latest` | 1/100 | ~20,000 | Quotes de 100 tokens cada vez |
| `/v1/cryptocurrency/listings/latest` | 1/200 | ~20,000 | Listados de 200 tokens |
| `/v1/global-metrics/quotes/latest` | 1 | ~20,000 | Métricas globales |
| `/v2/tools/price-conversion` | 1 | ~20,000 | Conversiones |
| `/v1/cryptocurrency/trending/latest` | 1 | ~20,000 | Trending |
| Mix típico del pipeline | ~3 | ~6,666 | Enriquecimientos completos |

### Estrategia para maximizar créditos

1. **Endpoints gratuitos (0 créditos)**: `/info`, `/map` — llamar sin restricción
2. **Batch en quotes**: pasar 100 symbols en un `/quotes/latest` por 1 crédito
3. **Cache de 60s**: CMC cachea por 60s, no llamar el mismo endpoint más de 1 vez/minuto
4. **Monitorear con `/key/info`**: ver créditos restantes con 1 crédito
5. **Startup cuesta $79/mes por 200k créditos** — 10× más que Basic

## Autenticación

- **Header**: `X-CMC_PRO_API_KEY`
- **Formato**: API key string (se obtiene de [pro.coinmarketcap.com](https://pro.coinmarketcap.com))
- **Keyless**: Endpoints marcados como "Available with no API key" pueden llamarse prefixando con `/public-api/` (sin key, con rate limit reducido a 30 req/min y 10,000 créditos/mes)
- **Plan asociado**: la API key define el plan y los créditos disponibles

### Ejemplo curl

```bash
# Quotes de BTC y ETH
curl -s --request GET \
  --url 'https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest?symbol=BTC,ETH&convert=USD' \
  --header 'X-CMC_PRO_API_KEY: YOUR_API_KEY'

# Metadata de SOL
curl -s --request GET \
  --url 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?symbol=SOL' \
  --header 'X-CMC_PRO_API_KEY: YOUR_API_KEY'

# Price conversion
curl -s --request GET \
  --url 'https://pro-api.coinmarketcap.com/v2/tools/price-conversion?amount=1&symbol=BTC&convert=USD' \
  --header 'X-CMC_PRO_API_KEY: YOUR_API_KEY'
```

## Chains soportadas

CoinMarketCap es **chain-agnostic** — opera a nivel de activo/criptomoneda, no de chain individual. Cada token tiene un campo `platform` que indica su chain nativa:
- `platform.name`: "Ethereum", "BNB Smart Chain", "Solana", etc.
- `platform.symbol`: "ETH", "BNB", "SOL", etc.
- `platform.token_address`: dirección del contrato en esa chain

Esto permite buscar tokens por address en lugar de symbol: `/v1/cryptocurrency/map?address=0x...`

## Rate limits

| Límite | Basic (key) | Basic (keyless) | Startup | Builder | Enterprise |
|--------|:-----------:|:---------------:|:-------:|:-------:|:----------:|
| Requests/min | 50 | 30 | 100 | 500 | Custom |
| Créditos/mes | 20,000 | 10,000 | 200,000 | 600,000 | Custom |
| Conversiones | 1 (USD) | 1 (USD) | 10 | 50 | 120 |

### Headers de rate limit en response

```http
X-CMC_PRO_API_KEY: YOUR_KEY
X-CMC_PRO_MAX_CREDITS: 20000
X-CMC_PRO_CREDITS_USED: 342
X-CMC_PRO_CREDITS_LEFT: 19658
X-CMC_PRO_CREDITS_RESET: 2025-06-01T00:00:00Z
```

## Uso crediticio detallado

### Reglas de crédito

- **Endpoints de 0 créditos**: `/v1/cryptocurrency/map`, `/v2/cryptocurrency/info` — llamadas ilimitadas dentro del rate limit de 50 req/min
- **1 crédito base**: la mayoría de endpoints cobran 1 crédito por request
- **Créditos adicionales por `convert`**: cada moneda extra en `convert` suma 1 crédito adicional
- **Créditos en listings**: 1 crédito por cada 200 resultados (listings latest)
- **Créditos en quotes**: 1 crédito por cada 100 cryptos en una llamada (v3)
- **Créditos extras en queries**: 1 crédito extra por cada `aux` field solicitado (opcional)

### Cálculo de créditos por operación del pipeline

| Operación | Endpoints | Créditos |
|-----------|-----------|:--------:|
| Enriquecimiento simple | quotes (1) + info (0) | **1 crédito** |
| Enriquecimiento completo | quotes (1) + info (0) + listings (1) | **2 créditos** |
| Global metrics | global-metrics (1) | **1 crédito** |
| Price conversion | price-conversion (1) | **1 crédito** |
| Trending check | trending (1) | **1 crédito** |
| Batch de 100 tokens | quotes con 100 symbols (1) | **1 crédito** |
| Análisis completo del mercado | quotes (1) + global (1) + listings (1) + trending (1) | **4 créditos** |

## Manejo de errores

### Tabla de códigos de error CMC

| HTTP | error_code | Significado | Acción |
|------|:----------:|-------------|--------|
| 400 | — | Parámetros inválidos | Revisar payload y tipos |
| 401 | 1001 | API key inválida | Verificar API key |
| 401 | 1002 | API key faltante | Agregar header |
| 403 | 1003 | Plan no activo (payment required) | Revisar suscripción |
| 403 | 1004 | Plan cancelado | Renovar suscripción |
| 403 | 1005 | IP no whitelisted | Configurar IP whitelist |
| 403 | 1006 | Endpoint no disponible en tu plan | Ver plan mínimo del endpoint |
| 429 | 1007 | Sin créditos disponibles | Esperar al próximo mes o upgradear |
| 429 | 1008 | Rate limit por minuto excedido | Esperar 1 minuto (50 req/min) |
| 429 | 1009 | Rate limit diario excedido | Esperar al próximo día |
| 429 | 1010 | Rate limit mensual excedido | Esperar al próximo mes |
| 429 | 1011 | Rate limit por segundo excedido | Limitar concurrencia |
| 500 | — | Error interno del servidor | Retry después de 1s |

### Estrategia de retry recomendada

```typescript
async function cmcFetch<T>(
  url: string,
  apiKey: string,
  retries = 3,
): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'X-CMC_PRO_API_KEY': apiKey },
        timeout: 8_000,
      });
      if (data.status?.error_code && data.status.error_code !== 0) {
        console.error(`CMC error [${data.status.error_code}]: ${data.status.error_message}`);
        return null;
      }
      return data.data;
    } catch (err) {
      if (attempt === retries - 1) return null;
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 429 || status === 500 || status === 503) {
          const delay = 1000 * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      return null;
    }
  }
  return null;
}
```

## Cache

Los datos de la mayoría de endpoints se refrescan cada **60 segundos** del lado del servidor. No hay control de cache configurable desde el cliente. Implicaciones:

- No llamar el mismo endpoint con los mismos parámetros más de 1 vez por minuto
- Si necesitas datos más frescos, usar endpoints con `convert=USD` (no cacheado?)
- Para datos en tiempo real, considerar WebSocket o Alchemy como alternativa

## Métodos sugeridos para agregar al servicio

| Método service sugerido | Endpoint | Créditos | Para qué sirve |
|-------------------------|----------|:--------:|----------------|
| `getTrendingLatest()` | `GET /v1/cryptocurrency/trending/latest` | 1 | Tokens trending del momento |
| `getGainersLosers()` | `GET /v1/cryptocurrency/trending/gainers-losers` | 1 | Top gainers/losers 24h |
| `getMostVisited()` | `GET /v1/cryptocurrency/trending/most-visited` | 1 | Más visitados en CMC |
| `getFiatMap()` | `GET /v1/fiat/map` | 1 | Mapa de fiat currencies |
| `getOHLCV(symbol)` | `GET /v2/cryptocurrency/ohlcv/latest` | 1 | OHLCV diario de un token |
| `getMarketPairs(symbol)` | `GET /v2/cryptocurrency/market-pairs/latest` | 1 | Market pairs de un token |
| `getPriceStats(symbol)` | `GET /v2/cryptocurrency/price-performance-stats/latest` | 1 | Estadísticas de precio |
| `getSimplePrice(symbol)` | `GET /v1/simple/price` | 1 | Precio simple (sin metadata extra) |
| `getKeyInfo()` | `GET /v1/key/info` | 1 | Info del API key (plan, créditos, usage) |
| `getFearAndGreed()` | `GET /v1/global-metrics/fear-and-greed/latest` | 1 | Fear & Greed Index |
| `getCategories()` | `GET /v1/cryptocurrency/categories` | 1 | Categorías de tokens |
| `getAirdrops()` | `GET /v1/cryptocurrency/airdrops` | 1 | Airdrops activos |
| `getCommunityTrending()` | `GET /v1/community/trending/tokens` | 1 | Trending en comunidad |
| `getDexPrices(address)` | `GET /v1/dex/token/prices/latest` | 1 | Precios DEX de un token |
| `searchDexPairs(address)` | `GET /v1/dex/token/pairs/latest` | 1 | Pairs DEX de un token |

## Ejemplos de uso

### Uso básico del service

```typescript
import { CoinMarketCapService } from 'data-provider/coinmarketcap';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Obtener precio de Bitcoin y Ethereum (1 crédito por 100 cryptos)
const quotes = await cmcService.getQuotesLatest(['BTC', 'ETH', 'SOL', 'DOGE']);
if (quotes) {
  for (const [symbol, data] of Object.entries(quotes)) {
    console.log(`${symbol}: $${data.quote['USD'].price}`);
    console.log(`  24h: ${data.quote['USD'].percent_change_24h}%`);
    console.log(`  MCap: $${data.quote['USD'].market_cap}`);
  }
}

// 2. Listar top 10 por market cap (1 crédito)
const top10 = await cmcService.getListingsLatest(10);
if (top10) {
  for (const coin of top10) {
    console.log(`#${coin.cmc_rank} ${coin.name} (${coin.symbol})`);
    console.log(`  Price: $${coin.quote['USD'].price}`);
    console.log(`  MCap: $${coin.quote['USD'].market_cap}`);
  }
}

// 3. Metadata de tokens (0 créditos — gratuito)
const info = await cmcService.getInfo(['SOL', 'ETH']);
if (info) {
  for (const [symbol, data] of Object.entries(info)) {
    console.log(`${symbol}: ${data.name}`);
    console.log(`  Logo: ${data.logo}`);
    console.log(`  Description: ${data.description?.slice(0, 100)}...`);
    console.log(`  Category: ${data.category}`);
    console.log(`  Date added: ${data.date_added}`);
  }
}

// 4. Global metrics (1 crédito)
const global = await cmcService.getGlobalMetrics();
if (global) {
  console.log(`Total market cap: $${global.total_market_cap['USD']}`);
  console.log(`Total volume 24h: $${global.total_volume_24h['USD']}`);
  console.log(`BTC dominance: ${global.btc_dominance}%`);
  console.log(`ETH dominance: ${global.eth_dominance}%`);
  console.log(`Active cryptocurrencies: ${global.active_cryptocurrencies}`);
}

// 5. Price conversion (1 crédito)
const conv = await cmcService.priceConversion(1, 'BTC', 'USD');
if (conv) {
  console.log(`1 BTC = $${conv.quote['USD'].price}`);
}

// 6. Obtener mapa de todas las criptos (0 créditos)
const map = await cmcService.getMap();
if (map) {
  console.log(`Total cryptocurrencies tracked: ${map.length}`);
  // Útil para obtener CMC IDs y usarlos en quotes
  const solana = map.find(c => c.symbol === 'SOL');
  console.log(`SOL CMC ID: ${solana?.id}`);
}
```

### Uso en enrichment del pipeline

```typescript
// El pipeline de enrichment usa CMC para enriquecer tokens conocidos
// con market data de referencia.

async function enrichWithCMC(symbol: string) {
  // 1. Metadata (0 créditos)
  const info = await cmcService.getInfo(symbol);
  
  // 2. Quote actual (1 crédito — 100 symbols por request)
  const quote = await cmcService.getQuotesLatest(symbol);
  
  if (!quote || !quote[symbol]) return null;
  
  const q = quote[symbol].quote['USD'];
  return {
    name: info?.[symbol]?.name,
    logo: info?.[symbol]?.logo,
    description: info?.[symbol]?.description,
    price: q.price,
    marketCap: q.market_cap,
    fdv: q.fully_diluted_market_cap,
    volume24h: q.volume_24h,
    change1h: q.percent_change_1h,
    change24h: q.percent_change_24h,
    change7d: q.percent_change_7d,
  };
}
// Costo: 1 crédito por token enriquecido
// Con 20,000 créditos/mes → ~20,000 enriquecimientos
```

### Integración con price alerts

```typescript
// Monitorear precio de BTC cada 5 minutos (1 crédito cada vez)
// Con 20,000 créditos/mes → ~4,166 días de monitoreo continuo ❌ MUCHO

// Estrategia: batch de 100 symbols por request (1 crédito)
const WATCHLIST = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT'];
const prices = await cmcService.getQuotesLatest(WATCHLIST);
// 1 crédito para 8 tokens — monitorear cada 5 min = 288 requests/día
// = 288 créditos/día = ~69 días de monitoreo continuo ✅
```

### Monitoreo de créditos restantes

```typescript
// Verificar créditos restantes via /v1/key/info
// No implementado en el service actual, pero útil:

async function checkCredits(apiKey: string): Promise<{
  plan: string;
  creditsLeft: number;
  creditsUsed: number;
  creditsMax: number;
} | null> {
  try {
    const { data } = await axios.get(
      'https://pro-api.coinmarketcap.com/v1/key/info',
      { headers: { 'X-CMC_PRO_API_KEY': apiKey } },
    );
    if (data?.data) {
      const plan = data.data.plan;
      return {
        plan: plan.name,
        creditsLeft: plan.credit_limit - plan.credits_used,
        creditsUsed: plan.credits_used,
        creditsMax: plan.credit_limit,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Ejemplo: Basic plan → 20,000 - usage = credits left
```

### Errores comunes y debugging

```typescript
// Error 403 / 1006 — endpoint no disponible en Basic
// Síntoma: el endpoint devuelve 403 Forbidden
// Causa: el endpoint requiere plan Startup+ (ej: /exchange/*)
// Solución: solo usar endpoints marcados como Basic en la tabla

// Error 429 / 1007 — sin créditos
// Síntoma: todas las requests devuelven 429
// Causa: se alcanzó el límite de 20,000 créditos del mes
// Solución: esperar al próximo mes o upgradear a Startup

// Error 429 / 1008 — rate limit por minuto
// Síntoma: requests fallan después de muchas llamadas rápidas
// Causa: 50 requests/minuto excedido
// Solución: implementar throttle con delay de 1.2s entre requests
```

## Diferencia entre /v1 y /v3

CMC tiene versiones mixtas de endpoints:

| Versión | Endpoint | Diferencia |
|---------|----------|------------|
| `/v1/cryptocurrency/listings/latest` | Listings v1 | Retorna array plano |
| `/v3/cryptocurrency/listings/latest` | Listings v3 | Misma data, estructura más rica |
| `/v1/cryptocurrency/quotes/latest` | Quotes v1 (deprecated) | Retorna objeto por ID |
| `/v3/cryptocurrency/quotes/latest` | Quotes v3 | Retorna objeto por symbol |
| `/v1/cryptocurrency/info` | Info v1 | Metadata básica |
| `/v2/cryptocurrency/info` | Info v2 | Metadata extendida |

En el service actual usamos las versiones recomendadas (v3 para quotes, v2 para info).

## Referencias

- [CoinMarketCap API Docs v1](https://coinmarketcap.com/api/documentation/v1/)
- [CoinMarketCap API Changelog](https://coinmarketcap.com/api/changelog/)
- [Pro API Portal](https://pro.coinmarketcap.com/)
- [Pricing Plans](https://coinmarketcap.com/api/pricing/)
- [Error Codes](https://coinmarketcap.com/api/documentation/v1/#section/Errors)
- [Best Practices](https://coinmarketcap.com/api/documentation/v1/#section/Best-Practices)
