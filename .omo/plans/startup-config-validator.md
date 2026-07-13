# startup-config-validator - Work Plan

## TL;DR (For humans)

**What you'll get:** When the backend starts, it will now check that every critical environment variable (API keys, DB credentials, Telegram tokens) is actually set — and if any are missing, it will print a clear, complete list and STOP immediately instead of starting up with empty values and failing cryptically later. Optional vars get a warning but don't block. After the config check, it also pings Postgres and Redis and warns if they're unreachable.

**Why this approach:** A missing env var today becomes `''` (empty string), which causes silent data-pipeline failures minutes later — making it look like the system is working when it's not. Fail-fast at startup with ALL problems listed at once saves debugging time and prevents corrupt data from being processed.

**What it will NOT do:** It won't change any `.env` files, modify your existing config structure, add new npm packages, or block startup on optional things like analytics settings or KOL seed lists.

**Effort:** Short (3 core todos + wiring)
**Risk:** Low — new standalone files, no changes to existing business logic
**Decisions to sanity-check:** The list of which env vars are required vs optional; the connectivity check design (non-blocking warnings).

Your next move: Approve the plan, then run `$start-work`.

---

> TL;DR (machine): Short - Low - 3 files, 2 wiring edits, ~150 lines total

## Scope

### Must have

