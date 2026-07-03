# consolidate-event-publisher — Work Plan

## TL;DR (For humans)

**What you'll get:** 13 BCs that currently each copy-paste the same 30-line event publisher pattern (abstract + EventEmitter2 impl) will point to one shared copy in `shared/common/`. ~620 fewer lines of dead weight, zero behavior change.

**Why this approach:** Keep per-BC class names (e.g. `KolEventPublisher`) as thin aliases so every import, DI provider token, and test mock stays exactly as-is. No cascading breakage, just mechanical consolidation.

**What it will NOT do:** Change how events are fired or handled. Touch use cases, repositories, controllers, or domain logic. Rename any DI token or type import.

**Effort:** Short (4 waves, ~28 file edits, zero behavior risk)
**Risk:** Low — every wave leaves `npm run test:backend` green; the shared impl is identical to each per-BC copy
**Decisions to sanity-check:** The alias naming (Approach A) — if you prefer full rename to `DomainEventPublisher` everywhere, that's a separate follow-up

Your next move: **approve** to proceed with execution.

---

> TL;DR (machine): Short / Low. 4 sequential waves. 2 new shared files + 13 abstract aliases + 13 impl deletions + 13 module rebinds. 306 backend tests pass after each wave.

## Scope
### Must have
- Create `shared/common/ports/domain-event.publisher.ts` with abstract `publish()` + concrete `publishAll()` loop
- Create `shared/common/messaging/in-process-domain-event.publisher.ts` with `EventEmitter2` impl (identical to existing per-BC copies)
- For each of the 13 BCs: replace full abstract body with `extends DomainEventPublisher` 1-liner
- For each of the 13 BCs: delete `infrastructure/messaging/in-process-*-event.publisher.ts` and rebind module `useClass`/`useExisting` to `InProcessDomainEventPublisher`
- Full type-check (`npx tsc --noEmit`) and test suite pass after each wave

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No behavior changes to event flow
- No touching `shared/kernel/domain-event.ts` (the base event class)
- No touching `AggregateRoot` or `commitEvents()` flow
- No touching controllers, repositories, use cases, handlers, or domain entities
- No touching test files unless a mock/provider reference breaks
- No merging `telegram/shared` with `telegram/ingestion/shared` (different domains)
- No renaming per-BC class aliases (Phase 4 is optional/deferred)

## Verification strategy
> Zero human intervention — all verification is agent-executed.
- **Test decision**: tests-after (no functional changes, existing tests validate behavior)
- **Evidence**: `.omo/evidence/consolidate-event-publisher-task-<N>.diff`

### Per-wave gates:
| Wave | Gate | Command |
|------|------|---------|
| 1 | Shared files created, no syntax errors | `npx tsc --noEmit` on the 2 new files |
| 2 | 13 aliases compile, no imports broken | `npx tsc --noEmit -p tsconfig.json` |
| 3 | All modules rebind, old files deleted | `npm run test:backend` |
| 4 (cleanup) | Diff is clean, no leftover dead imports | `npm run lint` |

## Execution strategy
### Parallel execution waves

| Wave | Todos | Parallel | Depends on |
|------|-------|----------|------------|
| 1 | T1 + T2 | T1∥T2 (independent) | — |
| 2 | T3 (batch of 13) | Parallel within T3 (13 files, same edit) | T1, T2 |
| 3 | T4 (batch of 13 × 2) | Parallel within T4 (delete 13 files, edit 13 modules) | T3 |
| 4 | T5 + T6 (optional) | Sequential (lint → optional cleanup) | T4 |

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1. `domain-event.publisher.ts` abstract | — | T3 | T2 |
| T2. `in-process-domain-event.publisher.ts` impl | — | T3 | T1 |
| T3. Migrate 13 abstracts to aliases | T1, T2 | T4 | nothing |
| T4. Migrate 13 impls + rebind 13 modules | T3 | T5 | nothing |
| T5. Verify + lint | T4 | — | nothing |
| T6. (Optional) Delete alias files | T5 | — | nothing |

## Todos
> Implementation + Test = ONE todo. Never separate.

### Wave 1 — Foundation

