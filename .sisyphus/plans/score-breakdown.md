# Score Breakdown Display

## TL;DR

> **Quick Summary**: Agregar visualización de las razones/factores que componen el score de un token en la página de detalle. El backend ya calcula el breakdown durante el scoring pero no lo persiste. El frontend ya tiene un componente `ScoreBreakdown` sin usar. Hay que conectar ambos extremos.
> 
> **Deliverables**:
> - Backend: breakdown persistido en entidad `TokenScore` y devuelto en todos los endpoints GET de scoring
> - Frontend: `TokenDetailPage` muestra factores del score (bonos, penalidades, multiplicador, cap)
> - Frontend: colores verdes para bonos (+), rojos para penalidades (-)
> 
> **Estimated Effort**: Short
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Domain entity → Persistence → Read endpoints → Frontend types → UI

---

## Context

### Original Request
Usuario reporta que en `http://localhost:5173/tokens/solana/{address}` se muestra el score (número + barra) pero no las razones de ese score.

### Interview Summary
**Key Discussions**:
- El backend (`ScoreTokenUseCase`) ya calcula el breakdown completo con factores como `LIQUIDITY_HIGH` (+20), `HOLDERS_MEDIUM` (+8), `MULTI_CHANNEL_BUZZ` (+10), penalidades por señales de riesgo (`SIGNAL_*`), `CHANNEL_REPUTATION` (multiplicador), y `SECURITY_FLAG_CAP`
- El breakdown se removió del estado de la entidad en un refactor N11 porque "ningún consumidor lo usaba"
- Los use cases de lectura (`GetTokenScoreUseCase`, `ListTokenScoresUseCase`, `GetTopScoresUseCase`) pasan `breakdown: []`
- El frontend tiene un componente `ScoreBreakdown` ya implementado en `entities/token-score/ui/score-gauge.tsx` pero nunca se usa en `TokenDetailPage`
- El tipo `TokenScoreView` del frontend tiene `factors: [{ factor, weight }]` pero la API devuelve `breakdown: [{ factor, delta, note }]` — mismatch de tipos

**Research Findings**:
- `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts` — entidad dominio sin breakdown en state
- `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts` — calcula breakdown pero no lo pasa al entity (`TokenScore.create()` no acepta breakdown)
- `apps/backend/src/token/scoring/application/handlers/get-token-score.use-case.ts` — `breakdown: []`
- `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity.ts` — sin columna JSON
- `apps/frontend/src/pages/token-detail/index.tsx` — solo usa `ScoreGauge`, no `ScoreBreakdown`
- `apps/frontend/src/entities/token-score/model/types.ts` — `factors` vs API `breakdown`

### Metis Review
(No se pudo completar — timeout. Análisis propio aplicado.)

**Identified Gaps**:
- ¿Test strategy? → Sin tests automatizados, solo QA scenarios del agente. El proyecto ya tiene tests en backend pero este cambio es pequeño y bien acotado.
- ¿Breakdown en el evento `TokenScoredEvent`? → NO se incluye. El evento es para consumidores del pipeline (filters, publishing), no para UI. No lo tocamos.
- ¿Backfill de scores existentes? → Los scores existentes no tienen breakdown. Para scores nuevos se calculará y persistirá. Los existentes se quedan sin breakdown hasta que se recalculen. Esto es aceptable.

---

## Work Objectives

### Core Objective
Mostrar las razones/causas del score de un token en su página de detalle.

### Concrete Deliverables
- `TokenScore` domain entity: almacena `breakdown` como parte de su estado
- `ScoreTokenUseCase`: pasa breakdown al entity en `create()`
- `GetTokenScoreUseCase`, `ListTokenScoresUseCase`, `GetTopScoresUseCase`: devuelven breakdown real desde la entidad
- `TokenScoreEntity` (TypeORM): columna `jsonb` para breakdown
- TypeORM mapper: mapea breakdown bidireccionalmente
- Frontend `TokenScoreView`: alineado con API (`breakdown` con `factor`, `delta`, `note`)
- `ScoreBreakdown` component: muestra factores con colores (verde=bonus, rojo=penalidad)
- `TokenDetailPage`: incluye `ScoreBreakdown` dentro del Card de Score

