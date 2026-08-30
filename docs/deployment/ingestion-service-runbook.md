# Centralized Ingestion Service - Deployment Runbook

**Version:** 1.0  
**Last Updated:** 2026-08-30  
**Target Environment:** CryptoGanster Droplet (144.126.203.139)  
**Related Requirements:** 12.5, 7.2, 7.4, 7.5

## Overview

This runbook documents the phased deployment strategy for migrating from per-environment MTProto clients to a centralized Telegram ingestion service. The migration follows a 5-phase approach to minimize risk and ensure <5 minute rollback capability.

### Critical Success Factors

- **Zero message loss** during migration (Requirement 10.1)
- **<5 minute rollback time** if issues arise (Requirement 12.4)
- **48-hour side-by-side validation** before production cutover (Requirement 7.2)
- **Complete documentation** before starting (Requirement 12.5)

### Architecture Summary

```
Before Migration:
DEV Backend (MTProto) ──┐
STAGING Backend (MTProto) ─┼─> Telegram API (3x connections, 3x bandwidth)
PROD Backend (MTProto) ──┘

After Migration:
                         ┌─> DEV Backend (SSE Client)
Ingestion Service (MTProto) ─┼─> STAGING Backend (SSE Client)
                         └─> PROD Backend (SSE Client)
                              ↑ Single connection, shared media
```

---

## Prerequisites

### Environment Variables

**Ingestion Service (new `.env.ingestion`):**
```bash
# MTProto Configuration (migrate from backend .env)
INGESTION_TELEGRAM_API_ID=<from backend TELEGRAM_API_ID>
INGESTION_TELEGRAM_API_HASH=<from backend TELEGRAM_API_HASH>
INGESTION_TELEGRAM_MTPROTO_SESSION=<from backend TELEGRAM_MTPROTO_SESSION>

# Server Configuration
INGESTION_PORT=3031
INGESTION_API_BASE_URL=http://cryptoganster:3031

# Redis (shared with backend)
INGESTION_REDIS_HOST=redis
INGESTION_REDIS_PORT=6379
INGESTION_REDIS_PASSWORD=<from backend REDIS_PASSWORD>

# Storage
INGESTION_UPLOADS_ROOT=/opt/onchain-bot/uploads
INGESTION_MEDIA_RETENTION_DAYS=30

# Anti-Ban Configuration (Requirement 11)
INGESTION_MAX_CHANNELS=50
INGESTION_POLL_INTERVAL_BASE_MS=90000
INGESTION_JITTER_PERCENT=30
INGESTION_SLEEP_WINDOW_START_UTC=04
INGESTION_SLEEP_WINDOW_END_UTC=08
INGESTION_FLOOD_WAIT_MAX_ATTEMPTS=5
```

**Backend Environments (add to existing `.env`):**
```bash
# Feature flag for migration (Requirement 7.1)
INGESTION_MODE=local  # Phase 1-2: local, Phase 3+: remote

# Ingestion service endpoint (when INGESTION_MODE=remote)
INGESTION_REMOTE_URL=http://cryptoganster:3031
```

### Docker Compose Files

**`apps/ingestion-service/docker-compose.yml`** (new file):
```yaml
version: '3.8'

services:
  ingestion-service:
    image: ghcr.io/bryanstevenss/onchain-bot-ingestion:latest
    container_name: onchain-bot-ingestion
    restart: unless-stopped
    env_file:
      - .env.ingestion
    ports:
      - "3031:3031"
    networks:
      - onchain-bot-net
    volumes:
      - /opt/onchain-bot/uploads:/opt/onchain-bot/uploads
      - /opt/onchain-bot/apps/ingestion-service/logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3031/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    depends_on:
      - redis

networks:
  onchain-bot-net:
    external: true
```

### GitHub Actions Workflow

**`.github/workflows/deploy-ingestion.yml`** (new file):
```yaml
name: Deploy ingestion service

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        type: choice
        options:
          - staging
          - production

concurrency:
  group: deploy-ingestion-${{ inputs.environment }}
  cancel-in-progress: false

permissions:
  contents: read
  packages: write

jobs:
  build-and-push:
    name: Build and push to GHCR
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push ingestion service
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/ingestion-service/Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository }}-ingestion:${{ github.sha }}
            ghcr.io/${{ github.repository }}-ingestion:${{ inputs.environment }}-latest
          cache-from: type=registry,ref=ghcr.io/${{ github.repository }}-ingestion:cache
          cache-to: type=registry,ref=ghcr.io/${{ github.repository }}-ingestion:cache,mode=max
          platforms: linux/amd64

  deploy:
    name: Deploy to ${{ inputs.environment }}
    runs-on: self-hosted
    needs: build-and-push
    environment: ${{ inputs.environment }}
    steps:
      - uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Pull ingestion service image
        run: |
          docker pull ghcr.io/${{ github.repository }}-ingestion:${{ inputs.environment }}-latest

      - name: Deploy ingestion service
        run: |
          cd /opt/onchain-bot/apps/ingestion-service
          docker compose up -d --force-recreate ingestion-service

      - name: Wait for health check
        run: |
          for i in $(seq 1 30); do
            if curl -sf http://localhost:3031/api/health; then
              echo "✓ Ingestion service healthy"
              exit 0
            fi
            echo "Waiting... attempt $i/30"
            sleep 5
          done
          echo "❌ Health check failed"
          docker logs onchain-bot-ingestion --tail 50
          exit 1
```

---

## Phase 1: Deploy Ingestion Service Standalone

**Objective:** Deploy and validate the ingestion service in isolation without affecting existing backend environments.

**Duration:** 2-4 hours  
**Validation Criteria:** MTProto connected, channels joined, messages streaming to logs

### 1.1 Pre-Deployment Checks

**On CryptoGanster droplet:**

```bash
# Verify disk space (need ~2GB for Docker images)
df -h /

# Verify Redis is running
docker ps | grep redis

# Verify uploads directory exists
ls -la /opt/onchain-bot/uploads/

# Backup current MTProto session string
cd /opt/onchain-bot/apps/backend
grep TELEGRAM_MTPROTO_SESSION .env.production > /tmp/mtproto-session-backup.txt

# Verify no port conflicts on 3031
sudo lsof -i :3031
```

### 1.2 Create Ingestion Service Environment File

