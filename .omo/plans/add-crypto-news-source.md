# add-crypto-news-source - Work Plan

## TL;DR (For humans)

**What you'll get:** A "Add Source" button on the Crypto News dashboard page that opens a modal asking for a Telegram channel ID. Submitting it registers the channel for crypto news ingestion (title/handle auto-resolved from Telegram) and the new source appears immediately in the source filter.

**Why this approach:** Mirrors the existing "Add KOL" button pattern exactly — same UX, same feature-folder layout, same TanStack Query invalidation flow. The backend's `RegisterNewsSourceUseCase` already exists; we add a thin POST endpoint that calls it, plus a tiny metadata resolver service (extracted from the seeder) so the modal only asks for a channel ID, not all three fields.

**What it will NOT do:** Will not auto-join channels that the bot isn't a member of (placeholder title is used, mirroring the seeder fallback). Will not change existing GET endpoints or the existing crypto-news page layout. Will not add channels with non-numeric IDs (validation matches the domain rule).

**Effort:** Short (4-6 hours)
**Risk:** Low - small surface area, well-defined pattern to follow, existing use case to call
**Decisions to sanity-check:** (1) Modal asks for ONLY channelId (matches add-kol UX, auto-resolves title/handle from Telegram). (2) Backend activates the source immediately after register (matches seeder, so channel starts ingesting right away). (3) Use `cryptoNewsKeys.all` invalidation (covers both sources list + messages list refresh).

Your next move: approve and `$start-work` to execute, or run a high-accuracy review first.

---

> TL;DR (machine): Short effort, Low risk. Add POST /crypto-news/sources + frontend Add Source modal mirroring Add KOL pattern.

## Scope

### Must have

- POST /crypto-news/sources endpoint that registers a CryptoNewsSource via RegisterNewsSourceUseCase and activates it
- CryptoNewsMetadataResolver service extracted from seeder for shared use
- Frontend `features/add-crypto-news-source/` (api + model + ui + index + 2 tests)
- ENDPOINTS.cryptoNews.sources.add entry
- Add Source button + modal wired into pages/crypto-news/index.tsx
- Backend controller unit test (6 cases) and frontend client + modal tests
- All existing tests still pass

### Must NOT have (guardrails, anti-slop, scope boundaries)

