# Centralized Ingestion Service - Pre-Deploy Checklist

**Version:** 1.0  
**Last Updated:** 2025-01-03  
**Requirements:** 12.5, GAP 6  

---

## Overview

This checklist ensures safe deployment of the centralized ingestion service by validating all prerequisites, verifying configuration correctness, and confirming rollback readiness before production cutover.

**Critical:** Follow this checklist sequentially. Do not skip steps. Each validation prevents potential issues that could cause service disruption or Telegram account bans.

---

## Pre-Deployment Validation

### Phase 1: Session Migration Validation

**Requirement:** GAP 6 (Session Isolation)  
**Goal:** Prevent AUTH_KEY_DUPLICATED errors by ensuring only the ingestion service has MTProto credentials.

#### 1.1 Run Session Validation Script

```bash
# From repository root
./scripts/validate-session-migration.sh
```

**Expected Output:**
```
✓ SUCCESS: VALIDATION PASSED
✓ SUCCESS: MTProto session correctly migrated to ingestion-service
✓ SUCCESS: Backend has no conflicting session variables
✓ SUCCESS: Safe to deploy - no AUTH_KEY_DUPLICATED risk
```

**If validation fails:**
- [ ] Remove ALL MTProto variables from `apps/backend/.env` or `apps/backend/.env.dev`
  - `TELEGRAM_MTPROTO_SESSION`
  - `TELEGRAM_MTPROTO_API_ID`
  - `TELEGRAM_MTPROTO_API_HASH`
  - `INGESTION_TELEGRAM_MTPROTO_SESSION`
  - `INGESTION_TELEGRAM_MTPROTO_API_ID`
  - `INGESTION_TELEGRAM_MTPROTO_API_HASH`
- [ ] Verify all MTProto variables are present in `apps/ingestion-service/.env`
- [ ] Re-run validation script until it passes

#### 1.2 Verify Ingestion Service Environment Variables

**File:** `apps/ingestion-service/.env`

**Required Variables:**

```bash
# MTProto Session (Critical - Single session requirement)
INGESTION_TELEGRAM_MTPROTO_API_ID=<your_api_id>
INGESTION_TELEGRAM_MTPROTO_API_HASH=<your_api_hash>
INGESTION_TELEGRAM_MTPROTO_SESSION=<your_session_string>

# API Server Configuration
INGESTION_PORT=3031
INGESTION_HOST=0.0.0.0
INGESTION_API_BASE_URL=http://localhost:3031

# Database Configuration (for telegram_raw_messages table)
INGESTION_DATABASE_HOST=localhost
INGESTION_DATABASE_PORT=5432
INGESTION_DATABASE_NAME=onchain_bot
INGESTION_DATABASE_USERNAME=postgres
INGESTION_DATABASE_PASSWORD=<password>
INGESTION_DATABASE_ENABLED=true

# Redis Configuration (for LastSeenManager cursor tracking)
INGESTION_REDIS_HOST=localhost
INGESTION_REDIS_PORT=6379
INGESTION_REDIS_DB=0
INGESTION_REDIS_PASSWORD=<password_if_required>

# Channel Seeding Configuration
INGESTION_SEED_KOLS=true
INGESTION_SEED_CRYPTO_NEWS=true

# Safety Configuration (Anti-ban protection)
INGESTION_MAX_CHANNELS=50
INGESTION_POLL_INTERVAL_BASE_MS=90000
INGESTION_JITTER_PERCENT=30
INGESTION_SLEEP_WINDOW_START=04:00
INGESTION_SLEEP_WINDOW_END=08:00
INGESTION_FLOOD_WAIT_THRESHOLD=10

# Media Storage Configuration
INGESTION_UPLOADS_DIR=/app/uploads
CRYPTO_NEWS_MEDIA_RETENTION_HOURS=72
```

