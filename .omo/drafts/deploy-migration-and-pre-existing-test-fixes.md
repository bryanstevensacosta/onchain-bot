---
slug: deploy-migration-and-pre-existing-test-fixes
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/deploy-migration-and-pre-existing-test-fixes.md
approach: "Two-track plan: (A) Production DB migration script for table renames + telegram_message_id column. (B) Fix 5 pre-existing test failures in tracked-published-call + verify-vip-call-rejection."
---

# Draft: deploy-migration-and-pre-existing-test-fixes

## Components (topology ledger)

| id | outcome | status | evidence |
|---|---|---|---|
| C1 | Production DB migration: rename 3 tables + add 1 column | active | ssh droplet + scripts/backfills |
| C2 | Fix tracked-published-call.create lowercases solana address | active | tests |
| C3 | Fix tracked-published-call.buildId to lowercase the address | active | tests |
| C4 | Fix verify-vip-call-rejection SCORE_TOO_LOW returns REJECTED | active | tests |
| C5 | Fix verify-vip-call-rejection BLACKLISTED returns NEEDS_BLACKLIST_REVIEW | active | tests |
| C6 | Fix verify-vip-call-rejection snapshotCompleteness returns 0 | active | tests |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Migration approach | Backfill SQL scripts in `scripts/backfills/YYYY-MM-DD-name.sql` following existing convention | Project has 8+ backfill scripts already; follow same pattern | Yes (rollback section in each script) |
| Table rename strategy | `ALTER TABLE old RENAME TO new` (Postgres native) | Atomic, no data loss, supported in Postgres 9+ | Yes (reverse with `ALTER TABLE new RENAME TO old`) |
| New column | `ADD COLUMN telegram_message_id bigint NULL` | Nullable so old rows are valid | Yes (DROP COLUMN) |
| Foreign keys/sequences | Sequences attached to old table move automatically with `ALTER TABLE ... RENAME TO` | Postgres default behavior | Yes (renames automatically) |
| Indexes | Indexes renamed automatically when table is renamed in Postgres | Postgres default behavior | Yes |
| `monitored_calls` table | STAYS unchanged | Per plan, only specific tables renamed | N/A |
| tracked-published-call bug fix | Apply `create()` lowercase to ALL addresses (not just non-Solana) | Tests expect all addresses lowercased | Yes (lowercase is one-way per chain) |
| tracked-published-call `buildId` API | Either lowercase in buildId (matching test) OR fix the test to match code (caller lowercase) | Decided: change `buildId` to lowercase per test | Yes |
| verify-vip-call-rejection fix | The use case has bugs that need code fixes (verdict mapping + snapshot handling) | Tests are the spec | Yes (revert commit) |

## Findings (cited - path:lines)

### Production DB state (verified via ssh to droplet)
- `milestone_thresholds`: 99 rows, columns `id (integer PK), multiple (double precision)`
- `notified_milestones`: 0 rows, columns `id (uuid), call_id, threshold, notified_at`
- `filter_decisions`: 1 row, columns `id, chain, address, verdict, score, classification, reasons, decided_at, created_at`
- `monitored_calls`: 0 rows, STAYS
- `notified_milestones` does NOT have `telegram_message_id` column yet
- DB user: `alpha_meta_token_scanner`, db name: `alpha_meta_token_scanner`, host: `localhost` (droplet)

### Backfill scripts convention (`apps/backend/scripts/backfills/`)
- Naming: `YYYY-MM-DD-<short-name>.sql` or `.ts`
- Runner: `npm run db:migrate` (auto-runs all pending scripts)
- Tracks applied scripts in `backfill_migrations` table
- Production: `npm run db:migrate -- --dry-run` then `npm run db:migrate`
- Each script needs header (what/why/rollback/verification)
- Scripts are idempotent — WHERE clause filters rows needing backfill
- Existing scripts: `2026-06-26-kol-is-active-sync.sql`, `2026-06-26-kol-known-lists.sql`, `2026-06-26-lowercase-image-urls.sql`, etc.

### Pre-existing test failures (verified in code)

**File**: `apps/backend/src/token/call-tracking/domain/entities/tracked-published-call.entity.spec.ts`

Test 1: `create() builds the expected id from chain + address`
- Input: solana address `So11111111111111111111111111111111111111112` (mixed case)
- Expected: `solana:so11111111111111111111111111111111111111112` (lowercased)
- Got: `solana:So11111111111111111111111111111111111111112` (preserved)
- Code at `tracked-published-call.entity.ts:66-67` only lowercases non-Solana addresses
- Bug: Solana addresses ARE case-sensitive in the standard, BUT the project stores them lowercased everywhere else (MonitoredCall, PublishedCall, etc.)

