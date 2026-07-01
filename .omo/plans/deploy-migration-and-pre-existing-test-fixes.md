# deploy-migration-and-pre-existing-test-fixes - Work Plan

## TL;DR (For humans)

**What you'll get:** (1) Production database migration script that renames 3 tables (`milestone_thresholds` → `achievement_thresholds`, `notified_milestones` → `notified_achievements`, `filter_decisions` → `vip_call_approval_decisions`) and adds a new `telegram_message_id` column to `notified_achievements`. (2) Fixes the 5 pre-existing test failures in `tracked-published-call.entity.spec.ts` (2 tests) and `verify-vip-call-rejection.use-case.spec.ts` (3 tests).

**Why this approach:** Migration follows the existing project convention (date-prefixed SQL backfill scripts in `scripts/backfills/`). Tests are treated as the spec — code changes match test expectations, not the other way around. Two independent work tracks (DB + tests) run in parallel since they touch different files.

**What it will NOT do:** Not change unrelated code, not rename `monitored_calls` table, not modify backend `synchronize:true` behavior, not add new indexes or foreign keys, not migrate data (only renames + 1 new nullable column).

**Effort:** Short
**Risk:** Low — DB migration is reversible (ALTER TABLE RENAME), test fixes are isolated to 2 spec files + 2 implementation files.
**Decisions to sanity-check:** Apply lowercase to ALL chain addresses in `tracked-published-call.create()` (not Solana-only) — this matches project convention used in MonitoredCall/PublishedCall.

Your next move: Approve, then run `$start-work` to execute.

---

> TL;DR (machine): Short-effort, low-risk: 1 SQL backfill script + 2 small code fixes. Production DB renames + telegram_message_id column. 5 test fixes (2 in tracked-published-call, 3 in verify-vip-call-rejection).

## Scope
### Must have
- Create `apps/backend/scripts/backfills/2026-06-30-milestone-to-achievement-rename.sql`:
  - `ALTER TABLE IF EXISTS milestone_thresholds RENAME TO achievement_thresholds`
  - `ALTER TABLE IF EXISTS notified_milestones RENAME TO notified_achievements`
  - `ALTER TABLE IF EXISTS filter_decisions RENAME TO vip_call_approval_decisions`
  - `ALTER TABLE notified_achievements ADD COLUMN IF NOT EXISTS telegram_message_id bigint NULL`
  - Header comment with what/why/rollback/verification sections
- Fix `apps/backend/src/token/call-tracking/domain/entities/tracked-published-call.entity.ts`:
  - `create()`: lowercase ALL addresses (remove Solana exception)
  - `buildId()`: lowercase the address argument internally
- Fix `apps/backend/src/token/vip-call-approval/application/handlers/verify-vip-call-rejection.use-case.ts`:
  - Verdict mapping: BLACKLISTED reason → verdict `NEEDS_BLACKLIST_REVIEW` (not SKIP)
  - Verdict mapping: SCORE_TOO_LOW reason → verdict `REJECTED` (not NONE)
  - `snapshotCompleteness` returns `0` (number) not `null` when snapshot exists with 0% completeness
- Verify all 5 tests pass
- Verify full test suite has no regressions
- Document the migration in `scripts/backfills/README.md` (link to new script)

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NOT change unrelated code in `apps/backend/src/`
- NOT rename `monitored_calls` table or entity (out of scope per previous plan)
- NOT modify `synchronize:true` behavior in dev config
- NOT add new indexes, foreign keys, or data migrations
- NOT modify any other test files (only the 2 failing spec files)
- NOT touch `telegram/ingestion/` or `telegram/chain-dexter-bot/`
- NOT change frontend code

## Verification strategy
- Test decision: tests-after (run existing failing tests to verify they pass)
- Framework: Jest (`npx jest --testPathPatterns`)
- Migration verification: `npm run db:migrate -- --dry-run` to confirm script would run; manual SQL inspection of droplet DB
- Lint: not required (only adding SQL + minimal code changes)
- Build: not required (only minor code changes to existing files)
- Evidence: `.omo/evidence/deploy-migration-and-pre-existing-test-fixes.log`

