# KOLs: Default ACTIVE + "Deactivate" label + Remove Block Button

## TL;DR

> **Quick Summary**: All KOLs currently show "Activate" because their default `lifecycleStatus` is `DORMANT`. Change the default to `ACTIVE`, rename "Dormant" button to "Deactivate", and remove the "Block" button.
>
> **Deliverables**:
> - Backend: Change default lifecycle to `ACTIVE` in domain entity + TypeORM entity
> - Frontend: Rename "Dormant" → "Deactivate", remove "Block" button
>
> **Estimated Effort**: Quick (10 min)
> **Parallel Execution**: YES — 2 parallel waves
> **Critical Path**: Backend defaults → (frontend can be parallel)

---

## Context

### Original Request
> "en http://localhost:5173/kols están todos los botones 'activate' lo que indica que no están activados, todos deberían estar activados por ende lo que debería mostrar es deactivate, además elimina el botón block"
> Clarification: "no eliminarás el botón [activate/deactivate toggle], lo que harás es activar todos los sources para que alli solo muestre deactivate (porque ya todos estarían activados) y si desactivo uno mostrará activate, lo unico que quiero eliminar es el boton de block"

### Root Cause
The `lifecycleStatus` default is `'DORMANT'` in two places:
1. **Domain entity** (`domain/entities/kol.entity.ts:53`): `lifecycleStatus: 'DORMANT'` in `Kol.create()`
2. **TypeORM entity** (`infrastructure/persistence/typeorm/entities/kol.entity.ts:45`): `default: 'DORMANT'` column default

### Current Frontend Logic
```
if lifecycleStatus !== 'ACTIVE' → "Activate" button (sets to ACTIVE)
if lifecycleStatus === 'ACTIVE' → "Dormant" button (sets to DORMANT)
if lifecycleStatus !== 'BLACKLISTED' → "Block" button (sets to BLACKLISTED) ← REMOVE
```

### Desired Behavior
- All KOLs start as ACTIVE by default → "Deactivate" button is visible
- If user clicks "Deactivate" → status becomes DORMANT → "Activate" button appears
- If user clicks "Activate" → status becomes ACTIVE → "Deactivate" button appears
- No "Block" button anywhere

---

## Work Objectives

### Core Objective
Make all KOLs active by default and clean up the button UI.

### Concrete Deliverables
- `apps/backend/src/telegram-kol/identity/domain/entities/kol.entity.ts` — changed default to ACTIVE
- `apps/backend/src/telegram-kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts` — changed default to ACTIVE
- `apps/frontend/src/pages/kols/index.tsx` — renamed "Dormant" → "Deactivate", removed Block button

### Definition of Done
- [ ] Visit `http://localhost:5173/kols` and see "Deactivate" button for every KOL
- [ ] Click "Deactivate" → button changes to "Activate" (and KOL pauses)
- [ ] Click "Activate" → button changes back to "Deactivate"
- [ ] No "Block" button visible anywhere on the page

### Must Have
- Default lifecycle status changed from DORMANT to ACTIVE
- "Dormant" button label changed to "Deactivate"
- "Block" button removed entirely

