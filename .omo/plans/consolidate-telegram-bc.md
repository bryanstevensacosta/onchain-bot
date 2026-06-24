# consolidate-telegram-bc - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Three obsolete Telegram code trees removed (`src/telegram-kol/`, `src/telegram-publishing/`, `src/telegram-lib/`). All ~9 stale imports across the token pipeline migrated to the canonical `kol/` paths. Frontend vip-calls endpoints aligned with the backend controller. Configuration (tsconfig + jest moduleNameMapper) cleaned of dead aliases. Cache filename renamed to match the new BC location. ~52 docs (READMEs, design docs, legal/ToS docs) updated so the repo never lies about where the code lives.

**Why this approach:** The repo already has the desired `src/telegram/` shape (shared + vip-calls-channel + chain-dexter-bot) — the canonical structure is in `app.module.ts`. The "refactor" is really a *cleanup of orphans*: stale imports, dead aliases, duplicated trees, outdated docs. One atomic PR with logical commits per phase keeps it review-friendly and revert-safe.

**What it will NOT do:** No HTTP path changes on the backend. No behavior changes. No new tests (the existing 306-test Jest suite is the regression net). No new dependencies. No DB migrations. No archival of `kol-refactor.md` / `name-refactor.md` (edited in place to mark superseded, keeps git blame intact).

**Effort:** Medium
**Risk:** Low — pure refactor, no behavior change, full test suite + grep audit gate every phase
**Decisions to sanity-check:** Single PR vs split; keep `.cache/telegram-kol-metadata.json` filename semantics (now `.cache/kol-metadata.json`, re-populated on next run); frontend `/vip-calls/...` change.

Your next move: Approve the plan. Then `/start-work` to execute it with parallel subagents.

---

