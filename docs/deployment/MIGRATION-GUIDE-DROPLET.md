# Ingestion Service - Migration Guide for Production Droplet

## Overview

This guide walks through migrating MTProto session credentials from backend to ingestion-service on the production droplet (CryptoGanster - 144.126.203.139).

⚠️ **CRITICAL**: This migration must be done carefully to avoid AUTH_KEY_DUPLICATED errors which can result in Telegram account suspension.

## Pre-Migration Checklist

- [ ] Backup current backend `.env` file
- [ ] Backup current database
- [ ] Confirm ingestion-service is built and ready to deploy
- [ ] Schedule migration during low-traffic window (recommended: 02:00-06:00 UTC)
- [ ] Have rollback plan ready

## Step-by-Step Migration

### Step 1: Connect to Production Droplet

```bash
ssh root@144.126.203.139
# or use VS Code Remote SSH: CryptoGanster
```

### Step 2: Navigate to Project Directory

```bash
cd /opt/onchain-bot
```

### Step 3: Backup Current Configuration

```bash
# Backup backend .env
cp apps/backend/.env apps/backend/.env.backup.$(date +%Y%m%d-%H%M%S)

# Backup database
npm run db:backup
```

### Step 4: Extract Current MTProto Credentials from Backend

```bash
# View current backend credentials (keep terminal visible for reference)
grep "TELEGRAM_MTPROTO" apps/backend/.env

# You should see something like:
# TELEGRAM_MTPROTO_API_ID=12345678
# TELEGRAM_MTPROTO_API_HASH=abcdef1234567890abcdef1234567890
# TELEGRAM_MTPROTO_SESSION=1AxYoUrSeS...longsessionstring...
```

**⚠️ IMPORTANT**: Keep these values visible - you'll need them in the next step.

### Step 5: Create Ingestion Service .env File

```bash
# Create .env file for ingestion-service
nano apps/ingestion-service/.env
```

Paste the following content, **replacing placeholders with actual values from Step 4**:

```bash
# =====================================================================
# Ingestion Service - Production Configuration
# =====================================================================

# ─────────────────────────────────────────────────────────────────────
# 1. TELEGRAM MTPROTO CREDENTIALS
# ─────────────────────────────────────────────────────────────────────
INGESTION_TELEGRAM_MTPROTO_API_ID=<COPY_FROM_BACKEND_ENV>
INGESTION_TELEGRAM_MTPROTO_API_HASH=<COPY_FROM_BACKEND_ENV>
INGESTION_TELEGRAM_MTPROTO_SESSION=<COPY_FROM_BACKEND_ENV>

# ─────────────────────────────────────────────────────────────────────
# 2. API SERVER CONFIGURATION
# ─────────────────────────────────────────────────────────────────────
INGESTION_PORT=3031
INGESTION_API_BASE_URL=http://ingestion-service:3031

# ─────────────────────────────────────────────────────────────────────
# 3. REDIS CONFIGURATION
# ─────────────────────────────────────────────────────────────────────
INGESTION_REDIS_HOST=redis
INGESTION_REDIS_PORT=6379
INGESTION_REDIS_DB=0
INGESTION_REDIS_PASSWORD=

# ─────────────────────────────────────────────────────────────────────
# 4. DATABASE CONFIGURATION
# ─────────────────────────────────────────────────────────────────────
INGESTION_DATABASE_HOST=postgres
INGESTION_DATABASE_PORT=5432
INGESTION_DATABASE_NAME=onchain_bot
INGESTION_DATABASE_USER=postgres
INGESTION_DATABASE_PASSWORD=<COPY_FROM_BACKEND_ENV>
INGESTION_DATABASE_SYNCHRONIZE=false
INGESTION_DATABASE_LOGGING=false

# ─────────────────────────────────────────────────────────────────────
# 5. CHANNEL SEEDER CONFIGURATION
# ─────────────────────────────────────────────────────────────────────
# Copy TELEGRAM_SEED_KOLS and TELEGRAM_SEED_NEWS from backend .env
INGESTION_TELEGRAM_SEED_KOLS=<COPY_FROM_BACKEND_ENV>
INGESTION_TELEGRAM_SEED_NEWS=<COPY_FROM_BACKEND_ENV>

# ─────────────────────────────────────────────────────────────────────
# 6. ANTI-BAN SAFETY CONFIGURATION (safe defaults)
# ─────────────────────────────────────────────────────────────────────
INGESTION_SAFETY_MAX_CHANNELS=50
INGESTION_SAFETY_POLL_INTERVAL_BASE_MS=90000
INGESTION_SAFETY_JITTER_PERCENT=30
INGESTION_SAFETY_SLEEP_WINDOW_START=04:00
INGESTION_SAFETY_SLEEP_WINDOW_END=08:00
INGESTION_SAFETY_FLOOD_INITIAL_BACKOFF_MS=5000
INGESTION_SAFETY_FLOOD_BACKOFF_MULTIPLIER=2
INGESTION_SAFETY_FLOOD_MAX_BACKOFF_MS=3600000
INGESTION_SAFETY_FLOOD_MAX_ATTEMPTS=5
INGESTION_SAFETY_FLOOD_THRESHOLD_24H=10

# ─────────────────────────────────────────────────────────────────────
# 7. MEDIA RETENTION
# ─────────────────────────────────────────────────────────────────────
INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS=72

# ─────────────────────────────────────────────────────────────────────
# 8. LOGGING
# ─────────────────────────────────────────────────────────────────────
INGESTION_LOG_LEVEL=info
INGESTION_LOG_FORMAT=json

# ─────────────────────────────────────────────────────────────────────
# 9. NODE ENVIRONMENT
# ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
```