### Must NOT Have (Guardrails)
- Do NOT modify the Activate/DORMANT toggle logic — keep it as-is
- Do NOT remove the `SetKolLifecycleButton` component itself (it's reused)
- Do NOT change the `blacklist()` method on the domain entity
- Do NOT modify `isActive` default in the domain entity (stays false)
- Do NOT change any other files

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO (no test infra for frontend page)
- **Automated tests**: None needed for these trivial changes
- **Agent-Executed QA**: Playwright browser verification

### QA Policy
Each scenario verified via Playwright with specific selectors and assertions.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (parallel — backend defaults):
├── Task 1: Change domain entity default from DORMANT → ACTIVE
└── Task 2: Change TypeORM entity default from DORMANT → ACTIVE

Wave 2 (after or parallel — frontend UI):
├── Task 3: Rename "Dormant" → "Deactivate", remove Block button
```

---

## TODOs

- [ ] 1. Change default lifecycle in domain entity

  **What to do**:
  - Edit `apps/backend/src/telegram-kol/identity/domain/entities/kol.entity.ts`
  - Change line 53 from `lifecycleStatus: 'DORMANT'` to `lifecycleStatus: 'ACTIVE'`

  **Must NOT do**:
  - Do NOT change `isActive: false` (line 52) — this is the runtime listener state, not lifecycle

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1, with Task 2)
  - **Blocks**: None (conceptual pre-req for frontend but not blocking)
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/telegram-kol/identity/domain/entities/kol.entity.ts:48-56` — `Kol.create()` method with props

  **Acceptance Criteria**:
  **QA Scenarios**:
  ```
  Scenario: Verify default is ACTIVE in domain entity
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "lifecycleStatus" apps/backend/src/telegram-kol/identity/domain/entities/kol.entity.ts
    Expected Result: Line with `lifecycleStatus: 'ACTIVE'` in the create method
    Evidence: .sisyphus/evidence/task-1-domain-default.txt
  ```

  **Commit**: YES
  - Message: `fix(kol): change default lifecycleStatus from DORMANT to ACTIVE in domain entity`

- [ ] 2. Change default lifecycle in TypeORM entity

  **What to do**:
  - Edit `apps/backend/src/telegram-kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts`
  - Change line 45 from `default: 'DORMANT'` to `default: 'ACTIVE'`

  **Must NOT do**:
  - Do NOT change any other column defaults

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1, with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `apps/backend/src/telegram-kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts:41-47` — lifecycle_status column definition

  **Acceptance Criteria**:
  **QA Scenarios**:
  ```
  Scenario: Verify default is ACTIVE in TypeORM entity
    Tool: Bash (grep)
    Steps:
      1. Run: grep -n "default:" apps/backend/src/telegram-kol/identity/infrastructure/persistence/typeorm/entities/kol.entity.ts
    Expected Result: Line shows `default: 'ACTIVE'` for lifecycle_status column
    Evidence: .sisyphus/evidence/task-2-typeorm-default.txt
  ```

  **Commit**: YES (groups with task 1)
  - Message: `fix(kol): change default lifecycleStatus from DORMANT to ACTIVE in domain entity`

- [ ] 3. Update frontend: rename "Dormant" → "Deactivate", remove Block button

  **What to do**:
  - Edit `apps/frontend/src/pages/kols/index.tsx`
  - **Rename**: Change button label from `"Dormant"` to `"Deactivate"` (around line 75)
  - **Remove**: Delete the entire "Block" button block (lines ~78-85):
    ```tsx
    {kol.lifecycleStatus !== 'BLACKLISTED' && (
      <SetKolLifecycleButton
        kolId={kol.id}
        status="BLACKLISTED"
        label="Block"
        tone="danger"
      />
    )}
    ```

  **Must NOT do**:
  - Do NOT touch the "Activate" button logic (lines ~63-69) — keep it as-is
  - Do NOT modify the `SetKolLifecycleButton` component
  - Do NOT modify `BackfillButton` or any other component

  **After change, the buttons section should look like**:
  ```tsx
        {kol.lifecycleStatus !== 'ACTIVE' && (
          <SetKolLifecycleButton
            kolId={kol.id}
            status="ACTIVE"
            label="Activate"
            tone="primary"
          />
        )}
        {kol.lifecycleStatus === 'ACTIVE' && (
          <SetKolLifecycleButton
            kolId={kol.id}
            status="DORMANT"
            label="Deactivate"
          />
        )}
        <BackfillButton kolId={kol.id} limit={20} />
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2, can run while backend tasks deploy)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `apps/frontend/src/pages/kols/index.tsx:59-87` — The button section to modify

  **Acceptance Criteria**:

  **QA Scenarios**:

  ```
  Scenario: KOLs page shows correct buttons
    Tool: Playwright (dev-browser)
    Preconditions: Frontend dev server on :5173, backend on :3030 with new defaults
    Steps:
      1. Navigate to http://localhost:5173/kols
      2. Wait for KOL list to load
      3. Assert: At least one button with text "Deactivate" exists
      4. Assert: NO button with text "Block" exists anywhere on the page
      5. Assert: NO button with text "Dormant" exists anywhere on the page
    Expected Result: All KOLs show "Deactivate" (since default is now ACTIVE), no Block button
    Evidence: .sisyphus/evidence/task-3-kols-page.png

  Scenario: Toggle works — Deactivate → Activate → Deactivate
    Tool: Playwright (dev-browser)
    Preconditions: Frontend on :5173, backend on :3030
    Steps:
      1. Navigate to http://localhost:5173/kols
      2. Wait for KOL list to load
      3. Click the first "Deactivate" button
      4. Wait for mutation to complete (button re-renders)
      5. Assert: Button text changes to "Activate" for that KOL
      6. Click "Activate" button
      7. Wait for mutation to complete
      8. Assert: Button text changes back to "Deactivate"
    Expected Result: Toggle works correctly without console errors
    Evidence: .sisyphus/evidence/task-3-toggle-cycle.png
  ```

  **Evidence to Capture**:
  - [ ] Screenshot of KOLs page showing "Deactivate" buttons
  - [ ] Screenshots of toggle cycle (Deactivate → Activate → Deactivate)

  **Commit**: YES
  - Message: `fix(kols): rename Dormant to Deactivate and remove Block button`
  - Files: `apps/frontend/src/pages/kols/index.tsx`

---

## Success Criteria

### Final Checklist
- [ ] All KOLs show "Deactivate" on initial page load
- [ ] Clicking "Deactivate" → shows "Activate" (KOL goes DORMANT)
- [ ] Clicking "Activate" → shows "Deactivate" (KOL goes ACTIVE)
- [ ] No "Block" button visible anywhere
- [ ] No "Dormant" label visible anywhere
- [ ] Backend compiles without errors
- [ ] Frontend compiles without errors
