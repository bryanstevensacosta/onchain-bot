# Plan: Sistema de Configuración UI con Presets

## TL;DR

> **Quick Summary**: Implementar sistema de configuración con presets para el pipeline de scoring y filtros del bot de trading on-chain.
> 
> **Deliverables**: 
> - Nuevo BC `token/preset` para gestión de presets
> - Nuevo BC `token/scoring-config` para configuración de factores de scoring
> - Nuevo BC `token/filter-config` para configuración de filtros
> - Página de Settings en frontend con formulario dinámico
> - Endpoints CRUD en backend
> 
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Wave 1 → Wave 2 → Wave 3 → Final Verification

---

## Context

### Original Request
Usuario quiere configurar score, factors y filters desde el frontend.

### Design Constraints (del usuario)
1. Nombres de BCs descriptivos
2. Un BC por responsabilidad única (SRP)
3. Presets como BC independiente
4. Persistencia en base de datos

### Arquitectura Propuesta

```
token/
├── scoring/                    (existente - calcula score 0-100)
├── token-gating/                (existente - aplica filtros)
├── preset/                      (NUEVO - gestión de presets)
├── scoring-config/              (NUEVO - configuración de factores)
└── filter-config/              (NUEVO - configuración de filtros)
```

### Léxico de BCs Propuestos

| BC | Responsabilidad | Entidad Principal |
|---|---|---|
| `preset` | Gestionar presets (Conservative/Moderate/Aggressive/Custom) | Preset (id, name, scoringConfigId, filterConfigId) |
| `scoring-config` | Configuración de factores de scoring | ScoringConfig (base, thresholds, bonuses, penalties, multiplier) |
| `filter-config` | Configuración de filtros/gates | FilterConfig (minScore, blockedClassifications, enabledChains, etc.) |

---

## Work Objectives

### Core Objective
Permitir configuración runtime del pipeline de scoring y filtros desde el frontend mediante presets predefinidos y configuración personalizada.

### Concrete Deliverables

- [ ] BC `token/preset` con entity, repository, use-cases, controller
- [ ] BC `token/scoring-config` con entity, repository, use-cases, controller  
- [ ] BC `token/filter-config` con entity, repository, use-cases, controller
- [ ] Página `/settings` en frontend con selector de preset
- [ ] Formulario dinámico para ScoringConfig (bonuses, penalties)
- [ ] Formulario dinámico para FilterConfig (gates, thresholds)
- [ ] Endpoint para aplicar preset activo

### Definition of Done

- [ ] GET /config/presets devuelve lista de presets
- [ ] POST /config/presets crea nuevo preset
- [ ] GET /config/scoring devuelve configuración actual
- [ ] POST /config/scoring actualiza configuración
- [ ] GET /config/filters devuelve configuración actual
- [ ] POST /config/filters actualiza configuración
- [ ] Frontend muestra selector de preset
- [ ] Frontend permite editar configuración cuando preset="custom"
- [ ] Cambio de preset aplica configuración inmediatamente

### Must Have

- Presets precargados: Conservative (strict), Moderate (balanced), Aggressive (lenient)
- Override de configuración por preset
- Persistencia en Postgres via TypeORM

### Must NOT Have

- No modificar la fórmula de scoring existente (solo configuración)
- No modificar la lógica de filtros existente (solo configuración)
- No crear nuevos BCs sin justificación de responsabilidad única

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest en backend)
- **Automated tests**: Tests-after para nuevos BCs
- **Framework**: Jest

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API**: Use Bash (curl) - Send requests, assert status + response fields
- **Frontend**: Use Playwright - Navigate, interact, assert DOM

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - config entities):
├── Task 1: Create ScoringConfig entity + TypeORM repo
├── Task 2: Create FilterConfig entity + TypeORM repo
├── Task 3: Create Preset entity + TypeORM repo
├── Task 4: Create default presets seeder
└── Task 5: Add modules to app.module.ts

Wave 2 (BCs implementation):
├── Task 6: Implement ScoringConfig BC (use-cases, controller)
├── Task 7: Implement FilterConfig BC (use-cases, controller)
├── Task 8: Implement Preset BC (use-cases, controller)
├── Task 9: Create frontend types for config entities
├── Task 10: Create config API queries in frontend
└── Task 11: Create config store/state management

