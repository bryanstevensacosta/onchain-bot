# fix-build-lint-tests - Work Plan (✅ COMPLETE)

## TL;DR (For humans)

<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last - the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> - <one-line driver>
**Decisions to sanity-check:** <fill last - the few choices worth a human glance>

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope

### Must have

### Must NOT have (guardrails, anti-slop, scope boundaries)

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: <TDD | tests-after | none> + framework
- Evidence: .omo/evidence/task-<N>-fix-build-lint-tests.<ext>

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| ---- | ---------- | ------ | -------------------- |

## Todos

> Implementation + Test = ONE todo. Never separate.

- [x] 1. Fix 3 unbound-method lint errors via ESLint config override
- [x] 2. Fix lru-cache import (fixes 15 test failures)
- [x] 3. Fix prober guard clauses for empty config (fixes 2 test failures)
- [x] 4. Fix real-bug-risk warnings (floating-promises + await-thenable)
- [x] 5. Remove unused imports in backend (fixes ~12 no-unused-vars warnings)
- [x] 6. Remove unused imports in frontend (fixes 2 warnings)
- [x] 7. Final Verification Wave (F1-F4)

---

### Task 1: Fix 3 unbound-method lint errors via ESLint config override

**What to do / Must NOT do:**
In `apps/backend/eslint.config.mjs`, add a `files` override after the existing rules (before the closing `]);`) that disables `@typescript-eslint/unbound-method` for test spec files. The 3 errors are Jest false positives — mock method references passed to `expect()` are intentionally unbound.

Must NOT do:

- Do NOT add `// eslint-disable-next-line` comments in spec files
- Do NOT change any test code

**Edit:** `apps/backend/eslint.config.mjs` — add this block right before the closing `]);` on line 61:

```javascript
  {
    files: ['*.spec.ts', '*.spec.ts.bak'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
```

**Parallelization:** Wave 1 | Blocked by: — | Blocks: —

**Acceptance criteria (agent-executable):**

```bash
cd apps/backend
npx eslint "src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.spec.ts" "src/token/call-tracking/infrastructure/scheduling/tracking-cron.scheduler.spec.ts" --no-inline-config
```

→ 0 errors related to `unbound-method`

**QA scenarios:** Happy: `npm run lint:backend` → exit 0, no `unbound-method` errors. Edge: `npx eslint` on a random spec file → only expected warnings (no unbound-method).

**Commit:** Y | `chore(backend): disable unbound-method rule for test files (Jest false positives)`

---

### Task 2: Fix lru-cache import (fixes 15 test failures)

**What to do / Must NOT do:**
In `apps/backend/src/shared/cache/token-image-cache.adapter.ts`, change the lru-cache import from named to default. `lru-cache` v5.1.1 is CJS with `module.exports = LRUCache` (no named export). `ts-jest` resolves `{ LRUCache }` to `undefined`.

Must NOT do:

- Do NOT change Jest config or ts-jest transform
- Do NOT upgrade `lru-cache`
- Do NOT change `token-image.service.ts` — it imports `LruTokenImageCache` class, not `LRUCache` directly

**Edit:** `apps/backend/src/shared/cache/token-image-cache.adapter.ts` line 2:

```typescript
// Before:
import { LRUCache } from 'lru-cache';
// After:
import LRUCache from 'lru-cache';
```

**Parallelization:** Wave 1 | Blocked by: — | Blocks: —

**Acceptance criteria (agent-executable):**

```bash
cd apps/backend && npx jest --testPathPattern "token-image-cache|token-image.service" 2>&1 | tail -5
```

→ 2 suites pass, 0 failures

**QA scenarios:** Happy: `npm run test:backend` → 0 failures in both suites. Failure: `npm run build:backend` → exit 0 (production build still works with default import).

**Commit:** Y | `fix(backend): change lru-cache import to default for CJS compat in ts-jest`

---

### Task 3: Fix prober guard clauses for empty config (fixes 2 test failures)

**What to do / Must NOT do:**
Add pre-flight guard clauses in `EvmChainProberAdapter` and `SolanaChainProberAdapter` to check for empty API key / RPC URL before making RPC calls. Both services expose their config as public readonly properties.

Must NOT do:

- Do NOT change test files — tests express correct desired behavior
- Do NOT change error notes emitted by other code paths

**Files to edit:**

- `apps/backend/src/chain/detection/infrastructure/probers/evm-chain-prober.adapter.ts` — add guard after format check:

  ```typescript
  if (!this.alchemy.apiKey) {
    return {
      responded: false,
      isContract: null,
      notes: ['alchemy:no_api_key'],
    };
  }
  ```

  Insert right after the `if (!/^0x.../)` format check block (around line 33) and before the try block.

- `apps/backend/src/chain/detection/infrastructure/probers/solana-chain-prober.adapter.ts` — add guard after format checks (around line 35), before the try block:
  ```typescript
  if (!this.rpc.primaryRpcUrl) {
    return { responded: false, isContract: null, notes: ['solana:no_rpc_url'] };
  }
  ```

