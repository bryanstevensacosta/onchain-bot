# Multi-Backend Broadcast System - Runbook

## Overview

Operational runbook for troubleshooting and maintaining the multi-backend SSE broadcast system.

## Quick Health Check

```bash
# 1. Check system status
curl http://ingestion-service:3031/api/ingestion/stream/status

# Expected response:
# {
#   "activeBackends": 2,
#   "channelUnionSize": 45,
#   "backfillBufferSize": 1234,
#   "backfillBufferOldestTimestamp": 1725375600000,
#   "mtprotoConnected": true,
#   "registeredBackends": ["staging", "production"],
#   "timestamp": "2026-09-03T12:00:00.000Z"
# }

# 2. Check health endpoint
curl http://ingestion-service:3031/api/health

# Expected: status "ok", broadcast.ready true

# 3. Check backend logs for connection errors
docker logs ingestion-service --tail 100 | grep "SSE connection"
```

## Common Issues

### Issue 1: Backend Not Connecting

**Symptoms:**

- Backend logs show "Failed to connect to ingestion service"
- `activeBackends` count lower than expected
- `broadcast.ready` is `false`

**Diagnosis:**

```bash
# Check if ingestion-service is running
curl http://ingestion-service:3031/api/health

# Check if backend is registered
curl http://ingestion-service:3031/api/ingestion/stream/status | jq '.registeredBackends'

# Check ingestion-service logs
docker logs ingestion-service --tail 200 | grep "SSE connection rejected"
```

**Solutions:**

1. **Backend not registered**: Backend must call `POST /api/ingestion/backends/register` before connecting

   ```bash
   # Manual registration for testing
   curl -X POST http://ingestion-service:3031/api/ingestion/backends/register \
     -H "Content-Type: application/json" \
     -d '{"backendId":"production","sourceWhitelist":["ch1","ch2"]}'
   ```

2. **Network connectivity**: Verify ingestion-service:3031 is reachable from backend

   ```bash
   # From backend container
   nc -zv ingestion-service 3031
   ```

3. **Wrong backendId**: Check backend code uses correct identifier
   - Staging: `backendId: "staging"`
   - Production: `backendId: "production"`

### Issue 2: Messages Not Being Received

**Symptoms:**

- Backend connected but no `message:telegram` events
- Ingestion-service logs show messages ingested but not broadcast

**Diagnosis:**

```bash
# Check if messages are being ingested
docker logs ingestion-service | grep "Message ingested"

# Check if broadcast is working
docker logs ingestion-service | grep "Broadcasting to"

# Check circuit breaker state
curl http://ingestion-service:3031/api/ingestion/stream/status
```

**Solutions:**

1. **Circuit breaker open**: Backend circuit breaker may have opened due to failures
   - Check logs for "Circuit OPEN for backend"
   - Wait 5 minutes for circuit to half-open
   - Or restart backend to reset circuit

2. **Empty channel union**: No channels in backend's whitelist
   - Verify `sourceWhitelist` in registration includes active channels
   - Check ingestion-service logs for "Channel union size: 0"

3. **MTProto disconnected**: Ingestion service lost Telegram connection
   - Check `/api/health` → `mtproto.connected` should be `true`
   - Restart ingestion-service if MTProto is stuck

### Issue 3: Backfill Not Working

**Symptoms:**

- Backend reconnects but doesn't receive missed messages
- `backfill-unavailable` event received

**Diagnosis:**

```bash
# Check backfill buffer status
curl http://ingestion-service:3031/api/ingestion/stream/status | jq '{backfillBufferSize, backfillBufferOldestTimestamp}'

# Check if disconnection was > 72 hours
# If oldestTimestamp is newer than lastSeenTimestamp, window expired

# Check PostgreSQL backfill_messages table
docker exec -it postgres psql -U postgres -d onchain_bot -c "SELECT COUNT(*), MIN(timestamp), MAX(timestamp) FROM backfill_messages;"
```

**Solutions:**

