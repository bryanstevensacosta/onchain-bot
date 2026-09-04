# Multi-Backend Broadcast System - Production Rollout Plan

## Overview

Phased rollout plan for deploying the multi-backend SSE broadcast system to production.

## Rollout Timeline

| Phase                                | Duration | Activities                                        | Success Criteria           |
| ------------------------------------ | -------- | ------------------------------------------------- | -------------------------- |
| **Week 1: Staging Deployment**       | 7 days   | Deploy with flag OFF, enable flag, validate       | 0 errors for 3 days        |
| **Week 2: Production Parallel Mode** | 7 days   | Deploy to prod with flag OFF, monitor legacy mode | No regressions             |
| **Week 3: Production New Mode**      | 7 days   | Enable flag in prod, monitor multi-backend mode   | 0 message loss, <500ms p99 |
| **Week 4: Cleanup**                  | 7 days   | Remove legacy code, finalize documentation        | Feature fully adopted      |

---

## Week 1: Staging Deployment

### Objectives

- Deploy ingestion-service to staging
- Validate multi-backend mode in staging environment
- Confirm zero message loss and acceptable performance

### Prerequisites

- [ ] Code merged to `master` branch
- [ ] Docker image built: `ghcr.io/bryanstevensacosta/onchain-bot-ingestion:latest`
- [ ] Staging backend updated with registration + SSE client code
- [ ] PostgreSQL schema includes `backfill_messages` table
- [ ] Redis available for cursor tracking

### Day 1-2: Deploy with Feature Flag OFF

**Deployment Steps:**

```bash
# 1. SSH to staging droplet
ssh staging-server

# 2. Pull latest code
cd /opt/onchain-bot
git pull origin master

# 3. Update .env with feature flag OFF
echo "INGESTION_MULTI_BACKEND_ENABLED=false" >> apps/ingestion-service/.env

# 4. Build and deploy
docker-compose -f apps/backend/docker-compose.with-ingestion.yml build ingestion-service
docker-compose -f apps/backend/docker-compose.with-ingestion.yml up -d ingestion-service

# 5. Verify health
curl http://localhost:3032/api/health
```

**Validation:**

- [ ] Service starts without errors
- [ ] `/api/health` returns 200 OK
- [ ] Legacy HTTP polling still works
- [ ] Backend receives messages via legacy path
- [ ] No errors in logs for 24 hours

### Day 3-5: Enable Feature Flag

**Enable Multi-Backend Mode:**

```bash
# Update .env
sed -i 's/INGESTION_MULTI_BACKEND_ENABLED=false/INGESTION_MULTI_BACKEND_ENABLED=true/' apps/ingestion-service/.env

# Restart service
docker-compose -f apps/backend/docker-compose.with-ingestion.yml restart ingestion-service

# Wait 30 seconds for startup
sleep 30

# Verify backend registered
curl http://localhost:3032/api/ingestion/stream/status
```

**Expected Response:**

```json
{
  "activeBackends": 1,
  "channelUnionSize": 45,
  "backfillBufferSize": 0,
  "backfillBufferOldestTimestamp": null,
  "mtprotoConnected": true,
  "registeredBackends": ["staging"],
  "timestamp": "2026-09-03T12:00:00.000Z"
}
```

**Validation:**

- [ ] Backend registers successfully (`registeredBackends: ["staging"]`)
- [ ] SSE connection established (`activeBackends: 1`)
- [ ] Real-time messages received
- [ ] Backfill works on backend restart
- [ ] Circuit breaker protects from failures
- [ ] No errors in logs for 72 hours

### Day 6-7: Performance & Stability Testing

**Load Testing:**

```bash
# Simulate high message volume
# Expected: ~40 messages/min at peak

# Monitor metrics
watch -n 5 'curl -s http://localhost:3032/api/ingestion/stream/status'

# Monitor memory usage
docker stats ingestion-service --no-stream

# Monitor latency
# p50 < 100ms, p95 < 500ms, p99 < 1000ms
```

**Stress Testing:**

```bash
# Test backend reconnection
docker restart staging-backend

# Verify backfill received (check backend logs)
# Expected: backfill-complete event with count

# Test circuit breaker
# Kill network between services for 2 minutes
# Expected: Circuit opens after 3 failures, half-opens after 5 minutes
```

**Success Criteria:**

- [ ] 0 errors in staging for 3 consecutive days
- [ ] Message latency p99 < 500ms
- [ ] Memory usage stable (~200MB)
- [ ] Backfill recovery works 100% of time
- [ ] Circuit breaker isolates failures