## Execution strategy
### Parallel execution waves
- **Wave 1**: Create migration script + fix tracked-published-call entity (parallel, different files)
- **Wave 2**: Fix verify-vip-call-rejection use case
- **Wave 3**: Run all 5 tests + full suite + commit

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1. Create SQL backfill script | — | 4 | 2 |
| 2. Fix tracked-published-call entity | — | 4 | 1 |
| 3. Fix verify-vip-call-rejection | — | 4 | 1, 2 |
| 4. Run tests + commit | 1, 2, 3 | — | — |

## Todos

- [ ] 1. Create SQL backfill script for production DB migration
  What to do / Must NOT do:
  1. Create file `apps/backend/scripts/backfills/2026-06-30-milestone-to-achievement-rename.sql`
  2. Header comment (required by convention):
     - `-- Backfill: milestone-to-achievement-rename`
     - `-- Author: bstevens`
     - `-- Date:   2026-06-30`
     - `-- What: Rename 3 tables to align with the milestone→achievement refactor and add telegram_message_id column.`
     - `-- Why:  The frontend refactor renamed the milestone BC to achievement and the token-gating BC to vip-call-approval. The DB tables must follow the domain language.`
     - `-- Rollback:`
     - `   ALTER TABLE IF EXISTS achievement_thresholds RENAME TO milestone_thresholds;`
     - `   ALTER TABLE IF EXISTS notified_achievements RENAME TO notified_milestones;`
     - `   ALTER TABLE IF EXISTS vip_call_approval_decisions RENAME TO filter_decisions;`
     - `   ALTER TABLE IF EXISTS notified_achievements DROP COLUMN IF EXISTS telegram_message_id;`
     - `-- Verification:`
     - `   \d+ achievement_thresholds`
     - `   \d+ notified_achievements`
     - `   \d+ vip_call_approval_decisions`
  3. Body (idempotent SQL, single transaction):
     ```sql
     BEGIN;
     ALTER TABLE IF EXISTS milestone_thresholds RENAME TO achievement_thresholds;
     ALTER TABLE IF EXISTS notified_milestones RENAME TO notified_achievements;
     ALTER TABLE IF EXISTS filter_decisions RENAME TO vip_call_approval_decisions;
     ALTER TABLE notified_achievements ADD COLUMN IF NOT EXISTS telegram_message_id bigint NULL;
     COMMIT;
     ```
  4. Update `apps/backend/scripts/backfills/README.md`:
     - Add a row to the existing backfill list:
       `- 2026-06-30: milestone-to-achievement-rename (rename 3 tables + add telegram_message_id column)`
  5. Verify by running the runner in dry-run mode:
     ```bash
     cd apps/backend && npm run db:migrate -- --dry-run
     ```
     Should list the new script as pending.

  Must NOT:
  - Add data backfill logic (only structural renames + nullable column)
  - Rename `monitored_calls` table (out of scope)
  - Add foreign keys, indexes, or constraints
  - Use plpgsql/DO blocks (keep it simple SQL)
  - Skip the verification SQL in the header

  Parallelization: Wave 1 | Blocked by: — | Blocks: 4
  References: `apps/backend/scripts/backfills/_template.sql` (convention), `apps/backend/scripts/backfills/2026-06-26-published-calls.sql` (recent example), `apps/backend/scripts/backfills/README.md` (docs)
  Acceptance criteria:
  - File exists at correct path with date-prefix naming
  - Header includes what/why/rollback/verification sections
  - SQL is idempotent (uses IF EXISTS / IF NOT EXISTS guards)
  - Wrapped in BEGIN/COMMIT for atomicity
  - `npm run db:migrate -- --dry-run` lists the script
  QA scenarios:
  - Dry-run shows new script as pending
  - Manual SQL inspection: each ALTER TABLE has IF EXISTS guard
  Commit: Y | `feat(backend): add backfill script for milestone-to-achievement DB rename`