Wave 3 (Frontend UI):
├── Task 12: Create Settings page route
├── Task 13: Create Preset selector component
├── Task 14: Create ScoringConfig form
├── Task 15: Create FilterConfig form
├── Task 16: Create config preview panel
└── Task 17: Integration - apply preset from UI

Final Wave (Verification):
├── Task 18: API integration test
├── Task 19: Frontend UI test
└── Task 20: End-to-end flow test
```

---

## TODOs

- [ ] 1. **Create ScoringConfig Entity + TypeORM Repository**

  **What to do**:
  - Create `src/token/scoring-config/domain/entities/scoring-config.entity.ts` with fields: id, baseScore, liquidityThresholds[], liquidityValues[], holdersThresholds[], holdersValues[], marketCapThresholds[], marketCapValues[], volumeThresholds[], volumeValues[], buzzThresholds, penalties (map), reputationMultiplier config
  - Create `src/token/scoring-config/infrastructure/persistence/typeorm/entities/scoring-config.entity.ts` (TypeORM)
  - Create `src/token/scoring-config/infrastructure/persistence/typeorm/repositories/typeorm-scoring-config.repository.ts`
  - Create `src/token/scoring-config/application/ports/scoring-config.repository.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward entity creation following existing patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `visual-engineering`: Not needed for backend entities

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `src/token/scoring/application/handlers/score-token.use-case.ts:56-112` - Scoring formula reference
  - `src/token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity.ts` - TypeORM entity pattern
  - `src/token/token-gating/infrastructure/persistence/typeorm/entities/filter-decision.entity.ts` - Entity pattern

  **Acceptance Criteria**:
  - [ ] Entity created with all config fields
  - [ ] TypeORM repository implements port interface

- [ ] 2. **Create FilterConfig Entity + TypeORM Repository**

  **What to do**:
  - Create `src/token/filter-config/domain/entities/filter-config.entity.ts` with fields: id, minScore, maxRiskWeight, minCompleteness, blockedClassifications[], enabledChains[], blacklistEnabled, honeypotEnabled
  - Create TypeORM entity and repository following same pattern as Task 1

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward entity creation following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 7
  - **Blocked By**: None

  **References**:
  - `src/token/token-gating/application/handlers/apply-filters.use-case.ts:21-27` - Default config reference
  - `src/token/token-gating/infrastructure/persistence/typeorm/entities/filter-decision.entity.ts` - Entity pattern

  **Acceptance Criteria**:
  - [ ] Entity created with all filter config fields
  - [ ] TypeORM repository implements port interface

- [ ] 3. **Create Preset Entity + TypeORM Repository**

  **What to do**:
  - Create `src/token/preset/domain/entities/preset.entity.ts` with fields: id, name, description, scoringConfigId, filterConfigId, isActive
  - Create TypeORM entity and repository following same pattern
  - Create `src/token/preset/domain/value-objects/preset.vo.ts` with preset validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward entity creation following existing patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References**:
  - Existing entity patterns in codebase

  **Acceptance Criteria**:
  - [ ] Preset entity created with relations to ScoringConfig and FilterConfig
  - [ ] TypeORM repository implements port interface

