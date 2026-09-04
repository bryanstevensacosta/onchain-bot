# Multi-Backend Migration Guide

## Overview

This guide covers the migration from legacy HTTP polling to the new multi-backend SSE broadcast system in the ingestion service.

## Pre-Migration Checklist

### Infrastructure

- [ ] PostgreSQL 13+ with `backfill_messages` table support
- [ ] Redis 6+ for cursor tracking
- [ ] Backend applications updated to support backend registration
- [ ] Network connectivity verified between ingestion-service:3031 and backends

### Code Changes

- [ ] Backend code implements registration client (`POST /api/ingestion/backends/register`)
- [ ] Backend code implements SSE client (`GET /api/ingestion/stream?backendId=X`)
- [ ] Backend code handles backfill events (`backfill`, `backfill-complete`, `backfill-unavailable`)
- [ ] Backend code implements reconnection with backoff (1s → 30s exponential)

### Configuration

- [ ] `INGESTION_MULTI_BACKEND_ENABLED` variable added to `.env` files
- [ ] `INGESTION_BACKFILL_BUFFER_SIZE` configured (default: 5000)
- [ ] `INGESTION_BACKFILL_RETENTION_HOURS` configured (default: 72)

## Backend Code Changes

### 1. Registration Client

```typescript
// Example: Register backend on startup
async function registerBackend() {
  const response = await fetch(
    'http://ingestion-service:3031/api/ingestion/backends/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        backendId: 'production', // or 'staging', 'dev'
        sourceWhitelist: ['channel1', 'channel2', 'channel3'], // KOL + News channel IDs
        apiVersion: 'v1',
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Registration failed: ${response.statusText}`);
  }

  const { channelUnionSize } = await response.json();
  console.log(`Backend registered, channel union size: ${channelUnionSize}`);
}
```

### 2. SSE Client with Backfill

```typescript
import EventSource from 'eventsource';

async function connectToIngestionStream() {
  // Get last seen timestamp from database
  const lastSeenTimestamp = await getLastSeenTimestamp();

  const url = lastSeenTimestamp
    ? `http://ingestion-service:3031/api/ingestion/stream?backendId=production&lastSeenTimestamp=${lastSeenTimestamp}`
    : `http://ingestion-service:3031/api/ingestion/stream?backendId=production`;

  const eventSource = new EventSource(url);

  eventSource.addEventListener('connection:established', (event) => {
    console.log('Connected to ingestion service');
  });

  eventSource.addEventListener('message:telegram', (event) => {
    const message = JSON.parse(event.data);
    await processMessage(message);
    await updateLastSeenTimestamp(message.occurredAt);
  });

  eventSource.addEventListener('backfill', (event) => {
    const message = JSON.parse(event.data);
    await processBackfillMessage(message);
  });

  eventSource.addEventListener('backfill-complete', (event) => {
    const { count } = JSON.parse(event.data);
    console.log(`Backfill complete: ${count} messages recovered`);
  });

  eventSource.addEventListener('backfill-unavailable', (event) => {
    const { reason, requestedTimestamp, oldestAvailableTimestamp } = JSON.parse(
      event.data,
    );
    console.warn(`Backfill unavailable: ${reason}`);
    // Handle gap in message history
  });

  eventSource.addEventListener('heartbeat', (event) => {
    // Keep-alive ping every 30s
  });

  eventSource.onerror = (error) => {
    console.error('SSE connection error', error);
    eventSource.close();
    // Implement exponential backoff reconnection
    setTimeout(() => connectToIngestionStream(), getBackoffDelay());
  };
}
```

### 3. Reconnection with Exponential Backoff

```typescript
let reconnectAttempts = 0;
const MAX_BACKOFF_MS = 30000; // 30 seconds
const INITIAL_BACKOFF_MS = 1000; // 1 second

function getBackoffDelay(): number {
  const delay = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(2, reconnectAttempts),
    MAX_BACKOFF_MS,
  );
  reconnectAttempts++;
  return delay + Math.random() * 1000; // Add jitter
}