- [ ] 2. Fix tracked-published-call.entity: lowercase ALL addresses in create() and buildId()
  What to do / Must NOT do:
  1. Edit `apps/backend/src/token/call-tracking/domain/entities/tracked-published-call.entity.ts`:
  - `create()` method (line ~66-67):
    - REMOVE the Solana exception: `const normalizedAddress = input.chain === 'solana' ? input.address : input.address.toLowerCase();`
    - REPLACE with: `const normalizedAddress = input.address.toLowerCase();`
    - Update the comment (currently says "Solana addresses are Base58-encoded and case-sensitive" — now obsolete)
    - Replace with: `// Lowercase all addresses for consistent natural-key lookup. Matches MonitoredCall/PublishedCall convention.`
  - `buildId()` static method (line ~91-93):
    - Currently: `return ${chain}:${normalizedAddress};`
    - Replace with:
      ```typescript
      public static buildId(chain: string, address: string): string {
        return `${chain}:${address.toLowerCase()}`;
      }
      ```
    - Also rename parameter from `normalizedAddress` to `address` (no longer assumes pre-normalized)
  2. Run the affected tests:
     ```bash
     cd apps/backend && npx jest --testPathPatterns "tracked-published-call.entity" 2>&1 | tail -10
     ```
  3. Both tests should pass:
     - `create() builds the expected id from chain + address` — lowercase solana address
     - `buildId() lowercases the address` — internal lowercase
  4. Run the call-tracking handler tests (regression check):
     ```bash
     cd apps/backend && npx jest --testPathPatterns "call-tracking" 2>&1 | tail -10
     ```

  Must NOT:
  - Add a new method (keep API backward compatible — only change implementation)
  - Modify the spec file (tests are the spec)
  - Change other tracked-published-call behavior (only the normalization)

  Parallelization: Wave 1 | Blocked by: — | Blocks: 4
  References: `apps/backend/src/token/call-tracking/domain/entities/tracked-published-call.entity.ts:66-67` (create) and `:91-93` (buildId), `apps/backend/src/token/call-tracking/domain/entities/tracked-published-call.entity.spec.ts` (test spec)
  Acceptance criteria:
  - Both failing tests pass
  - Full call-tracking test suite has no regressions
  - TypeScript still compiles clean
  QA scenarios:
  - Jest shows 0 failing tests in tracked-published-call.entity.spec.ts
  - tsc --noEmit exits 0
  Commit: Y | `fix(call-tracking): lowercase all addresses in tracked-published-call (matches project convention)`

- [ ] 3. Fix verify-vip-call-rejection use case: verdict mapping + snapshotCompleteness
  What to do / Must NOT do:
  1. Edit `apps/backend/src/token/vip-call-approval/application/handlers/verify-vip-call-rejection.use-case.ts`:
  - Read the current use case file first (it may have different structure than expected)
  - Find the verdict mapping logic — likely a switch or if-chain on `reasons[]`
  - Bug 1: `SCORE_TOO_LOW` reason → verdict should be `REJECTED` (currently `NONE`)
    - Find the line that returns `NONE` when only SCORE_TOO_LOW reason
    - Change return value to `REJECTED`
  - Bug 2: `BLACKLISTED` reason → verdict should be `NEEDS_BLACKLIST_REVIEW` (currently `SKIP`)
    - Find the line that returns `SKIP` when BLACKLISTED reason
    - Change return value to `NEEDS_BLACKLIST_REVIEW`
  - Bug 3: `snapshotCompleteness` should return `0` (number) not `null` when snapshot has 0% completeness
    - Find where `snapshotCompleteness` is computed from snapshot data
    - Change `null` to `0` when snapshot exists with 0 fields populated
  2. Run tests:
     ```bash
     cd apps/backend && npx jest --testPathPatterns "verify-vip-call-rejection" 2>&1 | tail -10
     ```
  3. All 3 tests should pass:
     - `SCORE_TOO_LOW rejection as retryable`
     - `BLACKLISTED → NEEDS_BLACKLIST_REVIEW`
     - `attaches snapshotCompleteness and providerErrors when snapshot exists`
  4. Run all vip-call-approval tests (regression):
     ```bash
     cd apps/backend && npx jest --testPathPatterns "vip-call-approval" 2>&1 | tail -10
     ```

  Must NOT:
  - Change the spec file (tests are the spec)
  - Add new fields to the output (only fix existing buggy logic)
  - Change the event flow or other handlers
  - Touch unrelated use cases

  Parallelization: Wave 1 | Blocked by: — | Blocks: 4
  References: `apps/backend/src/token/vip-call-approval/application/handlers/verify-vip-call-rejection.use-case.ts`, `apps/backend/src/token/vip-call-approval/application/handlers/verify-vip-call-rejection.use-case.spec.ts` (test expectations), `apps/backend/src/token/vip-call-approval/domain/value-objects/vip-call-approval-verdict.vo.ts` (VipCallApprovalVerdict enum with REJECTED/NEEDS_BLACKLIST_REVIEW)
  Acceptance criteria:
  - All 3 failing tests pass
  - Full vip-call-approval test suite has no regressions
  - TypeScript still compiles clean
  QA scenarios:
  - Jest shows 0 failing tests in verify-vip-call-rejection.use-case.spec.ts
  - tsc --noEmit exits 0
  Commit: Y | `fix(vip-call-approval): verdict mapping (SCORE_TOO_LOW→REJECTED, BLACKLISTED→NEEDS_BLACKLIST_REVIEW) + snapshotCompleteness 0 not null`

