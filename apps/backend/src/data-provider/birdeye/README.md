# Birdeye — Data Provider

Provider de market data DEX a través de la API oficial de Birdeye (Data Services). Fuente principal para datos de tokens en Solana y multi-chain.

---

## Visión

Obtiene precios, liquidez, volumen, traders, holders, metadata, transfers y tendencias de tokens en exchanges descentralizados (DEX). Usado principalmente para:

- **Token overview**: precio, liquidez, market cap, holders, supply, metadata
- **Price discovery**: precio actual, histórico, OHLCV, price volume
- **Trades y actividad**: swaps recientes, buy/sell pressure, top traders
- **Trending detection**: tokens trending por rank/liquidity/volumen
- **Security check**: análisis básico de seguridad del token
- **Holder analytics**: distribución, transfers
- **Wallet data (beta)**: portfolio, net worth, PnL, transaction history (solo Solana)

## Plan actual (Standard — $0)

| Límite | Valor |
|--------|-------|
| Plan | **Standard** (gratuito) |
| Compute Units (CU) por mes | **30,000** (hard cap) |
| Rate limit | **1 request/segundo** |
| Endpoints habilitados | **Limitados** (~25 endpoints) |
| APIs batch / multiple | No |
| WebSocket | No |
| Costo CU adicional | No disponible (hard cap) |

> ⚠️ **30,000 CU/mes es muy limitado.** Con un promedio de ~20 CU por request, solo ~1,500 requests/mes. Para uso en producción se recomienda al menos **Lite ($39/mes, 1.5M CU, 15 rps)**.

### Comparativa de planes

| Feature | Standard ($0) | Lite ($39) | Starter ($99) | Premium ($199) | Business ($499) |
|---------|:------------:|:----------:|:-------------:|:--------------:|:--------------:|
| CU/mes | 30,000 | 1,500,000 | 5,000,000 | 15,000,000 | 60,000,000 |
| Rate limit | 1 rps | 15 rps | 15 rps | 50 rps | 100 rps |
| APIs "multiple" | ❌ | ❌ | ❌ | ❌ | ✅ |
| WebSocket | ❌ | ❌ | ❌ | ✅ (500 conns) | ✅ (2000 conns) |
| Costo CU extra | — | $23/M | $19.9/M | $9.9/M | $6.9/M |
| Wallet APIs | Beta (limit 5 rps / 75 rpm) | ✅ | ✅ | ✅ | ✅ |

---

## Endpoints disponibles en Standard ($0)

### Price & OHLCV (9 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 1 | `GET /defi/price` | **3** | ✅ | Precio actual de un token |
| 2 | `GET /defi/history_price` | **45** | ✅ | Precio histórico (por intervalo) |
| 3 | `GET /defi/historical_price_unix` | **6** | ✅ | Precio histórico por unix time (solo Solana) |
| 4 | `GET /defi/price_volume/single` | **8** | ✅ | Price + volume de un token |
| 5 | `GET /defi/price_volume/multi` | Batch | ❌ | Price + volume de múltiples tokens |
| 6 | `GET /defi/ohlcv` | **35** | ✅ | OHLCV velas |
| 7 | `GET /defi/ohlcv/pair` | **35** | ✅ | OHLCV por pair |
| 8 | `GET /defi/ohlcv/base_quote` | **35** | ✅ | OHLCV base/quote |
| 9 | `GET /defi/v3/ohlcv` | Dynamic | ✅ | OHLCV v3 (dynamic CU) |
| 10 | `GET /defi/v3/ohlcv/pair` | Dynamic | ✅ | OHLCV v3 pair (dynamic CU) |

### Stats (8 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 11 | `GET /defi/token_overview` | **25** | ✅ | Overview completo del token |
| 12 | `GET /defi/v3/token/market-data` | **12** | ✅ | Market data del token |
| 13 | `GET /defi/v3/token/meta-data/single` | **5** | ✅ | Metadata del token |
| 14 | `GET /defi/v3/token/trade-data/single` | **12** | ❌ | Trading data |
| 15 | `GET /defi/v3/token/exit-liquidity` | **15** | ✅ | Exit liquidity |
| 16 | `GET /defi/v3/price/stats/single` | **8** | ✅ | Price stats |
| 17 | `GET /defi/v3/pair/overview/single` | **15** | ✅ | Pair overview (solo Solana) |
| 18 | `GET /defi/v3/pair/overview/multiple` | Batch | ❌ | Pair overview batch |

