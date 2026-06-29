# Code Quality Debt Resolution - Design

## Overview

This design outlines the technical approach to resolve 8 ESLint errors and 11 failing test suites in the onchain-bot project. The fixes are categorized into two phases: ESLint error fixes and test failure fixes.

## Glossary

- **Type Guard**: TypeScript function that narrows type from `any` to specific type
- **Arrow Function**: JavaScript function syntax that doesn't bind `this`
- **Named Import**: ES6 import syntax that imports specific exports by name
- **Default Import**: ES6 import syntax that imports the default export

## Phase 1: ESLint Error Fixes

### Fix 1.1: Helius Service Unsafe Return

**File**: `apps/backend/src/data-provider/helius/helius.service.ts`

**Problem**: Line 162 has implicit `any` return in catch block

**Solution**: Already fixed - explicit `return null` added in catch block

**Implementation**:
```typescript
// BEFORE (line 162)
catch (err) {
  this.logger.debug(`Helius parseTransaction failed: ${(err as Error).message}`);
  // implicit return undefined
}

// AFTER
catch (err) {
  this.logger.debug(`Helius parseTransaction failed: ${(err as Error).message}`);
  return null; // explicit return
}
```

**Impact**: Zero - already resolved

### Fix 1.2: KOL Reputation Scheduler Test - Arrow Functions

**File**: `apps/backend/src/kol/reputation/infrastructure/scheduling/kol-reputation.scheduler.spec.ts`

**Problem**: Object literal methods have implicit `any` for `this`

**Solution**: Convert methods to arrow functions to avoid `this` binding

**Implementation**:
```typescript
// BEFORE (lines 23-29)
function makeKolRepo(kols: Kol[]): FakeKolRepo {
  return {
    kols,
    async findAll() {
      return this.kols; // 'this' is any
    },
  } as unknown as FakeKolRepo;
}

// AFTER
function makeKolRepo(kols: Kol[]): FakeKolRepo {
  return {
    kols,
    findAll: async () => kols, // arrow function, no 'this'
  } as unknown as FakeKolRepo;
}
```

**Apply same pattern to `makeRecompute()`**:
```typescript
// BEFORE (lines 37-47)
function makeRecompute(): FakeRecompute {
  return {
    calls: [],
    failFor: new Set(),
    async execute(input: { kolId: string }) {
      this.calls.push(input); // 'this' is any
      if (this.failFor.has(input.kolId)) {
        throw new Error(`boom for ${input.kolId}`);
      }
      return {} as never;
    },
  } as unknown as FakeRecompute;
}

// AFTER
function makeRecompute(): FakeRecompute {
  const mock: FakeRecompute = {
    calls: [],
    failFor: new Set(),
    execute: async (input: { kolId: string }) => {
      mock.calls.push(input);
      if (mock.failFor.has(input.kolId)) {
        throw new Error(`boom for ${input.kolId}`);
      }
      return {} as never;
    },
  };
  return mock as unknown as FakeRecompute;
}
```

**Impact**: Fixes 2 ESLint errors (lines 28, 46)

### Fix 1.3: Call Tracking Tests - Add `this: void`

**Files**: 
- `apps/backend/src/token/call-tracking/infrastructure/default-tracking-filter-seed.service.spec.ts`
- `apps/backend/src/token/call-tracking/infrastructure/event-bus/call-published-tracked.handler.spec.ts`
- `apps/backend/src/token/call-tracking/infrastructure/scheduling/tracking-cron.scheduler.spec.ts`

**Problem**: Mock methods don't declare `this` type

**Solution**: Add `this: void` parameter to methods that don't use `this`

**Implementation Example**:
```typescript
// BEFORE
function makeMock(): SomeInterface {
  return {
    async someMethod() {
      // doesn't use 'this'
      return value;
    },
  };
}

// AFTER
function makeMock(): SomeInterface {
  return {
    async someMethod(this: void) {
      return value;
    },
  };
}
```

**Files to modify**:
1. `default-tracking-filter-seed.service.spec.ts` - lines 20, 26, 53
2. `call-published-tracked.handler.spec.ts` - lines 17, 39
3. `tracking-cron.scheduler.spec.ts` - check for similar patterns

**Impact**: Fixes 5 ESLint errors

## Phase 2: Test Failure Fixes

### Fix 2.1: Chain Detection Tests - Mock API Keys

**Files**:
- `src/chain/detection/infrastructure/probers/evm-chain-prober.adapter.spec.ts`
- `src/chain/detection/infrastructure/probers/solana-chain-prober.adapter.spec.ts`

**Problem**: Tests fail when ALCHEMY_API_KEY or RPC endpoints are missing