**Validation Checklist:**
- [ ] All INGESTION_TELEGRAM_MTPROTO_* variables are set and non-empty
- [ ] Session string is valid (generated via `npm run telegram:gen-session`)
- [ ] Database credentials match production Postgres instance
- [ ] Redis credentials match production Redis instance
- [ ] INGESTION_API_BASE_URL matches the public URL of the ingestion service
- [ ] Safety config values are within safe limits (max channels ≤50, poll interval ≥60s)

#### 1.3 Verify Backend Environment Variables

**File:** `apps/backend/.env` or `apps/backend/.env.dev`

**Critical Checks:**
- [ ] NO `TELEGRAM_MTPROTO_SESSION` variable present
- [ ] NO `TELEGRAM_MTPROTO_API_ID` variable present
- [ ] NO `TELEGRAM_MTPROTO_API_HASH` variable present
- [ ] NO `INGESTION_TELEGRAM_MTPROTO_*` variables present

**Required Variables for SSE Mode:**

```bash
# Ingestion Client Configuration
INGESTION_MODE=remote
INGESTION_REMOTE_URL=http://ingestion-service:3031

# Database Configuration (unchanged)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=onchain_bot
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=<password>
DATABASE_ENABLED=true

# Redis Configuration (unchanged)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=<password_if_required>

# Telegram Bot API (for publishing to VIP channel - unchanged)
TELEGRAM_VIP_BOT_TOKEN=<bot_token>
TELEGRAM_VIP_CHANNEL_ID=<channel_id>
```

**Validation Checklist:**
- [ ] `INGESTION_MODE=remote` is set
- [ ] `INGESTION_REMOTE_URL` points to the ingestion service (use Docker service name `ingestion-service` for production)
- [ ] All backend MTProto variables are removed or commented out

---

### Phase 2: Docker Compose Verification

**Requirement:** 6.6 (Deployment Architecture), GAP 2 (Docker Networking)

#### 2.1 Verify docker-compose.prod.yml Configuration

**File:** `apps/backend/docker-compose.prod.yml`

**Expected Configuration:**

```yaml
services:
  ingestion-service:
    build:
      context: ../..
      dockerfile: apps/ingestion-service/Dockerfile
    container_name: onchain-bot-ingestion-service
    restart: unless-stopped
    networks:
      - onchain-net
    ports:
      - "3031:3031"
    volumes:
      - ./uploads:/app/uploads
      - ./config:/app/config
    env_file:
      - ../ingestion-service/.env
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3031/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  backend:
    # ... existing backend configuration ...
    depends_on:
      - postgres
      - redis
      - ingestion-service  # ADDED: backend depends on ingestion-service
    env_file:
      - .env.dev  # or .env
    networks:
      - onchain-net
```

**Validation Checklist:**
- [ ] `ingestion-service` service is defined
- [ ] `ingestion-service` uses shared network `onchain-net`
- [ ] `ingestion-service` port 3031 is mapped
- [ ] `ingestion-service` has `uploads` volume mounted to `/app/uploads`
- [ ] `ingestion-service` has `config` volume mounted to `/app/config`
- [ ] `ingestion-service` has `depends_on: [postgres, redis]`
- [ ] `ingestion-service` has health check configured
- [ ] `backend` service has `depends_on: [ingestion-service]` (prevents backend starting before ingestion)

#### 2.2 Verify Shared Volumes

**uploads Volume:**
- [ ] `./uploads` directory exists relative to docker-compose.prod.yml
- [ ] `./uploads` has correct permissions (writable by Docker user)
- [ ] `./uploads/crypto-news/media/` directory structure exists

**config Volume:**
- [ ] `./config` directory exists relative to docker-compose.prod.yml
- [ ] `./config/ingestion.config.json` exists with valid JSON

**Create missing directories:**

```bash
cd apps/backend
mkdir -p uploads/crypto-news/media
mkdir -p config
chmod -R 775 uploads
```

#### 2.3 Verify Network Configuration

**Network Name:** `onchain-net`

**Validation:**
- [ ] Network is defined in docker-compose.prod.yml (should already exist)
- [ ] All services (ingestion-service, backend, postgres, redis) use the same network
- [ ] Service DNS resolution works: backend can reach `http://ingestion-service:3031`