### Must Have
- [ ] El breakdown se persiste en la entidad al crear el score
- [ ] El breakdown se devuelve en GET `/token/scoring/tokens/:chain/:address`
- [ ] El breakdown se devuelve en GET `/token/scoring/tokens/top`
- [ ] El breakdown se devuelve en GET `/token/scoring/tokens/recent`
- [ ] La UI muestra los factores numerados con colores (verde = positivo, rojo = negativo)
- [ ] Cada factor muestra factor, delta numérico y nota explicativa

### Must NOT Have (Guardrails)
- No modificar el evento `TokenScoredEvent` ni sus consumidores (filters, publishing)
- No cambiar la fórmula de scoring
- No afectar tokens existentes sin breakdown (se queda como está hasta nuevo scoring)
- No agregar tests automatizados (solo QA del agente ejecutor)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Jest en backend)
- **Automated tests**: NO — cambio pequeño y acotado, QA scenarios del agente son suficientes
- **Agent-Executed QA**: ALWAYS — cada tarea incluye scenarios detallados

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Backend — foundation, can start immediately):
├── Task 1: Add breakdown to TokenScore domain entity
├── Task 2: Pass breakdown in ScoreTokenUseCase.create()
├── Task 3: Return breakdown from all read endpoints (3 use cases)
├── Task 4: Add JSON column to TypeORM entity
└── Task 5: Map breakdown in TypeORM mapper

Wave 2 (Frontend — after OR parallel with Wave 1):
├── Task 6: Update frontend TokenScoreView types
├── Task 7: Update ScoreBreakdown component for API format + colors
└── Task 8: Wire ScoreBreakdown into TokenDetailPage

