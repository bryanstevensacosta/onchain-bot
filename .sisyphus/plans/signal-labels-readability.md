# Human-Readable Signal Labels + Bounded Context Architecture Review

## TL;DR

> **Quick Summary**: Replace raw backend enum codes (`SIGNAL_NO_HOLDERS`, `HONEYPOT_FLAG`, `SCORE_TOO_LOW`, etc.) with human-readable English labels on the React frontend via a centralized mapping utility. Deliver a separate architecture analysis document on whether the 5 risk-evaluation Bounded Contexts (classification, scoring, token-gating, honeypot, call-tracking) should be consolidated — **no refactor in this plan, analysis only**.
>
> **Deliverables**:
> - `apps/frontend/src/shared/lib/signalLabels.ts` — central mapping (9 risk + 12 honeypot + 7 filter reasons + risk levels)
> - `apps/frontend/src/shared/lib/signalLabels.test.ts` — vitest unit tests (TDD)
> - Updated `apps/frontend/src/entities/token-score/ui/score-gauge.tsx`
> - Updated `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx`
> - `docs/architecture/bc-coupling-analysis.md` — recommendation document with coupling matrix
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (mapping utility) → Tasks 3-4 (component integration)

---

## Context

### Original Request
The frontend currently displays raw backend identifiers to the operator. Example from `/tokens/:chain/:address`:
```
SIGNAL_NO_HOLDERS
-4
MEDIUM risk
```
The user wants this replaced with readable English text.

### Interview Summary

**Key Discussions**:
- The user confirmed the labels will be in **English** (consistent with the codebase identifier names)
- The user asked an architectural follow-up: "Are classification, filter, and decision too ambiguous to be separate BCs?"
- The user confirmed: **"Analysis first, decision later"** — the BC architecture review is a recommendation document, NOT a refactor
- The user also asked about `settings` as a potential parent BC with sub-BCs

**Research Findings** (from 5 parallel explore agents):

1. **Signal catalog is large**: 9 risk signals + 12 honeypot signals + 7 filter reason codes + risk levels = ~29 distinct codes that currently leak raw to the UI in at least 2 component locations.
2. **Dynamic `SIGNAL_` prefix**: backend builds `SIGNAL_${type}` strings on-the-fly at `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:339` — frontend cannot rely on a single canonical form.
3. **Existing partial mapping**: `FACTOR_LABELS` in `score-gauge.tsx:32-54` already maps ~20 scoring factors but **incomplete** (missing `SIGNAL_POSSIBLE_RUG`, `SIGNAL_NO_HOLDERS`, etc.). Falls back to raw code.
4. **Second leak site**: `rejected-table.tsx:97-104` displays `r.code` raw (filter reason codes). Local `REASON_TONE` exists for color but no text labels.
5. **No i18n library** installed (no next-intl, react-i18next, etc.) — single-user app, simple mapping is sufficient.
6. **FSD slice placement**: `apps/frontend/src/shared/lib/` is the canonical home for cross-entity utilities (next to existing `format.ts`).
7. **Vitest already configured** in `apps/frontend/package.json` — TDD-ready.

**BC Architecture Findings**:

| Coupling Dimension | Level | Notes |
|---|---|---|
| Event dependencies | HIGH | Rigid pipeline: Classification → Scoring → Gating via EventEmitter2 |
| Import dependencies | HIGH | Scoring imports from Classification; Gating imports from both |
| Data sharing | LOW-MED | Risk signals are **NOT** effectively passed (nulls in event payload) |
| Persistence | LOW | Separate tables (`token_classifications`, `token_scores`, `filter_decisions`), no FKs |
| Frontend | LOW | 3 separate `entities/*` slices (correct for separation) |

**Verdict on consolidation**: **KEEP SEPARATE** as siblings. Each has a distinct verb (categorize / quantify / decide), distinct API endpoints, distinct tables, and distinct config. The real technical debt is **data loss in the event payload** (liquidity/holders null out during the event chain), not BC boundaries.

**Settings BC Findings**:
- Settings IS already a real BC (own NestJS module, 4 controllers, 4 tables, 25 files)
- 4 natural sub-domains: signals, thresholds, filters, audit
- `settings_filters` table is **overloaded** with ~28 parameter types spanning scoring/KOL/honeypot/chain
- **Verdict**: Keep flat for now. Sub-BC decomposition is justified **only when an admin UI exists** (then 1:1 map to UI tabs).

---

## Work Objectives

### Core Objective
Replace raw backend enum codes with human-readable English labels on the operator-facing frontend, AND deliver a recommendation document on the BC architecture (no refactor in this plan).

### Concrete Deliverables

