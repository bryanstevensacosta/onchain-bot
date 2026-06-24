# Crypto Token Bot Documentation

## Overview
Telegram bot that provides comprehensive token analytics when users send a token address or symbol.

## Structure

```
docs/
├── README.md                 # This file
├── api/
│   ├── dexscreener.md        # Price, liquidity, volume, pairs, DEX
│   ├── geckoterminal.md      # Price, FDV, market cap, volume, liquidity, pools, OHLC
│   ├── coingecko.md          # Market cap, volume, social links, description
│   ├── etherscan.md          # Holders, supply, contract verification
│   └── solscan.md            # Solana: holders, top holders, supply
├── bot/
│   ├── architecture.md       # Bot structure and flow
│   ├── commands.md           # Command handling
│   └── telegram-setup.md     # Telegram Bot API setup
├── models/
│   └── token-data.md         # Data models and schemas
└──   deployment.md           # Deployment guide
```

## Quick Start

1. Set up Telegram Bot via @BotFather
2. Configure API keys in `.env`
3. Run `npm install && npm start`
4. Send a contract address or ticker symbol to the bot