1. **Disconnection > 72 hours**: Backfill window expired
   - Backfill only covers last 72 hours
   - Backend must handle gap (fetch from own database or skip)

2. **Buffer overflow**: Backend was offline so long that buffer wrapped around
   - Backfill buffer holds 5000 messages (~2 hours at peak)
   - If offline > 2 hours, oldest messages may be lost from memory
   - Check PostgreSQL for complete history

3. **lastSeenTimestamp format error**: Backend sent invalid timestamp
   - Must be ISO 8601 format: `2026-09-03T12:00:00.000Z`
   - Check backend logs for "Invalid lastSeenTimestamp format"

### Issue 4: Circuit Breaker Stuck Open

**Symptoms:**

- Backend shows "Circuit OPEN, skipping broadcast"
- Backend not receiving messages despite being connected
- `activeBackends` count is correct but no events

**Diagnosis:**

```bash
# Check circuit breaker state (not exposed via API yet)
docker logs ingestion-service | grep "Circuit.*for backend" | tail -20

# Check for repeated failures
docker logs ingestion-service | grep "Broadcast failed.*backend" | tail -50
```

**Solutions:**

1. **Wait for recovery**: Circuit breaker half-opens after 5 minutes
   - Monitor logs for "Circuit HALF_OPEN for backend"
   - Successful message will close circuit

2. **Restart backend**: Forces new SSE connection and resets circuit

   ```bash
   docker restart <backend-container>
   ```

3. **Persistent failures**: Investigate root cause
   - Check backend logs for errors processing messages
   - Check network latency between services
   - Check backend resource usage (CPU, memory)

### Issue 5: High Memory Usage

**Symptoms:**

- Ingestion-service using > 500MB memory
- `backfillBufferSize` at or near 5000

**Diagnosis:**

```bash
# Check buffer size
curl http://ingestion-service:3031/api/ingestion/stream/status | jq '.backfillBufferSize'

# Check process memory
docker stats ingestion-service --no-stream

# Check PostgreSQL table size
docker exec -it postgres psql -U postgres -d onchain_bot -c "SELECT pg_size_pretty(pg_total_relation_size('backfill_messages'));"
```

**Solutions:**

1. **Normal operation**: Ring buffer is designed for 5000 messages (~25MB)
   - Expected memory: 100-200MB for service + buffer
   - If > 500MB, investigate memory leak

2. **PostgreSQL cleanup not running**: Cron job runs daily at 3 AM
   - Check logs for "Scheduled cleanup completed"
   - Manual cleanup:
     ```sql
     DELETE FROM backfill_messages WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '72 hours') * 1000;
     ```

3. **Too many backends**: Each SSE connection consumes ~1MB
   - Check `activeBackends` count
   - Each backend should have only 1 active connection

## Manual Operations

### Manually Reset Circuit Breaker

Circuit breaker state is in-memory only. To reset:

```bash
# Restart ingestion-service (resets all circuits)
docker restart ingestion-service

# Wait for service to be healthy
curl http://ingestion-service:3031/api/health
```

### Manually Cleanup Old Messages

```bash
# Connect to PostgreSQL
docker exec -it postgres psql -U postgres -d onchain_bot

# Check message count
SELECT COUNT(*) FROM backfill_messages;

# Delete messages older than 72 hours
DELETE FROM backfill_messages
WHERE timestamp < EXTRACT(EPOCH FROM NOW() - INTERVAL '72 hours') * 1000;

# Verify
SELECT COUNT(*) FROM backfill_messages;
```

### Manually Register Backend

```bash
# Register staging backend
curl -X POST http://ingestion-service:3031/api/ingestion/backends/register \
  -H "Content-Type: application/json" \
  -d '{
    "backendId": "staging",
    "sourceWhitelist": ["channel1", "channel2", "channel3"]
  }'

# Verify registration
curl http://ingestion-service:3031/api/ingestion/stream/status | jq '.registeredBackends'
```

### Test SSE Connection

