# Ingestion Service Post-Deployment Checklist

**Generated:** 2026-08-30
**Related PR:** #91

## Prerequisites

- [ ] PR #91 merged to master
- [ ] Deploy Ingestion Service workflow succeeded
- [ ] Ingestion service running on droplet (port 3032)

## Steps

### 1. Verify Deploy Success

```bash
gh run list --workflow="deploy-ingestion.yml" --limit 1
```

### 2. SSH to Droplet

```bash
ssh CryptoGanster
```

### 3. Verify Service Running

```bash
curl -s http://localhost:3032/api/health | jq '.'
```

### 4. Copy MTProto Session

On LOCAL machine:
```bash
grep TELEGRAM_MTPROTO_SESSION apps/backend/.env
```

### 5. Configure Ingestion Service

```bash
cd /opt/onchain-bot/apps/ingestion-service
nano .env
```

Add:
```bash
TELEGRAM_MTPROTO_SESSION="<your_session>"
TELEGRAM_MTPROTO_API_ID=<your_id>
TELEGRAM_MTPROTO_API_HASH=<your_hash>
```

### 6. Restart Ingestion Service

```bash
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.ingestion.yml restart
sleep 10
curl -s http://localhost:3032/api/health | jq '.mtproto.connected'
```

### 7. Configure Staging Backend

```bash
cd /opt/onchain-bot-staging/apps/backend
nano .env
```

Add:
```bash
USE_SSE_INGESTION=true
INGESTION_SERVICE_URL=http://localhost:3032
```

Restart:
```bash
docker compose -f docker-compose.staging.yml restart backend
```

### 8. Configure Production Backend

```bash
cd /opt/onchain-bot/apps/backend
nano .env.production
```

Add:
```bash
USE_SSE_INGESTION=true
INGESTION_SERVICE_URL=http://localhost:3032
```

Restart:
```bash
docker compose -f docker-compose.prod.yml restart backend
```

### 9. Verify Connections

```bash
curl -s http://localhost:3032/api/health | jq '.clients.connected'
```

Expected: `2` (staging + production)

### 10. Monitor Logs

```bash
docker compose -f /opt/onchain-bot/apps/backend/docker-compose.ingestion.yml logs -f
```

## Completion Checklist

- [ ] Ingestion service healthy
- [ ] MTProto connected
- [ ] Staging backend connected
- [ ] Production backend connected
- [ ] Messages flowing end-to-end