### Token / Market List (5 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 19 | `GET /defi/v3/token/list` | **75** | ✅ | Lista de tokens rankeados (solo Solana) |
| 20 | `GET /defi/v2/markets` | **30** | ✅ | Market list |
| 21 | `GET /defi/v2/tokens/new_listing` | **30** | ✅ | Nuevos listings |
| 22 | `GET /defi/tokenlist` | **30** | ✅ | Token list |
| 23 | `GET /defi/v3/token/list/scroll` | **400** | ❌ | Token list con scroll |

### Transactions (9 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 24 | `GET /defi/v3/token/txs` | **15** | ✅ | Trades de un token (V3) |
| 25 | `GET /defi/v3/txs` | **20** | ✅ | Todas las trades (V3) |
| 26 | `GET /defi/v3/txs/recent` | Dynamic | ✅ | Trades recientes (V3) |
| 27 | `GET /defi/txs/token` | **10** | ✅ | Trades por token |
| 28 | `GET /defi/txs/pair` | **10** | ✅ | Trades por pair |
| 29 | `GET /defi/txs/token/seek_by_time` | **10** | ❌ | Trades por token + tiempo |
| 30 | `GET /defi/txs/pair/seek_by_time` | **10** | ❌ | Trades por pair + tiempo |
| 31 | `GET /trader/txs/seek_by_time` | **10** | ✅ | Trades por trader + tiempo |
| 32 | `GET /defi/v3/token/txs-by-volume` | **50** | ❌ | Txs filtradas por volumen |

### Wallet / Networth / PnL (11 endpoints — Solana)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 33 | `GET /wallet/v2/current-net-worth` | **40** | ✅ | Net worth actual (Solana) |
| 34 | `GET /wallet/v2/net-worth` | **50** | ✅ | Net worth chart (Solana) |
| 35 | `GET /wallet/v2/net-worth-details` | **50** | ✅ | Net worth details (Solana) |
| 36 | `GET /wallet/v2/pnl/summary` | **30** | ✅ | PnL summary (Solana) |
| 37 | `GET /wallet/v2/pnl/details` | **40** | ✅ | PnL details (Solana) |
| 38 | `GET /wallet/v2/pnl` | Batch | ❌ | PnL múltiple |
| 39 | `GET /defi/v2/tokens/top_traders` | **30** | ✅ | Top traders de un token |
| 40 | `GET /trader/gainers-losers` | **30** | ✅ | Gainers/Losers |
| 41 | `GET /v1/wallet/token_list` | **60** | ❌ | Wallet portfolio (beta) |
| 42 | `GET /v1/wallet/tx_list` | **60** | ❌ | Wallet tx history (beta) |
| 43 | `GET /v1/wallet/list_supported_chain` | **1** | ✅ | Supported chains |
| 44 | `GET /v1/wallet/simulate` | — | ❌ | Transaction simulation |

### Holder (2 endpoints — Solana)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 45 | `GET /defi/v3/token/holder` | **40** | ✅ | Holders de un token (Solana) |
| 46 | `GET /holder/v1/distribution` | **35** | ✅ | Distribución de holders (Solana) |

### Balance & Transfer (6 endpoints — Solana)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 47 | `GET /wallet/v2/balance-change` | **10** | ✅ | Balance change (Solana) |
| 48 | `GET /wallet/v2/token-balance` | Batch | ❌ | Token balance batch |
| 49 | `POST /token/v1/transfer` | **10** | ✅ | Token transfers (Solana) |
| 50 | `POST /token/v1/transfer/total` | **1** | ✅ | Total transfers count (Solana) |
| 51 | `POST /wallet/v2/transfer` | **10** | ✅ | Wallet transfers (Solana) |
| 52 | `POST /wallet/v2/transfer/total` | **1** | ✅ | Total wallet transfer count (Solana) |
| 53 | `GET /v1/wallet/token_balance` | **5** | ❌ | Wallet token balance (beta) |