Test 2: `buildId() lowercases the address`
- Input: `('solana', 'ABC')`
- Expected: `solana:abc`
- Got: `solana:ABC`
- Code at `tracked-published-call.entity.ts:91-93`: `return ${chain}:${normalizedAddress}` — does NOT lowercase
- API drift: spec expects `buildId` to lowercase but it doesn't

**File**: `apps/backend/src/token/vip-call-approval/application/handlers/verify-vip-call-rejection.use-case.spec.ts`

Test 3: `SCORE_TOO_LOW rejection as retryable`
- Expected: verdict `REJECTED`
- Got: `NONE`
- The use case isn't properly setting verdict to REJECTED when there's a SCORE_TOO_LOW reason

Test 4: `BLACKLISTED → NEEDS_BLACKLIST_REVIEW`
- Expected: `NEEDS_BLACKLIST_REVIEW`
- Got: `SKIP`
- The verdict mapping for BLACKLISTED reason is wrong (returns SKIP instead of NEEDS_BLACKLIST_REVIEW)

Test 5: `snapshotCompleteness when snapshot exists`
- Expected: `0` (number)
- Got: `null`
- The use case returns `null` instead of `0` for snapshotCompleteness when a snapshot with 0% completeness exists

## Decisions (with rationale)

1. **Single migration script** for production (vs. multiple): one date-prefixed script handles all 3 table renames + 1 new column in one transaction. Idempotent because Postgres `ALTER TABLE ... RENAME TO` is atomic (skip via `IF EXISTS`).

2. **Use IF EXISTS / IF NOT EXISTS guards**: production DB may have an inconsistent state. Wrapping ALTER with `IF EXISTS` makes the script re-runnable.

3. **Update `call-tracking/call-tracking.module.ts`** — the `milestonesHit` field name in call-tracking is a tracked-calls metric, but it semantically should now be `achievementsHit`. WAIT — this is OUT OF SCOPE for this plan (the refactor plan explicitly said "NOT rename milestonesHit"). Keep as-is.

4. **For tracked-published-call entity**: apply lowercase to ALL chains (not Solana-only). This matches the test expectations and the project convention used in MonitoredCall.

5. **For `buildId`**: change to lowercase internally so callers don't need to pre-normalize. Document the new contract.

6. **For verify-vip-call-rejection**: investigate the actual code to find the verdict mapping bug and snapshot handling bug. Tests describe expected behavior.

## Scope IN

- Create `scripts/backfills/2026-06-30-milestone-to-achievement-rename.sql`:
  - `ALTER TABLE milestone_thresholds RENAME TO achievement_thresholds` (with IF EXISTS)
  - `ALTER TABLE notified_milestones RENAME TO notified_achievements` (with IF EXISTS)
  - `ALTER TABLE filter_decisions RENAME TO vip_call_approval_decisions` (with IF EXISTS)
  - `ALTER TABLE notified_achievements ADD COLUMN IF NOT EXISTS telegram_message_id bigint NULL`
  - Header comment with what/why/rollback/verification
- Create `scripts/backfills/2026-06-30-achievement-rename.ts` (TS wrapper if needed for complex verification)
- Update `README.md` to document the new migration
- Fix tracked-published-call entity: lowercase ALL addresses in `create()`
- Fix tracked-published-call entity: lowercase in `buildId()` static method
- Fix verify-vip-call-rejection use case: verdict mapping (BLACKLISTED → NEEDS_BLACKLIST_REVIEW)
- Fix verify-vip-call-rejection use case: snapshotCompleteness returns 0 not null
- Verify all 5 tests pass after fixes
- Run full test suite to ensure no regressions

## Scope OUT (Must NOT have)

- NOT change anything in `apps/backend/src/` that wasn't part of the pre-existing failures
- NOT rename `monitored_calls` table (per previous refactor plan)
- NOT change the backend `synchronize:true` behavior (dev only)
- NOT add new columns other than `telegram_message_id`
- NOT migrate data between tables (only renames + new column)
- NOT add foreign keys or new indexes
- NOT modify any other test files

## Open questions
None — user asked for both items. Approach is clear.

## Approval gate
status: approved
<!-- El usuario aprobó el plan el 2026-06-30 -->