# Bug Exploration Test Results

## Test Execution Summary

**Date**: 2026-06-28  
**Test File**: `apps/backend/src/token/call-tracking/application/handlers/track-published-call-bug-exploration.spec.ts`  
**Status**: Tests run on UNFIXED code

## Bug 1: mcAtPublish Validation Failure

### Test Results: ✅ ALL TESTS PASSED (Unexpected)

**Conclusion**: Bug 1 does NOT appear to exist in the current codebase.

### Analysis

The bugfix design document claims that the expression `published?.mcAtCall ?? 0` fails when `published` is `null`, causing `mcAtPublish` to be `undefined` and triggering a validation error. However, testing confirms this is **not true** in JavaScript/TypeScript:

```typescript
const published = null;
const mcAtPublish = published?.mcAtCall ?? 0;
// Result: mcAtPublish = 0 ✅
```

**Evaluation chain**:
1. `published` is `null`
2. `published?.mcAtCall` evaluates to `undefined` (optional chaining returns `undefined` for nullish values)
3. `undefined ?? 0` evaluates to `0` (nullish coalescing triggers on `undefined`)
4. Result: `mcAtPublish = 0` ✅

### Test Cases Executed

1. ✅ **EVM: mcAtPublish defaults to 0 when published call not found**
   - Input: `published = null`, chain = 'ethereum'
   - Expected: mcAtPublish = 0
   - Actual: mcAtPublish = 0
   - **PASSED**

2. ✅ **Solana: mcAtPublish defaults to 0 when published call not found**
   - Input: `published = null`, chain = 'solana'
   - Expected: mcAtPublish = 0
   - Actual: mcAtPublish = 0
   - **PASSED**

3. ✅ **Should default mcAtPublish to 0 and kolId to unknown**
   - Input: `published = null`, no kolId provided
   - Expected: mcAtPublish = 0, kolId = 'unknown'
   - Actual: mcAtPublish = 0, kolId = 'unknown'
   - **PASSED**

### Recommendation

**Bug 1 does NOT need to be fixed** - the code already works correctly. The root cause analysis in the design document appears to be based on incorrect understanding of JavaScript optional chaining and nullish coalescing semantics.

The existing test in `track-published-call.use-case.spec.ts` already validates this behavior:
```typescript
it('falls back to mcAtPublish=0 when published call repo returns null', async () => {
  // This test PASSES, confirming the behavior works correctly
});
```

---

## Bug 2: Invalid Solana Address Normalization

### Test Results: ❌ ALL TESTS FAILED (As Expected)

**Conclusion**: Bug 2 EXISTS in the current codebase and needs to be fixed.

### Counterexamples Documented

All tests failed as expected on the unfixed code, confirming that Solana addresses are incorrectly lowercased:

### Test Cases Executed

1. ❌ **Should preserve original case when normalizing Solana address**
   - Input: `'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'`
   - Expected: stored value = `'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'`
   - Actual: stored value = `'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'`
   - **FAILED** - Address is lowercased, corrupting the Base58 encoding

2. ❌ **Should reconstruct Solana address from stored value**
   - Input: `'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'`
   - Step 1: Normalize and store → stored as `'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'`
   - Step 2: Attempt reconstruction from stored value → **FAILED with null**
   - Expected: Successfully reconstruct with original case
   - Actual: `fromChainHint()` returns `null` because Base58 validation fails on lowercased address
   - **FAILED** - Reconstruction impossible due to address corruption

3. ✅ **Demonstrates lowercased Solana address fails validation**
   - Input: `'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'` (already lowercased)
   - Expected: Throws DomainError "Invalid Solana address"
   - Actual: Throws DomainError "Invalid Solana address"
   - **PASSED** - Confirms that lowercase Base58 is invalid

4. ❌ **Should preserve case for various Solana addresses**
   - Tested 3 different Solana addresses:
     - `'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'` (USDC)
     - `'So11111111111111111111111111111111111111112'` (Wrapped SOL)
     - `'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'` (USDT)
   - Expected: All addresses preserve their original case
   - Actual: All addresses are lowercased
   - **FAILED** - Consistent bug across all Solana addresses

### Root Cause Confirmed

File: `apps/backend/src/token/identity/normalized-address.vo.ts`  
Function: `NormalizedAddress.fromSolana()`  
Line: 61

```typescript
return new NormalizedAddress({
  value: raw.toLowerCase(),  // ← BUG: Lowercases the Base58 address
  chain: ChainFamily.SOLANA,
});
```

**Issue**: Solana addresses use Base58 encoding, which is case-sensitive. Lowercasing changes the decoded byte array, corrupting the address. When the address is later reconstructed from the database, Base58 validation fails.

**Impact**:
- Solana addresses cannot be stored and retrieved correctly
- All Solana call tracking fails
- Historical Solana data is corrupted in the database (if any exists)

---

## Next Steps

### Bug 1: No Action Required
- ✅ Code already works correctly
- ✅ Existing tests validate the behavior
- 📋 Update design document to reflect that Bug 1 does not exist

### Bug 2: Implementation Required
1. ✅ Bug confirmed through exploration tests
2. ⏭️ Implement fix in `normalized-address.vo.ts`:
   - Remove `.toLowerCase()` call in `fromSolana()` method
   - Keep `.toLowerCase()` in `fromEvm()` method (correct behavior for EVM)
3. ⏭️ Update existing unit test in `normalization-vos.spec.ts`
4. ⏭️ Run all tests to verify fix and preservation of EVM behavior
5. ⏭️ Address database migration if corrupted Solana addresses exist

---

## Test Evidence

### Bug 2 Test Failure Output

```
FAIL src/token/call-tracking/application/handlers/track-published-call-bug-exploration.spec.ts

● NormalizedAddress - Bug 2: Solana Address Case Preservation › Property 2: Bug Condition - should preserve original case

  expect(received).toBe(expected)

  Expected: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  Received: "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v"

● NormalizedAddress - Bug 2: Solana Address Case Preservation › Property 2: Bug Condition - should reconstruct Solana address

  expect(received).not.toBeNull()

  Received: null

● NormalizedAddress - Bug 2: Solana Address Case Preservation › Property 2: Bug Condition - should preserve case for various addresses

  expect(received).toBe(expected)

  Expected: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  Received: "epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v"
```

All failures show the same pattern: addresses are lowercased when they should preserve case.