### Blockchain (2 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 54 | `GET /defi/networks` | **1** | ✅ | Supported networks |
| 55 | `GET /defi/v3/txs/latest-block` | **1** | ✅ | Latest block (Solana) |

### Creation / Trending (2 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 56 | `GET /defi/token_creation_info` | **50** | ❌ | Token creation info (Solana) |
| 57 | `GET /defi/token_trending` | **40** | ✅ | Trending tokens |

### Meme (2 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 58 | `GET /defi/v3/token/meme/detail/single` | **25** | ✅ | Meme token detail |
| 59 | `GET /defi/v3/token/meme/list` | **50** | ✅ | Meme token list |

### Search & Utils (2 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 60 | `GET /defi/v3/search` | **40** | ✅ | Search tokens/markets |
| 61 | `GET /utils/v1/credits` | **1** | ✅ | Credits usage |

### Security (1 endpoint)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 62 | `GET /defi/token_security` | **40** | ✅ | Token security check |

### Perps Data (8 endpoints)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 63 | `GET /perps/v1/token/list` | **10** | ❌ | Perps token list |
| 64 | `GET /perps/v1/token/overview` | **5** | ❌ | Perps token overview |
| 65 | `GET /perps/v1/token/open_positions` | **5** | ❌ | Perps open positions |
| 66 | `GET /perps/v1/token/liquidation_map` | **10** | ❌ | Perps liquidation map |
| 67 | `GET /perps/v1/wallet/list` | **10** | ❌ | Perps wallet list |
| 68 | `GET /perps/v1/wallet/overview` | **5** | ❌ | Perps wallet overview |
| 69 | `GET /perps/v1/wallet/open_positions` | **5** | ❌ | Perps wallet positions |

### Alltime History (1 endpoint)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 70 | `GET /defi/v3/all-time/trades/single` | **20** | ✅ | All-time trade stats |
| 71 | `GET /defi/v3/all-time/trades/multiple` | Batch | ❌ | All-time trades batch |

### Mint/Burn (1 endpoint — Solana)

| # | Endpoint | CU | Disponible | Descripción |
|---|----------|----|:----------:|-------------|
| 72 | `GET /defi/v3/token/mint-burn-txs` | **20** | ✅ | Mint/burn transactions |

---

## Endpoints implementados en el servicio

| Método service | Endpoint | CU | Descripción |
|----------------|----------|----|-------------|
| `getTokenOverview(address, chain?)` | `GET /defi/token_overview` | **25** | Overview: precio, liquidez, mc, holders, metadata |
| `getTokenPrice(address)` | `GET /defi/price` | **3** | Precio actual + update time |
| `getTokenTrades(address, limit?)` | `GET /defi/txs/token` | **10** | Swaps recientes (buy/sell) |

### Response types

```typescript
// BirdeyeTokenOverviewData
{
  address: string;
  price: number | null;        // precio actual USD
  priceChange24h: number | null; // cambio 24h %
  volume24h: number | null;    // volumen 24h USD
  liquidity: number | null;    // liquidez USD
  mc: number | null;           // market cap USD
  totalSupply: number | null;  // supply total
  holder: number | null;       // cantidad de holders
  decimals: number | null;     // decimales del token
  name: string | null;         // nombre
  symbol: string | null;       // símbolo
}

// BirdeyePriceData
{
  value: number;               // precio USD
  updateUnixTime: number;      // timestamp unix
  updateHumanTime: string;     // fecha legible
}

// BirdeyeTokenTrade
{
  txHash: string;
  blockUnixTime: number;
  type: 'buy' | 'sell';
  price: number;
  volume: number;
  mint: string;
}
```

### Métodos sugeridos para agregar

