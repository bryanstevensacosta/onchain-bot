# Birdeye provider

> Cost: KEYED (`BIRDEYE_API_KEY`) — fallback tier `keyed`. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

Solana-focused market-data adapter (price, overview incl. holders,
recent swaps). Kind: `market` (registry: `provider-descriptor.ts:44-49`).

> Catalog verified against official docs on **2026-09-27**
> (endpoint index: `https://docs.birdeye.so/llms.txt` via
> `https://data.birdeye.so/docs/llms.txt`; method pages under
> `https://docs.birdeye.so/reference/*` and
> `https://data.birdeye.so/docs/data-api/*`).
> Sections marked **USED-TODAY** are wired in `birdeye.service.ts`
> (cross-checked 2026-09-27); sections marked **AVAILABLE** are
> docs-cited upstream endpoints NOT yet wired — candidates for future
> gateway/aggregator work. No endpoint below is invented: every entry
> names its official reference page.

## What it provides

- Price: current token price + update timestamps (`getTokenPrice`)
- Overview: price, 24 h change, volume, liquidity, market cap, supply,
  holder count, decimals, name/symbol (`getTokenOverview`)
- Trades: recent swaps (`getTokenTrades`)

No security (`/defi/token_security`) or holder-list data — only the three
endpoints above. Holder count comes from the overview aggregate.

## Base URL

`https://public-api.birdeye.so` (`birdeye.service.ts:13`).

## Auth

`X-API-KEY` + `x-chain` headers on every request
(`birdeye.service.ts:66`, `96`, `133`). Config token `BIRDEYE_CONFIG`
(`birdeye.config.ts:1-5`); `BirdeyeModule` reads the `app.birdeye`
namespace from `ConfigService` and falls back to `{ apiKey: '' }`
(`birdeye.module.ts:8-13`). Missing key: constructor warns
`BIRDEYE_API_KEY missing` (`birdeye.service.ts:33-37`) and every method
returns `null` (disabled, never throws). Default chain: `solana`.

All REST endpoints share this auth (key from the `Security` tab at
`bds.birdeye.so`, sent in the `X-API-KEY` header) and the
`{ success, data }` envelope. Supported `x-chain` values include
`solana`, `ethereum`, `arbitrum`, `avalanche`, `bsc`, `optimism`,
`polygon`, `base`, `zksync`, `monad`, `hyperevm`, `aptos`, `fogo`,
`mantle`, `megaeth`, `robinhood`, `sui` (chain support varies per
endpoint — e.g. `/defi/token_security` covers all chains except Sui).

## Rate limits

- Registry budget: 60 req/min (`provider-descriptor.ts:44-49`).
- Upstream per-endpoint limits (docs.birdeye.so `per-api-rate-limit`):
  `/defi/price` 300 rps, `/defi/token_overview` 300 rps. No client-side
  throttle here; all calls use an 8 s timeout.
- Upstream cost is per-request compute units (CU): `/defi/token_overview`
  15 CU, `/defi/token_security` 25 CU, `/defi/tokenlist` (V1) 30 CU.
  Errors are standard HTTP: 400 / 401 (missing or invalid key) /
  403 (blacklisted) / 429 (rate limit) / 500.

## USED-TODAY — Methods → code

Every row cross-checked with `birdeye.service.ts` on 2026-09-27.

| Method                                    | Code                         | Upstream                                                                 | SnapshotQuote / gateway need                                                                                                                                         |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getTokenOverview(address, chain?)`       | `birdeye.service.ts:56-78`   | `GET /defi/token_overview?address=`                                      | `priceUsd`, `marketCapUsd`, `liquidityUsd`, `volume24hUsd`, `holders`, `symbol`, `name` → kind=token snapshots (`GET /api/v1/addresses/:chain/:address`, batch POST) |
| `getTokenPrice(address, chain?)`          | `birdeye.service.ts:86-107`  | `GET /defi/price?address=`                                               | `priceUsd` fast path → compat `GET /api/market-data/snapshot`                                                                                                        |
| `getTokenTrades(address, chain?, limit?)` | `birdeye.service.ts:116-144` | `GET /defi/txs/token?address=&limit=&offset=0&txType=swap&sortType=desc` | trade-activity signal → future trade-data fields on the snapshot                                                                                                     |

## Example

Request (`getTokenPrice`):

```http
GET https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112
X-API-KEY: YOUR_API_KEY
x-chain: solana
```

Response (unwrapped from `{ success, data }`, `birdeye.service.ts:100-101`):

```json
{
  "success": true,
  "data": {
    "value": 172.44,
    "updateUnixTime": 1727443200,
    "updateHumanTime": "2024-09-27T12:00:00"
  }
}
```

## AVAILABLE — Full upstream catalog (not wired)

Same base URL, same `X-API-KEY` (+ `x-chain` where chain-scoped) auth,
same `{ success, data }` envelope unless noted. Reference pages:
`https://docs.birdeye.so/reference/<slug>` and
`https://data.birdeye.so/docs/data-api/<family>/<slug>`.

