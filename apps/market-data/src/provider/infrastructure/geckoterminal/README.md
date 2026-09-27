# GeckoTerminal provider

Free token-info source (100+ networks): holders, price, FDV/market cap,
volume, price change, GT score — aggregated across DEXes.

- Base URL: `https://api.geckoterminal.com/api/v2` (`geckoterminal.service.ts:11`)
- Docs: https://api.geckoterminal.com/docs (endpoint list), product page
  https://www.geckoterminal.com/dex-api, API guide https://apiguide.geckoterminal.com,
  keyless limits https://docs.coingecko.com/docs/keyless-public-api
- Auth: none. `GeckoTerminalConfig.apiKey` is optional and unused
  (`geckoterminal.config.ts:3-5`); module defaults to `{}` when
  `app.geckoterminal` is unset (`geckoterminal.module.ts:15`). No env var required.
  Paid CoinGecko plans serve the same on-chain data under `/onchain`
  endpoints with a key (separate base path — not used here).
- Rate limit: free tier ~10–30 req/min (public docs state ~10/min base,
  ~30/min per-endpoint notes); 429 on excess. Paid CoinGecko `/onchain`
  plans raise it to ~250/min. All calls use an 8 s axios timeout; upstream
  responses are cached ~1 min.
- Catalog verified against the official docs + API guide + FAQ on
  2026-09-27 (see § Endpoint catalog below). Paths/params below are
  verbatim from those sources; anything not listed there is marked as
  code-only.

## Methods → endpoints

| Method                               | Code                          | HTTP                                                |
| ------------------------------------ | ----------------------------- | --------------------------------------------------- |
| `getTokenInfo(networkSlug, address)` | `geckoterminal.service.ts:51` | `GET /networks/{networkSlug}/tokens/{address}/info` |

`networkSlug` is the GeckoTerminal network id (`solana`, `eth`, `bsc`,
`polygon_pos`, … — see `GET /networks`). Mapping to the local shape is in
`toTokenInfo` (`geckoterminal.service.ts:74`).

## Endpoint catalog (official docs, verified 2026-09-27)