Save and exit (Ctrl+X, Y, Enter).

### Step 6: Validate Session Migration

```bash
# Run validation script
./scripts/validate-session-migration.sh
```

**Expected output:**

```
✓ All checks passed!

MTProto session migration is complete. Safe to deploy ingestion-service.
```

**If validation fails:**

- Review error messages
- Check that values were copied correctly
- Ensure no typos in variable names
- Re-run validation after fixing

### Step 7: Remove MTProto Credentials from Backend (CRITICAL)

⚠️ **DO NOT SKIP THIS STEP** - Multiple active sessions will cause AUTH_KEY_DUPLICATED errors.

```bash
# Edit backend .env
nano apps/backend/.env

# Remove or comment out these lines:
# TELEGRAM_MTPROTO_API_ID=...
# TELEGRAM_MTPROTO_API_HASH=...
# TELEGRAM_MTPROTO_SESSION=...

# Add backend SSE configuration:
USE_SSE_INGESTION=true
INGESTION_REMOTE_URL=http://ingestion-service:3031
```

Save and exit.

### Step 8: Re-Validate After Backend Changes

```bash
# Validate again to confirm backend is clean
./scripts/validate-session-migration.sh
```

### Step 9: Deploy Ingestion Service

```bash
# Build and start ingestion-service
docker compose -f apps/backend/docker-compose.prod.yml up -d --build ingestion-service

# Wait for service to start (10-20 seconds)
sleep 15
```

### Step 10: Verify Ingestion Service Health

```bash
# Check health endpoint
curl -s http://localhost:3031/api/health | jq '.'
```

**Expected output:**

```json
{
  "status": "ok",
  "mtproto": {
    "connected": true,
    "authorized": true,
    "lastPollAt": "2026-08-30T00:00:00Z"
  },
  "channels": {
    "total": 15,
    "active": 15,
    "kol": 10,
    "news": 5
  },
  "clients": {
    "connected": 0
  },
  "floodWait": {
    "count24h": 0,
    "maxSeconds24h": 0,
    "consecutiveFailures": 0
  },
  "uptime": 15000
}
```

**✓ Success criteria:**

- `status: "ok"`
- `mtproto.connected: true`
- `mtproto.authorized: true`
- `channels.total > 0`

**❌ If health check fails:**

- Check logs: `docker compose -f apps/backend/docker-compose.prod.yml logs ingestion-service --tail 100`
- Verify credentials in `.env` file
- Check network connectivity to Telegram servers
- See troubleshooting section below

### Step 11: Monitor Logs for 5 Minutes

```bash
# Watch ingestion-service logs
docker compose -f apps/backend/docker-compose.prod.yml logs -f ingestion-service

# Look for:
# ✓ "MTProto client connected"
# ✓ "Channels seeded: X"
# ✓ "message:received" events
# ❌ NO "AUTH_KEY_DUPLICATED" errors
# ❌ NO "FLOOD_WAIT" errors
```

Press Ctrl+C to stop watching logs after 5 minutes.

### Step 12: Restart Backend in SSE Mode

```bash
# Restart backend to pick up new configuration
docker compose -f apps/backend/docker-compose.prod.yml restart backend

# Wait for backend to reconnect (10-15 seconds)
sleep 15
```

### Step 13: Verify Backend SSE Connection

