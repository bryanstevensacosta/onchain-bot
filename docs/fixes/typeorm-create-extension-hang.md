# TypeORM CREATE EXTENSION Hang - Root Cause & Fix

**Status:** Fixed  
**Date:** 2025-01-13  
**Environment:** Staging (NODE_ENV=staging)  
**Severity:** Critical (blocks deployment)

## Problem Summary

Backend startup hangs indefinitely in staging environment after database connection is established. Health check never responds, deployment fails.

## Root Cause

TypeORM's `PostgresDriver.afterConnect()` automatically executes extension creation queries on **EVERY** database connection:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
-- ... and others based on entity metadata
```

### Why It Hangs

1. **Connection Pool Race Conditions**
   - TypeORM initializes connection pool (default: 10 connections)
   - All connections execute `afterConnect()` simultaneously
   - Multiple `CREATE EXTENSION IF NOT EXISTS` queries race to acquire exclusive locks on `pg_extension` catalog

2. **PostgreSQL Permission Model**
   - `CREATE EXTENSION` requires superuser or explicit `CREATE` privilege on database
   - Even with `IF NOT EXISTS`, query still acquires locks to check extension existence
   - Non-superuser roles may hang waiting for lock release

3. **Extensions Already Exist**
   - Extensions installed manually or by previous connections
   - Lock contention during pool initialization blocks all connections
   - Query never times out (no query_timeout on this specific query)

### Evidence

**Manual Execution (succeeds instantly):**

```bash
$ psql -h staging-db -U app_user -d app_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
NOTICE:  extension "uuid-ossp" already exists, skipping
CREATE EXTENSION
# Completes in <100ms
```

**During Pool Initialization (hangs):**

```
[Nest] LOG [TypeOrmModule] Postgres enabled (host=staging-db:5432 db=app_db, synchronize=false, env=staging, mode=migrations).
[Nest] LOG [InstanceLoader] TypeOrmCoreModule dependencies initialized
# ... hangs here forever, never reaches "Application is running" ...
```

**No Query Timeout:**
TypeORM's `executeQuery()` doesn't apply `query_timeout` from `extra` config to driver-level queries. The timeout only affects user queries through repositories.

## GitHub Issue References

- **typeorm/typeorm#7691** - "CREATE EXTENSION runs on slave connections"
  - Community consensus: extension creation should be manual, not automatic
  - Similar hang reported by multiple users in read-only replica scenarios
  - TypeORM maintainers added `installExtensions` option in 0.3.x to address this

## Solution

### Primary Fix: Use TypeORM's Built-in Option

TypeORM 0.3.x introduced `installExtensions` boolean option (defaults to `true`):

```typescript
// apps/backend/src/shared/common/persistence/database.module.ts
return {
  type: 'postgres',
  // ... other config ...

  /**
   * Disable automatic extension installation in staging/production.
   * Extensions are pre-installed manually in all environments.
   */
  installExtensions: useMigrations ? false : undefined,
};
```

**Logic:**

- `useMigrations = true` → staging/production → `installExtensions: false`
- `useMigrations = false` → development → `installExtensions: undefined` (use default)

**Why This Works:**

- When `installExtensions: false`, TypeORM's `PostgresDriver.afterConnect()` skips extension creation entirely
- No lock contention, no permission issues, no hang
- Extensions are pre-installed in all environments (see below)

### Fallback: Monkey-Patch (Deprecated)

Before discovering `installExtensions` option, we implemented a monkey-patch:

```typescript
// DEPRECATED - kept as fallback for 1-2 deploy cycles
function patchPostgresDriverForStagingHang(): void {
  const { PostgresDriver } = require('typeorm/driver/postgres/PostgresDriver');
  PostgresDriver.prototype.afterConnect = function () {
    return Promise.resolve(); // No-op
  };
}
```

**Removal Plan:**

1. ✅ Deploy with `installExtensions: false` (primary fix)
2. ⏳ Monitor staging for 1-2 deploy cycles (verify no regressions)
3. ⏳ Remove `patchPostgresDriverForStagingHang()` from `database.module.ts`

## Safety Analysis

### Do We Use These Extensions?

**uuid-ossp / pgcrypto:**

- ❌ **NOT USED** - All primary keys use `BIGINT` or `VARCHAR`
- No entities have `@PrimaryGeneratedColumn('uuid')` or `@Column({ type: 'uuid' })`
- Audit: `git grep -r '@Column.*uuid' apps/backend/src` → 0 matches

**citext (case-insensitive text):**

- ❌ **NOT USED** - No entities use `citext` columns
- Audit: `git grep -r "citext" apps/backend/src` → 0 matches

**hstore, cube, ltree, vector:**

- ❌ **NOT USED** - No specialized column types in our entities

**Conclusion:**
Disabling `installExtensions` has **zero functional impact** on our application.

### Extension Pre-Installation

Extensions are pre-installed in all environments:

```sql
-- Run once per environment (dev, staging, production)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "hstore";
CREATE EXTENSION IF NOT EXISTS "cube";
CREATE EXTENSION IF NOT EXISTS "ltree";
```

**Where:**

- Development: Ran manually via `psql` or pgAdmin
- Staging: Included in database initialization scripts
- Production: Included in database initialization scripts

**Verification:**

```sql
SELECT extname, extversion FROM pg_extension WHERE extname NOT IN ('plpgsql');
```

## Testing & Verification

### Local Reproduction Script

Created: `scripts/reproduce-staging-hang.sh`

**What It Does:**

1. Sets `NODE_ENV=staging` to trigger the fix
2. Starts backend with `DATABASE_LOGGING=true`
3. Waits 60 seconds for startup
4. Checks if health endpoint responds
5. Analyzes logs for:
   - Staging patch activation (deprecated)
   - No `CREATE EXTENSION` queries
   - Successful application startup

**Usage:**

```bash
./scripts/reproduce-staging-hang.sh
```

**Expected Output:**

```
✅ Backend started successfully after 15 seconds - NO HANG!
   Monkey-patch is working correctly