### A. Price & OHLCV

Docs: `data-api/price-ohlcv/*`.

| Method + path                                   | Key params                                                          | Response shape                        | Gateway need (future)                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `GET /defi/multi_price`                         | `list_address` (≤100 tokens)                                        | map address → price                   | batch price leg of `POST /api/v1/addresses/batch` (50-cap, one call) |
| `POST /defi/multi_price`                        | body: address list (≤100)                                           | map address → price                   | same as above (POST variant)                                         |
| `GET /defi/history_price`                       | `address`, `address_type`, `type` (interval), `time_from/to`        | price line-chart series               | sparkline / 24 h-7 d-30 d price checks for call-tracking consumers   |
| `GET /defi/historical_price_unix`               | `address`, `unixtime`                                               | price at closest time                 | point-in-time valuation (publish-time price, milestone math)         |
| `GET /defi/ohlcv` (legacy)                      | `address`, `type` (1m…1M), `time_from/to`, `currency?` (usd/native) | `{ o,h,l,c,v,vUsd,unixTime }[]` ≤1000 | charting for Dexter / data dashboard (todos 7, 9)                    |
| `GET /defi/ohlcv/pair` (legacy)                 | `address` (pair), `type`, `time_from/to`                            | pair candles ≤1000                    | pair-level charts                                                    |
| `GET /defi/ohlcv/base_quote`                    | base + quote addresses, `type`, `time_from/to`                      | aggregated base/quote candles ≤1000   | cross-market charts                                                  |
| `GET /defi/v3/ohlcv`                            | token + `type` incl. 1s/15s/30s, `time_from/to` or `count_limit`    | candles ≤5000, no padding             | high-resolution charts + backfill                                    |
| `GET /defi/v3/ohlcv/pair`                       | pair + same V3 params                                               | pair candles ≤5000                    | high-resolution pair charts                                          |
| `GET /defi/price_volume/single`                 | `address`, time window                                              | compact price + volume                | lightweight snapshot refresh when full OHLCV is overkill             |
| `POST /defi/price_volume/multi`                 | address list (≤50)                                                  | compact price + volume × N            | batch lightweight refresh                                            |
| `GET /defi/v3/liquidity/ohlc/pair` (Solana)     | pair, resolution                                                    | liquidity OHLC (TVL, balances, USD)   | execution-quality / LP analytics                                     |
| `GET /defi/v3/liquidity/ohlc/token` (Solana)    | token, resolution (1m/4h/1D)                                        | total/exit/stable liquidity OHLC ≤100 | `liquidityUsd` trend for snapshots                                   |
| `GET /defi/v3/liquidity/history/token` (Solana) | token, resolution                                                   | liquidity snapshots ≤100              | same as above (snapshot form)                                        |
| `POST /defi/v3/liquidity/latest/token` (Solana) | 1 address (Lite) / ≤100 (Starter+)                                  | latest total/exit/stable liquidity    | `liquidityUsd` + `lockedLiquidityPercent` inputs                     |

### B. Stats & market data (V3 splits of the overview)

Docs: `data-api/stats/*`.