| Método service sugerido | Endpoint | CU | Para qué sirve |
|-------------------------|----------|----|----------------|
| `getTokenTrending(chain, sortBy?, limit?)` | `GET /defi/token_trending` | 40 | Tokens trending del momento |
| `getTokenSecurity(address, chain?)` | `GET /defi/token_security` | 40 | Análisis de seguridad |
| `getTokenHolders(address)` | `GET /defi/v3/token/holder` | 40 | Lista de holders (Solana) |
| `getTokenTxsV3(address, chain?)` | `GET /defi/v3/token/txs` | 15 | Trades con más metadata |
| `getHistoryPrice(address, type, timeFrom, timeTo?)` | `GET /defi/history_price` | 45 | Precio histórico |
| `getOHLCV(address, type, timeFrom, timeTo?)` | `GET /defi/ohlcv` | 35 | Velas OHLCV |
| `getTokenMetadata(address, chain?)` | `GET /defi/v3/token/meta-data/single` | 5 | Metadata (name, symbol, decimals, logo) |
| `getTokenMarketData(address, chain?)` | `GET /defi/v3/token/market-data` | 12 | Market data detallado |
| `getTokenTrending(chain)` | `GET /defi/token_trending` | 40 | Trending tokens |
| `getNewListings(chain?)` | `GET /defi/v2/tokens/new_listing` | 30 | Nuevos tokens listados |
| `getTokenList(chain, limit?)` | `GET /defi/v3/token/list` | 75 | Listado rankeado |
| `getPriceVolumeSingle(address)` | `GET /defi/price_volume/single` | 8 | Precio + volume juntos |
| `getGainersLosers(chain)` | `GET /trader/gainers-losers` | 30 | Gainers/losers |
| `getTopTraders(address)` | `GET /defi/v2/tokens/top_traders` | 30 | Top traders |
| `getTokenMintBurn(address)` | `GET /defi/v3/token/mint-burn-txs` | 20 | Mint/burn txs (Solana) |
| `getPriceStatsSingle(address)` | `GET /defi/v3/price/stats/single` | 8 | Price stats |
| `getTokenExitLiquidity(address)` | `GET /defi/v3/token/exit-liquidity` | 15 | Exit liquidity |
| `getAllTimeTrades(address, chain?)` | `GET /defi/v3/all-time/trades/single` | 20 | All-time trade stats |
| `getSearch(query, chain?)` | `GET /defi/v3/search` | 40 | Buscar tokens |
| `getMemeList(chain, sortBy?, limit?)` | `GET /defi/v3/token/meme/list` | 50 | Meme tokens list |
| `getNetWorth(wallet)` | `GET /wallet/v2/current-net-worth` | 40 | Net worth de wallet (Solana) |
| `getPnLSummary(wallet)` | `GET /wallet/v2/pnl/summary` | 30 | PnL de wallet (Solana) |
| `getHolderDistribution(address)` | `GET /holder/v1/distribution` | 35 | Holder distribution (Solana) |
| `getTokenTransfers(address)` | `POST /token/v1/transfer` | 10 | Token transfers (Solana) |
| `getCredits()` | `GET /utils/v1/credits` | 1 | Credits restantes |

---

## Endpoints NO disponibles en Standard

### Por falta de plan (requieren Lite+ o Business+)

| Endpoint | CU | Plan mínimo | Razón de uso |
|----------|----|:-----------:|--------------|
| `POST /defi/multi_price` | Batch | Lite | Precios de múltiples tokens |
| `POST /defi/price_volume/multi` | Batch | Business | Price volume batch |
| `POST /defi/v3/token/meta-data/multiple` | Batch | Lite | Metadata batch |
| `POST /defi/v3/token/market-data/multiple` | Batch | Business | Market data batch |
| `POST /defi/v3/token/trade-data/multiple` | Batch | Business | Trade data batch |
| `GET /defi/v2/tokens/all` | — | Business | Todos los tokens |
| `POST /defi/v3/token/exit-liquidity/multiple` | Batch | Business | Exit liquidity batch |
| `POST /defi/v3/price/stats/multiple` | Batch | Business | Price stats batch |
| `POST /token/v1/holder/batch` | Batch | Business | Holder batch |
| `POST /wallet/v2/pnl/multiple` | Batch | Business | PnL múltiple |
| `POST /wallet/v2/net-worth-summary/multiple` | Batch | Business | Net worth batch |
| `POST /wallet/v2/token-balance` | Batch | Business | Token balance batch |
| `POST /wallet/v2/tx/first-funded` | Batch | Business | First funded tx batch |