function resetBackoff() {
  reconnectAttempts = 0;
}
```

## Feature Flag Rollout Procedure

### Step 1: Deploy Ingestion Service (Week 1)

1. Deploy ingestion-service with `INGESTION_MULTI_BACKEND_ENABLED=false`
2. Verify `/api/health` endpoint returns healthy status
3. Verify legacy HTTP polling still works
4. Monitor logs for any startup errors

### Step 2: Deploy Backend Changes (Week 1-2)

1. Deploy backend applications with registration + SSE client code
2. Keep feature flag `INGESTION_MULTI_BACKEND_ENABLED=false` (parallel mode)
3. Verify backends can start without errors
4. Registration and SSE connection should be no-op while flag is disabled

### Step 3: Enable Feature Flag in Staging (Week 2)

1. Set `INGESTION_MULTI_BACKEND_ENABLED=true` in staging `.env`
2. Restart ingestion-service
3. Verify backend registration succeeds
4. Verify SSE connection established
5. Verify messages flow through SSE
6. Test backfill by restarting backend
7. Monitor for 3 days with no errors

### Step 4: Enable Feature Flag in Production (Week 3)

1. Set `INGESTION_MULTI_BACKEND_ENABLED=true` in production `.env`
2. Rolling restart of ingestion-service (zero downtime)
3. Verify all backends register successfully
4. Monitor metrics:
   - `GET /api/ingestion/stream/status` → activeBackends count
   - `GET /api/health` → broadcast.ready should be `true`
5. Verify no message loss (compare message counts)
6. Monitor for 7 days

### Step 5: Remove Legacy Code (Week 4)

1. Confirm feature flag working in production for 7+ days
2. Remove legacy HTTP polling code from backend applications
3. Set `INGESTION_MULTI_BACKEND_ENABLED=true` as default (remove flag check)
4. Deploy final version without fallback code

## Validation Steps per Environment

### Staging Validation

- [ ] Backend registers successfully (check `/api/ingestion/stream/status`)
- [ ] SSE stream connects (check logs)
- [ ] Messages received in real-time
- [ ] Backfill works on reconnect (test: restart backend, verify missed messages received)
- [ ] Circuit breaker opens after 3 failures (test: kill network, verify isolation)
- [ ] Heartbeat received every 30s
- [ ] No errors in logs for 3 days
- [ ] Performance acceptable (<500ms p99 latency)

### Production Validation

- [ ] All backends register successfully
- [ ] Channel union computed correctly
- [ ] Messages flowing to all backends
- [ ] Backfill working for production reconnects
- [ ] Circuit breaker isolating failing backends
- [ ] Metrics dashboard showing healthy state
- [ ] No message loss (compare counts pre/post migration)
- [ ] Performance within SLA

## Rollback Procedure

### Immediate Rollback (< 5 minutes)

1. Set `INGESTION_MULTI_BACKEND_ENABLED=false` in `.env`
2. Restart ingestion-service
3. Verify legacy HTTP polling resumes
4. Verify backends receive messages via legacy path
5. Investigate issue in staging

### Backend Rollback

1. Deploy previous backend version without registration/SSE code
2. Ingestion service falls back to HTTP polling automatically
3. No ingestion-service changes needed

## Common Issues

See [multi-backend-runbook.md](./multi-backend-runbook.md) for troubleshooting.

## Monitoring & Alerts

### Key Metrics

- `GET /api/ingestion/stream/status` - Active backends count
- `GET /api/health` - broadcast.ready flag
- Backend logs - Connection errors, backfill counts
- Postgres - `backfill_messages` table size

### Alerts to Configure

- `broadcast.ready == false` for > 5 minutes
- `activeBackends < expected_count` for > 2 minutes
- Circuit breaker open for > 10 minutes
- Backfill buffer full (5000 messages)

## Migration Timeline

| Week | Activity                                           | Status         |
| ---- | -------------------------------------------------- | -------------- |
| 1    | Deploy ingestion-service + backend code (flag OFF) | ⏸️ Not started |
| 2    | Enable flag in staging, validate                   | ⏸️ Not started |
| 3    | Enable flag in production, monitor                 | ⏸️ Not started |
| 4    | Remove legacy code                                 | ⏸️ Not started |

## Success Criteria

- ✅ Zero message loss during migration
- ✅ All backends connected via SSE
- ✅ Backfill working for all reconnections
- ✅ Performance within SLA (<500ms p99)
- ✅ No errors in production for 7 days
- ✅ Circuit breaker protecting system from failures

## Contact

For questions or issues during migration:

- **Team:** Backend Infrastructure
- **Slack:** #ingestion-service
- **On-call:** PagerDuty rotation