```bash
cd /opt/onchain-bot/apps/ingestion-service

# Create .env.ingestion from template
cat > .env.ingestion << 'EOF'
# MTProto Configuration (migrate from backend .env.production)
INGESTION_TELEGRAM_API_ID=<COPY_FROM_BACKEND>
INGESTION_TELEGRAM_API_HASH=<COPY_FROM_BACKEND>
INGESTION_TELEGRAM_MTPROTO_SESSION=<COPY_FROM_BACKEND>

# Server Configuration
INGESTION_PORT=3031
INGESTION_API_BASE_URL=http://cryptoganster:3031

# Redis (shared with backend)
INGESTION_REDIS_HOST=redis
INGESTION_REDIS_PORT=6379
INGESTION_REDIS_PASSWORD=<COPY_FROM_BACKEND>

# Storage
INGESTION_UPLOADS_ROOT=/opt/onchain-bot/uploads
INGESTION_MEDIA_RETENTION_DAYS=30

# Anti-Ban Configuration
INGESTION_MAX_CHANNELS=50
INGESTION_POLL_INTERVAL_BASE_MS=90000
INGESTION_JITTER_PERCENT=30
INGESTION_SLEEP_WINDOW_START_UTC=04
INGESTION_SLEEP_WINDOW_END_UTC=08
INGESTION_FLOOD_WAIT_MAX_ATTEMPTS=5
EOF

# Secure the file
chmod 600 .env.ingestion
```

### 1.3 Deploy via GitHub Actions

```bash
# Trigger deployment workflow
gh workflow run deploy-ingestion.yml \
  --field environment=production

# Monitor workflow progress
gh run watch

# Or deploy manually on droplet
cd /opt/onchain-bot/apps/ingestion-service
docker compose up -d ingestion-service
```

### 1.4 Validate Standalone Operation

**Health Check:**
```bash
# Check service health
curl -s http://localhost:3031/api/health | jq .

# Expected output:
# {
#   "status": "ok",
#   "mtproto": {
#     "connected": true,
#     "authorized": true,
#     "lastPollAt": "2026-08-30T10:00:00Z"
#   },
#   "channels": {
#     "total": 15,
#     "active": 15,
#     "kol": 10,
#     "news": 5
#   },
#   "clients": {
#     "connected": 0
#   },
#   "floodWait": {
#     "count24h": 0,
#     "maxSeconds24h": 0,
#     "consecutiveFailures": 0
#   },
#   "uptime": 120000
# }
```

**Channel Metadata:**
```bash
# Verify all channels joined
curl -s http://localhost:3031/api/channels | jq .

# Expected: Array of 15 channels with titles and participant counts
```

**Message Streaming:**
```bash
# Monitor SSE stream (Ctrl+C to stop)
curl -N http://localhost:3031/api/ingestion/stream

# Expected output (within 5 minutes):
# event: connection:ready
# data: {"timestamp":"2026-08-30T10:00:00Z","channels":15}
#
# event: message:ingested
# data: {"peerId":"-1001234567890","messageId":12345,...}
```

**Log Inspection:**
```bash
# Check for errors
docker logs onchain-bot-ingestion --tail 100 | grep -i error

# Check for FLOOD_WAIT warnings (should be 0)
docker logs onchain-bot-ingestion | grep -i flood

# Verify message ingestion rate
docker logs onchain-bot-ingestion | grep "message:ingested" | wc -l
```

**Media Serving:**
```bash
# Wait for first message with media
# Extract URL from SSE stream, then test:
curl -I http://localhost:3031/api/media/-1001234567890/12345/0

# Expected:
# HTTP/1.1 200 OK
# Content-Type: image/jpeg
# Cache-Control: public, max-age=31536000
```

### 1.5 Phase 1 Rollback

**If deployment fails:**

```bash
# Stop ingestion service
docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml down

# No impact on existing backends (still using MTProto)
# Verify production backend still healthy:
curl http://localhost:3030/api/health
```

**Phase 1 Success Criteria:**
- ✅ Health endpoint returns 200 OK
- ✅ MTProto connected and authorized
- ✅ All 15 channels joined and active
- ✅ SSE stream receives messages within 5 minutes
- ✅ Media files accessible via HTTP
- ✅ Zero FLOOD_WAIT errors in logs
- ✅ Disk usage <80%

---

## Phase 2: Migrate Staging Backend to SSE

**Objective:** Switch staging backend from local MTProto to remote SSE ingestion, validate functional parity.

**Duration:** 1-2 hours  
**Validation Criteria:** Staging processes messages identically to before, zero message loss

### 2.1 Pre-Migration Validation

**Capture baseline metrics from staging (before migration):**

```bash
# SSH to CryptoGanster
ssh CryptoGanster

# Record current message counts
curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id'
# Save this messageId as BASELINE_MESSAGE_ID

# Record current channels
curl -s http://localhost:3031/api/channels | jq '[.[] | .id]' > /tmp/staging-channels-before.json
```

### 2.2 Update Staging Backend Configuration

**Option A: Via GitHub Actions (Recommended)**

```bash
# 1. Update staging backend environment in GitHub repo
cd /opt/onchain-bot/apps/backend
git checkout dev

# 2. Add to .env.staging.template
echo "INGESTION_MODE=remote" >> .env.staging.template
echo "INGESTION_REMOTE_URL=http://cryptoganster:3031" >> .env.staging.template

git add .env.staging.template
git commit -m "feat: enable SSE ingestion mode for staging"
git push origin dev

# 3. Trigger staging deployment
gh workflow run deploy-staging.yml

# 4. Wait for deployment
gh run watch
```

**Option B: Manual Update (Faster for testing)**

```bash
# SSH to CryptoGanster
cd /opt/onchain-bot-staging/apps/backend

# Update .env.staging
cat >> .env.staging << 'EOF'
INGESTION_MODE=remote
INGESTION_REMOTE_URL=http://cryptoganster:3031
EOF

# Restart staging backend
docker compose -f docker-compose.staging.yml restart backend

# Wait for startup (60s)
sleep 60
```

### 2.3 Validate SSE Connection

**Check backend logs for SSE connection:**
```bash
docker logs onchain-bot-staging-backend --tail 100 | grep -i "SSE"

# Expected:
# [INFO] Using SSE ingestion client (remote mode)
# [INFO] SSE connection established
```

**Check ingestion service sees the client:**
```bash
curl -s http://localhost:3031/api/health | jq '.clients.connected'

# Expected: 1 (staging backend connected)
```

### 2.4 Validate Message Processing

**Monitor message flow for 15 minutes:**