| Method + path                                | Key params             | Response shape                              | Gateway need (future)                                     |
| -------------------------------------------- | ---------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `GET /defi/v3/token/meta-data/single`        | `address`              | identity + metadata links                   | `symbol`/`name` without the full overview cost            |
| `GET /defi/v3/token/meta-data/multiple`      | ≤50 addresses          | metadata × N                                | batch identity leg                                        |
| `GET /defi/v3/token/market-data`             | `address`              | market-cap/FDV/supply/liquidity/price slice | `marketCapUsd`, `fdvUsd`, `liquidityUsd` targeted fetch   |
| `GET /defi/v3/token/market-data/multiple`    | ≤20 addresses          | market slice × N                            | batch market leg                                          |
| `GET /defi/v3/token/trade-data/single`       | `address`              | trade stats slice                           | trade-activity fields on the snapshot                     |
| `GET /defi/v3/token/trade-data/multiple`     | ≤20 addresses          | trade slice × N                             | batch trade leg                                           |
| `GET /defi/v3/token/exit-liquidity`          | `address` (USD/native) | exit-liquidity value                        | `lockedLiquidityPercent` input (real vs listed liquidity) |
| `GET /defi/v3/token/exit-liquidity/multiple` | ≤50 addresses          | exit liquidity × N                          | batch version                                             |
| `GET /defi/v3/pair/overview/single`          | pair address           | pair stats                                  | pair-gated scoring inputs                                 |
| `GET /defi/v3/pair/overview/multiple`        | ≤20 pairs              | pair stats × N                              | batch version                                             |
| `GET /defi/v3/price/stats/single`            | `address`, timeframe   | current/high/low + change %                 | `priceChange24h` without the overview                     |
| `POST /defi/v3/price/stats/multiple`         | ≤20 tokens             | price stats × N                             | batch version                                             |

### C. Token / market lists (discovery)

Docs: `data-api/tokenmarket-list/*`.

| Method + path                     | Key params                                                                                                                         | Response shape            | Gateway need (future)                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------ |
| `GET /defi/v3/token/list`         | filters: liquidity/mcap/FDV/holders/listing-time/volume/price-change; `limit` ≤100, `offset` ≤10000; `sort_by` (default liquidity) | ranked token rows         | alpha screener / discovery gateway (40+ filters) |
| `GET /defi/v3/token/list/scroll`  | same filters + `scroll_id` (≤5000/batch, 1 scroll per 30 s)                                                                        | bulk token rows           | back-office bulk scan jobs                       |
| `GET /defi/tokenlist` (V1, 30 CU) | `sort_by` (mc/v24hUSD/v24hChangePercent/liquidity), `limit` 1–50, `min_liquidity` default 100                                      | light token rows          | lightweight ranked lists / registry preload      |
| `GET /defi/v2/tokens/new_listing` | chain, `limit`                                                                                                                     | newly listed tokens       | new-launch discovery (sniper input, todo 9)      |
| `GET /defi/v2/markets`            | token address                                                                                                                      | all markets for the token | cross-DEX price scanner input                    |

### D. Transactions (V3 + legacy)

Docs: `data-api/transactions/*`.

| Method + path                               | Key params                                 | Response shape            | Gateway need (future)                           |
| ------------------------------------------- | ------------------------------------------ | ------------------------- | ----------------------------------------------- |
| `GET /defi/v3/token/txs`                    | token + filters                            | filtered token trades     | successor of USED-TODAY `getTokenTrades`        |
| `GET /defi/v3/txs`                          | chain-wide filters                         | filtered trades           | whale / large-trade tracker                     |
| `GET /defi/v3/txs/recent`                   | chain                                      | recent trades             | live-tape gateway                               |
| `GET /defi/txs/pair`                        | pair, `limit/offset`, `txType`, `sortType` | pair trades               | pair-level flow                                 |
| `GET /defi/txs/token/seek_by_time`          | token + time bounds                        | time-bounded token trades | backfill trade windows                          |
| `GET /defi/txs/pair/seek_by_time`           | pair + time bounds                         | time-bounded pair trades  | backfill pair windows                           |
| `GET /trader/txs/seek_by_time`              | trader + time bounds                       | trader trades             | KOL-wallet / smart-money flow                   |
| `GET /defi/v3/token/txs/by_volume`          | token + volume filter                      | size-filtered trades      | whale-print detection                           |
| `GET /defi/v3/token/mint_burn_txs` (Solana) | token                                      | mint/burn list            | supply-integrity signal (`burnedPercent` input) |

### E. Wallet, net worth & PnL

Docs: `data-api/wallet-networth-pnl/*`.