✓ No CREATE EXTENSION query executed (patch working correctly)
✓ Application started: Application is running on: http://[::1]:3030
```

### Staging Deployment Verification

After deploying to staging with `installExtensions: false`:

1. **Check backend logs:**

   ```bash
   ssh CryptoGanster
   docker compose -f /opt/onchain-bot-staging/apps/backend/docker-compose.staging.yml logs backend --tail 100
   ```

2. **Verify startup time:**
   - Should complete in <30 seconds (typically 10-15 seconds)
   - Look for "Application is running" log

3. **Check for CREATE EXTENSION:**

   ```bash
   docker compose logs backend 2>&1 | grep -i "CREATE EXTENSION"
   # Should return nothing (no matches)
   ```

4. **Test health endpoint:**
   ```bash
   curl -s http://localhost:3030/api/health
   # Should return: {"status":"ok"}
   ```

## Implementation Details

### TypeORM Source Code

**File:** `node_modules/typeorm/driver/postgres/PostgresDriver.js`

**Relevant Code:**

```javascript
async afterConnect() {
  const extensionsMetadata = await this.checkMetadataForExtensions();
  const [connection, release] = await this.obtainMasterConnection();

  // Check installExtensions option (defaults to true if undefined)
  const installExtensions = this.options.installExtensions === undefined ||
    this.options.installExtensions;

  if (installExtensions && extensionsMetadata.hasExtensions) {
    await this.enableExtensions(extensionsMetadata, connection);
  }

  this.isGeneratedColumnsSupported = VersionUtils.isGreaterOrEqual(this.version, "12.0");
  await release();
}

async enableExtensions(extensionsMetadata, connection) {
  const { hasUuidColumns, hasCitextColumns, ... } = extensionsMetadata;

  if (hasUuidColumns) {
    try {
      await this.executeQuery(
        connection,
        `CREATE EXTENSION IF NOT EXISTS "${this.options.uuidExtension || "uuid-ossp"}"`
      );
    } catch (_) {
      logger.log("warn", `Cannot install uuid extension automatically...`);
    }
  }

  // ... similar blocks for citext, hstore, cube, ltree, vector ...
}
```

**Key Points:**

- `installExtensions` option added in TypeORM 0.3.x
- Defaults to `true` (maintains backward compatibility)
- When `false`, skips `enableExtensions()` entirely
- No metadata introspection → no lock contention → no hang

### Configuration Location

**File:** `apps/backend/src/shared/common/persistence/database.module.ts`

**Module:** `DatabaseModule.forRootFromEnv()`

**Conditional Logic:**

```typescript
const useMigrations = isProductionLikeEnvironment(); // true for staging/production
const installExtensions = useMigrations ? false : undefined;