- [ ] 4. Final verification + commits
  What to do / Must NOT do:
  1. Run the full test suite to confirm no regressions:
     ```bash
     cd apps/backend && npx jest 2>&1 | tail -10
     ```
     Expected: 610 passed / 0 failed (was 605 passed / 5 failed before this plan)
  2. Run tsc check:
     ```bash
     cd apps/backend && npx tsc --noEmit 2>&1 | head -5
     ```
     Expected: 0 errors
  3. Verify the migration script dry-run shows pending:
     ```bash
     cd apps/backend && npm run db:migrate -- --dry-run
     ```
  4. If everything passes, all 3 commits (from todos 1-3) should already be in place. No new commit needed.
  5. Write evidence to `.omo/evidence/deploy-migration-and-pre-existing-test-fixes.log`:
     ```
     Plan: deploy-migration-and-pre-existing-test-fixes
     Final state:
       - Migration script: 2026-06-30-milestone-to-achievement-rename.sql (verified in dry-run)
       - tracked-published-call tests: 2/2 passing
       - verify-vip-call-rejection tests: 3/3 passing
       - Full suite: 610/610 passing
       - TypeScript: 0 errors
     ```

  Must NOT:
  - Create a 4th commit (commits 1-3 cover all changes)
  - Force push or rewrite history
  - Apply migration to production (operator runs manually)

  Parallelization: Wave 3 | Blocked by: 1, 2, 3 | Blocks: —
  References: all prior todos
  Acceptance criteria:
  - Full test suite shows 610 passed, 0 failed
  - TypeScript shows 0 errors
  - Migration script listed in dry-run
  - Evidence file written

  QA scenarios:
  - `npx jest` shows all tests passing
  - `npx tsc --noEmit` clean
  - `npm run db:migrate -- --dry-run` shows new script
  Commit: N/A (changes already committed in todos 1-3)

## Final verification wave
- [ ] F1. Plan compliance audit — verify SQL script created with proper header + idempotent guards, both code fixes match test expectations, all 5 originally-failing tests now pass
- [ ] F2. Code quality review — minimal changes, no unrelated modifications, idempotent migration, backward compatible tracked-published-call API
- [ ] F3. Real manual QA — SSH to droplet and inspect current DB state vs target migration (don't apply)
- [ ] F4. Scope fidelity — confirm no other code modified, only the 2 spec-implementation files + 1 new SQL file

## Commit strategy
- 3 commits (one per todo):
  1. `feat(backend): add backfill script for milestone-to-achievement DB rename`
  2. `fix(call-tracking): lowercase all addresses in tracked-published-call (matches project convention)`
  3. `fix(vip-call-approval): verdict mapping + snapshotCompleteness fixes`

## Success criteria
- File `apps/backend/scripts/backfills/2026-06-30-milestone-to-achievement-rename.sql` exists with correct header + body
- `npm run db:migrate -- --dry-run` lists the new script as pending
- `apps/backend/scripts/backfills/README.md` mentions the new migration
- All 5 originally-failing tests pass:
  - `tracked-published-call.entity.spec.ts`: 2/2 ✓
  - `verify-vip-call-rejection.use-case.spec.ts`: 3/3 ✓
- Full test suite: 610 passed, 0 failed (was 605 passed, 5 failed)
- `npx tsc --noEmit`: 0 errors
- No other test regressions (full suite diff: +5 passing, 0 failing, same total count)