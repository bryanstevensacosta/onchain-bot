# CoinMarketCap Provider

> Cost: KEYED (`COINMARKETCAP_API_KEY`) — fallback tier `keyed`. Without the key every method returns null (skip, never throws); zero-cost cascade never spends on it.

Real-time quotes, static metadata, ranked listings, ID map, price
conversion, and global aggregate metrics.

## What it provides

- Latest quotes per symbol (`price`, `volume_24h`, `% change 1h/24h/7d`,
  `market_cap`, `fully_diluted_market_cap`) — `coinmarketcap.types.ts:1-10`.
- Static coin metadata (id, name, slug, logo, description) —
  `coinmarketcap.types.ts:12-21`.
- Market-cap-ranked listings page, active-ID map, fiat/crypto conversion,
  global totals (market cap, 24h volume, BTC/ETH dominance).
- Every method returns the endpoint's `data` payload (never the `status`
  envelope); response shapes live in `coinmarketcap.types.ts:33-88`.

## Base URL

`https://pro-api.coinmarketcap.com/v1` (`coinmarketcap.service.ts:15`).

## Auth

- API key sent as request header `X-CMC_PRO_API_KEY`
  (`coinmarketcap.service.ts:16,75`).
- Key arrives via `COINMARKETCAP_CONFIG` (`coinmarketcap.config.ts:1-5`).
  The module resolves `ConfigService 'app.coinmarketcap'`, falling back to
  `{ apiKey: '' }` (`coinmarketcap.module.ts:15`); `forRoot(config)` allows
  explicit injection (`coinmarketcap.module.ts:22-31`). Backend maps
  `process.env.COINMARKETCAP_API_KEY` into `app.coinmarketcap.apiKey`
  (`apps/backend/src/shared/common/config/app.config.ts:368-370`).
- Missing key: constructor warns (`coinmarketcap.service.ts:38-42`) and every
  method returns `null` (e.g. `coinmarketcap.service.ts:65`).
- Get a key at pro.coinmarketcap.com (Developer Portal dashboard).

## Rate limits

- Credit model: credits are tied to data returned, not raw request count
  (official FAQ). HTTP `429` on over-limit; limits reset every 60 seconds;
  exact quotas depend on your tier.
- All requests use an 8s axios timeout (e.g. `coinmarketcap.service.ts:76`).

## Methods → code

| Method                                           | Endpoint hit                                        | Code                                                                                  |
| ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `getQuotesLatest(symbol, convert='USD')`         | `GET /cryptocurrency/quotes/latest`                 | `coinmarketcap.service.ts:61-92` (`:70` builds the URL; `:72-74` joins symbol arrays) |
| `getInfo(symbol)`                                | `GET /cryptocurrency/info`                          | `coinmarketcap.service.ts:103-125` (`:111`)                                           |
| `getListingsLatest(limit=100, convert='USD')`    | `GET /cryptocurrency/listings/latest` (`start=1`)   | `coinmarketcap.service.ts:133-156` (`:142-143`)                                       |
| `getMap()`                                       | `GET /cryptocurrency/map` (`listing_status=active`) | `coinmarketcap.service.ts:161-179` (`:167-168`)                                       |
| `priceConversion(amount, symbol, convert='USD')` | `GET /tools/price-conversion`                       | `coinmarketcap.service.ts:192-216` (`:202-203`)                                       |
| `getGlobalMetrics(convert='USD')`                | `GET /global-metrics/quotes/latest`                 | `coinmarketcap.service.ts:223-245` (`:231-232`)                                       |

Note: official docs mark the `/v1/cryptocurrency/*` and
`/v1/tools/price-conversion` endpoints as deprecated in favor of v2/v3.
This service still calls the v1 paths above — migrate when CMC retires them.

## Example

```bash
curl -G "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest" \
  --data-urlencode "start=1" --data-urlencode "limit=10" \
  --data-urlencode "convert=USD" \
  -H "Accept: application/json" \
  -H "X-CMC_PRO_API_KEY: $COINMARKETCAP_API_KEY"
```

Truncated response (official quick-start shape; `getListingsLatest` returns
the `data` array):

```json
{
  "status": {
    "error_code": 0,
    "error_message": null,
    "elapsed": 12,
    "credit_count": 1
  },
  "data": [
    {
      "id": 1,
      "name": "Bitcoin",
      "symbol": "BTC",
      "slug": "bitcoin",
      "cmc_rank": 1,
      "last_updated": "2025-01-15T12:00:00.000Z",
      "quote": {
        "USD": {
          "price": 99150.42,
          "volume_24h": 32500000000,
          "percent_change_1h": 0.15,
          "percent_change_24h": 2.34,
          "percent_change_7d": -1.05,
          "market_cap": 1963178316000,
          "fully_diluted_market_cap": 2082158820000,
          "last_updated": "2025-01-15T12:00:00.000Z"
        }
      }
    }
  ]
}
```

## Error modes (all degrade to `null`, never throw)

