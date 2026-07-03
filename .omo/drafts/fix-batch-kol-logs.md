---
slug: fix-batch-kol-logs
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/fix-batch-kol-logs.md
approach: Three independent bug fixes, each shipped as one atomic commit in one PR. TDD red-green per the project's programming skill. Bug #3 fixed with defense in depth (VO construction validation + new INVALID_ADDRESS gate at filters) subject to user confirmation.
---

# Draft: fix-batch-kol-logs

## Components (topology ledger)
| id | outcome (one line) | status | evidence |
|---|---|---|---|
| bug-1-config | `INGESTION_TELEGRAM_METADATA_CACHE_FILE=""` falls back to default path so KOL metadata cache writes succeed | active | `apps/backend/src/shared/common/config/app.config.ts:307-311` + `apps/backend/.env.dev:59` + `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts:33-36, 101` |
| bug-2-dev-backfill | `DevBackfillHook` silently skips KOLs the MTProto session can't resolve (instead of WARN-spamming per KOL) | active | `apps/backend/src/shared/common/dev-backfill.hook.ts:38-48` + `apps/backend/src/telegram/ingestion/kol/seeders/kol.seeder.ts:244-258` (reference pattern: `needsManualJoin`) |
| bug-3-address-validation | Invalid Solana CAs are rejected at construction time AND at the filter stage (no path to publish) | active | `apps/backend/src/token/identity/contract-address.vo.ts:44-49` + `apps/backend/src/token/vip-call-approval/domain/value-objects/vip-call-approval-reason.vo.ts:3-10` + `apps/backend/src/token/vip-call-approval/application/handlers/apply-vip-call-approval.use-case.ts:71-148` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Test strategy | TDD red-green per project's `programming` skill | AGENTS.md + programming skill mandate; repo has co-located `*.spec.ts` per BC | Yes — just spec ordering |
| Commit strategy | 1 PR, 3 atomic commits (one per bug) | AGENTS.md + git-master skill; each bug is independent and revertible in isolation | Yes |
| Don't touch existing `*.bug-exploration.spec.ts` files | Do NOT modify any of the 4 existing files | AGENTS.md (root + backend + telegram + shared) explicitly forbids | Yes (none intended) |
| Create new `apps/backend/src/shared/common/config/app.config.spec.ts` | YES — break new ground for env-var factory tests | No precedent exists (exploration confirmed); the gap is real and a regression test will catch this bug class again | Yes (remove if reviewer pushes back) |
| Use `*.bug-exploration.spec.ts` for the 3 regressions | YES — match project's sacred pattern (`Property N:` it-naming + MUST-FAIL JSDoc) | Convention observed at `token-approved-publish-ticker-bug-exploration.spec.ts:9-91` | Yes |

## Findings (cited - path:lines)

### Bug #1 — empty string env var bypasses `??` default

- **Symptom**: `[KolSeeder] Failed to cache metadata for <id>: ENOENT: no such file or directory, open ''` (5 instances, one per KOL without `seedTitle`)
- **Where it originates**: `apps/backend/src/telegram/ingestion/kol/seeders/kol.seeder.ts:208-213` — the `catch` around `this.metadataCache.upsert()` after MTProto resolves metadata
- **Why the path is empty**:
  - `apps/backend/src/shared/common/config/app.config.ts:307-311`:
    ```ts
    metadataCache: {
      filePath:
        process.env.INGESTION_TELEGRAM_METADATA_CACHE_FILE ??
        `${process.cwd()}/.cache/kol-metadata.json`,
    },
    ```
  - `apps/backend/.env.dev:59` sets `INGESTION_TELEGRAM_METADATA_CACHE_FILE=` (empty string)
  - `??` only falls back on `null`/`undefined`; empty string passes through
- **Consumer**: `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts:101` calls `fs.writeFile(this.filePath, ...)` with the empty string → Node throws ENOENT with empty path
- **Impact**: Seeder succeeds (metadata is returned to `RegisterKolUseCase`) but isn't persisted; next boot re-resolves via MTProto (~1-2s per KOL)

### Bug #2 — DevBackfillHook warns per KOL when MTProto session isn't a member

- **Symptom**: 14× `[DevBackfillHook] <id>: backfill failed — Could not find the input entity for {"userId":"...","className":"PeerUser"}`
- **Where it originates**: `apps/backend/src/shared/common/dev-backfill.hook.ts:44-47` — `catch` around `ingestion.backfillKol(kol.id, 5)` inside the per-KOL loop
- **Why it fires**: Hook runs only when `NODE_ENV=development` (line 18). For each ACTIVE KOL it tries to fetch 5 recent messages. Telethon's `getMessages(peer)` throws `Could not find the input entity` when the session's dialog list doesn't contain the peer (session not joined to channel). Link in logs: https://docs.telethon.dev/en/stable/concepts/entities.html
- **Reference pattern already in the repo**: `apps/backend/src/telegram/ingestion/kol/seeders/kol.seeder.ts:244-258` catches this exact error and increments `needsManualJoin` instead of warning per-id; emits a single summary log at end of seed

### Bug #3 — Invalid Solana address passes the whole pipeline

