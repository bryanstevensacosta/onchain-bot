# fix-lint-errors - Work Plan

## TL;DR (For humans)

**What you'll get:** Build, tests y lint del backend y frontend quedarán completamente limpios — 0 errores y 0 warnings de ESLint en el backend (el frontend ya está limpio). Se corrigen 1 error + 89 warnings de lint en 23 archivos, excluyendo 5 archivos bug-exploration que están congelados por política del proyecto.

**Why this approach:** Tipar correctamente los mocks en tests (no `eslint-disable`) para mejorar la calidad. Los archivos `bug-exploration.spec.ts` se excluyen por AGENTS.md. El `require()` se reemplaza con `await import()` dinámico para preservar la solución documentada al Jest CJS subpath issue. `token-snapshot.mapper.ts` se agrupa en Wave 1 (es un mapper de producción, no un test).

**What it will NOT do:** No modificará archivos `*-bug-exploration.spec.ts` ni `*-preservation.spec.ts` (5 archivos). No cambiará la lógica de negocio. No tocará el frontend ni la configuración de ESLint. No hará refactor fuera del scope de tipos.

**Effort:** Medium (~23 files, 90 issues)
**Risk:** Low — todos los cambios son de tipos/lint, no de lógica. Los 85 suites de Jest y 10 archivos de Vitest validan que nada se rompa.

**Decisions to sanity-check:** Confirmar que los tipos elegidos para mocks reflejan fielmente las interfaces reales (no `any` sueltos). El default para el `require()` es dynamic import, no static import.

---

> TL;DR (machine): Medium effort, low risk. Fix 1 error + 89 lint warnings across 23 backend files by adding proper types. Exclude 5 bug-exploration files. All 90+ tests must still pass. Plan revised after Momus high-accuracy review.

## Scope
### Must have
- Fix 1 ESLint error: `require()` → `await import()` dynamic import in `ingestion-coordinator.service.spec.ts:19`
- Fix ~16 PROD lint warnings: add proper types to **7** production source files (incl. `token-snapshot.mapper.ts`)
- Fix ~73 TEST lint warnings: replace `as any` / `any[]` with real types in **15** test files
- All 85 backend + 10 frontend test suites must pass after changes
- `npm run lint:backend` must exit with 0 errors and 0 warnings
- `npm run lint:frontend` must exit with 0 errors and 0 warnings (already passes)
- All 4 builds (backend + frontend) must pass

### Must NOT have (guardrails, anti-slop, scope boundaries)
- **NO** modifications to these 5 files (AGENTS.md policy):
  - `telegram/vip-calls/vip-channel/infrastructure/event-bus/ticker-null-bug-exploration.spec.ts`
  - `telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-bug-exploration.spec.ts`
  - `telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-preservation.spec.ts`
  - `telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-ticker-bug-exploration.spec.ts`
  - `token/call-tracking/application/handlers/track-published-call-preservation.spec.ts`
- **NO** changes to ESLint config (`apps/backend/eslint.config.mjs` or `apps/frontend/eslint.config.js`)
- **NO** changes to frontend code (already clean)
- **NO** behavioral changes — only type annotations, import style, and removing dead imports
- **NO** deleting or refactoring tests — only adding types to existing code
- **NO** adding `// eslint-disable-next-line` as a default solution (only acceptable when no other fix is feasible, and must include a justification comment)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after (existing tests validate behavior; we verify they still pass)
- Framework: Jest (backend) + Vitest (frontend)
- Evidence: `.omo/evidence/task-<N>-fix-lint-errors.txt`
- Every todo MUST run **targeted** `npx eslint "src/.../file.ts"` on its affected files AND `npm run test:backend -- --testPathPattern="<file-pattern>"` to confirm no breakage
- Final wave: full `npm run lint:backend` + `npm run lint:frontend` + `npm run test:backend` + `npm run test:frontend` + `npm run build:backend` + `npm run build:frontend`

## Execution strategy
### Parallel execution waves

**Wave 1 — ERROR + 7 Production files (all parallel):**
- All independent — no file shares types with another
- Includes `token-snapshot.mapper.ts` (PROD, not test — moved from Wave 2)