```bash
# Terminal 1: Watch ingestion service broadcast
docker logs -f onchain-bot-ingestion | grep "Broadcasting message"

# Terminal 2: Watch staging backend receive
docker logs -f onchain-bot-staging-backend | grep "Received message from SSE"

# Terminal 3: Watch downstream processing
docker logs -f onchain-bot-staging-backend | grep "KolIngestionOrchestrator"

# Expected: Messages flow through all 3 stages with <500ms latency
```

**Validate recent calls match production:**
```bash
# Get recent calls from staging
curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=5 | jq '[.calls[] | {id, ticker, occurredAt}]' > /tmp/staging-calls.json

# Get recent calls from production
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=5 | jq '[.calls[] | {id, ticker, occurredAt}]' > /tmp/prod-calls.json

# Compare (should be identical within ~1s timestamp difference)
diff /tmp/staging-calls.json /tmp/prod-calls.json
```

### 2.5 Performance Validation

**Measure SSE latency:**
```bash
# Ingestion service logs message timestamp
# Staging backend logs message received timestamp
# Calculate diff:

docker logs onchain-bot-ingestion | grep "message:ingested" | tail -1
docker logs onchain-bot-staging-backend | grep "Received message" | tail -1

# Manual diff should be <500ms (Requirement 8.1)
```

**Check resource usage:**
```bash
# Staging backend should use LESS memory (no MTProto client)
docker stats onchain-bot-staging-backend --no-stream

# Before migration: ~800MB
# After migration: ~600MB (expect ~25% reduction)
```

### 2.6 Phase 2 Rollback

**If issues arise (<5 minutes to restore):**

```bash
# Option 1: Environment variable rollback (fastest)
cd /opt/onchain-bot-staging/apps/backend
sed -i 's/INGESTION_MODE=remote/INGESTION_MODE=local/' .env.staging
docker compose -f docker-compose.staging.yml restart backend

# Wait 60s for reconnection
sleep 60

# Verify staging backend healthy
curl http://localhost:3031/api/health

# Option 2: Full revert via GitHub Actions
git revert HEAD
git push origin dev
gh workflow run deploy-staging.yml
```

**Phase 2 Success Criteria:**
- ✅ Staging backend connects to ingestion service via SSE
- ✅ Ingestion service shows 1 connected client
- ✅ Messages processed identically to production
- ✅ Message latency <500ms (p95)
- ✅ Zero message loss compared to baseline
- ✅ Staging backend memory usage reduced by ~25%
- ✅ Zero errors in staging backend logs
- ✅ Rollback time <5 minutes (tested)

---

## Phase 3: Side-by-Side Validation (48 hours)

**Objective:** Run staging in SSE mode alongside production (MTProto) for 48 hours to validate stability and functional parity.

**Duration:** 48 hours  
**Validation Criteria:** Zero divergence in message processing, connection stable for 48h

### 3.1 Monitoring Setup

**Create validation dashboard queries:**

```bash
# Script to compare staging vs production message counts
cat > /opt/onchain-bot/scripts/validate-ingestion-parity.sh << 'EOF'
#!/bin/bash
set -euo pipefail

echo "=== Ingestion Parity Check ==="
date

# Staging (SSE mode) recent calls
STAGING_COUNT=$(curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=100 | jq '[.calls[]] | length')
echo "Staging recent calls: $STAGING_COUNT"

# Production (MTProto mode) recent calls
PROD_COUNT=$(curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=100 | jq '[.calls[]] | length')
echo "Production recent calls: $PROD_COUNT"

# Difference should be ≤1 (timing variance)
DIFF=$((PROD_COUNT - STAGING_COUNT))
DIFF_ABS=${DIFF#-}

if [ "$DIFF_ABS" -le 1 ]; then
  echo "✅ PASS: Difference within tolerance ($DIFF)"
else
  echo "❌ FAIL: Significant divergence ($DIFF)"
  exit 1
fi

# Check SSE connection stability
INGESTION_CLIENTS=$(curl -s http://localhost:3031/api/health | jq '.clients.connected')
if [ "$INGESTION_CLIENTS" -eq 1 ]; then
  echo "✅ PASS: SSE connection stable"
else
  echo "❌ FAIL: SSE connection lost (clients: $INGESTION_CLIENTS)"
  exit 1
fi

# Check FLOOD_WAIT status
FLOOD_COUNT=$(curl -s http://localhost:3031/api/health | jq '.floodWait.count24h')
if [ "$FLOOD_COUNT" -lt 5 ]; then
  echo "✅ PASS: FLOOD_WAIT count acceptable ($FLOOD_COUNT/24h)"
else
  echo "⚠️  WARNING: Elevated FLOOD_WAIT count ($FLOOD_COUNT/24h)"
fi
EOF

chmod +x /opt/onchain-bot/scripts/validate-ingestion-parity.sh

# Run every 6 hours via cron
crontab -l | { cat; echo "0 */6 * * * /opt/onchain-bot/scripts/validate-ingestion-parity.sh >> /var/log/ingestion-parity.log 2>&1"; } | crontab -
```

### 3.2 Daily Validation Checklist

**Run every 24 hours for 2 days:**

**Day 1 - Hour 0 (migration complete):**
```bash
# 1. Verify SSE connection uptime
curl -s http://localhost:3031/api/health | jq '.uptime / 3600 / 1000'
# Expected: ~0 hours

# 2. Run parity check
/opt/onchain-bot/scripts/validate-ingestion-parity.sh

# 3. Check staging backend uptime
docker inspect onchain-bot-staging-backend | jq '.[0].State.StartedAt'

# 4. Baseline message counts
curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id' > /tmp/day1-hour0-baseline.txt
```

**Day 1 - Hour 6:**
```bash
# 1. Verify SSE connection still active
curl -s http://localhost:3031/api/health | jq '.clients.connected'
# Expected: 1

# 2. Run parity check
/opt/onchain-bot/scripts/validate-ingestion-parity.sh

# 3. Check for errors in staging logs
docker logs onchain-bot-staging-backend --since 6h | grep -i "error\|fatal\|exception" | wc -l
# Expected: 0
```

**Day 1 - Hour 12:**
```bash
# Repeat Day 1 - Hour 6 checks
/opt/onchain-bot/scripts/validate-ingestion-parity.sh
```

**Day 1 - Hour 18:**
```bash
# Repeat Day 1 - Hour 6 checks
/opt/onchain-bot/scripts/validate-ingestion-parity.sh
```

