# Ingestion Service

Per-env Telegram ingestion service: each environment runs its OWN instance (same image, 1:1 with its backend) with its own MTProto session, its own `<base>_ingestion` DB, and its own uploads volume.

> Fuente de verdad: [`AGENTS.md`](AGENTS.md) (§Invariantes per-env, §Persistencia, §Deploy).

## Overview

Each instance holds ONE MTProto client connection to Telegram channels and distributes messages to ITS backend only (dev, staging twin, or prod) via Server-Sent Events (SSE). One triple per env, never shared (sharing causes `AUTH_KEY_DUPLICATED`).

| Env          | Host port → container `:3031` | DB                                             | Backend                 |
| ------------ | ----------------------------- | ---------------------------------------------- | ----------------------- |
| dev local    | `:3031`                       | `onchain_bot_ingestion`                        | `http://localhost:3030` |
| staging twin | `:3033`                       | `onchain_bot_staging_ingestion` (starts EMPTY) | twin backend            |
| prod         | `:3032`                       | `onchain_bot_ingestion`                        | prod backend            |

DB names are TARGET state post-rename; live Oracle DBs keep pre-rename names until `.omo/runbooks/rename-onchain-bot-db.md` (phase 3) executes.

## Architecture (per-env, since 2026-09-22 — the old singleton serving all envs is retired)

```
Telegram API (MTProto)
         ↓
   Ingestion instance of THIS env (container :3031)
   • MTProto Client (own triple from its own .env)
   • Media Downloader → own uploads/crypto-news/media/
   • SSE Broadcaster (open stream, no gate)
   • Own <base>_ingestion DB (crypto_news_sources/messages/media)
         ↓
    SSE Stream
         ↓
   ITS backend only (1:1: dev :3031, twin :3033, prod :3032)
```

## Features

- **One MTProto session per instance/env**: each env has its own `INGESTION_TELEGRAM_MTPROTO_*` triple (never shared)
- **SSE Streaming**: real-time message delivery to its own backend, with automatic reconnection (open stream, no register gate; no replay — lossy by design)
- **Media Serving**: HTTP endpoint for downloaded media files
- **Anti-Ban Protection**: Staggered polling, FLOOD_WAIT handling, sleep windows
- **Health Monitoring**: Comprehensive health and metrics endpoints

## Getting Started

### Prerequisites

- Node.js 22+
- Redis (for cursor persistence)
- Valid Telegram API credentials

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required configuration (per-instance `.env`, never shared across envs):

- `INGESTION_TELEGRAM_MTPROTO_API_ID` - Telegram API ID
- `INGESTION_TELEGRAM_MTPROTO_API_HASH` - Telegram API Hash
- `INGESTION_TELEGRAM_MTPROTO_SESSION` - MTProto session string (generate via `npm run telegram:gen-session`)

### Development

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

## API Endpoints

### SSE Streaming

```
GET /api/ingestion/stream
```

Establishes SSE connection for real-time message delivery.

### Media Serving

```
GET /api/media/:channelId/:messageId/:index
```

Serves downloaded media files.

### Health Check

```
GET /api/health
```

Returns service health status, MTProto connection state, and metrics.

### Feed reads (feed-unification; the old `/api/feed/*` paths return 404)

```
GET /api/feed/sources
GET /api/feed/messages?limit=50&type=kol|crypto-news
GET /api/media/:channelId/:messageId/:index
```

Each backend/frontend queries ITS env's instance (dev `:3031`, twin `:3033`, prod `:3032`).

### Channel Metadata

```
GET /api/channels
```

Returns monitored channel metadata.

## Testing

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Documentation

- [`AGENTS.md`](AGENTS.md) — per-env invariants, SSE contract, safety config, gaps
- `docs/deployment/` (repo root) — ingestion runbook, staging-twin runbook, media-ownership, post-deploy

## License

UNLICENSED - Private project
