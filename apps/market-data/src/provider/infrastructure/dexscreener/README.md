# DexScreener provider

> Cost: FREE — no API key. Zero-cost cascade tier `free` (runs 24/7 at $0).

Free DEX market-data source (80+ DEXes, 40+ chains). Primary enrichment
source: token pairs cross-chain, search, profiles/boosts, orders, metas.

- Base URL: `https://api.dexscreener.com` (`dexscreener.service.ts:18`)
- Docs: https://docs.dexscreener.com/api/reference
- Auth: none. `DexScreenerConfig.apiKey` is optional and unused
  (`dexscreener.config.ts:3-5`); module defaults to `{}` when
  `app.dexscreener` is unset (`dexscreener.module.ts:12`). No env var required.
- Rate limit: 60 req/min per endpoint (upstream docs, repeated on every
  reference entry). All calls use an 8 s axios timeout.
- Catalog verified against the official API reference on 2026-09-27
  (see § Endpoint catalog below). Paths/params below are verbatim from
  that reference; anything not listed there is marked as code-only.

## Methods → endpoints

| Method                                   | Code                         | HTTP                                                                             |
| ---------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `getPairsByToken(address)`               | `dexscreener.service.ts:59`  | `GET /latest/dex/tokens/{address}`                                               |
| `getPairByAddress(chainId, pairAddress)` | `dexscreener.service.ts:80`  | `GET /latest/dex/pairs/{chainId}/{pairAddress}`                                  |
| `search(query)`                          | `dexscreener.service.ts:102` | `GET /latest/dex/search?q={query}`                                               |
| `getPairsByChain(chainId, tokenAddress)` | `dexscreener.service.ts:121` | `GET /token-pairs/v1/{chainId}/{tokenAddress}`                                   |
| `getLatestProfiles()`                    | `dexscreener.service.ts:147` | `GET /token-profiles/latest/v1`                                                  |
| `getRecentUpdates()`                     | `dexscreener.service.ts:165` | `GET /token-profiles/recent-updates/v1`                                          |
| `getLatestBoosts()`                      | `dexscreener.service.ts:183` | `GET /token-boosts/latest/v1`                                                    |
| `getTopBoosts()`                         | `dexscreener.service.ts:201` | `GET /token-boosts/top/v1`                                                       |
| `getOrders(chainId, tokenAddress)`       | `dexscreener.service.ts:223` | `GET /orders/v1/{chainId}/{tokenAddress}`                                        |
| `getTrendingMetas()`                     | `dexscreener.service.ts:249` | `GET /metas/trending/v1`                                                         |
| `getTokensInfo(chainId, tokenAddresses)` | `dexscreener.service.ts:271` | `GET /tokens/v1/{chainId}/{tokenAddresses}` (comma-separated)                    |
| `getBestPairSummary(address)`            | `dexscreener.service.ts:297` | local only: calls `getPairsByToken`, keeps the pair with highest `liquidity.usd` |

## Endpoint catalog (official reference, verified 2026-09-27)