**Day 1 - Hour 24:**
```bash
# 1. Verify 24h SSE connection stability (Requirement 8.4)
curl -s http://localhost:3031/api/health | jq '.uptime / 3600 / 1000'
# Expected: ~24 hours

# 2. Calculate message processing divergence
DAY1_START=$(cat /tmp/day1-hour0-baseline.txt)
DAY1_END=$(curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id')
STAGING_24H_COUNT=$((DAY1_END - DAY1_START))

# Compare with production
PROD_24H_COUNT=$(curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id' - $DAY1_START)

echo "Staging 24h messages: $STAGING_24H_COUNT"
echo "Production 24h messages: $PROD_24H_COUNT"
# Difference should be ≤2

# 3. Check FLOOD_WAIT totals (Requirement 11.2)
curl -s http://localhost:3031/api/health | jq '.floodWait.count24h'
# Expected: <10 (per Requirement 11.2)

# 4. Resource usage trends
docker stats onchain-bot-staging-backend --no-stream
docker stats onchain-bot-ingestion --no-stream
# Memory should be stable (no leaks)
```

**Day 2 - Hour 24 (48h complete):**
```bash
# 1. Final SSE connection stability check
curl -s http://localhost:3031/api/health | jq '.uptime / 3600 / 1000'
# Expected: ~48 hours (Requirement 8.4 validation)

# 2. Final parity check
/opt/onchain-bot/scripts/validate-ingestion-parity.sh

# 3. Generate validation report
cat > /tmp/phase3-validation-report.txt << EOF
=== Phase 3: 48-Hour Validation Report ===
Date: $(date)

SSE Connection Uptime: $(curl -s http://localhost:3031/api/health | jq '.uptime / 3600 / 1000') hours
Connected Clients: $(curl -s http://localhost:3031/api/health | jq '.clients.connected')
FLOOD_WAIT Count (48h): $(curl -s http://localhost:3031/api/health | jq '.floodWait.count24h')

Staging Messages (48h): $STAGING_24H_COUNT
Production Messages (48h): $PROD_24H_COUNT
Divergence: $((STAGING_24H_COUNT - PROD_24H_COUNT))

Staging Backend Uptime: $(docker inspect onchain-bot-staging-backend | jq -r '.[0].State.StartedAt')
Ingestion Service Uptime: $(docker inspect onchain-bot-ingestion | jq -r '.[0].State.StartedAt')

Parity Check Results:
$(tail -20 /var/log/ingestion-parity.log)

Conclusion: [PASS/FAIL]
EOF

cat /tmp/phase3-validation-report.txt
```

### 3.3 Incident Response During Validation

**If SSE connection drops:**
```bash
# 1. Check ingestion service status
docker ps | grep onchain-bot-ingestion

# 2. If service is down, restart
docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml up -d

# 3. Verify staging backend reconnects automatically
docker logs -f onchain-bot-staging-backend | grep "SSE"
# Expected: "SSE connection failed, reconnecting in Xms"
# Then: "SSE connection established"

# 4. If reconnection fails after 5 minutes, roll back staging
cd /opt/onchain-bot-staging/apps/backend
sed -i 's/INGESTION_MODE=remote/INGESTION_MODE=local/' .env.staging
docker compose -f docker-compose.staging.yml restart backend
```

**If message divergence exceeds threshold:**
```bash
# 1. Investigate staging backend logs
docker logs onchain-bot-staging-backend --tail 200 | grep -i "error\|skip\|duplicate"

# 2. Check ingestion service broadcast logs
docker logs onchain-bot-ingestion --tail 200 | grep -i "broadcast"

# 3. If critical divergence (>10 messages in 1h), roll back
# See Phase 2 Rollback section
```

### 3.4 Phase 3 Success Criteria

- ✅ SSE connection stable for 48 hours (Requirement 8.4)
- ✅ Staging message count within ±2 of production over 48h
- ✅ Zero staging backend restarts due to SSE issues
- ✅ FLOOD_WAIT count <10 per 24h (Requirement 11.2)
- ✅ Memory usage stable (no leaks)
- ✅ Zero functional regressions reported by users
- ✅ Rollback procedure tested and validated (<5min)

**If any criteria fail, DO NOT proceed to Phase 4. Investigate and resolve issues.**

---

## Phase 4: Migrate Production Backend to SSE

**Objective:** Switch production backend from MTProto to SSE, achieving centralized ingestion architecture.

**Duration:** 1-2 hours (plus 24h monitoring)  
**Risk Level:** HIGH (production impact)  
**Validation Criteria:** Zero message loss, <500ms latency, immediate rollback capability

### 4.1 Pre-Migration Final Checks

**Confirm Phase 3 success:**
```bash
# Review Phase 3 validation report
cat /tmp/phase3-validation-report.txt

# Must show:
# - 48h SSE uptime
# - Message divergence ≤2
# - Zero critical errors

# If any criteria failed, STOP and resolve before proceeding
```

**Production readiness checklist:**
```bash
# 1. Verify ingestion service health
curl -s http://localhost:3031/api/health | jq '.'
# Must show: status="ok", mtproto.connected=true, clients.connected=1

# 2. Verify production backend health (pre-migration)
curl -s http://localhost:3030/api/health | jq '.'
# Must show: status="ok"

# 3. Check disk space
df -h / | grep "/$"
# Must show: <75% usage

# 4. Verify database backup exists
ls -lh /opt/onchain-bot/backups/*.sql | tail -1
# Must show: backup from <24h ago

# 5. Alert stakeholders
echo "Production migration starting at $(date). Monitoring for 1h."
```

### 4.2 Enable Production SSE Mode

**Update production backend environment:**

```bash
# SSH to CryptoGanster
ssh CryptoGanster

# Backup current production .env
cd /opt/onchain-bot/apps/backend
cp .env.production .env.production.backup-$(date +%Y%m%d-%H%M%S)

# Add SSE configuration
cat >> .env.production << 'EOF'

# Centralized Ingestion Service (Phase 4 migration)
INGESTION_MODE=remote
INGESTION_REMOTE_URL=http://cryptoganster:3031
EOF

# Verify changes
tail -5 .env.production
```

### 4.3 Execute Production Migration

**Restart production backend (60s downtime expected):**

```bash
# Terminal 1: Monitor ingestion service
docker logs -f onchain-bot-ingestion

# Terminal 2: Restart production backend
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.prod.yml restart backend

# Expected sequence:
# 1. Backend stops (MTProto client disconnects)
# 2. Backend starts (~30s)
# 3. SSE client connects to ingestion service (~5s)
# 4. Message flow resumes (<60s total downtime)

# Terminal 3: Monitor reconnection
for i in {1..60}; do
  if curl -sf http://localhost:3030/api/health > /dev/null 2>&1; then
    echo "✓ Backend healthy at ${i}s"
    break
  fi
  echo "Waiting... ${i}s"
  sleep 1
done
```

