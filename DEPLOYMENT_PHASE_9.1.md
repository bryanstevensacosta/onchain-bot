# Phase 9.1 Deployment: Ingestion Service Standalone

**Status:** Ready for execution  
**Date:** 2026-08-30  
**Responsible:** DevOps  
**Droplet:** CryptoGanster (144.126.203.139)

## Pre-Deployment Checklist

- [x] Session validation script created (`scripts/validate-session-migration.sh`)
- [x] Monitoring playbook documented (`docs/monitoring/ingestion-service-playbook.md`)
- [x] Deployment runbook documented (`docs/deployment/ingestion-service-runbook.md`)
- [x] Dockerfile configured with `--ignore-scripts` (PR #96)
- [x] docker-compose.ingestion.yml exists
- [ ] `.env.production` file created on droplet with MTProto credentials
- [ ] Docker networks exist (`onchain-bot-net`, `onchain-bot-staging-net`)

## Deployment Steps

### Step 1: SSH to Droplet

```bash
ssh root@144.126.203.139
# Or use VS Code Remote SSH: CryptoGanster
```

### Step 2: Navigate to Project

```bash
cd /opt/onchain-bot
git pull origin master
```

### Step 3: Create .env.production for Ingestion Service

```bash
cd apps/ingestion-service

# Copy template and edit with production credentials
cp .env.production.template .env.production
nano .env.production

# Required variables (update with actual production values):
# - INGESTION_TELEGRAM_MTPROTO_API_ID (from production backend)
# - INGESTION_TELEGRAM_MTPROTO_API_HASH (from production backend)
# - INGESTION_TELEGRAM_MTPROTO_SESSION (from production backend)
# - INGESTION_REDIS_PASSWORD (if set)
# - INGESTION_DATABASE_PASSWORD (from production)
```

### Step 4: Verify Docker Networks Exist

```bash
docker network ls | grep onchain-bot
# Expected output:
# - onchain-bot-net (for production backend)
# - onchain-bot-staging-net (for staging backend)

# If missing, create them:
docker network create onchain-bot-net
docker network create onchain-bot-staging-net
```

### Step 5: Build and Deploy Ingestion Service

```bash
cd /opt/onchain-bot/apps/backend

# Build image (with --no-cache to ensure fresh build)
docker compose -f docker-compose.ingestion.yml build --no-cache

# Start service
docker compose -f docker-compose.ingestion.yml up -d

# Verify container is running
docker ps | grep ingestion
```

### Step 6: Verify Health Endpoint (HTTP 200)

```bash
# Wait 30s for service to start
sleep 30

# Check health endpoint (should return HTTP 200)
curl -s http://localhost:3032/api/health | jq

# Expected output:
# {
#   "status": "ok",
#   "mtproto": {
#     "connected": true,
#     "authorized": true,
#     "lastPollAt": "2026-08-30T..."
#   },
#   "channels": {
#     "total": 45,
#     "active": 45,
#     "kol": 45,
#     "news": 0
#   },
#   "clients": {
#     "connected": 0
#   },
#   "floodWait": {
#     "count24h": 0,
#     "maxSeconds24h": 0,
#     "consecutiveFailures": 0
#   },
#   "uptime": ...
# }
```

### Step 7: Verify MTProto Connection

```bash
# Check MTProto connection status
curl -s http://localhost:3032/api/health | jq '.mtproto.connected'
# Expected: true

curl -s http://localhost:3032/api/health | jq '.mtproto.authorized'
# Expected: true
```

### Step 8: Verify Channels Seeded

```bash
# Check channel count
curl -s http://localhost:3032/api/health | jq '.channels.total'
# Expected: 45 (from INGESTION_TELEGRAM_SEED_KOLS)

# List all channels
curl -s http://localhost:3032/api/channels | jq
```

### Step 9: Monitor Logs (24h)

```bash
# Follow logs in real-time
docker compose -f apps/backend/docker-compose.ingestion.yml logs -f ingestion-service

# Check for FLOOD_WAIT errors (should be zero)
docker compose -f apps/backend/docker-compose.ingestion.yml logs ingestion-service | grep FLOOD_WAIT

# Check for connection errors
docker compose -f apps/backend/docker-compose.ingestion.yml logs ingestion-service | grep -i "error\|disconnect"

# Check message ingestion rate
docker compose -f apps/backend/docker-compose.ingestion.yml logs ingestion-service | grep "message:received" | wc -l
```

## Success Criteria

- [ ] Health endpoint returns HTTP 200
- [ ] `mtproto.connected = true`
- [ ] `mtproto.authorized = true`
- [ ] `channels.total >= 45`
- [ ] Zero FLOOD_WAIT errors in first hour
- [ ] Messages being ingested (check logs)
- [ ] Zero disconnections in first hour

## Rollback Procedure

If any success criteria fails:

```bash
# Stop ingestion service
docker compose -f apps/backend/docker-compose.ingestion.yml down

# Check logs for errors
docker compose -f apps/backend/docker-compose.ingestion.yml logs ingestion-service --tail 100

# Fix issue and restart
docker compose -f apps/backend/docker-compose.ingestion.yml up -d
```

## Post-Deployment

After 24h monitoring:

1. Verify zero FLOOD_WAIT errors
2. Verify stable message ingestion rate
3. Verify zero unauthorized disconnections
4. Document any issues in monitoring playbook
5. Proceed to Phase 9.2 (Migrate staging backend to SSE)

## Notes

- Ingestion service listens on **port 3032 externally** (mapped from internal 3031)
- This is to avoid conflict with staging backend (which uses 3031)
- Service connects to BOTH networks: `onchain-bot-net` and `onchain-bot-staging-net`
- Media is shared with production backend via bind mount: `../backend/uploads`
- Configuration is read from `apps/ingestion-service/.env.production`

## Troubleshooting

See `docs/monitoring/ingestion-service-playbook.md` for:

- Alert conditions and responses
- Health check commands
- Log inspection patterns
- Common issues and solutions
