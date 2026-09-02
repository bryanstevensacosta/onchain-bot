# TypeORM CREATE EXTENSION Hang - Quick Reference

## TL;DR

**Problem:** Backend hangs in staging during database connection initialization  
**Root Cause:** TypeORM automatically runs `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` on every connection, causing lock contention  
**Solution:** Set `installExtensions: false` in TypeORM connection options for staging/production

## The Fix (One-Liner)

```typescript
// apps/backend/src/shared/common/persistence/database.module.ts
installExtensions: useMigrations ? false : undefined,
```

This disables automatic extension creation in staging/production while keeping default behavior in development.

## Why It Works

1. TypeORM 0.3.x has built-in `installExtensions` boolean option (defaults to `true`)
2. When `false`, TypeORM skips `CREATE EXTENSION` queries entirely
3. No lock contention → no hang
4. Our entities don't use uuid/citext columns → safe to disable

## Testing

```bash
# Run local reproduction script
./scripts/reproduce-staging-hang.sh

# Should complete in <60 seconds with success message
# Check for: "✅ Backend started successfully - NO HANG!"
```

## Deployment Verification

After deploying to staging:

```bash
# SSH to staging
ssh CryptoGanster

# Check logs (should start in <30s)
docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml logs backend --tail 100

# Verify no CREATE EXTENSION queries
docker compose logs backend 2>&1 | grep -i "CREATE EXTENSION"
# Should return nothing

# Test health endpoint
curl -s http://localhost:3030/api/health
# Should return: {"status":"ok"}
```

## Rollback Plan

If issues occur, revert to monkey-patch only:

```typescript
// Change in database.module.ts:
installExtensions: undefined, // Remove explicit false
```

The deprecated monkey-patch is still active as fallback.

## Cleanup (After 2 Successful Deploys)

1. Remove `patchPostgresDriverForStagingHang()` function
2. Remove its invocation in `forRootFromEnv()`
3. Keep `installExtensions: false` configuration

Target date: 2025-01-20

## References

- Full documentation: [typeorm-create-extension-hang.md](./typeorm-create-extension-hang.md)
- TypeORM issue: [typeorm/typeorm#7691](https://github.com/typeorm/typeorm/issues/7691)
- Reproduction script: [scripts/reproduce-staging-hang.sh](../../scripts/reproduce-staging-hang.sh)

## Emergency Contact

If staging deployment fails with hanging behavior:

1. Check deployment logs for "Application is running" message
2. If absent after 60 seconds, deployment is hung
3. Check if `installExtensions: false` is present in deployed code
4. Verify extensions are pre-installed: `SELECT extname FROM pg_extension;`
5. Rollback to previous deployment if needed

## Key Insight

**The hang is NOT a database problem - it's a TypeORM driver race condition.**

Manual `CREATE EXTENSION` execution completes instantly. The issue only occurs during connection pool initialization when multiple connections race to create the same extension.