**Test DNS resolution (after deployment):**

```bash
# From backend container
docker exec -it onchain-bot-backend curl http://ingestion-service:3031/api/health
# Expected: 200 OK with JSON health status
```

---

### Phase 3: Configuration File Verification

**Requirement:** 11.6 (Safety Configuration)

#### 3.1 Verify ingestion.config.json

**File:** `config/ingestion.config.json`

**Expected Content:**

```json
{
  "maxChannels": 50,
  "pollIntervalBaseMs": 90000,
  "jitterPercent": 30,
  "sleepWindow": {
    "start": "04:00",
    "end": "08:00",
    "timezone": "UTC"
  },
  "floodProtection": {
    "initialBackoffMs": 5000,
    "multiplier": 2,
    "maxBackoffMs": 3600000,
    "maxAttempts": 5,
    "threshold24h": 10
  },
  "mediaRetention": {
    "defaultHours": 72,
    "minHours": 1
  }
}
```

**Validation Checklist:**
- [ ] `maxChannels` is ≤50 (Telegram ToS compliance)
- [ ] `pollIntervalBaseMs` is ≥60000 (60s minimum to avoid flood)
- [ ] `jitterPercent` is between 10-50 (30% recommended)
- [ ] `sleepWindow` covers low-risk hours (04:00-08:00 UTC recommended)
- [ ] `floodProtection.threshold24h` is ≤10 (alert trigger)
- [ ] `mediaRetention.defaultHours` is ≥1 (minimum retention)

**If config file is missing:**

```bash
# Use task 5.4 generated config as template
cd config
cat > ingestion.config.json << 'EOF'
{
  "maxChannels": 50,
  "pollIntervalBaseMs": 90000,
  "jitterPercent": 30,
  "sleepWindow": {
    "start": "04:00",
    "end": "08:00",
    "timezone": "UTC"
  },
  "floodProtection": {
    "initialBackoffMs": 5000,
    "multiplier": 2,
    "maxBackoffMs": 3600000,
    "maxAttempts": 5,
    "threshold24h": 10
  },
  "mediaRetention": {
    "defaultHours": 72,
    "minHours": 1
  }
}
EOF
```

---

### Phase 4: Build and Health Check Verification

**Requirement:** 6.1, 6.4 (Deployment)

#### 4.1 Build Ingestion Service Image

```bash
cd apps/backend  # Location of docker-compose.prod.yml
docker compose build ingestion-service
```

**Expected Output:**
- No build errors
- Image tagged as `onchain-bot-ingestion-service:latest`

**Validation:**
- [ ] Build completed successfully
- [ ] No TypeScript compilation errors
- [ ] No missing dependencies errors

**If build fails:**
- Check Dockerfile exists at `apps/ingestion-service/Dockerfile`
- Check package.json has all required dependencies
- Check tsconfig.json paths are correct

#### 4.2 Start Ingestion Service Standalone

**Before starting:**
- [ ] Postgres is running and accessible
- [ ] Redis is running and accessible
- [ ] Environment variables are set in `apps/ingestion-service/.env`

**Start service:**

```bash
cd apps/backend
docker compose up ingestion-service -d
```

**Monitor startup logs:**

```bash
docker logs -f onchain-bot-ingestion-service
```

**Expected log output:**
```
[Nest] INFO [IngestionService] Starting Ingestion Service v1.0.0
[Nest] INFO [ConfigService] Loaded configuration from ingestion.config.json
[Nest] INFO [TelegramClientManager] Initializing MTProto client...
[Nest] INFO [TelegramClientManager] MTProto session loaded successfully
[Nest] INFO [TelegramClientManager] MTProto client connected and authorized
[Nest] INFO [KolSeeder] Seeding KOL channels...
[Nest] INFO [KolSeeder] Joined 23 KOL channels
[Nest] INFO [CryptoNewsSeeder] Seeding crypto news channels...
[Nest] INFO [CryptoNewsSeeder] Joined 5 crypto news channels
[Nest] INFO [StreamService] SSE service initialized (0 clients)
[Nest] INFO [NestApplication] Nest application successfully started
[Nest] INFO [IngestionService] Listening on http://0.0.0.0:3031
```