Every path below exists in the official API reference
(https://api.geckoterminal.com/docs) or the official API guide/FAQ
(https://apiguide.geckoterminal.com). Auth is `none` on all public
endpoints; rate limit is `~10/min` base (`~30/min` per FAQ/notes, `~250/min`
on paid `/onchain` plans). Responses are JSON:API
(`{ data: { id, type, attributes } }` or arrays thereof) unless noted.
`USED-TODAY` = wrapped by a service method above; `AVAILABLE` = exists
upstream but not wrapped (candidate for future gateway routes).

### USED-TODAY

| Upstream path (verbatim)                        | Params                    | Response shape (upstream → local)                                                                                                                                                                                                                                                                            | Gateway need                                                                     |
| ----------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `GET /networks/{network}/tokens/{address}/info` | `network`, `address` path | `data.attributes`: `name, symbol, image_url, description?, decimals?, total_supply?, holders{count?}?, top_10_percent_holders?, gt_score?, price_usd, fdv_usd, market_cap_usd?, volume_usd{h24}?, price_change_percentage{h24}?` → `GeckoTerminalTokenInfo` (`geckoterminal.types.ts:27-41`, parsed numbers) | Holders + supply + GT-score enrichment (only holder source among free providers) |

### AVAILABLE (upstream exists, not wrapped — future gateway candidates)

| Upstream path (verbatim)                                         | Params                                                                                                                                                               | Response shape (upstream)                                                                                                                                                                   | Gateway need                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `GET /networks`                                                  | none                                                                                                                                                                 | Network id map: `{ id (slug), type, attributes{ name, coingecko_asset_platform_id? } }[]`                                                                                                   | Chain→slug resolution (prerequisite for every scoped route) |
| `GET /networks/{network}/dexes`                                  | `network` path                                                                                                                                                       | DEX list for the network: `{ id, type, attributes{ name } }[]`                                                                                                                              | DEX catalog / dex-filtered discovery                        |
| `GET /networks/{network}/pools/{address}`                        | `network`, `address` path; `include=base_token,quote_token` adds token metadata                                                                                      | Pool detail: prices (usd + native), `fdv_usd`, `market_cap_usd?`, `price_change_percentage{h1,h24}?`, `volume_usd{h24}?`, `txns{h1,h24:{buys,sells}}`, `reserve_in_usd`, `pool_created_at?` | Pool snapshot (single-pool refresh)                         |
| `GET /networks/{network}/pools/multi/{addresses}`                | `network`, `addresses` path (comma-separated, max 30)                                                                                                                | Array of pool details (same shape)                                                                                                                                                          | Batch pool snapshot (up to 30 pools/call)                   |
| `GET /networks/{network}/pools`                                  | `network` path; `page`, `order=h24_volume_usd_desc\|h24_tx_count_desc`                                                                                               | Top-20 pools on the network (ranked per query)                                                                                                                                              | Discovery: top pools per network                            |
| `GET /networks/{network}/trending_pools`                         | `network` path; `include=base_token` for token metadata                                                                                                              | Trending pools on the network (web visits + on-chain activity)                                                                                                                              | Discovery: trending per network                             |
| `GET /networks/trending_pools`                                   | `include=base_token`                                                                                                                                                 | Trending pools across ALL networks                                                                                                                                                          | Discovery: cross-network trending                           |
| `GET /networks/{network}/new_pools`                              | `network` path                                                                                                                                                       | Newest pools on the network                                                                                                                                                                 | Discovery: new listings per network                         |
| `GET /networks/new_pools`                                        | `include=base_token`                                                                                                                                                 | Newest pools across ALL networks                                                                                                                                                            | Discovery: cross-network new listings                       |
| `GET /search/pools`                                              | `query` (pool/token address or symbol), `network?`, `page?`                                                                                                          | Matching pools (same pool shape)                                                                                                                                                            | Query search for the lookup routes                          |
| `GET /networks/{network}/tokens/{address}`                       | `network`, `address` path                                                                                                                                            | Token detail: price/fdv/volume/mcap + top-3 pools                                                                                                                                           | Token snapshot with venue context                           |
| `GET /networks/{network}/tokens/multi/{addresses}`               | `network`, `addresses` path (comma-separated, max 30)                                                                                                                | Array of token details (same shape)                                                                                                                                                         | Batch token snapshot (up to 30 tokens/call)                 |
| `GET /networks/{network}/tokens/{token_address}/pools`           | `network`, `token_address` path                                                                                                                                      | Top-20 pools trading the token (ranked by `reserve_in_usd` + 24h volume)                                                                                                                    | Token→venues: where a token trades + best venue             |
| `GET /networks/{network}/pools/{pool_address}/info`              | `network`, `pool_address` path                                                                                                                                       | Base/quote token metadata: name, symbol, image, socials, description                                                                                                                        | Pool-token metadata (display enrichment)                    |
| `GET /tokens/info_recently_updated`                              | `network?`                                                                                                                                                           | Most recently updated token infos                                                                                                                                                           | Discovery: freshly updated metadata                         |
| `GET /networks/{network}/pools/{pool_address}/ohlcv/{timeframe}` | `network`, `pool_address`, `timeframe` (`day\|hour\|minute`) path; `aggregate`, `limit`, `currency=usd`, `token=base\|quote`, `before_timestamp` (epoch **seconds**) | `data.attributes.ohlcv_list: [timestamp, open, high, low, close, volume][]` (up to ~6 months)                                                                                               | OHLCV charts (Dexter scan/chart routes)                     |
| `GET /networks/{network}/pools/{pool_address}/trades`            | `network`, `pool_address` path; optional min-volume filter                                                                                                           | Last 300 trades in the past 24h                                                                                                                                                             | Trade tape (buy/sell pressure, whale prints)                |
| `GET /simple/networks/{network}/token_price/{addresses}`         | `network`, `addresses` path (comma-separated batch)                                                                                                                  | `{ data: { id, type, attributes{ token_prices: { [address]: price } } } }` (flat price map)                                                                                                 | Cheap poll: prices only, no metadata overhead               |

Notes on the catalog:

- `network` values are GeckoTerminal slugs (`solana`, `eth`, `bsc`,
  `polygon_pos`, …) from `GET /networks` — NOT EVM chain ids and NOT
  DexScreener `chainId` slugs (overlap partially: `solana` matches,
  `eth` ≠ `ethereum`). The gateway needs a chain→slug map per provider
  before exposing any `{network}` route.
- OHLCV timestamps are epoch **seconds** (FAQ), not milliseconds; the
  `token=base|quote` param picks which side of the pair the candles are
  quoted in (changelog).
- The same data is served authenticated under CoinGecko `/onchain`
  endpoints on paid plans (~250/min). If the gateway outgrows the free
  tier, the migration is a base-URL + key change, not a re-model: the
  response shapes are shared.
- If the gateway starts wrapping an AVAILABLE endpoint, add its method +
  types first and re-verify the schema against
  https://api.geckoterminal.com/docs.

## Example

```bash
curl 'https://api.geckoterminal.com/api/v2/networks/solana/tokens/So11111111111111111111111111111111111111112/info'
```

Upstream shape (`GeckoTerminalResponse`, `geckoterminal.types.ts:23-25`) is
JSON:API (`data.attributes` with snake_case strings); the service returns
`GeckoTerminalTokenInfo` (`geckoterminal.types.ts:27-41`, parsed numbers):

```json
{
  "address": "So11111111111111111111111111111111111111112",
  "name": "Wrapped SOL",
  "symbol": "SOL",
  "totalSupply": "611707681.0",
  "decimals": 9,
  "holders": 1234567,
  "top10HolderPercent": 12.4,
  "gtScore": 78.5,
  "priceUsd": 172.44,
  "fdvUsd": 105500000000,
  "marketCapUsd": 105500000000,
  "volumeUsdH24": 891234567.0,
  "priceChangePercentH24": 2.1
}
```

Nullable upstream fields (`total_supply`, `holders`, `volume_usd.h24`,
`price_change_percentage.h24`, …) map to `null` via `?? null` /
conditional `parseFloat` (`geckoterminal.service.ts:77-99`).

## Error modes

- HTTP 404 → `null` (`geckoterminal.service.ts:62`).
- Any other failure (timeout after 8 s, 429, 5xx, network) → caught,
  `logger.debug`, returns `null`. Never throws.