- [ ] 1. Create `shared/common/ports/domain-event.publisher.ts`
  **What to do:** Write the consolidated abstract class. Exact body: abstract `publish(event: DomainEvent): Promise<void>` + concrete `publishAll(events: ReadonlyArray<DomainEvent>): Promise<void>` (the for-loop pattern from the 13 copies). Import from `../../kernel/domain-event` (relative to shared/common/ports/).
  **Parallelization:** Wave 1 | Blocked by: — | Blocks: T3
  **References:** `telegram/shared/application/ports/publishing-event.publisher.ts:1-11` (reference body)
  **Acceptance criteria:** `npx tsc --noEmit` on the file succeeds; the abstract matches the exact method signatures of the 13 copies
  **QA:** `npx tsc --noEmit src/shared/common/ports/domain-event.publisher.ts`
  **Commit:** N

- [ ] 2. Create `shared/common/messaging/in-process-domain-event.publisher.ts`
  **What to do:** Write the consolidated EventEmitter2 impl. Extends `DomainEventPublisher` from above. Constructor takes `EventEmitter2`. `publish()` calls `this.eventEmitter.emit(event.eventName, event)`. Optionally add `logger.debug` matching the crypto-news version (which has it; the `PublishingEventPublisher` version did not — unify adds it).
  **Parallelization:** Wave 1 | Blocked by: — | Blocks: T3
  **References:** `telegram/ingestion/crypto-news/infrastructure/messaging/in-process-crypto-news-event.publisher.ts:10-22` (standard body; all 13 copies are nearly identical)
  **Acceptance criteria:** `npx tsc --noEmit` on the file succeeds
  **QA:** `npx tsc --noEmit src/shared/common/messaging/in-process-domain-event.publisher.ts`
  **Commit:** N

### Wave 2 — Abstract aliases

- [ ] 3. Edit 13 abstract publisher files to alias the shared abstract
  **What to do / Must NOT do:** For each of the 13 `application/ports/*-event.publisher.ts` files:
  1. Add `import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';`
  2. Replace the class body with `export abstract class <Name> extends DomainEventPublisher {}`
  Must NOT: change any imports in other files, rename the class, delete the file.
  **File list (13):**
  - `token/classification/application/ports/classification-event.publisher.ts`
  - `token/achievement/application/ports/achievement-event.publisher.ts`
  - `token/normalization/application/ports/normalization-event.publisher.ts`
  - `token/vip-call-approval/application/ports/vip-call-approval-event.publisher.ts`
  - `token/intake/parsing/application/ports/parsing-event.publisher.ts`
  - `token/intake/extraction/application/ports/extraction-event.publisher.ts`
  - `token/scoring/application/ports/scoring-event.publisher.ts`
  - `token/enrichment/application/ports/enrichment-event.publisher.ts`
  - `chain/detection/application/ports/chain-detection-event.publisher.ts`
  - `kol/identity/application/ports/kol-event.publisher.ts`
  - `dashboard/application/ports/kpis-updated-event.publisher.ts`
  - `telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher.ts`
  - `telegram/shared/application/ports/publishing-event.publisher.ts`
  **Parallelization:** Wave 2 | Blocked by: T1, T2 | Blocks: T4
  **Reference for body:** All 13 have the same 11-line body — the alias replaces every line from `abstract class` to the closing brace.
  **Acceptance criteria:** `npx tsc --noEmit -p tsconfig.json` passes with zero errors. All 306 backend tests pass.
  **QA:** `npm run test:backend` (306 tests)
  **Commit:** N

### Wave 3 — In-process impl unification

- [ ] 4. Delete 13 in-process impl files
  **What to do:** Delete each `infrastructure/messaging/in-process-*-event.publisher.ts` file. These are the 13 files listed in Findings.
  **Must NOT do:** Delete any other file. Leave the `messaging/` directory if empty or with other files.
  **Parallelization:** Wave 3, part A | Blocked by: T3 | Blocks: T4b
  **QA:** Verify each file is deleted with `ls`