**Wave 2 — 15 Test files in 4 batches by module (all parallel):**
- 15 test files grouped by bounded context (telegram/settings, vip-calls, achievement, call-tracking/classification)
- Each batch is self-contained

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1-8 (Wave 1) | None | None | All Wave 1 todos |
| 9-12 (Wave 2) | None | None | All Wave 2 todos (and all Wave 1) |

## Todos
> Implementation + Test = ONE todo. Never separate.

### Wave 1 — ERROR + Production files (all parallel)

- [ ] 1. Fix `require()` error in `ingestion-coordinator.service.spec.ts:19`
  What to do / Must NOT do: Replace `const { IngestionCoordinator } = require('telegram/ingestion/shared/application/ingestion-coordinator.service')` with a dynamic import. The require() is **intentional and documented** at `apps/backend/src/telegram/ingestion/shared/application/__tests__/ingestion-coordinator.service.spec.ts:1-4` (TelegramMtprotoListenerAdapter → telegram/extensions/Logger CJS subpath not mapped by Jest).
  **The fix is dynamic import, not static import.** Options:
    1. **Preferred**: keep the `const { IngestionCoordinator } = ... as { ... }` destructuring at module top-level but change `require` to a dynamic import at test-runtime by hoisting the entire destructure block into a `beforeAll(async () => { const { IngestionCoordinator } = await import('...'); ... })` and exporting a getter from a module-level `let` binding.
    2. **Acceptable fallback**: add `// eslint-disable-next-line @typescript-eslint/no-require-imports` with a justification comment explaining the Jest CJS subpath workaround (same comment as the existing header).
    3. **NOT acceptable**: static `import { IngestionCoordinator } from 'telegram/ingestion/shared/application/ingestion-coordinator.service'` — this re-triggers the Jest CJS mapping error at module-load time.
  Do NOT change any test logic, mock data, or test assertions.
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/telegram/ingestion/shared/application/__tests__/ingestion-coordinator.service.spec.ts:1-23`
  Acceptance criteria: `cd apps/backend && npx eslint "src/telegram/ingestion/shared/application/__tests__/ingestion-coordinator.service.spec.ts" 2>&1 | grep -c "error"` must return 0; `cd apps/backend && npm test -- --testPathPattern="ingestion-coordinator" 2>&1 | grep -E "(PASS|FAIL)"` must show PASS
  QA scenarios: happy — use `await import()` in `beforeAll` + module-level `let` binding; failure — if dynamic import still triggers Jest issues, add `// eslint-disable-next-line` with comment reproducing the WHY header
  Commit: Y | `fix(telegram): replace require() with dynamic import in ingestion-coordinator spec`

- [ ] 2. Fix type warnings in `kol-metrics-calculator.ts:64-65` (2 warns)
  What to do / Must NOT do: Lines 64-65 access `.kolId` and `.mentionCount` on `source` in a `for (const source of call.sources)` loop. ESLint warns because the `Array.isArray()` guard at line 62 narrows the union, but the type-narrow doesn't propagate through the `for...of`. The interface `KolMetricsCanonicalCallSource` is defined inline at lines 3-6 with `kolId: string | number` and `mentionCount?: number`.
  Fix: cast `call.sources` at the for-of to `ReadonlyArray<KolMetricsCanonicalCallSource>`: `for (const source of call.sources as ReadonlyArray<KolMetricsCanonicalCallSource>)`. This is the cleanest fix; do NOT refactor the interface to a separate file. Do NOT change calculation logic.
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/kol/reputation/domain/services/kol-metrics-calculator.ts:3-6, 11, 61-66`
  Acceptance criteria: `cd apps/backend && npx eslint "src/kol/reputation/domain/services/kol-metrics-calculator.ts" 2>&1 | grep -c "warning"` must return 0; `cd apps/backend && npm test -- --testPathPattern="kol-reputation-calculator" 2>&1 | grep "Tests:"` must show >=11 tests passing
  QA scenarios: happy — add `as ReadonlyArray<KolMetricsCanonicalCallSource>` cast; failure — verify no test regression in 11 reputation specs
  Commit: Y | `fix(kol): add explicit type cast in kol-metrics-calculator`

- [ ] 3. Fix type warnings in `kol-reputation-aggregator.ts:48-49` (2 warns)
  What to do / Must NOT do: Same pattern as todo 2. Fix: same cast pattern. Do NOT change aggregation logic.
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/kol/reputation/domain/services/kol-reputation-aggregator.ts:44-49`
  Acceptance criteria: `cd apps/backend && npx eslint "src/kol/reputation/domain/services/kol-reputation-aggregator.ts" 2>&1 | grep -c "warning"` must return 0
  QA scenarios: happy — fix, run lint + test; failure — verify `kol-reputation-calculator.spec.ts` still passes
  Commit: Y | `fix(kol): add explicit type cast in kol-reputation-aggregator`