1. `apps/frontend/src/shared/lib/signalLabels.ts` — pure mapping utility (~120 lines)
2. `apps/frontend/src/shared/lib/signalLabels.test.ts` — vitest unit tests (~80 lines, 20+ cases)
3. `apps/frontend/src/entities/token-score/ui/score-gauge.tsx` — refactored to consume the utility
4. `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx` — refactored to consume the utility
5. `docs/architecture/bc-coupling-analysis.md` — recommendation document (~150 lines)

### Definition of Done
- [ ] `npm test` in `apps/frontend` → 0 failures, 20+ new test cases pass
- [ ] `npm run build` in `apps/frontend` → no TypeScript errors
- [ ] `npm run lint` in `apps/frontend` → 0 errors
- [ ] Playwright visual QA → all 4 display sites show human-readable text (not raw SCREAMING_SNAKE_CASE)
- [ ] Unknown codes (e.g., future `SIGNAL_NEW_THING`) fall back to a humanized form, not raw
- [ ] `docs/architecture/bc-coupling-analysis.md` exists with explicit recommendation per BC pair
- [ ] No files outside the 4 deliverable files + 1 doc are modified (scope fidelity)

### Must Have
- English human-readable label for **every** code that currently leaks raw to the UI
- Centralized mapping (no scattered label strings across components)
- Type-safe lookup functions (no `any`)
- Fallback behavior for unknown codes
- TDD for the mapping utility (tests first)
- Architecture analysis doc with concrete recommendation (not "more analysis needed")

### Must NOT Have (Guardrails)
- **No i18n library installation** (single-user app, English-only)
- **No backend changes** (the labels are frontend presentation only)
- **No BC refactor** (no merge, no split, no new modules) — the user explicitly said "analysis only"
- **No new pages or features** (no settings admin UI in this plan)
- **No component-level unit tests** (visual QA via Playwright is the verification for components)
- **No display changes to unrelated UI** (tier colors, score gauge appearance, KPI cards — out of scope)
- **No `as any` / `@ts-ignore`** in the new utility
- **No new dependencies** in `package.json`

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — All verification is agent-executed. The operator will only review the final summary and the architecture doc.

### Test Decision
- **Infrastructure exists**: YES (vitest v2.1.5 + @testing-library/react v16 + jsdom)
- **Automated tests**: TDD for the mapping utility (pure functions, high value)
- **Framework**: vitest
- **If TDD**: RED (failing test) → GREEN (minimal impl) → REFACTOR (clean up) per task

### QA Policy
Every task has explicit QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Mapping utility**: vitest unit tests (happy path + edge cases: unknown code, null input, case sensitivity, both `NO_HOLDERS` and `SIGNAL_NO_HOLDERS` forms)
- **Component updates**: Playwright (`/playwright` skill) — open browser, navigate to relevant pages, assert DOM text content, screenshot
- **BC analysis doc**: Visual review of the coupling matrix and recommendation section for completeness

---

## Execution Strategy

### Parallel Execution Waves

> **Target**: 2-3 tasks per wave (small plan, scope is bounded).
> Below the 5-8 target but appropriate for the scope. The instructions permit "fewer than 3 per wave" for tightly-scoped plans.

```
Wave 1 (Start immediately - foundation, 2 parallel):
├── Task 1: signalLabels utility (TDD)              [T1 + T2]
└── Task 2: BC architecture analysis document       [doc only, independent]

Wave 2 (After Wave 1 - integration, 2 parallel):
├── Task 3: Refactor score-gauge.tsx                 [uses T1 output]
└── Task 4: Refactor rejected-table.tsx              [uses T1 output]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit       (oracle)
├── F2: Code quality review         (unspecified-high)
├── F3: Real manual QA              (unspecified-high + playwright)
└── F4: Scope fidelity check         (deep)
```

### Dependency Matrix

- **1** → 3, 4
- **2** → (none)
- **3** → 1
- **4** → 1
- **F1-F4** → 1, 2, 3, 4

**Critical path**: 1 → 3 → F1-F4
**Parallel speedup**: ~50% faster than sequential
**Max concurrent**: 2 (Waves 1 & 2)

### Agent Dispatch Summary

- **Wave 1**: Task 1 → `quick` (TDD utility, well-defined mapping). Task 2 → `writing` (analysis doc)
- **Wave 2**: Tasks 3-4 → `quick` (mechanical refactor, drop-in replacement of label strings)

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> Every task has Recommended Agent Profile + Parallelization info + QA Scenarios.
> A task WITHOUT QA Scenarios is INCOMPLETE.

