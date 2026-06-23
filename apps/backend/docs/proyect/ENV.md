# Environment Variables

All environment variables are loaded from `.env` at the project root via `@nestjs/config`.

> ⚠️ **Never commit `.env` to git.** It's already in `.gitignore`. Use `.env.example` as template.

## How it Works

```typescript
// src/app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env'],
  load: [appConfig],
});
```

The `appConfig` factory in `src/shared/config/app.config.ts` reads all env vars and exposes them via `ConfigService` as a typed object:

```typescript
const cfg = app.get(ConfigService).get<AppConfig>('app');
console.log(cfg.helius.mainnet.rpcUrl);
```

## Variables Reference

### Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `PORT` | No | `3000` | HTTP port |

### Alchemy (EVM RPC)

| Variable | Required | Description |
|----------|----------|-------------|
| `ALCHEMY_API_KEY` | Yes | Get at https://dashboard.alchemy.com/ |

### Birdeye (Token Market Data)

| Variable | Required | Description |
|----------|----------|-------------|
| `BIRDEYE_API_KEY` | Yes | Get at https://birdeye.so/ |

### FluxRPC (Multi-chain RPC)

| Variable | Required | Description |
|----------|----------|-------------|
| `FLUXRPC_API_KEY` | Yes | API key |
| `FLUXRPC_RPC` | Yes | JSON-RPC endpoint URL |
| `FLUXRPC_WS` | No | WebSocket endpoint URL |

### Helius (Solana RPC + Enhanced APIs)

| Variable | Required | Description |
|----------|----------|-------------|
| `HELIUS_API_KEY` | Yes | Get at https://helius.dev/ |
| `HELIUS_RPC_URL_MAINNET` | Yes | Solana mainnet RPC |
| `HELIUS_GATEKEEPER_RPC_URL_MAINNET` | No | Gateway RPC fallback |
| `HELIUS_WS_MAINNET` | Yes | WebSocket endpoint |
| `HELIUS_PARSE_SOLANA_TRANSACTION_MAINNET` | Yes | Enhanced transactions API |
| `HELIUS_PARSE_SOLANA_TRANSACTION_HISTORY_MAINNET` | Yes | History API |
| `HELIUS_RPC_URL_DEVNET` | No | Devnet RPC |
| `HELIUS_WS_DEVNET` | No | Devnet WS |
| `HELIUS_PARSE_SOLANA_TRANSACTION_DEVNET` | No | Devnet Enhanced API |
| `HELIUS_PARSE_SOLANA_TRANSACTION_HISTORY_DEVNET` | No | Devnet History API |

### Mobula

| Variable | Required | Description |
|----------|----------|-------------|
| `MOBULA_API_KEY` | Yes | Get at https://mobula.io/ |

### Moralis

| Variable | Required | Description |
|----------|----------|-------------|
| `MORALIS_API_KEY` | Yes | Get at https://moralis.io/ |

### Pump.dev

| Variable | Required | Description |
|----------|----------|-------------|
| `PUMPDEV_API_KEY` | Yes | API key |
| `PUMPDEV_WALLET_PUBLIC` | Yes | Trading wallet public key |
| `PUMPDEV_WALLET_PRIVATE` | Yes | Trading wallet private key |

### Telegram

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | For bot | Bot API token from @BotFather |
| `TELEGRAM_MTPROTO_API_ID` | For ingestion | Get at https://my.telegram.org/apps |
| `TELEGRAM_MTPROTO_API_HASH` | For ingestion | Same as above |
| `TELEGRAM_MTPROTO_SESSION` | For ingestion | StringSession after auth |

## Minimum Required to Run

The app **starts successfully** even with empty `.env` (no required vars). Telegram BC will simply log a warning about missing MTProto credentials.

To use specific BCs, populate the corresponding vars.

## Adding a New BC

When creating a new Bounded Context:

1. Add env vars to `.env.example` (template)
2. Add them to `.env` (real values, gitignored)
3. Extend `AppConfig` interface in `src/shared/config/app.config.ts`
4. Read from `process.env` in the `appConfig` factory
5. Inject `ConfigService` and read with `get<AppConfig>('app')`