- No changes to existing GET endpoints
- No changes to entities/crypto-news barrel exports (no new types exported)
- No new shared UI primitives (Button + Modal reused as-is)
- No new route (button lives on existing /crypto-news page)
- No title/handle fields in modal (auto-resolved from Telegram, mirroring add-kol)
- No suppression of type errors (`as any`, `@ts-ignore`)
- No MSW handlers (project doesn't use MSW)
- No state libraries (zustand/redux) — TanStack Query only
- No data router/loaders — TanStack Query owns all server state

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after + framework (Vitest frontend, Jest backend) — mirrors existing project convention
- Evidence directory: .omo/evidence/task-<N>-add-crypto-news-source.<ext>
- Final E2E: manual smoke test with Playwright screenshots of `/crypto-news` page (button visible, modal opens, source added, error renders)

## Execution strategy

### Parallel execution waves

> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

**Wave 1 (sequential, 1 todo):** Todo 1 — Extract metadata resolver service. Foundation for everything else.

**Wave 2 (parallel, 3 todos):** Todos 2, 4, 5 — backend POST endpoint (after todo 1), frontend feature folder (independent), ENDPOINTS config (independent). All can run in parallel after Wave 1.

**Wave 3 (parallel, 3 todos):** Todos 3, 6, 7 — backend controller test (after todo 2), page wiring (after todos 4+5), frontend tests (after todo 4). All can run in parallel after Wave 2.

**Wave 4 (sequential, 1 todo):** Todo 8 — full E2E verification (build + lint + test + smoke test).

### Dependency matrix

| Todo                         | Depends on                                | Blocks             | Can parallelize with |
| ---------------------------- | ----------------------------------------- | ------------------ | -------------------- |
| 1. Metadata resolver service | nothing                                   | 2, 3               | (none — foundation)  |
| 2. POST endpoint             | 1                                         | 3                  | 4, 5                 |
| 3. Backend controller test   | 2                                         | 8                  | 4, 5                 |
| 4. Frontend feature folder   | nothing (only needs ENDPOINTS at runtime) | 6, 7               | 2, 3, 5              |
| 5. ENDPOINTS entry           | nothing                                   | 6                  | 2, 3, 4              |
| 6. Page wiring               | 4, 5                                      | 8                  | 3, 7                 |
| 7. Frontend tests            | 4                                         | 8                  | 3, 6                 |
| 8. E2E verification          | 3, 6, 7                                   | final verification | (none — final)       |

## Todos

> Implementation + Test = ONE todo. Never separate.

<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

### Wave 1: Backend foundation (sequential, blocking)

- [x] 1. Create `CryptoNewsMetadataResolver` service (extract from seeder)
     What to do:
  - Create new file `apps/backend/src/telegram/ingestion/crypto-news/application/services/crypto-news-metadata-resolver.service.ts`
  - Class `CryptoNewsMetadataResolver` — single public method `resolve(channelId: string): Promise<{ title: string; handle: string | null; needsManualJoin: boolean }>`
  - Move the body of `CryptoNewsSeeder.resolveMetadata()` (lines 125-160) into this class
  - Inject `TelegramListenerPort` and `Logger` via constructor
  - Update `CryptoNewsSeeder` to inject `CryptoNewsMetadataResolver` and replace its private `resolveMetadata()` with a delegation
  - Add `CryptoNewsMetadataResolver` to `CryptoNewsIngestionModule.providers` and exports
    Must NOT do:
  - Do NOT change the resolution semantics (same priority: seed > MTProto > fallback to channelId as title)
  - Do NOT change seeder behavior — it must produce identical results to before
  - Do NOT add a new env var or config flag
    Parallelization: Wave 1 (blocking) | Blocked by: nothing | Blocks: 2, 3
    References (executor has NO interview context - be exhaustive):
  - apps/backend/src/telegram/ingestion/crypto-news/infrastructure/seeders/crypto-news.seeder.ts:125-160 (source of resolveMetadata)
  - apps/backend/src/telegram/ingestion/shared/domain/ports/telegram-listener.port.ts (TelegramListenerPort.resolveChannelMetadata + joinChannel)
  - apps/backend/src/telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts:121 (existing provider registration pattern)
    Acceptance criteria:
  - File compiles cleanly (`npx tsc --noEmit` exits 0)
  - `CryptoNewsSeeder.seed()` still produces the same output for the same seed list
  - `resolve(channelId)` returns the same shape regardless of caller
  - Constructor injection works (NestJS resolves `TelegramListenerPort` via DI)
    QA scenarios:
  - Happy: existing crypto-news seeder spec still passes (`npm run test:backend -- --testPathPattern=crypto-news.seeder.spec`)
  - Failure: resolver handles `resolveChannelMetadata` throwing (fallback path) and `joinChannel` returning `joined: false` (fallback path)
  - Evidence: .omo/evidence/task-1-seeder-spec.log
    Commit: Y | refactor(crypto-news): extract metadata resolver from seeder
    ACTUAL: DoneClaim received — commit `a1a2f5d`, 4/4 seeder tests pass, lint/tsc clean. Design decision: seed override handling stays inline in seeder (caller-side short-circuit); property injection used to preserve test's 4-positional-arg constructor signature.

- [x] 2. Add `POST /crypto-news/sources` endpoint to `CryptoNewsController`
     What to do:
  - Modify `apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts`: - Import `Post`, `Body`, `HttpCode`, `HttpStatus` from `@nestjs/common` - Import `RegisterNewsSourceUseCase` from `../application/handlers/register-news-source.use-case` - Import `CryptoNewsSourceRepository` from `../application/ports/crypto-news-source.repository` (already injected) - Import `CryptoNewsMetadataResolver` from `../application/services/crypto-news-metadata-resolver.service` - Add `RegisterNewsSourceInput` import - Inject both new deps in constructor - Add `@Post('sources')` handler: - `@HttpCode(HttpStatus.CREATED)` (201) - Body: `{ channelId: string; handle?: string; title?: string }` (title optional — if absent, resolver fills it) - Resolve metadata: if `input.title` not provided OR empty, call `resolver.resolve(input.channelId)` to get `{ title, handle }`. If `input.title` is provided, prefer it (user override). - Call `registerSource.execute({ channelId, handle: input.handle ?? resolved.handle, title: input.title ?? resolved.title })` - Call `source.activate(); await sourceRepo.save(source);` to start ingestion (mirror seeder) - Map domain entity to `CryptoNewsSourceView` shape (same as `listSources`): `{ channelId, handle, title, isActive, lifecycleStatus, addedAt }` - Return the view
    Must NOT do:
  - Do NOT change the existing GET endpoints' behavior
  - Do NOT skip the `activate()` + `save()` after register (would leave source inactive)
  - Do NOT add a separate `id` field to the response (channelId IS the aggregate id)
  - Do NOT swallow the CONFLICT error — let `DomainErrorFilter` translate it to 409
    Parallelization: Wave 1 (blocking) | Blocked by: 1 | Blocks: 3, 5
    References:
  - apps/backend/src/telegram/ingestion/crypto-news/api/http/crypto-news.controller.ts:1-230 (full file)
  - apps/backend/src/telegram/ingestion/crypto-news/application/handlers/register-news-source.use-case.ts:7-47
  - apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity.ts:111-114 (activate method)
  - apps/backend/src/shared/filters/domain-error.filter.ts (CONFLICT → 409 mapping)
  - apps/backend/src/kol/identity/api/http/kol.controller.ts:39-42 (reference pattern for POST handler)
    Acceptance criteria:
  - `npx tsc --noEmit` exits 0
  - `@Post('sources')` handler exists with signature `(body: { channelId: string; handle?: string; title?: string }): Promise<CryptoNewsSourceView>`
  - Response body matches `CryptoNewsSourceView` shape exactly
  - Handler returns 201 on success (HttpStatus.CREATED)
  - Domain error CONFLICT propagates to 409 (verified via existing DomainErrorFilter)
    QA scenarios:
  - Happy: POST with valid channelId + title returns 201 + view, source is active in DB
  - Failure: POST with duplicate channelId returns 409 with the use case's error message
  - Failure: POST with non-numeric channelId returns 400 (caught by CryptoNewsSource.create validation)
  - Evidence: .omo/evidence/task-2-controller-spec.log
    Commit: Y | feat(crypto-news): add POST /crypto-news/sources endpoint

### Wave 2: Backend tests + frontend feature (parallel after Wave 1)

- [x] 3. Add `crypto-news.controller.spec.ts` for POST endpoint
     What to do:
  - Create new test file `apps/backend/src/telegram/ingestion/crypto-news/api/http/__tests__/crypto-news.controller.spec.ts`
  - Use NestJS Testing module; mock `RegisterNewsSourceUseCase`, `CryptoNewsSourceRepository`, `CryptoNewsSourceMessageRepository`, `TelegramMtprotoListenerAdapter`, `Repository<CryptoNewsMessageMediaEntity>`, `CryptoNewsMetadataResolver`
  - Test cases: 1. Happy path: POST `{ channelId: '123', title: 'Test' }` → 201, returns view shape, calls `activate()` and saves 2. Auto-resolve title: POST `{ channelId: '456' }` (no title) → calls `resolver.resolve('456')` and uses resolved title 3. Title override: POST `{ channelId: '789', title: 'Custom' }` → uses provided title, ignores resolver 4. Handle preserved: POST with handle → handle in response 5. Duplicate: POST existing channelId → use case throws CONFLICT → propagates up 6. Invalid channelId: POST non-numeric → use case throws VALIDATION → propagates up
    Must NOT do:
  - Do NOT mock `DomainErrorFilter` — let real exception flow
  - Do NOT test GET endpoints here (already covered or out of scope)
  - Do NOT add E2E tests — keep unit-level
    Parallelization: Wave 2 (parallel with 4) | Blocked by: 2 | Blocks: final verification
    References:
  - apps/backend/src/kol/identity/api/http/**tests**/kol.controller.spec.ts (reference NestJS test pattern, if exists)
  - apps/backend/src/telegram/ingestion/crypto-news/infrastructure/seeders/**tests**/crypto-news.seeder.spec.ts (reference mock style)
  - apps/backend/src/telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity.ts:42-76 (create signature)
    Acceptance criteria:
  - `npm run test:backend -- --testPathPattern=crypto-news.controller.spec` passes all 6 cases
  - Test file co-located at `__tests__/crypto-news.controller.spec.ts` per project convention
  - Each test asserts on exact response shape and side effects
    QA scenarios:
  - Happy: 201 response, view shape correct, sourceRepo.save called after activate
  - Failure: CONFLICT propagates as thrown DomainError (not caught)
  - Evidence: .omo/evidence/task-3-controller-spec.log
    Commit: N (part of task 2's commit)

- [x] 4. Create `features/add-crypto-news-source/` feature folder (api client + mutation + modal + barrel)
     What to do:
  - Create `apps/frontend/src/features/add-crypto-news-source/api/add-crypto-news-source-client.ts`:
    - Exports `addCryptoNewsSource({ channelId }: { channelId: string }): Promise<CryptoNewsSourceView>`
    - Calls `httpPost<{ channelId: string }, CryptoNewsSourceView>(ENDPOINTS.cryptoNews.sources.add, { channelId })`
  - Create `apps/frontend/src/features/add-crypto-news-source/model/use-add-crypto-news-source.ts`:
    - Exports `useAddCryptoNewsSource()` hook
    - Uses `useMutation<CryptoNewsSourceView, Error, { channelId: string }>`
    - On success: invalidates `cryptoNewsKeys.all` (covers both `sources()` and `messages()`)
    - Imports `cryptoNewsKeys` from `@/entities/crypto-news`
  - Create `apps/frontend/src/features/add-crypto-news-source/ui/add-crypto-news-source-modal.tsx`:
    - Props: `{ isOpen: boolean; onClose: () => void }`
    - Single input: channelId (numeric, autoFocus)
    - Placeholder: `"e.g. 1234567890"` (numeric-only, no @ reference)
    - Helper text: `"Display title and handle are resolved automatically from Telegram."`
    - Client-side validation: `const isValidChannelId = /^\d+$/.test(channelId.trim())` → disable submit if invalid
    - Modal title: `"Add Source"`
    - Submit button text: dynamic `"Adding…"` when pending, `"Add Source"` otherwise
    - Error display: red alert box with `mutation.error.message` (mirror add-kol pattern at lines 61-68)
    - On success: clear input, call `onClose()`
    - Handle pending state: disable inputs during mutation, prevent close during pending
    - Reset mutation on close
  - Create `apps/frontend/src/features/add-crypto-news-source/index.ts`: - Exports `AddCryptoNewsSourceModal` from `./ui/add-crypto-news-source-modal` - Exports `useAddCryptoNewsSource` from `./model/use-add-crypto-news-source`
    Must NOT do:
  - Do NOT ask for title or handle in the modal (mirror add-kol)
  - Do NOT add `as any`, `@ts-ignore`, or suppress type errors
  - Do NOT use a different UI library — reuse `@/shared/ui` Button + Modal
  - Do NOT add new shared types — reuse `CryptoNewsSource` from `@/entities/crypto-news/api/crypto-news-queries`
    Parallelization: Wave 2 (parallel with 2, 3, 5) | Blocked by: nothing (frontend feature only needs ENDPOINTS at runtime) | Blocks: 6, 7
    References:
  - apps/frontend/src/features/add-kol/ui/add-kol-modal.tsx (full modal pattern)
  - apps/frontend/src/features/add-kol/api/add-kol-client.ts (full client pattern)
  - apps/frontend/src/features/add-kol/model/use-add-kol.ts (full mutation pattern)
  - apps/frontend/src/features/add-kol/index.ts (barrel pattern)
  - apps/frontend/src/entities/crypto-news/api/crypto-news-queries.ts (CryptoNewsSource type + cryptoNewsKeys)
  - apps/frontend/src/shared/ui/modal.tsx (Modal component contract)
  - apps/frontend/src/shared/ui/button.tsx (Button component contract)
    Acceptance criteria:
  - All 4 files compile cleanly (`npm run build` succeeds)
  - `AddCryptoNewsSourceModal` renders, accepts user input, submits via mutation
  - `useAddCryptoNewsSource` invalidates `cryptoNewsKeys.all` on success
  - Client-side numeric validation prevents submission of invalid channelIds
  - Modal closes on success, resets state, blocks close during pending
    QA scenarios:
  - Happy: type valid channelId → submit → mutation fires → modal closes → sources list refreshes
  - Failure: submit empty → button disabled
  - Failure: submit non-numeric (`WatcherGuru`) → button disabled
  - Failure: server returns 409 → error message renders in red alert
  - Evidence: .omo/evidence/task-4-modal-build.log
    Commit: Y | feat(frontend): add AddCryptoNewsSourceModal feature

- [x] 5. Add `cryptoNews.sources.add` to shared ENDPOINTS config
     What to do:
  - Modify `apps/frontend/src/shared/api/endpoints.ts`:
    - Add a new top-level key `cryptoNews: { sources: { add: '/crypto-news/sources' } }`
    - Place after `ingestion` block (before closing `} as const`)
  - No other changes to this file
    Must NOT do:
  - Do NOT add other endpoints beyond what's needed for this feature
  - Do NOT change the existing `as const` type assertion
    Parallelization: Wave 2 (parallel with 3, 4) | Blocked by: nothing | Blocks: 6
    References:
  - apps/frontend/src/shared/api/endpoints.ts:1-95 (current structure)
    Acceptance criteria:
  - `ENDPOINTS.cryptoNews.sources.add === '/crypto-news/sources'`
  - TypeScript type still narrows correctly (`as const` preserved)
  - `npm run build` succeeds
    QA scenarios:
  - Happy: type-level test in client compiles
  - Evidence: .omo/evidence/task-5-endpoints-build.log
    Commit: N (batched with task 4's commit OR separate; default to separate for atomic commits)

### Wave 3: Page wiring + frontend tests (parallel after Wave 2)

- [x] 6. Wire button + modal into `pages/crypto-news/index.tsx`
     What to do:
  - Modify `apps/frontend/src/pages/crypto-news/index.tsx`: - Import `AddCryptoNewsSourceModal` and `Button` from `@/shared/ui` - Add `const [showAddModal, setShowAddModal] = useState(false);` near existing state - Modify header to be flex with title left + button right (mirror `pages/kols/index.tsx:112-127`):
    `tsx
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Crypto News</h1>
          <p className="text-sm text-slate-400 mt-1">
            Ingested messages from monitored crypto-news Telegram channels.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowAddModal(true)}
        >
          + Add Source
        </Button>
      </header>
      ` - Render `<AddCryptoNewsSourceModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />` after the header
    Must NOT do:
  - Do NOT move or restyle the existing KPI cards, filter dropdown, or message list
  - Do NOT add more buttons or features
  - Do NOT change the page's existing data-fetching logic
    Parallelization: Wave 3 (parallel with 7) | Blocked by: 4, 5 | Blocks: 8
    References:
  - apps/frontend/src/pages/crypto-news/index.tsx:18-25 (current header)
  - apps/frontend/src/pages/kols/index.tsx:112-132 (exact pattern to mirror)
    Acceptance criteria:
  - Page renders without errors
  - Button is visible in the header
  - Clicking button opens the modal
  - Closing modal hides it
  - Successful submit refreshes the sources list
    QA scenarios:
  - Happy: navigate to `/crypto-news` → see "Crypto News" title + "+ Add Source" button
  - Happy: click button → modal opens with input
  - Happy: submit valid channelId → modal closes, source appears in filter dropdown
  - Failure: submit invalid channelId → submit button disabled
  - Evidence: .omo/evidence/task-6-page-screenshot.png (or component test)
    Commit: Y | feat(crypto-news-page): wire Add Source button + modal

- [x] 7. Add frontend tests for client + modal
     What to do:
  - Create `apps/frontend/src/features/add-crypto-news-source/api/__tests__/add-crypto-news-source-client.test.ts`:
    - Mock `@/shared/api/http-client` `httpPost`
    - Test: `addCryptoNewsSource({ channelId: '123' })` calls `httpPost('/crypto-news/sources', { channelId: '123' })` and returns the response
  - Create `apps/frontend/src/features/add-crypto-news-source/ui/__tests__/add-crypto-news-source-modal.test.tsx`: - Mock `useAddCryptoNewsSource` - Test cases: 1. Renders modal title "Add Source" 2. Submits with channelId, calls mutate, closes on success 3. Disables submit when channelId empty 4. Disables submit when channelId non-numeric 5. Shows error message when mutation fails 6. Doesn't close modal when mutation is pending 7. Resets input on close
    Must NOT do:
  - Do NOT test the mutation hook itself (covered by client test + integration)
  - Do NOT add MSW handlers — keep vitest mocking
  - Do NOT use real TanStack Query — mock the hook
    Parallelization: Wave 3 (parallel with 6) | Blocked by: 4 | Blocks: final verification
    References:
  - apps/frontend/src/features/add-kol/api/add-kol-client.test.ts (reference test pattern)
  - apps/frontend/src/features/add-kol/ui/**tests**/add-kol-modal.test.tsx (reference modal test pattern)
  - apps/frontend/src/test/setup.ts (vitest setup, if exists)
    Acceptance criteria:
  - `npm run test:frontend -- --run --reporter=verbose add-crypto-news-source` passes all tests
  - Each test is independent and mocks `httpPost` / `useAddCryptoNewsSource`
  - Tests follow the add-kol test naming and structure
    QA scenarios:
  - Happy: client test asserts exact URL + body
  - Happy: modal tests assert user interactions
  - Failure: error state renders correctly
  - Evidence: .omo/evidence/task-7-frontend-test.log
    Commit: N (batched with task 4's commit OR separate; default to separate)

### Wave 4: Final wiring + E2E verification (sequential)

- [x] 8. Verify everything end-to-end + run pre-commit hooks
     What to do:
  - Run `npm run build` (root) — both apps must build clean
  - Run `npm run lint:backend` and `npm run lint:frontend` — zero errors
  - Run `npm run test:backend` and `npm run test:frontend` — all tests pass
  - Run `npm run docs:check` — no new docs warnings
  - Start backend (`npm run dev:backend-only`) and frontend (`npm run dev:frontend-only`)
  - Manual smoke test: navigate to `http://localhost:5173/crypto-news` → click "+ Add Source" → enter valid channelId → submit → verify source appears in filter
  - Verify error handling: enter existing channelId → see 409 error message
  - Capture screenshots: `.omo/evidence/task-8-{page,modal-open,success,error}.png`
    Must NOT do:
  - Do NOT skip the manual smoke test — verify the button is reachable and the flow works
  - Do NOT commit evidence files to git
  - Do NOT merge without all checks passing
    Parallelization: Wave 4 (sequential) | Blocked by: 3, 6, 7 | Blocks: final verification wave
    References:
  - apps/frontend/src/pages/crypto-news/**tests**/crypto-news-page.test.tsx (existing page test must still pass)
  - All files modified/created above
    Acceptance criteria:
  - All build, lint, test commands exit 0
  - Manual smoke test succeeds
  - Screenshots captured in `.omo/evidence/`
    QA scenarios:
  - Happy: full E2E flow from button click to source list refresh
  - Failure: duplicate submission shows 409 error in red alert
  - Evidence: .omo/evidence/task-8-\*.{log,png}
    Commit: N (verification only)

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [x] F1. Plan compliance audit — APPROVE (Oracle ses_0d5287de6ffexheibCe8JfnAcu): all 7 must-haves delivered, all 9 must-NOTs respected
- [x] F2. Code quality review — APPROVE (Oracle ses_0d528d98ffeph8KRbFqSVfvrK): 7/7 criteria scored 5/5
- [x] F3. Real manual QA — APPROVE (Oracle ses_0d528d53ffec59HxiOlkQ9awR): genuine test run with 5 distinct screenshots, real 201/409 responses
- [x] F4. Scope fidelity — APPROVE (Oracle ses_0d528d0affe6Cou0pH1vUPb3n): exactly 13 files, byte-identical to plan

## Commit strategy

Atomic commits per logical boundary (matches `.husky/commit-msg` conventional-commits requirement):

1. `refactor(crypto-news): extract metadata resolver from seeder` (todo 1)
2. `feat(crypto-news): add POST /crypto-news/sources endpoint` (todo 2 + controller test in todo 3 — combined into one commit since the test validates the endpoint)
3. `feat(frontend): add AddCryptoNewsSourceModal feature` (todo 4 + todo 7 tests + todo 5 ENDPOINTS — combined since the feature is incomplete without its tests and endpoint entry)
4. `feat(crypto-news-page): wire Add Source button + modal` (todo 6)

Total: 4 commits. Each commit is independently buildable and testable. Run pre-commit hooks (lint + tsc) on each.

## Success criteria

A task is **complete** when:

- [ ] All 8 todos marked done
- [ ] `npm run build` exits 0 (both backend and frontend)
- [ ] `npm run lint` exits 0
- [ ] `npm run test:backend` passes (existing 306 tests + new controller test)
- [ ] `npm run test:frontend` passes (existing tests + new client + modal tests)
- [ ] Manual smoke test: button reachable on `/crypto-news`, modal opens, valid channelId submits + source appears, invalid channelId blocks submit, duplicate shows 409 error
- [ ] 4 atomic commits with conventional commit messages
- [ ] No files outside the declared scope touched
- [ ] Evidence files in `.omo/evidence/task-{1-8}-*`