Every path below exists in the official reference
(https://docs.dexscreener.com/api/reference). Auth is `none` and the
rate limit is `60 req/min` on ALL of them (stated per-entry upstream).
`USED-TODAY` = wrapped by a service method above; `AVAILABLE` = exists
upstream but not wrapped (candidate for future gateway routes).

### USED-TODAY

| Upstream path (verbatim)                       | Params                                                                                                              | Response shape (upstream)                                                                                                                                                                                                                                                                                                                            | Gateway need                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /latest/dex/tokens/{tokenAddresses}`      | `tokenAddresses` path (code passes one address; upstream names it plural — comma-separated batch per upstream docs) | `{ pairs: Pair[] \| null }` — `Pair`: `chainId, dexId, url, pairAddress, labels?, baseToken{address,name,symbol}, quoteToken{…}, priceNative, priceUsd?, txns{m5,h1,h6,h24:{buys,sells}}, volume{h5?/h1/h6/h24}, priceChange{…}?, liquidity{usd?,base,quote}?, fdv?, marketCap?, pairCreatedAt?, info{imageUrl?,websites?,socials?}, boosts{active}` | Primary snapshot: price, liquidity, volume, mcap/FDV, 24h change/txns |
| `GET /latest/dex/pairs/{chainId}/{pairId}`     | `chainId`, `pairId` path (code names the 2nd arg `pairAddress`)                                                     | Same `{ pairs }` envelope; first element returned                                                                                                                                                                                                                                                                                                    | Pair-scoped refresh (e.g. Dexter scan of a known pair)                |
| `GET /latest/dex/search`                       | `q` query (symbol, name, or address)                                                                                | Same `{ pairs }` envelope                                                                                                                                                                                                                                                                                                                            | Query search for the ticker-resolver / lookup routes                  |
| `GET /token-pairs/v1/{chainId}/{tokenAddress}` | `chainId`, `tokenAddress` path                                                                                      | Same `{ pairs }` envelope                                                                                                                                                                                                                                                                                                                            | Chain-scoped pairs (chain-filtered snapshot)                          |
| `GET /token-profiles/latest/v1`                | none                                                                                                                | `TokenProfile[]`: `url, chainId, tokenAddress, icon, header?, description?, links[{type?,label?,url?}]`                                                                                                                                                                                                                                              | Discovery: newly listed/profiled tokens                               |
| `GET /token-profiles/recent-updates/v1`        | none                                                                                                                | `TokenProfile[]` (same shape)                                                                                                                                                                                                                                                                                                                        | Discovery: recently updated profiles                                  |
| `GET /token-boosts/latest/v1`                  | none                                                                                                                | `TokenBoost[]`: `url, chainId, tokenAddress, amount, totalAmount, icon, header?, description?, links?`                                                                                                                                                                                                                                               | Attention signal: latest paid promotions                              |
| `GET /token-boosts/top/v1`                     | none                                                                                                                | `TokenBoost[]` (same shape)                                                                                                                                                                                                                                                                                                                          | Attention signal: top paid promotions                                 |
| `GET /orders/v1/{chainId}/{tokenAddress}`      | `chainId`, `tokenAddress` path                                                                                      | `{ pairs: [{ orders: Order[] }…] }` — code returns the FIRST pair's `orders` only (`dexscreener.service.ts:232`)                                                                                                                                                                                                                                     | Order-flow sentiment (limit orders on the token)                      |
| `GET /metas/trending/v1`                       | none                                                                                                                | `Meta[]`: `name, slug, description, icon{type,value}, marketCap, liquidity, volume, tokenCount, marketCapChange{m5,h1,h6,h24}, marketCapDelta{…}`                                                                                                                                                                                                    | Narrative discovery: trending categories/memes                        |
| `GET /tokens/v1/{chainId}/{tokenAddresses}`    | `chainId`, `tokenAddresses` path (comma-separated batch)                                                            | `{ pairs }`-shaped envelope (`pairs?`)                                                                                                                                                                                                                                                                                                               | Batch snapshot: many tokens, one chain, one call                      |

### AVAILABLE (upstream exists, not wrapped — future gateway candidates)

| Upstream path (verbatim)             | Params      | Response shape (upstream)                                                      | Gateway need                                              | Note                                      |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------- |
| `GET /community-takeovers/latest/v1` | none        | `CommunityTakeover[]`: `TokenProfile` fields + `claimDate` (date-time)         | Narrative discovery: community-takeover (CTO) tokens      | New discovery axis; no code uses it today |
| `GET /ads/latest/v1`                 | none        | `Ad[]`: `url, chainId, tokenAddress, date, type, durationHours?, impressions?` | Sponsor/attention signal                                  | Low value for snapshots; likely skip      |
| `GET /metas/meta/v1/{slug}`          | `slug` path | `Meta` fields + `pairs: Pair[]` (full pair objects for every pair in the meta) | Narrative detail page: meta stats + its pairs in one call | Natural complement to `getTrendingMetas`  |

Notes on the catalog:

- The reference embeds the OpenAPI spec for boosts/orders/dex/token-pairs/
  tokens endpoints rather than inlining schemas; the method names and
  response types above (`DexScreenerTokenBoost`, `DexScreenerOrder`,
  `DexScreenerOrdersResponse`) are the code's reading of those schemas
  (`dexscreener.types.ts`). If the gateway starts wrapping an AVAILABLE
  endpoint, add its method + types first and re-verify the schema.
- `chainId` values are DexScreener slugs (`solana`, `ethereum`, `bsc`,
  `polygon`, `base`, …) — NOT EVM numeric ids. The gateway needs a
  chain→slug map before exposing any `{chainId}` route.
- No pagination/query params exist on the `latest`/`top`/`trending`
  endpoints (they return the current window as-is).

## Example

```bash
curl 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112'
```

Response shape (`DexScreenerPairsResponse`, `dexscreener.types.ts:44-46`) —
`pairs` is `null` when the token is unknown:

```json
{
  "pairs": [
    {
      "chainId": "solana",
      "dexId": "raydium",
      "pairAddress": "3n7PP...",
      "baseToken": {
        "address": "So1111...",
        "name": "Wrapped SOL",
        "symbol": "SOL"
      },
      "priceUsd": "172.44",
      "liquidity": { "usd": 1820440, "base": 5280, "quote": 172100 },
      "fdv": 82600000000,
      "marketCap": 82600000000,
      "priceChange": { "h24": 2.1 }
    }
  ]
}
```

`getBestPairSummary` reduces that to `DexScreenerPairSummary`
(`dexscreener.types.ts:123-139`): `pairAddress, dexId, baseToken,
priceUsd, priceNative, liquidityUsd, volume24h` (summed over all windows),
`fdv, marketCap, priceChange24h, txns24h`.

## Error modes

- HTTP 404 → `null` (pairs, pair, search, chain-pairs, orders, tokens-info
  methods). Profiles/boosts/metas have no 404 branch — any failure → `null`.
- Any other failure (timeout after 8 s, 429, 5xx, network) → caught,
  `logger.debug`, returns `null`. Never throws.
- `getBestPairSummary` → `null` when `getPairsByToken` returns `null`/empty.
- `getOrders` returns the first pair's `orders` array only
  (`dexscreener.service.ts:232`).