Wave FINAL (Verification):
├── Task F1: Rebuild + check TypeScript compilation
├── Task F2: Run backend tests
├── Task F3: Verify API returns breakdown with curl
└── Task F4: Visual verification via browser
```

**Critical Path**: Task 1 → Task 2 → Task 3 → Task 7 → Task 8
**Parallel Speedup**: Tasks 4+5 can run alongside 3. Task 6 can start anytime.
**Max Concurrent**: 3 (Wave 1)

---

## TODOs

- [ ] 1. Add `breakdown` to `TokenScore` domain entity state

  **What to do**:
  - In `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts`:
    - Add `breakdown: readonly ScoreBreakdownItem[]` to `TokenScoreProps` interface
    - Add `breakdown` to `ScoreInput` interface  
    - Add `breakdown` parameter to `TokenScore.create()`, store in `state`
    - Add `breakdown` to `TokenScore.rehydrate()` parameters
    - Add `get breakdown()` getter returning `this.state.breakdown`
    - Update constructor call pattern to include breakdown
  - The `ScoreBreakdownItem` type already exists in the file: `{ factor: string; delta: number; note: string }`

  **Must NOT do**:
  - Do NOT change `ScoreInput` to make `breakdown` required in a way that breaks the spec
  - Do NOT modify `emitScored()` — the event intentionally excludes breakdown

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file change, well-defined scope, mechanical transformation
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (foundation)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts:9-17` — `ScoreBreakdownItem` type already defined
  - `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts:19-28` — `ScoreInput` interface (add `breakdown` here)
  - `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts:29-38` — `TokenScoreProps` (add `breakdown` here)
  - `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts:64` — `TokenScore.create()` signature
  - `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts:86` — `TokenScore.rehydrate()` signature
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:59` — breakdown array already computed in use case

  **Acceptance Criteria**:
  - [ ] `ScoreInput` includes `breakdown: readonly ScoreBreakdownItem[]`
  - [ ] `TokenScoreProps` includes `breakdown: readonly ScoreBreakdownItem[]`
  - [ ] `TokenScore.create()` accepts and stores breakdown
  - [ ] `TokenScore.rehydrate()` accepts and stores breakdown
  - [ ] `TokenScore.breakdown` getter returns the stored array
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Entity compiles with breakdown field
    Tool: Bash
    Preconditions: Task 1 edits applied
    Steps:
      1. Run: npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | head -20
    Expected Result: No TypeScript errors
    Failure Indicators: Any TS compilation errors
    Evidence: .sisyphus/evidence/task-1-tsc-pass.txt

  Scenario: Entity correctly stores breakdown
    Tool: Bash
    Preconditions: Task 1 edits applied
    Steps:
      1. Read the entity file and grep for 'breakdown' to verify all locations updated
    Expected Result: 'breakdown' appears in ScoreInput, TokenScoreProps, create(), rehydrate(), getter
    Failure Indicators: Missing any of the 5 locations
    Evidence: .sisyphus/evidence/task-1-breakdown-locations.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-tsc-pass.txt — TypeScript compilation output
  - [ ] task-1-breakdown-locations.txt — grep results showing all breakdown references

  **Commit**: NO (groups with final)
  - Message: `feat(scoring): persist and display token score breakdown`
  - Files: `all modified files in this task group`

- [ ] 2. Pass breakdown from `ScoreTokenUseCase` to entity creation

  **What to do**:
  - In `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts`:
    - The `breakdown` array is already computed (line 59 and throughout the method)
    - Pass `breakdown` to `TokenScore.create()` call around line 97
    - Also ensure the `TokenScoreMapper.toView()` call around line 111 continues to pass `breakdown`

  **Must NOT do**:
  - Do NOT change the scoring formula
  - Do NOT modify the event publishing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One-line change, trivial
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: None (read endpoints depend on this + entity)
  - **Blocked By**: Task 1

  **References**:
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:97-105` — `TokenScore.create()` call — needs `breakdown` param
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:59` — `breakdown` variable is already declared
  - `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts:111-123` — `TokenScoreMapper.toView()` call — already passes `breakdown`

  **Acceptance Criteria**:
  - [ ] `TokenScore.create()` receives the breakdown array
  - [ ] `ScoreTokenUseCase` compiles without errors
  - [ ] Backend tests pass

  **QA Scenarios**:
  ```
  Scenario: Use case passes breakdown to entity
    Tool: Bash
    Preconditions: Tasks 1-2 applied
    Steps:
      1. Run: npm run test:backend 2>&1 | tail -20
    Expected Result: All tests pass (no regressions from entity signature change)
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-tests-pass.txt
  ```

  **Evidence to Capture**:
  - [ ] task-2-tests-pass.txt — test output

  **Commit**: NO (groups with final)

- [ ] 3. Return breakdown from all read endpoints

  **What to do**:
  - In `apps/backend/src/token/scoring/application/handlers/get-token-score.use-case.ts`:
    - Change line 40: `breakdown: []` → `breakdown: score.breakdown`
  - In `apps/backend/src/token/scoring/application/handlers/list-token-scores.use-case.ts`:
    - Change line 31: `breakdown: []` → `breakdown: s.breakdown`
  - In `apps/backend/src/token/scoring/application/handlers/get-top-scores.use-case.ts`:
    - Change line 41: `breakdown: []` → `breakdown: s.breakdown`

  **Must NOT do**:
  - Do NOT add breakdown to `TokenScoredEvent` — event consumers don't need it

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 files, 3 one-line changes, mechanical
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (3 changes per file)
  - **Parallel Group**: Wave 1 (with Tasks 4, 5)
  - **Blocks**: Task 8 (frontend needs this to test)
  - **Blocked By**: Task 1

  **References**:
  - `apps/backend/src/token/scoring/application/handlers/get-token-score.use-case.ts:40` — `breakdown: []` → `score.breakdown`
  - `apps/backend/src/token/scoring/application/handlers/list-token-scores.use-case.ts:31` — `breakdown: []` → `s.breakdown`
  - `apps/backend/src/token/scoring/application/handlers/get-top-scores.use-case.ts:41` — `breakdown: []` → `s.breakdown`

  **Acceptance Criteria**:
  - [ ] All 3 read use cases pass `s.breakdown` instead of `[]`
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: API returns breakdown for existing token score
    Tool: Bash (curl)
    Preconditions: Backend running, Tasks 1-3 applied, a scored token exists
    Steps:
      1. Fetch a known token score: curl -s http://localhost:3030/token/scoring/tokens/solana/<existing-address>
      2. Parse JSON and check: echo "$result" | jq '.breakdown | length'
    Expected Result: breakdown is a non-empty array
    Failure Indicators: breakdown is empty array, null, or missing
    Evidence: .sisyphus/evidence/task-3-api-breakdown.txt

  Scenario: Top scores endpoint also returns breakdown
    Tool: Bash (curl)
    Steps:
      1. curl -s http://localhost:3030/token/scoring/tokens/top?limit=3
      2. Check first item: echo "$result" | jq '.[0].breakdown | length'
    Expected Result: breakdown present in each item
    Evidence: .sisyphus/evidence/task-3-top-breakdown.txt
  ```

  **Evidence to Capture**:
  - [ ] task-3-api-breakdown.txt — API response showing breakdown
  - [ ] task-3-top-breakdown.txt — top scores response

  **Commit**: NO (groups with final)

