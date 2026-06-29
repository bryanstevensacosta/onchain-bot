# Implementation Plan

## Overview

This implementation plan resolves pre-existing code quality issues in the onchain-bot project:
- 8 ESLint errors (unsafe `any` types, missing `this: void` declarations)
- 11 failing test suites (chain detection, provider adapters, cache tests)

The plan follows a two-phase approach:
1. Phase 1: Fix ESLint errors (tasks 1-3)
2. Phase 2: Fix failing tests (tasks 4-8)

## Tasks

- [x] 1. Fix KOL Reputation Scheduler ESLint Errors
  - Convert object literal methods to arrow functions in `apps/backend/src/kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.spec.ts`
  - Line 28 error: `makeKolRepo` - replace `async findAll() { return this.kols; }` with `findAll: async () => kols`
  - Line 46 error: `makeRecompute` - create outer variable to reference in arrow function closure
  - **Acceptance Criteria**:
    - Line 28 error resolved: `makeKolRepo` uses arrow function instead of method
    - Line 46 error resolved: `makeRecompute` uses arrow function instead of method
    - No new `eslint-disable` comments added
    - All tests in the file still pass after running `npx jest kol-reputation.scheduler`
  - **Files to Modify**:
    - `apps/backend/src/kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.spec.ts`
  - _Requirements: 1.2, 3.2_

- [ ] 2. Add `this: void` to Call Tracking Test Helpers
  - Add explicit `this: void` parameter declarations to mock methods in call tracking test files
  - Add `this: void` as first parameter to methods that don't use `this`
  - Example: `async someMethod(this: void) { return value; }`
  - **Acceptance Criteria**:
    - All 5 ESLint errors in call tracking tests resolved
    - No new `eslint-disable` comments added
    - All tests in modified files pass after running `npx jest call-tracking`
  - **Files to Modify**:
    - `apps/backend/src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.spec.ts` (lines 20, 26, 53)
    - `apps/backend/src/token/call-tracking/infrastructure/event-bus/call-published-tracked.handler.spec.ts` (lines 17, 39)
  - _Requirements: 1.3, 3.3_

- [~] 3. Verify ESLint Errors Resolved
  - Run lint check to confirm all ESLint errors are resolved
  - Run: `cd apps/backend && npm run lint`
  - Expected output: `✖ 0 problems (0 errors, X warnings)`
  - If errors remain, investigate and fix
  - Run build to ensure no compilation errors: `cd apps/backend && npm run build`
  - **Acceptance Criteria**:
    - `npm run lint` in apps/backend shows 0 errors
    - No new warnings introduced
    - Build passes: `npm run build` succeeds
  - _Requirements: 5.1, 5.3_

- [~] 4. Fix LRU Cache Import in Token Image Cache Test
  - Fix the `LRUCache is not a constructor` error by using correct import syntax for lru-cache library
  - First check `package.json` for lru-cache version
  - Read `src/shared/cache/token-image-cache.adapter.ts` to see actual implementation
  - Match test import to source implementation
  - **Acceptance Criteria**:
    - Test file imports LRUCache correctly
    - `npx jest token-image-cache.adapter` passes
    - Import matches the actual implementation in source code
  - **Files to Modify**:
    - `apps/backend/src/shared/cache/token-image-cache.adapter.spec.ts`
  - _Requirements: 2.4, 4.3_

- [~] 5. Fix Chain Detection Test Mocks
  - Mock Alchemy services in chain detection tests to remove dependency on API keys
  - Mock Alchemy service methods: `getCode()`, `getBalance()`, etc.
  - Remove environment variable dependencies
  - Run: `npx jest chain-prober`
  - **Acceptance Criteria**:
    - EVM chain prober tests pass without API keys
    - Solana chain prober tests pass without API keys
    - All mocks provide complete responses
    - No network calls made during tests
  - **Files to Modify**:
    - `apps/backend/src/chain/detection/infrastructure/probers/evm-chain-prober.adapter.spec.ts`
    - `apps/backend/src/chain/detection/infrastructure/probers/solana-chain-prober.adapter.spec.ts`
  - _Requirements: 2.1, 4.1, 4.2_