### 4.4 Validate Production Migration

**Immediate checks (0-5 minutes):**

```bash
# 1. Verify production backend connected via SSE
curl -s http://localhost:3031/api/health | jq '.clients.connected'
# Expected: 2 (staging + production)

# 2. Check production backend logs
docker logs onchain-bot-backend --tail 50 | grep -i "SSE"
# Expected: "Using SSE ingestion client (remote mode)"
# Expected: "SSE connection established"

# 3. Verify message flow
docker logs -f onchain-bot-backend | grep "Received message from SSE"
# Should see messages within 2 minutes

# 4. Test health endpoint
curl -s http://localhost:3030/api/health | jq '.status'
# Expected: "ok"
```

**Extended validation (5-30 minutes):**

```bash
# 1. Monitor recent calls API
watch -n 10 'curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=5 | jq "[.calls[] | {id, ticker, occurredAt}]"'
# New calls should appear every ~2-5 minutes

# 2. Check for errors
docker logs onchain-bot-backend --since 30m | grep -i "error\|fatal\|exception"
# Expected: No critical errors

# 3. Verify media serving
RECENT_CALL=$(curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1)
# If call has media, test URL:
# curl -I <media_url>
# Expected: HTTP 200 OK

# 4. Dashboard validation
# Open dashboard in browser: http://cryptoganster:3030
# Verify:
# - Recent calls appearing
# - Real-time updates working
# - No errors in console
```

### 4.5 24-Hour Production Monitoring

**Hour 0 (migration complete):**
```bash
# Record baseline
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id' > /tmp/prod-hour0-baseline.txt

# Capture metrics
curl -s http://localhost:3031/api/health | jq '.' > /tmp/prod-hour0-health.json
```

**Hour 1:**
```bash
# Verify SSE connection stable
curl -s http://localhost:3031/api/health | jq '.clients.connected'
# Expected: 2

# Check for reconnection attempts
docker logs onchain-bot-backend --since 1h | grep -i "reconnect" | wc -l
# Expected: 0

# Verify message processing
HOUR1_ID=$(curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id')
HOUR0_ID=$(cat /tmp/prod-hour0-baseline.txt)
echo "Messages in 1h: $((HOUR1_ID - HOUR0_ID))"
# Expected: 5-20 (depends on channel activity)
```

**Hour 6, 12, 18, 24:**
```bash
# Run full validation script
/opt/onchain-bot/scripts/validate-production-ingestion.sh

# Check FLOOD_WAIT status
curl -s http://localhost:3031/api/health | jq '.floodWait'
# count24h should be <10

# Resource usage
docker stats onchain-bot-backend onchain-bot-ingestion --no-stream
```

### 4.6 Phase 4 Rollback (If Needed)

**CRITICAL: Rollback window is <5 minutes to prevent message loss.**

**Immediate rollback steps:**

```bash
# 1. Restore local MTProto mode
cd /opt/onchain-bot/apps/backend
sed -i 's/INGESTION_MODE=remote/INGESTION_MODE=local/' .env.production

# 2. Restart backend (forces MTProto reconnection)
docker compose -f docker-compose.prod.yml restart backend

# 3. Wait 60s for MTProto connection
sleep 60

# 4. Verify production healthy
curl http://localhost:3030/api/health
# Expected: status="ok", mtproto.connected=true

# 5. Monitor message flow
docker logs -f onchain-bot-backend | grep "MTProto"
# Expected: "Using MTProto ingestion client (local mode)"
# Expected: "MTProto connection established"

# 6. Verify recent calls incrementing
watch -n 5 'curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1 | jq ".calls[0].id"'
# IDs should increment within 5 minutes
```

**Post-rollback investigation:**

```bash
# 1. Collect logs
docker logs onchain-bot-backend --since 30m > /tmp/rollback-backend.log
docker logs onchain-bot-ingestion --since 30m > /tmp/rollback-ingestion.log

# 2. Analyze failure mode
# - SSE connection issues?
# - Message loss?
# - Latency problems?
# - FLOOD_WAIT violations?

# 3. File incident report
cat > /tmp/phase4-rollback-report.txt << EOF
=== Phase 4 Rollback Report ===
Date: $(date)
Rollback Time: <5min (target met: YES/NO)
Failure Mode: <SSE/Message Loss/Latency/Other>
Message Loss: <count or "none">
Logs: /tmp/rollback-*.log
Next Steps: <investigation plan>
EOF
```

### 4.7 Phase 4 Success Criteria

- ✅ Production backend connected via SSE within 60s
- ✅ Message flow resumed within 60s
- ✅ Zero message loss (compare baseline before/after)
- ✅ Message latency <500ms (p95)
- ✅ SSE connection stable for 24 hours
- ✅ Zero critical errors in production logs
- ✅ Dashboard fully functional
- ✅ FLOOD_WAIT count <10 per 24h
- ✅ Rollback capability verified (<5min)

---

## Phase 5: Rollback Procedure (<5 Minute Recovery)

**Objective:** Document the fast-rollback procedure to restore MTProto mode in any backend environment within 5 minutes.

**Use Cases:**
- Phase 2/3/4 migration failures
- SSE connection instability
- Message loss detected
- Performance degradation
- Emergency production issues

### 5.1 Quick Rollback (Any Environment)

**Generic rollback script:**

