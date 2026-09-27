# Mobula provider

Multi-chain (EVM + Solana) market-data adapter. Unique value:
concentration metrics (top-10, insiders, bundlers, dev), bonding-curve
detection, factory fingerprinting (`mobula.service.ts:18-25`). Kind:
`market` (registry: `provider-descriptor.ts:50-62`).

## What it provides

- Markets: price, liquidity, supply + concentration metrics
  (`getTokenMarkets`)
- Wallet: full portfolio with USD values (`getWalletPortfolio`)
- History: price/volume over a time range (`getTokenHistory`)
- Metadata: name, symbol, icon, decimals (`getTokenMetadata`)

`CHAIN_MAP` covers ethereum, bsc, base, arbitrum, polygon, solana
(`mobula.service.ts:34-41`). Only `getTokenMarkets` takes a chain;
history/metadata/portfolio are chain-free in this adapter.

## Base URL

`https://api.mobula.io/api/2` (`mobula.service.ts:16`).

## Auth

`Authorization` header carrying the raw API key on every request
(`mobula.service.ts:84`, `116`, `152`, `177`). Config token
`MOBULA_CONFIG` (`mobula.config.ts:1-5`); `MobulaModule` reads the
`app.mobula` namespace from `ConfigService` and falls back to
`{ apiKey: '' }` (`mobula.module.ts:8-13`). Missing key: constructor
warns `MOBULA_API_KEY missing` (`mobula.service.ts:46-50`) and every
method returns `null` (disabled, never throws). Key source: Mobula
dashboard (`MOBULA_API_KEY`); docs also accept `Bearer <key>` or
`x-api-key`, but this adapter sends the raw key. `onModuleInit` logs
only when a key is present (`mobula.service.ts:53-57`).

## Rate limits

- Registry budget: 60 req/min (`provider-descriptor.ts:50-62`).
- Upstream is plan-based (demo endpoint rate-limited, production key
  raises limits per docs.mobula.io). No client-side throttle here; all
  calls use an 8 s timeout.

## Methods → code

| Method                                 | Code                        | Upstream                                  |
| -------------------------------------- | --------------------------- | ----------------------------------------- |
| `getTokenMarkets(address, blockchain)` | `mobula.service.ts:72-96`   | `GET /token/markets?address=&blockchain=` |
| `getWalletPortfolio(wallet)`           | `mobula.service.ts:107-127` | `GET /wallet/portfolio?wallet=`           |
| `getTokenHistory(address, from?, to?)` | `mobula.service.ts:140-161` | `GET /token/history?address[&from][&to]`  |
| `getTokenMetadata(address)`            | `mobula.service.ts:168-189` | `GET /token/metadata?address=`            |

Types: `mobula.types.ts:1-54` (`MobulaMarketToken`,
`MobulaWalletPortfolio`, `MobulaHistoryEntry`, `MobulaMetadata`).

## Example

Request (`getTokenMarkets`):

```http
GET https://api.mobula.io/api/2/token/markets?address=0xdAC17F958D2ee523a2206206994597C13D831ec7&blockchain=ethereum
Authorization: YOUR_API_KEY
```

Response (unwrapped from `{ data: [{ base }] }`,
`mobula.service.ts:88`):

```json
{
  "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "priceUSD": 1.0,
  "marketCapUSD": 1000000.0,
  "top10HoldingsPercentage": 12.5,
  "insidersHoldingsPercentage": 1.2,
  "bundlersHoldingsPercentage": 0.3,
  "devHoldingsPercentage": 0.8,
  "bondingPercentage": 0.0,
  "factory": "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f"
}
```

## Error modes

All failures collapse to `null` (callers fall through to the next
provider). Proven paths only:

- No API key → `null` before any HTTP (`mobula.service.ts:78`,
  `110`, `145`, `171`); unknown chain → `null` in `getTokenMarkets`
  (`mobula.service.ts:77`).
- HTTP 404 → `null` without logging (markets, metadata:
  `mobula.service.ts:90`, `183`). Portfolio and history have no 404
  fast-path — every throw is debug-logged (`mobula.service.ts:122`,
  `156`).