```bash
# Connect to SSE stream (will block, showing events)
curl -N "http://ingestion-service:3031/api/ingestion/stream?backendId=staging"

# With backfill (replace timestamp with recent ISO date)
curl -N "http://ingestion-service:3031/api/ingestion/stream?backendId=staging&lastSeenTimestamp=2026-09-03T10:00:00.000Z"

# Expected output:
# event: connection:established
# data: {"clientId":"staging-...","timestamp":"..."}
#
# event: message:telegram
# data: {"eventId":"...","timestamp":...,"channelId":"..."}
```

## Alert Response Procedures

### Alert: `broadcast.ready == false` for > 5 minutes

**Severity:** P1 (Critical)

**Response:**

1. Check if any backends are connected:

   ```bash
   curl http://ingestion-service:3031/api/ingestion/stream/status | jq '.activeBackends'
   ```

2. If `activeBackends == 0`:
   - Check backend applications are running
   - Check backends can reach ingestion-service:3031
   - Verify backends are registered
   - Check backend logs for connection errors

3. If backends are registered but not connecting:
   - Restart ingestion-service
   - Check for port conflicts (3031)

### Alert: Circuit breaker open for > 10 minutes

**Severity:** P2 (High)

**Response:**

1. Identify affected backend:

   ```bash
   docker logs ingestion-service | grep "Circuit OPEN" | tail -10
   ```

2. Check backend health:

   ```bash
   curl http://<backend-host>/health
   ```

3. If backend is healthy:
   - Restart backend to force reconnection
   - Monitor for circuit to close

4. If backend is unhealthy:
   - Investigate backend issues first
   - Circuit breaker is protecting system (working as intended)

### Alert: Backfill buffer full (5000 messages)

**Severity:** P3 (Medium)

**Response:**

1. Check if all backends are connected:

   ```bash
   curl http://ingestion-service:3031/api/ingestion/stream/status
   ```

2. If backends are disconnected:
   - Investigate why backends are offline
   - Buffer will overflow and lose oldest messages

3. If this is normal (high message volume):
   - Increase `INGESTION_BACKFILL_BUFFER_SIZE` (e.g., to 10000)
   - Restart ingestion-service with new config

## Monitoring Dashboard

### Key Metrics to Track

1. **activeBackends** - Should equal number of deployed backends
2. **channelUnionSize** - Should be sum of unique channels across backends
3. **backfillBufferSize** - Should be < 5000 normally
4. **broadcast.ready** - Should always be `true` in production
5. **mtproto.connected** - Should always be `true`

### Logs to Monitor

```bash
# Connection events
docker logs ingestion-service | grep "SSE connection"

# Broadcast activity
docker logs ingestion-service | grep "Broadcasting"

# Circuit breaker state changes
docker logs ingestion-service | grep "Circuit.*OPEN\|CLOSED\|HALF_OPEN"

# Backfill activity
docker logs ingestion-service | grep "Backfill"

# Errors
docker logs ingestion-service | grep "ERROR"
```

## Escalation

### When to Escalate

- `broadcast.ready` false for > 15 minutes
- Message loss confirmed (counts don't match)
- Circuit breakers stuck open for > 30 minutes
- Memory usage > 1GB
- Multiple backends failing simultaneously

### Escalation Contacts

- **L1:** On-call engineer (PagerDuty)
- **L2:** Backend Infrastructure team lead
- **L3:** Platform Architecture team

## Known Limitations

1. **Single ingestion-service instance**: No horizontal scaling yet
2. **In-memory circuit breaker state**: Resets on restart
3. **No authentication**: SSE endpoint requires registration but no auth token
4. **72-hour backfill window**: Hard limit, cannot be extended
5. **5000 message buffer**: Configurable but memory-bound

## Future Improvements

- [ ] Add Prometheus metrics endpoint
- [ ] Implement circuit breaker state API
- [ ] Add authentication to SSE endpoint
- [ ] Support horizontal scaling of ingestion-service
- [ ] Add admin API to manually reset circuit breakers
- [ ] Implement backfill from S3/archival storage for > 72h gaps