- **Symptom**: `[TokenApprovedPublishHandler] Publish-on-approval failed for solana:ajj2ksddh...asjpvv: Invalid Solana address: ajj2ksddh...`
- **Where it originates**: `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish.handler.ts:56` calls `NormalizedAddress.fromSolana(event.payload.address)` → throws `DomainError(INVALID_ADDRESS, ...)`
- **The validation that fires**: `apps/backend/src/token/identity/normalized-address.vo.ts:45-62` does `bs58.decode(raw)` and checks `decoded.length === 32`
- **The gap (defense in depth analysis)**:
  - **Construction gap**: `apps/backend/src/token/identity/contract-address.vo.ts:44-49` — `ContractAddress.fromSolana(raw)` does NOT validate; comment at line 18 delegates to caller. Used by 6 callsites including the KOL orchestrator (`kol-ingestion-orchestrator.use-case.ts:115`), parsing HTTP controller (`parsing.controller.ts:26`), and 4 TypeORM rehydration mappers.
  - **Filter gap**: `apps/backend/src/token/vip-call-approval/application/handlers/apply-vip-call-approval.use-case.ts:71-148` validates chain but NOT address. Reject reasons enum at `apps/backend/src/token/vip-call-approval/domain/value-objects/vip-call-approval-reason.vo.ts:3-10` has 7 codes — no `INVALID_ADDRESS`.
- **DDD ownership**: Both VOs (`NormalizedAddress`, `ContractAddress`) already live in `token/identity/` (verified). The project promoted `ChainId` and `TokenMetrics` to `shared/common/` but NOT these — keeping them in `token/identity/` is the de-facto pattern. **Do NOT promote** — would violate "Never share entities between BCs" anti-pattern (BCs already import across path-alias).
- **Existing sacred specs (DO NOT TOUCH)**:
  - `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-bug-exploration.spec.ts`
  - `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/token-approved-publish-ticker-bug-exploration.spec.ts`
  - `apps/backend/src/telegram/vip-calls/vip-channel/infrastructure/event-bus/ticker-null-bug-exploration.spec.ts`
  - `apps/backend/src/token/call-tracking/application/handlers/track-published-call-bug-exploration.spec.ts`
  - Verified: NONE of the 3 bugs intersect these files.

## Decisions (with rationale)

- **Bug #1 fix**: edit `app.config.ts:307-311` to treat empty string the same as `undefined`. Single 6-line patch; no behavior change for non-empty values.
- **Bug #2 fix**: extend `DevBackfillHook` to catch the Telethon `PeerUser`/`USER_NOT_PARTICIPANT` error specifically, log at `debug` once with the count, continue with next KOL. Mirrors `KolSeeder.needsManualJoin` pattern (line 250-258).
- **Bug #3 fix (subject to user veto)**: defense in depth (Option 3 from exploration):
  1. Validate `ContractAddress.fromSolana` (mirror `NormalizedAddress.fromSolana`)
  2. Add `INVALID_ADDRESS` to `VipCallApprovalReasonCode` enum
  3. Add first gate in `ApplyVipCallApprovalUseCase.execute` that runs `NormalizedAddress.fromSolana` and pushes `INVALID_ADDRESS` reason on throw
- **Test files to add** (no existing spec files to modify):
  - `apps/backend/src/shared/common/config/app.config.spec.ts` — empty-string fallback regression (breaks new ground; project's `shared/README.md` §16 acknowledges the gap)
  - `apps/backend/src/shared/common/dev-backfill.hook.spec.ts` — silence-on-PeerUser regression
  - `apps/backend/src/shared/common/dev-backfill.hook.bug-exploration.spec.ts` — sacred-pattern regression
  - `apps/backend/src/token/identity/contract-address.vo.spec.ts` — Solana validation regression
  - `apps/backend/src/token/identity/contract-address.vo.bug-exploration.spec.ts` — sacred-pattern regression
  - `apps/backend/src/token/vip-call-approval/application/handlers/apply-vip-call-approval.use-case.spec.ts` — INVALID_ADDRESS gate regression
  - `apps/backend/src/token/vip-call-approval/application/handlers/apply-vip-call-approval.use-case.bug-exploration.spec.ts` — sacred-pattern regression

## Scope IN
- 3 bug fixes per the user's "yes"
- TDD red-green for all 3
- 1 PR with 3 atomic commits (one per bug, in order: #1, #2, #3)

## Scope OUT (Must NOT have)
- Do NOT modify any existing `*.bug-exploration.spec.ts` (4 files listed above)
- Do NOT modify `apps/backend/.env.dev` to set a real path (would mask the factory bug; the fix must make the factory robust)
- Do NOT promote `ContractAddress` / `NormalizedAddress` to `shared/common/` (violates BC isolation anti-pattern)
- Do NOT change `NormalizedAddress.fromChainHint` swallow behavior at `normalized-address.vo.ts:64-77` (separate concern; silent-drop is documented behavior at `normalize-call.use-case.ts:48`)
- Do NOT add a DLQ / retry for invalid addresses (out of scope; rejection is enough)
- Do NOT change the `token-gating` → `vip-call-approval` rename history or alias legacy types
- Do NOT add logging/tracing for the leak source in extraction or orchestrator (the gap-closure at VO level makes it impossible)

## Resolved decisions (user-approved)
1. **Bug #3 scope**: Option 3 (defense in depth) — validate `ContractAddress.fromSolana` + add `INVALID_ADDRESS` to enum + add first gate in `ApplyVipCallApprovalUseCase`.
2. **Bug #2 approach**: Option (a) — catch-and-silence mirroring `KolSeeder.needsManualJoin` pattern.
3. **New `app.config.spec.ts`**: YES (adopted default, breaks new ground).

## Approval gate
status: plan-written
approval: user confirmed both forks on 2026-07-01; plan written to .omo/plans/fix-batch-kol-logs.md
pending-action: hand off to start-work or run high-accuracy review (user choice)