**Validation Checklist:**
- [ ] No error logs during startup
- [ ] "MTProto client connected and authorized" log present
- [ ] "Joined X channels" logs present for KOL and news seeders
- [ ] "Nest application successfully started" log present
- [ ] Service listening on port 3031

**If startup fails:**
- Check session string is valid (regenerate if expired)
- Check database connection (host, port, credentials)
- Check Redis connection (host, port, credentials)
- Check Telegram API rate limits (wait if FLOOD_WAIT error)

#### 4.3 Verify Health Endpoint

```bash
curl -s http://localhost:3031/api/health | jq
```

**Expected Response (HTTP 200):**

```json
{
  "status": "ok",
  "timestamp": "2025-01-03T10:00:00.000Z",
  "uptime": 120,
  "mtproto": {
    "connected": true,
    "authorized": true,
    "lastMessageAt": "2025-01-03T09:59:30.000Z"
  },
  "channels": {
    "total": 28,
    "kol": 23,
    "news": 5
  },
  "clients": {
    "connected": 0,
    "totalConnections": 0
  },
  "floodWait": {
    "count24h": 0,
    "lastWaitSeconds": 0,
    "banRisk": "low"
  }
}
```

**Validation Checklist:**
- [ ] HTTP status is 200 (not 503)
- [ ] `mtproto.connected` is `true`
- [ ] `mtproto.authorized` is `true`
- [ ] `channels.total` > 0 (channels seeded successfully)
- [ ] `floodWait.count24h` is 0 (no flood errors on startup)

**If health check fails (503):**
- Check MTProto connection logs
- Verify session is not expired
- Check network connectivity to Telegram servers
- Wait 5 minutes and retry (Telegram may have temporary rate limits)

#### 4.4 Verify Channels Endpoint

```bash
curl -s http://localhost:3031/api/channels | jq
```

**Expected Response:**

```json
[
  {
    "id": "-1001234567890",
    "title": "KOL Channel Name",
    "type": "kol",
    "participantCount": 12345,
    "joinedAt": "2025-01-03T10:00:00.000Z"
  },
  {
    "id": "-1009876543210",
    "title": "Crypto News Channel",
    "type": "crypto-news",
    "participantCount": 54321,
    "joinedAt": "2025-01-03T10:00:01.000Z"
  }
]
```

**Validation Checklist:**
- [ ] Response is an array of channel objects
- [ ] Channel count matches `channels.total` from health endpoint
- [ ] Each channel has `id`, `title`, `type`, `participantCount`, `joinedAt`

#### 4.5 Verify SSE Stream Endpoint

**Test SSE connection:**

```bash
curl -N http://localhost:3031/api/ingestion/stream
```

**Expected Output (streaming):**

```
event: connection:ready
data: {"timestamp":"2025-01-03T10:00:00.000Z","channels":28}

event: health:ping
data: {"timestamp":"2025-01-03T10:00:30.000Z"}

event: health:ping
data: {"timestamp":"2025-01-03T10:01:00.000Z"}
```

**Validation:**
- [ ] `connection:ready` event received immediately
- [ ] `health:ping` events received every 30 seconds
- [ ] No connection drops or errors

**Press Ctrl+C to stop the stream.**

#### 4.6 Verify Media Endpoint (if media exists)

**Check if media files exist:**

```bash
ls -lh uploads/crypto-news/media/
```

**If media files exist, test serving:**

```bash
# Replace with actual channelId/messageId/index from a real file
curl -I http://localhost:3031/api/media/-1001234567890/12345/0
```

**Expected Response:**

```
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Length: 123456
ETag: "abc123"
Cache-Control: public, max-age=31536000
```

