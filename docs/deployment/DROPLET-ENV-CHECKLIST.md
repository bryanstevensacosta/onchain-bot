# Droplet Environment Variables - Quick Checklist

## 🎯 What You Need to Configure

### 1. Extract from Backend .env (on droplet)

```bash
ssh root@144.126.203.139
cd /opt/onchain-bot
grep "TELEGRAM_MTPROTO\|TELEGRAM_SEED\|DATABASE_PASSWORD" apps/backend/.env
```

Copy these values - you'll need them for ingestion-service.

### 2. Create apps/ingestion-service/.env

**Minimal Required Configuration:**

```bash
# MTProto Credentials (COPY from backend .env)
INGESTION_TELEGRAM_MTPROTO_API_ID=<from backend>
INGESTION_TELEGRAM_MTPROTO_API_HASH=<from backend>
INGESTION_TELEGRAM_MTPROTO_SESSION=<from backend>

# API Config
INGESTION_PORT=3031
INGESTION_API_BASE_URL=http://ingestion-service:3031

# Redis
INGESTION_REDIS_HOST=redis
INGESTION_REDIS_PORT=6379
INGESTION_REDIS_DB=0
INGESTION_REDIS_PASSWORD=

# Database
INGESTION_DATABASE_HOST=postgres
INGESTION_DATABASE_PORT=5432
INGESTION_DATABASE_NAME=onchain_bot
INGESTION_DATABASE_USER=postgres
INGESTION_DATABASE_PASSWORD=<from backend>
INGESTION_DATABASE_SYNCHRONIZE=false
INGESTION_DATABASE_LOGGING=false

# Channels (COPY from backend .env)
INGESTION_TELEGRAM_SEED_KOLS=<from backend>
INGESTION_TELEGRAM_SEED_NEWS=<from backend>

# Environment
NODE_ENV=production
```

### 3. Update apps/backend/.env

**Remove these lines:**

```bash
# DELETE THESE:
TELEGRAM_MTPROTO_API_ID=...
TELEGRAM_MTPROTO_API_HASH=...
TELEGRAM_MTPROTO_SESSION=...
```

**Add these lines:**

```bash
# ADD THESE:
USE_SSE_INGESTION=true
INGESTION_REMOTE_URL=http://ingestion-service:3031
```

### 4. Validate Before Deploy

```bash
./scripts/validate-session-migration.sh
```

Should output: ✓ All checks passed!

## 🚀 Deploy Commands

```bash
# 1. Deploy ingestion-service
docker compose -f apps/backend/docker-compose.prod.yml up -d --build ingestion-service

# 2. Verify health
curl -s http://localhost:3031/api/health | jq '.status, .mtproto'

# 3. Restart backend
docker compose -f apps/backend/docker-compose.prod.yml restart backend

# 4. Watch logs
docker compose -f apps/backend/docker-compose.prod.yml logs -f backend ingestion-service
```

## ⚠️ Critical Warnings

1. **NEVER have MTProto credentials in BOTH backend and ingestion-service** - causes AUTH_KEY_DUPLICATED
2. **Backup .env before making changes** - `cp apps/backend/.env apps/backend/.env.backup`
3. **Deploy during low traffic** - recommended: 02:00-06:00 UTC
4. **Have rollback plan ready** - see MIGRATION-GUIDE-DROPLET.md

## 🔍 Success Indicators

After deployment, check:

```bash
# Ingestion-service health
curl -s http://localhost:3031/api/health | jq '.'
# Should show: status: "ok", mtproto.connected: true

# Backend SSE connection
docker logs backend 2>&1 | grep -i "sse connection"
# Should show: "SSE connection established"

# Message flow
curl -s http://localhost:3030/api/vip-calls/calls/recent?limit=5 | jq '.'
# Should show recent messages with current timestamps
```

## 📋 Full Documentation

For detailed step-by-step guide: `docs/deployment/MIGRATION-GUIDE-DROPLET.md`