- [ ] 1. Create `signalLabels` utility + vitest tests (TDD)

  **What to do**:
  - **RED phase** — write `apps/frontend/src/shared/lib/signalLabels.test.ts` FIRST with 20+ vitest cases. Confirm they fail (`npm test`).
  - **GREEN phase** — create `apps/frontend/src/shared/lib/signalLabels.ts` with the following exported items:
    - `RISK_SIGNAL_LABELS: Record<string, string>` — 9 risk signals (from `risk-signal.vo.ts:4-13`):
      `LOW_LIQUIDITY`→"Low liquidity", `NO_HOLDERS`→"No holders", `NO_PAIRS`→"No trading pairs", `CONCENTRATED_HOLDERS`→"Concentrated holders", `EXTREME_PRICE_CHANGE`→"Extreme price change", `MICROCAP`→"Micro-cap", `NO_NAME`→"No token name", `NO_MARKET_DATA`→"No market data", `POSSIBLE_RUG`→"Possible rug pull"
    - `HONEYPOT_SIGNAL_LABELS: Record<string, string>` — 12 honeypot signals (from `honeypot-signal.vo.ts:4-16`):
      `HIGH_BUY_TAX`→"High buy tax", `HIGH_SELL_TAX`→"High sell tax", `HIGH_TRANSFER_TAX`→"High transfer tax", `CANNOT_SELL`→"Cannot sell", `CANNOT_BUY`→"Cannot buy", `OWNER_CAN_DRAIN`→"Owner can drain liquidity", `OWNER_NOT_RENOUNCED`→"Ownership not renounced", `SELF_DESTRUCT_RISK`→"Self-destruct risk", `PROXY_PATTERN`→"Proxy pattern", `BLACKLIST_FUNCTION`→"Blacklist function", `WHITELIST_ONLY`→"Whitelist-only trading", `HONEYPOT_FLAG`→"Honeypot flagged"
    - `FILTER_REASON_LABELS: Record<string, string>` — 7 filter reason codes (from `filter-reason.vo.ts`):
      `SCORE_TOO_LOW`→"Score too low", `CLASSIFICATION_BLOCKED`→"Classification blocked", `BLACKLISTED`→"Blacklisted", `HONEYPOT_SUSPECTED`→"Honeypot suspected", `RISK_WEIGHT_EXCEEDED`→"Risk weight exceeded", `INSUFFICIENT_DATA`→"Insufficient data", `CHAIN_UNSUPPORTED`→"Chain unsupported"
    - `SCORING_FACTOR_LABELS: Record<string, string>` — preserves existing entries from `score-gauge.tsx:32-54` (LIQUIDITY_*, HOLDERS_*, MC_*, VOLUME_*, MULTI_CHANNEL_*, TWO_CHANNELS, HIGH_MENTION_COUNT, MULTIPLE_MENTIONS, SIGNAL_HONEYPOT, SIGNAL_BLACKLIST, CHANNEL_REPUTATION, SECURITY_FLAG_CAP). ADDS the missing SIGNAL_* entries: `SIGNAL_POSSIBLE_RUG`→"Possible rug pull", `SIGNAL_NO_HOLDERS`→"No holders", `SIGNAL_NO_NAME`→"No token name", `SIGNAL_LOW_LIQUIDITY`→"Low liquidity", `SIGNAL_NO_PAIRS`→"No trading pairs", `SIGNAL_CONCENTRATED_HOLDERS`→"Concentrated holders", `SIGNAL_EXTREME_PRICE_CHANGE`→"Extreme price change", `SIGNAL_MICROCAP`→"Micro-cap", `SIGNAL_NO_MARKET_DATA`→"No market data"
    - `RISK_LEVEL_LABELS: Record<string, string>` — `LOW`→"Low risk", `MEDIUM`→"Medium risk", `HIGH`→"High risk", `CRITICAL`→"Critical risk"
    - `RISK_LEVEL_TONE: Record<string, BadgeTone>` — re-export from where the existing `BadgeTone` lives (currently in `rejected-table.tsx:5-16`); tokens: LOW→gray, MEDIUM→yellow, HIGH→orange, CRITICAL→red
    - `signalLabel(code: string): string` — strips optional `SIGNAL_` prefix, looks up across all maps, falls back to `humanize(code)`
    - `reasonLabel(code: string): string` — same lookup, for filter reason codes
    - `riskLevelLabel(level: string): string` — returns the label, falls back to `level`
    - `riskLevelTone(level: string): BadgeTone` — returns the tone, falls back to `'gray'`
    - `humanize(code: string): string` — converts `NO_HOLDERS`→"No holders" via underscore-split + title-case (used as fallback)
  - **REFACTOR phase** — clean up any duplication, ensure exports are tidy. No `as any`. No `console.log`.

  **Must NOT do**:
  - No i18n library imports
  - No `as any` or `@ts-ignore`
  - No new dependencies in `package.json`
  - No modifying components (Tasks 3-4 do that)
  - No `humanize` for codes that already exist in the maps (must look up first, humanize as fallback only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure data → string mapping with well-defined inputs. No architectural decisions. Mechanical TDD.
  - **Skills**: `[]` (no special skills needed)
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for unit tests
    - `frontend-ui-ux`: No UI work, only data mapping

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2 only)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  - `apps/backend/src/token/classification/domain/value-objects/risk-signal.vo.ts:4-13` — canonical names of 9 risk signals
  - `apps/backend/src/token/honeypot/domain/value-objects/honeypot-signal.vo.ts:4-16` — canonical names of 12 honeypot signals
  - `apps/backend/src/token/token-gating/domain/value-objects/filter-reason.vo.ts` — canonical filter reason codes
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:339` — confirms `SIGNAL_${s.type}` prefix is built at runtime, not in enum
  - `apps/frontend/src/entities/token-score/ui/score-gauge.tsx:32-54` — existing `FACTOR_LABELS` to preserve entries from
  - `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx:5-16` — existing `REASON_TONE` to centralize
  - `apps/frontend/src/shared/lib/format.ts` — file style/template for a utility file in `shared/lib/`
  - `apps/frontend/src/test/setup.ts` — vitest setup file (read to understand test environment)

  **Acceptance Criteria**:
  - [ ] File `apps/frontend/src/shared/lib/signalLabels.ts` exists
  - [ ] File `apps/frontend/src/shared/lib/signalLabels.test.ts` exists
  - [ ] `cd apps/frontend && npm test -- signalLabels` → all cases pass (20+ cases, 0 failures)
  - [ ] `cd apps/frontend && npm run build` → 0 TypeScript errors
  - [ ] `cd apps/frontend && npm run lint` → 0 errors
  - [ ] No `as any`, no `@ts-ignore`, no `console.log` in the new files
  - [ ] All 4 export categories present: `signalLabel`, `reasonLabel`, `riskLevelLabel`, `humanize`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Happy path — exact code match returns the mapped label
    Tool: Bash (vitest)
    Steps:
      1. cd apps/frontend
      2. npm test -- signalLabels --reporter=verbose
    Expected Result: All 20+ test cases pass; specifically:
      - signalLabel('NO_HOLDERS') === 'No holders'
      - signalLabel('POSSIBLE_RUG') === 'Possible rug pull'
      - signalLabel('HONEYPOT_FLAG') === 'Honeypot flagged'
      - reasonLabel('SCORE_TOO_LOW') === 'Score too low'
      - riskLevelLabel('MEDIUM') === 'Medium risk'
    Evidence: .sisyphus/evidence/task-1-happy-path.txt

  Scenario: SIGNAL_ prefix is stripped (runtime-built codes work)
    Tool: Bash (vitest)
    Steps:
      1. cd apps/frontend
      2. npm test -- signalLabels -t "prefix"
    Expected Result: Cases pass; specifically:
      - signalLabel('SIGNAL_NO_HOLDERS') === 'No holders'
      - signalLabel('SIGNAL_POSSIBLE_RUG') === 'Possible rug pull'
    Evidence: .sisyphus/evidence/task-1-prefix-stripping.txt

  Scenario: Unknown code falls back to humanized form (not raw SCREAMING_SNAKE_CASE)
    Tool: Bash (vitest)
    Steps:
      1. cd apps/frontend
      2. npm test -- signalLabels -t "fallback"
    Expected Result: Cases pass; specifically:
      - signalLabel('SIGNAL_FUTURE_THING') === 'Future thing' (NOT 'SIGNAL_FUTURE_THING')
      - signalLabel('SOMETHING_NEW') === 'Something new'
      - humanize('NO_HOLDERS') === 'No holders'
    Evidence: .sisyphus/evidence/task-1-fallback.txt

  Scenario: Risk level tone is a valid BadgeTone
    Tool: Bash (vitest)
    Steps:
      1. cd apps/frontend
      2. npm test -- signalLabels -t "tone"
    Expected Result: Cases pass; specifically:
      - riskLevelTone('LOW') === 'gray'
      - riskLevelTone('HIGH') === 'orange' (or 'red' — confirm the convention)
      - riskLevelTone('UNKNOWN_LEVEL') === 'gray' (fallback)
    Evidence: .sisyphus/evidence/task-1-tone.txt

  Scenario: Build clean
    Tool: Bash
    Steps:
      1. cd apps/frontend
      2. npm run build
    Expected Result: tsc + vite build succeed, no errors
    Evidence: .sisyphus/evidence/task-1-build.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-happy-path.txt`
  - [ ] `.sisyphus/evidence/task-1-prefix-stripping.txt`
  - [ ] `.sisyphus/evidence/task-1-fallback.txt`
  - [ ] `.sisyphus/evidence/task-1-tone.txt`
  - [ ] `.sisyphus/evidence/task-1-build.txt`

  **Commit**: YES (groups with T2)
  - Message: `feat(frontend): add signalLabels utility with TDD coverage`
  - Files: `apps/frontend/src/shared/lib/signalLabels.ts`, `apps/frontend/src/shared/lib/signalLabels.test.ts`
  - Pre-commit: `npm test && npm run lint`

