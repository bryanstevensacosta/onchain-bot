# CoinGecko Provider

Price/MC/FDV fallback for established tokens (blue chips) where
DexScreener / GeckoTerminal may lack data.

## What it provides

- Single lookup: token market data by chain platform + contract address.
- Returns price, market cap, FDV, 24h volume, 24h price-change %, image URLs.
- Does NOT return `liquidityUsd` or `holders` (price-only fallback).
- Backend `CoinGeckoAdapter` maps our `ChainId` to CoinGecko platform IDs
  (`apps/backend/src/token/enrichment/infrastructure/providers/coingecko.adapter.ts:9-16`)
  and nulls out liquidity/holders (`:46-67`).

## Base URL

`https://api.coingecko.com/api/v3` (`coingecko.service.ts:8`) — the free/Demo
host. Paid plans use `https://pro-api.coingecko.com` with a different header
(not wired here).

## Auth

- Demo API key sent as request header `x-cg-demo-api-key`
  (`coingecko.service.ts:63`).
- Key arrives via `COINGECKO_CONFIG` (`coingecko.config.ts:1-5`). The module
  resolves `ConfigService 'app.coingecko'`, falling back to `{ apiKey: '' }`
  (`coingecko.module.ts:12`); `forRoot(config)` allows explicit injection
  (`coingecko.module.ts:19-28`).
- Missing key: constructor warns (`coingecko.service.ts:31-35`) and
  `getTokenContractInfo` returns `null` (`coingecko.service.ts:58`).

## Rate limits

- Code comment states Demo plan ~30 req/min, 10k credits/month
  (`coingecko.service.ts:13`).
- Current public pricing (docs, 2026): Demo plan 10k call credits/mo at
  100 calls/min; paid tiers raise both. Treat the docs as authoritative and
  the code comment as stale if they disagree.
- All requests use an 8s axios timeout (`coingecko.service.ts:64`).

## Methods → code

| Method                                    | Endpoint hit                                                   | Code                                                |
| ----------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `getTokenContractInfo(platform, address)` | `GET /coins/{platform}/contract/{address}`                     | `coingecko.service.ts:54-87` (`:61` builds the URL) |
| `extractImageUrls(image)` (private)       | — (filters `thumb`/`small`/`large` to unique `https?://` URLs) | `coingecko.service.ts:93-108`                       |

`platform` is a CoinGecko asset-platform ID (`ethereum`, `solana`,
`base`, `arbitrum-one`, `polygon-pos`, `binance-smart-chain`, … —
see `/asset_platforms`). Response shape: `coingecko.types.ts:15-27`.

## Example

```bash
curl -H "x-cg-demo-api-key: $COINGECKO_API_KEY" \
  "https://api.coingecko.com/api/v3/coins/ethereum/contract/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
```

Truncated response (WETH; see official `GET /coins/{id}/contract/{contract_address}`
reference):

```json
{
  "id": "weth",
  "symbol": "weth",
  "asset_platform_id": "ethereum",
  "image": {
    "thumb": "https://coin-images.coingecko.com/coins/images/2518/thumb/weth.png?1696503332",
    "small": "https://coin-images.coingecko.com/coins/images/2518/small/weth.png?1696503332",
    "large": "https://coin-images.coingecko.com/coins/images/2518/large/weth.png?1696503332"
  },
  "market_data": {
    "current_price": { "usd": 2115.04 },
    "market_cap": { "usd": 1923456789 },
    "fully_diluted_valuation": { "usd": 1923456789 },
    "total_volume": { "usd": 123456789 },
    "price_change_percentage_24h": 2.5
  }
}
```

Mapped to `CoinGeckoTokenInfo`: `priceUsd`, `marketCapUsd`, `fdvUsd`,
`volumeUsdH24`, `priceChangePercent24h`, `imageUrls`
(`coingecko.service.ts:72-79`).

## Error modes (all degrade to `null`, never throw)

| Condition                               | Behavior                        | Code                            |
| --------------------------------------- | ------------------------------- | ------------------------------- |
| No API key                              | `null` (+ warn at construction) | `coingecko.service.ts:31-35,58` |
| HTTP 404 (unknown platform/address)     | `null`                          | `coingecko.service.ts:81`       |
| Response has no `market_data`           | `null`                          | `coingecko.service.ts:67-68`    |
| Both `priceUsd` and `marketCapUsd` null | `null`                          | `coingecko.service.ts:69-71`    |
| Any other failure (429/5xx/timeout)     | debug log + `null`              | `coingecko.service.ts:82-85`    |

