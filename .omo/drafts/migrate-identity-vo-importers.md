---
slug: migrate-identity-vo-importers
status: done
intent: clear
pending-action: none
approach: 3 phases (migrate NormalizedAddress → migrate ContractAddress → delete barrels). Mechanical sed + tsc/jest fixes for the `ContractAddress` API change (`.chain` → `.chainHint`).
---

## Execution summary (2026-06-25)

- **Phase 1**: perl -pi -e on 10 NormalizedAddress importers (path change only, API identical)
- **Phase 2**: perl -pi -e on 10 ContractAddress importers (path change; `.chain` → `.chainHint` API change had zero callers per plan analysis)
- **Phase 3**: rm 2 barrel files (normalized-address.vo.ts, contract-address.vo.ts)
- **Final diff**: 22 files (20 modified + 2 deleted), +20 -32 lines
- **Verification**: backend `tsc --noEmit` 0 errors + 58 suites / 452 tests pass; frontend 0 + 4 files / 53 tests pass

No surprises. Plan analysis (zero callers of old `.chain` prop) held true — no manual renames needed in Phase 2.

# Plan: migrate VO importers + delete deprecated barrels

## Context

Two deprecated barrel files re-export canonical VOs from the new `token/identity/` location. The barrels themselves are pure re-exports (3-5 lines each) marked `@deprecated`. New VOs at `token/identity/` are the canonical implementations; the barrels only exist as a transition aid.

### Deprecations to remove

| Barrel | Re-exports | Importers |
|---|---|---|
| `apps/backend/src/token/normalization/domain/value-objects/normalized-address.vo.ts` | `NormalizedAddress` from `token/identity/normalized-address.vo` | 10 files (normalization BC) |
| `apps/backend/src/token/intake/extraction/domain/value-objects/contract-address.vo.ts` | `ContractAddress` from `token/identity/contract-address.vo` | 10 files (extraction + parsing + kol-ingestion) |

### API compatibility analysis

**NormalizedAddress** — API compatible. Old and new both expose:
- `static fromEvm(raw): NormalizedAddress` → sets `chain: ChainFamily.EVM`
- `static fromSolana(raw): NormalizedAddress` → sets `chain: ChainFamily.SOLANA`
- `static fromChainHint(raw, chainHint)` → factory
- `get value(): string`
- `get chain(): ChainFamily`

→ Migration is purely mechanical: change import path, no behavior changes.