- [ ] 2. Write BC architecture analysis document

  **What to do**:
  - Create `docs/architecture/bc-coupling-analysis.md` (~150 lines)
  - Section 1 — Executive Summary: 1-paragraph verdict on each of the 3 questions (consolidate classification+scoring+gating? decompose settings into sub-BCs? what's the real technical debt?)
  - Section 2 — Coupling Matrix: 3x3 table (Classification × Scoring × Token-Gating) with cells showing import direction + file:line evidence. Plus 4×N table for Settings sub-domains.
  - Section 3 — Per-BC Verdict: 3 sub-sections (one per BC pair the user asked about), each ending with an explicit "Verdict: KEEP SEPARATE / MERGE / OTHER" sentence
  - Section 4 — Real Technical Debt: identify the actual problems (data loss in event payload, overloaded `settings_filters` table) and propose non-refactor fixes (enrich events, rename table)
  - Section 5 — When To Revisit: 3-5 concrete triggers (admin UI added, settings >15 tables, etc.) that would justify a refactor
  - Section 6 — What NOT To Do: 3-4 anti-patterns to avoid (don't merge based on operator mental model; don't create sub-BCs before admin UI exists; etc.)

  **Must NOT do**:
  - No code changes (analysis is documentation only)
  - No refactor proposals as TODOs in the codebase
  - No "more analysis needed" — must have a concrete recommendation per section
  - No mention of speculative future refactors without a trigger condition
  - No implementation TODOs in the doc (this is a recommendation, not a backlog)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Single deliverable is a markdown architecture document. No code. Just structured prose with evidence.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI to verify
    - `frontend-ui-ux`: No UI changes

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1, F4 (verification)
  - **Blocked By**: None (can start immediately)

  **References**:
  - `apps/backend/src/token/scoring/infrastructure/event-bus/token-classified.handler.ts:21-40` — evidence of data loss (nulls in event payload)
  - `apps/backend/src/token/token-gating/infrastructure/event-bus/token-scored.handler.ts:45-50` — evidence of Gating re-querying Classification
  - `apps/backend/src/settings/settings.module.ts:64` — confirms Settings is wired as a first-class module
  - `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-filter.entity.ts` — the overloaded catch-all table
  - `apps/backend/src/settings/application/services/settings.service.ts` — single service with 30 methods (evidence for "keep flat")
  - The full reports from explore agents `bg_a117a99c` and `bg_2bd4516c` (in the current session) — source of all coupling findings

  **Acceptance Criteria**:
  - [ ] File `docs/architecture/bc-coupling-analysis.md` exists
  - [ ] Document is 100-200 lines (not too short, not bloated)
  - [ ] Each "Per-BC Verdict" sub-section ends with an explicit "Verdict: ..." sentence
  - [ ] Coupling matrix includes file:line evidence (not generic claims)
  - [ ] "When To Revisit" section lists at least 3 concrete triggers
  - [ ] No code blocks other than small examples or file:line references
  - [ ] No implementation TODOs (no "TODO: refactor X" lines)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Document structure is complete
    Tool: Bash (read + grep)
    Steps:
      1. wc -l docs/architecture/bc-coupling-analysis.md  # expect 100-200
      2. grep -c "##" docs/architecture/bc-coupling-analysis.md  # expect ≥6 sections
      3. grep "Verdict:" docs/architecture/bc-coupling-analysis.md | wc -l  # expect ≥3 verdicts
    Expected Result: 100-200 lines, 6+ sections, 3+ verdicts
    Evidence: .sisyphus/evidence/task-2-structure.txt

  Scenario: Coupling matrix references real file:line evidence
    Tool: Bash (grep)
    Steps:
      1. grep -E "token-classified\.handler|token-scored\.handler|settings\.module|settings-filter\.entity" docs/architecture/bc-coupling-analysis.md
    Expected Result: All 4 file references appear with line numbers
    Evidence: .sisyphus/evidence/task-2-evidence.txt

  Scenario: No implementation TODOs leaked into the doc
    Tool: Bash (grep)
    Steps:
      1. grep -i "TODO" docs/architecture/bc-coupling-analysis.md  # expect zero results
    Expected Result: 0 TODO mentions
    Evidence: .sisyphus/evidence/task-2-no-todos.txt
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-2-structure.txt`
  - [ ] `.sisyphus/evidence/task-2-evidence.txt`
  - [ ] `.sisyphus/evidence/task-2-no-todos.txt`

  **Commit**: YES (groups with T1)
  - Message: `docs(architecture): add BC coupling analysis and recommendations`
  - Files: `docs/architecture/bc-coupling-analysis.md`
  - Pre-commit: `wc -l` confirmation

- [ ] 3. Refactor `score-gauge.tsx` to use `signalLabels`

  **What to do**:
  - Open `apps/frontend/src/entities/token-score/ui/score-gauge.tsx`
  - Remove the local `FACTOR_LABELS` constant (currently lines 32-54)
  - Add import: `import { signalLabel } from '@/shared/lib/signalLabels';`
  - Update the `ScoreBreakdown` component (around lines 56-83):
    - Replace `{FACTOR_LABELS[f.factor] || f.factor}` with `{signalLabel(f.factor)}`
  - Run `npm test && npm run build && npm run lint` to confirm no regressions
  - Run Playwright visual check on a token detail page to confirm display

  **Must NOT do**:
  - No changes to the visual layout, colors, or score gauge appearance
  - No changes to the tier display (STRONG/GOOD/NEUTRAL/POOR/FAILED)
  - No new props on the component
  - No new file in this task (only modify the existing one)
  - No deletion of test data or mock fixtures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical refactor — drop-in replacement of label strings. No logic changes.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: Only used for QA at the end, not for the implementation
    - `frontend-ui-ux`: No design changes

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: F1, F2, F3, F4 (verification)
  - **Blocked By**: Task 1 (needs `signalLabels.ts` to exist)

  **References**:
  - `apps/frontend/src/entities/token-score/ui/score-gauge.tsx:32-54` — local `FACTOR_LABELS` to remove
  - `apps/frontend/src/entities/token-score/ui/score-gauge.tsx:56-83` — `ScoreBreakdown` JSX to update
  - `apps/frontend/src/shared/lib/signalLabels.ts` — new utility to consume (Task 1)
  - `apps/frontend/src/shared/lib/format.ts` — example import pattern (`@/shared/lib/...`)

  **Acceptance Criteria**:
  - [ ] Local `FACTOR_LABELS` constant removed from `score-gauge.tsx`
  - [ ] `signalLabel` imported from `@/shared/lib/signalLabels`
  - [ ] All `{FACTOR_LABELS[...] || ...}` patterns replaced with `signalLabel(...)`
  - [ ] `cd apps/frontend && npm test` → 0 failures (existing tests still pass)
  - [ ] `cd apps/frontend && npm run build` → 0 errors
  - [ ] `cd apps/frontend && npm run lint` → 0 errors
  - [ ] Playwright visual confirmation: token detail page shows "No holders" / "Possible rug pull" / etc. (not `SIGNAL_*`)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build still passes after refactor
    Tool: Bash
    Preconditions: Task 1 completed (signalLabels.ts exists)
    Steps:
      1. cd apps/frontend
      2. npm test 2>&1 | tee .sisyphus/evidence/task-3-test.txt
      3. npm run build 2>&1 | tee .sisyphus/evidence/task-3-build.txt
      4. npm run lint 2>&1 | tee .sisyphus/evidence/task-3-lint.txt
    Expected Result: All 3 commands succeed with 0 errors
    Evidence: .sisyphus/evidence/task-3-{test,build,lint}.txt

  Scenario: Token detail page displays human-readable factor names
    Tool: Playwright
    Preconditions: Backend running on :3030, frontend dev server on :5173, at least one token with risk signals in DB
    Steps:
      1. Navigate to http://localhost:5173/tokens/solana/<address-of-token-with-signals>
      2. Wait for page load (network idle)
      3. Find the score breakdown section (selector: [data-testid="score-breakdown"] if present, else search for "Score breakdown" heading)
      4. Assert DOM text contains "No holders" OR "Possible rug pull" OR "Low liquidity" (any of the 9 risk signal labels)
      5. Assert DOM does NOT contain "SIGNAL_NO_HOLDERS" or "SIGNAL_POSSIBLE_RUG" or "SIGNAL_LOW_LIQUIDITY"
      6. Screenshot the breakdown section
    Expected Result: All assertions pass; screenshot shows human-readable labels
    Evidence: .sisyphus/evidence/task-3-score-breakdown.png
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-test.txt`
  - [ ] `.sisyphus/evidence/task-3-build.txt`
  - [ ] `.sisyphus/evidence/task-3-lint.txt`
  - [ ] `.sisyphus/evidence/task-3-score-breakdown.png`

  **Commit**: YES (groups with T4)
  - Message: `refactor(frontend): use signalLabels in score-gauge`
  - Files: `apps/frontend/src/entities/token-score/ui/score-gauge.tsx`
  - Pre-commit: `npm test && npm run build`

- [ ] 4. Refactor `rejected-table.tsx` to use `signalLabels`

  **What to do**:
  - Open `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx`
  - Remove the local `REASON_TONE` constant (currently lines 5-16) — centralize to `signalLabels.ts`
  - Add import: `import { reasonLabel, riskLevelTone, RISK_LEVEL_TONE } from '@/shared/lib/signalLabels';`
  - Update the JSX (around lines 97-104):
    - Replace `{r.code}` (raw code) with `{reasonLabel(r.code)}`
    - Replace `tone={REASON_TONE[r.code] ?? 'gray'}` with `tone={riskLevelTone(r.code) ?? 'gray'}` (or use the centralized `RISK_LEVEL_TONE` directly)
  - Run `npm test && npm run build && npm run lint`
  - Run Playwright visual check on the `/ops` page

  **Must NOT do**:
  - No changes to the table layout, columns, or pagination
  - No changes to the badge component or its variants
  - No new props on the component
  - No deletion of unrelated local constants (only REASON_TONE)
  - No regression on the "reprocess" button behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Same mechanical refactor as Task 3 — drop-in replacement of label strings.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: Only used for QA at the end
    - `frontend-ui-ux`: No design changes

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: F1, F2, F3, F4 (verification)
  - **Blocked By**: Task 1 (needs `signalLabels.ts` to exist)

  **References**:
  - `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx:5-16` — local `REASON_TONE` to remove
  - `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx:97-104` — JSX with raw `r.code` display
  - `apps/frontend/src/shared/lib/signalLabels.ts` — new utility to consume (Task 1)

  **Acceptance Criteria**:
  - [ ] Local `REASON_TONE` constant removed from `rejected-table.tsx`
  - [ ] `reasonLabel` and `riskLevelTone` imported from `@/shared/lib/signalLabels`
  - [ ] All `{r.code}` patterns replaced with `{reasonLabel(r.code)}`
  - [ ] `cd apps/frontend && npm test` → 0 failures
  - [ ] `cd apps/frontend && npm run build` → 0 errors
  - [ ] `cd apps/frontend && npm run lint` → 0 errors
  - [ ] Playwright visual confirmation: `/ops` page shows "Score too low" / "Blacklisted" / etc. (not `SCORE_TOO_LOW` / `BLACKLISTED`)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build still passes after refactor
    Tool: Bash
    Preconditions: Task 1 completed (signalLabels.ts exists)
    Steps:
      1. cd apps/frontend
      2. npm test 2>&1 | tee .sisyphus/evidence/task-4-test.txt
      3. npm run build 2>&1 | tee .sisyphus/evidence/task-4-build.txt
      4. npm run lint 2>&1 | tee .sisyphus/evidence/task-4-lint.txt
    Expected Result: All 3 commands succeed with 0 errors
    Evidence: .sisyphus/evidence/task-4-{test,build,lint}.txt

  Scenario: Ops page displays human-readable reason codes
    Tool: Playwright
    Preconditions: Backend running on :3030, frontend dev server on :5173, at least one rejected token in DB
    Steps:
      1. Navigate to http://localhost:5173/ops
      2. Wait for page load (network idle)
      3. Find the rejected table (search for "reasons" or "rejected" text)
      4. Assert DOM text contains "Score too low" OR "Blacklisted" OR "Insufficient data" (any of the 7 filter reason labels)
      5. Assert DOM does NOT contain "SCORE_TOO_LOW" or "BLACKLISTED" or "INSUFFICIENT_DATA"
      6. Screenshot the table
    Expected Result: All assertions pass; screenshot shows human-readable labels
    Evidence: .sisyphus/evidence/task-4-rejected-table.png
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-4-test.txt`
  - [ ] `.sisyphus/evidence/task-4-build.txt`
  - [ ] `.sisyphus/evidence/task-4-lint.txt`
  - [ ] `.sisyphus/evidence/task-4-rejected-table.png`

  **Commit**: YES (groups with T3)
  - Message: `refactor(frontend): use signalLabels in rejected-table`
  - Files: `apps/frontend/src/features/reprocess-rejected/ui/rejected-table.tsx`
  - Pre-commit: `npm test && npm run build`

---

## Final Verification Wave (MANDATORY)

> 4 review agents in parallel. ALL must APPROVE before completing.
> Do NOT auto-proceed. Wait for explicit user approval after F1-F4.

- [ ] **F1. Plan Compliance Audit** — `oracle`
  For each "Must Have" in this plan, verify implementation exists (read file, run `npm test`, run `npm run build`). For each "Must NOT Have", grep the codebase for forbidden patterns (`as any`, `@ts-ignore`, i18n imports, new dependencies). Confirm 5 deliverable files exist. Confirm `docs/architecture/bc-coupling-analysis.md` has a recommendation section (not "more analysis needed").
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] **F2. Code Quality Review** — `unspecified-high`
  Run `npm run lint && npm run build && npm test` in `apps/frontend`. Review new files for AI slop (excessive comments, over-abstraction, generic names). Confirm no `console.log` left in production code. Confirm the mapping utility has zero `any` types.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] **F3. Real Manual QA** — `unspecified-high` + `playwright` skill
  Start dev server. Navigate to: `/tokens/:chain/:address` (any token with risk signals), `/ops` (reprocess rejected table). Assert DOM contains "No holders" (not "SIGNAL_NO_HOLDERS"), "Possible rug pull" (not "SIGNAL_POSSIBLE_RUG"), "Score too low" (not "SCORE_TOO_LOW"), etc. Test fallback: mock a future unknown signal `SIGNAL_FUTURE_THING` and confirm it shows a humanized form. Save screenshots to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Fallback [PASS/FAIL] | VERDICT`

- [ ] **F4. Scope Fidelity Check** — `deep`
  For each task, read the "What to do" + read `git diff` for that task. Verify 1:1 — no missing deliverables, no scope creep. Confirm no files outside the 4 deliverable files + 1 doc were modified. Check the BC analysis doc does NOT contain implementation code or refactor TODOs (it's analysis only).
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Commit 1** (Wave 1): `feat(frontend): add signalLabels utility + tests + BC architecture analysis`
  - Files: `signalLabels.ts`, `signalLabels.test.ts`, `docs/architecture/bc-coupling-analysis.md`
  - Pre-commit: `npm test` + `npm run lint`
- **Commit 2** (Wave 2): `refactor(frontend): consume signalLabels in score-gauge and rejected-table`
  - Files: `score-gauge.tsx`, `rejected-table.tsx`
  - Pre-commit: `npm test` + `npm run build` + Playwright screenshot

---

## Success Criteria

### Verification Commands
```bash
cd apps/frontend
npm test                              # Expected: 0 failures
npm run build                         # Expected: tsc clean, vite build success
npm run lint                          # Expected: 0 errors
ls docs/architecture/bc-coupling-analysis.md   # Expected: file exists
```

### Final Checklist
- [ ] All 4 display sites show human-readable text (not `SIGNAL_*` or `*_TOO_LOW`)
- [ ] All vitest cases pass (20+)
- [ ] TypeScript compiles cleanly
- [ ] Lint passes
- [ ] Playwright visual QA passes
- [ ] BC architecture doc has explicit "Recommendation" section per BC pair
- [ ] No `package.json` changes
- [ ] No backend files modified
- [ ] No `as any` / `@ts-ignore` in the new utility
- [ ] `git log` shows exactly 2 atomic commits

---

## Appendix: BC Architecture Analysis Preview

The `docs/architecture/bc-coupling-analysis.md` will contain:

**Section 1: Executive Summary** (1 paragraph)
- Recommendation: KEEP SEPARATE for classification/scoring/token-gating
- Recommendation: KEEP FLAT for settings (defer sub-BC decomposition)
- Real issue: data loss in event payload (not BC boundaries)

**Section 2: Coupling Matrix** (table)
- Cross-BC import map with file:line evidence
- Event subscription map
- Persistence map
- Frontend slice map

**Section 3: Per-BC Verdict** (3 sub-sections)
- classification + scoring: justified separation, fix event payload
- scoring + token-gating: justified separation, add riskWeight to event
- settings as BC: real BC, flat is correct, rename `filters` sub-domain

**Section 4: Recommendations Without Refactor**
- Concrete fixes that don't require merging BCs (enrich events, add `riskWeight` to payloads, rename `settings_filters` to `settings/parameters`)

**Section 5: When To Revisit**
- Triggers for considering a refactor (admin UI, settings module >15 tables, etc.)
- What NOT to do (don't merge based on operator's mental model alone)
