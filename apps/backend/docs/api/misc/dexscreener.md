# DexScreener API

## Overview
DexScreener provides a comprehensive set of public APIs for token data, trending metas, community takeovers, ads, boosts, and more. All endpoints are rate‑limited to 60 req/min (free tier).

## Endpoints

All endpoints: `https://api.dexscreener.com`

| Method | Path | Description | Specific |
|--------|------|-------------|----------|
| GET | `/latest/dex/tokens/{tokenAddress}` | Pairs by token address | Token data |
| GET | `/token-pairs/v1/{chainId}/{tokenAddress}` | Pairs by chain + token address | Token data |
| GET | `/tokens/v1/{chainId}/{tokenAddresses}` | Token info (batch, comma‑separated) | Token data |
| GET | `/latest/dex/search?q={query}` | Search pairs by symbol or contract | Token data |
| GET | `/latest/dex/pairs/{chainId}/{pairId}` | Pairs by chain + pair address | Pair detail |
| GET | `/orders/v1/{chainId}/{tokenAddress}` | Orders (buy/sell walls) | On‑chain |
| GET | `/token-profiles/latest/v1` | Latest token profiles | Discovery |
| GET | `/token-profiles/recent-updates/v1` | Recently updated profiles | Discovery |
| GET | `/community-takeovers/latest/v1` | Latest community takeovers (CTOs) | Discovery |
| GET | `/ads/latest/v1` | Latest ads | Discovery |
| GET | `/token-boosts/latest/v1` | Latest boosts | Discovery |
| GET | `/token-boosts/top/v1` | Top boosts | Discovery |
| GET | `/metas/trending/v1` | Trending metas (categories) | Discovery |
| GET | `/metas/meta/v1/{slug}` | Token pairs within a meta | Discovery |

## Reference Links

- Full API reference → https://docs.dexscreener.com/api/reference
- WebSocket streaming → https://docs.dexscreener.com/api/websockets
- Trending tokens → https://docs.dexscreener.com/trending
- Boosting system → https://docs.dexscreener.com/boosting
- Metas (categories) → https://docs.dexscreener.com/metas
- Token listing guide → https://docs.dexscreener.com/token-listing
- DEX listing → https://docs.dexscreener.com/dex-listing
- Chain listing → https://docs.dexscreener.com/chain-listing
- TradingView charts overlay → https://docs.dexscreener.com/tradingview-charts
- API terms & conditions → https://docs.dexscreener.com/api/api-terms-and-conditions

## Primary Endpoint (Token Data)

```
GET https://api.dexscreener.com/latest/dex/tokens/{tokenAddress}
```

## Parameters
- `tokenAddress`: Token contract address (e.g., `0x6982508145454Ce325dDbE47a25d4ec3d2311933`)

## Response

```json
{
  "pairs": [
    {
      "dexId": "uniswapv3",
      "pairAddress": "0x...",
      "baseToken": {
        "address": "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
        "symbol": "PEPE",
        "name": "Pepe"
      },
      "quoteToken": {
        "symbol": "WETH",
        "address": "0x..."
      },
      "price": {
        "usd": "0.00001234",
        "usdChange24h": "5.2"
      },
      "liquidity": {
        "usd": "12400000",
        "base": "500000000000",
        "quote": "1200"
      },
      "volume": {
        "h24": "340000000",
        "h6": "50000000",
        "h1": "10000000"
      },
      "pairCreatedAt": 1640000000000
    }
  ]
}
```

## Usage in Bot

```javascript
async function getDexScreenerData(address) {
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${address}`
  );
  const data = await response.json();
  
  if (!data.pairs || data.pairs.length === 0) {
    return null;
  }
  
  const pair = data.pairs[0]; // Use first pair (usually highest liquidity)
  
  return {
    price: pair.price.usd,
    priceChange24h: pair.price.usdChange24h,
    liquidityUSD: pair.liquidity.usd,
    volume24h: pair.volume.h24,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    pairCreatedAt: pair.pairCreatedAt
  };
}
```

## Usage: Token Profile / Socials

The response `info` object includes links, socials, images. Useful for filling the **🧰** line in the bot response:

```javascript
const info = pair.info;
if (info) {
  const website = info.websites?.[0]?.url;
  const twitter = info.socials?.find(s => s.platform === 'twitter')?.handle;
  const telegram = info.socials?.find(s => s.platform === 'telegram')?.handle;
}
```

## WebSocket Streaming

DexScreener offers real‑time pair updates via WebSocket.

```
wss://api.dexscreener.com/token-pairs/v1/{chainId}/{tokenAddress}
```

## Rate Limits
- **60 requests/minute** across all endpoints (free tier)
- No API key required for basic usage

## Notes
- Returns multiple pairs — always sort by liquidity (desc) to pick the best one
- `pairCreatedAt` → use to calculate token age
- `fdv` and `marketCap` are available in the pair object
- `txns` object contains buy/sell counts per timeframe (m5, h1, h6, h24)
- `priceChange` contains percentage changes per timeframe
- `boosts.active` shows active boost count (visibility score)
- Chain IDs: `ethereum`, `bsc`, `polygon`, `solana`, `arbitrum`, `base`, etc.
- WebSockets available for real‑time streaming (see docs above)