- [~] 6. Fix Token Image Service Test
  - Fix token image service test failures related to cache adapter or image processing
  - First run test to see specific failure: `npx jest token-image.service`
  - Investigate cache mock setup and verify placeholder generation logic
  - **Acceptance Criteria**:
    - All token image service tests pass
    - Cache adapter properly mocked
    - Image buffer handling works correctly
  - **Files to Modify**:
    - `apps/backend/src/chain/explorer/application/services/token-image.service.spec.ts`
  - _Requirements: 2.3, 4.2_

- [~] 7. Fix Chain Explorer Provider Adapter Tests
  - Fix failing tests in 7 chain explorer provider adapters by improving mocks and error handling
  - Apply consistent mocking pattern to all 7 files
  - Mock axios completely with `jest.fn()`
  - Provide complete response structures matching actual API shape
  - **Acceptance Criteria**:
    - All 7 provider adapter tests pass
    - HTTP layer properly mocked with axios
    - No real network calls made
    - Error cases handled gracefully
  - **Files to Modify**:
    - `apps/backend/src/chain/explorer/infrastructure/providers/birdeye.adapter.spec.ts`
    - `apps/backend/src/chain/explorer/infrastructure/providers/coingecko.adapter.spec.ts`
    - `apps/backend/src/chain/explorer/infrastructure/providers/helius-das.adapter.spec.ts`
    - `apps/backend/src/chain/explorer/infrastructure/providers/helius.adapter.spec.ts`
    - `apps/backend/src/chain/explorer/infrastructure/providers/mobula.adapter.spec.ts`
    - `apps/backend/src/chain/explorer/infrastructure/providers/moralis.adapter.spec.ts`
    - `apps/backend/src/chain/explorer/infrastructure/providers/solana-rpc.adapter.spec.ts`
  - _Requirements: 2.2, 4.2_

- [~] 8. Verify All Tests Pass
  - Run full test suite to confirm all tests pass
  - Run: `cd apps/backend && npm test`
  - Expected: All test suites pass
  - If failures remain, investigate and fix
  - **Acceptance Criteria**:
    - `npm test` in apps/backend shows 0 failing test suites
    - All previously failing tests now pass
    - No new test failures introduced
    - Coverage maintained or improved
  - _Requirements: 5.2, 5.4_

## Task Dependency Graph

```
1 (KOL Scheduler ESLint) ─┐
                          ├→ 3 (Verify Lint) ─┐
2 (Call Tracking ESLint) ─┘                   │
                                              ├→ 5 (Chain Detection) ─┐
                          4 (LRU Cache) ──────┼→ 6 (Image Service) ───┼→ 8 (Verify All)
                                              │                        │
                                              └→ 7 (Providers) ────────┘
```

**Critical Path**: 1 → 3 → 7 → 8 or 2 → 3 → 7 → 8

**Parallel Opportunities**:
- Tasks 1 and 2 can be executed in parallel
- Tasks 4, 5, 7 can be executed in parallel after Task 3 completes
- Task 6 must wait for Task 4 (depends on LRU cache fix)

```json
{
  "waves": [
    {
      "name": "ESLint Fixes",
      "tasks": ["1", "2"]
    },
    {
      "name": "Verify Lint",
      "tasks": ["3"]
    },
    {
      "name": "Test Fixes",
      "tasks": ["4", "5", "7"]
    },
    {
      "name": "Image Service",
      "tasks": ["6"]
    },
    {
      "name": "Final Verification",
      "tasks": ["8"]
    }
  ]
}
```

## Notes

### Implementation Guidelines

1. **No eslint-disable**: All fixes should use proper TypeScript patterns rather than suppression comments

2. **Arrow Functions vs this: void**: 
   - Use arrow functions when the method needs to reference outer scope variables
   - Use `this: void` when the method is standalone and doesn't use `this`

3. **Test Isolation**: All tests should run without external dependencies (API keys, network access)

4. **Mock Completeness**: Mocks should match actual service interfaces exactly

5. **Verification Commands**:
   - Lint: `cd apps/backend && npm run lint`
   - Build: `cd apps/backend && npm run build`
   - Tests: `cd apps/backend && npm test`
   - Specific test: `cd apps/backend && npx jest <pattern>`

### Phase 1: ESLint Fixes (Tasks 1-3)
**Estimated Time**: 30 minutes
**Goal**: Zero ESLint errors

### Phase 2: Test Fixes (Tasks 4-8)
**Estimated Time**: 2-3 hours
**Goal**: All tests passing