- Any other throw (401 bad key, 429 rate limit, timeout) → debug log +
  `null` (`mobula.service.ts:91-94`, `122-125`, `156-159`,
  `184-187`).

## Endpoint catalog — exhaustive reference

Verified 2026-09-27 against the official docs index
(`https://docs.mobula.io/llms.txt`) + endpoint pages under
`https://docs.mobula.io/rest-api-reference/endpoint/`. Base:
`https://api.mobula.io/api/2` (demo, rate-limited:
`https://demo-api.mobula.io/api/2`).

Convention: USED-TODAY rows cite the adapter code (ground truth);
AVAILABLE rows cite the official docs-page slug — no guessed REST
paths. Full OpenAPI spec:
`https://github.com/MobulaFi/mobula-api-docs/blob/main/rest-api-reference/openapi.yaml`;
interactive Swagger: `https://api.mobula.io/docs`.

### USED-TODAY (wired in this adapter)

| Adapter method       | Literal HTTP (from code) | Code                        | Docs-nearest                          |
| -------------------- | ------------------------ | --------------------------- | ------------------------------------- |
| `getTokenMarkets`    | `GET /token/markets`     | `mobula.service.ts:80-87`   | `endpoint/token-markets`              |
| `getWalletPortfolio` | `GET /wallet/portfolio`  | `mobula.service.ts:112-119` | `endpoint/wallet-portfolio`           |
| `getTokenHistory`    | `GET /token/history`     | `mobula.service.ts:150-153` | `endpoint/token-price-history` family |
| `getTokenMetadata`   | `GET /token/metadata`    | `mobula.service.ts:173-180` | `endpoint/metadata` (asset metadata)  |

### AVAILABLE — V2 Token (not wired) → gateway needs

| Docs page (`endpoint/…`)                                                                                  | What it returns                                                                                                     | Future gateway need                                           |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `token-details` (GET + POST batch)                                                                        | Full token view: metadata, supply, mcap, volume, holdings, activity                                                 | Single-call snapshot leg (replaces markets+metadata two-call) |
| `token-ath`                                                                                               | ATH/ATL + dates                                                                                                     | ATH field in snapshots, milestone math                        |
| `token-price` / `token-price-post` (batch ≤500)                                                           | Pool-based price + mcap + liquidity, 1 or ≤500 tokens                                                               | Cheap price leg for the batch-50 endpoint                     |
| `token-price-at` / `token-price-at-post`                                                                  | Closest historical price @ unix timestamp                                                                           | 24h/7d/30d evaluation points (call-tracking parity)           |
| `token-security-get`                                                                                      | Holdings, burns, fees, transfer restrictions, holder distribution, contract risk, AI static analysis (verified EVM) | Security-aggregator input (todo 3)                            |
| `token-logo-reuses`                                                                                       | Tokens reusing the same logo bytes                                                                                  | Copycat/impersonation screen                                  |
| `token-price-history`                                                                                     | 24 TWAP points                                                                                                      | Sparklines                                                    |
| `token-ohlcv-history`                                                                                     | Token OHLCV candles                                                                                                 | Candle charts                                                 |
| `token-trades` / `token-trades-enriched` / `token-trade` (by tx hash) / `trades-filters` (batch download) | Trades, enriched swaps, single trade, bulk download                                                                 | Trade tape, buy/sell pressure                                 |
| `token-dev-history`                                                                                       | Deployer fee claims + swaps + transfers, merged feed                                                                | Dev-activity risk signal                                      |
| `token-trader-positions` / `token-holder-positions`                                                       | Top-trader / holder positions + labels                                                                              | Smart-money + concentration                                   |
| `pulse-get` / `pulse-post`                                                                                | Bonded/bonding/newly-launched realtime                                                                              | New-launch discovery feed                                     |

### AVAILABLE — V2 Market Data (not wired) → gateway needs