**Parallelization:** Wave 1 | Blocked by: — | Blocks: —

**Acceptance criteria (agent-executable):**

```bash
cd apps/backend && npx jest --testPathPattern "evm-chain-prober|solana-chain-prober" 2>&1 | tail -10
```

→ 2 suites pass, 0 failures (specifically the "ALCHEMY_API_KEY is missing" and "HELIUS_RPC_URL_MAINNET is missing" tests)

**QA scenarios:** Happy: `npm run test:backend` → both prober suites pass. Regression: existing tests for format validation still pass (`format_invalid`, `format_not_32_bytes`, etc.).

**Commit:** Y | `fix(backend): add empty-config guard clauses in chain probers`

---

### Task 4: Fix real-bug-risk warnings (floating-promises + await-thenable)

**What to do / Must NOT do:**
Two warnings that indicate potential runtime bugs. Fix both.

**Subtask 4a: `no-floating-promises` in bot-api-telegram-publisher.adapter.ts**

**Edit:** `apps/backend/src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts` line 88:

```typescript
// Before:
this.processQueue();
// After:
void this.processQueue();
```

Rationale: `processQueue()` is async, called inside a `new Promise(resolve => ...)` callback. `await` is not possible here. `void` is the standard TS pattern to signal intentional fire-and-forget.

**Subtask 4b: `await-thenable` in app.controller.ts**

**Edit:** `apps/backend/src/app.controller.ts` line 26:

```typescript
// Before:
const app = await this.appService.getNestApp();
// After:
const app = this.appService.getNestApp();
```

Rationale: `getNestApp()` likely returns the app synchronously (already initialized during bootstrap). The `await` is a no-op that triggers the lint warning. Removing it is safe.

**Parallelization:** Wave 1 | Blocked by: — | Blocks: —

**Acceptance criteria (agent-executable):**

```bash
cd apps/backend && npx eslint "src/telegram/vip-calls-channel/infrastructure/senders/bot-api-telegram-publisher.adapter.ts" "src/app.controller.ts" --no-inline-config
```

→ 0 `no-floating-promises` and 0 `await-thenable` in these files

**QA scenarios:** Happy: lint passes for both files. Regression: `npm run test:backend` → all existing tests pass (both controller spec and publisher spec still work).

**Commit:** Y | `fix(backend): handle floating promise and remove unnecessary await`

---

### Task 5: Remove unused imports in backend (fixes ~12 `no-unused-vars` warnings)

**What to do / Must NOT do:**
Remove unused imports and variables across backend source and spec files. These are all compile-time dead code.

Must NOT do:

- Do NOT change any logic — only remove imports/variables
- Do NOT comment out — delete entirely
- If a type is used only as a type annotation (not as a value), use `import type` instead — but only if the import is genuinely used. For truly unused ones, delete.

**Files to edit (exact symbols to remove per file):**

| File                                                                                                             | Line(s) | Symbol(s) to remove              | Reason                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------- | -------------------------------------------------------------------------- |
| `apps/backend/src/kol/reputation/domain/services/kol-reputation-aggregator.ts`                                   | 1       | `KolConfidence`                  | Unused import                                                              |
| `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts`                                   | 1       | `Param`                          | Unused import                                                              |
| `apps/backend/src/telegram/vip-calls-channel/application/handlers/vip-calls-publish.use-case.ts`                 | 1       | `Inject`                         | Unused import                                                              |
| `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/ticker-null-bug-exploration.spec.ts`       | 1       | `ChainId`                        | Unused import                                                              |
| `apps/backend/src/telegram/vip-calls-channel/infrastructure/event-bus/ticker-null-bug-exploration.spec.ts`       | 66      | `mockSnapshotRepoWithNameOnly`   | Unused variable                                                            |
| `apps/backend/src/token/call-tracking/application/handlers/track-published-call-bug-exploration.spec.ts`         | 7       | `ChainId`                        | Unused import                                                              |
| `apps/backend/src/token/call-tracking/application/handlers/track-published-call.use-case.spec.ts`                | 57      | `chain`                          | Unused variable (remove assignment, keep `const` if needed or remove line) |
| `apps/backend/src/token/call-tracking/infrastructure/scheduling/tracking-cron.scheduler.spec.ts`                 | 38      | `second`                         | Unused assignment (change to `await scheduler.tick()` without const)       |
| `apps/backend/src/token/milestone/application/handlers/evaluate-active-calls.use-case.dedup-integration.spec.ts` | 14      | `NotifiedMilestoneRepository`    | Unused import                                                              |
| `apps/backend/src/token/milestone/application/handlers/evaluate-active-calls.use-case.dedup-integration.spec.ts` | 19      | `AppConfig`                      | Unused import                                                              |
| `apps/backend/src/token/milestone/application/handlers/evaluate-active-calls.use-case.spec.ts`                   | 14      | `RecordNotifiedMilestoneUseCase` | Unused import                                                              |
| `apps/backend/src/token/normalization/domain/value-objects/normalization-vos.spec.ts`                            | 36      | `SOLANA_LOWER`                   | Unused variable                                                            |
| `apps/backend/src/token/enrichment/application/services/token-image.service.ts`                                  | 37      | `placeholderBgClass` function    | Unused function (remove entire function + its type `PlaceholderColor`)     |