**ContractAddress** — API differs. Old prop `chain: Chain` was renamed to `chainHint: ChainHint`. Reason: extraction-stage `ContractAddress` may be `UNKNOWN` (caller hasn't resolved chain yet); the new type makes this explicit. Old code at `apps/backend/src/token/intake/parsing/api/http/parsing.controller.ts:25-26` already migrated to the new API.

| Method/prop | Old | New |
|---|---|---|
| `static fromEvm(raw)` | sets `chain: EVM` | sets `chainHint: ChainHint.EVM` |
| `static fromSolana(raw)` | sets `chain: SOLANA` | sets `chainHint: ChainHint.SOLANA` |
| `static fromUnknown(raw)` | (didn't exist or used different shape) | sets `chainHint: ChainHint.UNKNOWN` |
| `get chain()` | returned `Chain` | **removed** — use `chainHint` |
| `get chainHint()` | didn't exist | returns `ChainHint` |

→ Migration is mostly mechanical, BUT any caller using `.chain` must be updated to `.chainHint`.

### Direct `.chain`/`.chainHint` usage in codebase (only 2 hits)

- `apps/backend/src/token/intake/parsing/api/http/parsing.controller.ts:25-26` — already uses `.chainHint` ✓
- `apps/backend/src/token/normalization/infrastructure/persistence/typeorm/mappers/canonical-token-call.mapper.ts:48` — uses `NormalizedAddress.fromChainHint(row.address, row.chain)` (compatible — passes `row.chain` as `chainHint` string arg)

No other direct prop accesses. All other usages are import + factory calls, both API-compatible for `ContractAddress` too.

## Scope

### IN
- Update import path in 20 files (10 per VO)
- Delete 2 barrel files
- Verify tsc + jest + vitest green
- Commit

### OUT
- Renaming `chain` → `chainHint` in old call sites that don't exist (no callers use the old `.chain` prop on `ContractAddress`)
- Migrating the deprecated constants in `apply-filters.use-case.ts` (separate task — internal fallback, not urgent)
- Other deprecated markers (none)

## Approach options considered

**A. Mechanical sed (chosen)** — `sed -i 's|from .token/normalization/domain/value-objects/normalized-address.vo|from "token/identity/normalized-address.vo"|g'` then run tsc. Simple, low-risk for `NormalizedAddress` (100% API compatible). For `ContractAddress` we run tsc to catch any remaining `.chain` accesses (none expected per analysis above).

**B. Per-file PR review** — slower, no benefit since API is well-understood from grep.

**C. Delete barrels first, then fix breaks** — invites a wave of broken imports across 20 files at once, harder to review the diff in chunks.

Chose A: smallest diff per commit, fastest verification path.

## Phases

### Phase 1: migrate `NormalizedAddress` importers (10 files)

**Before (current)**:
```ts
import { NormalizedAddress } from 'token/normalization/domain/value-objects/normalized-address.vo';
```

**After**:
```ts
import { NormalizedAddress } from 'token/identity/normalized-address.vo';
```

**sed command** (run from repo root):
```bash
for f in \
  apps/backend/src/token/normalization/application/ports/canonical-token-call.repository.ts \
  apps/backend/src/token/normalization/application/handlers/normalize-call.use-case.spec.ts \
  apps/backend/src/token/normalization/application/handlers/get-canonical-call.use-case.ts \
  apps/backend/src/token/normalization/application/handlers/normalize-call.use-case.ts \
  apps/backend/src/token/normalization/infrastructure/repositories/in-memory-canonical-token-call.repository.ts \
  apps/backend/src/token/normalization/infrastructure/persistence/typeorm/repositories/typeorm-canonical-token-call.repository.ts \
  apps/backend/src/token/normalization/infrastructure/persistence/typeorm/mappers/canonical-token-call.mapper.ts \
  apps/backend/src/token/normalization/domain/value-objects/normalization-vos.spec.ts \
  apps/backend/src/token/normalization/domain/entities/canonical-token-call.entity.spec.ts \
  apps/backend/src/token/normalization/domain/entities/canonical-token-call.entity.ts
do
  sed -i 's|token/normalization/domain/value-objects/normalized-address.vo|token/identity/normalized-address.vo|g' "$f"
done
```

**Test impact** (3 spec files in this list):
- `normalize-call.use-case.spec.ts` — unit tests for normalization use case; only import changes
- `normalization-vos.spec.ts` — VO-specific tests; only import changes
- `canonical-token-call.entity.spec.ts` — entity tests; only import changes

**Verify after Phase 1** (expected: zero changes in behavior):
```bash
cd apps/backend && npx tsc --noEmit              # expect: 0 errors
cd apps/backend && npx jest --silent             # expect: 58 suites, 452 tests pass
cd apps/backend && npx jest normalization --silent  # targeted: 5-7 spec files, ~40 tests
```

If `tsc` reports `Cannot find module 'token/normalization/...'` — barrel still referenced somewhere; run the grep again to find the missed importer.
If `tsc` reports `Property 'chain' does not exist on type 'NormalizedAddress'` — would indicate a real API drift; investigate before proceeding.

### Phase 2: migrate `ContractAddress` importers (10 files)

**Before (current)**:
```ts
import { ContractAddress } from 'token/intake/extraction/domain/value-objects/contract-address.vo';
```

**After**:
```ts
import { ContractAddress } from 'token/identity/contract-address.vo';
```

**sed command**:
```bash
for f in \
  apps/backend/src/token/intake/parsing/api/http/parsing.controller.ts \
  apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.ts \
  apps/backend/src/token/intake/parsing/application/handlers/parse-from-candidates.use-case.spec.ts \
  apps/backend/src/token/intake/parsing/domain/value-objects/parsed-contract.vo.ts \
  apps/backend/src/token/intake/parsing/domain/entities/token-call.entity.ts \
  apps/backend/src/token/intake/extraction/application/handlers/extract-from-message.use-case.spec.ts \
  apps/backend/src/token/intake/extraction/infrastructure/adapters/regex-based-extractor.adapter.ts \
  apps/backend/src/token/intake/extraction/domain/ports/extractor.port.ts \
  apps/backend/src/token/intake/extraction/domain/entities/extraction-result.entity.ts \
  apps/backend/src/kol/ingestion/application/handlers/start-kol-ingestion.use-case.ts
do
  sed -i 's|token/intake/extraction/domain/value-objects/contract-address.vo|token/identity/contract-address.vo|g' "$f"
done
```

**Test impact** (2 spec files in this list):
- `parse-from-candidates.use-case.spec.ts` — parsing use case tests
- `extract-from-message.use-case.spec.ts` — extraction use case tests

**API drift check** (only `parsing.controller.ts:25-26` uses prop access):
```ts
// parsing.controller.ts:25-26 (already migrated)
if (c.chainHint === 'evm') return ContractAddress.fromEvm(c.value);
if (c.chainHint === 'solana') return ContractAddress.fromSolana(c.value);
```

No other `.chain` accesses exist on `ContractAddress` (verified via grep: `grep -rEn "\\.chain[^A-Za-z]" apps/backend/src/token/intake apps/backend/src/kol/ingestion` shows zero hits on `ContractAddress` instances).

**Verify after Phase 2**:
```bash
cd apps/backend && npx tsc --noEmit              # expect: 0 errors
cd apps/backend && npx jest --silent             # expect: 58 suites, 452 tests pass
cd apps/backend && npx jest extraction parsing --silent  # targeted
```

If `tsc` reports `Property 'chain' does not exist on type 'ContractAddress'` — that's the API drift we expected zero of; manually rename `.chain` → `.chainHint` in the offending file, re-run.

### Phase 3: delete barrels

```bash
rm apps/backend/src/token/normalization/domain/value-objects/normalized-address.vo.ts \
   apps/backend/src/token/intake/extraction/domain/value-objects/contract-address.vo.ts
```

No code changes — barrels were re-export only. tsc will catch any missed importer immediately.

**Verify after Phase 3**: same commands as Phase 2. Targets identical.

### Final verification

```bash
cd /Users/bryanstevens/dev/onchain-bot
git diff --stat                           # expect: 22 files changed, +20 -2 (or similar; no spec churn)

cd apps/backend && npx tsc --noEmit       # expect: 0 errors
cd apps/backend && npx jest --silent      # expect: 58 suites / 452 tests pass

cd apps/frontend && npx tsc --noEmit      # expect: 0 errors (no impact but cheap check)
cd apps/frontend && npx vitest run        # expect: 4 files / 53 tests pass
```

### Commit

Single atomic commit at the end of Phase 3:

```
refactor(token): migrate VO importers to token/identity/ + delete deprecated barrels

NormalizedAddress + ContractAddress have lived at token/identity/ for a while
now; the two barrel re-exports in normalization + extraction BCs only existed
as a migration aid. Move 20 importers (10 per VO) to the canonical path.

NormalizedAddress: pure import path change, API identical
  (chain: ChainFamily, factories fromEvm/fromSolana/fromChainHint).
ContractAddress: API had `chain` prop renamed to `chainHint` (ChainHint, which
adds an UNKNOWN variant for the extraction stage where chain isn't resolved
yet). Verified via grep that no caller uses the old `.chain` prop on
ContractAddress — parsing.controller.ts:25-26 already used the new API.

Files touched:
  - 10 NormalizedAddress importers (normalization BC: handlers, repos, mappers, specs)
  - 10 ContractAddress importers (extraction + parsing + kol/ingestion)
  - 2 barrel deletions
```

### Diff size estimate

- ~20 import lines (1 line per file)
- 2 file deletions
- Total: ~22 files, ~20 lines added, ~6 lines deleted (barrel content)

No spec logic changes, no entity changes, no API surface changes beyond the 1 expected prop rename (which has zero callers).

## Risk analysis

| Risk | Probability | Impact | Mitigation | Detection |
|---|---|---|---|---|
| Hidden `.chain` access on `ContractAddress` missed by grep | Very low | tsc error blocks Phase 2 | tsc catches it; manual fix `.chain` → `.chainHint` | `tsc --noEmit` after sed |
| `NormalizeAddress.fromChainHint` signature changed since barrel was written | Very low (verified by reading both VOs) | tsc error blocks Phase 1 | tsc catches it | `tsc --noEmit` after sed |
| Circular import introduced by direct import from `token/identity/` | Very low (identity is a leaf BC) | tsc error | tsc catches it | `tsc --noEmit` |
| Behavior change in NormalizedAddress construction | None — API identical (verified) | n/a | n/a | n/a |
| Specs reference the old barrel path beyond what `grep -rln` caught | Low (grep covers `.ts` files; spec files are `.spec.ts` but grep includes them by default) | tsc error | `sed` updates specs in same pass; tsc catches any miss | `tsc --noEmit` |
| Missed importer after Phase 3 (barrel deleted, importer still references it) | Very low (grep is exhaustive for the 2 specific paths) | tsc error | tsc catches it; revert via `git checkout` if needed | `tsc --noEmit` after `rm` |
| Test assertion that constructs `ContractAddress.fromSolana(x)` expecting `chain: Chain.SOLANA` | Very low (tests use factory, not direct prop comparison) | 1-2 test failures | Jest report shows the exact test; revert + investigate | `jest --silent` after Phase 2 |
| TypeORM column mapping breaks (e.g., mapper accesses `.chain` for serialization) | Very low (only 2 mappers exist; both use `NormalizedAddress.fromChainHint`) | runtime serialization bug | `jest` integration tests catch it | `jest` for normalization + persistence suites |
| Frontend breakage | None (frontend doesn't import backend VOs) | n/a | n/a | n/a |

**Net risk profile**: low. All risks are caught by `tsc --noEmit` within seconds of the sed. No runtime risk expected.

## Reversibility

Each phase is independently reversible via `git checkout -- <files>` on the modified files. Specifically:

- After Phase 1: `git checkout -- apps/backend/src/token/normalization/` restores all 10 modified files
- After Phase 2: `git checkout -- apps/backend/src/token/intake/ apps/backend/src/kol/ingestion/` restores all 10 modified files
- After Phase 3: `git checkout -- apps/backend/src/token/normalization/domain/value-objects/normalized-address.vo.ts apps/backend/src/token/intake/extraction/domain/value-objects/contract-address.vo.ts` restores the 2 barrels

If Phase 2 reveals unexpected breakage (e.g., tsc reports `.chain` accesses I missed), the recovery procedure is:
1. Note the file:line from tsc output
2. Open that file, rename `address.chain` to `address.chainHint`
3. Re-run `tsc --noEmit`
4. Continue Phase 2

If after Phase 3 a previously-unknown importer is found (tsc fails), recovery is:
1. `git checkout -- <the 2 barrels>` to restore them
2. Re-add the missed importer to the sed loop
3. Redo Phase 3

Both recoveries are < 5 minutes.

## Out of scope (future tasks)

- Remove deprecated `DEFAULT_FILTER_CONFIG` + `PUBLISHABLE_CHAINS` constants in `apply-filters.use-case.ts` (separate task — internal fallback, not urgent; needs investigation of callers first)
- Any other `@deprecated` markers in the codebase (none others found in src)