| Docs page (`endpoint/…`)                                          | What it returns                                            | Future gateway need                |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `market-details`                                                  | Pair/token market detail + activity                        | Pool drill-down                    |
| `market-lighthouse`                                               | Aggregated realtime metrics across chains/DEXes/launchpads | Lighthouse metrics dashboard       |
| `market-ohlcv-history`                                            | Pool/market OHLCV                                          | Pool candles                       |
| `market-trades-pair`                                              | Recent trades per pair                                     | Pair tape                          |
| `market-blockchain-pairs` (+ V1 `GET /1/market/blockchain/pairs`) | Full pair set per chain                                    | Chain-wide discovery scan          |
| `market-cefi-funding-rate`                                        | CeFi funding rate per symbol/exchange                      | Perp-context header (dexter track) |

### AVAILABLE — V2 Wallet (not wired) → gateway needs

| Docs page (`endpoint/…`)                                | What it returns                                                 | Future gateway need       |
| ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| `wallet-holdings`                                       | Holdings, camelCase portfolio + native gas under `0xeeee…`      | Wallet-intelligence suite |
| `wallet-history`                                        | Historical net worth, time-range/chain filters                  | Portfolio curve           |
| `wallet-defi-positions`                                 | DeFi positions across protocols                                 | DeFi exposure             |
| `wallet-trades-v2`                                      | Swaps, single or batch wallets                                  | Swap-activity feed        |
| `wallet-deployer`                                       | Tokens deployed by a wallet + enriched metrics                  | Deployer-risk screen      |
| `wallet-activity`                                       | Transfers + swaps + vault ops (GET 1, POST ≤100 wallets)        | Tracked-wallet feed       |
| `wallet-labels-get` / `wallet-labels-search`            | Labels (pro/smart/fresh/sniper/insider/bundler), reverse lookup | Smart-money tags          |
| `wallet-first-buyers`                                   | Earliest buyers per token                                       | Early-entry signal        |
| `wallet-positions` / `wallet-position` (+PnL, GET/POST) | Enriched positions + PnL                                        | PnL leaderboard           |
| `wallet-positions-history` / `wallet-position-history`  | Closed cycles + realized PnL per (wallet, token)                | Win-rate analytics        |
| `wallet-analysis`                                       | Trading analysis                                                | KOL report-card input     |
| `wallet-funding`                                        | Initial funding source + sender metadata                        | Wallet-graph root         |

### AVAILABLE — V2 Assets / Search / System (not wired) → gateway needs

| Docs page (`endpoint/…`)                        | What it returns                                                 | Future gateway need                       |
| ----------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| `asset-details`                                 | Cross-chain asset view (metadata + market + supply + contracts) | One-call asset card                       |
| `asset-price-history`                           | Historical prices, 1..N assets                                  | Multi-asset curves                        |
| `metadata` / `multi-metadata` (batch)           | Asset metadata incl. fundraising/tokenomics/investors           | Enrichment depth                          |
| `metadata-categories`                           | Categories + mcap + 24h/7d change                               | Category browser                          |
| `all` (V1 `GET /1/all`, 1h cache)               | Full asset list                                                 | Full-list sync (stale-tolerant jobs only) |
| `fast-search` (GET) / `fast-search-post` (POST) | Symbol/name search, POST with pulse-v2-style filters            | Ticker-resolver fallback                  |
| `blockchains`                                   | Supported chains + RPC/explorer/chainIDs/logos                  | Chain-catalog sync                        |
| `system-metadata`                               | Pool types, indexed chains, factories                           | Pair-source allowlist                     |
| `usage`                                         | Per-key REST/WS consumption                                     | Quota monitoring                          |

V1 legacy families (still served; prefer v2 for new code, v1 only as
fallback): market data (market-data, multi-data, pairs, sparklines),
wallet (transactions, history, NFTs), token first-buyers, metadata
(categories, news), assets, search, DeFi bonding pulse, blockchains,
webhooks, feed.

### Explicitly out of scope for market-data v1

Swap quote/execute, Perps (pairs, positions, orders, OHLCV, chart
image), Bridge (alpha), bonding pools/pulse (until launchpad scope is
decided), Prediction Markets (Polymarket stack, alpha), WebSocket
streams (`wss-*`, pulse-stream, token-filters, multi-events — realtime
streaming here is ccxt/Socket.IO under `src/stream/`, P49; Mobula WS
is a future-driver option only), auth-tokens management, webhook
subscriptions. Revisit only with a gateway decision + todo.