- [ ] 4. **Create Default Presets Seeder**

  **What to do**:
  - Create seeder that populates default presets:
    - **Conservative**: minScore=80, blockedClassifications=['SCAM','UNKNOWN','RISKY']
    - **Moderate**: minScore=65, blockedClassifications=['SCAM','UNKNOWN']
    - **Aggressive**: minScore=45, blockedClassifications=['SCAM']
  - Each preset has corresponding ScoringConfig and FilterConfig

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple data seeding task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/telegram-kol/identity/infrastructure/seeders/kol.seeder.ts` - Seeder pattern

  **Acceptance Criteria**:
  - [ ] Seeder creates 3 presets with configs
  - [ ] Running seeder doesn't duplicate existing presets

- [ ] 5. **Register New Modules in AppModule**

  **What to do**:
  - Add imports for ScoringConfigModule, FilterConfigModule, PresetModule to app.module.ts
  - Configure TypeORM feature for each new entity

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple module registration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 1-4)
  - **Parallel Group**: Wave 1 (last)
  - **Blocks**: None (wave barrier)
  - **Blocked By**: Tasks 1, 2, 3, 4

  **References**:
  - `src/app.module.ts` - Module registration pattern
  - `src/token/scoring/scoring.module.ts:36-42` - Module config with TypeORM

  **Acceptance Criteria**:
  - [ ] All 3 new modules imported
  - [ ] TypeORM features registered

- [ ] 6. **Implement ScoringConfig BC (Use-cases + Controller)**

  **What to do**:
  - Create `GetScoringConfigUseCase`, `UpdateScoringConfigUseCase`
  - Create `ScoringConfigController` with GET/POST endpoints
  - Path: `/config/scoring`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of existing scoring logic to maintain compatibility
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `deep`: Not needed, straightforward CRUD

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 1

  **References**:
  - `src/token/scoring/api/http/scoring.controller.ts` - Controller pattern
  - `src/token/scoring/application/handlers/score-token.use-case.ts` - Scoring logic reference

  **Acceptance Criteria**:
  - [ ] GET /config/scoring returns current config
  - [ ] POST /config/scoring updates config
  - [ ] Config persists to database

- [ ] 7. **Implement FilterConfig BC (Use-cases + Controller)**

  **What to do**:
  - Create `GetFilterConfigUseCase`, `UpdateFilterConfigUseCase`
  - Create `FilterConfigController` with GET/POST endpoints
  - Path: `/config/filters`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of existing filters logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **References**:
  - `src/token/token-gating/api/http/filters.controller.ts` - Controller pattern
  - `src/token/token-gating/application/handlers/apply-filters.use-case.ts` - Filter logic reference

  **Acceptance Criteria**:
  - [ ] GET /config/filters returns current config
  - [ ] POST /config/filters updates config
  - [ ] Config persists to database

- [ ] 8. **Implement Preset BC (Use-cases + Controller)**

  **What to do**:
  - Create `ListPresetsUseCase`, `GetPresetUseCase`, `CreatePresetUseCase`, `ApplyPresetUseCase`
  - Create `PresetController` with CRUD endpoints
  - Path: `/config/presets`
  - Apply preset: sets active scoringConfig and filterConfig

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires coordination between multiple configs
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Task 3

  **References**:
  - Existing controller patterns in codebase

  **Acceptance Criteria**:
  - [ ] GET /config/presets returns all presets
  - [ ] POST /config/presets creates new preset
  - [ ] POST /config/presets/:id/apply activates preset

- [ ] 9. **Create Frontend Types for Config Entities**

  **What to do**:
  - Create `apps/frontend/src/entities/scoring-config/model/types.ts`
  - Create `apps/frontend/src/entities/filter-config/model/types.ts`
  - Create `apps/frontend/src/entities/preset/model/types.ts`
  - Match backend DTOs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definition is straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 12, 13, 14, 15
  - **Blocked By**: Tasks 6, 7, 8

  **References**:
  - `apps/frontend/src/entities/token-score/model/types.ts` - Type pattern

  **Acceptance Criteria**:
  - [ ] Types match backend entities
  - [ ] Types are exported from index files

- [ ] 10. **Create Config API Queries in Frontend**

  **What to do**:
  - Create `apps/frontend/src/entities/scoring-config/api/scoring-config-queries.ts`
  - Create `apps/frontend/src/entities/filter-config/api/filter-config-queries.ts`
  - Create `apps/frontend/src/entities/preset/api/preset-queries.ts`
  - Use TanStack Query with polling

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard API query pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 12, 13, 14, 15
  - **Blocked By**: Tasks 6, 7, 8

  **References**:
  - `apps/frontend/src/entities/token-score/api/score-queries.ts` - Query pattern
  - `apps/frontend/src/shared/api/endpoints.ts` - Endpoint configuration

  **Acceptance Criteria**:
  - [ ] Queries fetch from correct endpoints
  - [ ] Mutations update configs

- [ ] 11. **Create Config State Management**

  **What to do**:
  - Create React hooks using TanStack Query for config state
  - Add query keys for config entities
  - Implement optimistic updates where needed

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard React Query usage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 12, 13, 14, 15
  - **Blocked By**: Tasks 6, 7, 8

  **References**:
  - `apps/frontend/src/entities/token-score/model/use-score.ts` - Query hook pattern

  **Acceptance Criteria**:
  - [ ] Hooks provide data and mutations
  - [ ] Cache invalidation works correctly

- [ ] 12. **Create Settings Page Route**

  **What to do**:
  - Create `apps/frontend/src/pages/settings/index.tsx`
  - Add route in router: `/settings`
  - Add navigation link in header

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Page layout and navigation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15, 16, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Task 11

  **References**:
  - `apps/frontend/src/app/router/routes.tsx` - Route pattern
  - `apps/frontend/src/app/layouts/root-layout.tsx` - Layout with nav

  **Acceptance Criteria**:
  - [ ] Route /settings works
  - [ ] Navigation link visible
  - [ ] Page loads without errors

- [ ] 13. **Create Preset Selector Component**

  **What to do**:
  - Create `apps/frontend/src/features/preset-selector/ui/preset-selector.tsx`
  - Dropdown or card selection for presets
  - Shows active preset
  - Click applies preset immediately

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component for preset selection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 14, 15, 16, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 10

  **References**:
  - `apps/frontend/src/widgets/kol-leaderboard/ui/kol-leaderboard.tsx` - Component pattern

  **Acceptance Criteria**:
  - [ ] Shows list of presets
  - [ ] Current preset is highlighted
  - [ ] Clicking preset triggers apply

- [ ] 14. **Create ScoringConfig Form**

  **What to do**:
  - Create `apps/frontend/src/features/scoring-config-form/ui/scoring-config-form.tsx`
  - Form fields for each scoring config parameter
  - Use sliders for numeric thresholds
  - Save button triggers mutation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form UI with dynamic fields
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13, 15, 16, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 10

  **References**:
  - `apps/frontend/src/features/trigger-backfill/ui/backfill-button.tsx` - Form pattern
  - Tailwind form styling

  **Acceptance Criteria**:
  - [ ] All scoring config fields editable
  - [ ] Values persist on save
  - [ ] Shows current values on load

- [ ] 15. **Create FilterConfig Form**

  **What to do**:
  - Create `apps/frontend/src/features/filter-config-form/ui/filter-config-form.tsx`
  - Form fields for each filter config parameter
  - Save button triggers mutation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form UI with dynamic fields
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13, 14, 16, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 17
  - **Blocked By**: Task 10

  **References**:
  - Tailwind form styling
  - Existing form patterns

  **Acceptance Criteria**:
  - [ ] All filter config fields editable
  - [ ] Values persist on save
  - [ ] Shows current values on load

- [ ] 16. **Create Config Preview Panel**

  **What to do**:
  - Create `apps/frontend/src/features/config-preview/ui/config-preview.tsx`
  - Shows summary of active config
  - Updates reactively when config changes

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Display component
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 12, 13, 14, 15, 17)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Task 11

  **Acceptance Criteria**:
  - [ ] Shows active scoring config summary
  - [ ] Shows active filter config summary
  - [ ] Updates when config changes

- [ ] 17. **Integration - Apply Preset from UI**

  **What to do**:
  - Wire up preset selector to apply preset API
  - Show loading state during apply
  - Show success/error notification
  - Refresh all config data after apply

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration work connecting components
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 16, final wave)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18
  - **Blocked By**: Task 13

  **References**:
  - `apps/frontend/src/entities/published-call/model/use-published.ts` - Mutation pattern

  **Acceptance Criteria**:
  - [ ] Preset apply triggers API call
  - [ ] UI shows loading during apply
  - [ ] Config refreshes after apply

- [ ] 18. **API Integration Test**

  **What to do**:
  - Test all config endpoints with curl
  - Verify CRUD operations work
  - Verify preset apply works

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Testing backend API
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 19, 20)
  - **Parallel Group**: Final Wave
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7, 8

  **QA Scenarios**:
  ```
  Scenario: GET all presets
    Tool: Bash (curl)
    Preconditions: None
    Steps:
      1. curl http://localhost:3030/config/presets
    Expected Result: JSON array with 3 default presets
    Evidence: .sisyphus/evidence/task-18-get-presets.json

  Scenario: GET current scoring config
    Tool: Bash (curl)
    Preconditions: None
    Steps:
      1. curl http://localhost:3030/config/scoring
    Expected Result: JSON object with scoring config
    Evidence: .sisyphus/evidence/task-18-get-scoring.json

  Scenario: Apply preset
    Tool: Bash (curl)
    Preconditions: None
    Steps:
      1. curl -X POST http://localhost:3030/config/presets/conservative/apply
    Expected Result: {"success": true}
    Evidence: .sisyphus/evidence/task-18-apply-preset.json
  ```

- [ ] 19. **Frontend UI Test**

  **What to do**:
  - Test settings page loads
  - Test preset selector works
  - Test config forms load

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI testing with Playwright
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 18, 20)
  - **Parallel Group**: Final Wave
  - **Blocks**: None
  - **Blocked By**: Tasks 12, 13, 14, 15

  **QA Scenarios**:
  ```
  Scenario: Settings page loads
    Tool: Playwright
    Preconditions: Frontend running on :5173
    Steps:
      1. Navigate to http://localhost:5173/settings
      2. Wait for page to load
    Expected Result: Page shows preset selector
    Evidence: .sisyphus/evidence/task-19-settings-load.png

  Scenario: Preset selection changes active preset
    Tool: Playwright
    Preconditions: Settings page loaded
    Steps:
      1. Click on "Moderate" preset
      2. Wait for UI to update
    Expected Result: Moderate preset is now highlighted
    Evidence: .sisyphus/evidence/task-19-preset-select.png
  ```

- [ ] 20. **End-to-End Flow Test**

  **What to do**:
  - Full flow: navigate to settings → select preset → verify config changed
  - Custom flow: edit config → save → verify persisted

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E testing combining frontend and backend
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 18, 19)
  - **Parallel Group**: Final Wave
  - **Blocks**: None
  - **Blocked By**: Task 17

  **QA Scenarios**:
  ```
  Scenario: Full preset apply flow
    Tool: Playwright + Bash (curl verification)
    Preconditions: Backend and frontend running
    Steps:
      1. Navigate to /settings
      2. Click "Aggressive" preset
      3. Wait for apply to complete
      4. curl GET /config/filters to verify threshold changed
    Expected Result: minScore updated to 45
    Evidence: .sisyphus/evidence/task-20-e2e-flow.json
  ```

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify all Must Have items implemented, no Must NOT Have violations.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run tsc --noEmit, check for proper entity patterns.

- [ ] F3. **E2E Verification** — `unspecified-high` + `playwright`
  Execute all QA scenarios from tasks 18-20.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify no feature creep, all tasks in scope completed.

---

## Commit Strategy

- **1**: `feat(config): add scoring-config entity` - entity + repo
- **2**: `feat(config): add filter-config entity` - entity + repo  
- **3**: `feat(config): add preset entity` - entity + repo
- **4**: `feat(config): add scoring-config bc` - use-cases + controller
- **5**: `feat(config): add filter-config bc` - use-cases + controller
- **6**: `feat(config): add preset bc` - use-cases + controller
- **7**: `feat(frontend): add config types and queries`
- **8**: `feat(frontend): add settings page with preset selector`
- **9**: `feat(frontend): add config forms`
- **10**: `test: add config BC tests`

---

## Success Criteria

### Verification Commands
```bash
curl http://localhost:3030/config/presets    # Expected: JSON array
curl http://localhost:3030/config/scoring    # Expected: JSON object
curl http://localhost:3030/config/filters    # Expected: JSON object
```

### Final Checklist
- [ ] All 3 new BCs registered in app.module.ts
- [ ] All endpoints return valid JSON
- [ ] Frontend settings page loads without errors
- [ ] Preset selector changes active config
- [ ] Custom config can be edited and saved

- [ ] F1. **API Compliance Audit** — Verify all endpoints work
- [ ] F2. **Frontend Integration** — Verify UI loads and functions
- [ ] F3. **E2E Test** — Full flow: select preset → apply → verify

---

## Commit Strategy

- **1**: `feat(config): add scoring-config entity` - entity + repo
- **2**: `feat(config): add filter-config entity` - entity + repo  
- **3**: `feat(config): add preset entity` - entity + repo
- **4**: `feat(config): add scoring-config bc` - use-cases + controller
- **5**: `feat(config): add filter-config bc` - use-cases + controller
- **6**: `feat(config): add preset bc` - use-cases + controller
- **7**: `feat(frontend): add config types and queries`
- **8**: `feat(frontend): add settings page with preset selector`
- **9**: `feat(frontend): add config forms`
- **10**: `test: add config BC tests`

---

## Success Criteria

### Verification Commands
```bash
curl http://localhost:3030/config/presets  # Expected: JSON array
curl http://localhost:3030/config/scoring   # Expected: JSON object
curl http://localhost:3030/config/filters # Expected: JSON object
```

### Final Checklist
- [ ] All 3 new BCs registered in app.module.ts
- [ ] All endpoints return valid JSON
- [ ] Frontend settings page loads without errors
- [ ] Preset selector changes active config
- [ ] Custom config can be edited and saved