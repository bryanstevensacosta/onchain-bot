# E2E Testing Guide for Ingestion Service

## CRITICAL: MTProto Session Constraint

**⚠️ WARNING: Only ONE active MTProto session is allowed per Telegram account.**

Per Architectural Invariant 7 (AUTH_KEY_DUPLICATED), attempting to initialize a second MTProto client while the ingestion-service is running on the droplet will result in a `406 AUTH_KEY_DUPLICATED` error from Telegram.

## Test Strategy

### ✅ Allowed: Tests that connect to running ingestion-service

These tests connect to the ingestion-service SSE endpoint on the droplet without initializing MTProto:

```typescript
// CORRECT: Connect to remote ingestion-service
const sseClient = new EventSource(
  'http://144.126.203.139:3032/api/ingestion/stream',
);
```

### ❌ Forbidden: Tests that initialize MTProto locally

```typescript
// WRONG: This will conflict with droplet MTProto session
const client = new TelegramClient(session, apiId, apiHash, {});
await client.start(); // ← WILL FAIL WITH AUTH_KEY_DUPLICATED
```

## E2E Test Types

### 8.1 Full Message Flow Test

- **Strategy**: Connect SSE client to droplet ingestion-service
- **Validation**: Verify message format, media URLs, latency
- **No MTProto**: Uses live service on droplet

### 8.2 Reconnection Test

- **Strategy**: Test SSE client reconnection logic (mock disconnections)
- **Validation**: Exponential backoff, reconnect <30s
- **No MTProto**: Pure SSE logic test

### 8.3 Load Test

- **Strategy**: Spawn 10 SSE clients connecting to droplet
- **Validation**: Latency p95 <500ms, zero disconnections
- **No MTProto**: Uses live service on droplet

### 8.4 Side-by-Side Validation

- **Strategy**: Compare prod DB (MTProto mode) vs staging DB (SSE mode)
- **Validation**: ≥99.9% message parity
- **No MTProto**: Only queries databases

## Running E2E Tests

### Prerequisites

1. Ingestion-service must be running on droplet (144.126.203.139:3032)
2. Health endpoint must return 200: `curl http://144.126.203.139:3032/api/health`
3. MTProto must be connected: `mtproto.connected: true`

### Environment Variables

```bash
# E2E tests connect to remote service
export INGESTION_SERVICE_URL=http://144.126.203.139:3032

# Side-by-side validation (Phase 9.3)
export PROD_DB_HOST=144.126.203.139
export PROD_DB_PORT=5432
export PROD_DB_NAME=onchain_bot_prod
export STAGING_DB_HOST=144.126.203.139
export STAGING_DB_PORT=5432
export STAGING_DB_NAME=onchain_bot_staging
export VALIDATION_WINDOW_HOURS=48
```

### Run Tests

```bash
# From apps/ingestion-service/
npm run test:e2e

# Individual test suites
npm run test:e2e -- stream-reconnection.e2e-spec.ts
npm run test:e2e -- metrics.e2e-spec.ts

# From apps/backend/ (side-by-side validation)
npm run test:e2e -- ingestion-side-by-side.e2e-spec.ts
```

## Troubleshooting

### AUTH_KEY_DUPLICATED Error

**Symptom**: `RpcError: 406 AUTH_KEY_DUPLICATED`

**Cause**: Test attempted to initialize MTProto while ingestion-service on droplet is using the same session.

**Solution**:

1. Stop the test that initialized MTProto
2. Verify ingestion-service on droplet is still running: `curl http://144.126.203.139:3032/api/health`
3. If ingestion-service crashed, restart: `ssh root@144.126.203.139 "cd /opt/onchain-bot/apps/backend && docker compose -f docker-compose.ingestion.yml restart"`

### SSE Connection Refused

**Symptom**: Tests fail with `ECONNREFUSED 144.126.203.139:3032`

**Cause**: Ingestion-service not running on droplet.

**Solution**:

```bash
ssh root@144.126.203.139
cd /opt/onchain-bot/apps/backend
docker compose -f docker-compose.ingestion.yml ps
docker compose -f docker-compose.ingestion.yml up -d
```

### Database Connection Failed (Side-by-Side Tests)

**Symptom**: `ECONNREFUSED` to Postgres

**Cause**: Database credentials incorrect or not accessible from test machine.

**Solution**:

1. Verify DB credentials in `.env` files on droplet
2. Ensure Postgres ports are accessible (may require SSH tunnel):
   ```bash
   ssh -L 5432:localhost:5432 root@144.126.203.139
   ```

## References

- Architectural Invariant 7: Single MTProto Session (design.md § 1.2)
- Requirement 8.1-8.4: E2E Testing (requirements.md)
- Phase 9.3: Side-by-Side Validation (tasks.md)
