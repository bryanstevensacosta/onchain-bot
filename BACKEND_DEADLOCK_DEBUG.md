# Backend Deadlock Investigation Report

**Date:** 2026-09-01  
**Issue:** Backend hangs indefinitely during `app.listen()` before executing any lifecycle hooks

---

## 🔴 PROBLEM SUMMARY

The backend process blocks completely during NestJS bootstrap, specifically inside `app.listen()` **before** any `OnModuleInit` or `OnApplicationBootstrap` hooks execute. The configured 120s startup timeout never fires, indicating a complete deadlock rather than a slow operation.

---

## ✅ WHAT WORKS

1. **Ingestion Service**: Fully operational on port 3031
   - SSE endpoint: `http://localhost:3031/api/ingestion/stream`
   - Health: `http://localhost:3031/api/health`
   - MTProto: Connected & Authorized

2. **Compilation**: Backend compiles without TypeScript errors (`npx nest build` succeeds)

3. **Static Analysis**: No circular dependencies detected (`npx madge --circular apps/backend/src`)

---

## 🔍 INVESTIGATION RESULTS

### Ruled Out

| Hypothesis              | Test                                      | Result         |
| ----------------------- | ----------------------------------------- | -------------- |
| Circular dependencies   | `madge --circular`                        | ✅ None found  |
| `await` in constructors | Code search                               | ✅ None found  |
| SSE adapter issue       | Disabled `TelegramIngestionModule`        | ❌ Still hangs |
| Embedding service       | Disabled `DeduplicationModule`            | ❌ Still hangs |
| Seeding operations      | `INGESTION_TELEGRAM_SEED_ENABLED=false`   | ❌ Still hangs |
| TypeORM synchronize     | `DATABASE_ENABLED=false` (in-memory mode) | ❌ Still hangs |
| Watch mode issue        | Tried `nest start` without `--watch`      | ❌ Still hangs |

### Debug Logging Added

Comprehensive logging was added to:

- `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/main.ts` (bootstrap flow)
- `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.ts`
- `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/token/call-tracking/infrastructure/scheduling/background-evaluation.scheduler.ts`
- `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts`
- `/Users/bryanstevens/dev/onchain-bot/apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts`

**Result:** None of the lifecycle hook logs appear, confirming the deadlock occurs during module graph construction, not during hook execution.

### Observed Behavior

```
[DEBUG] 9. About to call app.listen(3030)
[DEBUG] 9a. This will trigger OnModuleInit/OnApplicationBootstrap hooks
[DEBUG] 9b. ⚠️ app.listen() is taking more than 5 seconds
[DEBUG] 9b. Likely a lifecycle hook (OnModuleInit/OnApplicationBootstrap) is hanging
```

Process never proceeds beyond this point. The 120s fatal timeout configured in `main.ts` never fires.

---

## 🎯 REMAINING HYPOTHESES

### 1. **Module Registration Deadlock**

NestJS may be stuck resolving the dependency injection graph during module registration. This happens **before** instantiating any providers, which explains why no lifecycle hooks execute.

**Possible causes:**

- Provider with complex `useFactory` that blocks synchronously
- `forRootAsync()` factory that doesn't return promptly
- Module import order creating initialization bottleneck

### 2. **Event Loop Blockage**

A synchronous operation in module initialization is blocking the event loop, preventing:

- The timeout timer from firing
- Any async operations from proceeding
- Hot-reload from properly terminating old processes

### 3. **Resource Contention**

Multiple backend processes competing for port 3030 or database connections. Logs show multiple PIDs (73056, 73057, 73800, 73801, 78798, 79435, 79830) attempting to start simultaneously.

---

## 🔧 DIAGNOSTIC SCRIPT

Run this script to gather detailed information:

```bash
#!/bin/bash
# File: scripts/diagnose-backend-deadlock.sh

echo "=== Backend Deadlock Diagnostic ==="
echo ""

echo "1. Check for zombie Node processes:"
ps aux | grep -E "(node|nest)" | grep -v grep
echo ""

echo "2. Check port 3030 usage:"
lsof -i:3030
echo ""

echo "3. Check PostgreSQL connectivity:"
docker exec alpha-meta-token-scanner-postgres pg_isready
echo ""

echo "4. Check Redis connectivity:"
docker exec alpha-meta-token-scanner-redis redis-cli ping
echo ""

echo "5. Check NestJS module graph (may reveal deadlock):"
cd apps/backend
NODE_OPTIONS="--trace-warnings --trace-sync-io" npx nest start 2>&1 | tee backend-start.log &
PID=$!
echo "Started backend with PID $PID, waiting 30s..."
sleep 30
kill -SIGABRT $PID 2>/dev/null
echo "Killed backend, checking for core dump..."
ls -lh core* 2>/dev/null || echo "No core dump generated"
cat backend-start.log
echo ""

echo "6. Memory/CPU usage during startup:"
cd apps/backend
npx nest start &
PID=$!
for i in {1..10}; do
  echo "Sample $i ($(date)):"
  ps -p $PID -o %cpu,%mem,vsz,rss,time || break
  sleep 3
done
kill -9 $PID 2>/dev/null
echo ""

echo "=== Diagnostic Complete ==="
```

---

## 🚀 WORKAROUND OPTIONS

### Option A: Bisect Module Imports

Comment out half of `AppModule` imports, test if backend starts. Repeat until identifying the problematic module.

```typescript
// apps/backend/src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ /* ... */ }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule.forRootFromEnv(),

    // Comment out in batches to identify culprit:
    // DashboardModule,
    // ExtractionModule,
    // ParsingModule,
    // ...
  ],
})
```

### Option B: Use Node Inspector

Attach Chrome DevTools to see call stack at deadlock moment:

```bash
cd apps/backend
node --inspect-brk dist/src/main.js
```

Then open `chrome://inspect` in Chrome and click "inspect" on the process. The debugger will pause at the deadlock point, revealing the exact line/module causing the issue.

### Option C: Enable Synchronous I/O Tracing

```bash
cd apps/backend
NODE_OPTIONS="--trace-sync-io" npm run start:dev
```

This will print warnings for any synchronous I/O operations that might be blocking the event loop.

---

## 📝 FILES MODIFIED (DEBUG CHANGES)

**Temporary Changes (can be reverted)**:

- `apps/backend/src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.ts` - Added `🔄` and `✅` logging
- `apps/backend/src/token/call-tracking/infrastructure/scheduling/background-evaluation.scheduler.ts` - Added `🔄` and `✅` logging
- `apps/backend/src/shared/deduplication/infrastructure/ml/embedding.service.ts` - Added `🔄` and `✅` logging
- `apps/backend/src/telegram/ingestion/shared/application/ingestion-coordinator.service.ts` - Added `setImmediate()` + logging

**Environment Changes**:

- `apps/backend/.env.dev` - Set `INGESTION_TELEGRAM_SEED_ENABLED=false`

**Production-Ready Changes** (keep these):

- All deprecated MTProto components marked with `@deprecated` JSDoc
- `apps/backend/docker-compose.yml` - Fixed Redis password conditional logic
- `apps/ingestion-service/src/telegram/shared/shared.module.ts` - Marked `@Global()`, added missing providers
- `apps/ingestion-service/src/telegram/kol/seeders/kol.seeder.ts` - Fixed DI with `@Inject(TelegramListenerPort)`
- `apps/ingestion-service/src/telegram/crypto-news/seeders/crypto-news.seeder.ts` - Fixed DI with `@Inject(TelegramListenerPort)`

---

## 🎯 RECOMMENDED NEXT STEP

**Use Node Inspector (Option B)** - This is the most reliable way to identify the exact deadlock location without trial-and-error:

1. Build backend: `cd apps/backend && npx nest build`
2. Start with inspector: `node --inspect-brk dist/src/main.js`
3. Open Chrome: `chrome://inspect`
4. Click "inspect" on the node process
5. Press "Resume" (F8) in DevTools to let it run until it hangs
6. Press "Pause" (F8) to see the call stack at the deadlock moment
7. The "Call Stack" panel will show exactly which module/provider is blocking

The call stack will reveal whether it's a specific provider factory, a module import, or an event emitter registration causing the deadlock.

---

**Status:** Investigation paused - awaiting interactive debugging session with Node Inspector