---

## Week 2: Production Parallel Mode

### Objectives

- Deploy ingestion-service to production with flag OFF
- Run in parallel mode (legacy HTTP polling)
- Confirm no regressions in production

### Day 1-2: Production Deployment (Flag OFF)

**Pre-Deployment Checklist:**

- [ ] Staging validation complete (Week 1)
- [ ] Production backend code ready (not yet deployed)
- [ ] Database migration ready
- [ ] Rollback plan tested
- [ ] On-call team briefed
- [ ] Maintenance window scheduled

**Deployment Steps:**

```bash
# 1. SSH to production droplet
ssh production-server

# 2. Backup database
cd /opt/onchain-bot
./apps/backend/scripts/backup-db.sh

# 3. Pull latest code
git pull origin master

# 4. Set feature flag OFF
echo "INGESTION_MULTI_BACKEND_ENABLED=false" >> apps/ingestion-service/.env.production

# 5. Run database migration
cd apps/ingestion-service
npm run migration:run

# 6. Build and deploy
cd ../..
docker-compose -f apps/backend/docker-compose.with-ingestion.yml build ingestion-service
docker-compose -f apps/backend/docker-compose.with-ingestion.yml up -d ingestion-service

# 7. Verify health
curl http://localhost:3032/api/health

# 8. Verify legacy mode
docker logs ingestion-service | grep "Legacy Mode"
```

**Validation:**

- [ ] Service starts successfully
- [ ] Logs show "[Legacy Mode]"
- [ ] Backend receives messages via HTTP polling
- [ ] No errors in logs for 48 hours
- [ ] Message counts match pre-deployment baseline

### Day 3-7: Monitor Production (Legacy Mode)

**Daily Checks:**

```bash
# Check service health
curl http://localhost:3032/api/health

# Check message throughput
# Compare with pre-deployment baseline

# Check error rate
docker logs ingestion-service | grep ERROR | wc -l

# Check memory usage
docker stats ingestion-service --no-stream
```

**Success Criteria:**

- [ ] No regressions in message delivery
- [ ] Error rate unchanged from baseline
- [ ] Performance unchanged from baseline
- [ ] 7 days stable operation

---

## Week 3: Production New Mode

### Objectives

- Enable multi-backend mode in production
- Monitor for message loss and performance issues
- Validate backfill and circuit breaker in production

### Day 1: Deploy Production Backend

**Backend Deployment:**

```bash
# 1. Deploy production backend with registration + SSE client code
# 2. Backend should start but not register (flag still OFF)
# 3. Verify backend can start without errors
# 4. Monitor for 24 hours
```

### Day 2: Enable Feature Flag

**Enable Multi-Backend Mode:**

```bash
# 1. Update .env
sed -i 's/INGESTION_MULTI_BACKEND_ENABLED=false/INGESTION_MULTI_BACKEND_ENABLED=true/' apps/ingestion-service/.env.production

# 2. Restart ingestion-service
docker-compose -f apps/backend/docker-compose.with-ingestion.yml restart ingestion-service

# 3. Wait for startup
sleep 30

# 4. Verify backend registered
curl http://localhost:3032/api/ingestion/stream/status | jq '.registeredBackends'

# 5. Verify SSE connection
curl http://localhost:3032/api/ingestion/stream/status | jq '.activeBackends'

# 6. Monitor logs
docker logs ingestion-service --tail 100 | grep "Multi-Backend Mode"
```

**Real-Time Monitoring:**

```bash
# Terminal 1: Watch status
watch -n 5 'curl -s http://localhost:3032/api/ingestion/stream/status | jq "{activeBackends, channelUnionSize, backfillBufferSize}"'

# Terminal 2: Watch logs
docker logs ingestion-service --follow | grep -E "ERROR|Broadcasting|Backfill"

# Terminal 3: Monitor backend
# Check backend application logs for message reception
```

### Day 3-7: Production Monitoring

**Daily Monitoring:**

1. **Message Counts:**

   ```bash
   # Compare message counts between ingestion-service and backend
   # Should be 100% match (0% loss)
   ```

2. **Latency:**

   ```bash
   # Monitor end-to-end latency
   # Target: p99 < 500ms
   ```

3. **Error Rate:**

   ```bash
   docker logs ingestion-service | grep ERROR | tail -50
   # Target: 0 errors related to multi-backend system
   ```