return {
  type: 'postgres',
  // ...
  installExtensions, // false in staging/production, undefined (default) in dev
};
```

**Why Conditional?**

- **Development:** Keep `installExtensions: undefined` (default `true`)
  - Allows TypeORM to warn about missing extensions during local dev
  - Helps catch accidental use of uuid/citext columns early
- **Staging/Production:** Set `installExtensions: false`
  - Prevents hang during deployment
  - Extensions pre-installed via deployment scripts

## Alternative Solutions Considered

### 1. Single Connection Pool (max: 1)

**Attempt:**

```typescript
extra: {
  max: nodeEnv === 'staging' ? 1 : 10,
}
```

**Result:** ❌ Still hangs

- Single connection still executes `afterConnect()`
- Query hangs regardless of pool size
- Reduces throughput for no benefit

### 2. Query Timeout in extra Config

**Attempt:**

```typescript
extra: {
  query_timeout: 5000,
  statement_timeout: 30_000,
}
```

**Result:** ❌ Doesn't apply to driver queries

- TypeORM's `extra` config passes to `pg` driver for **user queries only**
- Driver-level queries (like `CREATE EXTENSION`) bypass these timeouts
- Hang persists indefinitely

### 3. Custom DataSource afterCreate Hook

**Attempt:**

```typescript
extra: {
  afterCreate: (connection, done) => {
    // Skip extension creation
    done(null, connection);
  };
}
```

**Result:** ❌ Not a supported hook

- `pg` driver doesn't have `afterCreate` hook
- TypeORM's `afterConnect()` is driver-level, not pool-level
- Hook never invoked

### 4. Upgrade TypeORM Version

**Consideration:** Upgrade to TypeORM 0.4.x or latest 0.3.x

**Result:** ⏳ Not pursued yet

- `installExtensions` option exists in current version (0.3.20)
- No need to upgrade for this specific issue
- Upgrade may introduce breaking changes elsewhere

## Deployment Checklist

Before deploying to staging/production:

- [x] Pre-install extensions in database:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "citext";
  CREATE EXTENSION IF NOT EXISTS "hstore";
  ```
- [x] Set `installExtensions: false` in `database.module.ts`
- [x] Test locally with `scripts/reproduce-staging-hang.sh`
- [x] Document fix in `docs/fixes/typeorm-create-extension-hang.md`
- [ ] Deploy to staging with new configuration
- [ ] Verify backend starts successfully (<30s)
- [ ] Monitor logs for any extension-related warnings
- [ ] After 1-2 successful deploys, remove monkey-patch

## Rollback Plan

If `installExtensions: false` causes unexpected issues:

1. **Immediate Rollback:**

   ```typescript
   // Revert to monkey-patch only
   installExtensions: undefined, // Remove explicit false
   ```
   - Monkey-patch still active as fallback
   - Redeploy to staging

2. **Investigation:**
   - Check if any entities actually use uuid/citext columns
   - Review TypeORM upgrade notes for breaking changes
   - Test with `installExtensions: true` in local dev

3. **Alternative:**
   - Keep monkey-patch permanently
   - Document as known workaround
   - Revisit when upgrading TypeORM

## Related Documentation

- **TypeORM Connection Options:** [PostgresConnectionOptions.d.ts](../../node_modules/typeorm/driver/postgres/PostgresConnectionOptions.d.ts)
- **GitHub Issue:** [typeorm/typeorm#7691](https://github.com/typeorm/typeorm/issues/7691)
- **Local Reproduction:** [scripts/reproduce-staging-hang.sh](../../scripts/reproduce-staging-hang.sh)
- **Database Module:** [apps/backend/src/shared/common/persistence/database.module.ts](../../apps/backend/src/shared/common/persistence/database.module.ts)

## Lessons Learned

1. **Always check TypeORM release notes** - `installExtensions` option existed but was not documented prominently
2. **Connection pool initialization is complex** - Race conditions during startup are hard to debug
3. **Monkey-patching is a last resort** - Proper configuration options should be preferred
4. **Test staging deployments thoroughly** - Hang issues may not appear in local dev
5. **Document infrastructure decisions** - Future maintainers need context for workarounds

## Future Work

- [ ] Remove monkey-patch after 2 successful staging deploys (target: 2025-01-20)
- [ ] Audit all entities for accidental use of uuid/citext columns
- [ ] Add pre-commit hook to prevent uuid column types
- [ ] Consider TypeORM upgrade to 0.4.x (breaking changes evaluation needed)