### WebSocket (Premium+)

| Evento | CUPB | Plan mínimo | Descripción |
|--------|:----:|:-----------:|-------------|
| `SUBSCRIBE_PRICE (OHLCV)` | — | Premium | Precios en tiempo real |
| `SUBSCRIBE_TXS` | 0.0004 | Premium | Transacciones real-time |
| `SUBSCRIBE_TOKEN_NEW_LISTING` | 0.08 | Premium | Nuevos listings |
| `SUBSCRIBE_NEW_PAIR` | 0.05 | Premium | Nuevos pairs |
| `SUBSCRIBE_LARGE_TRADE_TXS` | 0.006 | Premium | Grandes trades |
| `SUBSCRIBE_WALLET_TXS` | 0.004 | Premium | Wallet txs |
| `SUBSCRIBE_TOKEN_STATS` | 0.004 | Premium | Token stats |
| `SUBSCRIBE_BASE_QUOTE_PRICE` | 0.003 | Premium | Pair price |
| `SUBSCRIBE_MEME` | 0.002 | Premium | Meme data |
| `SUBSCRIBE_TRANSFER` | 0.00008 | Premium | Transfer data |

---

## Autenticación

- **Header**: `X-API-KEY` (obligatorio)
- **Header**: `x-chain` (default: `solana`)
- **Base URL**: `https://public-api.birdeye.so`
- **Formato response**: siempre `{ success: boolean, data: T | null, message?: string }`

### Ejemplo curl

```bash
curl -s --request GET \
  --url 'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112' \
  --header 'X-API-KEY: YOUR_API_KEY' \
  --header 'x-chain: solana'
```

---

## Chains soportadas (14)

| # | Chain | x-chain value | Disponibilidad |
|---|-------|---------------|:-------------:|
| 1 | **Solana** | `solana` | ✅ Full |
| 2 | **Ethereum** | `ethereum` | ✅ Price + OHLCV + Overview |
| 3 | **Arbitrum** | `arbitrum` | ✅ Price + OHLCV + Overview |
| 4 | **Avalanche** | `avalanche` | ✅ Price + OHLCV + Overview |
| 5 | **BNB Chain** | `bsc` | ✅ Price + OHLCV + Overview |
| 6 | **Optimism** | `optimism` | ✅ Price + OHLCV + Overview |
| 7 | **Polygon** | `polygon` | ✅ Price + OHLCV + Overview |
| 8 | **Base** | `base` | ✅ Price + OHLCV + Overview |
| 9 | **zkSync** | `zksync` | ✅ Price + OHLCV + Overview |
| 10 | **Sui** | `sui` | ✅ Price + overview (sin mc/supply, sin wallet APIs) |
| 11 | **Monad** | `monad` | ✅ Price + OHLCV + Overview |
| 12 | **MegaETH** | `megaeth` | ✅ Price + OHLCV + Overview |
| 13 | **Fogo** | `fogo` | ✅ Price + OHLCV + Overview |
| 14 | **Aptos** | `aptos` | ✅ Price + OHLCV + Overview |