**Root Cause Analysis**:
1. Read test failures to identify which tests fail
2. Check if tests expect API keys in environment
3. Verify mock setup for Alchemy/RPC services

**Solution Options**:
- Option A: Mock Alchemy service completely (no real API calls)
- Option B: Provide test API keys in test environment
- Option C: Skip tests that require external APIs

**Recommended**: Option A - full mocking

**Implementation Steps**:
1. Identify Alchemy service dependencies
2. Create comprehensive mocks for `getCode()`, `getBalance()`, etc.
3. Update tests to use mocked services
4. Remove dependency on environment variables in tests

### Fix 2.2: Chain Explorer Provider Tests

**Files**: 7 provider adapter test files

**Problem**: Provider tests fail due to timeout/configuration issues

**Common Root Causes**:
- HTTP client timeout too short
- Mock axios responses incomplete
- Missing error handling in tests
- Service constructors require config that tests don't provide

**Solution Pattern** (apply to all 7 files):

1. **Review test setup**: Read each test file to understand failure mode
2. **Mock HTTP layer**: Ensure axios is properly mocked
3. **Provide complete responses**: Mock responses should match actual API shape
4. **Handle errors gracefully**: Tests should not throw on expected error cases
5. **Isolate from network**: No real HTTP calls should occur

**Implementation Template**:
```typescript
describe('ProviderAdapter', () => {
  let adapter: ProviderAdapter;
  let axiosMock: jest.Mocked<typeof axios>;

  beforeEach(() => {
    // Mock axios completely
    axiosMock = {
      get: jest.fn(),
      post: jest.fn(),
    } as any;
    
    // Inject mocked axios
    adapter = new ProviderAdapter({ apiKey: 'test-key', axios: axiosMock });
  });

  it('should handle success response', async () => {
    axiosMock.get.mockResolvedValue({ data: { /* complete response */ } });
    const result = await adapter.someMethod();
    expect(result).toBeDefined();
  });

  it('should handle error response', async () => {
    axiosMock.get.mockRejectedValue(new Error('API Error'));
    const result = await adapter.someMethod();
    expect(result).toBeNull(); // or appropriate error handling
  });
});
```

### Fix 2.3: Token Image Service Test

**File**: `src/chain/explorer/application/services/token-image.service.spec.ts`

**Problem**: Test fails due to cache adapter or image processing issues

**Investigation Steps**:
1. Read test file to identify failure
2. Check if LRU cache is properly mocked
3. Verify image buffer handling
4. Check placeholder generation logic

**Solution**: Will be determined after reading test failures

### Fix 2.4: LRU Cache Constructor Error

**File**: `src/shared/cache/token-image-cache.adapter.spec.ts`

**Problem**: `TypeError: lru_cache_1.LRUCache is not a constructor`

**Root Cause**: Import syntax mismatch with lru-cache version

**Solution**: Fix import statement

**Implementation**:
```typescript
// BEFORE (CommonJS-style import)
import { LRUCache } from 'lru-cache';

// AFTER (check package.json for lru-cache version)
// If version 7+:
import { LRUCache } from 'lru-cache';

// If version 6:
import LRU from 'lru-cache';
const cache = new LRU<K, V>(options);

// Verify actual usage in src code first, then match in tests
```

**Investigation Steps**:
1. Check `package.json` for lru-cache version
2. Read `src/shared/cache/token-image-cache.adapter.ts` to see actual implementation
3. Update test imports to match

## Implementation Order

### Phase 1: ESLint Fixes (Priority: High)
1. ✅ Fix 1.1: Helius unsafe return (already done)
2. Fix 1.2: KOL reputation scheduler (arrow functions)
3. Fix 1.3: Call tracking tests (`this: void`)

**Estimated Time**: 30 minutes

### Phase 2: Test Fixes (Priority: Medium)
1. Fix 2.4: LRU cache import (quick win)
2. Fix 2.1: Chain detection mocks
3. Fix 2.3: Token image service
4. Fix 2.2: Provider adapters (most time-consuming)

**Estimated Time**: 2-3 hours

## Verification

### ESLint Verification
```bash
cd apps/backend && npm run lint
# Expected: ✖ 0 problems (0 errors, X warnings)
```

### Test Verification
```bash
cd apps/backend && npm test
# Expected: Test Suites: 74 passed, 74 total
#           Tests: 600 passed, 600 total
```

## Rollback Plan

If any fix causes new issues:
1. Revert specific commit
2. Document failure reason
3. Re-evaluate approach
4. Apply alternative solution

## Notes

- All fixes should avoid using `eslint-disable` comments
- Prefer arrow functions over `this: void` when practical
- Keep test mocks simple and maintainable
- Document any non-obvious type assertions