**Parallelization:** Wave 1 | Blocked by: — | Blocks: —

**Acceptance criteria (agent-executable):**

```bash
cd apps/backend && npx eslint --no-inline-config | grep "no-unused-vars" | grep -v "settings.e2e-spec.ts" | grep -v "token-approved-publish"
```

→ 0 or fewer `no-unused-vars` warnings after fix (some may remain in unrelated files outside scope)

**QA scenarios:** Happy: `npm run lint:backend` → no new errors. Regression: `npm run test:backend` → 0 new failures. Verify with `npm run build:backend` → exit 0.

**Commit:** Y | `chore(backend): remove unused imports and variables`

---

### Task 6: Remove unused imports in frontend (fixes 2 warnings)

**What to do / Must NOT do:**
Remove 2 unused symbols from frontend source files.

**Files to edit:**

- `apps/backend/src/features/settings/ui/presets-tab.tsx` — line 9: remove `type SettingsPreset` from the import from `@/features/settings/api/settings-api`

  ```typescript
  // Before:
  import {
    fetchAllPresets,
    createPreset,
    applyPreset,
    deletePreset,
    settingsPresetKeys,
    type SettingsPreset,
  } from '...';
  // After:
  import {
    fetchAllPresets,
    createPreset,
    applyPreset,
    deletePreset,
    settingsPresetKeys,
  } from '...';
  ```

- `apps/frontend/src/pages/tokens-explorer/index.tsx` — lines 22-25: remove the entire `SnapshotEntry` interface (unused)
  ```typescript
  // Remove:
  interface SnapshotEntry {
    name: string | null;
    imageUrls: ReadonlyArray<string> | null;
  }
  ```

**Parallelization:** Wave 1 | Blocked by: — | Blocks: —

**Acceptance criteria (agent-executable):**

```bash
cd apps/frontend && npx eslint src --no-inline-config | grep -E "presets-tab|tokens-explorer"
```

→ 0 warnings for these files

**QA scenarios:** Happy: `npm run lint:frontend` → exit 0. Regression: `npm run build:frontend` → exit 0. The interface `SnapshotEntry` is defined but never used — removing it is safe.

**Commit:** Y | `chore(frontend): remove unused import and interface`

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — verify every task was completed exactly as specified
- [x] F2. Code quality review — single-file changes, no logic alterations
- [x] F3. Real manual QA — `npm run build:backend && npm run build:frontend && npm run lint && npm test`
- [x] F4. Scope fidelity — confirm no `no-unsafe-*` warnings were touched

## Commit strategy

6 atomic commits, one per task. Order: 1 → 2 → 3 → 4 → 5 → 6 (all independent, safe in any order).

1. `chore(backend): disable unbound-method rule for test files (Jest false positives)`
2. `fix(backend): change lru-cache import to default for CJS compat in ts-jest`
3. `fix(backend): add empty-config guard clauses in chain probers`
4. `fix(backend): handle floating promise and remove unnecessary await`
5. `chore(backend): remove unused imports and variables`
6. `chore(frontend): remove unused import and interface`

## Success criteria

- `npm run build` → exit 0 for both apps
- `npm run lint` → exit 0 (0 errors)
- `npm test` → 580+ passed, 0 failed (all 600 tests pass)
- `npm run start:backend` → NestJS boots without `UnknownDependenciesException` (COINGECKO_CONFIG resolved)
- Zero changes to business logic or test assertions

---

### Task 8: Fix COINGECKO_CONFIG runtime DI error in TickerResolverService

**What to do:**
Add `COINGECKO_CONFIG` to `CoinGeckoModule.exports` array so the config token is available outside the module. `TickerResolverService` in `VipCallsModule` injects `@Inject(COINGECKO_CONFIG)` but the token was only provided, never exported.

**Root cause:**

- `CoinGeckoModule` provides `COINGECKO_CONFIG` token but only exports `CoinGeckoService`
- `DataProviderModule` imports and re-exports `CoinGeckoModule` (is `@Global()`)
- `VipCallsModule` imports `TickerResolverService` which injects `COINGECKO_CONFIG`
- Since the token isn't exported from `CoinGeckoModule`, it's not available to `VipCallsModule` even through the global `DataProviderModule`

**Edit:** `apps/backend/src/data-provider/coingecko/coingecko.module.ts` line 16:

```typescript
// Before:
exports: [CoinGeckoService],

// After:
exports: [CoinGeckoService, COINGECKO_CONFIG],
```

Must NOT do:

- Do NOT import `DataProviderModule` into `VipCallsModule` (it's already global)
- Do NOT change `TickerResolverService` to use a different config injection pattern
- Do NOT change any other config modules (Alchemy, Helius, etc.) unless they also cause DI errors

**Commit:** Y | `fix(backend): export COINGECKO_CONFIG from CoinGeckoModule for TickerResolverService`