| Condition                                   | Behavior                        | Code                                                                                                |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| No API key                                  | `null` (+ warn at construction) | `coinmarketcap.service.ts:38-42`, e.g. `:65`                                                        |
| HTTP 404                                    | `null`                          | e.g. `coinmarketcap.service.ts:86` (same guard in every method)                                     |
| API-level error (`status.error_code !== 0`) | debug log or silent `null`      | `coinmarketcap.service.ts:78-83` (`getQuotesLatest` logs; `:116,:147,:172,:207,:236` return `null`) |
| Any other failure (429/5xx/timeout)         | debug log + `null`              | e.g. `coinmarketcap.service.ts:87-90`                                                               |

Docs: https://coinmarketcap.com/api/documentation/v1/ —
quick start: https://coinmarketcap.com/api/documentation/guides/quick-start

## Full endpoint catalog (official API — even unused)

> Verified 2026-09-27 against the official docs
> (`/api/documentation/pro-api-reference/endpoint-overview`,
> `/cryptocurrency`, `/tools` pages) + API reference via Context7
> (`/websites/coinmarketcap_api`). Every path below appears verbatim in
> those pages. Do NOT add paths not listed here without re-checking the
> official reference first (no invented endpoints).
>
> Shared for ALL rows: base `https://pro-api.coinmarketcap.com`;
> auth header `X-CMC_PRO_API_KEY` (this service) — the reference also
> documents keyless `https://pro-api.coinmarketcap.com/public-api/*`
> for a curated subset (map, listings/latest, quotes/latest,
> price-conversion — NOT wired here); credit model (credits scale with
> data returned, not raw requests; HTTP 429 on over-limit; per-plan
> minute rate limits + monthly quotas; `GET /v1/key/info` is free).
> `GET` unless noted. "Gateway need" maps each endpoint to a future
> `src/gateway/` + aggregator use (todo-3 remainder).
>
> ⚠️ Version note (verified 2026-09-27): the reference now serves
> `/v3/cryptocurrency/listings/latest`, `/v3/cryptocurrency/quotes/latest`,
> `/v3/cryptocurrency/quotes/historical`, `/v2/cryptocurrency/info`, and
> `/v2/tools/price-conversion` as current; this service still calls the
> `/v1/*` equivalents (see pre-existing note under Methods → code).
> Migrate method-by-method; response shapes stay `{data, status}` with
> `status.error_code === 0` on success.

### USED-TODAY (wired in `coinmarketcap.service.ts`)

