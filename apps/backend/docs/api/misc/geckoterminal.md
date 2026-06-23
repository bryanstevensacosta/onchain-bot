# GeckoTerminal API (v2-beta)

## Overview
GeckoTerminal provides on-chain data for tokens and pools across 90+ chains. Official docs: https://api.geckoterminal.com/docs/index.html

**Base URL:** `https://api.geckoterminal.com/api/v2`

## Versioning
Set API version via `Accept` header:
```
Accept: application/json;version=20230203
```
If omitted, the latest version is used.

## Rate Limits
- **~10 requests/minute** (may fluctuate with traffic)
- Higher limits via any CoinGecko paid plan (onchain endpoints)

## Data Freshness
All endpoints cached for **1 minute**. Data updated 2–3 seconds after a transaction is confirmed on-chain.

---

## Networks

```
GET /networks
```

Returns supported networks with `id` (e.g. `eth`, `solana`, `bsc`) and `coingecko_asset_platform_id`.

---

## Dexes

```
GET /networks/{network}/dexes
```

Returns supported DEXes for a network (ID map).

---

## Pools

| Endpoint | Description |
|----------|-------------|
| `GET /networks/trending_pools` | Trending pools across all chains |
| `GET /networks/{network}/trending_pools` | Trending pools by network |
| `GET /networks/{network}/pools/{address}` | Single pool detail |
| `GET /networks/{network}/pools/multi/{addresses}` | Multiple pools (comma-separated) |
| `GET /networks/{network}/pools` | Top pools by network |
| `GET /networks/{network}/dexes/{dex}/pools` | Top pools by DEX |
| `GET /networks/{network}/new_pools` | New pools by network |
| `GET /networks/new_pools` | New pools across all chains |
| `GET /search/pools` | Search pools |

### Pool Detail Response Fields

| Field | Description |
|-------|-------------|
| `base_token_price_usd` | Token price in USD |
| `base_token_price_native_currency` | Token price in native currency |
| `base_token_balance` | Balance of base token in pool |
| `base_token_liquidity_usd` | Base token liquidity in USD |
| `quote_token_*` | Same fields for quote token |
| `name` | Pool name (e.g. "WETH / USDC 0.05%") |
| `pool_name` | Pool name (short) |
| `pool_fee_percentage` | Fee tier (e.g. "0.05") |
| `address` | Pool contract address |
| `pool_created_at` | Creation timestamp (ISO 8601) |
| `fdv_usd` | Fully diluted valuation |
| `market_cap_usd` | Market capitalization |
| `price_change_percentage` | `m5`, `m15`, `m30`, `h1`, `h6`, `h24` |
| `transactions` | `{m5..h24: {buys, sells, buyers, sellers}}` |
| `volume_usd` | Volume per timeframe |
| `net_buy_volume_usd` | Net buy volume per timeframe |
| `buy_volume_usd` | Buy volume per timeframe |
| `sell_volume_usd` | Sell volume per timeframe |
| `reserve_in_usd` | Total pool liquidity |
| `locked_liquidity_percentage` | LP locked percentage (e.g. "0.0") |
| `launchpad_details` | Launchpad info (nullable) |

---

## Tokens

| Endpoint | Description |
|----------|-------------|
| `GET /networks/{network}/tokens/{token_address}/pools` | Top pools by token address |
| `GET /networks/{network}/tokens/{address}` | Token data (price, FDV, MC, supply, volume) |
| `GET /networks/{network}/tokens/multi/{addresses}` | Multiple tokens (comma-separated) |
| `GET /networks/{network}/tokens/{address}/info` | **Token info with socials, holders, honeypot check** |
| `GET /networks/{network}/pools/{pool_address}/info` | Pool tokens info (both tokens) |
| `GET /tokens/info_recently_updated` | Most recently updated tokens list |

### Token Info (`/tokens/{address}/info`) — **most useful for bots**

Returns socials, description, holders, honeypot status, GT score.

```json
{
  "data": {
    "id": "eth_0xdac17f958d2ee523a2206206994597c13d831ec7",
    "type": "token",
    "attributes": {
      "address": "0xdac17f958d2ee523a2206206994597c13d831ec7",
      "name": "Tether USD",
      "symbol": "USDT",
      "image_url": "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      "image": {
        "thumb": "...",
        "small": "...",
        "large": "..."
      },
      "coingecko_coin_id": "tether",
      "websites": ["https://tether.to/"],
      "description": "Tether (USDT) is a cryptocurrency...",
      "gt_score": 92.66,
      "gt_score_details": {
        "pool": 87.5,
        "transaction": 0,
        "creation": 100,
        "info": 100,
        "holders": 0
      },
      "discord_url": null,
      "telegram_handle": null,
      "twitter_handle": "Tether_to",
      "categories": [],
      "gt_categories_id": [],
      "holders": {
        "count": 7041203,
        "distribution_percentage": {
          "top_10": "45.5782",
          "11_30": "13.4293",
          "31_50": "3.9681",
          "rest": "37.0244"
        },
        "last_updated": "2025-03-12T05:28:50Z"
      },
      "mint_authority": null,
      "freeze_authority": null,
      "is_honeypot": false
    }
  }
}
```

### Token Basic (`/tokens/{address}`)

Returns price, FDV, market cap, supply, volume, top pool relationships.

```
GET /networks/{network}/tokens/{address}
```