- [ ] 4. Add breakdown JSON column to TypeORM entity

  **What to do**:
  - In `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity.ts`:
    - Add `@Column({ name: 'breakdown', type: 'jsonb', nullable: true })`
    - Add `public breakdown!: Array<{ factor: string; delta: number; note: string }> | null;` field

  **Must NOT do**:
  - Do NOT make it non-nullable — existing rows won't have breakdown data

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single column addition, well-known pattern
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 5)
  - **Blocks**: Task 5
  - **Blocked By**: None (independent domain change)

  **References**:
  - `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity.ts:50` — existing `avg_channel_reputation` column as reference for column pattern
  - `apps/backend/src/token/scoring/domain/entities/token-score.entity.ts:9-13` — `ScoreBreakdownItem` type for the JSON structure

  **Acceptance Criteria**:
  - [ ] `breakdown` column exists with type `jsonb` and `nullable: true`
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Entity file has breakdown column
    Tool: Bash (grep)
    Steps:
      1. grep -n 'breakdown' apps/backend/src/token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity.ts
    Expected Result: Shows @Column with jsonb type and field declaration
    Failure Indicators: No breakdown column found
    Evidence: .sisyphus/evidence/task-4-column-found.txt
  ```
  **Evidence to Capture**:
  - [ ] task-4-column-found.txt — grep results

  **Commit**: NO (groups with final)

- [ ] 5. Map breakdown in TypeORM mapper

  **What to do**:
  - In `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/mappers/token-score.mapper.ts`:
    - In `toRow()`: add `row.breakdown = score.breakdown.length > 0 ? [...score.breakdown] : null`
    - In `toDomain()`: add `breakdown: row.breakdown ?? []` in the `rehydrate()` call

  **Must NOT do**:
  - Do NOT crash if `row.breakdown` is null — use `?? []`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two simple mappings, mechanical
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 3, 4)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 4

  **References**:
  - `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/mappers/token-score.mapper.ts:15-28` — `toRow()` method
  - `apps/backend/src/token/scoring/infrastructure/persistence/typeorm/mappers/token-score.mapper.ts:30-41` — `toDomain()` method

  **Acceptance Criteria**:
  - [ ] `toRow()` maps breakdown from domain entity to row
  - [ ] `toDomain()` maps breakdown from row to domain entity (defaulting to `[]` if null)
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Mapper compiles
    Tool: Bash
    Steps:
      1. npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | head -10
    Expected Result: No TS errors
    Failure Indicators: Any TS errors
    Evidence: .sisyphus/evidence/task-5-tsc-pass.txt
  ```
  **Evidence to Capture**:
  - [ ] task-5-tsc-pass.txt — TS compilation

  **Commit**: NO (groups with final)