- [ ] 4. Fix type warnings in `redis.service.ts:40, 49` (1 warn at 49, fix both call sites)
  What to do / Must NOT do: Line 49 is `this.client.connect().catch((err) => { this.logger.error(\`Initial connection failed: ${err.message}\`); })`. ESLint warns that `err` is `any` in the `.catch()` callback.
  Fix: type the callback parameter as `Error`: `this.client.connect().catch((err: Error) => { ... })`. Note: this is a type annotation only; if the rejected value is not an `Error` instance at runtime, `err.message` will be `undefined` (unchanged from current behavior).
  Also apply the same fix to the `'error'` event handler at line 40: `this.client.on('error', (err: Error) => { ... })`.
  Do NOT change connection logic. Do NOT add a runtime `instanceof Error` check (out of scope).
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/shared/common/cache/redis.service.ts:40-49`
  Acceptance criteria: `cd apps/backend && npx eslint "src/shared/common/cache/redis.service.ts" 2>&1 | grep -c "warning"` must return 0
  QA scenarios: happy — annotate both call sites; failure — `cd apps/backend && npm test` must still pass all suites
  Commit: Y | `fix(shared): type error callback parameter in redis.service.ts`

- [ ] 5. Fix type warnings in migration `1782270612825-add-presets-and-descriptions.ts:30,34,35,55` (4 warns)
  What to do / Must NOT do: TypeORM's `queryRunner.query()` returns `Promise<any>` for raw SQL. The migration destructures results into typed locals.
  Fix: cast the result of each `queryRunner.query()` call to the actual row shape. Pattern:
  - Line 30: `const existing: Array<{ exists: number }> = await queryRunner.query(\`SELECT 1 FROM settings_presets WHERE name = $1 LIMIT 1\`, ['Default']);`
  - Line 35: `const signalsRows: Array<{ code: string; penalty: number; risk_level: string; enabled: boolean }> = await queryRunner.query(\`SELECT code, penalty, risk_level, enabled FROM signals\`);`
  - Line 55: `const thresholdsRows: Array<{ scope: string; min_score: number; max_score: number; decision: string }> = await queryRunner.query(\`SELECT scope, min_score, max_score, decision FROM scoring_thresholds\`);`

  These casts are pure type annotations (no runtime effect). Do NOT change the SQL queries. Do NOT change the destructuring patterns.
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/shared/common/persistence/migrations/1782270612825-add-presets-and-descriptions.ts:30-68`
  Acceptance criteria: `cd apps/backend && npx eslint "src/shared/common/persistence/migrations/1782270612825-add-presets-and-descriptions.ts" 2>&1 | grep -c "warning"` must return 0
  QA scenarios: happy — add 3 type casts as shown; failure — verify migration logic (INSERT/SELECT) is intact
  Commit: Y | `fix(shared): type queryRunner results in add-presets migration`

- [ ] 6. Fix type warnings in `in-memory-published-call.repository.ts:12-13` (2 warns)
  What to do / Must NOT do: Lines 10-15: `if (this.store.size >= InMemoryPublishedCallRepository.MAX_ENTRIES) { const oldestKey = this.store.keys().next().value; if (oldestKey) this.store.delete(oldestKey); }`. ESLint warns that `oldestKey` is inferred as `any`.
  TypeScript actually types `Map<string, V>.keys().next().value` as `string | undefined`, but the type-narrowing for the empty-Map case is lost in `for...of` iteration contexts.
  Fix: type the variable explicitly: `const oldestKey: string | undefined = this.store.keys().next().value;`. The `if (oldestKey)` guard remains, and the runtime behavior is unchanged.
  Do NOT change repository logic (FIFO eviction at 500 entries).
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/repositories/in-memory-published-call.repository.ts:10-15`
  Acceptance criteria: `cd apps/backend && npx eslint "src/telegram/vip-calls/vip-channel/infrastructure/repositories/in-memory-published-call.repository.ts" 2>&1 | grep -c "warning"` must return 0
  QA scenarios: happy — add `: string | undefined` annotation; failure — `cd apps/backend && npm test` must pass all suites
  Commit: Y | `fix(telegram): type Map iterator in in-memory-published-call.repository`

- [ ] 7. Resolve unused import in `achievement.module.ts:3` (1 warn)
  What to do / Must NOT do: Line 3 imports `isDatabaseEnabled` from `shared/common/persistence/database.module`. The import is unused in `achievement.module.ts`.
  **Decision**:
  - **Preferred** (per `token/AGENTS.md`): add a TODO comment and keep the import — this matches the pattern in other modules (`classification`, `normalization`, etc.) that use `isDatabaseEnabled` for conditional TypeORM provider registration. Comment: `// TODO(achievement): wire isDatabaseEnabled() for conditional TypeORM provider registration (matches classification/normalization pattern)`. This makes the unfinished work visible and matches the project's coding intent.
  - **Acceptable fallback** (per Momus pass 1): just remove the import. Use this only if the import removal is verified safe by `npm test`.
  Do NOT add a new `isDatabaseEnabled()`-gated provider (out of scope; that's a feature add).
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/token/achievement/achievement.module.ts:3`; cross-reference `apps/backend/src/token/classification/classification.module.ts` and `apps/backend/src/token/normalization/normalization.module.ts` for the pattern
  Acceptance criteria: `cd apps/backend && npx eslint "src/token/achievement/achievement.module.ts" 2>&1 | grep -c "warning"` must return 0; `cd apps/backend && npm test` must pass all 85 suites
  QA scenarios: happy — add TODO comment + keep import (preferred); fallback — remove the import line; failure — `npm test` to verify no runtime break
  Commit: Y | `fix(token): mark isDatabaseEnabled import as TODO in achievement.module.ts` (or `fix(token): remove unused import in achievement.module.ts` if fallback)

- [ ] 8. Fix type warnings in `token-snapshot.mapper.ts:91-93` (4 warns) — **PROD, not test**
  What to do / Must NOT do: The file is a **PRODUCTION TypeORM mapper** at `apps/backend/src/token/enrichment/infrastructure/persistence/typeorm/mappers/token-snapshot.mapper.ts` (no `.spec.` suffix). Lines 90-94: `providerErrors: row.providerErrors ? row.providerErrors.map((e: any) => ({ provider: e.provider, message: e.message, })) : []`. The `(e: any)` parameter is the source of 4 warnings.
  Fix: type the callback parameter with the actual shape. The `row.providerErrors` is JSONB from Postgres, so the actual shape is `Array<{ provider: string; message: string }>` (matches `TokenSnapshotEntity.providerErrors` type). Replace `(e: any)` with `(e: { provider: string; message: string })`.
  Do NOT change the mapping logic (return value shape).
  Parallelization: Wave 1 | Blocked by: None | Blocks: None
  References: `apps/backend/src/token/enrichment/infrastructure/persistence/typeorm/mappers/token-snapshot.mapper.ts:90-95`; verify the actual `providerErrors` shape at the corresponding entity in `token/enrichment/infrastructure/persistence/typeorm/entities/`
  Acceptance criteria: `cd apps/backend && npx eslint "src/token/enrichment/infrastructure/persistence/typeorm/mappers/token-snapshot.mapper.ts" 2>&1 | grep -c "warning"` must return 0
  QA scenarios: happy — type the callback parameter; failure — `cd apps/backend && npm test` must pass
  Commit: Y | `fix(token): type providerErrors callback in token-snapshot.mapper`

### Wave 2 — Test files (all parallel)

- [ ] 9. Fix `settings/settings.e2e-spec.ts` (18 warns) + 3 crypto-news test files (3 warns)
  What to do / Must NOT do:
  - `settings/settings.e2e-spec.ts` (18 warns, lines 86-156): the test creates an `app` via `await Test.createTestingModule({...}).compile()` and the `app` is typed as `any` (default NestJS Test module). The actual return type is `INestApplication`. Fix: type the variable explicitly: `const app: INestApplication = ...` (import from `@nestjs/common`). The `unsafe-argument` warns at lines 86, 104, 113, 121, 129, 137, 145, 151, 155 are all about passing this `app` to functions. The `unsafe-member-access` warns at lines 108, 109, 122, 124, 125, 125, 133, 146, 156 are about `.name`, `.isActive`, `.id` access — typing `app` as `INestApplication` resolves most of these (the `.name`/`.isActive`/`.id` are on the **response body** or the returned object, not on `app` itself; if any remain after the `app` typing, the response body needs separate typing — e.g., `const body: Array<{ id: string; name: string; isActive: boolean }> = res.body;`).
  - `telegram/ingestion/crypto-news/domain/entities/__tests__/crypto-news-source.entity.spec.ts` (1 warn, line 1): `ErrorCode` imported but unused. Fix: remove the import.
  - `telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/__tests__/crypto-news-message.mapper.spec.ts` (1 warn, line 2): `CryptoNewsMessageEntity` imported but unused. Fix: remove the import.
  - `telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/__tests__/crypto-news-source.mapper.spec.ts` (1 warn, line 2): `CryptoNewsSourceEntity` imported but unused. Fix: remove the import.

  Do NOT change test logic, mock data, or assertions.
  Parallelization: Wave 2 | Blocked by: None | Blocks: None
  References:
  - `apps/backend/src/settings/settings.e2e-spec.ts:1-159` (full file, 159 lines)
  - `apps/backend/src/telegram/ingestion/crypto-news/domain/entities/__tests__/crypto-news-source.entity.spec.ts:1`
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/__tests__/crypto-news-message.mapper.spec.ts:2`
  - `apps/backend/src/telegram/ingestion/crypto-news/infrastructure/persistence/typeorm/mappers/__tests__/crypto-news-source.mapper.spec.ts:2`
  Acceptance criteria: all 4 files must show 0 warnings via `npx eslint "src/$f"` from `apps/backend`
  QA scenarios: happy — type `app: INestApplication`, remove unused imports; failure — if the response body access warnings remain after typing `app`, type the body explicitly
  Commit: Y | `fix(test): type app and remove unused imports in settings + crypto-news specs`

- [ ] 10. Fix VIP-calls test files (2 files, 22 warns total)
  What to do / Must NOT do:
  - `bot-api-telegram-publisher.adapter.spec.ts` (4 warns, lines 289, 290, 316, 317): The warnings are on `http.post.mock.calls[0]`, `firstCall[1].caption as string`, `http.post.mock.calls[0][0]`, `http.post.mock.calls[1][0]`. The mock is `http: { post: jest.Mock }` and `jest.Mock` returns `any` for `mock.calls`. **The previous plan's reference to `node-telegram-bot-api` and `Update[]` is WRONG — `node-telegram-bot-api` is NOT used in this codebase.** The actual fix: type the `http.post` mock with the proper signature. The `http.post` is the `@nestjs/axios` `HttpService.post()` which returns `Observable<AxiosResponse>`. Recommended fix: `const http: { post: jest.Mock<Observable<AxiosResponse<unknown>>, [{url: string; data: {caption: string; parse_mode: string; chat_id: string}}, unknown?]> } = ...;`. If full typing is too verbose, use `as jest.Mock<unknown, [unknown]>` for each call. Verify the actual call signature at `bot-api-telegram-publisher.adapter.ts` `httpService.post` invocation.
  - `vip-calls-publish.use-case.spec.ts` (18 warns, lines 128, 128, 190, 191, 194, 215, 218, 473, 473, 474, 475, 488, 488, 489, 490, 502, 502, 503): The warnings are on `formatter.format.mock.calls[0][0]` access — the result is `any`. **The previous plan's reference to `PublishedCall`/`PublishedCallMetrics` is WRONG** — the actual type is `ApprovedCallInput` (verified at `vip-calls-publish.use-case.ts:8`). Recommended fix: cast the result with `as ApprovedCallInput` (imported from `telegram/shared`). The 18 warnings split into: 4 `no-unsafe-assignment` (the `as ApprovedCallInput` cast itself) + 14 `no-unsafe-member-access` (`.sourceCount`, `.mentionCount`, `.ticker` on the result). The 4 unsafe-assignment warns DISAPPEAR if the cast is done with `as unknown as ApprovedCallInput` (two-step cast) OR by typing the mock with `formatter: { format: jest.Mock<unknown, [ApprovedCallInput]> }` so the calls are typed automatically. The 14 unsafe-member-access warns DISAPPEAR with the same mock typing because `.sourceCount` etc. become typed property access.

  Do NOT change test logic, mock data shapes, or assertions.
  Parallelization: Wave 2 | Blocked by: None | Blocks: None
  References:
  - `apps/backend/src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.spec.ts:289-317`
  - `apps/backend/src/telegram/vip-calls/vip-channel/application/handlers/vip-calls-publish.use-case.spec.ts:128-503` (full file, 506 lines)
  - Type reference: `apps/backend/src/telegram/shared/index.ts` (exports `ApprovedCallInput`)
  - Type reference: `apps/backend/src/telegram/vip-calls/vip-channel/application/handlers/vip-calls-publish.use-case.ts:6-13` (imports `ApprovedCallInput`)
  Acceptance criteria: `cd apps/backend && npx eslint "src/telegram/vip-calls/shared/infrastructure/senders/bot-api-telegram-publisher.adapter.spec.ts" "src/telegram/vip-calls/vip-channel/application/handlers/vip-calls-publish.use-case.spec.ts" 2>&1 | grep -c "warning"` must return 0
  QA scenarios: happy — type mocks; failure — if full typing is too complex, use targeted `as ApprovedCallInput` casts
  Commit: Y | `fix(test): type formatter and http.post mocks in vip-calls specs`

- [ ] 11. Fix Achievement test files (6 files, 22 warns total)
  What to do / Must NOT do:
  - `evaluate-active-calls.use-case.dedup-integration.spec.ts` (1 warn, line 154): `Map<any, any>` typed loosely. Fix: add explicit type args `new Map<string, number>()` to match the `FakeMarketData.m: Map<string, number>` field.
  - `evaluate-active-calls.use-case.spec.ts` (7 warns, lines 152, 170, 191, 213, 240, 260, 279): all `as any` being passed where `RecordNotifiedAchievementUseCase` is expected. Fix: change the mock variable type to `jest.Mocked<RecordNotifiedAchievementUseCase>` from `@nestjs/testing`, OR replace `as any` with `as unknown as RecordNotifiedAchievementUseCase`.
  - `record-notified-achievement.use-case.spec.ts` (9 warns, lines 79, 139-146): the 1 at line 79 is `event.payload` access on a domain event. The 8 at lines 139-146 are `event.payload` accesses in a `for` loop. Fix: type the event as the specific domain event type (e.g., `RegisterCallForAchievementsEvent` or `CallAchievementReachedEvent`) — these types are imported in the test file. If the events are constructed as plain objects, use a discriminated union.
  - `register-monitored-call.use-case.spec.ts` (2 warns, lines 9, 15): line 9 `ErrorCode` imported but unused → remove import. Line 15 `callId` arg unused → rename to `_callId` (or remove the unused arg).
  - `achievement-multiple.vo.spec.ts` (1 warn, line 13): `expect(actual).toThrow(...)` where `actual` is `any`. Fix: type `actual: AchievementMultiple = AchievementMultiple.create(...)` so the call signature is typed.
  - `redis-achievement-cache.adapter.spec.ts` (2 warns, line 167): array destructuring `[value, setCalls]` on `any[]` return. Fix: type the underlying mock return as `Array<[string, ...rest]>` or cast: `const [value, setCalls] = ... as [string, jest.Mock];`.

  Do NOT change test logic, assertions, or mock data shapes.
  Parallelization: Wave 2 | Blocked by: None | Blocks: None
  References: each file path listed above
  Acceptance criteria: all 6 files must show 0 warnings via `npx eslint` from `apps/backend`
  QA scenarios: happy — apply each fix; failure — verify all 85 backend suites still pass
  Commit: Y | `fix(test): type mocks in achievement test files`

- [ ] 12. Fix Call-Tracking + Classification test files (3 files, 8 warns)
  What to do / Must NOT do:
  - `track-published-call.use-case.spec.ts` (1 warn, line 56): `as any` on mock data. Fix: replace with the actual `TrackedPublishedCall` (or its `.create()` factory) type. Read the spec file to find the precise entity name.
  - `call-published-tracked.handler.spec.ts` (3 warns, lines 11, 41, 63): `executeMock as any` patterns. Fix: type `executeMock: jest.MockedFunction<CallTrackingPort['track']>` or use `jest.fn<ReturnType, ArgsType>().mockResolvedValue(...)`.
  - `token-enriched.handler.spec.ts` (4 warns, lines 49, 66, 76, 86): `execute.mock.calls[0][0] as Record<string, unknown>` then accessing `.chain`, `.address`, `.classification`, `.ticker` on the cast. Fix: type the mock with `execute: jest.Mock<unknown, [{chain: string; address: string; classification: string; ticker: string | null; ...}]>`. The 4 unsafe-member-access warns are on `.chain` etc.; the cast doesn't help because `Record<string, unknown>` makes all properties `unknown`. Solution: type the mock's argument with the actual handler input shape (find it at `token/enrichment/.../token-enriched.handler.ts` or the event class).

  Do NOT change test logic, assertions, or mock event payloads.
  Parallelization: Wave 2 | Blocked by: None | Blocks: None
  References: each file path listed above
  Acceptance criteria: all 3 files must show 0 warnings via `npx eslint` from `apps/backend`
  QA scenarios: happy — type mocks properly; failure — verify all 85 backend suites still pass
  Commit: Y | `fix(test): type mocks in call-tracking + classification specs`

### Excluded files (per project policy)
The following 5 files (60 warnings) are intentionally skipped per AGENTS.md ("Do not fix bug-exploration.spec.ts files — they encode future-fix invariants"):
- `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/ticker-null-bug-exploration.spec.ts` (8 warns)
- `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-bug-exploration.spec.ts` (25 warns)
- `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-preservation.spec.ts` (14 warns)
- `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-ticker-bug-exploration.spec.ts` (10 warns)
- `apps/backend/src/token/call-tracking/application/handlers/track-published-call-preservation.spec.ts` (3 warns)

> **Note on `preservation.spec.ts` files**: The AGENTS.md policy uses the filename pattern `bug-exploration.spec.ts`. The `-preservation.spec.ts` files are co-located with bug-exploration files in the same directories and document baseline behavior to preserve. Per Momus review and project convention, we exclude them too. If a future PR adds an explicit policy for preservation files, this exclusion can be revisited.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — verify no excluded (5) files were modified, all 23 in-scope files were modified
- [ ] F2. Lint verification — `npm run lint:backend` exits with 0 errors AND 0 warnings
- [ ] F3. Test verification — `npm run test:backend` (85 suites) + `npm run test:frontend` (10 files) all PASS
- [ ] F4. Build verification — `npm run build:backend` + `npm run build:frontend` both pass
- [ ] F5. Independent second-eyes review by Oracle subagent with the verification prompt: "Review the diff against the original plan. Verify no excluded files were touched, all todos' acceptance criteria were met, and no test was removed or refactored. Return OKAY or REJECT with cited issues." Both reviewer passes must return OKAY before declaring complete.

## Commit strategy
- Each todo produces its own commit with conventional commit format
- All commits on the current branch (no new branch unless the working tree is dirty)
- Commit messages follow `type(scope): message` pattern:
  - `fix(telegram):`, `fix(kol):`, `fix(shared):`, `fix(token):` for PROD fixes
  - `fix(test):` for test file fixes
- No fixup! or squash — each commit is self-contained
- Commit order: Wave 1 todos first (PROD + error), then Wave 2 (tests)

## Success criteria
1. `npm run lint:backend` exits 0 with 0 errors and 0 warnings
2. `npm run lint:frontend` exits 0 with 0 errors and 0 warnings
3. `npm run test:backend` — 85 suites, 660+ tests all PASS
4. `npm run test:frontend` — 10 files, 100+ tests all PASS
5. `npm run build:backend` — nest build succeeds
6. `npm run build:frontend` — tsc -b && vite build succeeds
7. None of the 5 excluded `*-bug-exploration.spec.ts` / `*-preservation.spec.ts` files were modified
8. Independent second-eyes review (F5) returns OKAY
9. No test logic was changed — only type annotations, import style, and unused imports
10. Each todo's `git diff` shows only type-level changes (no logic changes)