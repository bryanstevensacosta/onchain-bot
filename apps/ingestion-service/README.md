# Ingestion Service

Centralized Telegram ingestion service that eliminates resource duplication across multiple backend environments.

## Overview

This service provides a single MTProto client connection to Telegram channels and distributes messages to multiple backend environments (dev, staging, production) via Server-Sent Events (SSE). This eliminates 3x duplication of:
- MTProto connections
- Media downloads
- Message processing

## Architecture

```
Telegram API (MTProto)
         ↓
   Ingestion Service (Port 3031)
   • MTProto Client
   • Media Downloader
   • SSE Broadcaster
         ↓
    SSE Streams
         ↓
   Backend Clients (DEV, STAGING, PROD)
```

## Features

- **Single MTProto Connection**: One session for all environments
- **SSE Streaming**: Real-time message distribution with automatic reconnection
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

Required configuration:
- `INGESTION_TELEGRAM_API_ID` - Telegram API ID
- `INGESTION_TELEGRAM_API_HASH` - Telegram API Hash
- `INGESTION_TELEGRAM_MTPROTO_SESSION` - MTProto session string

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

See `.kiro/specs/centralized-ingestion-service/` for:
- `requirements.md` - Detailed requirements
- `design.md` - Architecture and design decisions
- `tasks.md` - Implementation task breakdown

## License

UNLICENSED - Private project
