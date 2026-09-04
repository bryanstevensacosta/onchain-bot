# Design Document: Shared Ingestion Service with Multi-Backend Broadcast

## Overview

This document details the technical design for enabling a single ingestion-service instance to broadcast Telegram messages to multiple backend instances (production and staging) via Server-Sent Events (SSE). The design eliminates duplicate MTProto connections, media downloads, and ingestion processing while maintaining backend independence.

## High-Level Architecture

### System Components

```mermaid
graph TB
    subgraph "Ingestion Service"
        MTProto[MTProto Listener]
        ChannelProvider[Multi-Backend Channel Provider]
        BackfillBuffer[Backfill Buffer<br/>Ring: 5000 msgs<br/>DB: 72h retention]
        SSEBroadcast[SSE Broadcast Service]
        CircuitBreaker[Circuit Breaker per Backend]
        MediaDownloader[Media Downloader]
    end

    subgraph "Shared Storage"
        MediaVolume[Media Volume<br/>/uploads/crypto-news/media]
        BufferDB[(Backfill DB<br/>TypeORM)]
    end

    subgraph "Backend Production"
        ProdReg[Registration Client]
        ProdSSE[SSE Subscriber]
        ProdFilter[Message Filter]
        ProdDB[(Production DB)]
    end

    subgraph "Backend Staging"
        StageReg[Registration Client]
        StageSSE[SSE Subscriber]
        StageFilter[Message Filter]
        StageDB[(Staging DB)]
    end

    Telegram[Telegram MTProto API] -->|Messages| MTProto

    ProdReg -->|POST /register| ChannelProvider
    StageReg -->|POST /register| ChannelProvider

    ChannelProvider -->|Channel Union| MTProto
    MTProto -->|Raw Messages| MediaDownloader
    MediaDownloader -->|Save| MediaVolume
    MTProto -->|Broadcast Events| BackfillBuffer
    BackfillBuffer -->|Store| BufferDB
    BackfillBuffer --> SSEBroadcast

    SSEBroadcast -->|via Circuit Breaker| CircuitBreaker
    CircuitBreaker -->|SSE Stream| ProdSSE
    CircuitBreaker -->|SSE Stream| StageSSE

    ProdSSE -->|Filter by Whitelist| ProdFilter
    StageSSE -->|Filter by Whitelist| StageFilter

    ProdFilter -->|Persist| ProdDB
    StageFilter -->|Persist| StageDB

    ProdFilter -.->|Read Media| MediaVolume
    StageFilter -.->|Read Media| MediaVolume
```

### Sequence Diagrams

#### Backend Registration Flow

```mermaid
sequenceDiagram
    participant Backend
    participant RegController as Registration Controller
    participant ChannelProvider as Channel Provider Service
    participant TelegramModule as Telegram Module

    Backend->>RegController: POST /api/ingestion/backends/register<br/>{backendId, sourceWhitelist}
    RegController->>ChannelProvider: registerBackend(backendId, whitelist)
    ChannelProvider->>ChannelProvider: Store registration in memory
    ChannelProvider->>ChannelProvider: Compute new Channel_Union
    ChannelProvider->>ChannelProvider: Calculate diff (added, removed channels)

    alt Channels added
        ChannelProvider->>TelegramModule: subscribeTo(addedChannels)
        TelegramModule->>TelegramModule: Start MTProto subscriptions
    end

    alt Channels removed
        ChannelProvider->>TelegramModule: unsubscribeFrom(removedChannels)
        TelegramModule->>TelegramModule: Stop MTProto subscriptions
    end

    ChannelProvider-->>RegController: {registered: true, channelUnionSize}
    RegController-->>Backend: 200 OK

    Backend->>RegController: GET /api/ingestion/stream?backendId=X
    RegController->>RegController: Validate backendId is registered
    RegController-->>Backend: SSE stream connection established
```

#### Message Broadcast Flow