```bash
#!/bin/bash
# rollback-to-mtproto.sh
# Usage: ./rollback-to-mtproto.sh [staging|production]

set -euo pipefail

ENV=${1:-production}

if [ "$ENV" = "staging" ]; then
  ENV_FILE="/opt/onchain-bot-staging/apps/backend/.env.staging"
  COMPOSE_FILE="/opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml"
  SERVICE_NAME="backend"
  HEALTH_PORT="3031"
elif [ "$ENV" = "production" ]; then
  ENV_FILE="/opt/onchain-bot/apps/backend/.env.production"
  COMPOSE_FILE="/opt/onchain-bot/apps/backend/docker-compose.prod.yml"
  SERVICE_NAME="backend"
  HEALTH_PORT="3030"
else
  echo "❌ Invalid environment: $ENV"
  exit 1
fi

echo "=== Rolling back $ENV to MTProto mode ==="
date

# Step 1: Switch to local mode (10s)
echo "Step 1/5: Updating INGESTION_MODE to local..."
sed -i 's/INGESTION_MODE=remote/INGESTION_MODE=local/' "$ENV_FILE"
grep "INGESTION_MODE" "$ENV_FILE"

# Step 2: Restart backend (60s)
echo "Step 2/5: Restarting $SERVICE_NAME..."
docker compose -f "$COMPOSE_FILE" restart "$SERVICE_NAME"

# Step 3: Wait for startup (60s)
echo "Step 3/5: Waiting for $SERVICE_NAME to start..."
sleep 60

# Step 4: Health check (10s)
echo "Step 4/5: Checking health..."
for i in {1..10}; do
  if curl -sf http://localhost:$HEALTH_PORT/api/health > /dev/null 2>&1; then
    echo "✓ $SERVICE_NAME healthy at ${i}s"
    break
  fi
  echo "  Waiting... ${i}s"
  sleep 1
  if [ "$i" -eq 10 ]; then
    echo "❌ Health check failed after 10s"
    docker logs "onchain-bot-$ENV-$SERVICE_NAME" --tail 50
    exit 1
  fi
done

# Step 5: Verify MTProto mode (5s)
echo "Step 5/5: Verifying MTProto connection..."
docker logs "onchain-bot-$ENV-$SERVICE_NAME" --tail 20 | grep -i "mtproto"
if docker logs "onchain-bot-$ENV-$SERVICE_NAME" --tail 20 | grep -qi "Using MTProto ingestion client"; then
  echo "✓ MTProto mode confirmed"
else
  echo "⚠️  Warning: Could not confirm MTProto mode from logs"
fi

echo "=== Rollback complete ==="
echo "Total time: ~120s"
echo "Verify message flow: docker logs -f onchain-bot-$ENV-$SERVICE_NAME | grep 'message'"
```

**Execute rollback:**

```bash
# For staging
bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh staging

# For production (CRITICAL)
bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh production
```

### 5.2 Rollback Verification

**Post-rollback checks:**

```bash
# 1. Verify MTProto mode active
docker logs onchain-bot-backend --tail 50 | grep "ingestion"
# Expected: "Using MTProto ingestion client (local mode)"

# 2. Check connection status
curl -s http://localhost:3030/api/health | jq '{status: .status, mtproto: .mtproto.connected}'
# Expected: {status: "ok", mtproto: true}

# 3. Verify message flow
docker logs -f onchain-bot-backend | grep "message"
# Should see new messages within 2 minutes

# 4. Check recent calls incrementing
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=1 | jq '.calls[0].id'
# Wait 5 minutes and repeat - ID should increment
```

### 5.3 Rollback Time Validation

**Test rollback timing in non-production:**

```bash
# Measure staging rollback time
time bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh staging

# Expected output:
# real    1m50s  (TARGET: <5min ✅)
# user    0m0.1s
# sys     0m0.05s
```

### 5.4 Emergency Rollback (All Environments)

**If ingestion service becomes unavailable and all backends need rollback:**

```bash
# 1. Stop ingestion service (prevent connection attempts)
docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml down

# 2. Rollback production (priority)
bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh production

# 3. Rollback staging
bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh staging

# 4. Verify all environments healthy
curl http://localhost:3030/api/health  # Production
curl http://localhost:3031/api/health  # Staging

# 5. Alert team
echo "EMERGENCY ROLLBACK COMPLETE. All environments back to MTProto mode."
```

### 5.5 Phase 5 Success Criteria

- ✅ Rollback script created and tested
- ✅ Rollback time <5 minutes (measured on staging)
- ✅ Rollback preserves zero message loss
- ✅ MTProto mode restores within 2 minutes after restart
- ✅ Emergency rollback procedure documented
- ✅ All team members trained on rollback process

---

## Health Check Commands

**Quick Reference:**

```bash
# Ingestion Service Health
curl -s http://localhost:3031/api/health | jq '.'

# Production Backend Health
curl -s http://localhost:3030/api/health | jq '.'

# Staging Backend Health
curl -s http://localhost:3031/api/health | jq '.'

# SSE Connection Count
curl -s http://localhost:3031/api/health | jq '.clients.connected'
# Expected:
# - Phase 1: 0
# - Phase 2-3: 1 (staging)
# - Phase 4+: 2 (staging + production)

# MTProto Status
curl -s http://localhost:3031/api/health | jq '.mtproto'
# Expected: {connected: true, authorized: true, lastPollAt: "<recent>"}

# FLOOD_WAIT Monitoring
curl -s http://localhost:3031/api/health | jq '.floodWait'
# count24h should be <10

# Channel Status
curl -s http://localhost:3031/api/channels | jq 'length'
# Expected: 15 (10 KOL + 5 news)
```

---

## Log Inspection Commands

**Ingestion Service:**

```bash
# Real-time logs
docker logs -f onchain-bot-ingestion

# Last 100 lines
docker logs onchain-bot-ingestion --tail 100

# Errors only
docker logs onchain-bot-ingestion | grep -i "error\|fatal\|exception"

# Message broadcast events
docker logs onchain-bot-ingestion | grep "message:ingested"

# SSE client connections
docker logs onchain-bot-ingestion | grep "SSE client"

# FLOOD_WAIT events
docker logs onchain-bot-ingestion | grep -i "flood"

# MTProto connection events
docker logs onchain-bot-ingestion | grep -i "mtproto\|telegram"
```

**Backend (Production):**

```bash
# Real-time logs
docker logs -f onchain-bot-backend

# SSE connection logs
docker logs onchain-bot-backend | grep -i "SSE"

# Message processing
docker logs onchain-bot-backend | grep "Received message"

# Recent errors
docker logs onchain-bot-backend --since 1h | grep -i "error"

# Ingestion mode confirmation
docker logs onchain-bot-backend | grep "ingestion client"
```

**Backend (Staging):**

```bash
# Real-time logs
docker logs -f onchain-bot-staging-backend

# SSE connection logs
docker logs onchain-bot-staging-backend | grep -i "SSE"

# Message processing
docker logs onchain-bot-staging-backend | grep "Received message"
```

---

## Metric Query Examples

**Message Processing Rate:**

```bash
# Messages ingested in last hour
docker logs onchain-bot-ingestion --since 1h | grep "message:ingested" | wc -l

# Messages processed by production in last hour
docker logs onchain-bot-backend --since 1h | grep "Received message" | wc -l

# Expected: Similar counts (within ±1)
```

**SSE Connection Uptime:**

```bash
# Ingestion service uptime
curl -s http://localhost:3031/api/health | jq '.uptime / 3600 / 1000'
# Result in hours

# Backend SSE connection uptime (from logs)
docker logs onchain-bot-backend | grep "SSE connection established" | tail -1
# Compare timestamp with current time
```