- [ ] 5. Update 13 module files to use `InProcessDomainEventPublisher`
  **What to do / Must NOT do:** For each BC's `.module.ts`:
  1. Remove the import of `InProcess*EventPublisher` from the old local path
  2. Add `import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';`
  3. Change the provider entry from `useClass: InProcess*EventPublisher` to `useClass: InProcessDomainEventPublisher` (or `useExisting: InProcess*EventPublisher` → `useExisting: InProcessDomainEventPublisher`)
  4. Add `InProcessDomainEventPublisher` to the module's `providers:` array (for `useExisting` pattern) OR remove the old impl from providers if it was listed separately (depends on each module's pattern — some have the impl listed as a provider + aliased, others just `useClass`)
  **Must NOT:** Change the `provide:` token (the abstract class). Change any other provider.
  **Files (13 modules):**
  - `token/classification/classification.module.ts`
  - `token/achievement/achievement.module.ts`
  - `token/normalization/normalization.module.ts`
  - `token/vip-call-approval/vip-call-approval.module.ts`
  - `token/intake/parsing/parsing.module.ts`
  - `token/intake/extraction/extraction.module.ts`
  - `token/scoring/scoring.module.ts`
  - `token/enrichment/enrichment.module.ts`
  - `chain/detection/chain-detection.module.ts`
  - `kol/identity/identity.module.ts`
  - `dashboard/dashboard.module.ts`
  - `telegram/ingestion/crypto-news/crypto-news-ingestion.module.ts`
  - `telegram/vip-calls/vip-channel/vip-channel.module.ts`
  **Parallelization:** Wave 3, part B | Blocked by: T4a | Blocks: T5
  **Evidence:** `npm run test:backend` passes (306 tests)
  **Commit:** Y | `refactor(shared): consolidate 13 duplicated event publishers into shared/common/`

### Wave 4 — Verification + cleanup

- [ ] 6. Full verification
  **What to do:** Run `npm run test:backend`, `npx tsc --noEmit`, and `npm run lint`. All must pass clean.
  **Parallelization:** Wave 4 | Blocked by: T4 | Blocks: T6
  **Evidence:** `.omo/evidence/consolidate-event-publisher-task-5.md` with the 3 command outputs
  **Commit:** N (amend previous if lint issues found)

- [ ] 7. (Optional) Delete 13 abstract alias files if no longer needed
  **What to do / Must NOT:** For each of the 13 abstract alias files from Wave 2, if every consumer now imports `DomainEventPublisher` instead of the alias, delete the alias file. If any consumer still imports the alias (likely — mocks, DI tokens, and use cases all use the alias name), keep them. Remove ONLY after verifying zero imports remain.
  **NOTE:** This is DEFERRED. Do NOT include in the initial PR. The aliases serve as backward-compat shims and can stay indefinitely.
  **Parallelization:** Wave 5 | Blocked by: T5 | Blocks: —
  **Commit:** Y (separate cleanup PR)

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit — each todo delivered as specified
- [ ] F2. Code quality review — no duplicated publisher files remain; aliases are 1-liners
- [ ] F3. Real manual QA — the bot runs, events fire through the pipeline (manual verification on dev)
- [ ] F4. Scope fidelity — no changes outside `application/ports/*.publisher.ts`, `infrastructure/messaging/`, and module files

## Commit strategy
1. **Single PR, one commit per wave.** Squash-merge final.
   - **Wave 1+2 commit:** `refactor(shared): add DomainEventPublisher + migrate 13 per-BC abstracts to aliases` (triggers tsc-only, no test impact)
   - **Wave 3 commit:** `refactor(shared): replace 13 per-BC event publisher impls with shared InProcessDomainEventPublisher` (triggers full test suite)
   - **Wave 4 commit (optional):** `refactor(shared): remove 13 unused event publisher alias files` (separate cleanup PR)

2. PR description cross-references each wave with line-count diff and the "before: ~620 duplicated LOC → after: ~40 shared LOC" summary.

## Success criteria
- Zero remaining files named `*-event.publisher.ts` inside any BC's `infrastructure/messaging/`
- Zero remaining full-body abstract publishers inside any BC's `application/ports/` (only 1-line `extends` aliases)
- `npx tsc --noEmit` clean
- `npm run test:backend` green
- `npm run lint` green
- 2 new files in `shared/common/`: `ports/domain-event.publisher.ts` and `messaging/in-process-domain-event.publisher.ts`
