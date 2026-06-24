---
slug: consolidate-telegram-bc
status: executing
intent: clear
pending-action: none — user approved plan, execution in progress (waves 1-5 + F1-F4)
approach: 5-phase atomic refactor — (W1) migrate stale token/* imports from telegram-kol → kol; (W2) strip obsolete tsconfig/package.json aliases + rename .cache filename; (W3) fix frontend endpoints.ts; (W4) git rm -rf three obsolete trees; (W5) full doc sweep Completo; (FV) agent-executed QA + F1-F4.
execution-status:
  W1-T1: in_progress
  W2-T2: pending
  W2-T3: pending
  W3-T4: pending
  W4-T5: pending
  W4-T6: pending
  W4-T7: pending
  W5-T8: pending
  W5-T9: pending
  W5-T10: pending
  W5-T11: pending
  W5-T12: pending
  W5-T13: pending
---

# Draft: consolidate-telegram-bc

## Components (topology ledger)

| id | outcome (one line) | status | evidence path |
|----|--------------------|--------|---------------|
| C1 | `src/token/*` modules stop importing from `telegram-kol/*`; all 9 stale imports migrated to `kol/*` | active | grep search in `apps/backend/src/token/**` |
| C2 | `tsconfig.json` paths + `package.json` moduleNameMapper no longer reference `telegram-kol/*`, `telegram-publishing/*`, `telegram-lib*`; `kol/*` and `telegram/*` retained | active | `apps/backend/tsconfig.json:14-31` and `apps/backend/package.json:93-112` |
| C3 | `.cache/telegram-kol-metadata.json` default filename renamed to `.cache/kol-metadata.json` in app.config.ts + json-resolved-kol-metadata.repository.ts docstring + kol.seeder.ts docstring + any READMEs that mention it | active | `apps/backend/src/shared/common/config/app.config.ts:252` + `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts:16` + `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts` |
| C4 | `git rm -rf` three obsolete trees: `apps/backend/src/telegram-kol/`, `apps/backend/src/telegram-publishing/`, `apps/backend/src/telegram-lib/` | blocked-by C1+C2+C3 | `apps/backend/src/telegram-kol/` (44 files), `apps/backend/src/telegram-publishing/` (8 files), `apps/backend/src/telegram-lib/` (1 file) |
| C5 | `apps/frontend/src/shared/api/endpoints.ts` publishing path fixed from `/telegram-publishing/...` → `/vip-calls/...` to align with backend `@Controller('vip-calls')` | active | `apps/frontend/src/shared/api/endpoints.ts:10-15` |
| C6 | Documentation sweep: `apps/backend/README.md`, `apps/frontend/README.md`, root `README.md`, all `docs-money/*.md`, all `docs/monetization/*.md`, `kol-refactor.md`, `name-refactor.md`, `optimize.md`, `apps/backend/src/kol/*/README.md`, `apps/backend/src/telegram/*/README.md`, plus stale comments inside `token/*` referencing `telegram-kol/` paths | active | 20+ files across the repo |
| C7 | Verification: TypeScript compile (no errors), all 306 Jest tests pass, lint clean, grep audit confirms zero remaining `telegram-kol\|telegram-publishing\|telegram-lib` references except in `docs/monetization/` historical archive, smoke-test POST `/vip-calls/publish` and GET `/vip-calls/calls/recent` on dev boot | blocked-by C4+C5+C6 | `apps/backend/jest.setup.ts`, `apps/backend/package.json:14-19` |

## Open assumptions (announced defaults)

| assumption | adopted default | rationale | reversible? |
|------------|-----------------|-----------|-------------|
| HTTP path preservation for `kol/*` controllers | KEEP `@Controller('telegram-kol/identity'\|'telegram-kol/reputation'\|'telegram-kol/stats')` as-is | Frontend already hits these paths; no migration of frontend client needed | YES — could change to `/kol/...` in a future PR |
| HTTP path preservation for `vip-calls-channel` controller | CHANGE frontend to align with backend (`@Controller('vip-calls')`) instead of changing the backend path | User chose "update endpoints.ts in this PR" | YES — one frontend file change |
| `telegram-lib/` stubs + aliases removal | REMOVE the directory AND the 4 alias entries (2 in tsconfig, 2 in package.json) | Zero importers found in source code; aliases are dead weight | YES — git revert |
| `telegram/(events\|client\|errors\|tl\|crypto)` aliases to `node_modules/telegram` | KEEP | Real gramJS subpath imports used by `kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts` and `scripts/telegram-gen-session.ts` | n/a |
| Tests after refactor | tests-after via `npm run test:backend` (Jest 30, 306 tests) | Pure refactor — existing tests are the regression net | n/a |
| Plan shape | Single PR with multiple logical commits per phase (F1→F5) | Atomic semantic change; easier to review and revert as a unit | YES — could split into N PRs |
| `telegram/index.ts` barrel file | LEAVE the barrel file (currently unused by any importer); it's harmless and documents the public API of `telegram/` | Zero importers means zero risk; preserves discoverability | YES — can delete later if unused |
| `telegram-publishing/index.ts` and `telegram-publishing/publishing.module.ts` | DELETE (they're part of the obsolete tree) | Entire tree goes in C4 | n/a |

## Findings (cited - path:lines)

### F1. State of the four directories

| dir | role | imported by app.module.ts? | external importers | verdict |
|-----|------|----------------------------|--------------------|---------|
| `src/telegram/` | shared + vip-calls-channel + chain-dexter-bot | YES (lines 18-19) | dashboard/*, database.module.ts, itself | KEEP (already canonical) |
| `src/telegram-kol/` | KOL BCs (identity, ingestion, reputation, source, stats) | NO | 9 stale imports in `token/*` (C1) + 1 in `token/intake/*` comments | DELETE (after C1) |
| `src/telegram-publishing/` | shared (dup) + vip-calls (dup) | NO | 0 (only self-references in 7 files) | DELETE |
| `src/telegram-lib/` | stub classes (TelegramClient, StringSession, NewMessage) | NO | 0 source-file importers | DELETE |

### F2. Stale `token/*` imports to migrate (C1)

| file:line | current import | replacement |
|-----------|----------------|-------------|
| `apps/backend/src/token/scoring/domain/ports/kol-reputation.port.ts:1` | `from 'telegram-kol/source/domain/value-objects/source-type.vo'` | `from 'kol/source/domain/value-objects/source-type.vo'` |
| `apps/backend/src/token/call-tracking/application/handlers/evaluate-call-performance.use-case.ts:1-6` | 3 imports from `telegram-kol/reputation/...` | `from 'kol/reputation/...'` |
| `apps/backend/src/token/scoring/scoring.module.ts:18` | `from 'telegram-kol/reputation/reputation.module'` | `from 'kol/reputation/reputation.module'` |
| `apps/backend/src/token/scoring/infrastructure/adapters/default-kol-reputation.adapter.ts:4-5` | 2 imports from `telegram-kol/reputation/...` | `from 'kol/reputation/...'` |
| `apps/backend/src/token/scoring/infrastructure/adapters/default-kol-reputation.adapter.spec.ts:2-4` | 3 imports from `telegram-kol/reputation/...` | `from 'kol/reputation/...'` |
| `apps/backend/src/token/normalization/domain/entities/canonical-token-call.entity.ts:7` | `from 'telegram-kol/source/domain/value-objects/source.vo'` | `from 'kol/source/domain/value-objects/source.vo'` |
| `apps/backend/src/token/normalization/infrastructure/persistence/typeorm/mappers/canonical-token-call.mapper.ts:3` | same as above | same |

Comments-only updates (no code change): `token/scoring/domain/value-objects/kol-reputation-summary.vo.ts:14`, `token/intake/extraction/extraction.module.ts:28`, `token/intake/parsing/parsing.module.ts:22`.

### F3. Tsconfig + package.json config changes (C2)

`apps/backend/tsconfig.json:14-31` — REMOVE:
```
"telegram-kol/*": ["src/telegram-kol/*"],
"telegram-publishing/*": ["src/telegram-publishing/*"],
"telegram-lib/*": ["src/telegram-lib/*"],
"telegram-lib": ["src/telegram-lib/index.ts"]
```

`apps/backend/package.json:93-112` — REMOVE from moduleNameMapper:
```
"^telegram-kol/(.*)$": "<rootDir>/src/telegram-kol/$1",
"^telegram-publishing/(.*)$": "<rootDir>/src/telegram-publishing/$1",
"^telegram-lib/(.*)$": "<rootDir>/node_modules/telegram/$1",
"^telegram-lib$": "<rootDir>/node_modules/telegram/index",
```

KEEP the `^telegram/(events|client|errors|tl|crypto)$` entries — these alias to `node_modules/telegram/...` (real gramJS package) and are imported by `kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts:8-10` and `scripts/telegram-gen-session.ts:2`.

### F4. Cache filename rename (C3)

| file | line | change |
|------|------|--------|
| `apps/backend/src/shared/common/config/app.config.ts` | 252 | `${process.cwd()}/.cache/telegram-kol-metadata.json` → `${process.cwd()}/.cache/kol-metadata.json` |
| `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts` | 16 | `<repo-root>/.cache/telegram-kol-metadata.json` → `<repo-root>/.cache/kol-metadata.json` |
| `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts` | comment mentions `.cache/telegram-kol-metadata.json` | same rename |

If `INGESTION_TELEGRAM_METADATA_CACHE_FILE` env var is set to the old filename in `.env`, leave it; only rename the default in app.config.ts.

### F5. Frontend fix (C5)

`apps/frontend/src/shared/api/endpoints.ts:10-15`:
- Line 10: `published: '/telegram-publishing/calls/published'` → `published: '/vip-calls/calls/published'`
- Line 11: `failed: '/telegram-publishing/calls/failed'` → `failed: '/vip-calls/calls/failed'`
- Line 12: `recent: '/telegram-publishing/calls/recent'` → `recent: '/vip-calls/calls/recent'`
- Line 14: `/telegram-publishing/calls/${chain}/${address}` → `/vip-calls/calls/${chain}/${address}`
- Line 15: `publish: '/telegram-publishing/publish'` → `publish: '/vip-calls/publish'`

### F6. Doc sweep inventory (C6)

Files with `telegram-kol\|telegram-publishing\|telegram-lib` references (sorted by importance):

**Critical (will mislead new devs):**
- `apps/backend/README.md` — section 1 pipeline diagram, section 2 BC table, section 4 endpoints, section 5 DB tables, section 8 status
- `apps/frontend/README.md` — section 4 endpoint table, section 7 known bugs
- `README.md` (root) — section 2 BC table
- `apps/backend/src/kol/identity/README.md` — Routes table and See also section
- `apps/backend/src/kol/reputation/README.md` — Routes table and See also section
- `apps/backend/src/kol/ingestion/README.md` — See also section
- `apps/backend/src/kol/source/README.md` — See also section
- `apps/backend/src/kol/stats/README.md` — Routes table and See also section

**Important (will mislead ops/decision makers):**
- `kol-refactor.md` (repo root, 562 lines, the original consolidation plan) — references everywhere; mark as "superseded by `consolidate-telegram-bc` plan, see `.omo/plans/consolidate-telegram-bc.md`" or move to `docs/proyect/archive/`
- `name-refactor.md` (apps/backend) — same treatment
- `optimize.md` (repo root) — lines 90, 132, 165-167 reference `telegram-kol/...` files; rewrite to point at `kol/...`

**Reference docs (lower priority but in scope per user "Completo"):**
- `docs-money/01-telegram-tos-summary.md` (file tree, sections 3-5)
- `docs-money/02-monetization-options.md` (15 occurrences)
- `docs-money/03-dos-and-donts.md` (sections 3.1, 3.2)
- `docs-money/04-architecture-gaps.md` (multiple)
- `docs-money/05-kol-onboarding-legal-limits-and-monetization.md` (sections on reputation/stats)
- `docs-money/06-rate-limits-verified.md` (file path comments)
- `docs-money/fix-1/problem.md`, `docs-money/fix-1/solution.md` (code examples)
- `docs-money/kols/README.md` (formatter design)
- `docs-money/README.md` (file table)
- `docs/monetization/*` (10 files, mirrors of docs-money)

**Code-comment-only:**
- `token/intake/extraction/extraction.module.ts:28`, `token/intake/parsing/parsing.module.ts:22`
- `token/scoring/domain/value-objects/kol-reputation-summary.vo.ts:14`

### F7. Verification surface (C7)

| check | command | success criterion |
|-------|---------|-------------------|
| TypeScript compile | `cd apps/backend && npx tsc --noEmit` | exit 0, 0 errors |
| Backend tests | `cd apps/backend && npm test -- --silent` | 306/306 pass, 0 fail |
| Lint | `cd apps/backend && npm run lint` | exit 0 |
| Audit | `rg -n "telegram-(kol\|publishing\|lib)" apps/backend/src` | only `docs/monetization/` historical archive matches |
| Frontend type-check | `cd apps/frontend && npx tsc --noEmit` | exit 0 |
| Smoke boot | `cd apps/backend && npm run dev` then `curl http://localhost:3030/vip-calls/calls/recent?limit=5` | 200 with array payload |
| Frontend build | `cd apps/frontend && npm run build` | exit 0 |

## Decisions (with rationale)

1. **Single PR with 5 logical commits** — atomic semantic change; revert-friendly; review burden lower than N PRs of the same theme.
2. **Keep the `telegram/` barrel index.ts** — zero importers but documents public API; deletion can come later if desired.
3. **Frontend path fix is in-scope** (per user "Actualizar endpoints.ts en este mismo PR") — small, contained, related to backend cleanup.
4. **`.cache/kol-metadata.json`** (per user "Renombrar") — explicit owner-decision; existing cache will be re-populated by next run, accepted data loss.
5. **Doc sweep is Completo** (per user) — ~40 files touched but mechanical sed-style replacements for most; README/comment rewrites are the creative part.
6. **HTTP backward compat for KOL controllers** — `@Controller('telegram-kol/...')` preserved; frontend untouched for KOL endpoints (only publishing needs the path fix).

## Scope IN

- Migrate 9 stale `token/*` imports to `kol/*` paths
- Rename `.cache/telegram-kol-metadata.json` → `.cache/kol-metadata.json` (default in code + 2 docstring references)
- Remove 5 stale tsconfig paths and 4 stale package.json moduleNameMapper entries
- `git rm -rf` `apps/backend/src/telegram-kol/`, `apps/backend/src/telegram-publishing/`, `apps/backend/src/telegram-lib/`
- Fix 5 lines in `apps/frontend/src/shared/api/endpoints.ts` (`/telegram-publishing/...` → `/vip-calls/...`)
- Update READMEs (`apps/backend`, `apps/frontend`, root, all `kol/*/README.md`)
- Update `kol-refactor.md`, `name-refactor.md`, `optimize.md` (mark superseded or rewrite paths)
- Update all `docs-money/*.md` and `docs/monetization/*.md` paths
- Update code comments in `token/intake/extraction/extraction.module.ts:28`, `token/intake/parsing/parsing.module.ts:22`, `token/scoring/domain/value-objects/kol-reputation-summary.vo.ts:14`
- Verify via tsc, jest, lint, grep audit, smoke curl, frontend build

## Scope OUT (Must NOT have)

- NO changes to HTTP controllers (paths preserved as-is)
- NO changes to KOL frontend endpoints (`/telegram-kol/...` paths stay)
- NO changes to the npm `telegram` package alias (`telegram/events|client|errors|tl|crypto` remain aliased to `node_modules/telegram`)
- NO changes to the `telegram/` directory structure (it already matches the desired state)
- NO behavior changes — pure refactor + deletion
- NO new tests — existing 306-test Jest suite is the regression net
- NO new dependencies
- NO database migrations (the `kol_*` tables are unchanged)
- NO archive/move of `kol-refactor.md` / `name-refactor.md` to a new folder — just edit in place to mark superseded (keep history grep-able)
- NO changes to `telegram/index.ts` barrel (zero importers, leave for now)

## Open questions

(none — all owner-decisions resolved in the interview)

## Approval gate
status: awaiting-approval
<!-- Brief presented and `status: awaiting-approval` recorded: wait. Do not re-explore unless the user changes scope. -->