**Validation:**
- [ ] HTTP status is 200
- [ ] `Content-Type` matches file MIME type
- [ ] `Cache-Control` header is present
- [ ] `ETag` header is present

**If 404 (expected if no media downloaded yet):**
- This is normal for a fresh deployment
- Media will be downloaded when messages with media arrive

---

### Phase 5: Database and Redis Verification

**Requirement:** Invariant 6 (State Persistence), GAP 1 (Backfill)

#### 5.1 Verify Database Schema

**Check if telegram_raw_messages table exists:**

```sql
-- Connect to database
psql -h localhost -U postgres -d onchain_bot

-- Check table exists
\dt telegram_raw_messages

-- Check schema
\d telegram_raw_messages
```

**Expected Schema:**

```
Table "public.telegram_raw_messages"
   Column    |            Type             | Nullable
-------------+-----------------------------+-----------
 id          | uuid                        | not null
 channel_id  | character varying           | not null
 message_id  | integer                     | not null
 text        | text                        | 
 ingested_at | timestamp without time zone | not null
 
Indexes:
    "telegram_raw_messages_pkey" PRIMARY KEY, btree (id)
    "telegram_raw_messages_channel_id_message_id_key" UNIQUE CONSTRAINT, btree (channel_id, message_id)
    "idx_telegram_raw_messages_ingested_at" btree (ingested_at)
```

**Validation:**
- [ ] Table exists
- [ ] Unique constraint on (channel_id, message_id)
- [ ] Index on ingested_at (for TTL cleanup)

**If table missing:**
- Run migrations: `cd apps/ingestion-service && npm run migration:run`

#### 5.2 Verify Redis Cursor Tracking

**Connect to Redis:**

```bash
redis-cli -h localhost -p 6379
```

**Check for existing cursors:**

```redis
KEYS ingestion:lastSeen:*
```

**Expected:**
- Empty list on fresh deployment (no cursors yet)
- List of keys after messages ingested: `ingestion:lastSeen:-1001234567890`

**Get a cursor value:**

```redis
GET ingestion:lastSeen:-1001234567890
```

**Expected:**
- Integer value representing last seen message ID
- Increases as new messages are ingested

**Validation:**
- [ ] Redis connection succeeds
- [ ] KEYS command works
- [ ] GET command returns integer or nil (if no messages yet)

**Exit Redis:**

```redis
EXIT
```

---

### Phase 6: Rollback Preparation

**Requirement:** 7.4, 7.5, 12.4 (Fast Rollback)

#### 6.1 Document Current Backend Configuration

**Create backup of backend .env:**

```bash
cd apps/backend
cp .env .env.backup.pre-ingestion-service
# or
cp .env.dev .env.dev.backup.pre-ingestion-service
```

**Document current INGESTION_MODE:**

```bash
grep INGESTION_MODE .env || echo "INGESTION_MODE not set (defaults to 'local')"
```

**Validation:**
- [ ] Backup .env file created
- [ ] Backup contains MTProto variables (if rolling back from fresh migration)

#### 6.2 Prepare Rollback Script

**Create:** `scripts/rollback-ingestion-service.sh`

```bash
#!/usr/bin/env bash
# Rollback to MTProto mode (local ingestion in backend)

set -euo pipefail

echo "🔄 Rolling back to MTProto mode..."

# Update backend .env
cd apps/backend

# Set INGESTION_MODE to local
sed -i.bak 's/^INGESTION_MODE=remote/INGESTION_MODE=local/' .env || \
    echo "INGESTION_MODE=local" >> .env

# Restore MTProto variables from backup (if backup exists)
if [[ -f .env.backup.pre-ingestion-service ]]; then
    echo "✓ Restoring MTProto variables from backup..."
    grep "TELEGRAM_MTPROTO" .env.backup.pre-ingestion-service >> .env || true
fi

# Restart backend
echo "✓ Restarting backend..."
docker compose restart backend

# Wait for backend to start
sleep 10

# Check backend health
echo "✓ Checking backend health..."
curl -f http://localhost:3030/api/health || {
    echo "❌ Backend health check failed"
    exit 1
}

echo "✅ Rollback complete. Backend running in MTProto mode."
echo "⚠️  Remember to investigate ingestion-service issues before re-attempting migration."
```

