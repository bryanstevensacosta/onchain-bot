# Bot Architecture

## Overview
Node.js Telegram bot using `node-telegram-bot-api`.

## Directory Structure

```
src/
├── index.js              # Entry point
├── bot/
│   ├── setup.js          # Telegram bot initialization
│   ├── handlers/
│   │   ├── command.js    # /token, /start, /help
│   │   └── error.js      # Error handling
│   └── middleware.js     # Logger, rate limiter
├── chain/
│   ├── detection.js      # Chain detection pipeline
│   ├── evm.js            # EVM validation (EIP-55, RPC)
│   └── solana.js         # Solana validation (Base58, RPC)
├── api/
│   ├── dexscreener.js    # DexScreener integration
│   ├── geckoterminal.js  # GeckoTerminal integration
│   ├── coingecko.js      # CoinGecko integration
│   ├── etherscan.js      # Etherscan integration
│   └── solscan.js        # Solscan integration
├── services/
│   ├── token-service.js  # Orchestrates all API calls per chain
│   ├── cache.js          # In-memory cache layer
│   └── risk-score.js     # Risk scoring engine
├── models/
│   └── token.js          # Data models
├── utils/
│   ├── format.js         # Number formatting, display
│   └── validation.js     # Input validation
└── config/
    └── index.js          # Config from .env
```

## Data Flow

```
User sends address or symbol
    ↓
InputResolver (parse & chain detect)
    ↓
ChainDetector (format + RPC probes)
    ↓
TokenService.orchestrate()
    ├── DexScreener → price, liquidity, volume
    ├── CoinGecko   → market cap, social links
    ├── Etherscan   → holders, supply (ETH)
    └── Solscan     → holders, top holders (SOL)
    ↓
RiskScoreEngine
    ↓
ResponseFormatter
    ↓
Telegram reply
```

## Orchestrator

```javascript
class TokenService {
  async getTokenData(address, chain) {
    const cached = cache.get(address);
    if (cached) return cached;
    
    const data = await this.fetchFromSources(address, chain);
    const scored = await riskScore.calculate(data);
    
    cache.set(address, { data, scored }, 300); // 5 min TTL
    
    return { data, scored };
  }
  
  async fetchFromSources(address, chain) {
    const [dex, gecko, explorer] = await Promise.all([
      dexscreener.getToken(address),
      coingecko.getToken(address),
      chain === 'evm' 
        ? etherscan.getToken(address)
        : solscan.getToken(address)
    ]);
    
    return { dex, gecko, explorer, chain };
  }
}
```

## Error Handling

```javascript
async function handleError(ctx, error) {
  console.error(`Error processing ${ctx.message.text}:`, error);
  
  if (error.message.includes('RPC')) {
    await ctx.reply('❌ RPC node unavailable. Try again.');
  } else if (error.code === 'ETIMEDOUT') {
    await ctx.reply('❌ API timeout. Try again.');
  } else if (error.message.includes('rate limit')) {
    await ctx.reply('❌ Rate limited. Wait a moment.');
  } else {
    await ctx.reply('❌ Unexpected error. Try again.');
  }
}
```