| Method + path                                | Key params                | Response shape                                | Gateway need (future)                |
| -------------------------------------------- | ------------------------- | --------------------------------------------- | ------------------------------------ |
| `GET /v2/wallet/portfolio`                   | wallet                    | holdings + total value                        | KOL-wallet intel / portfolio gateway |
| `GET /v2/wallet/net_worth`                   | wallet, granularity       | historical net worth                          | equity-curve panels                  |
| `POST /v2/wallet/net_worth_summary/multiple` | ≤100 wallets              | current net worth × N                         | batch wallet screen                  |
| `GET /v2/wallet/pnl_summary`                 | wallet                    | PnL, win rate, cash flow, realized/unrealized | smart-money scoring                  |
| `POST /v2/wallet/pnl_details`                | wallet                    | per-token PnL detail                          | copy-trading inputs                  |
| `GET /v2/wallet/pnl` / `.../pnl/multiple`    | wallet(s) + token         | per-token / per-wallet PnL                    | same as above, both directions       |
| `GET /defi/v2/tokens/top_traders`            | token, rank by volume/PnL | top traders (+ holder stats on Solana)        | smart-money-on-token gateway         |
| `GET /trader/gainers_losers`                 | filters + trader score    | top gainers/losers                            | leaderboard gateway                  |
| `GET /v1/wallet/list_supported_chain`        | —                         | supported chains                              | chain-coverage check                 |
| `GET /v1/wallet/tx_list` (beta)              | wallet                    | tx history                                    | wallet-activity feed                 |
| `GET /v1/wallet/token_list` (beta)           | wallet                    | portfolio (beta)                              | holdings (beta)                      |

### F. Balance & transfer

Docs: `data-api/balance-transfer/*`.

| Method + path                                     | Key params          | Response shape         | Gateway need (future)      |
| ------------------------------------------------- | ------------------- | ---------------------- | -------------------------- |
| `GET /v2/wallet/balance_change`                   | wallet              | balance-change history | wallet-activity signal     |
| `POST /v2/wallet/token_balance`                   | wallet + token list | balances per token     | holdings check             |
| `POST /token/v1/transfer`                         | token               | transfer history       | distribution-flow analysis |
| `POST /token/v1/transfer_total`                   | token               | transfer count         | activity gauge             |
| `POST /v2/wallet/transfer` / `.../transfer_total` | wallet              | transfers / total      | wallet-flow feed           |

### G. Holder analytics (the `holders` upgrade path)

Docs: `data-api/holder/*`. Mostly Solana-focused.

