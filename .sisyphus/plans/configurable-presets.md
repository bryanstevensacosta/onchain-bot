# Configurable Signals + Score + Settings with Presets

## TL;DR

> **Quick Summary**: Build a frontend admin page at `/settings` to edit the 14 already-DB-configurable values PLUS migrate the 32+ hardcoded values in `token-gating`/`scoring`/`honeypot`/`classification` to the same `settings_filters` table. Add a "presets" feature where each preset is a **full snapshot** of all configurable values — operators can save current state, switch between presets, and audit changes. Every configurable item gets a human-readable **description** rendered as a tooltip so the operator understands what each parameter does.
>
> **Deliverables** (12):
> - Backend: DB migration for new filter types + `settings_presets` table
> - Backend: `SettingsPresetsService` + `SettingsPresetsController` (CRUD + apply)
> - Backend: refactor 4 use cases to read thresholds from settings (classification, scoring, honeypot, tier)
> - Frontend: `/settings` route + nav link
> - Frontend: `entities/settings/` (TanStack Query hooks for all CRUD)
> - Frontend: `shared/ui/info-tooltip.tsx` (reusable tooltip for descriptions)
> - Frontend: `shared/lib/signalDescriptions.ts` + `settingDescriptions.ts` (static text)
> - Frontend: 5 section widgets (Signals, Score, Filters, KOL, Honeypot) + preset bar
> - Frontend: page composition
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: DB migration → service layer → frontend foundations → sections → page composition

---

## Context

### Original Request
> "quiero que las signals, score, settings, etc. sean configurables en el frontend y poder tener guardado 'presets' crea una propuesta para no harcodear las actuales que se definen en el token gating"
>
> Follow-up: "además la ui debe explicar mejor que son por ejemplo Extreme price change -8 HIGH risk, No token name -1 LOW risk, Security Cap -11 SUSPICIOUS security flag cap"

### User Decisions (confirmed)
- **Scope**: Full — migrate the 32+ hardcoded values, not just the 14 already-configurable
- **Preset model**: Full snapshot — each preset stores the complete state; applying replaces all values
- **Use case**: Default = "switch strategies" (Conservative/Balanced/Aggressive). Fall back to "backup before change" by saving current as a preset. A/B testing is out of scope (deferred to follow-up).

### Research Findings (from 2 parallel explore agents)

**The backend has a Settings BC with full CRUD already wired but zero frontend consumption.**

**`settings_filters` table currently holds 28 parameter types:**
- Scoring: `base_score`, `multiplier_pivot`, `multiplier_slope`, `security_cap`
- Token gate: `min_score`, `max_risk_weight`, `min_completeness`, `blocked_classification`, `enable_blacklist`
- Honeypot heuristic: `honeypot_score`, `honeypot_risk`, `bundlers_threshold`, `insiders_threshold`, `bonding_threshold`
- KOL: `kol_trusted_score`, `kol_suspicious_score`, `kol_score_base`, `kol_score_slope`, `kol_confidence_low/medium/high`
- Lists: `known_good_kol`, `known_bad_kol`, `blacklist_mint`, `publishable_chain`

**`signals` table** stores per-signal custom penalty, risk level, enabled flag.

**`scoring_thresholds` table** is reserved (not yet read by any use case).

**Already-configurable (read from DB, no code change needed):** 14+ values above.

**Candidates-to-migrate (hardcoded in code, must move to settings):**
- `classify-token.use-case.ts:83-186` — risk signal thresholds:
  - `POSSIBLE_RUG`: liquidity < 1000 AND holders < 10
  - `LOW_LIQUIDITY`: HIGH < 1000, MEDIUM 1000–5000
  - `NO_HOLDERS`: HIGH 0, MEDIUM 0–50
  - `CONCENTRATED_HOLDERS`: top10 > 80%
  - `EXTREME_PRICE_CHANGE`: |priceChange24h| > 500%
  - `MICROCAP`: marketCap < 1000
  - `NO_NAME`: !hasName && !hasTicker
  - `NO_MARKET_DATA`: completeness < 0.3
- `score-token.use-case.ts:162-329` — bonus tiers:
  - Liquidity: 50k/10k/1k → +20/+10/+5; < 1k → -10
  - Holders: 1000/100/10 → +15/+8/+3; 0 → -10
  - MarketCap: 1M/100k/10k → +10/+5/+2
  - Volume: 50k/10k → +5/+2
  - Buzz: 3+ sources → +10, 2 → +5; 5+ mentions → +5, 2+ → +2
- `heuristic-honeypot-detector.adapter.ts:136-213` — honeypot thresholds:
  - `OWNER_CAN_DRAIN`: liquidity 0 < 100 AND mc null
  - `HONEYPOT_FLAG` (microcap+extreme): mc < 1000 AND |priceChange| > 500% (or 1000% for CRITICAL)
  - `HONEYPOT_FLAG` (new pair): pairAge < 1h AND |priceChange| > 200%
  - `HIGH_BUY_TAX` proxy: volume/liquidity > 100
  - `HIGH_TRANSFER_TAX` proxy: priceImpact > 0.5 AND pairAge < 24h
  - `canSell/canBuy`: liquidity >= 100
- `score-tier.vo.ts:44-57` — tier cutoffs: 80/60/40/20
- `token-classification.entity.ts:191-204` — confidence base values: 0.7/0.5/0.6/0.4

**Structural (cannot move, code identifiers):** All enums (SignalType, FilterReasonCode, Severity, HoneypotSignalType, ScoreTierValue).

**Frontend:**
- 6 routes exist: `/`, `/live`, `/tokens`, `/tokens/:chain/:address`, `/kols`, `/ops`
- No admin/config UI exists — this is the first
- UI primitives: Button (4 variants), Badge (9 tones), Card — simple Tailwind dark theme
- FSD pattern: `src/pages/<x>/index.tsx` + `src/entities/<x>/` + `src/features/<x>/` + `src/widgets/<x>/`
- Existing mutations: ReplayForm, ReprocessButton, SetLifecycleButton, BackfillButton — `useMutation` pattern
- Existing form components: native `<input>` with `bg-slate-800 border-slate-700 rounded text-sm`