**Latency Measurement:**

```bash
# Broadcast timestamp from ingestion service
INGESTION_TS=$(docker logs onchain-bot-ingestion --tail 1 | grep "message:ingested" | grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z')

# Received timestamp from backend
BACKEND_TS=$(docker logs onchain-bot-backend --tail 1 | grep "Received message" | grep -oP '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z')

# Manual diff (milliseconds)
echo "Latency: $(date -d "$BACKEND_TS" +%s%3N) - $(date -d "$INGESTION_TS" +%s%3N) ms"
# Target: <500ms
```

**Resource Usage:**

```bash
# Docker stats (real-time)
docker stats onchain-bot-ingestion onchain-bot-backend onchain-bot-staging-backend

# Memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | grep "onchain-bot"

# Disk usage (uploads directory)
du -sh /opt/onchain-bot/uploads/crypto-news/media/
```

**FLOOD_WAIT Analysis:**

```bash
# Total FLOOD_WAIT events in last 24h
docker logs onchain-bot-ingestion --since 24h | grep -i "FLOOD_WAIT" | wc -l

# Max wait duration in last 24h
docker logs onchain-bot-ingestion --since 24h | grep -i "FLOOD_WAIT" | grep -oP 'wait \d+s' | sort -rn | head -1

# Recent FLOOD_WAIT pattern
docker logs onchain-bot-ingestion --since 24h | grep -i "FLOOD_WAIT" | tail -10
```

---

## Troubleshooting Guide

### Problem: SSE Connection Fails on Backend

**Symptoms:**
```bash
docker logs onchain-bot-backend | grep "SSE"
# Output: "SSE connection failed: 503"
```

**Resolution:**
1. Check ingestion service status:
   ```bash
   curl http://localhost:3031/api/health
   ```
2. If ingestion service is down:
   ```bash
   docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml up -d
   ```
3. If ingestion service is healthy but backend can't connect:
   ```bash
   # Check network connectivity
   docker exec onchain-bot-backend ping -c 3 cryptoganster
   
   # If ping fails, check Docker network
   docker network inspect onchain-bot-net
   ```
4. If network is broken, recreate containers:
   ```bash
   docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml down
   docker compose -f /opt/onchain-bot/apps/backend/docker-compose.prod.yml up -d
   ```

### Problem: Message Loss Detected

**Symptoms:**
```bash
# Production shows fewer messages than staging
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=100 | jq 'length'
# Output: 85

curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=100 | jq 'length'
# Output: 100
```

**Resolution:**
1. Check if SSE connection dropped:
   ```bash
   docker logs onchain-bot-backend --since 1h | grep -i "reconnect"
   ```
2. If reconnection occurred, messages during disconnection are lost (expected per Requirement 3.3)
3. If no reconnection occurred, check backend processing logs:
   ```bash
   docker logs onchain-bot-backend --since 1h | grep -i "error\|skip"
   ```
4. If critical message loss (>10 messages), roll back:
   ```bash
   bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh production
   ```

### Problem: High FLOOD_WAIT Errors

**Symptoms:**
```bash
curl -s http://localhost:3031/api/health | jq '.floodWait.count24h'
# Output: 15 (exceeds threshold of 10)
```

**Resolution:**
1. Check if sleep window is configured:
   ```bash
   grep "SLEEP_WINDOW" /opt/onchain-bot/apps/ingestion-service/.env.ingestion
   ```
2. If not, add sleep window:
   ```bash
   cat >> /opt/onchain-bot/apps/ingestion-service/.env.ingestion << 'EOF'
   INGESTION_SLEEP_WINDOW_START_UTC=04
   INGESTION_SLEEP_WINDOW_END_UTC=08
   EOF
   
   docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml restart
   ```
3. If FLOOD_WAIT persists, increase poll interval:
   ```bash
   # Change from 90s to 120s
   sed -i 's/POLL_INTERVAL_BASE_MS=90000/POLL_INTERVAL_BASE_MS=120000/' /opt/onchain-bot/apps/ingestion-service/.env.ingestion
   
   docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml restart
   ```

### Problem: MTProto Unauthorized After Migration

**Symptoms:**
```bash
curl -s http://localhost:3031/api/health | jq '.mtproto'
# Output: {connected: false, authorized: false}
```

**Resolution:**
1. Verify session string is valid:
   ```bash
   grep "MTPROTO_SESSION" /opt/onchain-bot/apps/ingestion-service/.env.ingestion
   ```
2. If session is missing or corrupted, regenerate:
   ```bash
   # On local machine with Node.js
   cd apps/backend
   npm run telegram:gen-session
   
   # Copy output session string to production
   ssh CryptoGanster
   nano /opt/onchain-bot/apps/ingestion-service/.env.ingestion
   # Paste new session string
   
   # Restart ingestion service
   docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml restart
   ```

### Problem: Media Files Not Accessible

**Symptoms:**
```bash
curl -I http://localhost:3031/api/media/-1001234567890/12345/0
# Output: HTTP 404 Not Found
```

**Resolution:**
1. Check if media file exists:
   ```bash
   find /opt/onchain-bot/uploads/crypto-news/media/ -name "12345-0.*"
   ```
2. If file doesn't exist, check download logs:
   ```bash
   docker logs onchain-bot-ingestion | grep "12345"
   ```
3. If download failed, check media downloader:
   ```bash
   docker logs onchain-bot-ingestion | grep -i "media\|download"
   ```
4. If directory permissions issue:
   ```bash
   sudo chown -R runner:runner /opt/onchain-bot/uploads/
   docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml restart
   ```

---

## Post-Migration Cleanup

**After Phase 4 success (7 days stable operation):**