Docs: https://www.coingecko.com/en/api —
contract endpoint: https://docs.coingecko.com/demo/reference/coins-contract-address

## Full endpoint catalog (official API — even unused)

> Verified 2026-09-27 against the official endpoint overview
> (`https://docs.coingecko.com/reference/endpoint-overview`) + SDK docs
> via Context7 (`/websites/coingecko`). Every path below appears verbatim
> in the official overview; plan-gated endpoints are marked
> 💼 (Analyst & above) / 👑 (Enterprise). Do NOT add paths not listed
> here without re-checking the official overview first (no invented
> endpoints).
>
> Shared for ALL rows: base `https://api.coingecko.com/api/v3` (Demo) or
> `https://pro-api.coingecko.com/api/v3` (paid); auth header
> `x-cg-demo-api-key` (Demo) / `x-cg-pro-api-key` (paid, or
> `?x_cg_pro_api_key=` query); credit-based rate limits per plan
> (Demo ~10k credits/mo; code comment `coingecko.service.ts:13` says
> ~30 req/min — treat docs as authoritative). `GET` unless noted.
> "Gateway need" maps each endpoint to a future
> `src/gateway/` + aggregator use (todo-3 remainder).

### USED-TODAY (wired in `coingecko.service.ts`)

| Endpoint                                      | Params                                                                                                              | Response (key fields)                                                                                                                                                                                      | Gateway need                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `GET /coins/{id}/contract/{contract_address}` | `{id}` = asset-platform ID (`ethereum`, `solana`, … — see `/asset_platforms`); `{contract_address}` = token address | `id`, `symbol`, `asset_platform_id`, `image{thumb,small,large}`, `market_data{current_price,market_cap,fully_diluted_valuation,total_volume,price_change_percentage_24h}` → mapped to `CoinGeckoTokenInfo` | Price/MC/FDV fallback enrichment (blue chips) |

### AVAILABLE — Price (simple)

| Endpoint                       | Params                                                                                                                                     | Response (key fields)                   | Gateway need                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------- |
| `GET /simple/price`            | `ids` (coin IDs), `vs_currencies`, `include_market_cap`, `include_24hr_vol`, `include_24hr_change`, `include_last_updated_at`, `precision` | `{<id>:{usd,musd_24h_vol,…}}` price map | Cheap multi-coin price refresh for snapshots       |
| `GET /simple/token_price/{id}` | `{id}` = platform ID; `contract_addresses` (csv), `vs_currencies`                                                                          | `{<address>:{usd,…}}` token-price map   | Batch token-price lookup without full coin payload |

### AVAILABLE — Search & ID map

| Endpoint                                        | Params                    | Response (key fields)                                | Gateway need                                                 |
| ----------------------------------------------- | ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `GET /search`                                   | `query`                   | coins/categories/markets/exchanges/icos matches      | Symbol → CoinGecko ID resolution for gateway                 |
| `GET /coins/list`                               | `include_platform` (bool) | `[{id,symbol,name,platforms?}]` full coin list       | Static ID catalog / seed for symbol resolution               |
| `GET /asset_platforms`                          | `filter` (`chain`/`nft`)  | `[{id,chain_identifier,shortname,native_coin_id,…}]` | ChainId → platform-ID mapping table (replaces hardcoded map) |
| `GET /token_lists/{asset_platform_id}/all.json` | path platform ID          | Ethereum-token-list-standard token list              | Per-chain token allowlists                                   |
| `GET /simple/supported_vs_currencies`           | —                         | `["btc","eth","usd",…]`                              | `convert` validation for future multi-currency snapshots     |

### AVAILABLE — Coins

| Endpoint                              | Params                                                                                          | Response (key fields)                                                               | Gateway need                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `GET /coins/markets`                  | `vs_currency` (req), `ids`, `order`, `per_page`, `page`, `sparkline`, `price_change_percentage` | `[{id,symbol,current_price,market_cap,total_volume,price_change_percentage_24h,…}]` | Ranked market views / screener feed      |
| `GET /coins/{id}`                     | `localization`, `tickers`, `market_data`, `community_data`, `developer_data`, `sparkline`       | Full coin metadata + market data                                                    | Deep token detail page                   |
| `GET /coins/{id}/tickers`             | `exchange_ids`, `include_exchange_logo`, `page`, `order`, `depth`                               | CEX+DEX tickers per coin                                                            | Liquidity-source breakdown (venue-level) |
| `GET /coins/{id}/history`             | `date` (dd-mm-yyyy), `localization`                                                             | Price/MC/volume snapshot at date                                                    | Backfill / point-in-time snapshots       |
| 💼 `GET /coins/list/new`              | —                                                                                               | Latest ~200 newly listed coins                                                      | New-listing discovery cron               |
| 💼 `GET /coins/top_gainers_losers`    | `vs_currency`, `duration`                                                                       | Top-30 gainers + losers                                                             | Movers/alpha discovery widget            |
| 💼 `GET /coins/{id}/supply_breakdown` | —                                                                                               | Supply breakdown by holder class                                                    | FDV-vs-circulating refinement            |