```bash
# Check backend logs
docker compose -f apps/backend/docker-compose.prod.yml logs backend --tail 50 | grep -i "sse\|ingestion"

# Look for:
# ✓ "SSE connection established"
# ✓ "Using SSE ingestion client (remote mode)"
# ❌ NO "MTProto" initialization logs
```

### Step 14: Verify End-to-End Message Flow

```bash
# Check recent messages are arriving in backend
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=5 | jq '.'

# Verify timestamps are recent (within last few minutes)
```

### Step 15: Monitor Production for 1 Hour

Monitor both services for stability:

```bash
# Watch both services
docker compose -f apps/backend/docker-compose.prod.yml logs -f backend ingestion-service

# Check health periodically
watch -n 30 'curl -s http://localhost:3031/api/health | jq ".mtproto, .clients"'
```

**Success criteria:**

- No errors in logs
- Messages flowing through pipeline
- Dashboard showing real-time updates
- SSE connection stable (no reconnections)

## Rollback Procedure (If Issues Occur)

If you encounter problems, rollback immediately:

```bash
# 1. Stop ingestion-service
docker compose -f apps/backend/docker-compose.prod.yml stop ingestion-service

# 2. Restore backend .env
cp apps/backend/.env.backup.$(ls -t apps/backend/.env.backup.* | head -1) apps/backend/.env

# 3. Set backend to local mode
nano apps/backend/.env
# Change: USE_SSE_INGESTION=false

# 4. Restart backend
docker compose -f apps/backend/docker-compose.prod.yml restart backend

# 5. Verify backend MTProto connection
docker compose -f apps/backend/docker-compose.prod.yml logs backend --tail 50 | grep -i mtproto
```

**Time to restore: < 2 minutes**

## Post-Migration Verification

After 24 hours of stable operation:

- [ ] Verify message counts match expected volume
- [ ] Check for any FLOOD_WAIT events: `curl -s http://localhost:3031/api/health | jq '.floodWait'`
- [ ] Compare backend memory usage (should be ~300MB lower)
- [ ] Verify media storage size (should stop growing in backend, now only in ingestion-service)
- [ ] Check dashboard functionality
- [ ] Review any alerts or warnings

## Troubleshooting

### AUTH_KEY_DUPLICATED Error

**Symptom:** Logs show "AUTH_KEY_DUPLICATED" error.

**Cause:** Both backend and ingestion-service have MTProto session active.

**Fix:**

1. Immediately stop both services
2. Verify backend `.env` has NO `TELEGRAM_MTPROTO_*` variables
3. Wait 60 seconds for Telegram to clear session state
4. Start ingestion-service first, wait for connection
5. Start backend in SSE mode

### MTProto Connection Failed

**Symptom:** `mtproto.connected: false` in health check.

**Possible causes:**

- Invalid session string
- Network connectivity issues
- Telegram API outage
- Session expired/revoked

**Fix:**

1. Check logs for specific error message
2. Verify session string is complete (no truncation)
3. Test network: `curl -I https://api.telegram.org`
4. If session expired, regenerate: `cd apps/backend && npm run telegram:gen-session`

### SSE Connection Failing

**Symptom:** Backend logs show "SSE connection failed" repeatedly.

**Possible causes:**

- Ingestion-service not running
- Wrong `INGESTION_REMOTE_URL` in backend .env
- Network routing issue

**Fix:**

1. Verify ingestion-service is running: `docker ps | grep ingestion`
2. Check ingestion-service health: `curl http://ingestion-service:3031/api/health`
3. Verify backend can reach ingestion-service: `docker exec backend ping ingestion-service`

### No Messages Flowing

**Symptom:** Health check shows 0 messages, dashboard not updating.

**Possible causes:**

- Channels not seeded correctly
- FLOOD_WAIT blocking all requests
- Telegram API rate limiting

**Fix:**

1. Check seeded channels: `curl -s http://localhost:3031/api/channels | jq '.'`
2. Check FLOOD_WAIT status: `curl -s http://localhost:3031/api/health | jq '.floodWait'`
3. Review ingestion logs for errors

## Support Contacts

- **Deployment issues**: Check `docs/troubleshooting/ingestion-service.md`
- **Telegram API issues**: https://core.telegram.org/api/errors
- **Emergency rollback**: Follow rollback procedure above

## References

- Spec: `.kiro/specs/centralized-ingestion-service/`
- Validation script: `scripts/validate-session-migration.sh`
- Health endpoint docs: `apps/ingestion-service/README.md`
- Architecture decision: `docs/adr/001-centralized-ingestion-service.md`
