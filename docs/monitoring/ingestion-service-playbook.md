# Ingestion Service Monitoring Playbook

**Document Version:** 1.0  
**Last Updated:** 2026-07-03  
**Service:** Centralized Ingestion Service  
**Target Audience:** DevOps, SRE, On-Call Engineers

## Table of Contents

- [Overview](#overview)
- [Key Metrics](#key-metrics)
- [Alert Conditions and Responses](#alert-conditions-and-responses)
- [Prometheus Alert Rules](#prometheus-alert-rules)
- [Log Query Patterns](#log-query-patterns)
- [Health Check Interpretation](#health-check-interpretation)
- [Troubleshooting FAQ](#troubleshooting-faq)
- [Escalation Procedures](#escalation-procedures)

---

## Overview

The Centralized Ingestion Service is the single point of ingestion for Telegram messages across all backend environments (dev, staging, production). It maintains a single MTProto connection to Telegram and distributes messages to backend clients via Server-Sent Events (SSE).

**Critical Dependencies:**
- Telegram API (MTProto) - External, uncontrolled
- Redis - Last-seen message cursor persistence
- Network connectivity to backend environments
- Media storage volume (`uploads/crypto-news/media/`)

**Service Boundaries:**
- **Port:** 3031 (HTTP API)
- **Deployment:** Single instance (DO NOT scale horizontally - one MTProto session only)
- **Uptime Target:** 99.9% (43.2 minutes downtime/month max)
- **Latency Target:** <500ms p95 for message delivery

**Reference Documents:**
- Requirements: `.kiro/specs/centralized-ingestion-service/requirements.md`
- Design: `.kiro/specs/centralized-ingestion-service/design.md`
- Deployment Guide: `docs/deployment/ingestion-service-deployment.md`

---

## Key Metrics

### Metrics Endpoint

**URL:** `GET http://<ingestion-service-host>:3031/metrics`

Prometheus scrape target exposing all metrics in Prometheus text format.

### Critical Metrics

| Metric | Type | Description | Normal Range | Alert Threshold |
|--------|------|-------------|--------------|-----------------|
| `ingestion_mtproto_connected` | Gauge | MTProto connection status (0=disconnected, 1=connected) | 1 | <1 for >5min |
| `ingestion_sse_clients_connected` | Gauge | Number of connected SSE clients | 1-10 | 0 for >10min |
| `ingestion_messages_received_total` | Counter | Total messages received from Telegram | Increasing | Flatline for >15min |
| `ingestion_messages_broadcast_total` | Counter | Total messages broadcast to clients | Increasing | Flatline when receiving |
| `ingestion_messages_broadcast_duration_seconds` | Histogram | Message broadcast latency | p95 <0.5s | p95 >1s |
| `ingestion_flood_wait_count_24h` | Gauge | FLOOD_WAIT errors in 24h window | 0-3 | >10 |
| `ingestion_media_downloads_total` | Counter | Total media files downloaded | Increasing | N/A (informational) |
| `ingestion_api_request_duration_seconds` | Histogram | API request latency | p95 <0.2s | p95 >1s |

### Default System Metrics

The service also exposes Node.js process metrics via `@willsoto/nestjs-prometheus`:

- `process_cpu_user_seconds_total` - CPU usage (user mode)
- `process_cpu_system_seconds_total` - CPU usage (system mode)
- `nodejs_heap_size_total_bytes` - Total heap size
- `nodejs_heap_size_used_bytes` - Used heap size
- `nodejs_external_memory_bytes` - External memory (Buffers)

**Memory Alert:** Alert if `nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes > 0.9` (90% heap usage).

---

## Alert Conditions and Responses

### CRITICAL Alerts

#### ALERT-001: MTProto Disconnected

**Condition:** `ingestion_mtproto_connected == 0` for >5 minutes

**Symptoms:**
- Health endpoint returns HTTP 503
- `mtproto.connected: false` in health response
- No new messages received from Telegram

**Impact:** No messages are being ingested. All backend environments are starved of data.

**Response:**
1. **Check service logs** for `mtproto:connection:changed` events:
   ```bash
   docker logs ingestion-service --tail 100 | grep "mtproto:connection"
   ```
2. **Check for AUTH_KEY_DUPLICATED errors:**
   ```bash
   docker logs ingestion-service --tail 200 | grep "AUTH_KEY_DUPLICATED"
   ```
   - If found: Another MTProto client is running (should NOT happen). Identify and stop duplicate client.
3. **Check for SESSION_REVOKED or SESSION_EXPIRED:**
   ```bash
   docker logs ingestion-service --tail 200 | grep -E "SESSION_REVOKED|SESSION_EXPIRED"
   ```
   - If found: Session is invalid. Regenerate MTProto session string (see [FAQ: Session Regeneration](#q-how-do-i-regenerate-the-mtproto-session-string)).
4. **Check network connectivity to Telegram API:**
   ```bash
   docker exec ingestion-service ping -c 3 149.154.167.51
   ```
5. **Restart service** if no obvious cause:
   ```bash
   docker restart ingestion-service
   ```
6. **Verify reconnection** within 2 minutes:
   ```bash
   curl http://localhost:3031/api/health | jq '.mtproto.connected'
   ```

**Escalation:** If issue persists >15 minutes, escalate to Engineering.

---

#### ALERT-002: Zero SSE Clients Connected

**Condition:** `ingestion_sse_clients_connected == 0` for >10 minutes

**Symptoms:**
- Health endpoint shows `clients.connected: 0`
- Messages are being received but not consumed
- Backend environments report ingestion failures

**Impact:** Messages are not reaching backend environments. Data pipeline is stalled.

**Response:**
1. **Check backend client connection status** in backend logs:
   ```bash
   # On backend host
   docker logs backend-app --tail 100 | grep "SSE connection"
   ```
2. **Verify network connectivity** from backend to ingestion service:
   ```bash
   # On backend host
   curl -I http://<ingestion-service-host>:3031/api/health
   ```
3. **Check ingestion service for client disconnection events:**
   ```bash
   docker logs ingestion-service --tail 200 | grep "sse:client:disconnected"
   ```
4. **Check for disconnection windows** in health endpoint:
   ```bash
   curl http://localhost:3031/api/health | jq '.clients.disconnectionWindows'
   ```
   - If `duration > 60000ms`, clients are experiencing frequent disconnections.
5. **Restart backend environments** to force reconnection:
   ```bash
   # On backend hosts
   docker restart backend-app
   ```
6. **Verify client reconnection** within 2 minutes:
   ```bash
   curl http://localhost:3031/api/health | jq '.clients.connected'
   ```

**Escalation:** If no clients reconnect >15 minutes after backend restarts, escalate to Engineering.

---

#### ALERT-003: High Broadcast Latency

**Condition:** `histogram_quantile(0.95, ingestion_messages_broadcast_duration_seconds) > 1` for >5 minutes

**Symptoms:**
- Slow message delivery to backend clients
- Health endpoint may show warnings
- Real-time trading alerts delayed

**Impact:** Trading signals delayed >1 second. May impact trade execution timing.

**Response:**
1. **Check CPU and memory usage:**
   ```bash
   docker stats ingestion-service --no-stream
   ```
   - If CPU >80% or Memory >90%, service is under resource pressure.
2. **Check number of connected clients:**
   ```bash
   curl http://localhost:3031/api/health | jq '.clients.connected'
   ```
   - If >10 clients: Service may be overloaded (design target is 10 clients).
3. **Check for media download backlog** (slow Telegram API):
   ```bash
   docker logs ingestion-service --tail 100 | grep "media:download"
   ```
4. **Check for flood wait events:**
   ```bash
   docker logs ingestion-service --tail 100 | grep "flood_wait:detected"
   ```
5. **Restart service** if resource pressure is detected:
   ```bash
   docker restart ingestion-service
   ```

**Escalation:** If latency remains >1s after restart, escalate to Engineering for capacity planning.

---

### WARNING Alerts

#### ALERT-004: Elevated FLOOD_WAIT Count

**Condition:** `ingestion_flood_wait_count_24h > 10`

**Symptoms:**
- Health endpoint shows `floodWait.count24h > 10`
- Logs show multiple `flood_wait:detected` events
- Message ingestion may be delayed

**Impact:** Telegram is rate limiting the service. Risk of account ban if behavior continues.

**Response:**
1. **Check FLOOD_WAIT metrics:**
   ```bash
   curl http://localhost:3031/api/health | jq '.floodWait'
   ```
2. **Review flood wait events** in logs:
   ```bash
   docker logs ingestion-service --tail 500 | grep "flood_wait:detected"
   ```
3. **Check consecutive failures:**
   ```bash
   curl http://localhost:3031/api/health | jq '.floodWait.consecutiveFailures'
   ```
   - If >3: High ban risk. Service is being aggressively rate limited.
4. **Verify staggered polling configuration** (should have jitter):
   ```bash
   docker exec ingestion-service cat /app/config/ingestion.config.json | jq '.staggeredPolling'
   ```
5. **Temporarily increase poll interval** if count is rising:
   - Edit `config/ingestion.config.json`
   - Increase `pollIntervalBaseMs` from 90000ms to 120000ms (2 minutes)
   - Restart service
6. **Monitor for improvement** over next 4 hours. FLOOD_WAIT count should decrease.

**Escalation:** If count exceeds 20 in 24 hours, escalate to Engineering for review. Account may be at risk.

---

#### ALERT-005: Client Disconnection Window >60s

**Condition:** Health endpoint returns `warnings: ["Client disconnection window >60s detected"]`

**Symptoms:**
- Health response includes `warnings` array
- `clients.disconnectionWindows` shows long disconnection periods
- Clients are reconnecting frequently

**Impact:** Intermittent message delivery failures. Messages may be missed during disconnection windows.

**Response:**
1. **Check disconnection windows:**
   ```bash
   curl http://localhost:3031/api/health | jq '.clients.disconnectionWindows'
   ```
   Example output:
   ```json
   [
     {
       "clientId": "abc123",
       "startedAt": "2026-07-03T10:00:00Z",
       "endedAt": "2026-07-03T10:02:00Z",
       "duration": 120000
     }
   ]
   ```
2. **Identify affected backend environments** by client ID pattern (client IDs are UUIDs).
3. **Check backend logs** for reconnection attempts:
   ```bash
   # On affected backend host
   docker logs backend-app --tail 200 | grep "reconnecting"
   ```
4. **Verify network stability** between backend and ingestion service:
   ```bash
   # On backend host
   ping -c 100 <ingestion-service-host>
   ```
5. **Check for proxy/load balancer timeouts** (SSE connections must be long-lived).
6. **If issue persists**, restart affected backend environment:
   ```bash
   docker restart backend-app
   ```

**Escalation:** If disconnection windows persist across multiple clients, escalate to Engineering for network investigation.

---

#### ALERT-006: No Messages Received for >15 Minutes

**Condition:** `rate(ingestion_messages_received_total[15m]) == 0`

**Symptoms:**
- Message counter flatlined
- MTProto shows connected
- Clients are connected but idle

**Impact:** Possible upstream issue (Telegram channels inactive) or polling issue.

**Response:**
1. **Verify MTProto connection status:**
   ```bash
   curl http://localhost:3031/api/health | jq '.mtproto'
   ```
   - Must show `connected: true, authorized: true`
2. **Check last poll timestamp:**
   ```bash
   curl http://localhost:3031/api/health | jq '.mtproto.lastPollAt'
   ```
   - If timestamp is stale (>5 minutes old), polling is stuck.
3. **Check for sleep window** (service pauses polling during configured sleep hours):
   ```bash
   docker logs ingestion-service --tail 50 | grep "sleep window"
   ```
4. **Verify channels are active** (check Telegram web/app):
   - Open monitored channels in Telegram web
   - Confirm recent message activity
5. **If channels ARE active but no messages received**, restart service:
   ```bash
   docker restart ingestion-service
   ```

**Escalation:** If issue persists after restart with confirmed channel activity, escalate to Engineering.

---

## Prometheus Alert Rules

### Alert Rules File: `ingestion-service-alerts.yml`

```yaml
groups:
  - name: ingestion_service_critical
    interval: 30s
    rules:
      # ALERT-001: MTProto Disconnected
      - alert: IngestionMtprotoDisconnected
        expr: ingestion_mtproto_connected == 0
        for: 5m
        labels:
          severity: critical
          service: ingestion-service
          alert_id: ALERT-001
        annotations:
          summary: "Ingestion service MTProto disconnected"
          description: "MTProto connection to Telegram has been down for >5 minutes. No messages are being ingested."
          runbook_url: "https://docs.example.com/runbooks/ingestion-service-playbook.md#alert-001-mtproto-disconnected"

      # ALERT-002: Zero SSE Clients Connected
      - alert: IngestionZeroClientsConnected
        expr: ingestion_sse_clients_connected == 0
        for: 10m
        labels:
          severity: critical
          service: ingestion-service
          alert_id: ALERT-002
        annotations:
          summary: "No SSE clients connected to ingestion service"
          description: "Zero backend clients connected for >10 minutes. Messages are not being consumed."
          runbook_url: "https://docs.example.com/runbooks/ingestion-service-playbook.md#alert-002-zero-sse-clients-connected"

      # ALERT-003: High Broadcast Latency
      - alert: IngestionHighBroadcastLatency
        expr: histogram_quantile(0.95, rate(ingestion_messages_broadcast_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: critical
          service: ingestion-service
          alert_id: ALERT-003
        annotations:
          summary: "High message broadcast latency"
          description: "p95 broadcast latency is >1s for >5 minutes. Trading signals delayed."
          runbook_url: "https://docs.example.com/runbooks/ingestion-service-playbook.md#alert-003-high-broadcast-latency"

  - name: ingestion_service_warning
    interval: 1m
    rules:
      # ALERT-004: Elevated FLOOD_WAIT Count
      - alert: IngestionElevatedFloodWaitCount
        expr: ingestion_flood_wait_count_24h > 10
        for: 5m
        labels:
          severity: warning
          service: ingestion-service
          alert_id: ALERT-004
        annotations:
          summary: "Elevated FLOOD_WAIT count"
          description: "More than 10 FLOOD_WAIT errors in 24h window. Risk of Telegram account ban."
          runbook_url: "https://docs.example.com/runbooks/ingestion-service-playbook.md#alert-004-elevated-flood_wait-count"

      # ALERT-006: No Messages Received
      - alert: IngestionNoMessagesReceived
        expr: rate(ingestion_messages_received_total[15m]) == 0
        for: 15m
        labels:
          severity: warning
          service: ingestion-service
          alert_id: ALERT-006
        annotations:
          summary: "No messages received for >15 minutes"
          description: "Message ingestion has flatlined. Possible upstream issue or polling stuck."
          runbook_url: "https://docs.example.com/runbooks/ingestion-service-playbook.md#alert-006-no-messages-received-for-15-minutes"

      # High Memory Usage
      - alert: IngestionHighMemoryUsage
        expr: (nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
          service: ingestion-service
          alert_id: ALERT-007
        annotations:
          summary: "High memory usage (>90%)"
          description: "Heap usage is >90% for >5 minutes. Risk of OOM crash."
          runbook_url: "https://docs.example.com/runbooks/ingestion-service-playbook.md#alert-007-high-memory-usage"

  - name: ingestion_service_info
    interval: 5m
    rules:
      # Broadcast Duration p95 Degraded (but not critical)
      - alert: IngestionBroadcastLatencyDegraded
        expr: histogram_quantile(0.95, rate(ingestion_messages_broadcast_duration_seconds_bucket[5m])) > 0.5 and histogram_quantile(0.95, rate(ingestion_messages_broadcast_duration_seconds_bucket[5m])) <= 1
        for: 10m
        labels:
          severity: info
          service: ingestion-service
        annotations:
          summary: "Broadcast latency degraded (p95 >500ms)"
          description: "Broadcast latency is above target (500ms) but below critical threshold (1s)."
```

---

## Log Query Patterns

The Ingestion Service uses **structured JSON logging** via NestJS Logger (Pino format). All logs include an `event` field for easy filtering.

### Log Aggregation Setup

**Recommended:** Ship logs to Elasticsearch, Loki, or CloudWatch Logs for centralized querying.

**Docker JSON Driver:** Logs are written to stdout/stderr and captured by Docker's JSON logging driver.

```bash
# View logs with Docker
docker logs ingestion-service --tail 500 --follow

# Export logs to file for analysis
docker logs ingestion-service --since 1h > ingestion-$(date +%Y%m%d-%H%M).log
```

### Common Log Queries

#### 1. Find All MTProto Connection Changes

**Pattern:** `event: "mtproto:connection:changed"`

```bash
# Grep Docker logs
docker logs ingestion-service --tail 1000 | grep '"event":"mtproto:connection:changed"'

# Elasticsearch query
{
  "query": {
    "match": {
      "event": "mtproto:connection:changed"
    }
  },
  "sort": [{"timestamp": "desc"}]
}

# Loki LogQL
{service="ingestion-service"} | json | event="mtproto:connection:changed"
```

**Expected Output:**
```json
{
  "event": "mtproto:connection:changed",
  "connected": true,
  "authorized": true,
  "timestamp": "2026-07-03T10:00:00.000Z"
}
```

---

#### 2. Find All FLOOD_WAIT Events

**Pattern:** `event: "flood_wait:detected"`

```bash
# Grep Docker logs
docker logs ingestion-service --tail 5000 | grep '"event":"flood_wait:detected"'

# Elasticsearch query
{
  "query": {
    "match": {
      "event": "flood_wait:detected"
    }
  },
  "sort": [{"timestamp": "desc"}]
}
```

**Expected Output:**
```json
{
  "event": "flood_wait:detected",
  "waitSeconds": 30,
  "count24h": 5,
  "backoffMs": 35000,
  "attempt": 2,
  "maxAttempts": 5,
  "label": "getHistory:channelId=-1001234567890",
  "timestamp": "2026-07-03T10:05:00.000Z"
}
```

**Analysis:** Check `count24h` and `waitSeconds` trends. If `waitSeconds` is increasing (e.g., 30s, 60s, 120s), service is triggering progressively stricter rate limits.

---

#### 3. Find All SSE Client Connections/Disconnections

**Pattern:** `event: "sse:client:connected"` or `event: "sse:client:disconnected"`

```bash
# Grep Docker logs for last hour
docker logs ingestion-service --since 1h | grep -E '"event":"sse:client:(connected|disconnected)"'

# Elasticsearch query for connection events
{
  "query": {
    "terms": {
      "event": ["sse:client:connected", "sse:client:disconnected"]
    }
  },
  "sort": [{"timestamp": "desc"}]
}
```

**Expected Output:**
```json
{
  "event": "sse:client:connected",
  "clientId": "abc123-def456-ghi789",
  "totalClients": 3,
  "timestamp": "2026-07-03T10:00:00.000Z"
}
```

**Analysis:** Match client IDs to identify which backend environments are connecting/disconnecting. Frequent disconnections indicate network instability.

---

#### 4. Find All Messages Received from a Specific Channel

**Pattern:** `event: "message:received"` + filter by `channelId`

```bash
# Grep Docker logs for specific channel
docker logs ingestion-service --tail 2000 | grep '"event":"message:received"' | grep '"channelId":"-1001234567890"'

# Elasticsearch query
{
  "query": {
    "bool": {
      "must": [
        {"match": {"event": "message:received"}},
        {"term": {"channelId": "-1001234567890"}}
      ]
    }
  },
  "sort": [{"timestamp": "desc"}]
}
```

**Expected Output:**
```json
{
  "event": "message:received",
  "channelId": "-1001234567890",
  "messageId": 12345,
  "hasMedia": true,
  "mediaCount": 2,
  "messageType": "crypto-news",
  "occurredAt": "2026-07-03T10:00:00Z",
  "timestamp": "2026-07-03T10:00:00.500Z"
}
```

---

#### 5. Find All Media Download Failures

**Pattern:** `event: "media:download:failed"`

```bash
# Grep Docker logs
docker logs ingestion-service --tail 1000 | grep '"event":"media:download:failed"'

# Elasticsearch query
{
  "query": {
    "match": {
      "event": "media:download:failed"
    }
  },
  "sort": [{"timestamp": "desc"}]
}
```

**Expected Output:**
```json
{
  "event": "media:download:failed",
  "channelId": "-1001234567890",
  "messageId": 12345,
  "index": 0,
  "error": "Timeout downloading media",
  "stack": "Error: Timeout...",
  "fileSize": 245678,
  "mimeType": "image/jpeg",
  "timestamp": "2026-07-03T10:00:00.000Z"
}
```

**Analysis:** Media download failures are usually transient (Telegram API slow/unavailable). If failures are frequent, check network connectivity to Telegram servers.

---

#### 6. Calculate Average Broadcast Latency from Logs

**Pattern:** Calculate `timestamp` difference between `message:received` and `sse:client:connected` (approximate)

**Note:** For accurate latency metrics, use Prometheus `ingestion_messages_broadcast_duration_seconds` histogram instead.

---

#### 7. Find All Service Startup/Shutdown Events

**Pattern:** `event: "service:started"` or `event: "service:shutdown"`

```bash
# Grep Docker logs
docker logs ingestion-service --tail 1000 | grep -E '"event":"service:(started|shutdown)"'
```

**Expected Output:**
```json
{
  "event": "service:started",
  "port": 3031,
  "channelCount": 15,
  "timestamp": "2026-07-03T09:00:00.000Z"
}
```

---

### Log Retention Recommendations

| Log Type | Retention Period | Storage | Reason |
|----------|------------------|---------|--------|
| All logs (JSON) | 30 days | Elasticsearch/Loki | Debugging and forensics |
| `flood_wait:detected` | 90 days | Separate index | Ban risk trend analysis |
| `message:received` | 7 days | Hot storage | High volume, short-term debugging |
| `media:download:failed` | 30 days | Standard retention | Identify chronic issues |

---

## Health Check Interpretation

### Health Endpoint: `GET /api/health`

**URL:** `http://<ingestion-service-host>:3031/api/health`

#### Response Structure

```json
{
  "status": "ok" | "degraded" | "unhealthy",
  "warnings": ["Warning message 1", "..."],
  "mtproto": {
    "connected": boolean,
    "authorized": boolean,
    "lastPollAt": "ISO 8601 timestamp"
  },
  "channels": {
    "total": number,
    "active": number,
    "kol": number,
    "news": number
  },
  "clients": {
    "connected": number,
    "disconnectionWindows": [
      {
        "clientId": "uuid",
        "startedAt": "ISO 8601 timestamp",
        "endedAt": "ISO 8601 timestamp",
        "duration": number (milliseconds)
      }
    ]
  },
  "floodWait": {
    "count24h": number,
    "maxSeconds24h": number,
    "consecutiveFailures": number
  },
  "uptime": number (milliseconds)
}
```

#### Status Interpretations

| Status | HTTP Code | Meaning | Action Required |
|--------|-----------|---------|-----------------|
| `ok` | 200 | All systems operational | No action |
| `degraded` | 503 | MTProto disconnected OR zero clients | Investigate immediately |
| `unhealthy` | 503 | Critical failure (reserved for future use) | Escalate to Engineering |

#### Key Fields

**mtproto.connected**
- `true` - MTProto client connected to Telegram
- `false` - Disconnected. Messages are NOT being ingested.

**mtproto.authorized**
- `true` - Session is valid
- `false` - Session expired or revoked. Regenerate session string.

**mtproto.lastPollAt**
- Timestamp of last successful Telegram API poll
- If stale (>5 minutes old), polling is stuck.

**clients.connected**
- Number of active SSE connections from backend environments
- Expected: 1-10 (dev + staging + prod + any test instances)
- Alert if 0 for >10 minutes.

**clients.disconnectionWindows**
- Recent client disconnections >60 seconds
- Empty array = no recent long disconnections
- If present, clients are experiencing network instability.

**floodWait.count24h**
- Total FLOOD_WAIT errors in 24-hour sliding window
- Normal: 0-3
- Warning: 4-10
- Critical: >10 (ban risk)

**floodWait.maxSeconds24h**
- Longest FLOOD_WAIT duration encountered in 24 hours
- Normal: 0-30 seconds
- Warning: 31-120 seconds
- Critical: >120 seconds (severe rate limiting)

**floodWait.consecutiveFailures**
- Consecutive FLOOD_WAIT errors without success
- Normal: 0
- Warning: 1-2
- Critical: >3 (ban risk)

**warnings**
- Array of non-critical issues
- Example: `["Client disconnection window >60s detected"]`
- Investigate but service remains operational.

---

### Readiness Probe: `GET /api/health/ready`

**Purpose:** Kubernetes readiness probe (determines if pod should receive traffic)

**URL:** `http://<ingestion-service-host>:3031/api/health/ready`

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2026-07-03T10:00:00.000Z",
  "connectedClients": 3
}
```

**Always returns HTTP 200.** Service is "ready" if it can accept SSE connections (even if MTProto is disconnected).

---

### Liveness Probe: `GET /api/health/live`

**Purpose:** Kubernetes liveness probe (determines if pod should be restarted)

**URL:** `http://<ingestion-service-host>:3031/api/health/live`

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2026-07-03T10:00:00.000Z",
  "uptime": 3600000
}
```

**Always returns HTTP 200.** Service is "alive" if the Node.js process is running.

---

## Troubleshooting FAQ

### Q: How do I regenerate the MTProto session string?

**When:** Session expired, revoked, or AUTH_KEY_DUPLICATED error detected.

**Steps:**
1. Stop all running ingestion service instances:
   ```bash
   docker stop ingestion-service
   ```
2. On a development machine, generate a new session:
   ```bash
   cd apps/backend
   npm run telegram:gen-session
   ```
   - Follow prompts to authenticate (requires phone number + 2FA code)
   - Session string will be printed to stdout
3. Update environment variable:
   ```bash
   # Update .env or deployment config
   INGESTION_TELEGRAM_MTPROTO_SESSION="new-session-string-here"
   ```
4. Restart ingestion service:
   ```bash
   docker restart ingestion-service
   ```
5. Verify authorization:
   ```bash
   curl http://localhost:3031/api/health | jq '.mtproto.authorized'
   ```

**Security:** Session strings are sensitive credentials. Store in secrets manager, NOT in Git.

---

### Q: Why is `clients.connected` showing 0 but backends are running?

**Possible Causes:**
1. **Network connectivity issue** - Backends cannot reach ingestion service port 3031
2. **Backend configuration error** - `INGESTION_REMOTE_URL` environment variable incorrect
3. **Backend in MTProto mode** - `INGESTION_MODE=local` (should be `remote`)
4. **Firewall blocking connections** - Port 3031 not open
5. **Ingestion service crashed** - SSE endpoint not responding

**Debugging:**
1. Check backend logs for SSE connection errors:
   ```bash
   docker logs backend-app --tail 100 | grep "SSE"
   ```
2. Test connectivity from backend host:
   ```bash
   curl -I http://<ingestion-service-host>:3031/api/health
   ```
3. Verify backend configuration:
   ```bash
   docker exec backend-app env | grep INGESTION
   ```
   - Expected: `INGESTION_MODE=remote`
   - Expected: `INGESTION_REMOTE_URL=http://<ingestion-service-host>:3031`
4. Check ingestion service logs for incoming connection attempts:
   ```bash
   docker logs ingestion-service --tail 100 | grep "sse:client:connected"
   ```

---

### Q: Messages are being received but not broadcast. Why?

**Symptoms:**
- `ingestion_messages_received_total` is increasing
- `ingestion_messages_broadcast_total` is NOT increasing
- Logs show `message:received` but no broadcast events

**Possible Causes:**
1. **No SSE clients connected** - Messages have nowhere to go
2. **Broadcast error** - Exception thrown during SSE write (check logs)
3. **Deduplication filtering** - Messages are duplicates (by design)

**Debugging:**
1. Check client count:
   ```bash
   curl http://localhost:3031/api/health | jq '.clients.connected'
   ```
2. Check for broadcast errors in logs:
   ```bash
   docker logs ingestion-service --tail 200 | grep -i "broadcast"
   ```
3. Check if messages are duplicates (compare messageId with last-seen cursor):
   ```bash
   docker exec ingestion-service redis-cli GET "ingestion:lastSeen:-1001234567890"
   ```

---

### Q: Media files are returning 404. Why?

**Symptoms:**
- SSE payload includes media URLs
- `GET /api/media/:channelId/:messageId/:index` returns HTTP 404

**Possible Causes:**
1. **Media download failed** - File was not downloaded to disk (check logs)
2. **Incorrect media URL** - Path construction error
3. **Media file deleted** - Retention policy cleaned up file
4. **Uploads volume not mounted** - Docker volume misconfigured

**Debugging:**
1. Check if media file exists on disk:
   ```bash
   docker exec ingestion-service ls -lh /app/uploads/crypto-news/media/<channelId>/
   ```
2. Check for media download errors in logs:
   ```bash
   docker logs ingestion-service --tail 500 | grep '"event":"media:download:failed"'
   ```
3. Verify uploads volume mount:
   ```bash
   docker inspect ingestion-service | jq '.[0].Mounts'
   ```
   - Expected: `/app/uploads` mounted to host path or named volume

---

### Q: Why is the service restarting frequently?

**Symptoms:**
- Container restarts every few minutes
- `docker ps` shows high restart count
- `docker logs` shows startup messages repeatedly

**Possible Causes:**
1. **OOM (Out of Memory) kill** - Service exceeding memory limit
2. **Crash loop** - Unhandled exception causing process exit
3. **Liveness probe failure** - Kubernetes restarting unhealthy pod

**Debugging:**
1. Check container exit code:
   ```bash
   docker inspect ingestion-service | jq '.[0].State'
   ```
   - Exit code 137 = OOM killed
   - Exit code 1 = Crash
2. Check memory usage before crash:
   ```bash
   docker stats ingestion-service --no-stream
   ```
3. Check logs for unhandled exceptions:
   ```bash
   docker logs ingestion-service --tail 500 | grep -i "error"
   ```
4. Check Docker resource limits:
   ```bash
   docker inspect ingestion-service | jq '.[0].HostConfig.Memory'
   ```

**Mitigation:**
- If OOM: Increase memory limit in `docker-compose.yml` (minimum 512MB recommended)
- If crash: Review exception stack traces and escalate to Engineering

---

### Q: FLOOD_WAIT count is high (>10). What should I do?

**Symptoms:**
- `floodWait.count24h > 10` in health endpoint
- Logs show multiple `flood_wait:detected` events
- `floodWait.consecutiveFailures` increasing

**Impact:** Service is rate limited by Telegram. Risk of account ban if behavior continues.

**Immediate Actions:**
1. **Reduce polling frequency:**
   ```bash
   docker exec ingestion-service vi /app/config/ingestion.config.json
   ```
   - Increase `pollIntervalBaseMs` from 90000 to 120000 (2 minutes)
   - Increase `jitterPercent` from 30 to 50 (more randomness)
2. **Restart service** to apply config changes:
   ```bash
   docker restart ingestion-service
   ```
3. **Enable sleep window** (pause polling during low-activity hours):
   ```json
   {
     "sleepWindow": {
       "enabled": true,
       "startHour": 4,
       "endHour": 8
     }
   }
   ```
4. **Monitor for improvement** over next 4-8 hours:
   ```bash
   watch -n 60 'curl -s http://localhost:3031/api/health | jq ".floodWait"'
   ```

**Long-Term Actions:**
- Review channel count (reduce if >50 channels)
- Implement channel prioritization (poll critical channels more frequently)
- Escalate to Engineering if FLOOD_WAIT persists after config changes

---

### Q: How do I force all clients to reconnect?

**When:** After service deployment, network changes, or troubleshooting SSE issues.

**Steps:**
1. **Restart ingestion service:**
   ```bash
   docker restart ingestion-service
   ```
   - This will drop all existing SSE connections
2. **Clients will auto-reconnect** within 1-30 seconds (exponential backoff)
3. **Verify reconnection:**
   ```bash
   watch -n 5 'curl -s http://localhost:3031/api/health | jq ".clients.connected"'
   ```
   - Wait for client count to return to normal (1-10)

**Alternative (restart backends without restarting ingestion service):**
```bash
# Restart all backend environments
docker restart backend-dev
docker restart backend-staging
docker restart backend-prod
```

---

### Q: How do I check if duplicate messages are being filtered correctly?

**Validation:**
1. **Check Redis last-seen cursors:**
   ```bash
   docker exec ingestion-service redis-cli KEYS "ingestion:lastSeen:*"
   ```
   - One key per channel
2. **Get current cursor for a channel:**
   ```bash
   docker exec ingestion-service redis-cli GET "ingestion:lastSeen:-1001234567890"
   ```
   - Returns last processed messageId
3. **Check for dedup cache hits** in logs (if implemented):
   ```bash
   docker logs ingestion-service --tail 1000 | grep "duplicate"
   ```

**Expected Behavior:**
- Each message is broadcast exactly once
- Restarting the service does NOT re-broadcast old messages
- Cursor is updated after each successful broadcast

---

### Q: Service health shows "ok" but backends report errors. Why?

**Symptoms:**
- Health endpoint returns HTTP 200 + `status: "ok"`
- Backend logs show ingestion errors or message processing failures

**Explanation:** Health endpoint only checks ingestion service health (MTProto connected, clients connected). It does NOT validate downstream backend processing.

**Debugging:**
1. **Check backend logs** for specific error messages:
   ```bash
   docker logs backend-app --tail 200 | grep -i "error"
   ```
2. **Verify message payloads** match expected format (compare SSE payload to backend expectations)
3. **Check for media URL accessibility** from backend:
   ```bash
   # On backend host
   curl -I http://<ingestion-service-host>:3031/api/media/-1001234567890/12345/0
   ```

**Note:** Ingestion service delivers messages successfully. Backend processing errors are NOT ingestion service issues (escalate to backend team).

---

## Escalation Procedures

### Severity Levels

| Severity | Response Time | Escalation Path |
|----------|---------------|-----------------|
| **CRITICAL** (P0) | 15 minutes | On-Call Engineer → Engineering Lead → CTO |
| **HIGH** (P1) | 1 hour | On-Call Engineer → Engineering Lead |
| **MEDIUM** (P2) | 4 hours | On-Call Engineer → Engineering Team |
| **LOW** (P3) | 24 hours | Ticket to Engineering Team |

### Critical Issues (P0 - Escalate Immediately)

- MTProto disconnected >15 minutes (no messages being ingested)
- Zero SSE clients connected >15 minutes (data pipeline stalled)
- FLOOD_WAIT count >20 in 24 hours (account ban imminent)
- Service crashes repeatedly (>5 restarts in 1 hour)
- Complete data loss (Redis corruption, uploads volume lost)

### High Priority Issues (P1 - Escalate Within 1 Hour)

- Broadcast latency >1s for >10 minutes (trading signals delayed)
- Memory usage >90% for >10 minutes (OOM imminent)
- Media download failure rate >50% for >1 hour
- Client disconnection windows >5 minutes

### Medium Priority Issues (P2 - Escalate Within 4 Hours)

- FLOOD_WAIT count 10-20 in 24 hours
- Broadcast latency 500ms-1s for >30 minutes
- 1-2 SSE clients missing (partial outage)
- Media download failure rate 10-50% for >1 hour

### Low Priority Issues (P3 - Log Ticket)

- Informational alerts (latency degraded but <500ms)
- Single client disconnection window <60s
- Media download occasional failures (<10% rate)

### Escalation Contact

**On-Call Engineer:** PagerDuty alert → SMS/voice call  
**Engineering Lead:** Slack @engineering-lead or escalation hotline  
**Documentation:** This playbook + deployment guide + requirements doc

---

## Appendix: Quick Reference Commands

### Health Checks
```bash
# Full health status
curl http://localhost:3031/api/health | jq '.'

# MTProto connection status
curl http://localhost:3031/api/health | jq '.mtproto.connected'

# Client count
curl http://localhost:3031/api/health | jq '.clients.connected'

# FLOOD_WAIT metrics
curl http://localhost:3031/api/health | jq '.floodWait'
```

### Metrics
```bash
# All Prometheus metrics
curl http://localhost:3031/metrics

# MTProto connection status
curl http://localhost:3031/metrics | grep ingestion_mtproto_connected

# SSE client count
curl http://localhost:3031/metrics | grep ingestion_sse_clients_connected

# FLOOD_WAIT count
curl http://localhost:3031/metrics | grep ingestion_flood_wait_count_24h
```

### Logs
```bash
# Tail logs in real-time
docker logs ingestion-service --tail 100 --follow

# Export last hour of logs
docker logs ingestion-service --since 1h > ingestion-$(date +%Y%m%d-%H%M).log

# Find MTProto connection events
docker logs ingestion-service --tail 1000 | grep '"event":"mtproto:connection:changed"'

# Find FLOOD_WAIT events
docker logs ingestion-service --tail 5000 | grep '"event":"flood_wait:detected"'

# Find SSE client events
docker logs ingestion-service --since 1h | grep -E '"event":"sse:client:(connected|disconnected)"'
```

### Service Control
```bash
# Restart service
docker restart ingestion-service

# Stop service
docker stop ingestion-service

# Start service
docker start ingestion-service

# View service status
docker ps | grep ingestion-service

# Check resource usage
docker stats ingestion-service --no-stream
```

### Redis Operations
```bash
# Connect to Redis
docker exec -it ingestion-service redis-cli

# Check last-seen cursors
docker exec ingestion-service redis-cli KEYS "ingestion:lastSeen:*"

# Get cursor for specific channel
docker exec ingestion-service redis-cli GET "ingestion:lastSeen:-1001234567890"

# Clear cursor (force re-processing from latest)
docker exec ingestion-service redis-cli DEL "ingestion:lastSeen:-1001234567890"
```

---

**Document Maintenance:**
- Review quarterly for accuracy
- Update after major incidents (postmortem findings)
- Update after service upgrades (new metrics, log events, or alert conditions)
- Notify on-call rotation of playbook changes

**Feedback:** Report playbook issues or suggestions to Engineering Team.