> ⚠️ Endpoints wallet (v1/wallet/*, wallet/v2/*) y holder (holder/*, token/v1/holder/*) son **solo Solana**.

---

## Compute Units — resumen completo

### Por categoría

| Categoría | CU promedio | Endpoints |
|-----------|:-----------:|-----------|
| **Muy baratos** | 1-5 CU | `price` (3), `metadata` (5), `historical_price_unix` (6), `networks` (1), `latest-block` (1), `credits` (1), `transfer/total` (1) |
| **Baratos** | 8-12 CU | `price_volume/single` (8), `price/stats` (8), `txs/token` (10), `txs/pair` (10), `market-data` (12), `trade-data` (12) |
| **Medios** | 15-30 CU | `exit-liquidity` (15), `pair/overview` (15), `token/txs` (15), `txs` V3 (20), `mint-burn` (20), `alltime-trades` (20), `token_overview` (25), `tokenlist` (30), `markets` (30), `new_listing` (30), `top_traders` (30), `gainers-losers` (30), `pnl/summary` (30) |
| **Caros** | 35-50 CU | `ohlcv` (35), `holder/distribution` (35), `token/list` (75), `trending` (40), `holder` (40), `security` (40), `search` (40), `net-worth` (40), `net-worth-details` (50), `creation_info` (50), `meme/list` (50), `txs-by-volume` (50), `history_price` (45) |
| **Muy caros** | 400 CU | `token/list/scroll` (400) |
| **Batch** | N^0.8 × base | `multi_price`, `meta-data/multiple`, etc. |

### Costo real de operaciones del pipeline

| Operación | Endpoints llamados | CU total |
|-----------|-------------------|:--------:|
| Precio de un token | `price` (3) | **3 CU** |
| Overview completo | `token_overview` (25) | **25 CU** |
| Precio + metadata + trades | `price` (3) + `meta-data/single` (5) + `txs/token` (10) | **18 CU** |
| Trending + overview | `token_trending` (40) + `token_overview` (25) por token | **65+ CU** |
| Security check | `token_security` (40) | **40 CU** |
| Holder analysis | `token/holder` (40) + `holder/distribution` (35) | **75 CU** |
| OHLCV chart | `ohlcv` (35) | **35 CU** |
| Precio histórico | `history_price` (45) | **45 CU** |

### Uso proyectado mensual (30,000 CU gratis)

| Escenario | CU/request | Requests/mes estimados | ¿Alcanza? |
|-----------|:----------:|:---------------------:|:---------:|
| Solo `price` (3 CU) | 3 CU | ~10,000 | ⚠️ Borde |
| Solo `token_overview` (25 CU) | 25 CU | ~1,200 | ❌ Muy limitado |
| Enriquecimiento típico (18 CU) | 18 CU | ~1,666 | ❌ Limitado |
| Pipeline completo (price+overview+trades = 38 CU) | 38 CU | ~789 | ❌ Muy limitado |
| Mix de operaciones varias (~20 CU prom.) | 20 CU | ~1,500 | ❌ Limitado |

> 💡 **Recomendación**: Con 1 rps y 30,000 CU, el plan Standard solo sirve para desarrollo/pruebas. Para producción mínima se necesita **Lite ($39/mes, 1.5M CU, 15 rps)**.

---

## Manejo de errores

| HTTP | `success` | Significado | Acción |
|------|:---------:|-------------|--------|
| 400 | `false` | Invalid request parameters | Revisar payload/params |
| 401 | `false` | API key missing/invalid | Verificar `X-API-KEY` header |
| 403 | `false` | Access denied (blacklisted/not whitelisted) | Endpoint no disponible en tu plan |
| 422 | `false` | Invalid data | Revisar formato de datos |
| 429 | `false` | Rate limit exceeded | Esperar y retry |
| 500 | `false` | Internal server error | Retry después de 1s |

**Response error siempre tiene formato:**
```json
{
  "success": false,
  "message": "Descripción del error"
}
```

### Estrategia de retry recomendada

```typescript
async function birdeyeFetch<T>(
  url: string,
  apiKey: string,
  retries = 3,
): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'X-API-KEY': apiKey, 'x-chain': 'solana' },
        timeout: 5_000,
      });
      if (!data.success) return null;
      return data.data;
    } catch (err) {
      if (attempt === retries - 1) return null;
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      return null;
    }
  }
  return null;
}
```

---

## Rate limits

| Límite | Standard | Lite/Starter | Premium | Business |
|--------|:--------:|:------------:|:-------:|:--------:|
| Requests por segundo | **1** | 15 | 50 | 100 |
| CU mensuales | 30,000 | 1.5M / 5M | 15M | 60M+ |
| Wallet API (rpm) | 75 | 75 | 75 | 75 |

> El rate limit es **por cuenta**, no por API individual. Las Wallet APIs tienen un límite más restrictivo de **30 rpm** (5 rps).

---

## Tipos de datos que ofrece

### Market Data

- **Price**: precio actual, histórico, OHLCV, price volume, price stats
- **Liquidity**: liquidez actual, exit liquidity
- **Volume**: volumen 24h, volumen por pair
- **Market Cap**: fully diluted, actual
- **Supply**: total supply, circulating
- **Holders**: cantidad, distribución, transferencias

### Metadata

- **Token**: name, symbol, decimals, logo URI
- **Pair**: base/quote, exchange, pair address
- **Contract**: address, creator, creation info

### Activity

- **Trades**: swaps buy/sell, precio, volumen, txHash, timestamp
- **Transfers**: token transfers, wallet transfers
- **Mint/Burn**: emisión y quema de tokens
- **Trending**: tokens trending por rank, liquidity o volumen

### Wallet (Solana)

- **Portfolio**: token list, balances, net worth, net worth chart
- **PnL**: profit/loss summary, details, histórico
- **Transactions**: tx list, transfers, balance changes
- **Simulation**: simular transacciones

### Security

- **Token Security**: análisis de riesgo, honeypot, mint authority, freeze authority, top holders concentration

---

## Ejemplos de uso

### Uso básico del service

```typescript
import { BirdeyeService } from 'data-provider/birdeye';

// El servicio se inyecta automáticamente (DataProviderModule es @Global)

// 1. Obtener overview de un token en Solana
const overview = await birdeye.getTokenOverview(
  'So11111111111111111111111111111111111111112', // wSOL
  'solana',
);
if (overview) {
  console.log(`${overview.name} (${overview.symbol})`);
  console.log(`Price: $${overview.price}`);
  console.log(`Market Cap: $${overview.mc}`);
  console.log(`Liquidity: $${overview.liquidity}`);
  console.log(`Volume 24h: $${overview.volume24h}`);
  console.log(`Holders: ${overview.holder}`);
}

// 2. Obtener precio actual
const price = await birdeye.getTokenPrice(
  'So11111111111111111111111111111111111111112',
);
if (price) {
  console.log(`Price: $${price.value} (updated: ${price.updateHumanTime})`);
}

// 3. Obtener trades recientes (swaps)
const trades = await birdeye.getTokenTrades(
  'So11111111111111111111111111111111111111112',
  10,
);
if (trades) {
  for (const trade of trades.items) {
    const action = trade.type === 'buy' ? '🟢 BUY' : '🔴 SELL';
    console.log(`${action} ${trade.volume} SOL @ $${trade.price}`);
    console.log(`  TX: ${trade.txHash}`);
  }
}
```

### Uso en enrichment

```typescript
// El pipeline de enrichment usa Birdeye para market data de tokens en Solana.

async function enrichSolanaToken(address: string) {
  // 1. Obtener precio (3 CU)
  const price = await birdeye.getTokenPrice(address);

  // 2. Obtener overview completo (25 CU)
  const overview = await birdeye.getTokenOverview(address, 'solana');

  // 3. Obtener trades recientes para ver actividad (10 CU)
  const trades = await birdeye.getTokenTrades(address, 20);

  // Total CU: 3 + 25 + 10 = 38 CU por enriquecimiento
  // Con 30,000 CU/mes Standard → solo ~789 enriquecimientos

  return {
    price: price?.value,
    priceChange24h: overview?.priceChange24h,
    volume24h: overview?.volume24h,
    liquidity: overview?.liquidity,
    marketCap: overview?.mc,
    holders: overview?.holder,
    name: overview?.name,
    symbol: overview?.symbol,
    recentBuys: trades?.items.filter(t => t.type === 'buy').length ?? 0,
    recentSells: trades?.items.filter(t => t.type === 'sell').length ?? 0,
  };
}
```

### Uso con multi-chain

```typescript
// Birdeye soporta 14 chains. El header x-chain cambia según la chain.

const ethAddress = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH

// Ethereum
const ethOverview = await birdeye.getTokenOverview(ethAddress, 'ethereum');

// Base
const baseOverview = await birdeye.getTokenOverview(ethAddress, 'base');

// Polygon
const polygonOverview = await birdeye.getTokenOverview(ethAddress, 'polygon');

// Arbitrum
const arbOverview = await birdeye.getTokenOverview(ethAddress, 'arbitrum');
```

### Cálculo de CU

```typescript
// Plan Standard: 30,000 CU/mes, 1 rps
const MONTHLY_CU = 30_000;

// Escenario: monitoreo de precios de 10 tokens cada 5 minutos
const CU_PER_CHECK = 3;  // solo /defi/price
const CHECKS_PER_DAY = (24 * 60) / 5;  // 288 checks
const CU_PER_DAY = CU_PER_CHECK * CHECKS_PER_DAY * 10;  // 8,640 CU/día
const CU_PER_MONTH = CU_PER_DAY * 30;  // 259,200 CU/mes ❌

// → Se necesita Lite ($39/mes, 1.5M CU) para este escenario.

// Escenario: enrichment de 50 tokens/día (38 CU c/u)
const CU_PER_ENRICHMENT = 38;  // price + overview + trades
const CU_PER_DAY = CU_PER_ENRICHMENT * 50;  // 1,900 CU/día
const CU_PER_MONTH = CU_PER_DAY * 30;  // 57,000 CU/mes ❌
// → 30,000 no alcanza ni para 800 enriquecimientos.

// 💡 Recomendación: usar /defi/price (3 CU) para checks rápidos
// y solo llamar token_overview (25 CU) cuando sea necesario.
```

---

## Sugerencias para el Standard ($0)

Dado que 30,000 CU/mes y 1 rps son muy limitados, aquí hay estrategias para maximizar el uso:

### 1. Priorizar endpoints baratos

| Endpoint | CU | Para qué |
|----------|:--:|----------|
| `GET /defi/price` | **3** | Precio rápido |
| `GET /defi/v3/token/meta-data/single` | **5** | Metadata (name, symbol, decimals) |
| `GET /defi/historical_price_unix` | **6** | Precio histórico puntual |
| `GET /defi/price_volume/single` | **8** | Precio + volumen |
| `GET /defi/v3/price/stats/single` | **8** | Price stats |
| `GET /defi/txs/token` | **10** | Trades recientes |

### 2. Cache agresivo

```typescript
// Cache LRU simple para evitar llamadas duplicadas
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 60_000; // 1 minuto

async function getCachedPrice(address: string): Promise<number | null> {
  const cached = priceCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }
  const price = await birdeye.getTokenPrice(address);
  if (price) {
    priceCache.set(address, { price: price.value, timestamp: Date.now() });
  }
  return price?.value ?? null;
}
```

### 3. Usar /defi/price_volume/single en vez de price + overview

`price_volume/single` (8 CU) devuelve precio + volumen en una sola llamada, mientras que `price` (3 CU) + `token_overview` (25 CU) gastarían 28 CU.

### 4. Monitorear CU usage

```typescript
// GET /utils/v1/credits (1 CU) — consultar credits restantes
async function getRemainingCredits(): Promise<number | null> {
  const response = await birdeye['get']<{ credits: number }>('/utils/v1/credits');
  return response?.credits ?? null;
}
```

### 5. Considerar upgrade a Lite

Por **$39/mes** se obtiene:
- **1,500,000 CU** (50× más que Standard)
- **15 rps** (15× más rápido)
- Acceso a APIs "multiple" limitadas
- Todos los endpoints de datos disponibles

Esto permite ~40,000 enriquecimientos completos/mes vs ~789 en Standard.

---

## Referencias

- [Birdeye Docs](https://docs.birdeye.so/)
- [Pricing](https://docs.birdeye.so/docs/pricing)
- [Data Accessibility by Packages](https://docs.birdeye.so/docs/data-accessibility-by-packages)
- [Compute Unit Cost](https://docs.birdeye.so/docs/compute-unit-cost)
- [Batch Token CU Cost](https://docs.birdeye.so/docs/batch-token-cu-cost)
- [API Reference](https://docs.birdeye.so/reference)
- [Supported Networks](https://docs.birdeye.so/docs/supported-networks)
- [Rate Limiting](https://docs.birdeye.so/docs/rate-limiting)
- [Error Handling](https://docs.birdeye.so/docs/error-handling)