**Make executable:**

```bash
chmod +x scripts/rollback-ingestion-service.sh
```

**Validation:**
- [ ] Rollback script created
- [ ] Script is executable
- [ ] Script restores INGESTION_MODE=local
- [ ] Script restarts backend

#### 6.3 Test Rollback Procedure (Dry Run)

**Before production deployment, test rollback in staging:**

1. [ ] Deploy ingestion service to staging
2. [ ] Migrate staging backend to SSE mode (INGESTION_MODE=remote)
3. [ ] Verify staging backend receives messages via SSE
4. [ ] Execute rollback script: `./scripts/rollback-ingestion-service.sh`
5. [ ] Verify staging backend reverts to MTProto mode
6. [ ] Verify staging backend receives messages via MTProto
7. [ ] Measure rollback time (should be <5 minutes)

**Document rollback time:**
- Rollback executed at: __________
- Backend health restored at: __________
- Total downtime: __________ minutes

**Validation:**
- [ ] Rollback script works without errors
- [ ] Backend successfully reverts to MTProto mode
- [ ] Total rollback time is <5 minutes

---

### Phase 7: Monitoring and Observability Verification

**Requirement:** 9.5, 9.6, 11.7 (Metrics and Alerts)

#### 7.1 Verify Prometheus Metrics Endpoint

```bash
curl -s http://localhost:3031/metrics | head -20
```

**Expected Output:**

```
# HELP ingestion_mtproto_connected MTProto connection status (1=connected, 0=disconnected)
# TYPE ingestion_mtproto_connected gauge
ingestion_mtproto_connected 1

# HELP ingestion_messages_received_total Total messages received from Telegram
# TYPE ingestion_messages_received_total counter
ingestion_messages_received_total{channelId="-1001234567890",type="kol"} 42

# HELP ingestion_messages_broadcast_total Total messages broadcast to SSE clients
# TYPE ingestion_messages_broadcast_total counter
ingestion_messages_broadcast_total 42

# HELP ingestion_sse_clients_connected Number of connected SSE clients
# TYPE ingestion_sse_clients_connected gauge
ingestion_sse_clients_connected 0

# HELP ingestion_flood_wait_count_24h Number of FLOOD_WAIT errors in last 24 hours
# TYPE ingestion_flood_wait_count_24h gauge
ingestion_flood_wait_count_24h 0
```

**Validation:**
- [ ] `/metrics` endpoint returns Prometheus format
- [ ] `ingestion_mtproto_connected` is 1
- [ ] `ingestion_flood_wait_count_24h` is 0 or low
- [ ] All expected metrics are present

#### 7.2 Verify Structured Logging

**Check logs for required log entries:**

```bash
docker logs onchain-bot-ingestion-service | grep -E "(message:received|sse:client|flood_wait)" | head -10
```

**Expected Log Format (JSON):**

```json
{
  "level": "info",
  "message": "message:received",
  "channelId": "-1001234567890",
  "messageId": 12345,
  "hasMedia": true,
  "mediaCount": 2,
  "timestamp": "2025-01-03T10:00:00.000Z"
}
```

**Validation:**
- [ ] Logs are in JSON format
- [ ] `message:received` events logged with channelId, messageId
- [ ] `sse:client:connected` events logged with clientId
- [ ] `flood_wait:detected` events logged (if any occurred)

#### 7.3 Review Monitoring Playbook

**Reference Document:** `docs/monitoring/ingestion-service-playbook.md` (Task 7.4)

**Pre-deploy review:**
- [ ] Read monitoring playbook
- [ ] Understand alert conditions
- [ ] Know where to find logs (Docker logs, Prometheus metrics)
- [ ] Know troubleshooting procedures for common issues
- [ ] Know escalation path if critical alerts fire