### AVAILABLE — Coin charts

| Endpoint                                                         | Params                                          | Response (key fields)                | Gateway need                      |
| ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ | --------------------------------- |
| `GET /coins/{id}/market_chart`                                   | `vs_currency`, `days`, `interval`, `precision`  | `{prices,market_caps,total_volumes}` | Price-history charts              |
| `GET /coins/{id}/market_chart/range`                             | `vs_currency`, `from`, `to`, `precision`        | Same, bounded range                  | Custom-range charts / backtesting |
| `GET /coins/{id}/contract/{contract_address}/market_chart`       | platform + address; `vs_currency`, `days`       | Same, per token contract             | Token price-history charts        |
| `GET /coins/{id}/contract/{contract_address}/market_chart/range` | platform + address; `vs_currency`, `from`, `to` | Same, bounded range                  | Token custom-range charts         |
| `GET /coins/{id}/ohlc`                                           | `vs_currency`, `days`                           | `[[ts,open,high,low,close],…]`       | Candlestick charts                |
| 💼 `GET /coins/{id}/ohlc/range`                                  | `vs_currency`, `from`, `to`                     | Same, bounded range                  | Custom-range candles              |
| 👑 `GET /coins/{id}/circulating_supply_chart` (+ `/range`)       | `days` (or `from`/`to`)                         | Historical circulating supply        | Supply-dilution analysis          |
| 👑 `GET /coins/{id}/total_supply_chart` (+ `/range`)             | `days` (or `from`/`to`)                         | Historical total supply              | Supply-dilution analysis          |

### AVAILABLE — Categories / RWA / Exchanges / Derivatives

| Endpoint                                                                                                                                                             | Params                 | Response (key fields)                              | Gateway need                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------- | --------------------------------- |
| `GET /coins/categories/list`                                                                                                                                         | —                      | `[{category_id,name}]`                             | Category taxonomy                 |
| `GET /coins/categories`                                                                                                                                              | `order`                | Categories + market data (MC, volume)              | Sector-rotation views             |
| `GET /rwas/list`, `GET /rwas/markets`, `GET /rwas/{id}`, `GET /rwas/{id}/tickers`, `GET /rwas/{id}/market_chart`, `GET /rwas/issuers/list`, `GET /rwas/issuers/{id}` | RWA id / market params | RWA price/MC/volume/tickers/issuers                | Tokenized-asset coverage (future) |
| `GET /exchanges/list`                                                                                                                                                | —                      | `[{id,name}]`                                      | Exchange taxonomy                 |
| `GET /exchanges`                                                                                                                                                     | `per_page`, `page`     | Exchanges + trust_score/volume                     | Venue directory + trust filter    |
| `GET /exchanges/{id}` (+ `/tickers`, `/volume_chart`, 💼 `/volume_chart/range`)                                                                                      | exchange id            | Exchange data, top-100 tickers, BTC volume history | Venue-level liquidity             |
| `GET /derivatives/exchanges/list`, `GET /derivatives`, `GET /derivatives/exchanges`, `GET /derivatives/exchanges/{id}`                                               | — / exchange id        | Derivatives tickers, OI, exchange data             | Futures/OI overlay (future)       |
| `GET /entities/list`, `GET /{entity}/public_treasury/{coin_id}`, `GET /public_treasury/{entity_id}` (+ `/holding_chart`, `/transaction_history`)                     | entity/coin ids        | Public-company/government holdings                 | Treasury-holder intel             |

### AVAILABLE — NFTs / Trending / News / Global / Utility