```mermaid
sequenceDiagram
    participant Telegram
    participant MTProto as MTProto Listener
    participant MediaDown as Media Downloader
    participant BackfillBuf as Backfill Buffer
    participant SSEBroadcast as SSE Broadcast Service
    participant CircuitBreaker as Circuit Breaker
    participant Backend1 as Backend (Prod)
    participant Backend2 as Backend (Stage)

    Telegram->>MTProto: New message from channel
    MTProto->>MTProto: Transform to BroadcastEvent

    alt Message has media
        MTProto->>MediaDown: downloadMedia(message)
        MediaDown->>MediaDown: Save to /uploads/crypto-news/media
        MediaDown-->>MTProto: mediaPath
        MTProto->>MTProto: Add mediaPath to BroadcastEvent
    end

    MTProto->>BackfillBuf: add(broadcastEvent)
    BackfillBuf->>BackfillBuf: Add to ring buffer (5000 cap)
    BackfillBuf->>BackfillBuf: Persist to DB (async)

    MTProto->>SSEBroadcast: broadcast(broadcastEvent)

    par Broadcast to all backends
        SSEBroadcast->>CircuitBreaker: send(backend1, event)
        CircuitBreaker->>CircuitBreaker: Check circuit state
        alt Circuit closed
            CircuitBreaker->>Backend1: SSE event: data
            Backend1->>Backend1: Filter by sourceWhitelist
            alt Channel in whitelist
                Backend1->>Backend1: Persist to DB
            end
        else Circuit open
            CircuitBreaker->>CircuitBreaker: Skip send, log failure
        end

        SSEBroadcast->>CircuitBreaker: send(backend2, event)
        CircuitBreaker->>CircuitBreaker: Check circuit state
        alt Circuit closed
            CircuitBreaker->>Backend2: SSE event: data
            Backend2->>Backend2: Filter by sourceWhitelist
            alt Channel in whitelist
                Backend2->>Backend2: Persist to DB
            end
        else Circuit open
            CircuitBreaker->>CircuitBreaker: Skip send, log failure
        end
    end
```

## API Contracts

### Backend Registration Endpoint

```typescript
// POST /api/ingestion/backends/register
// Location: apps/ingestion-service/src/stream/api/http/backend-registration.controller.ts

interface RegisterBackendRequest {
  backendId: string; // Unique identifier (e.g., "production", "staging")
  sourceWhitelist: string[]; // Array of Telegram channel/user IDs
  apiVersion?: string; // API version for future compatibility (default: "v1")
}

interface RegisterBackendResponse {
  registered: boolean;
  channelUnionSize: number; // Total unique channels across all backends
  message?: string; // Optional info message
}
```

### SSE Stream Endpoint

```typescript
// GET /api/ingestion/stream?backendId={id}&lastSeenTimestamp={ts}
// Location: apps/ingestion-service/src/stream/api/http/sse-stream.controller.ts

// Event Types:
// 1. broadcast - Real-time message
// 2. backfill - Missed message during reconnection
// 3. backfill-complete - End of backfill sequence
// 4. backfill-unavailable - Disconnection > 72h
// 5. heartbeat - Keep-alive every 30s
```

## Data Structures

### BroadcastEvent Schema

```typescript
// Location: apps/ingestion-service/src/stream/domain/broadcast-event.vo.ts

export class BroadcastEvent {
  readonly eventId: string; // UUID v4
  readonly timestamp: number; // Unix timestamp (ms)
  readonly channelId: string; // Source Telegram channel/user ID
  readonly messageId: number; // Telegram message ID
  readonly content: string; // Message text content
  readonly title?: string; // Optional message title
  readonly mediaPath?: string; // Optional relative path to media file
  readonly publishedAt: number; // Unix timestamp (ms)

  static fromTelegramMessage(
    channelId: string,
    msg: TelegramRawMessage,
    mediaPath?: string,
  ): BroadcastEvent;

  toJSON(): Record<string, any>;
  static fromJSON(json: string): BroadcastEvent;
}
```