| Method + path                                      | Key params                                                    | Response shape                                                         | Gateway need (future)                                              |
| -------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /defi/v3/token/holder` (Solana)               | token, `mode` (account/wallet), `limit` ≤100, `offset` ≤10000 | top holders (per-account or per-wallet)                                | `holders` + `top10HolderPercent` — replaces the overview aggregate |
| `POST /token/v1/holder_batch`                      | wallet-owner list                                             | balances held per wallet                                               | concentration check across watched wallets                         |
| `GET /holder/v1/distribution`                      | token, supply-% bands, `include_list?`                        | distribution stats (+ wallets)                                         | concentration / rug-risk input                                     |
| `GET /token/v1/holder_profile`                     | token                                                         | holder summary + tag mix (bundler/sniper/insider/dev/smart_trader/kol) | holder-quality signal for scoring                                  |
| `GET /token/v1/holder_positions`                   | token, holder-tag filter, pagination                          | per-wallet positions + PnL                                             | deep holder forensics                                              |
| `GET /token/v1/holder_chart`                       | token, interval                                               | holder-count time series                                               | adoption-trend panel                                               |
| `GET /token/v1/chart/tag_holdings`                 | token                                                         | holdings grouped by tag (≤100 pts/tag)                                 | smart-money-vs-insider flow                                        |
| `GET /token/v1/first_buyers`                       | token, `offset+limit` ≤1000                                   | earliest buyers + hold/sell state                                      | launch-forensics / insider detection                               |
| `GET /token/v1/wallet_tags_tracker` (+ `/details`) | token, interval                                               | tagged-wallet buy/sell per bucket (+ wallets)                          | dev-profit-taking / sniper-exit monitor                            |

### H. Security (the security-aggregator input)

Docs: `data-api/security/*`. All chains except Sui; 25 CU per request.

| Method + path              | Key params                      | Response shape                                          | Gateway need (future)                                                                                          |
| -------------------------- | ------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /defi/token_security` | `address` + `x-chain` (non-Sui) | ownership, mint/burn authority, LP, sellability signals | future security aggregator → snapshot risk fields; run early on newly discovered tokens before deeper analysis |

### I. Search, discovery & misc REST

| Method + path                                                            | Family (docs)                                                                                         | Response shape                                            | Gateway need (future)                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| `GET /defi/v3/search`                                                    | Search & Utils                                                                                        | tokens + market data by name/symbol/address               | symbol→address resolution for the publisher path |
| `GET /utils/v1/credits`                                                  | Search & Utils                                                                                        | CU usage of current account                               | ops / budget monitor                             |
| `GET /defi/token_creation_info`                                          | Creation & Trending                                                                                   | token creation tx info                                    | launch-verification signal                       |
| `GET /defi/token_trending`                                               | Creation & Trending                                                                                   | trending tokens by sort                                   | trending gateway                                 |
| `GET /defi/v3/token/meme_detail/single` / `.../meme_list`                | Meme                                                                                                  | meme-token detail / list                                  | meme vertical (out of v1 scope)                  |
| `GET /smart_money/v1/token_list`                                         | Smart Money                                                                                           | smart-money-flagged tokens                                | smart-money discovery gateway                    |
| `GET /defi/v3/token/fee/single` / `.../fee/multiple`                     | Global Fees Paid                                                                                      | global fees paid                                          | fee-flow signal                                  |
| `GET /market/v1/blockchain_metrics`                                      | DEX & Protocol                                                                                        | chain trading metrics + stablecoin mcap                   | chain-health panel                               |
| `GET /identity/v1/single` / `POST /identity/v1/multiple` / `.../domains` | Wallet Identity                                                                                       | address type/entity/label/tags, .sol domains              | wallet-labeling for KOL intel                    |
| `GET /blockchain/v1/account/*`, `/token/*`, `/transaction/*`             | Blockchain Data API (Solana)                                                                          | account detail, token accounts, token metadata, tx detail | Solana-native fallback reads                     |
| `GET /defi/v3/all_time_trades/single` / `POST .../multiple`              | Alltime & History                                                                                     | all-time / follow-duration trades                         | long-horizon trade forensics                     |
| `GET /defi/v3/txs/latest_block`, `GET /defi/networks`                    | Blockchain                                                                                            | latest trade block, supported networks                    | coverage/freshness checks                        |
| Perps Data API (`/perps/v1/...`)                                         | Perps (token list/overview/positions/liquidation-map, wallet list/overview/positions/fills/transfers) | perps market + wallet data                                | out of v1 scope (spot only)                      |

### J. WebSocket streams (AVAILABLE, transport not wired)

Docs: `https://data.birdeye.so/docs/websockets/*`. Endpoint:
`wss://public-api.birdeye.so/socket` (X-API-KEY auth). The market-data
app already owns a Socket.IO `/market-data` edge (todo 11, P49) but no
Birdeye WS client exists — all USED-TODAY calls are REST polling.

| Subscription                              | Push shape                                                  | Gateway need (future)                                 |
| ----------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Token/Pair OHLCV (`subscribe-price`)      | live candles for tokens/pairs                               | live chart bars without REST polling                  |
| Token/Pair Transactions (`subscribe_txs`) | live token txs                                              | live tape (replaces `getTokenTrades` polling)         |
| Base-Quote OHLCV                          | live base/quote candles                                     | live aggregated charts                                |
| Token Stats (`subscribe_token_stats`)     | live token stats (+ Solana holder metrics since 2026-09-25) | live `holders`/activity on the snapshot               |
| Meme Stats                                | live meme stats                                             | meme vertical                                         |
| New Token Listing / New Pair              | launch events                                               | push-based discovery (replaces `new_listing` polling) |
| Track Large Transactions                  | whale prints                                                | whale-alert gateway                                   |
| Wallet Transactions / Transfer            | wallet-scoped live txs                                      | KOL-wallet live monitor                               |

## Error modes

All failures collapse to `null` (callers fall through to the next
provider). Proven paths only:

- No API key → `null` before any HTTP
  (`birdeye.service.ts:60`, `90`, `121`).
- `success: false` or empty `data` → `null`
  (`birdeye.service.ts:69`, `100`, `137`).
- HTTP 404 → `null` without logging
  (`birdeye.service.ts:72`, `103`, `140`).
- Any other throw (401 bad key, 429 rate limit, timeout) → debug log +
  `null` (`birdeye.service.ts:73-76`, `104-106`, `141-143`).