```json
{
  "data": {
    "type": "token",
    "attributes": {
      "address": "0x...",
      "name": "Pepe",
      "symbol": "PEPE",
      "decimals": 18,
      "image_url": "https://...",
      "coingecko_coin_id": "pepe",
      "total_supply": "420689899646442539491331875576506.0",
      "normalized_total_supply": "420689899646443.0",
      "price_usd": "0.000002879865454",
      "fdv_usd": "1191609051.90731",
      "total_reserve_in_usd": "12008462.24",
      "volume_usd": { "h24": "169633.36" },
      "market_cap_usd": "1211530597.84"
    },
    "relationships": {
      "top_pools": { "data": [...] }
    }
  }
}
```

---

## OHLCV (Charts)

```
GET /networks/{network}/pools/{pool_address}/ohlcv/{timeframe}
```

Timeframes: `minute`, `hour`, `day`.

Returns `ohlcv_list: [[timestamp, open, high, low, close, volume], ...]`.

**Response:**
```json
{
  "data": {
    "type": "ohlcv_request_response",
    "attributes": {
      "ohlcv_list": [
        [1712534400, 3454.61, 3660.85, 3417.91, 3660.85, 306823.27],
        [1712448000, 3362.60, 3455.28, 3352.95, 3454.61, 242144.86]
      ]
    }
  },
  "meta": {
    "base": { "address": "...", "name": "Wrapped Ether", "symbol": "WETH" },
    "quote": { "address": "...", "name": "Tether USD", "symbol": "USDT" }
  }
}
```

---

## Simple Price

```
GET /simple/networks/{network}/token_price/{addresses}
```

Returns minimal price, market cap, volume, price change, reserve for token addresses (comma-separated). Fast endpoint for refreshes.

```json
{
  "data": {
    "type": "simple_token_price",
    "attributes": {
      "token_prices": { "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "2289.33" },
      "market_cap_usd": { "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "6692452895.77" },
      "h24_volume_usd": { "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "965988358.73" },
      "h24_price_change_percentage": { "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "3.38" },
      "total_reserve_in_usd": { "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "1576179559.94" }
    }
  }
}
```

---

## Trades

```
GET /networks/{network}/pools/{pool_address}/trades
```

Returns past 24 hours of trades for a pool.

```json
{
  "data": [{
    "type": "trade",
    "attributes": {
      "block_number": 19612255,
      "block_timestamp": "2024-04-08T16:52:35Z",
      "tx_hash": "0x...",
      "tx_from_address": "0x...",
      "from_token_amount": "1.517",
      "to_token_amount": "5535.09",
      "price_from_in_usd": "3656.89",
      "price_to_in_usd": "1.002",
      "kind": "buy",
      "volume_in_usd": "5548.15"
    }
  }]
}
```

---

## GT Score (Quality Score)

The `gt_score` field in token info (0–100) measures token quality based on:
- **pool**: LP health
- **transaction**: organic volume
- **creation**: age/reputation
- **info**: socials/website completeness
- **holders**: distribution

Higher score → more trustworthy.

---

## Integration in Bot

```javascript
class GeckoTerminalAPI {
  constructor() {
    this.base = 'https://api.geckoterminal.com/api/v2';
  }

  async getTokenInfo(network, address) {
    // Fetch both basic + info in parallel
    const [basic, info] = await Promise.all([
      fetch(`${this.base}/networks/${network}/tokens/${address}`).then(r => r.json()),
      fetch(`${this.base}/networks/${network}/tokens/${address}/info`).then(r => r.json())
    ]);
    if (!basic.data) return null;

    const b = basic.data.attributes;
    const i = info.data?.attributes;

    return {
      price: b.price_usd,
      fdv: b.fdv_usd,
      marketCap: b.market_cap_usd,
      volume24h: b.volume_usd?.h24,
      totalSupply: b.normalized_total_supply,
      priceChange24h: i?.price_change_percentage?.h24,
      holders: i?.holders?.count,
      holderDistribution: i?.holders?.distribution_percentage,
      website: i?.websites?.[0],
      twitter: i?.twitter_handle,
      telegram: i?.telegram_handle,
      description: i?.description,
      gtScore: i?.gt_score,
      isHoneypot: i?.is_honeypot,
      mintAuthority: i?.mint_authority,
      freezeAuthority: i?.freeze_authority,
    };
  }

  async getTokenPools(network, address) {
    const res = await fetch(
      `${this.base}/networks/${network}/tokens/${address}/pools`
    );
    const data = await res.json();
    return (data.data || [])
      .map(p => p.attributes)
      .sort((a, b) => b.reserve_in_usd - a.reserve_in_usd);
  }
}
```

## Notes

- **Rate limit is ~10/min** → cache aggressively; use DexScreener as primary, GeckoTerminal as secondary for socials/honeypot/holders.
- Token IDs format: `{network}_{address}` (e.g. `eth_0x...`, `solana_...`).
- Network IDs for EVM: `eth`, `bsc`, `polygon_pos`, `arbitrum`, `base`, `linea`, etc.
- Network IDs for non-EVM: `solana`, `aptos`, `sui-network`, `ton`, etc.
- `/tokens/{address}/info` is the richest endpoint → holders, distribution, socials, GT score, honeypot flag.
- OHLCV path: `/networks/{network}/pools/{pool_address}/ohlcv/{timeframe}` (note: `ohlcv` not `ohlc`).
