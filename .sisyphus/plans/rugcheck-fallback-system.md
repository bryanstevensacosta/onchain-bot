# RugCheck Fallback System - Always Show Data

## TL;DR

> **Quick Summary**: Add fallback system to RugCheck adapter so gauge always shows data (real or mock) for Solana tokens.
> 
> **Deliverables**:
> - RugCheck adapter with mock data fallback
> - Nested `rugcheck` object in API responses
> - Frontend gauge shows data or "no data" state
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential
> **Critical Path**: Backend → Frontend → Verify

---

## Context

### Problem
- RugCheck API returns null for most tokens (no analysis data)
- LiquidityGauge hides when data is null → never visible
- User wants system that **always provides data** (real or synthetic)

### Solution
1. Try real RugCheck API first
2. If no data → generate deterministic mock data based on address
3. Restructure to nested `rugcheck` object
4. Gauge shows data or "no data" state

---

## Work Objectives

### Core Objective
Make LiquidityGauge always visible with real or mock data.

### Concrete Deliverables
- Updated `rugcheck.adapter.ts` with fallback system
- Nested `rugcheck` object in API responses (backend + frontend)
- Updated `LiquidityGauge` component with "no data" state
- Verified gauge renders in UI

### Definition of Done
- [ ] Token detail page shows gauge (with data or "no data" indicator)
- [ ] Mock data is deterministic per token address
- [ ] Real RugCheck data takes precedence over mock

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: NO (manual verification)
- **Framework**: N/A
- **Agent-Executed QA**: Playwright for browser verification

---

## Execution Strategy

### Tasks (Sequential)

1. **Update RugCheck Adapter** — Add fallback system with mock data
2. **Restructure to Nested Object** — Backend entity + mapper + types
3. **Update Frontend Types** — Add nested `rugcheck` to TokenSnapshotView
4. **Update LiquidityGauge** — Show data or "no data" state
5. **Verify** — Playwright check

---

## TODOs

- [ ] 1. Update RugCheck Adapter with Fallback System

  **What to do**:
  - Modify `apps/backend/src/chain/explorer/infrastructure/providers/rugcheck.adapter.ts`
  - Add `fetchFromApi()` method (try real API first)
  - Add `getMockData()` method (deterministic based on address hash)
  - Return mock data when API returns null
  - Add debug log when using mock data

  **References**:
  - `apps/backend/src/chain/explorer/infrastructure/providers/rugcheck.adapter.ts` - Current adapter

  **Acceptance Criteria**:
  - [ ] API call attempted first
  - [ ] Mock data returned when API has no data
  - [ ] Mock data is deterministic (same address = same values)

- [ ] 2. Restructure to Nested rugcheck Object (Backend)

  **What to do**:
  - Update `SnapshotInput` interface in `token-snapshot.entity.ts`
  - Add `rugcheck` nested object with: `lockedLiquidityPercent`, `burnedPercent`, `isMock`
  - Update `TokenSnapshotMapper.toView()` to output nested object
  - Update TypeORM entity if needed

  **References**:
  - `apps/backend/src/token/market-data/domain/entities/token-snapshot.entity.ts:8-25`
  - `apps/backend/src/token/market-data/application/mappers/token-snapshot.mapper.ts:3-29`

  **Acceptance Criteria**:
  - [ ] API returns `{ rugcheck: { lockedLiquidityPercent, burnedPercent, isMock } }`

- [ ] 3. Update Frontend Types for Nested rugcheck

  **What to do**:
  - Update `TokenSnapshotView` in `apps/frontend/src/entities/token-snapshot/model/types.ts`
  - Add nested `rugcheck` object

  **References**:
  - `apps/frontend/src/entities/token-snapshot/model/types.ts:3-29`

  **Acceptance Criteria**:
  - [ ] Frontend types match backend nested structure

- [ ] 4. Update LiquidityGauge for "No Data" State

  **What to do**:
  - Update `LiquidityGauge` component
  - Show gauge with data OR muted "no data" indicator
  - Check `rugcheck?.isMock` to show "(mock)" label

  **References**:
  - `apps/frontend/src/shared/ui/liquidity-gauge.tsx`

  **Acceptance Criteria**:
  - [ ] Gauge renders when data present
  - [ ] Shows "No data" or muted state when null
  - [ ] Shows "(mock)" label when using fallback data

- [ ] 5. Verify with Playwright

  **What to do**:
  - Navigate to token detail page
  - Verify gauge is visible
  - Take screenshot

  **QA Scenarios**:

  Scenario: Gauge is visible on token detail page
    Tool: Playwright (skill: playwright)
    Preconditions: Backend running, frontend running
    Steps:
      1. Navigate to http://localhost:5173/tokens/solana/Ckit5s1Cpc3RdMh1HrhfW2nAy4PnkkgjXgXMeykbpump
      2. Wait for page load
      3. Find liquidity section
      4. Verify gauge element is present
    Expected Result: Gauge or "no data" indicator visible
    Evidence: .sisyphus/evidence/rugcheck-gauge-visible.png

---

## Final Verification Wave

- [ ] F1. **Gauge Visibility Check** — Verify gauge renders on token detail page

---

## Commit Strategy

- **1**: `feat(rugcheck): add fallback system with mock data`

---

## Success Criteria

### Verification Commands
```bash
# Backend should rebuild without errors
cd apps/backend && npm run build

# Frontend should rebuild without errors  
cd apps/frontend && npm run build
```

### Final Checklist
- [ ] Gauge always visible (data or "no data")
- [ ] Mock data deterministic per address
- [ ] Real data takes precedence