- [ ] 6. Update frontend type definitions to match API

  **What to do**:
  - In `apps/frontend/src/entities/token-score/model/types.ts`:
    - Replace the current `TokenScoreView` with correct shape matching API:
      - Replace `factors: ReadonlyArray<{ factor: string; weight: number }>` with `breakdown: ReadonlyArray<{ factor: string; delta: number; note: string }>`
      - Add missing fields: `classification: string`, `sourceCount: number`, `mentionCount: number`, `avgKolReputation: number`
      - Rename `classifiedAt` → `scoredAt: string`
      - Keep `ticker: string | null` — it's used in page even if backend scoring endpoint doesn't return it

  **Must NOT do**:
  - Do NOT break existing usage of `TokenScoreView` in other files
  - Do NOT change `Chain` or `ScoreTier` imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file type update, mechanical
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None (type is contract, independent of backend)

  **References**:
  - `apps/frontend/src/entities/token-score/model/types.ts` — current types
  - `apps/backend/src/token/scoring/application/mappers/token-score.mapper.ts:10-22` — backend `TokenScoreView` (API contract)

  **Acceptance Criteria**:
  - [ ] `TokenScoreView` has `breakdown: ReadonlyArray<{ factor: string; delta: number; note: string }>` instead of `factors`
  - [ ] New fields (classification, sourceCount, mentionCount, avgKolReputation) added
  - [ ] `classifiedAt` renamed to `scoredAt`
  - [ ] TypeScript compiles without errors in frontend

  **QA Scenarios**:
  ```
  Scenario: Frontend compiles after type change
    Tool: Bash
    Steps:
      1. npx tsc --noEmit -p apps/frontend/tsconfig.json 2>&1 | head -20
    Expected Result: No TypeScript errors
    Failure Indicators: Any TS compilation errors
    Evidence: .sisyphus/evidence/task-6-tsc-pass.txt
  ```
  **Evidence to Capture**:
  - [ ] task-6-tsc-pass.txt — TS compilation

  **Commit**: NO (groups with final)