4. **Backfill Testing:**

   ```bash
   # Test 1: Short disconnection (<5 minutes)
   docker restart production-backend
   # Verify: Backfill received, 0 message loss

   # Test 2: Medium disconnection (30 minutes)
   # Stop backend for 30 min, then restart
   # Verify: Backfill received, 0 message loss
   ```

5. **Circuit Breaker:**
   ```bash
   # Monitor for circuit breaker events
   docker logs ingestion-service | grep "Circuit.*OPEN\|HALF_OPEN\|CLOSED"
   ```

**Success Criteria:**

- [ ] 0 message loss confirmed (100% match)
- [ ] Latency p99 < 500ms
- [ ] 0 multi-backend related errors
- [ ] Backfill works in production
- [ ] Circuit breaker protects from failures
- [ ] 7 days stable operation

**Rollback Trigger:**

- Message loss > 0.1%
- Latency p99 > 1000ms
- Errors > 10 per hour
- System instability

**Rollback Procedure:**

```bash
# Set flag to false
sed -i 's/INGESTION_MULTI_BACKEND_ENABLED=true/INGESTION_MULTI_BACKEND_ENABLED=false/' apps/ingestion-service/.env.production

# Restart service
docker-compose -f apps/backend/docker-compose.with-ingestion.yml restart ingestion-service

# Verify legacy mode active
docker logs ingestion-service | grep "Legacy Mode"
```

---

## Week 4: Cleanup & Finalization

### Objectives

- Remove legacy HTTP polling code
- Finalize documentation
- Set multi-backend as default
- Monitor for 7 days

### Day 1-2: Remove Legacy Code

**Code Changes:**

1. Remove `fetchActiveKolIds()` method from BackendChannelProviderService
2. Remove `fetchActiveCryptoNewsSourceIds()` method
3. Remove HTTP polling fallback from `fetchAllActiveChannelIds()`
4. Update tests to remove legacy path coverage

**Deployment:**

```bash
# Deploy updated code with legacy code removed
git pull origin master
docker-compose -f apps/backend/docker-compose.with-ingestion.yml build ingestion-service
docker-compose -f apps/backend/docker-compose.with-ingestion.yml up -d ingestion-service
```

### Day 3-5: Documentation Finalization

**Documentation Tasks:**

- [ ] Update AGENTS.md with multi-backend architecture
- [ ] Update README with new endpoints
- [ ] Create admin playbook for operations team
- [ ] Record architecture decision (ADR)
- [ ] Update API documentation

### Day 6-7: Final Validation

**Validation:**

- [ ] All backends connected via SSE
- [ ] No legacy code paths active
- [ ] Documentation complete and reviewed
- [ ] Operations team trained
- [ ] Monitoring dashboards configured
- [ ] 7 days error-free operation

---

## Success Metrics

### Performance

- **Latency:** p50 < 100ms, p95 < 300ms, p99 < 500ms ✅
- **Throughput:** 40-50 messages/min at peak ✅
- **Memory:** < 300MB per instance ✅

### Reliability

- **Message Loss:** 0% (100% delivery) ✅
- **Uptime:** > 99.9% ✅
- **Error Rate:** < 0.1% ✅

### Operational

- **Backfill Success:** 100% of reconnections ✅
- **Circuit Breaker:** Isolates failures in < 30s ✅
- **Recovery Time:** < 5 minutes ✅

---

## Rollout Status Dashboard

```
┌─────────────────────────────────────────────────────────┐
│ Multi-Backend Broadcast System - Rollout Status         │
├─────────────────────────────────────────────────────────┤
│ Week 1: Staging Deployment          [ PENDING ]         │
│ Week 2: Production Parallel Mode    [ PENDING ]         │
│ Week 3: Production New Mode         [ PENDING ]         │
│ Week 4: Cleanup & Finalization      [ PENDING ]         │
├─────────────────────────────────────────────────────────┤
│ Current Phase: Not Started                              │
│ Next Milestone: Deploy to Staging                       │
│ Estimated Completion: 4 weeks from start                │
└─────────────────────────────────────────────────────────┘
```

---

## Contact & Escalation

- **Project Lead:** Backend Infrastructure Team
- **On-Call:** PagerDuty rotation
- **Slack Channel:** #ingestion-service
- **Runbook:** [multi-backend-runbook.md](./multi-backend-runbook.md)
- **Migration Guide:** [multi-backend-migration.md](./multi-backend-migration.md)