### Preset-like patterns that already exist
- `known_good_kol` / `known_bad_kol` in `settings_filters` — operator-curated lists that override real stats
- `SignalEntity.penalty` per signal — custom override of severity-based default
- `settings_audit_log` — captures every change to settings (entity_type, entity_id, action, before, after, source_ip)

---

## Work Objectives

### Core Objective
Build a frontend admin UI where the operator can:
1. View and edit every configurable parameter that currently lives in code or DB
2. Save the current state as a named "preset"
3. Apply any saved preset to replace all current values atomically
4. See a description of what each parameter does (tooltip)
5. Audit log of all changes (existing infrastructure)

### Concrete Deliverables

**Backend (5):**
1. `apps/backend/migrations/<timestamp>-add-presets-and-descriptions.ts` — TypeORM migration
2. `apps/backend/src/settings/domain/entities/settings-preset.entity.ts` — new entity
3. `apps/backend/src/settings/application/services/settings-presets.service.ts` — preset CRUD + apply
4. `apps/backend/src/settings/api/http/settings-presets.controller.ts` — REST API
5. `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-filter.entity.ts` — extended schema (new types, optional `description` field)

**Backend refactor (4):**
6. `apps/backend/src/token/classification/application/handlers/classify-token.use-case.ts` — read thresholds from settings
7. `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts` — read bonus tiers from settings
8. `apps/backend/src/token/honeypot/infrastructure/adapters/heuristic-honeypot-detector.adapter.ts` — read thresholds from settings
9. `apps/backend/src/token/scoring/domain/value-objects/score-tier.vo.ts` — read cutoffs from settings

**Frontend foundation (3):**
10. `apps/frontend/src/entities/settings/` — types, queries, hooks (signals, thresholds, filters, presets)
11. `apps/frontend/src/shared/ui/info-tooltip.tsx` — reusable tooltip component
12. `apps/frontend/src/shared/lib/{signalDescriptions,settingDescriptions}.ts` — static description text

**Frontend UI (6):**
13. `apps/frontend/src/widgets/settings-panel/ui/signals-section.tsx` — risk + honeypot signal config
14. `apps/frontend/src/widgets/settings-panel/ui/score-section.tsx` — weights, multipliers, tier cutoffs
15. `apps/frontend/src/widgets/settings-panel/ui/filters-section.tsx` — gating parameters
16. `apps/frontend/src/widgets/settings-panel/ui/kol-section.tsx` — KOL reputation params
17. `apps/frontend/src/widgets/settings-panel/ui/preset-bar.tsx` — active preset, save/apply/new
18. `apps/frontend/src/pages/settings/index.tsx` — page composition

### Definition of Done
- [ ] `apps/backend` — `npm run build` succeeds; `npm test` passes (existing + new tests)
- [ ] `apps/backend` — `npm run migration:run` applies the new migration without error
- [ ] `apps/frontend` — `npm test` passes (existing 46 + new)
- [ ] `apps/frontend` — `npm run build` succeeds
- [ ] `apps/frontend` — `npm run lint` succeeds
- [ ] New route `/settings` accessible from nav
- [ ] Page shows: preset bar + 4 sections (Signals, Score, Filters, KOL)
- [ ] Each field has a tooltip (?) showing its description
- [ ] Editing a value + save updates the DB
- [ ] "Save as preset" stores the current state with a name
- [ ] "Apply preset" replaces all current values with the preset's snapshot
- [ ] Backend: classification, scoring, honeypot, tier now read from `settings_filters` (not hardcoded)
- [ ] All 32+ hardcoded values are now configurable from the UI
- [ ] Audit log captures preset saves and applies

### Must Have
- Frontend admin page at `/settings` with 4 sections + preset bar
- All 32+ hardcoded values are migrated to `settings_filters` (no more hardcoded thresholds)
- Every field has a tooltip with a clear description
- Preset save / apply / delete works end-to-end
- Active preset is shown in the UI
- Audit log captures preset operations

### Must NOT Have (Guardrails)
- **No new external dependencies** in `package.json` (use existing TanStack Query, React, Tailwind)
- **No i18n library** (descriptions in English, single-user app)
- **No A/B testing** infrastructure (one active preset at a time, deferred)
- **No multi-tenant** / per-user presets (single-user app)
- **No export/import** preset to JSON files (deferred)
- **No real-time** updates (WebSocket-based preset sync between sessions — deferred)
- **No versioned** preset history (audit log captures changes, but no "diff" view)
- **No adding new enum members** (signal codes, filter reasons, severities stay as code-defined enums)
- **No new route outside /settings** (the page is the only new route)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — All verification is agent-executed. The operator only reviews the final summary.

### Test Decision
- **Infrastructure exists**: YES (vitest 2.1.5 + @testing-library/react 16 + NestJS testing)
- **Automated tests**: TDD for new logic, snapshot for refactors
- **Backend test framework**: Jest (NestJS default)
- **Frontend test framework**: Vitest
- **If TDD**: RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
- **Backend**: each refactor task has a `.spec.ts` test that locks down the previous behavior
- **Frontend**: each new component has render tests with @testing-library/react
- **E2E**: a Playwright script that loads `/settings`, edits a value, saves preset, applies preset, verifies DB state via direct API call
- **Migration**: a test that runs the migration on an empty DB and asserts the resulting schema
- **Visual QA**: screenshots of `/settings` page sections

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Backend foundation - sequential within, but can launch early):
├── Task 1.1: DB migration (new filter types + presets table + description column)
├── Task 1.2: SettingsPresetEntity (depends on 1.1)
├── Task 1.3: SettingsPresetsService (depends on 1.1, 1.2)
├── Task 1.4: SettingsPresetsController (depends on 1.3)
└── Task 1.5: Wire into app.module.ts + e2e migration test (depends on 1.1-1.4)

Wave 2 (Backend refactor - 4 parallel, all depend on 1.5):
├── Task 2.1: classify-token.use-case.ts → read thresholds from settings
├── Task 2.2: score-token.use-case.ts → read bonus tiers from settings
├── Task 2.3: heuristic-honeypot-detector.adapter.ts → read thresholds from settings
└── Task 2.4: score-tier.vo.ts → read tier cutoffs from settings