- [ ] 7. Update `ScoreBreakdown` component for API format

  **What to do**:
  - In `apps/frontend/src/entities/token-score/ui/score-gauge.tsx`:
    - Update `ScoreBreakdownProps` to use `delta` and `note` instead of `weight`:
      ```typescript
      interface ScoreBreakdownProps {
        factors: ReadonlyArray<{ factor: string; delta: number; note: string }>;
      }
      ```
    - Update the component rendering:
      - Show factor name (e.g., `LIQUIDITY_HIGH` → readable label via mapping object)
      - Show `f.delta` with `+` prefix for positive, red for negative
      - Show `f.note` as secondary text in slate-500
      - Color: `text-green-400` for `delta > 0`, `text-red-400` for `delta < 0`, `text-slate-400` for `delta === 0`
    - Add a human-readable factor label map:
      ```typescript
      const FACTOR_LABELS: Record<string, string> = {
        LIQUIDITY_HIGH: 'High Liquidity',
        LIQUIDITY_MEDIUM: 'Medium Liquidity',
        LIQUIDITY_LOW: 'Low Liquidity',
        LIQUIDITY_INSUFFICIENT: 'Insufficient Liquidity',
        HOLDERS_HIGH: 'High Holders',
        HOLDERS_MEDIUM: 'Medium Holders',
        HOLDERS_LOW: 'Low Holders',
        HOLDERS_NONE: 'No Holders',
        MC_HIGH: 'High Market Cap',
        MC_MEDIUM: 'Medium Market Cap',
        MC_LOW: 'Low Market Cap',
        VOLUME_HIGH: 'High Volume',
        VOLUME_LOW: 'Low Volume',
        MULTI_CHANNEL_BUZZ: 'Multi-Channel Buzz',
        TWO_CHANNELS: 'Two Channels',
        HIGH_MENTION_COUNT: 'High Mentions',
        MULTIPLE_MENTIONS: 'Multiple Mentions',
        SIGNAL_HONEYPOT: 'Honeypot Risk',
        SIGNAL_BLACKLIST: 'Blacklist Risk',
        CHANNEL_REPUTATION: 'Channel Reputation',
        SECURITY_FLAG_CAP: 'Security Cap',
      };
      ```
    - Keep `ScoreGauge` and `ScoreChain` exports unchanged

  **Must NOT do**:
  - Do NOT remove `ScoreGauge` or `ScoreChain` components
  - Do NOT change the export signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single component update, clear visual spec
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:
  - `apps/frontend/src/entities/token-score/ui/score-gauge.tsx:28-46` — current `ScoreBreakdown` component
  - `apps/frontend/src/entities/token-score/ui/score-gauge.tsx:1-4` — imports

  **Acceptance Criteria**:
  - [ ] `ScoreBreakdownProps` uses `delta: number` and `note: string` instead of `weight: number`
  - [ ] Positive deltas render in green with `+` prefix
  - [ ] Negative deltas render in red
  - [ ] Note text is displayed as secondary info
  - [ ] Factor labels are human-readable via mapping
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Frontend compiles
    Tool: Bash
    Steps:
      1. npx tsc --noEmit -p apps/frontend/tsconfig.json 2>&1 | head -20
    Expected Result: No TS errors
    Evidence: .sisyphus/evidence/task-7-tsc-pass.txt
  ```
  **Evidence to Capture**:
  - [ ] task-7-tsc-pass.txt — TS compilation

  **Commit**: NO (groups with final)

- [ ] 8. Wire `ScoreBreakdown` into `TokenDetailPage`

  **What to do**:
  - In `apps/frontend/src/pages/token-detail/index.tsx`:
    - Add `ScoreBreakdown` to the import from `@/entities/token-score`
    - Inside the Score card, after `ScoreGauge`, add `ScoreBreakdown`:
      ```tsx
      <Card>
        <h3 className="text-xs uppercase text-slate-400 mb-2">Score</h3>
        {score.data && (
          <div className="space-y-3">
            <ScoreGauge score={score.data.score} tier={score.data.tier} />
            {score.data.breakdown && score.data.breakdown.length > 0 && (
              <div className="pt-2 border-t border-slate-700">
                <h4 className="text-xs uppercase text-slate-500 mb-2">Factors</h4>
                <ScoreBreakdown factors={score.data.breakdown} />
              </div>
            )}
          </div>
        )}
      </Card>
      ```

  **Must NOT do**:
  - Do NOT remove `ScoreGauge`
  - Do NOT break layout of other cards in the grid

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple component integration
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 7

  **References**:
  - `apps/frontend/src/pages/token-detail/index.tsx:7` — current import line for `ScoreGauge` 
  - `apps/frontend/src/pages/token-detail/index.tsx:64-70` — Score card where `ScoreBreakdown` should render
  - `apps/frontend/src/entities/token-score/index.ts` — barrel export confirms `ScoreBreakdown` is exported

  **Acceptance Criteria**:
  - [ ] `ScoreBreakdown` is imported in `TokenDetailPage`
  - [ ] `ScoreBreakdown` renders below `ScoreGauge` when breakdown exists
  - [ ] Section is hidden when breakdown is empty/null
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  ```
  Scenario: Breakdown wired and compiles
    Tool: Bash
    Steps:
      1. grep -n 'ScoreBreakdown' apps/frontend/src/pages/token-detail/index.tsx
      2. npx tsc --noEmit -p apps/frontend/tsconfig.json 2>&1 | head -20
    Expected Result: ScoreBreakdown imported and used, no TS errors
    Failure Indicators: Import missing, TS errors
    Evidence: .sisyphus/evidence/task-8-wired.txt
  ```
  **Evidence to Capture**:
  - [ ] task-8-wired.txt — grep + TS compilation

  **Commit**: NO (groups with final)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> ALL must pass. Present consolidated results to user and get explicit "okay".

- [ ] F1. **Build & TypeScript Check**
  Run `npm run build` from monorepo root. Both backend and frontend must compile without errors.
  Output: `Build [PASS/FAIL]`

- [ ] F2. **Backend Tests**
  Run `npm run test:backend`. All existing tests must still pass (no regressions from entity changes).
  Output: `Tests [N pass/N fail]`

- [ ] F3. **API Verification**
  Start backend. Check that `GET /api/token/scoring/tokens/:chain/:address` returns `breakdown` with non-empty array.
  `curl -s http://localhost:3030/token/scoring/tokens/solana/<existing-address> | jq '.breakdown'`
  Output: `API returns breakdown: [YES/NO]`

- [ ] F4. **Visual Verification**
  Open `http://localhost:5173/tokens/solana/<existing-address>` in browser. Confirm:
  - Score card shows breakdown factors
  - Positive factors in green, negative in red
  - Each factor shows delta and note
  Output: `UI shows breakdown: [YES/NO]`

---

## Commit Strategy

- **1 commit**: `feat(scoring): persist and display token score breakdown`

---

## Success Criteria

### Verification Commands
```bash
# Build both apps
npm run build

# Backend tests
npm run test:backend

# API check
curl -s http://localhost:3030/token/scoring/tokens/solana/<address> | jq '.breakdown'

# Frontend dev
npm run dev:frontend
# Open http://localhost:5173/tokens/solana/{address}
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Build passes (backend + frontend)
- [ ] Backend tests pass
- [ ] API returns breakdown
- [ ] UI shows breakdown with colors