- A `ConfigValidator` function in `shared/common/config/config-validator.ts` that checks all env vars defined in `AppConfig` and reports ALL missing/invalid ones at once
- A tier system: block on critical API keys/Telegram tokens (Tier 1), block conditionally on DB/Redis when those features are enabled (Tier 2), validate format (Tier 3), warn on optional vars (Tier 4)
- Wiring in `main.ts` before `NestFactory.create()` — fail fast with clear error listing every missing var
- A `ConfigConnectivityService` with `OnApplicationBootstrap` that pings Postgres, Redis, Telegram Bot API and warns if unreachable
- Wiring in `AppModule` for the connectivity service
- Unit tests for the validator (all-present, missing, mixed, format, conditional)
- Unit tests for the connectivity service (mocked clients)

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Do NOT modify `apps/backend/src/shared/common/config/app.config.ts` — keep `?? ''` fallbacks as-is
- Do NOT add new npm dependencies (use existing `pg` from TypeORM's dep graph, existing `ioredis` from Redis module)
- Do NOT modify `.env` or `.env.dev` files
- Do NOT create a NestJS `@Module()` or `@Injectable()` for the validator — it must work as a pure function
- Do NOT create a new BC — these belong in `shared/common/config/`
- Do NOT add compile-time checks — runtime only
- Do NOT make connectivity checks blocking — warn only

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after (co-located `*.spec.ts` files) + Jest
- Evidence: .omo/evidence/task-<N>-startup-config-validator.<ext>

## Execution strategy

### Parallel execution waves

**Wave 1** (parallel — 2 independent todos):

- Todo 1: ConfigValidator core + tests
- Todo 2: ConfigConnectivityService + tests

**Wave 2** (parallel — wiring, depends on Wave 1):

- Todo 3: Wire ConfigValidator in `main.ts`
- Todo 4: Wire ConfigConnectivityService in `AppModule`

### Dependency matrix

| Todo                              | Depends on | Blocks     | Can parallelize with |
| --------------------------------- | ---------- | ---------- | -------------------- |
| 1. ConfigValidator                | —          | 3 (wiring) | 2                    |
| 2. ConfigConnectivityService      | —          | 4 (wiring) | 1                    |
| 3. Wire validator in main.ts      | 1          | —          | 4                    |
| 4. Wire connectivity in AppModule | 2          | —          | 3                    |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Create ConfigValidator core + manifest + unit tests
     What to do / Must NOT do:
  - Create `apps/backend/src/shared/common/config/config-validator.ts`
  - Export `ConfigValidationError` class extending `Error` with a `details` array of all missing var names
  - The manifest data structure: define a `ConfigVarManifest` as an array of records:
    ```ts
    type ValidationCategory =
      | 'required'
      | 'required-if'
      | 'optional'
      | 'format';
    interface ConfigVarDef {
      envVar: string;
      configPath: string; // dot-path in AppConfig (e.g. 'alchemy.apiKey')
      category: ValidationCategory;
      condition?: () => boolean; // for 'required-if' — true = required
      format?: (value: unknown) => string | null; // null = valid, string = error msg
      description: string;
    }
    ```
  - Export `validateAppConfig(appCfg: AppConfig): { warnings: string[] }`
    - Iterates manifest, collects ALL errors, throws `ConfigValidationError` if any required/required-if/format errors
    - Returns warnings array for optional missing vars (never throws for these)
    - Each error message includes the env var name AND its purpose (from description)
  - Tier 1 (required): all API keys, Telegram tokens, MTProto creds — block if `''` or `0`
  - Tier 2 (required-if): DB vars block only when `DATABASE_ENABLED` is true; Redis vars block only when `REDIS_ENABLED` is true
  - Tier 3 (format): PORT ∈ [1,65535], NODE_ENV ∈ {development,production,test}, MTProto_API_ID must be positive integer, CHAIN_DEXTER_INGEST_MODE ∈ {webhook,polling}
  - Tier 4 (optional): seed channels, analytics, milestone, kolReputation, logging, uploadsRoot, WS URLs — warn if empty
  - Do NOT import any NestJS decorators or modules
  - Do NOT validate `FLUXRPC_RPC` as blocking (REST can work without RPC URL)
  - Test file: `apps/backend/src/shared/common/config/__tests__/config-validator.spec.ts`
  - Test cases:
    - All required vars present with values → returns `{ warnings: [] }`
    - No warnings for vars with defaults that are empty
    - One missing required → throws with specific var name in message
    - Three missing required → throws listing ALL three, not first only
    - DATABASE_ENABLED=true + missing POSTGRES_HOST → throws
    - DATABASE_ENABLED=false + missing POSTGRES_HOST → warns (no throw)
    - REDIS_ENABLED=true + missing REDIS_HOST → throws
    - PORT="abc" → format error
    - NODE_ENV="staging" → format error
    - All valid → no errors
  - Parallelization: Wave 1 | Blocked by: — | Blocks: Todo 3
  - References (executor has NO interview context — be exhaustive):
    - `apps/backend/src/shared/common/config/app.config.ts:101-230` — AppConfig interface shape
    - `apps/backend/src/shared/common/config/app.config.ts:305-536` — full env var read logic (the `??` values to replicate in manifest)
    - `apps/backend/src/shared/README.md:1-136` — shared/ conventions
    - `apps/backend/src/shared/common/config/__tests__/` — co-located test pattern (create new dir)
    - `apps/backend/src/telegram/chain-dexter-bot/bot.config.ts:88-110` — existing validate() warn pattern for precedent
    - `apps/backend/src/shared/kernel/domain-error.ts:7-43` — ErrorCode/DomainError pattern (can reuse for typed errors)
  - Acceptance criteria (agent-executable):
    - `cd apps/backend && npx jest --testPathPattern='config-validator' --no-coverage` passes all tests
    - `cd apps/backend && npx tsc --noEmit` — no type errors
  - QA scenarios:
    - Happy: `Task<subagent_type="test" prompt="Run config-validator spec suite: cd apps/backend && npx jest --testPathPattern='config-validator' --no-coverage">` — all pass
    - Failure: Introduce a missing-required scenario in test that expects throw — verify the error lists ALL missing vars
    - Edge: Test `NODE_ENV=staging` is rejected; `PORT=0` is rejected; `PORT=65536` is rejected
    - Evidence: `.omo/evidence/task-1-startup-config-validator.test.log` and `.omo/evidence/task-1-startup-config-validator.tslint.log`
  - Commit: Y | `feat(backend): add startup config validator with blocking tier and conditional checks`

- [ ] 2. Create ConfigConnectivityService + tests
     What to do / Must NOT do:
  - Create `apps/backend/src/shared/common/config/config-connectivity.service.ts`
  - Export `ConfigConnectivityService` class:
    - `@Injectable()` decorator (NestJS service)
    - Implements `OnApplicationBootstrap`
    - Inject `ConfigService`
    - In `onApplicationBootstrap()`:
      - Check `app.database.enabled`: if true, try `pg.Client` connect to `app.database.*` and `SELECT 1` → `this.logger.warn('Postgres unreachable: ...')` on error (catch all)
      - Check `app.redis.enabled`: if true, try `new Redis(app.redis.*).ping()` → warn on error (catch all)
      - Check `app.telegram.botToken`: if not empty, try `fetch('https://api.telegram.org/bot<token>/getMe')` → warn on error (catch all)
    - Must catch ALL errors — connectivity failure never crashes the app
    - Must log via `Logger(ConfigConnectivityService.name)`
  - Do NOT make blocking — warn only
  - Do NOT use the services that would be initialized later — use raw `pg.Client`, `Redis` from `ioredis`, and `fetch` directly
  - Test file: `apps/backend/src/shared/common/config/__tests__/config-connectivity.service.spec.ts`
  - Tests (mock pg, ioredis, fetch):
    - DB ping succeeds → no warning
    - DB ping fails → warning logged
    - Redis ping succeeds → no warning
    - Redis ping fails → warning logged
    - Telegram getMe fails → warning logged
    - All services disabled → no warnings
    - Service throws unexpected error → caught, warning logged, app not crashed
  - Parallelization: Wave 1 | Blocked by: — | Blocks: Todo 4
  - References:
    - `apps/backend/src/shared/common/config/app.config.ts:101-230` — AppConfig interface
    - `apps/backend/src/shared/common/persistence/database.module.ts:84-86` — isDatabaseEnabled() pattern
    - `apps/backend/src/shared/common/config/__tests__/` — co-located test dir
    - `apps/backend/src/health/health.controller.ts` — existing health check for reference
    - NestJS `OnApplicationBootstrap` docs (lifecycle hook)
    - `pg` client usage via TypeORM's internal dep (use `import { Client } from 'pg'` if available, or plain TCP connect)
    - `ioredis` — `import Redis from 'ioredis'`
  - Acceptance criteria:
    - `cd apps/backend && npx jest --testPathPattern='config-connectivity' --no-coverage` passes all tests
    - `cd apps/backend && npx tsc --noEmit` — no type errors
  - QA scenarios:
    - Happy: Mock all clients to succeed → no warnings logged
    - Failure: Mock pg to throw → verify warning logged with connection error message
    - Edge: Mock each client independently failing while others succeed
    - Evidence: `.omo/evidence/task-2-startup-config-validator.test.log`
  - Commit: Y | `feat(backend): add OnApplicationBootstrap connectivity checker for DB, Redis, Telegram`

- [ ] 3. Wire ConfigValidator in main.ts
     What to do / Must NOT do:
  - Edit `apps/backend/src/main.ts` to add config validation call
  - Import `ConfigValidator` and `ConfigValidationError` (or just `validateAppConfig}`) from the new module
  - Import the `AppConfig` type (already imported at line 12)
  - After the dotenv loading loop (line 22, after the `}` closing the `for`), and BEFORE `async function bootstrap()` (line 50), add:

    ```ts
    // Pre-boot config validation: fail fast on missing critical env vars
    import { appConfig } from 'shared/common/config/app.config';
    import {
      validateAppConfig,
      ConfigValidationError,
    } from 'shared/common/config/config-validator';

    // (place after dotenv loading, before bootstrap)
    const appCfg = (appConfig as () => AppConfig)();
    try {
      const { warnings } = validateAppConfig(appCfg);
      for (const w of warnings) {
        bootLogger.warn(`Config warning: ${w}`);
      }
    } catch (err) {
      if (err instanceof ConfigValidationError) {
        bootLogger.fatal(err.message);
        process.exit(1);
      }
      throw err;
    }
    ```

  - Do NOT modify the existing dotenv loading or other bootstrap logic
  - Do NOT add any NestJS DI for this step
  - Do NOT make the validator an `@Injectable()` — it stays a pure function
  - Parallelization: Wave 2 | Blocked by: Todo 1 | Blocks: —
  - References:
    - `apps/backend/src/main.ts:17-22` — dotenv load loop
    - `apps/backend/src/main.ts:50-89` — bootstrap function (must run AFTER validation)
    - `apps/backend/src/shared/common/config/config-validator.ts` — the module from Todo 1
  - Acceptance criteria:
    - `cd apps/backend && npx tsc --noEmit` — no type errors
    - With a required var unset in `.env.dev`, app exits with fatal error before NestFactory.create
    - The error message lists ALL missing vars, not just the first
  - QA scenarios:
    - Happy: `npm run dev:backend-only` with all env vars — starts normally, no config validation error
    - Failure: Temporarily remove `NODE_ENV` from `.env.dev` → app should exit with format error
    - Failure: Remove `TELEGRAM_BOT_TOKEN` → app exits with "TELEGRAM_BOT_TOKEN is required" + exit code 1
    - Restore vars after testing
    - Evidence: `.omo/evidence/task-3-startup-config-validator.manual.log`
  - Commit: Y (include with Todo 1 if same logical change, or separate commit) | `chore(backend): wire startup config validator in main.ts`

- [ ] 4. Wire ConfigConnectivityService in AppModule
     What to do / Must NOT do:
  - Edit `apps/backend/src/app.module.ts` to add `ConfigConnectivityService` as a provider
  - Add to the `providers:` array in `AppModule` (since it needs `ConfigService` injection)
  - Ensure it's registered as a singleton (default NestJS behavior for `@Injectable()`)
  - Do NOT create a new module — just add to existing `AppModule` providers
  - Do NOT import any new `@Module()` declarations
  - Do NOT make the connectivity check blocking
  - Parallelization: Wave 2 | Blocked by: Todo 2 | Blocks: —
  - References:
    - `apps/backend/src/app.module.ts` — AppModule class with providers array (scan for exact location)
    - `apps/backend/src/shared/common/config/config-connectivity.service.ts` — the service from Todo 2
  - Acceptance criteria:
    - `cd apps/backend && npx tsc --noEmit` — no type errors
    - App starts and `onApplicationBootstrap` runs (can verify via logs)
  - QA scenarios:
    - Happy: Run `npm run dev:backend-only` — app starts, no connectivity warnings if DB/Redis/Telegram are reachable
    - Edge: With Docker Postgres down and `DATABASE_ENABLED=true` — app starts but warning logged
    - Evidence: `.omo/evidence/task-4-startup-config-validator.manual.log`
  - Commit: N (include with Todo 2 if same logical change) | `chore(backend): wire ConfigConnectivityService in AppModule`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit — every todo marked complete, no scope leaks
- [ ] F2. Code quality review — `cd apps/backend && npm run lint` passes, no any-types, no slop
- [ ] F3. Real manual QA — run `npm run dev:backend-only` with complete .env (success) and with missing TELEGRAM_BOT_TOKEN (failure + clear error)
- [ ] F4. Scope fidelity — no changes to app.config.ts, no new deps, no blocking connectivity

## Commit strategy

Each commit follows conventional commits scoped to `backend`:

- `feat(backend): add startup config validator with blocking tier and conditional checks`
- `feat(backend): add OnApplicationBootstrap connectivity checker for DB, Redis, Telegram`
- Wires are folded into the respective feature commits (not separate commits)

## Success criteria

1. Running `npm run dev:backend-only` with a missing critical env var → `ConfigValidationError` printed with ALL missing vars → process exits with code 1
2. Running with all env vars → app starts normally, no config errors
3. `cd apps/backend && npm run test` — all existing + new tests pass
4. `cd apps/backend && npm run build` — no compilation errors
5. With DB down and `DATABASE_ENABLED=true` → app starts but warns "Postgres unreachable" (does not crash)