---

## Pre-Deploy Checklist Summary

### ✅ Phase 1: Session Migration Validation
- [ ] Session validation script passes
- [ ] Ingestion service .env has MTProto variables
- [ ] Backend .env has NO MTProto variables
- [ ] INGESTION_MODE=remote set in backend .env

### ✅ Phase 2: Docker Compose Verification
- [ ] Ingestion service defined in docker-compose.prod.yml
- [ ] Shared network (onchain-net) configured
- [ ] Volumes (uploads, config) mounted
- [ ] Health check configured

### ✅ Phase 3: Configuration File Verification
- [ ] ingestion.config.json exists with safe defaults
- [ ] Safety config within Telegram ToS limits

### ✅ Phase 4: Build and Health Check Verification
- [ ] Ingestion service builds successfully
- [ ] Ingestion service starts without errors
- [ ] Health endpoint returns 200
- [ ] MTProto connected and authorized
- [ ] Channels seeded successfully
- [ ] SSE stream endpoint works

### ✅ Phase 5: Database and Redis Verification
- [ ] telegram_raw_messages table exists
- [ ] Redis cursor tracking works

### ✅ Phase 6: Rollback Preparation
- [ ] Backend .env backup created
- [ ] Rollback script created and tested
- [ ] Rollback time measured (<5 minutes)

### ✅ Phase 7: Monitoring and Observability Verification
- [ ] Prometheus metrics endpoint works
- [ ] Structured logging configured
- [ ] Monitoring playbook reviewed

---

## Production Deployment Authorization

**Deployment Lead:** _______________________  
**Date:** _______________________  
**Deployment Window:** _______________________

**Checklist Review:**
- [ ] All phases completed successfully
- [ ] No critical issues identified
- [ ] Rollback plan tested and validated
- [ ] Monitoring and alerting configured
- [ ] Team briefed on deployment plan

**Approval:**

- [ ] **Technical Lead:** Reviewed and approved - _______________________
- [ ] **DevOps Lead:** Reviewed and approved - _______________________
- [ ] **On-Call Engineer:** Available during deployment - _______________________

**Authorization to proceed:** ☐ YES  ☐ NO

---

## Post-Deployment Validation

**After deployment, verify:**

1. [ ] Ingestion service health endpoint returns 200
2. [ ] Backend SSE client connects successfully ("SSE connection established" log)
3. [ ] Messages arrive in backend database (query `telegram_raw_messages` table)
4. [ ] KOL extraction pipeline runs
5. [ ] Crypto-news ingestion works
6. [ ] Dashboard receives real-time updates
7. [ ] No errors in ingestion service logs (first 15 minutes)
8. [ ] No FLOOD_WAIT errors in metrics
9. [ ] Prometheus metrics updating correctly
10. [ ] All monitoring alerts silent

**Monitor for 1 hour post-deployment. If any issues detected, execute rollback procedure.**

---

## References

- **Session Validation Script:** `scripts/validate-session-migration.sh`
- **Deployment Runbook:** `docs/deployment/ingestion-service-runbook.md` (Task 7.3)
- **Monitoring Playbook:** `docs/monitoring/ingestion-service-playbook.md` (Task 7.4)
- **Rollback Script:** `scripts/rollback-ingestion-service.sh`
- **Requirements Document:** `.kiro/specs/centralized-ingestion-service/requirements.md`
- **Design Document:** `.kiro/specs/centralized-ingestion-service/design.md`
- **Tasks Document:** `.kiro/specs/centralized-ingestion-service/tasks.md`

---

## Emergency Contacts

**Critical Issues:**
- Telegram account banned: _______________________
- Service completely down: _______________________
- Data loss detected: _______________________

**Escalation Path:**
1. Execute rollback script immediately
2. Notify on-call engineer
3. Investigate root cause
4. Update troubleshooting FAQ
5. Schedule post-mortem

---

**End of Checklist**