Wave 3 (Frontend foundation - 3 parallel, depends on 1.5):
├── Task 3.1: /settings route + nav link + page stub
├── Task 3.2: entities/settings/ (queries, types, hooks for signals/thresholds/filters/presets)
└── Task 3.3: shared/ui/info-tooltip.tsx + shared/lib/{signalDescriptions,settingDescriptions}.ts

Wave 4 (Frontend sections - 5 parallel, depend on 3.1-3.3):
├── Task 4.1: signals-section.tsx
├── Task 4.2: score-section.tsx
├── Task 4.3: filters-section.tsx
├── Task 4.4: kol-section.tsx
└── Task 4.5: preset-bar.tsx

Wave 5 (Page composition + E2E):
├── Task 5.1: pages/settings/index.tsx — compose all sections + preset bar
├── Task 5.2: Playwright E2E test (edit → save preset → apply → verify DB)
└── Task 5.3: Update docs (settings.md if exists, otherwise add section to README)

Wave FINAL (after all 5 waves - 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA via Playwright
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix
- **1.1** → 1.2, 1.3, 1.4, 1.5
- **1.2** → 1.3
- **1.3** → 1.4
- **1.4** → 1.5
- **1.5** → 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3
- **3.1, 3.2, 3.3** → 4.1, 4.2, 4.3, 4.4, 4.5
- **4.1-4.5** → 5.1
- **5.1** → 5.2, 5.3
- **5.2, 5.3** → F1, F2, F3, F4

**Critical path**: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 4.1 → 5.1 → 5.2 → F1-F4
**Parallel speedup**: ~40% faster than sequential
**Max concurrent**: 5 (Wave 4)

### Agent Dispatch Summary
- **Wave 1**: `deep` for migration (TypeORM nuance), `unspecified-high` for entity/service/controller
- **Wave 2**: `unspecified-high` × 4 (refactors with clear specs)
- **Wave 3**: `unspecified-high` for backend-equivalent, `quick` for the rest
- **Wave 4**: `visual-engineering` × 5 (UI work)
- **Wave 5**: `unspecified-high` for page composition, `unspecified-high` for E2E
- **Final**: same as previous plans

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> Every task has Recommended Agent Profile + Parallelization info + QA Scenarios.
> A task WITHOUT QA Scenarios is INCOMPLETE.

### Wave 1: Backend Foundation

- [ ] 1.1. Create TypeORM migration for new schema

  **What to do**:
  - Read existing migrations: `apps/backend/src/shared/common/persistence/migrations/`
  - Read `SettingsFilterEntity` to understand the current `settings_filters` schema
  - Create new migration `apps/backend/src/shared/common/persistence/migrations/<timestamp>-add-presets-and-descriptions.ts`:
    1. Add column `description TEXT NULL` to `settings_filters` (for human-readable description of each parameter)
    2. Create table `settings_presets` with columns:
       - `id UUID PRIMARY KEY`
       - `name VARCHAR(100) UNIQUE NOT NULL`
       - `description TEXT NULL`
       - `snapshot JSONB NOT NULL` (full state of all configurable values)
       - `is_active BOOLEAN DEFAULT false` (only one preset is active)
       - `created_at TIMESTAMP DEFAULT NOW()`
       - `updated_at TIMESTAMP DEFAULT NOW()`
       - `created_by VARCHAR(100) NULL` (operator name, optional)
    3. Create partial unique index `CREATE UNIQUE INDEX idx_one_active_preset ON settings_presets (is_active) WHERE is_active = true;` (PostgreSQL syntax)
    4. Insert seed data: one preset named "Default" with current hardcoded values as snapshot
  - Add a `down()` method that reverts all changes
  - Run `npm run typeorm migration:run` to verify the migration works on the dev DB
  - Run `npm run typeorm migration:revert` to verify the down method works
  - Re-run the up migration to leave DB in correct state

  **Must NOT do**:
  - Don't drop existing data
  - Don't add new external dependencies
  - Don't change unrelated tables
  - Don't use raw SQL without TypeORM query builder

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (TypeORM migration with PostgreSQL specifics)
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (foundational)
  - **Sequential** (must complete before 1.2)

  **References**:
  - `apps/backend/src/shared/common/persistence/database.module.ts` — migration setup
  - `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-filter.entity.ts` — current schema
  - `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/settings-audit-log.entity.ts` — pattern for similar entity
  - `apps/backend/src/settings/domain/types/filter-config.ts` — what data is in `settings_filters`

  **Acceptance Criteria**:
  - [ ] Migration file exists with both `up()` and `down()` methods
  - [ ] `npm run typeorm migration:run` succeeds
  - [ ] `npm run typeorm migration:revert` succeeds
  - [ ] Re-running up works
  - [ ] New `settings_filters.description` column exists
  - [ ] New `settings_presets` table exists with all required columns
  - [ ] Partial unique index on `is_active=true` is created
  - [ ] "Default" preset row exists with current values as snapshot

  **QA Scenarios**:
  ```
  Scenario: Migration runs cleanly on empty DB
    Tool: Bash
    Steps:
      1. cd apps/backend
      2. npm run typeorm migration:run 2>&1 | tee /tmp/migration-up.log
    Expected Result: Migration completes, "Default" preset inserted
    Evidence: .sisyphus/evidence/task-1-1-migration-up.log

  Scenario: Migration reverts cleanly
    Tool: Bash
    Steps:
      1. cd apps/backend
      2. npm run typeorm migration:revert 2>&1 | tee /tmp/migration-down.log
      3. npm run typeorm migration:run
    Expected Result: Both up and down work; re-running up restores state
    Evidence: .sisyphus/evidence/task-1-1-migration-down.log

  Scenario: Schema verification
    Tool: Bash (psql or TypeORM query)
    Steps:
      1. Query `information_schema.columns` for `settings_filters` — expect `description` column
      2. Query `pg_indexes` for `settings_presets` — expect partial unique index
      3. SELECT * FROM settings_presets — expect exactly 1 row (Default)
    Expected Result: Schema matches plan
    Evidence: .sisyphus/evidence/task-1-1-schema.txt
  ```

  **Commit**: YES
  - Message: `feat(backend): add settings_presets table + description column`
  - Files: `apps/backend/src/shared/common/persistence/migrations/<timestamp>-*.ts`

- [ ] 1.2. Create `SettingsPresetEntity`

  **What to do**: Read `apps/backend/src/settings/infrastructure/persistence/typeorm/entities/signal.entity.ts` as a pattern. Create `settings-preset.entity.ts` with the columns defined in the plan's Appendix B. Register the entity in `settings.module.ts` (import + add to `TypeOrmModule.forFeature([...])`).

  **References**: `signal.entity.ts:1-50` (similar pattern), migration from 1.1

  **Acceptance Criteria**: Entity file exists; `npm run build` succeeds; entity is registered in settings module

  **QA Scenarios**:
  - `cd apps/backend && npm run build` → 0 errors
  - `cd apps/backend && npm test -- settings` → existing tests pass

  **Commit**: YES
  - Message: `feat(backend): add SettingsPresetEntity`
  - Files: `settings-preset.entity.ts`, `settings.module.ts`

- [ ] 1.3. Create `SettingsPresetsService`

  **What to do**: Create `settings-presets.service.ts` with methods:
  - `findAll(): Promise<SettingsPreset[]>` — list all presets
  - `findById(id): Promise<SettingsPreset>` — get one
  - `create(input): Promise<SettingsPreset>` — new preset (name, description, snapshot)
  - `update(id, input): Promise<SettingsPreset>` — update name/description/snapshot
  - `delete(id): Promise<void>` — remove (refuse if `is_active=true`)
  - `applyPreset(id): Promise<void>` — atomic: set this preset's `is_active=true`, others `false`, write `snapshot` to `settings_filters`/`signals`/`scoring_thresholds`, insert audit_log entry. All in a TypeORM transaction.
  - `getActive(): Promise<SettingsPreset | null>` — return currently active preset

  Inject: `Repository<SettingsPreset>`, `SettingsService` (for write methods), `AuditService`, `DataSource` (for transaction)

  **References**: `apps/backend/src/settings/application/services/settings.service.ts` (existing patterns), `audit.service.ts` (audit log)

  **Acceptance Criteria**: Service file exists; methods compile; transaction logic in `applyPreset` is correct (rollback on error)

  **QA Scenarios**:
  - `cd apps/backend && npm run build` → 0 errors
  - Unit test: `applyPreset` writes values + sets `is_active` + audit log entry

  **Commit**: YES
  - Message: `feat(backend): add SettingsPresetsService with applyPreset transaction`
  - Files: `settings-presets.service.ts`

- [ ] 1.4. Create `SettingsPresetsController`

  **What to do**: Create `settings-presets.controller.ts` with REST endpoints:
  - `GET /settings/presets` → list
  - `GET /settings/presets/:id` → one
  - `POST /settings/presets` → create
  - `PATCH /settings/presets/:id` → update
  - `DELETE /settings/presets/:id` → delete (refuse if active)
  - `POST /settings/presets/:id/apply` → apply
  - `GET /settings/presets/active` → current active

  Add DTOs: `create-preset.dto.ts`, `update-preset.dto.ts` (name 1-100 chars, description optional, snapshot is a JSON object with strict shape).

  **References**: `apps/backend/src/settings/api/http/signals.controller.ts` (pattern), existing DTOs

  **Acceptance Criteria**: Controller exists; routes registered in module; DTOs validate input

  **QA Scenarios**:
  - `cd apps/backend && npm run build` → 0 errors
  - E2E test (using supertest): POST a preset, GET it, PATCH it, POST `/apply`, GET `/active` returns it

  **Commit**: YES
  - Message: `feat(backend): add SettingsPresetsController with REST endpoints`
  - Files: `settings-presets.controller.ts`, `create-preset.dto.ts`, `update-preset.dto.ts`

- [ ] 1.5. Wire presets into `app.module.ts` + end-to-end migration test

  **What to do**:
  - Register `SettingsPresetsService` and `SettingsPresetsController` in `settings.module.ts` providers/controllers
  - Verify `SettingsModule` is imported in `app.module.ts` (it already is)
  - Write an e2e test: spin up the test app, run the migration, hit the CRUD endpoints, assert responses

  **References**: `apps/backend/src/app.module.ts`, `settings.module.ts`

  **Acceptance Criteria**: 
  - `npm test -- settings.e2e` → all e2e tests pass
  - Migration runs as part of test setup
  - All 6 endpoints respond correctly

  **QA Scenarios**:
  ```
  Scenario: Full preset lifecycle via API
    Tool: Bash (NestJS e2e)
    Steps:
      1. cd apps/backend
      2. npm test -- settings.e2e
    Expected Result: All e2e tests pass
    Evidence: .sisyphus/evidence/task-1-5-e2e.log
  ```

  **Commit**: YES
  - Message: `feat(backend): wire SettingsPresets module + e2e test`
  - Files: `settings.module.ts`, `settings.e2e-spec.ts` (new test)

### Wave 2: Backend Refactor (4 parallel, all depend on 1.5)

- [ ] 2.1. Refactor `classify-token.use-case.ts` to read thresholds from settings

  **What to do**:
  - Read the use case and the `SettingsService` for the 32 hardcoded threshold values listed in the inventory
  - Add 8 new query methods to `SettingsService`:
    - `getClassificationLowLiquidityHigh()` (default 1000)
    - `getClassificationLowLiquidityMedium()` (default 5000)
    - `getClassificationNoHoldersHigh()` (default 0)
    - `getClassificationNoHoldersMedium()` (default 50)
    - `getClassificationConcentratedHoldersHigh()` (default 80)
    - `getClassificationExtremePriceChange()` (default 500)
    - `getClassificationMicrocap()` (default 1000)
    - `getClassificationCompletenessUnknown()` (default 0.3)
  - Replace hardcoded literals in `classify-token.use-case.ts:83-186` with calls to these methods
  - Cache the values at the start of `execute()` to avoid 8+ DB calls per token
  - Update the existing test in `classify-token.use-case.spec.ts` to mock the new settings calls
  - Add new test cases asserting each threshold is read from settings

  **References**: 
  - `apps/backend/src/token/classification/application/handlers/classify-token.use-case.ts:83-186`
  - `apps/backend/src/settings/application/services/settings.service.ts` (pattern for query methods)

  **Acceptance Criteria**: All 8 hardcoded thresholds are read from settings; existing behavior preserved; new tests pass

  **QA Scenarios**:
  - `cd apps/backend && npm test -- classify-token` → all pass
  - Manual: change a threshold in DB, re-classify a token, observe the new behavior

  **Commit**: YES
  - Message: `refactor(backend): read classification thresholds from settings`
  - Files: `classify-token.use-case.ts`, `settings.service.ts`, `classify-token.use-case.spec.ts`

- [ ] 2.2. Refactor `score-token.use-case.ts` bonus tiers to read from settings

  **What to do**: Same pattern as 2.1, but for the scoring bonuses. Add 22 new query methods to `SettingsService`:
  - Liquidity bonus tiers (4 values + 3 thresholds = 7)
  - Holders bonus tiers (4 + 3 = 7)
  - Market cap bonus tiers (3 + 3 = 6) [count adjusted]
  - Volume bonus tiers (2 + 2 = 4)
  - Buzz bonus tiers (4)

  Replace hardcoded literals in `score-token.use-case.ts:162-329`. Update the test.

  **References**: `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:162-329`

  **Acceptance Criteria**: All hardcoded bonus values are read from settings; existing behavior preserved; tests pass

  **QA Scenarios**: `cd apps/backend && npm test -- score-token` → all pass

  **Commit**: YES
  - Message: `refactor(backend): read scoring bonus tiers from settings`
  - Files: `score-token.use-case.ts`, `settings.service.ts`, `score-token.use-case.spec.ts`

- [ ] 2.3. Refactor `heuristic-honeypot-detector.adapter.ts` to read thresholds from settings

  **What to do**: Add 10 new query methods for honeypot thresholds (owner_can_drain_liquidity, honeypot_flag_microcap, etc.). Replace hardcoded literals in the adapter.

  **References**: `apps/backend/src/token/honeypot/infrastructure/adapters/heuristic-honeypot-detector.adapter.ts:136-213`

  **Acceptance Criteria**: All 10 thresholds read from settings; behavior preserved; tests pass

  **QA Scenarios**: `cd apps/backend && npm test -- honeypot` → all pass

  **Commit**: YES
  - Message: `refactor(backend): read honeypot thresholds from settings`
  - Files: `heuristic-honeypot-detector.adapter.ts`, `settings.service.ts`, adapter test

- [ ] 2.4. Refactor `score-tier.vo.ts` and `token-classification.entity.ts` confidence to read from settings

  **What to do**:
  - For `score-tier.vo.ts`: add a factory function `createScoreTier(settingsService)` that returns a `ScoreTier` instance with cutoffs from settings (80/60/40/20 by default)
  - Update places that instantiate `ScoreTier` to use the factory
  - For confidence: add 4 query methods (TOKEN/POOL/SCAM/UNKNOWN base + completeness bonus + risk penalty max + unknown KOL default). Update the entity to accept these as parameters or read from settings

  **References**: 
  - `apps/backend/src/token/scoring/domain/value-objects/score-tier.vo.ts:44-57`
  - `apps/backend/src/token/classification/domain/entities/token-classification.entity.ts:191-204`

  **Acceptance Criteria**: Tier cutoffs + confidence values read from settings; behavior preserved; tests pass

  **QA Scenarios**: `cd apps/backend && npm test -- score-tier && npm test -- confidence` → all pass

  **Commit**: YES
  - Message: `refactor(backend): read score tier cutoffs and confidence values from settings`
  - Files: `score-tier.vo.ts`, `token-classification.entity.ts`, settings.service.ts, tests

### Wave 3: Frontend Foundation (3 parallel, depends on 1.5)

- [ ] 3.1. Add `/settings` route + nav link + page stub

  **What to do**:
  - Read `apps/frontend/src/app/router/routes.tsx` and add `{ path: 'settings', element: <SettingsPage /> }`
  - Create `apps/frontend/src/pages/settings/index.tsx` (stub: just `<div>Settings</div>` for now)
  - Read `apps/frontend/src/app/layouts/root-layout.tsx` and add a nav link "Settings" before or after "Ops"
  - Add `Settings` icon (use any lucide icon or just text)

  **References**: `apps/frontend/src/app/router/routes.tsx`, `apps/frontend/src/app/layouts/root-layout.tsx`, `apps/frontend/src/pages/ops/index.tsx`

  **Acceptance Criteria**: 
  - `cd apps/frontend && npm run build` → 0 errors
  - `cd apps/frontend && npm run lint` → 0 errors
  - Navigating to `/settings` shows the stub page
  - Nav link is visible

  **QA Scenarios**:
  - Playwright: navigate to `/settings`, assert page renders
  - Playwright: assert "Settings" link in nav

  **Commit**: YES
  - Message: `feat(frontend): add /settings route + nav link`
  - Files: `routes.tsx`, `root-layout.tsx`, `pages/settings/index.tsx` (stub)

- [ ] 3.2. Add `entities/settings/` with queries, types, hooks

  **What to do**:
  - Create `apps/frontend/src/entities/settings/` with:
    - `api/settings-queries.ts` — fetch functions for signals, thresholds, filters, presets (calls the new `/settings/presets` API + existing `/settings/signals` etc.)
    - `api/presets-client.ts` — POST/PATCH/DELETE/apply for presets
    - `model/types.ts` — TypeScript types matching backend DTOs (SettingsPreset, SettingsSignal, SettingsThreshold, SettingsFilter)
    - `model/use-settings.ts` — TanStack Query hooks: `useSignals()`, `useThresholds()`, `useFilters()`, `usePresets()`, `useActivePreset()`, `useUpdatePreset()`, `useCreatePreset()`, `useDeletePreset()`, `useApplyPreset()`
    - `index.ts` — barrel export
  - Add a new filter-type entry: `preset_id` (used internally to track the active preset in settings_filters)

  **References**: `apps/frontend/src/features/replay-message/api/replay-client.ts` (TanStack Query pattern), existing entities like `apps/frontend/src/entities/token-score/api/score-queries.ts`

  **Acceptance Criteria**:
  - `cd apps/frontend && npm run build` → 0 errors
  - `cd apps/frontend && npm test -- entities/settings` → unit tests for hooks pass
  - All hooks have proper TypeScript types, no `any`

  **QA Scenarios**:
  - Render test: `usePresets()` returns expected shape when API responds
  - Render test: `useApplyPreset()` triggers the correct mutation

  **Commit**: YES
  - Message: `feat(frontend): add entities/settings with TanStack Query hooks`
  - Files: `entities/settings/**`

- [ ] 3.3. Add `info-tooltip` component + static descriptions

  **What to do**:
  - Create `apps/frontend/src/shared/ui/info-tooltip.tsx` — a small `?` icon that on hover/click shows a popover with text. Use Tailwind + absolute positioning. No external tooltip library.
  - Create `apps/frontend/src/shared/lib/signalDescriptions.ts` — `Record<string, string>` for each of the 9 risk signals + 12 honeypot signals + 4 risk levels (25 entries)
  - Create `apps/frontend/src/shared/lib/settingDescriptions.ts` — `Record<string, string>` for each filter parameter (28+ entries from the snapshot shape)
  - Create `apps/frontend/src/shared/lib/scoreComponentDescriptions.ts` — `Record<string, string>` for scoring components (22+ entries)
  - Each description should be 1-2 sentences, plain English, explaining what the value means

  **References**: `apps/frontend/src/shared/ui/badge.tsx` (Tailwind primitive pattern), `apps/frontend/src/shared/lib/signalLabels.ts` (existing mapping pattern)

  **Acceptance Criteria**: 
  - `cd apps/frontend && npm run build` → 0 errors
  - `cd apps/frontend && npm run lint` → 0 errors
  - 25+25+22+ descriptions defined, each non-empty, each ≤300 chars
  - InfoTooltip renders and shows text on hover

  **QA Scenarios**:
  - Render test: `InfoTooltip text="hello"` → on hover, `hello` is visible
  - Static check: each description file has the expected number of entries

  **Commit**: YES
  - Message: `feat(frontend): add InfoTooltip component + static description text`
  - Files: `info-tooltip.tsx`, `signalDescriptions.ts`, `settingDescriptions.ts`, `scoreComponentDescriptions.ts`

### Wave 4: Frontend Sections (5 parallel, depend on 3.1-3.3)

- [ ] 4.1. `signals-section.tsx` — risk + honeypot signal config

  **What to do**: Create `apps/frontend/src/widgets/settings-panel/ui/signals-section.tsx` with:
  - Two tables (Risk Signals, Honeypot Signals) listing each signal code with editable fields: penalty (number), risk level (dropdown: LOW/MEDIUM/HIGH/CRITICAL), enabled (checkbox)
  - Each row uses `InfoTooltip` + `signalDescriptions` to show what the signal means
  - Edits go through `useUpdateSignal` mutation
  - Section has a title "Signals" and brief intro text

  **References**: `apps/frontend/src/widgets/settings-panel/` (new directory), `entities/settings/`, `shared/ui/info-tooltip.tsx`, `shared/lib/signalDescriptions.ts`

  **Acceptance Criteria**: 
  - `cd apps/frontend && npm test -- signals-section` → render tests pass
  - Component renders all 9 + 12 = 21 signals
  - Edits save to DB via mutation

  **QA Scenarios**:
  - Render test: section renders with all signals
  - Edit a penalty, save, assert mutation called with correct args

  **Commit**: YES
  - Message: `feat(frontend): add Signals section to settings panel`
  - Files: `widgets/settings-panel/ui/signals-section.tsx`

- [ ] 4.2. `score-section.tsx` — weights, multipliers, tier cutoffs

  **What to do**: Section with:
  - Number inputs for: base_score, multiplier_pivot, multiplier_slope
  - Dropdowns/inputs for security_caps (4 values: SCAM/SUSPICIOUS/UNKNOWN/LEGITIMATE)
  - Number inputs for tier cutoffs (strong_min, decent_min, neutral_min, risky_min)
  - Tooltips for each field

  **References**: `entities/settings/`, `shared/lib/settingDescriptions.ts`, `shared/lib/scoreComponentDescriptions.ts`

  **Acceptance Criteria**: All score-related config visible and editable; tooltips work; renders without errors

  **QA Scenarios**: Render test shows all fields; edit a value, save, assert mutation called

  **Commit**: YES
  - Message: `feat(frontend): add Score section to settings panel`
  - Files: `widgets/settings-panel/ui/score-section.tsx`

- [ ] 4.3. `filters-section.tsx` — gating parameters

  **What to do**: Section with:
  - min_score, max_risk_weight, min_completeness (numbers)
  - blocked_classification (multi-select from TOKEN/POOL/SCAM/UNKNOWN/LEGITIMATE)
  - publishable_chain (multi-select)
  - Honeypot heuristic: honeypot_score, honeypot_risk, bundlers_threshold, insiders_threshold, bonding_threshold
  - All the classification threshold values from 2.1 (low_liquidity_high, low_liquidity_medium, etc.)
  - All the scoring bonus tier values from 2.2 (liquidity_high, liquidity_medium, etc.)
  - Tooltips for each field

  **References**: `entities/settings/`, `shared/lib/settingDescriptions.ts`

  **Acceptance Criteria**: All filter-related config visible and editable

  **QA Scenarios**: Render test, edit a value, save

  **Commit**: YES
  - Message: `feat(frontend): add Filters section to settings panel`
  - Files: `widgets/settings-panel/ui/filters-section.tsx`

- [ ] 4.4. `kol-section.tsx` — KOL reputation params

  **What to do**: Section with:
  - kol_trusted_score, kol_suspicious_score (numbers 0-1)
  - kol_score_base, kol_score_slope (numbers 0-1)
  - kol_confidence_low, kol_confidence_medium, kol_confidence_high (numbers)
  - known_good_kol, known_bad_kol (comma-separated text inputs for now)
  - blacklist_mint (comma-separated text)
  - Tooltips

  **References**: `entities/settings/`, `shared/lib/settingDescriptions.ts`

  **Acceptance Criteria**: KOL config visible and editable

  **QA Scenarios**: Render test, edit a value, save

  **Commit**: YES
  - Message: `feat(frontend): add KOL section to settings panel`
  - Files: `widgets/settings-panel/ui/kol-section.tsx`

- [ ] 4.5. `preset-bar.tsx` — active preset + save/apply/new

  **What to do**: Create `apps/frontend/src/widgets/settings-panel/ui/preset-bar.tsx`:
  - Top bar showing: "Active preset: [Default ▾]"
  - Buttons: "Save as new preset..." (opens prompt for name), "Apply preset..." (dropdown of saved presets + click to apply), "Delete preset" (for non-active)
  - Uses `useActivePreset()`, `usePresets()`, `useCreatePreset()`, `useApplyPreset()`, `useDeletePreset()`
  - Save current state: gathers all current settings values, calls `createPreset({ name, description, snapshot })`
  - Apply: confirms with user, then calls `applyPreset(id)`

  **References**: `entities/settings/`, `shared/ui/button.tsx`

  **Acceptance Criteria**: Bar renders; "Save as new" prompts for name and creates; "Apply" switches active preset; "Delete" removes non-active

  **QA Scenarios**:
  - Render test: bar shows "Default" as active
  - Mock mutation, click "Save as new", assert createPreset called

  **Commit**: YES
  - Message: `feat(frontend): add Preset bar to settings panel`
  - Files: `widgets/settings-panel/ui/preset-bar.tsx`

### Wave 5: Page Composition + E2E

- [ ] 5.1. Compose all sections in `/settings` page

  **What to do**: Update `apps/frontend/src/pages/settings/index.tsx` to compose the preset bar + 4 sections. Add tab navigation between sections (or scroll-stacked layout). Wire to entities/settings hooks.

  **References**: `apps/frontend/src/pages/ops/index.tsx` (page composition pattern)

  **Acceptance Criteria**: `/settings` shows preset bar at top, then tabs/sections for Signals, Score, Filters, KOL. All sections editable.

  **QA Scenarios**: Playwright: navigate to `/settings`, screenshot all sections, edit a value in each, save.

  **Commit**: YES
  - Message: `feat(frontend): compose /settings page with all sections + preset bar`
  - Files: `pages/settings/index.tsx`

- [ ] 5.2. Playwright E2E test for full preset workflow

  **What to do**: Create `e2e/settings.spec.ts` that:
  1. Starts backend + frontend (or uses running services)
  2. Navigates to `/settings`
  3. Edits `min_score` from 50 to 60 in the Filters section
  4. Clicks "Save as new preset" with name "Test"
  5. Asserts the new preset appears in the dropdown
  6. Clicks "Apply" on "Test" — verify the value persists
  7. Apply "Default" — verify value reverts to 50
  8. Take screenshots at each step

  **References**: existing Playwright tests if any in the project

  **Acceptance Criteria**: E2E test passes; screenshots saved to `e2e/screenshots/settings/`

  **QA Scenarios**: `npx playwright test e2e/settings.spec.ts` → all pass

  **Commit**: YES
  - Message: `test(e2e): add /settings preset workflow E2E test`
  - Files: `e2e/settings.spec.ts`

- [ ] 5.3. Update documentation

  **What to do**:
  - Add a section to `apps/frontend/README.md` (or create if doesn't exist) about the new `/settings` page
  - Add a section to `apps/backend/README.md` about the new `settings_presets` table and API
  - Document the description tooltips

  **Acceptance Criteria**: README files updated; section explains the feature

  **Commit**: YES
  - Message: `docs: document /settings page and settings_presets API`
  - Files: `apps/frontend/README.md`, `apps/backend/README.md`

---

## Final Verification Wave (MANDATORY)

> 4 review agents in parallel. ALL must APPROVE before completing.
> Do NOT auto-proceed. Wait for explicit user approval after F1-F4.

- [ ] **F1. Plan Compliance Audit** — `oracle`
  Verify all 18 deliverables exist. Verify all 32+ hardcoded values are now in `settings_filters` (grep backend code for remaining hardcoded thresholds). Verify the 4 refactors preserved behavior (no regression in test suite). Verify the migration is reversible.

- [ ] **F2. Code Quality Review** — `unspecified-high`
  Run `npm test`, `npm run build`, `npm run lint` in both apps. Review new code for AI slop. Verify no `as any` or `@ts-ignore` in new code. Verify no copy-pasted logic.

- [ ] **F3. Real Manual QA via Playwright** — `unspecified-high` + `playwright`
  Start backend + frontend. Navigate to `/settings`. Screenshot all 4 sections. Edit a value (e.g., min_score from 50 to 60). Save as preset "Test". Apply it. Verify the change persists. Apply "Default" preset. Verify the change reverts. Test the tooltips appear on hover.

- [ ] **F4. Scope Fidelity Check** — `deep`
  Verify no files outside the 18 deliverables are modified. Verify no new dependencies. Verify no new routes outside `/settings`. Verify no A/B testing infrastructure. Verify the BC architecture doc is not regressed.

---

## Commit Strategy

- **Commit 1** (Wave 1): `feat(backend): add settings_presets table + description column + service + controller + migration`
- **Commit 2** (Wave 2.1-2.4): 4 atomic commits, one per refactor
- **Commit 3** (Wave 3): 3 atomic commits (route, entities, tooltip+descriptions)
- **Commit 4** (Wave 4): 5 atomic commits, one per section
- **Commit 5** (Wave 5): 1 commit for page composition + E2E + docs

Total: ~14 atomic commits.

---

## Success Criteria

### Verification Commands
```bash
# Backend
cd apps/backend
npm run typeorm migration:run   # migration applies cleanly
npm test                          # all tests pass (existing + new)
npm run build                     # tsc clean
npm run lint                      # 0 errors

# Frontend
cd apps/frontend
npm test                          # 46 + new tests pass
npm run build                     # vite build succeeds
npm run lint                      # 0 errors

# E2E
npx playwright test settings.spec.ts  # E2E passes
```

### Final Checklist
- [ ] Migration is reversible
- [ ] All 32+ hardcoded values are now configurable
- [ ] All 4 refactors preserve behavior (no regression)
- [ ] Frontend `/settings` page is accessible and shows all sections
- [ ] Each field has a description tooltip
- [ ] Save/apply/delete preset works end-to-end
- [ ] Audit log captures preset operations
- [ ] No new external dependencies
- [ ] No A/B testing infrastructure
- [ ] No new routes outside `/settings`

---

## Appendix A: Description Content (static text for tooltips)

### Signal descriptions
```typescript
// signalDescriptions.ts
export const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  LOW_LIQUIDITY: 'Detected when the token\'s liquidity pool is below a healthy threshold. Low liquidity makes the token hard to sell without major price impact.',
  NO_HOLDERS: 'No wallet holds this token, or the holder count is suspiciously low (often a sign of fake activity or a token that was just created).',
  // ... 7 more
};
```

### Risk level descriptions
```typescript
export const RISK_LEVEL_DESCRIPTIONS = {
  LOW: 'Informational. Contributes a small penalty. Usually not grounds for rejection alone.',
  MEDIUM: 'Concerning. Contributes a moderate penalty. May tip the verdict toward rejection if combined with other signals.',
  HIGH: 'Strong negative signal. Contributes a significant penalty. Often grounds for rejection.',
  CRITICAL: 'Severe red flag. Contributes the maximum penalty. Almost always grounds for rejection.',
};
```

### Filter parameter descriptions (examples)
```typescript
export const FILTER_DESCRIPTIONS: Record<string, string> = {
  min_score: 'Minimum score (0-100) required to pass the gate. Tokens below this are rejected with SCORE_TOO_LOW.',
  max_risk_weight: 'Maximum total risk weight allowed. Each risk signal adds weight; high weight means many bad signals.',
  min_completeness: 'Minimum snapshot completeness required (0-1). Tokens with incomplete data are rejected with INSUFFICIENT_DATA.',
  base_score: 'Starting score for all tokens (0-100). Bonuses and penalties are applied on top.',
  multiplier_pivot: 'KOL reputation pivot point (0-1). KOLs with reputation above this contribute positively to score.',
  multiplier_slope: 'How steeply KOL reputation affects the score. Higher = more sensitive to KOL reputation.',
  // ... 20+ more
};
```

### Score component descriptions
```typescript
export const SCORE_COMPONENT_DESCRIPTIONS = {
  'liquidity.bonus.50k': 'Score bonus when liquidity exceeds $50,000.',
  'liquidity.bonus.10k': 'Score bonus when liquidity exceeds $10,000 (but less than $50k).',
  // ... etc
};
```

---

## Appendix B: Data Model (settings_presets)

```sql
CREATE TABLE settings_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NULL,
  snapshot JSONB NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100) NULL
);

CREATE UNIQUE INDEX idx_one_active_preset
  ON settings_presets (is_active)
  WHERE is_active = true;
```

**Snapshot shape** (JSONB):
```json
{
  "signals": {
    "SIGNAL_LOW_LIQUIDITY": { "penalty": -4, "riskLevel": "MEDIUM", "enabled": true },
    ...
  },
  "thresholds": [
    { "minScore": 80, "maxScore": 100, "decision": "APPROVED" },
    ...
  ],
  "filters": {
    "base_score": 50,
    "min_score": 50,
    "max_risk_weight": 100,
    "min_completeness": 0.3,
    "blocked_classification": ["SCAM", "UNKNOWN"],
    "publishable_chain": ["ethereum", "solana"],
    "honeypot_score": 10,
    "honeypot_risk": 80,
    "bundlers_threshold": 30,
    "insiders_threshold": 50,
    "bonding_threshold": 99,
    "kol_trusted_score": 0.7,
    "kol_suspicious_score": 0.3,
    "kol_score_base": 0.5,
    "kol_score_slope": 0.5,
    "kol_confidence_low": 5,
    "kol_confidence_medium": 20,
    "kol_confidence_high": 50,
    "multiplier_pivot": 0.5,
    "multiplier_slope": 0.3,
    "security_cap": { "SCAM": 5, "SUSPICIOUS": 30, "UNKNOWN": 20, "LEGITIMATE": 100 }
  },
  "classification_thresholds": {
    "low_liquidity_high": 1000,
    "low_liquidity_medium": 5000,
    "no_holders_high": 0,
    "no_holders_medium": 50,
    "concentrated_holders_high": 80,
    "extreme_price_change_high": 500,
    "microcap_high": 1000,
    "completeness_unknown": 0.3
  },
  "scoring_bonuses": {
    "liquidity_high": 20, "liquidity_medium": 10, "liquidity_low": 5, "liquidity_insufficient": -10,
    "liquidity_threshold_high": 50000, "liquidity_threshold_medium": 10000, "liquidity_threshold_low": 1000,
    "holders_high": 15, "holders_medium": 8, "holders_low": 3, "holders_none": -10,
    "holders_threshold_high": 1000, "holders_threshold_medium": 100, "holders_threshold_low": 10,
    "mc_high": 10, "mc_medium": 5, "mc_low": 2,
    "mc_threshold_high": 1000000, "mc_threshold_medium": 100000, "mc_threshold_low": 10000,
    "volume_high": 5, "volume_low": 2,
    "volume_threshold_high": 50000, "volume_threshold_low": 10000,
    "buzz_multi_source": 10, "buzz_two_sources": 5,
    "buzz_multi_mentions": 5, "buzz_two_mentions": 2
  },
  "honeypot_thresholds": {
    "owner_can_drain_liquidity": 100,
    "honeypot_flag_microcap": 1000,
    "honeypot_flag_extreme_price": 500,
    "honeypot_flag_critical_price": 1000,
    "honeypot_flag_new_pair_age_ms": 3600000,
    "honeypot_flag_new_pair_price": 200,
    "high_buy_tax_ratio": 100,
    "high_transfer_tax_price_impact": 0.5,
    "high_transfer_tax_pair_age_ms": 86400000,
    "can_sell_buy_liquidity": 100
  },
  "score_tiers": {
    "strong_min": 80, "decent_min": 60, "neutral_min": 40, "risky_min": 20
  },
  "confidence": {
    "TOKEN": 0.7, "POOL": 0.5, "ROUTER": 0.5, "NFT": 0.5, "SCAM": 0.6, "UNKNOWN": 0.4,
    "completeness_bonus": 0.2, "risk_penalty_max": 0.4,
    "unknown_kol_default": 0.5
  }
}
```

**Apply preset behavior:**
1. Begin transaction
2. Set `is_active=false` on all presets
3. Set `is_active=true` on the target preset
4. Write `snapshot` values to `settings_filters`, `signals`, `scoring_thresholds` (or wherever each value lives)
5. Insert audit_log entry
6. Commit transaction

If any step fails, the entire transaction rolls back. SettingsService caches are invalidated.