> TL;DR (machine): 5-wave atomic refactor (13 todos) — migrate token/* imports, clean config + cache, fix frontend paths, delete 3 obsolete src trees, doc sweep Completo. Agent-executed QA per todo + final F1-F4 wave.

## Scope
### Must have
- Migrate 9 stale `telegram-kol/*` imports in `apps/backend/src/token/{scoring,call-tracking,normalization}/**` to `kol/*` paths.
- Update 3 stale code comments in `apps/backend/src/token/intake/{extraction,parsing}/*.module.ts` and `apps/backend/src/token/scoring/domain/value-objects/kol-reputation-summary.vo.ts` to reference `kol/` instead of `telegram-kol/`.
- Remove 5 obsolete `paths` entries from `apps/backend/tsconfig.json` (`telegram-kol/*`, `telegram-publishing/*`, `telegram-lib/*`, `telegram-lib`).
- Remove 4 obsolete `moduleNameMapper` entries from `apps/backend/package.json` (`^telegram-kol/`, `^telegram-publishing/`, `^telegram-lib/`, `^telegram-lib$`).
- Rename the default `.cache/telegram-kol-metadata.json` → `.cache/kol-metadata.json` in `apps/backend/src/shared/common/config/app.config.ts:252` + 2 docstrings in `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts:16` and `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts` (only if that comment exists).
- Update 5 lines in `apps/frontend/src/shared/api/endpoints.ts` from `/telegram-publishing/...` → `/vip-calls/...` (lines 10-15).
- `git rm -rf apps/backend/src/telegram-kol/` (44 files).
- `git rm -rf apps/backend/src/telegram-publishing/` (8 files).
- `git rm -rf apps/backend/src/telegram-lib/` (1 file).
- Update READMEs: `apps/backend/README.md`, `apps/frontend/README.md`, root `README.md`, all 5 files in `apps/backend/src/kol/*/README.md`.
- Mark `kol-refactor.md` (root) and `apps/backend/name-refactor.md` as superseded.
- Update `optimize.md` to use `kol/*` paths.
- Update all 10 `docs-money/*.md` files (replace `telegram-kol/` → `kol/` and `telegram-publishing/` → `telegram/vip-calls-channel/` + `telegram/shared/`).
- Update all 10 `docs/monetization/*.md` files (same renames; treat as mirror of `docs-money/`).
- Final verification: `tsc --noEmit`, `npm run test:backend`, `npm run lint`, `rg "telegram-(kol|publishing|lib)" apps/backend/src`, frontend `tsc --noEmit`, `npm run build` (frontend), smoke `curl /vip-calls/calls/recent?limit=5`.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- NO changes to HTTP controller paths (`@Controller('telegram-kol/identity')`, `@Controller('telegram-kol/reputation')`, `@Controller('telegram-kol/stats')`, `@Controller('vip-calls')`, `@Controller('chain-dexter')` all preserved verbatim).
- NO changes to the `^telegram/(events|client|errors|tl|crypto)$` moduleNameMapper entries — these alias to the real `node_modules/telegram` (gramJS) package and are imported by `kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts:8-10` and `scripts/telegram-gen-session.ts:2`.
- NO removal of `apps/backend/src/telegram/index.ts` barrel (zero importers, but documents the public API; harmless).
- NO removal of `apps/backend/src/telegram/shared/index.ts` barrel (heavily imported).
- NO behavior changes anywhere — pure refactor + deletion.
- NO new tests, NO new dependencies, NO DB migrations.
- NO archival/move of `kol-refactor.md` / `name-refactor.md` / `optimize.md` to a different folder — edit in place so git blame remains intact.
- NO cosmetic rewrites of unrelated content in the doc files — only the path/BC name substitutions.
- NO changes to `apps/backend/src/shared/README.md` (it already uses correct `kol/*` references).
- NO touches to `apps/backend/src/telegram-kol-metadata.json` files in `.cache/` — they will simply not be regenerated by code; if they exist at runtime, they become orphaned (acceptable: next ingestion run creates the new `.cache/kol-metadata.json` file from scratch).

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after + Jest 30 (existing 306 tests) — pure refactor, no new behavior to test.
- Per-todo QA: each todo carries a `tsc --noEmit` and/or `npm test` command in its Acceptance criteria. Final-wave additionally runs `rg` audit, frontend `tsc --noEmit`, frontend `npm run build`, and a smoke `curl`.
- Evidence: `.omo/evidence/task-<N>-consolidate-telegram-bc.<ext>` per todo (one file per todo; bash output captured).
- Final verification wave (F1-F4) is planner-side, not worker-side: F1 plan-compliance audit, F2 code-quality review, F3 manual-QA, F4 scope-fidelity — all run by orchestrator after the worker reports complete.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

**Wave 1 — Code migration (sequential, blocking)** — 1 todo
- T1: Migrate 9 stale `telegram-kol/*` imports + 3 stale comments in `token/*` → `kol/*` paths. Verify `tsc --noEmit` + `npm test` pass.

**Wave 2 — Config & cache rename (sequential within wave, blocking)** — 2 todos
- T2: Strip 5 tsconfig paths + 4 package.json moduleNameMapper entries. Verify tsc + jest resolve.
- T3: Rename `.cache/telegram-kol-metadata.json` → `.cache/kol-metadata.json` in 3 files. Verify tsc passes.

**Wave 3 — Frontend fix (sequential, blocking)** — 1 todo
- T4: Update 5 lines in `apps/frontend/src/shared/api/endpoints.ts`. Verify frontend `tsc --noEmit` passes.

**Wave 4 — Deletion (sequential, blocking — must run in order)** — 3 todos
- T5: `git rm -rf apps/backend/src/telegram-kol/`. Verify no dangling refs + tests pass.
- T6: `git rm -rf apps/backend/src/telegram-publishing/`. Verify no dangling refs + tests pass.
- T7: `git rm -rf apps/backend/src/telegram-lib/`. Verify no dangling refs + tests pass.

**Wave 5 — Doc sweep Completo (sequential within wave; partial parallel possible)** — 6 todos
- T8: Update `apps/backend/README.md`, `apps/frontend/README.md`, root `README.md`.
- T9: Update all 5 `apps/backend/src/kol/*/README.md`.
- T10: Mark `kol-refactor.md` and `apps/backend/name-refactor.md` as superseded (prepend a notice banner; keep history intact).
- T11: Update `optimize.md` paths (lines 90, 132, 165-167).
- T12: Update all 10 `docs-money/*.md` files.
- T13: Update all 10 `docs/monetization/*.md` files.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| T1 | nothing | T2, T3, T5 | nothing (first) |
| T2 | T1 | T5, T6 | T3 (different files: tsconfig vs app.config) |
| T3 | T1 | nothing | T2 |
| T4 | nothing (independent frontend file) | nothing | T1, T2, T3 (parallel-safe across workspaces) |
| T5 | T1, T2 | T6, T7 | T4 |
| T6 | T5 | T7 | T4 |
| T7 | T5, T6 | T8-T13 | T4 |
| T8 | T7 | nothing | T9, T10, T11, T12, T13 |
| T9 | T7 | nothing | T8, T10, T11, T12, T13 |
| T10 | T7 | nothing | T8, T9, T11, T12, T13 |
| T11 | T7 | nothing | T8, T9, T10, T12, T13 |
| T12 | T7 | nothing | T8, T9, T10, T11, T13 |
| T13 | T7 | F1-F4 | T8, T9, T10, T11, T12 |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. **Migrate stale `telegram-kol/*` imports in `token/*` to `kol/*` paths and update 3 stale comments**
  What to do / Must NOT do:
  - DO: change the 9 `from 'telegram-kol/...'` imports across the 7 files listed below to the equivalent `from 'kol/...'` path.
  - DO: rewrite the 3 stale `telegram-kol/...` text references in comments to `kol/...` (no semantic change to comments otherwise).
  - DO NOT: rename classes, types, methods, value objects, or files.
  - DO NOT: touch any `import` from `kol/` (already canonical).
  - DO NOT: touch `apps/backend/src/telegram-kol/` (deleted in T5).
  Parallelization: Wave 1 | Blocked by: nothing | Blocks: T2, T3, T5
  References (executor has NO interview context - be exhaustive):
  - `apps/backend/src/token/scoring/domain/ports/kol-reputation.port.ts:1` — `import { SourceType } from 'telegram-kol/source/domain/value-objects/source-type.vo';` → `'kol/source/domain/value-objects/source-type.vo'`
  - `apps/backend/src/token/scoring/scoring.module.ts:18` — `import { ReputationModule } from 'telegram-kol/reputation/reputation.module';` → `'kol/reputation/reputation.module'`
  - `apps/backend/src/token/scoring/infrastructure/adapters/default-kol-reputation.adapter.ts:4-5` — 2 imports from `'telegram-kol/reputation/...'` → `'kol/reputation/...'`
  - `apps/backend/src/token/scoring/infrastructure/adapters/default-kol-reputation.adapter.spec.ts:2-4` — 3 imports from `'telegram-kol/reputation/...'` → `'kol/reputation/...'`
  - `apps/backend/src/token/scoring/domain/value-objects/kol-reputation-summary.vo.ts:14` — comment `telegram-kol/reputation` → `kol/reputation`
  - `apps/backend/src/token/call-tracking/application/handlers/evaluate-call-performance.use-case.ts:1-6` — 3 imports from `'telegram-kol/reputation/...'` → `'kol/reputation/...'`
  - `apps/backend/src/token/normalization/domain/entities/canonical-token-call.entity.ts:7` — `import { Source } from 'telegram-kol/source/domain/value-objects/source.vo';` → `'kol/source/domain/value-objects/source.vo'`
  - `apps/backend/src/token/normalization/infrastructure/persistence/typeorm/mappers/canonical-token-call.mapper.ts:3` — same as above
  - `apps/backend/src/token/intake/extraction/extraction.module.ts:28` — comment `(telegram-kol/ingestion/)` → `(kol/ingestion/)`
  - `apps/backend/src/token/intake/parsing/parsing.module.ts:22` — comment `(telegram-kol/ingestion/)` → `(kol/ingestion/)`
  Acceptance criteria (agent-executable):
  - `rg -n "from ['\"]telegram-kol/" apps/backend/src/token` returns 0 matches.
  - `rg -n "telegram-kol/" apps/backend/src/token` returns 0 matches (covers both imports and comments).
  - `cd apps/backend && npx tsc --noEmit` exits 0.
  - `cd apps/backend && npm test -- --silent` exits 0 with `306 passed, 306 total`.
  QA scenarios:
  - **Happy**: All 9 imports + 3 comments updated; tsc passes; 306 tests pass. Evidence: `.omo/evidence/task-1-consolidate-telegram-bc.txt` capturing both `tsc` and `jest --silent` output.
  - **Failure**: An import path typo → `tsc --noEmit` exits with `TS2307: Cannot find module`. Self-fix: re-read the canonical `kol/*` path from the destination file's directory tree (`apps/backend/src/kol/{source,reputation,ingestion}/...`).
  Commit: Y | `refactor(token): migrate stale telegram-kol imports to kol`

- [ ] 2. **Strip obsolete path entries from `apps/backend/tsconfig.json` and `apps/backend/package.json`**
  What to do / Must NOT do:
  - DO: remove the 5 `paths` entries in `apps/backend/tsconfig.json` (lines 23, 24, 29, 30) and any other `telegram-kol/*` / `telegram-publishing/*` / `telegram-lib*` lines.
  - DO: remove the 4 `moduleNameMapper` entries in `apps/backend/package.json` (lines 106, 107, 94, 95) — the `^telegram-kol/(.*)$`, `^telegram-publishing/(.*)$`, `^telegram-lib/(.*)$`, `^telegram-lib$`.
  - DO: keep the 5 `^telegram/(events|client|errors|tl|crypto)$` entries — they alias to the real `node_modules/telegram` (gramJS) and are USED by `apps/backend/src/kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts:8-10` and `apps/backend/scripts/telegram-gen-session.ts:2`.
  - DO NOT: remove any `kol/*`, `chain/*`, `token/*`, `telegram/*`, `shared/*`, `dashboard/*`, `settings/*` paths.
  - DO NOT: add or change any other jest config or tsconfig compiler option.
  Parallelization: Wave 2 | Blocked by: T1 | Blocks: T5, T6
  References:
  - `apps/backend/tsconfig.json:14-31` — `paths` object. Remove keys exactly: `telegram-kol/*`, `telegram-publishing/*`, `telegram-lib/*`, `telegram-lib`. Keep all other keys.
  - `apps/backend/package.json:93-112` — `moduleNameMapper` object. Remove keys exactly: `^telegram-kol/(.*)$`, `^telegram-publishing/(.*)$`, `^telegram-lib/(.*)$`, `^telegram-lib$`. Keep all other keys (especially `^telegram/(events|client|errors|tl|crypto)$` and `^kol/`, `^token/`, `^shared/`, etc.).
  Acceptance criteria:
  - `rg -n "telegram-kol|telegram-publishing|telegram-lib" apps/backend/tsconfig.json apps/backend/package.json` returns 0 matches.
  - `rg -n '"telegram/[^/]+"\s*:' apps/backend/package.json` returns exactly 5 matches (the 5 preserved `^telegram/...$` aliases).
  - `cd apps/backend && npx tsc --noEmit` exits 0.
  - `cd apps/backend && npm test -- --silent` exits 0 with 306/306.
  QA scenarios:
  - **Happy**: All 9 entries removed (5 tsconfig + 4 package.json), 5 gramJS aliases preserved; tsc + jest pass. Evidence: `.omo/evidence/task-2-consolidate-telegram-bc.txt`.
  - **Failure**: Accidentally remove a `^telegram/events$` entry → `kol/ingestion/api/mtproto/kol-telegram-mtproto.adapter.ts` test fails to resolve `'telegram/events'`. Self-fix: re-add the alias, re-run tests.
  Commit: Y | `chore(config): drop obsolete telegram-kol/telegram-publishing/telegram-lib path aliases`

- [ ] 3. **Rename `.cache/telegram-kol-metadata.json` → `.cache/kol-metadata.json` in code and docstrings**
  What to do / Must NOT do:
  - DO: change the default fallback filename in `apps/backend/src/shared/common/config/app.config.ts:252` from `.cache/telegram-kol-metadata.json` to `.cache/kol-metadata.json`.
  - DO: change the docstring default in `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts:16` from `<repo-root>/.cache/telegram-kol-metadata.json` to `<repo-root>/.cache/kol-metadata.json`.
  - DO: only update `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts` comment IF it actually mentions `.cache/telegram-kol-metadata.json` — verify first with grep.
  - DO NOT: change the env var name `INGESTION_TELEGRAM_METADATA_CACHE_FILE` — that stays for backward compat.
  - DO NOT: delete any existing `.cache/telegram-kol-metadata.json` file (will be re-created by next ingestion run; old file becomes orphaned but harmless).
  - DO NOT: change the `metadataCache.filePath` config key — that's the env var plumbing.
  Parallelization: Wave 2 | Blocked by: T1 | Blocks: nothing
  References:
  - `apps/backend/src/shared/common/config/app.config.ts:252` — line `\`${process.cwd()}/.cache/telegram-kol-metadata.json\`` (string literal)
  - `apps/backend/src/kol/identity/infrastructure/persistence/json-resolved-kol-metadata.repository.ts:16` — docstring text
  - `apps/backend/src/kol/identity/infrastructure/seeders/kol.seeder.ts` — search first with `rg -n "telegram-kol-metadata"`, only edit if found
  Acceptance criteria:
  - `rg -n "telegram-kol-metadata" apps/backend/src` returns 0 matches.
  - `rg -n "kol-metadata\.json" apps/backend/src` returns at least 2 matches (the renamed line in app.config.ts and the docstring).
  - `cd apps/backend && npx tsc --noEmit` exits 0.
  - `cd apps/backend && npm test -- --silent` exits 0 with 306/306.
  QA scenarios:
  - **Happy**: 2 (or 3) file edits done; tsc + jest pass; no `telegram-kol-metadata` strings remain. Evidence: `.omo/evidence/task-3-consolidate-telegram-bc.txt`.
  - **Failure**: Edited a literal that wasn't actually a default path (e.g. inside a comment that's purely descriptive) → no test failure but unnecessary churn. Self-fix: revert unrelated edits.
  Commit: Y | `refactor(kol): rename default metadata cache to kol-metadata.json`

- [ ] 4. **Fix frontend vip-calls endpoints path in `apps/frontend/src/shared/api/endpoints.ts`**
  What to do / Must NOT do:
  - DO: change exactly these 5 lines in `apps/frontend/src/shared/api/endpoints.ts` from `/telegram-publishing/` to `/vip-calls/`:
    - L10: `published: '/telegram-publishing/calls/published'` → `published: '/vip-calls/calls/published'`
    - L11: `failed: '/telegram-publishing/calls/failed'` → `failed: '/vip-calls/calls/failed'`
    - L12: `recent: '/telegram-publishing/calls/recent'` → `recent: '/vip-calls/calls/recent'`
    - L14: `\`/telegram-publishing/calls/${chain}/${address}\`` → `\`/vip-calls/calls/${chain}/${address}\``
    - L15: `publish: '/telegram-publishing/publish'` → `publish: '/vip-calls/publish'`
  - DO NOT: change the KOL endpoints at L3-7 or L68-71 (`/telegram-kol/...` paths are intentionally preserved for backward compat).
  - DO NOT: change the variable names, types, or anything else in the file.
  - DO NOT: introduce a new HTTP client or rewrite the api module.
  Parallelization: Wave 3 | Blocked by: nothing (independent file in different workspace) | Blocks: nothing
  References:
  - `apps/frontend/src/shared/api/endpoints.ts:10-15` — the 5 `telegramPublishing` export object fields.
  - Cross-check: `apps/backend/src/telegram/vip-calls-channel/api/http/vip-calls.controller.ts:5` declares `@Controller('vip-calls')`. The frontend must align with this controller path.
  Acceptance criteria:
  - `rg -n "telegram-publishing" apps/frontend/src` returns 0 matches.
  - `rg -n "'/vip-calls/" apps/frontend/src/shared/api/endpoints.ts` returns exactly 5 matches.
  - `cd apps/frontend && npx tsc --noEmit` exits 0.
  - `cd apps/frontend && npm run build` exits 0 (or `cd apps/frontend && npx vite build`).
  QA scenarios:
  - **Happy**: 5 lines updated; frontend tsc + vite build pass. Evidence: `.omo/evidence/task-4-consolidate-telegram-bc.txt`.
  - **Failure**: Accidentally changed a KOL endpoint path → KOL endpoints break. Self-fix: revert KOL paths (the grep will catch it: `rg -n "telegram-kol" apps/frontend/src` must still return the 8 expected KOL endpoints).
  Commit: Y | `fix(frontend): align vip-calls endpoint paths with backend @Controller('vip-calls')`

- [ ] 5. **`git rm -rf apps/backend/src/telegram-kol/` (the 5 KOL sub-BCs obsolete tree)**
  What to do / Must NOT do:
  - DO: execute `git rm -rf apps/backend/src/telegram-kol/` (44 files).
  - DO: verify after deletion that no source file outside the deleted tree still imports or references `telegram-kol/` (any remaining hit in `apps/backend/src` outside the deleted tree = blocker).
  - DO NOT: delete `apps/backend/src/kol/` (the canonical replacement).
  - DO NOT: delete any file in `apps/backend/src/telegram-kol/` individually — use the recursive directory delete.
  Parallelization: Wave 4 | Blocked by: T1, T2 | Blocks: T6, T7
  References:
  - Directory to delete: `apps/backend/src/telegram-kol/` (44 files across `identity/`, `ingestion/`, `reputation/`, `source/`, `stats/` sub-BCs).
  - Replacement tree (NOT to delete): `apps/backend/src/kol/` with same 5 sub-BCs.
  - Stale-import sweep already done in T1, so nothing should still point here.
  Acceptance criteria:
  - `git status apps/backend/src/telegram-kol/` shows 44 files marked as deleted (`D ` prefix).
  - `! test -d apps/backend/src/telegram-kol` returns true (directory does not exist).
  - `rg -n "telegram-kol" apps/backend/src` returns 0 matches.
  - `cd apps/backend && npx tsc --noEmit` exits 0.
  - `cd apps/backend && npm test -- --silent` exits 0 with 306/306.
  QA scenarios:
  - **Happy**: All 44 files removed; tsc + jest pass; grep audit clean. Evidence: `.omo/evidence/task-5-consolidate-telegram-bc.txt` with `git rm` output and `git status --short | head -50`.
  - **Failure**: A remaining import from `token/*` (T1 missed one) → tsc fails with `TS2307`. Self-fix: find the orphan with the tsc error, fix the import, re-run.
  Commit: Y | `chore: remove obsolete src/telegram-kol/ (replaced by src/kol/)`

- [ ] 6. **`git rm -rf apps/backend/src/telegram-publishing/` (the duplicated vip-calls + shared tree)**
  What to do / Must NOT do:
  - DO: execute `git rm -rf apps/backend/src/telegram-publishing/` (8 files).
  - DO NOT: delete `apps/backend/src/telegram/vip-calls-channel/` or `apps/backend/src/telegram/shared/` (the canonical replacements).
  Parallelization: Wave 4 | Blocked by: T5 | Blocks: T7
  References:
  - Directory to delete: `apps/backend/src/telegram-publishing/` (8 files: `index.ts`, `publishing.module.ts`, `shared/index.ts` + 4 domain/application files, `vip-calls/vip-calls.module.ts` + 5 application/infrastructure files).
  - Replacement tree (NOT to delete): `apps/backend/src/telegram/{shared,vip-calls-channel}/`.
  Acceptance criteria:
  - `git status apps/backend/src/telegram-publishing/` shows 8 files marked as deleted.
  - `! test -d apps/backend/src/telegram-publishing` returns true.
  - `rg -n "telegram-publishing" apps/backend/src` returns 0 matches.
  - `cd apps/backend && npx tsc --noEmit` exits 0.
  - `cd apps/backend && npm test -- --silent` exits 0 with 306/306.
  QA scenarios:
  - **Happy**: All 8 files removed; tsc + jest pass; grep audit clean. Evidence: `.omo/evidence/task-6-consolidate-telegram-bc.txt`.
  - **Failure**: A controller still routes to `/telegram-publishing/...` (some old test fixture?) → tsc may not catch this (it's a path string) but a runtime smoke test would. Self-fix: the frontend already moved to `/vip-calls/` in T4, so this is unlikely.
  Commit: Y | `chore: remove obsolete src/telegram-publishing/ (duplicated by src/telegram/{shared,vip-calls-channel}/)`

- [ ] 7. **`git rm -rf apps/backend/src/telegram-lib/` (stub classes never imported)**
  What to do / Must NOT do:
  - DO: execute `git rm -rf apps/backend/src/telegram-lib/` (1 file: `index.ts`).
  - DO NOT: remove the `^telegram/(events|client|errors|tl|crypto)$` aliases in `package.json` (those point to real `node_modules/telegram`, NOT to `src/telegram-lib/`). The `telegram-lib` aliases were removed in T2.
  Parallelization: Wave 4 | Blocked by: T5, T6 | Blocks: T8-T13
  References:
  - File to delete: `apps/backend/src/telegram-lib/index.ts` (17 lines, 3 stub classes: `TelegramClient`, `StringSession`, `NewMessage`).
  - Real gramJS package: `node_modules/telegram` (in `dependencies` of `apps/backend/package.json:47`).
  Acceptance criteria:
  - `git status apps/backend/src/telegram-lib/` shows 1 file marked as deleted.
  - `! test -d apps/backend/src/telegram-lib` returns true.
  - `rg -n "telegram-lib" apps/backend/src` returns 0 matches.
  - `cd apps/backend && npx tsc --noEmit` exits 0.
  - `cd apps/backend && npm test -- --silent` exits 0 with 306/306.
  - `cd apps/backend && npx jest --testPathPattern="kol/ingestion"` exits 0 (smoke-test that gramJS imports still resolve via `^telegram/events$` etc.).
  QA scenarios:
  - **Happy**: 1 file removed; tsc + full jest pass; kol/ingestion smoke-test passes; grep audit clean. Evidence: `.omo/evidence/task-7-consolidate-telegram-bc.txt`.
  - **Failure**: The kol/ingestion test fails because `telegram/events` no longer resolves → the alias was wrongly removed in T2. Self-fix: re-add the alias in `package.json`.
  Commit: Y | `chore: remove obsolete src/telegram-lib/ stubs (gramJS is the real package)`

- [ ] 8. **Update top-level READMEs (`apps/backend/README.md`, `apps/frontend/README.md`, root `README.md`)**
  What to do / Must NOT do:
  - DO: in `apps/backend/README.md`, rewrite all `telegram-kol/` → `kol/` and `telegram-publishing/` → `telegram/vip-calls-channel/` + `telegram/shared/` references in: §1 pipeline diagram, §2 BC table, §4 endpoint tables, §5 DB tables, §8 current state.
  - DO: in `apps/frontend/README.md`, rewrite all `/telegram-publishing/...` → `/vip-calls/...` references in §4 endpoint table and §7 known bugs (the "Publishing endpoints mal escritos" line should be REMOVED — the bug is fixed by T4).
  - DO: in root `README.md`, rewrite `telegram-kol/` → `kol/` in the §2 BC table.
  - DO NOT: rewrite any other content (structure, command list, etc.).
  - DO NOT: delete the `kol-refactor.md` link in the resources section (it now references a "superseded" doc — leave the link, the doc itself is updated in T10).
  Parallelization: Wave 5 | Blocked by: T7 | Blocks: nothing
  References:
  - `apps/backend/README.md` lines: 13, 40, 60-64, 77, 115, 130-149, 197, 290 (from prior grep).
  - `apps/frontend/README.md` lines: 49-53, 65-66, 168.
  - Root `README.md` lines: pipeline section, BC table (search `telegram-kol|telegram-publishing`).
  Acceptance criteria:
  - `rg -n "telegram-kol|telegram-publishing" apps/backend/README.md apps/frontend/README.md README.md` returns 0 matches.
  - `rg -n "kol/|telegram/" apps/backend/README.md` returns the expected BC-table matches (≥10 hits).
  - `git diff --stat apps/backend/README.md apps/frontend/README.md README.md` shows changes in all 3 files.
  QA scenarios:
  - **Happy**: All 3 READMEs updated; grep audit clean. Evidence: `.omo/evidence/task-8-consolidate-telegram-bc.txt` with `git diff --stat` + the relevant grep outputs.
  - **Failure**: A `telegram-publishing/` reference slipped through → grep audit fails. Self-fix: re-grep and fix the missed line.
  Commit: Y | `docs: align READMEs with canonical kol/ + telegram/ layout`

- [ ] 9. **Update all 5 `apps/backend/src/kol/*/README.md` files (identity, ingestion, reputation, source, stats)**
  What to do / Must NOT do:
  - DO: in each of the 5 kol README.md files, replace `telegram-kol/...` → `kol/...` in the "See also" sections and any inline references.
  - DO: keep the Routes tables intact (they still document `/telegram-kol/...` HTTP paths — those are correct, the controllers preserve them).
  - DO: rewrite the introductory header lines like `# Identity BC (\`telegram-kol/identity/\`)` to `# Identity BC (\`kol/identity/\`)` for accuracy.
  - DO NOT: change the documented HTTP routes (controllers preserve the old paths for backward compat).
  - DO NOT: change the body content beyond path renames.
  Parallelization: Wave 5 | Blocked by: T7 | Blocks: nothing
  References:
  - `apps/backend/src/kol/identity/README.md` (line 1 header, lines 47-51 routes, lines 56-57 see-also).
  - `apps/backend/src/kol/ingestion/README.md` (line 1 header, lines 36-38 see-also).
  - `apps/backend/src/kol/reputation/README.md` (line 1 header, lines 45-48 routes, lines 54-59 see-also).
  - `apps/backend/src/kol/source/README.md` (line 1 header, line 25 see-also).
  - `apps/backend/src/kol/stats/README.md` (line 1 header, lines 10-15 routes, line 21 see-also).
  Acceptance criteria:
  - `rg -n "telegram-kol/" apps/backend/src/kol/*/README.md` returns 0 matches.
  - `rg -n "telegram-kol/identity|telegram-kol/reputation|telegram-kol/stats" apps/backend/src/kol/*/README.md` may still return matches in the Routes tables (HTTP paths preserved) — verify those are inside `` ``` `` routes tables, not in prose.
  - All 5 files show modified status in `git status`.
  QA scenarios:
  - **Happy**: All 5 files updated; grep clean (except HTTP route table lines). Evidence: `.omo/evidence/task-9-consolidate-telegram-bc.txt`.
  - **Failure**: Accidentally changed an HTTP route path → frontend breaks. Self-fix: revert that line, only update header + see-also + inline references.
  Commit: Y | `docs(kol): update kol/*/README.md to use kol/ path in headers and see-also`

- [ ] 10. **Mark `kol-refactor.md` (root) and `apps/backend/name-refactor.md` as superseded**
  What to do / Must NOT do:
  - DO: prepend a notice banner to BOTH files at the very top (after any frontmatter), BEFORE any existing content. Suggested format:
    ```
    > ⚠️ **SUPERSEDED** by `consolidate-telegram-bc` plan (`.omo/plans/consolidate-telegram-bc.md`).
    > This document is kept for historical reference. Code references to `telegram-kol/` and `telegram-publishing/` are obsolete — see the current plan for the canonical paths.
    ```
  - DO NOT: rewrite the body of either file (historical accuracy + git blame).
  - DO NOT: move the files to an archive folder (keep them at their current paths).
  Parallelization: Wave 5 | Blocked by: T7 | Blocks: nothing
  References:
  - `kol-refactor.md` (repo root, 562 lines, original consolidation plan).
  - `apps/backend/name-refactor.md` (the BC naming refactor plan, 1628+ lines).
  Acceptance criteria:
  - `rg -n "SUPERSEDED" kol-refactor.md apps/backend/name-refactor.md` returns 2 matches (1 per file).
  - Both files exist at their original paths (no rename, no move).
  QA scenarios:
  - **Happy**: Both files have the notice banner prepended. Evidence: `.omo/evidence/task-10-consolidate-telegram-bc.txt` with the first 20 lines of each file.
  - **Failure**: Banner placed in wrong position (after content) → less discoverable. Self-fix: move banner to the top.
  Commit: Y | `docs: mark kol-refactor.md and name-refactor.md as superseded`

- [ ] 11. **Update `optimize.md` paths (lines 90, 132, 165-167)**
  What to do / Must NOT do:
  - DO: rewrite `telegram-kol/` → `kol/` in the 4 file-path references listed below.
  - DO NOT: change any other content (this is an optimization analysis doc; paths are inline references only).
  Parallelization: Wave 5 | Blocked by: T7 | Blocks: nothing
  References:
  - `optimize.md:90` — `apps/backend/src/telegram-kol/reputation/reputation.module.ts` → `apps/backend/src/kol/reputation/reputation.module.ts`
  - `optimize.md:132` — same file path as above
  - `optimize.md:165` — `apps/backend/src/telegram-kol/reputation/application/ports/kol-reputation.repository.ts` → `apps/backend/src/kol/reputation/application/ports/kol-reputation.repository.ts`
  - `optimize.md:166` — `apps/backend/src/telegram-kol/reputation/infrastructure/repositories/in-memory-kol-reputation.repository.ts` → `apps/backend/src/kol/reputation/infrastructure/repositories/in-memory-kol-reputation.repository.ts`
  - `optimize.md:167` — `apps/backend/src/telegram-kol/reputation/infrastructure/persistence/typeorm/repositories/typeorm-kol-reputation.repository.ts` → `apps/backend/src/kol/reputation/infrastructure/persistence/typeorm/repositories/typeorm-kol-reputation.repository.ts`
  Acceptance criteria:
  - `rg -n "telegram-kol/" optimize.md` returns 0 matches.
  - `rg -n "kol/" optimize.md` returns ≥4 matches (the 4 renamed references).
  QA scenarios:
  - **Happy**: 4 path references rewritten; grep clean. Evidence: `.omo/evidence/task-11-consolidate-telegram-bc.txt`.
  - **Failure**: An over-eager sed-style replacement hits non-path text → bogus mention. Self-fix: revert and re-apply per-line.
  Commit: Y | `docs(optimize): align file path references with kol/ layout`

- [ ] 12. **Update all 10 `docs-money/*.md` files (replace `telegram-kol/` → `kol/` and `telegram-publishing/` → `telegram/vip-calls-channel/` + `telegram/shared/`)**
  What to do / Must NOT do:
  - DO: for each of the 10 files in `docs-money/`, perform targeted sed-style replacements:
    - `telegram-kol/identity/` → `kol/identity/`
    - `telegram-kol/ingestion/` → `kol/ingestion/`
    - `telegram-kol/reputation/` → `kol/reputation/`
    - `telegram-kol/source/` → `kol/source/`
    - `telegram-kol/stats/` → `kol/stats/`
    - `telegram-publishing/` → `telegram/vip-calls-channel/ + telegram/shared/` (and where context is "publishing": replace with the new path; where context is "shared ports/entities": reference `telegram/shared/`)
    - Generic `telegram-kol` (without trailing path) → `kol`
    - Generic `telegram-publishing` (without trailing path) → `telegram-publishing (now: telegram/vip-calls-channel + telegram/shared)` ONLY on first occurrence per file
  - DO NOT: rewrite any non-path content (architecture descriptions, ToS analysis, code examples).
  - DO NOT: change the file structure or section ordering.
  Parallelization: Wave 5 | Blocked by: T7 | Blocks: nothing
  References (10 files, all under `/Users/bryanstevens/dev/onchain-bot/docs-money/`):
  - `01-telegram-tos-summary.md` (lines 16, 22, 31, 43, 50, 84-85, 108, 190, 201)
  - `02-monetization-options.md` (lines 15, 18, 61, 113, 154, 219)
  - `03-dos-and-donts.md` (lines 31, 40, 101, 128)
  - `04-architecture-gaps.md` (lines 25-26, 227, 319, 325)
  - `05-kol-onboarding-legal-limits-and-monetization.md` (lines 159, 267)
  - `06-rate-limits-verified.md` (lines 142, 252)
  - `fix-1/problem.md` (lines 25, 45, 58, 402, 437, 470)
  - `fix-1/solution.md` (line 730)
  - `kols/README.md` (line 63)
  - `README.md` (line 37)
  Acceptance criteria:
  - `rg -n "telegram-kol/|telegram-publishing/" docs-money/` returns 0 matches.
  - `rg -c "kol/|telegram/" docs-money/*.md` shows non-zero match counts in all 10 files.
  - All 10 files show modified status in `git status --short docs-money/`.
  QA scenarios:
  - **Happy**: All 10 files have correct path renames; grep clean. Evidence: `.omo/evidence/task-12-consolidate-telegram-bc.txt` with `rg -c` output per file.
  - **Failure**: A complex prose line references `telegram-kol` semantically (not as a path) → becomes "kol" awkwardly. Self-fix: manually rewrite that specific sentence; do NOT touch others.
  Commit: Y | `docs(docs-money): align references with canonical kol/ + telegram/ layout`

- [ ] 13. **Update all 10 `docs/monetization/*.md` files (mirror of `docs-money/`)**
  What to do / Must NOT do:
  - DO: apply the same targeted sed-style replacements as in T12 to each of the 10 files in `docs/monetization/`.
  - DO: verify that `docs/monetization/` is genuinely a mirror of `docs-money/` (same filenames, same line counts) before applying the same edits. If line counts diverge by >5%, treat the file as independent and edit conservatively.
  - DO NOT: rewrite any non-path content.
  Parallelization: Wave 5 | Blocked by: T7 | Blocks: F1-F4
  References (10 files under `/Users/bryanstevens/dev/onchain-bot/docs/monetization/`):
  - `01-telegram-tos-summary.md`, `02-monetization-options.md`, `03-dos-and-donts.md`, `04-architecture-gaps.md`, `05-kol-onboarding-legal-limits-and-monetization.md`, `06-rate-limits-verified.md`, `fix-1/problem.md`, `fix-1/solution.md`, `kols/README.md`, `README.md`
  - Run `diff -q docs-money/01-telegram-tos-summary.md docs/monetization/01-telegram-tos-summary.md` first to confirm mirror status. If the file is missing or different, fall back to the T12 reference list (which is more exhaustive) for the targets.
  Acceptance criteria:
  - `rg -n "telegram-kol/|telegram-publishing/" docs/monetization/` returns 0 matches.
  - `rg -c "kol/|telegram/" docs/monetization/*.md` shows non-zero match counts in all 10 files.
  - All 10 files show modified status in `git status --short docs/monetization/`.
  - If a file is structurally different from its `docs-money/` counterpart, the worker reports this and applies the T12 path-list reference directly.
  QA scenarios:
  - **Happy**: All 10 files mirror-edited; grep clean. Evidence: `.omo/evidence/task-13-consolidate-telegram-bc.txt` with `rg -c` per file + the `diff -q` mirror confirmation.
  - **Failure**: `docs/monetization/X.md` diverges significantly from `docs-money/X.md` → worker reports divergence, applies T12 line-list directly. No commit of half-done edits.
  Commit: Y | `docs(docs/monetization): align references with canonical kol/ + telegram/ layout (mirror of docs-money/)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

(F1-F4 are orchestrator-side reviews run AFTER the worker reports T1-T13 complete. They use the `momus` reviewer subagent and direct grep/tsc/jest commands. Not part of the worker todos above.)

## Commit strategy

13 commits, one per todo, in execution order. Conventional-commit style, scoped to the BC or area affected:

```
refactor(token): migrate stale telegram-kol imports to kol                                          (T1)
chore(config): drop obsolete telegram-kol/telegram-publishing/telegram-lib path aliases            (T2)
refactor(kol): rename default metadata cache to kol-metadata.json                                    (T3)
fix(frontend): align vip-calls endpoint paths with backend @Controller('vip-calls')                (T4)
chore: remove obsolete src/telegram-kol/ (replaced by src/kol/)                                    (T5)
chore: remove obsolete src/telegram-publishing/ (duplicated by src/telegram/{shared,vip-calls-channel}/)  (T6)
chore: remove obsolete src/telegram-lib/ stubs (gramJS is the real package)                         (T7)
docs: align READMEs with canonical kol/ + telegram/ layout                                          (T8)
docs(kol): update kol/*/README.md to use kol/ path in headers and see-also                          (T9)
docs: mark kol-refactor.md and name-refactor.md as superseded                                       (T10)
docs(optimize): align file path references with kol/ layout                                         (T11)
docs(docs-money): align references with canonical kol/ + telegram/ layout                           (T12)
docs(docs/monetization): align references with canonical kol/ + telegram/ layout (mirror of docs-money/) (T13)
```

If the user prefers a smaller commit count, T1+T2+T3 can collapse into one `refactor: migrate token/* imports and clean obsolete path aliases` (still 3 logical units, 1 commit). T5+T6+T7 can collapse into one `chore: remove obsolete telegram-{kol,publishing,lib} trees` (3 logical units, 1 commit). T12+T13 can collapse into one `docs: align path references across docs-money/ and docs/monetization/`.

## Success criteria

The plan is complete when ALL of the following are true (orchestrator verifies after F1-F4):

1. **Code surface clean**:
   - `rg -n "telegram-kol|telegram-publishing|telegram-lib" apps/backend/src` returns 0 matches.
   - `apps/backend/src/{telegram-kol,telegram-publishing,telegram-lib}` directories do not exist.
   - `apps/backend/src/kol/` and `apps/backend/src/telegram/` exist with the canonical layout (`kol/{identity,ingestion,reputation,source,stats}` and `telegram/{shared,vip-calls-channel,chain-dexter-bot}`).
2. **Config clean**:
   - `apps/backend/tsconfig.json` has no `telegram-kol/*`, `telegram-publishing/*`, `telegram-lib*` path entries.
   - `apps/backend/package.json` has no `^telegram-kol/`, `^telegram-publishing/`, `^telegram-lib` moduleNameMapper entries.
   - The 5 `^telegram/(events|client|errors|tl|crypto)$` aliases are preserved (for gramJS).
3. **Frontend clean**:
   - `apps/frontend/src/shared/api/endpoints.ts` uses `/vip-calls/...` for publishing endpoints.
   - KOL endpoints (`/telegram-kol/...`) are unchanged.
4. **Docs clean**:
   - `rg -n "telegram-kol/|telegram-publishing/" README.md apps/backend/README.md apps/frontend/README.md apps/backend/src/kol/*/README.md optimize.md kol-refactor.md apps/backend/name-refactor.md` returns 0 matches in prose (only HTTP-route tables inside `kol/*/README.md` are allowed to keep `/telegram-kol/...` strings).
   - `rg -n "telegram-kol/|telegram-publishing/" docs-money/ docs/monetization/` returns 0 matches.
   - Both `kol-refactor.md` and `apps/backend/name-refactor.md` contain a `> ⚠️ SUPERSEDED` banner at the top.
5. **Cache renamed**:
   - `rg -n "telegram-kol-metadata" apps/backend/src` returns 0 matches.
   - Default fallback in `app.config.ts` is now `.cache/kol-metadata.json`.
6. **Tests + compile green**:
   - `cd apps/backend && npx tsc --noEmit` exits 0.
   - `cd apps/backend && npm test -- --silent` exits 0 with 306/306.
   - `cd apps/backend && npm run lint` exits 0.
   - `cd apps/frontend && npx tsc --noEmit` exits 0.
   - `cd apps/frontend && npm run build` exits 0.
7. **Smoke OK**:
   - Backend boots (`cd apps/backend && npm run dev`) and `curl http://localhost:3030/vip-calls/calls/recent?limit=5` returns 200 with array payload.
   - The orchestrator then issues the user a final report and requests explicit sign-off.