```bash
# 1. Remove MTProto session from backend .env files
sed -i '/TELEGRAM_API_ID/d' /opt/onchain-bot/apps/backend/.env.production
sed -i '/TELEGRAM_API_HASH/d' /opt/onchain-bot/apps/backend/.env.production
sed -i '/TELEGRAM_MTPROTO_SESSION/d' /opt/onchain-bot/apps/backend/.env.production

sed -i '/TELEGRAM_API_ID/d' /opt/onchain-bot-staging/apps/backend/.env.staging
sed -i '/TELEGRAM_API_HASH/d' /opt/onchain-bot-staging/apps/backend/.env.staging
sed -i '/TELEGRAM_MTPROTO_SESSION/d' /opt/onchain-bot-staging/apps/backend/.env.staging

# 2. Remove MTProto client code from backend (optional)
# Keep code for rollback capability, but remove from build if confident

# 3. Update monitoring dashboards
# Add ingestion service health checks
# Remove per-backend MTProto metrics

# 4. Archive migration logs
mkdir -p /opt/onchain-bot/backups/migration-logs
cp /var/log/ingestion-*.log /opt/onchain-bot/backups/migration-logs/
cp /tmp/phase*.txt /opt/onchain-bot/backups/migration-logs/

# 5. Document lessons learned
cat > /opt/onchain-bot/backups/migration-logs/lessons-learned.md << 'EOF'
# Centralized Ingestion Migration - Lessons Learned

Date: $(date)

## What Went Well
- <list successes>

## Challenges Encountered
- <list challenges>

## Recommendations for Future Migrations
- <list recommendations>
EOF
```

---

## Appendix: Emergency Contacts

**Escalation Path:**

1. **Level 1:** Self-service rollback (<5min)
   - Use rollback script: `bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh production`

2. **Level 2:** Team lead review (5-30min)
   - Review logs: `/tmp/rollback-*.log`
   - Assess root cause
   - Decide on re-migration timeline

3. **Level 3:** Stakeholder notification (30min+)
   - Alert product owner
   - Update status page
   - Schedule post-mortem

**On-Call Runbook Quick Links:**
- Health Check: `curl http://localhost:3031/api/health | jq .`
- Rollback: `bash /opt/onchain-bot/scripts/rollback-to-mtproto.sh production`
- Logs: `docker logs onchain-bot-backend --tail 100`
- Emergency Stop: `docker compose -f /opt/onchain-bot/apps/ingestion-service/docker-compose.yml down`

---

## Appendix: Configuration Reference

**Complete `.env.ingestion` Template:**

```bash
# ─────────────────────────────────────────────────────────────
# MTProto Configuration
# ─────────────────────────────────────────────────────────────
INGESTION_TELEGRAM_API_ID=<from backend TELEGRAM_API_ID>
INGESTION_TELEGRAM_API_HASH=<from backend TELEGRAM_API_HASH>
INGESTION_TELEGRAM_MTPROTO_SESSION=<from backend TELEGRAM_MTPROTO_SESSION>

# ─────────────────────────────────────────────────────────────
# Server Configuration
# ─────────────────────────────────────────────────────────────
INGESTION_PORT=3031
INGESTION_API_BASE_URL=http://cryptoganster:3031

# ─────────────────────────────────────────────────────────────
# Redis Configuration
# ─────────────────────────────────────────────────────────────
INGESTION_REDIS_HOST=redis
INGESTION_REDIS_PORT=6379
INGESTION_REDIS_PASSWORD=<from backend REDIS_PASSWORD>

# ─────────────────────────────────────────────────────────────
# Storage Configuration
# ─────────────────────────────────────────────────────────────
INGESTION_UPLOADS_ROOT=/opt/onchain-bot/uploads
INGESTION_MEDIA_RETENTION_DAYS=30

# ─────────────────────────────────────────────────────────────
# Anti-Ban Protection Configuration
# ─────────────────────────────────────────────────────────────
INGESTION_MAX_CHANNELS=50
INGESTION_POLL_INTERVAL_BASE_MS=90000
INGESTION_JITTER_PERCENT=30
INGESTION_SLEEP_WINDOW_START_UTC=04
INGESTION_SLEEP_WINDOW_END_UTC=08
INGESTION_FLOOD_WAIT_INITIAL_BACKOFF_MS=5000
INGESTION_FLOOD_WAIT_MULTIPLIER=2
INGESTION_FLOOD_WAIT_MAX_BACKOFF_MS=3600000
INGESTION_FLOOD_WAIT_MAX_ATTEMPTS=5

# ─────────────────────────────────────────────────────────────
# Logging Configuration
# ─────────────────────────────────────────────────────────────
INGESTION_LOG_LEVEL=info
INGESTION_LOG_FORMAT=json
```

**Backend `.env` Additions:**

```bash
# Centralized Ingestion Service Configuration
INGESTION_MODE=local  # or "remote" after Phase 2+ migration
INGESTION_REMOTE_URL=http://cryptoganster:3031
```

---

## Appendix: Validation Scripts

**`/opt/onchain-bot/scripts/validate-ingestion-parity.sh`:**

```bash
#!/bin/bash
# Validates staging/production message parity during migration
set -euo pipefail

echo "=== Ingestion Parity Check ==="
date

# Staging (SSE mode) recent calls
STAGING_COUNT=$(curl -s http://localhost:3031/api/vip-calls/calls/recent?limit=100 | jq '[.calls[]] | length')
echo "Staging recent calls: $STAGING_COUNT"

# Production (MTProto or SSE mode) recent calls
PROD_COUNT=$(curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=100 | jq '[.calls[]] | length')
echo "Production recent calls: $PROD_COUNT"

# Difference should be ≤1 (timing variance)
DIFF=$((PROD_COUNT - STAGING_COUNT))
DIFF_ABS=${DIFF#-}

if [ "$DIFF_ABS" -le 1 ]; then
  echo "✅ PASS: Difference within tolerance ($DIFF)"
else
  echo "❌ FAIL: Significant divergence ($DIFF)"
  exit 1
fi

# Check SSE connection stability
INGESTION_CLIENTS=$(curl -s http://localhost:3031/api/health | jq '.clients.connected')
if [ "$INGESTION_CLIENTS" -ge 1 ]; then
  echo "✅ PASS: SSE connection stable (clients: $INGESTION_CLIENTS)"
else
  echo "❌ FAIL: SSE connection lost (clients: $INGESTION_CLIENTS)"
  exit 1
fi

# Check FLOOD_WAIT status
FLOOD_COUNT=$(curl -s http://localhost:3031/api/health | jq '.floodWait.count24h')
if [ "$FLOOD_COUNT" -lt 5 ]; then
  echo "✅ PASS: FLOOD_WAIT count acceptable ($FLOOD_COUNT/24h)"
else
  echo "⚠️  WARNING: Elevated FLOOD_WAIT count ($FLOOD_COUNT/24h)"
fi

echo "=== Parity check complete ==="
```

**`/opt/onchain-bot/scripts/rollback-to-mtproto.sh`:**

(See Phase 5.1 for complete script)

---

## Revision History

| Version | Date       | Author | Changes                                    |
|---------|------------|--------|--------------------------------------------|
| 1.0     | 2026-08-30 | System | Initial deployment runbook                 |

---

**End of Deployment Runbook**