## Architecture Decision Records

### ADR-1: SSE vs WebSocket

**Decision:** Use Server-Sent Events (SSE)

**Rationale:**

- Unidirectional flow (ingestion→backends only)
- Built-in reconnection with EventSource API
- Already used in project (StreamModule)
- Simpler protocol than WebSocket

### ADR-2: Ring Buffer + DB Hybrid

**Decision:** Hybrid approach — in-memory ring buffer (5000 msgs) + DB persistence

**Rationale:**

- O(1) lookup for recent messages (<2h)
- DB persistence survives restarts
- Bounded memory (25MB @ 5KB/msg)
- Covers typical disconnect scenarios

### ADR-3: Circuit Breaker Pattern

**Decision:** Per-backend circuit breaker (3 failure threshold, 5min timeout)

**Rationale:**

- Fail fast after 3 consecutive failures
- Auto-recovery via half-open state
- Isolates failures (one backend doesn't block others)
- Standard pattern for distributed systems

### ADR-4: Backend-Side Filtering

**Decision:** Backends filter messages locally against their whitelist

**Rationale:**

- Simpler server logic
- Backend autonomy
- Easier to add new backends
- Flexible filtering rules per backend

### ADR-5: Channel Union Strategy

**Decision:** Subscribe to union of all whitelists, unsubscribe only when unused

**Rationale:**

- Staging independence (can add test channels)
- Production unaffected by staging decisions
- Single MTProto session respects rate limits
- Slight traffic overhead acceptable for independence

## Implementation Phases

### Phase 1: Backend Registration & Channel Union (4-6h)

- Create BackendRegistration entity
- Create registration endpoint
- Modify BackendChannelProviderService for multi-backend
- Implement channel union computation
- 15+ unit tests

### Phase 2: SSE Broadcast Infrastructure (6-8h)

- Create SSEBroadcastService
- Create SSEStreamController
- Implement BackendCircuitBreakerService
- Add heartbeat mechanism
- Wire into TelegramModule
- 20+ unit tests

### Phase 3: Backfill Buffer (5-7h)

- Create BackfillMessageEntity (TypeORM)
- Create BackfillBufferService (ring buffer)
- Implement persist/restore logic
- Add cleanup cron job
- Modify SSEStreamController for backfill
- 15+ unit tests

### Phase 4: Integration & Observability (3-4h)

- Create StreamStatusController
- Add Prometheus metrics
- Update HealthModule
- E2E tests
- Metrics dashboard

### Phase 5: Backward Compatibility (4-5h)

- Add feature flag
- Implement legacy fallback
- Migration guide
- Staging validation
- Rollback procedure

**Total: 22-30 hours**

## Testing Strategy

- **Unit Tests:** 50+ (buffer, union, circuit breaker, serialization)
- **Integration Tests:** 30+ (broadcast, backfill, channel updates)
- **E2E Tests:** 10+ (full flows, failure scenarios)
- **Property-Based Tests:** 4 (correctness properties)

## Deployment Strategy

**Week 1:** Staging only (feature flag on)  
**Week 2:** Production parallel mode (registration + legacy)  
**Week 3:** Production new mode only  
**Week 4:** Cleanup (remove legacy code)

## Monitoring

**Metrics:**

- `ingestion_active_backends` (gauge)
- `ingestion_broadcast_total` (counter)
- `ingestion_broadcast_failures` (counter)
- `ingestion_channel_union_size` (gauge)
- `ingestion_backfill_buffer_size` (gauge)
- `ingestion_backfill_requests_total` (counter)

**Alerts:**

- Critical: active_backends < 2 for 5min
- Warning: broadcast_failures > 10/min
- Warning: buffer_size > 4000

---

**Document Version:** 1.0  
**Last Updated:** 2026-09-03  
**Status:** Ready for Implementation