| Endpoint                                                        | Params (this service)                                                                                                    | Response (key fields)                                                                                                                     | Gateway need                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /v1/cryptocurrency/quotes/latest` (ref current: `/v3/…`)   | `symbol` (csv), `convert='USD'`                                                                                          | `data{<SYM>:{id,name,symbol,slug,cmc_rank,quote{<CCY>:{price,volume_24h,percent_change_1h/24h/7d,market_cap,fully_diluted_market_cap}}}}` | Live price/MC/FDV quotes for snapshots                                |
| `GET /v1/cryptocurrency/info` (ref current: `/v2/…`)            | `symbol` (csv)                                                                                                           | `data{<SYM>:{id,name,symbol,slug,logo,description,urls}}`                                                                                 | Static metadata (logo, description, links)                            |
| `GET /v1/cryptocurrency/listings/latest` (ref current: `/v3/…`) | `start=1`, `limit` (dflt 100), `convert='USD'` (+ ref: `sort`, `sort_dir`, `cryptocurrency_type`, `tag`, `aux`, filters) | Ranked `[{id,name,symbol,slug,cmc_rank,circulating_supply,quote}]`                                                                        | Ranked market views / screener feed                                   |
| `GET /v1/cryptocurrency/map`                                    | `listing_status=active` (+ ref: `start`, `limit` ≤5000, `sort`, `symbol`, `aux`)                                         | `[{id,rank,name,symbol,slug,is_active,first_historical_data,last_historical_data,platform}]`; free + keyless                              | Symbol → CMC-ID resolution (prefer IDs downstream per best practices) |
| `GET /v1/tools/price-conversion` (ref current: `/v2/…`)         | `amount`, `symbol`, `convert='USD'` (+ ref v2: `id` alt, `time` for historical, multi-`convert`)                         | `{symbol,id,name,amount,quote{<CCY>:{price,last_updated}}}`                                                                               | Fiat/crypto conversion widget                                         |
| `GET /v1/global-metrics/quotes/latest`                          | `convert='USD'`                                                                                                          | `{total_market_cap,total_volume_24h,…dominance}`                                                                                          | Market-overview header                                                |

### AVAILABLE — Cryptocurrency (19 endpoints in the reference)

| Endpoint                                                             | Params (key)                                                                   | Response (key fields)                                                 | Gateway need                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------- |
| `GET /v1/cryptocurrency/listings/new`                                | `start`, `limit`, `convert`, `sort_dir`                                        | Recently-added coins (same shape as listings)                         | New-listing discovery cron         |
| `GET /v1/cryptocurrency/listings/historical`                         | `date` (req, UTC day), `start`, `limit`, `convert`, `sort`                     | Ranked snapshot at end of UTC day (from 2013-04-28, plan-gated depth) | Backfill / point-in-time snapshots |
| `GET /v3/cryptocurrency/quotes/historical`                           | `id`/`symbol`/`slug`, `time_start`, `time_end`, `count`, `interval`, `convert` | Time-series quotes per coin                                           | Price-history charts / backtesting |
| `GET /v2/cryptocurrency/ohlcv/latest`                                | `id`/`symbol`, `convert`, `skip_invalid`                                       | Latest OHLCV candle per coin                                          | Candlestick snapshots              |
| `GET /v2/cryptocurrency/ohlcv/historical`                            | `id`/`symbol`, `time_period`, `time_start/end`, `count`                        | Historical OHLCV candles                                              | Candlestick charts                 |
| `GET /v2/cryptocurrency/market-pairs/latest`                         | `id`/`symbol`, `start`, `limit`, `convert`, `matched_symbol`                   | Trading pairs per coin (exchange, pair, price, volume)                | Venue-level liquidity breakdown    |
| `GET /v2/cryptocurrency/price-performance-stats/latest`              | `id`/`symbol`/`slug`, `time_period`                                            | High/low, % change over periods                                       | Performance widgets                |
| `GET /v1/cryptocurrency/trending/latest`                             | `start`, `limit`, `convert`                                                    | Currently trending coins                                              | Trending discovery feed            |
| `GET /v1/cryptocurrency/trending/gainers-losers`                     | `start`, `limit`, `convert`, `sort_dir`, `time_period`                         | Top gainers + losers                                                  | Movers/alpha discovery widget      |
| `GET /v1/cryptocurrency/trending/most-visited`                       | `start`, `limit`, `convert`                                                    | Most-visited on CMC                                                   | Attention/mindshare signal         |
| `GET /v2/simple/price`                                               | `id`/`symbol`, `convert`                                                       | Minimal `{price,last_updated}` map                                    | Cheap multi-coin price refresh     |
| `GET /v1/cryptocurrency/categories`                                  | `start`, `limit`                                                               | All categories + market metrics                                       | Category taxonomy                  |
| `GET /v1/cryptocurrency/category`                                    | `id`/`slug`, `start`, `limit`, `convert`                                       | Single category detail + coins                                        | Sector views                       |
| `GET /v1/cryptocurrency/airdrops` / `GET /v1/cryptocurrency/airdrop` | list params / `id`                                                             | Airdrop listings / single airdrop                                     | Airdrop discovery (low priority)   |

### AVAILABLE — Tools / Global-metrics / Exchange / DEX & market-intel families

| Endpoint                                                                                                                                                                                                           | Params (key)                                      | Response (key fields)                                                                                 | Gateway need                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /v1/fiat/map`                                                                                                                                                                                                 | `start`, `limit`, `sort`, `include_metals`        | `[{id,name,sign,symbol}]` fiat→ID map                                                                 | `convert` validation                                                                      |
| `GET /v1/key/info`                                                                                                                                                                                                 | — (header only; free, counts toward minute limit) | Plan quotas + `usage{current_minute,current_day,current_month}`                                       | Quota-monitoring cron                                                                     |
| `GET /v1/tools/postman`                                                                                                                                                                                            | —                                                 | Postman collection export                                                                             | Dev tooling only                                                                          |
| `GET /v1/global-metrics/quotes/historical`                                                                                                                                                                         | `time_start/end`, `count`, `interval`, `convert`  | Historical totals + dominance                                                                         | Market-cycle charts                                                                       |
| Exchange family (`/api/documentation/pro-api-reference/exchange`): `info`, `map`, `listings/latest`, `quotes/latest`, `quotes/historical`, `market-pairs/latest`, `assets`                                         | exchange `id`/`slug`, range params                | Exchange metadata, rankings, volumes, pairs, PoR assets                                               | Venue directory + exchange-level liquidity (see family page for exact paths/params)       |
| DEX family (`/token`, `/platform`, `/holder`, `/ohlcv`, `/others` pages): token lookup/batch/price/liquidity/pools/transactions/trending/new/meme/gainers-losers/security, platforms, holder analytics, pair OHLCV | network/token/pair params                         | On-chain DEX quotes, pools, holders                                                                   | Fresh-token DEX coverage where CEX listings lag (see family pages for exact paths/params) |
| Market-intel families (`/real-world-assets`, `/derivatives`, `/cmc-ai`, `/content`, `/community`, `/cmc-index`, `/crypto-others` pages)                                                                            | per-endpoint                                      | RWA quotes, derivatives OI/funding/liquidations, AI insights, headlines, trending topics, CMC indices | Overlays after core snapshot path lands (see family pages for exact paths/params)         |