| Endpoint                                                                                                                                                  | Params                  | Response (key fields)                              | Gateway need             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------- | ------------------------ |
| `GET /nfts/list`, `GET /nfts/{id}`, `GET /nfts/{asset_platform_id}/contract/{contract_address}`                                                           | id / platform + address | NFT collection data, floor price, 24h volume       | NFT collection snapshots |
| 💼 `GET /nfts/markets`, `GET /nfts/{id}/market_chart`, `GET /nfts/{asset_platform_id}/contract/{contract_address}/market_chart`, `GET /nfts/{id}/tickers` | market/chart params     | NFT floor/MC/volume history, per-marketplace floor | NFT market views         |
| `GET /search/trending`                                                                                                                                    | —                       | Trending coins/NFTs/categories (24h)               | Trending discovery feed  |
| 💼 `GET /news`                                                                                                                                            | —                       | Latest crypto news/guides                          | News enrichment          |
| 👑 `GET /insights`                                                                                                                                        | —                       | Coin insights                                      | Research overlay         |
| `GET /global`                                                                                                                                             | —                       | Active cryptos/markets, total MC, dominance        | Market-overview header   |
| `GET /global/decentralized_finance_defi`                                                                                                                  | —                       | Top-100 DeFi data (MC, volume)                     | DeFi sector view         |
| 💼 `GET /global/market_cap_chart`                                                                                                                         | `vs_currency`, `days`   | Global MC + volume history                         | Market-cycle charts      |
| `GET /exchange_rates`                                                                                                                                     | —                       | BTC rates vs fiat                                  | FX conversion            |
| `GET /ping`                                                                                                                                               | —                       | `{gecko_says}`                                     | Health check             |
| `GET /key`                                                                                                                                                | —                       | API usage (rate limits, credits)                   | Quota monitoring cron    |

### AVAILABLE — Onchain (GeckoTerminal surface, same key)

| Endpoint                                                                                                                                                                                                              | Params                                   | Response (key fields)                                              | Gateway need                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `GET /onchain/simple/networks/{network}/token_price/{addresses}`                                                                                                                                                      | network + csv addresses                  | `{data:{attributes:{token_prices,market_cap_usd,h24_volume_usd}}}` | Fresh-token price where `/coins/*` lacks data |
| 👑 `GET /onchain/simple/token_price/multi`                                                                                                                                                                            | cross-network addresses                  | Same, multi-network                                                | Cross-chain price batch                       |
| `GET /onchain/search/pools`                                                                                                                                                                                           | query (pool/token address, name, symbol) | Pool matches                                                       | Pool discovery                                |
| `GET /onchain/networks`, `GET /onchain/networks/{network}/dexes`                                                                                                                                                      | — / network                              | Networks, per-network DEXs                                         | Chain/venue taxonomy for DEX aggregation      |
| `GET /onchain/networks/{network}/pools/{address}`, `…/pools/multi/{addresses}`, `…/pools/{pool_address}/info`, `…/pools`, `…/dexes/{dex}/pools`, `…/tokens/{token_address}/pools`, 💼 `GET /onchain/pools/megafilter` | network/pool/token Dex params            | Pool price/liquidity/volume/metadata                               | DEX liquidity aggregation (todo-3)            |
| `GET /onchain/networks/new_pools`, `…/{network}/new_pools`, `GET /onchain/networks/trending_pools`, `…/{network}/trending_pools`, 💼 `GET /onchain/pools/trending_search`                                             | network                                  | New/trending pools                                                 | New-pair + momentum discovery                 |
| `GET /onchain/networks/{network}/tokens/{address}`, `…/tokens/multi/{addresses}`, 👑 `GET /onchain/tokens/multi`, `…/tokens/{address}/info`, `GET /onchain/tokens/info_recently_updated`                              | network/token address                    | Token price/MC/liquidity/metadata                                  | Token detail + recently-updated watch         |
| `GET /onchain/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}`, 💼 `…/tokens/{token_address}/ohlcv/{timeframe}`                                                                                             | pool/token + timeframe                   | OHLCV candles                                                      | DEX charting                                  |
| `GET /onchain/networks/{network}/pools/{pool_address}/trades`, 💼 `…/trades/range`, `…/tokens/{token_address}/trades`, `…/trades/range`, `…/top_traders`                                                              | pool/token address (+range)              | Trades, top traders                                                | Whale/flow signals                            |
| 💼 `GET /onchain/wallets/{address}/balances`, `…/{network}/wallets/{address}/transfers`, `…/wallets/{address}/trades`, `GET /onchain/wallets/{address}/pnl`                                                           | wallet address                           | Balances, transfers, trades, PnL                                   | KOL-wallet tracking                           |
| 💼 `GET /onchain/networks/{network}/tokens/{address}/top_holders`, `…/holders_chart`                                                                                                                                  | token address                            | Top holders, holders history                                       | Holder-concentration risk                     |
| 💼 `GET /onchain/categories`, `GET /onchain/categories/{category_id}/pools`                                                                                                                                           | category id                              | GeckoTerminal categories + pools                                   | DEX sector views                              |
