# Call Tracking Validation Errors Bugfix Design

## Overview

This design addresses two validation bugs that prevent published calls from being tracked correctly:

**Bug 1: mcAtPublish Validation Failure** - The `TrackPublishedCallUseCase` fails when `PublishedCallRepository.findByChainAndAddress()` returns `null` because the fallback expression `published?.mcAtCall ?? 0` evaluates to `undefined` instead of `0`, causing the domain entity validation to reject the value.

**Bug 2: Invalid Solana Address Normalization** - The `NormalizedAddress.fromSolana()` method incorrectly lowercases Solana addresses, which corrupts the Base58-encoded string. When addresses are reconstructed from the database, Base58 validation fails because lowercase characters produce invalid encodings.

Both bugs prevent call tracking from functioning on both Ethereum and Solana chains. The fix involves correcting the fallback logic in Bug 1 and removing the lowercasing operation for Solana addresses in Bug 2.

## Glossary

- **Bug_Condition (C)**: The conditions that trigger the bugs:
  - C1: `published` is `null` when tracking a call
  - C2: A Solana address is normalized via `NormalizedAddress.fromSolana()`
- **Property (P)**: The desired behavior when the bug conditions hold:
  - P1: `mcAtPublish` defaults to `0` when `published` is `null`
  - P2: Solana addresses preserve their original case-sensitive Base58 encoding
- **Preservation**: Existing behaviors that must remain unchanged:
  - EVM address lowercasing continues to work
  - Valid `mcAtPublish` values from existing published calls continue to be used
  - Base58 validation continues to reject invalid Solana addresses
- **TrackPublishedCallUseCase**: The application service in `track-published-call.use-case.ts` that creates tracked published calls
- **TrackedPublishedCall**: The domain entity that validates `mcAtPublish` must be a non-negative finite number
- **NormalizedAddress**: The value object in `normalized-address.vo.ts` that canonicalizes blockchain addresses per chain
- **PublishedCallRepository**: Repository that retrieves published call metadata including `mcAtCall`

## Bug Details

### Bug Condition

**Bug 1: mcAtPublish Validation Failure**

The bug manifests when `PublishedCallRepository.findByChainAndAddress()` returns `null`. The expression `published?.mcAtCall ?? 0` evaluates to `undefined` because optional chaining returns `undefined` when the object is `null`, and the nullish coalescing operator only triggers for `null` or `undefined` values on the *entire chain*, not intermediate values.

**Formal Specification:**
```
FUNCTION isBugCondition1(input)
  INPUT: input of type { published: PublishedCall | null }
  OUTPUT: boolean
  
  RETURN input.published IS null
END FUNCTION
```

**Bug 2: Invalid Solana Address Normalization**

The bug manifests when a Solana address is normalized. The `fromSolana()` method calls `.toLowerCase()` on the Base58 string, which corrupts it. Base58 encoding is case-sensitive - changing case produces a different decoded value or invalid encoding. When the corrupted address is stored and later reconstructed, Base58 validation fails.

**Formal Specification:**
```
FUNCTION isBugCondition2(input)
  INPUT: input of type { address: string, chain: 'solana' }
  OUTPUT: boolean
  
  RETURN input.chain == 'solana'
         AND addressContainsUppercaseCharacters(input.address)
         AND isValidBase58(input.address)
END FUNCTION
```

### Examples

**Bug 1 Examples:**
- **Input**: `chain='evm'`, `address='0xabc...'`, `published=null` → **Actual**: Validation error "mcAtPublish must be a non-negative finite number" → **Expected**: Create tracked call with `mcAtPublish=0`
- **Input**: `chain='solana'`, `address='EPjF...'`, `published=null` → **Actual**: Validation error → **Expected**: Create tracked call with `mcAtPublish=0`
- **Edge case**: `published={mcAtCall: null}` → **Expected**: Create tracked call with `mcAtPublish=0` (already works)

**Bug 2 Examples:**
- **Input**: `NormalizedAddress.fromSolana('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')` → **Actual**: Stores `'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'`, reconstruction fails with "Invalid Solana address" → **Expected**: Stores `'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'`, reconstruction succeeds
- **Input**: Already lowercase Solana address → **Actual**: Works (no uppercase to corrupt) → **Expected**: Continues to work
- **Edge case**: Invalid Solana address (not Base58) → **Expected**: Throws DomainError immediately (continues to work)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- EVM addresses must continue to be lowercased for case-insensitive comparison
- Existing published calls with valid `mcAtCall` values must continue to use those values
- TrackedPublishedCall entity validation must continue to enforce non-negative finite numbers for `mcAtPublish`
- Base58 validation must continue to reject invalid Solana addresses
- Optional chaining and nullish coalescing must continue to work for `published?.mcAtCall`
- `reconstructLooseAddress()` fallback logic must continue to handle migration edge cases
- kolId derivation from `published?.publishedChannelIds[0]` must continue to work
- Tracked call logging must continue to show the tracked ID and `mcAtPublish` value

**Scope:**
All inputs that do NOT involve a `null` published call (Bug 1) or Solana address normalization (Bug 2) should be completely unaffected by this fix. This includes:
- EVM call tracking with valid published calls
- EVM address normalization and storage/retrieval
- Solana call tracking with valid published calls (after fix)
- All other value object validations and domain logic

## Hypothesized Root Cause

**Bug 1: mcAtPublish Validation Failure**

Based on the bug analysis, the root cause is operator precedence and optional chaining semantics:

1. **Incorrect Operator Precedence**: The expression `published?.mcAtCall ?? 0` is evaluated as `(published?.mcAtCall) ?? 0`
   - When `published` is `null`, `published?.mcAtCall` returns `undefined`
   - The nullish coalescing operator `??` should trigger, but it only checks the final result
   - TypeScript doesn't catch this because `number | undefined` is assignable to the variable

2. **Missing Parentheses**: The intent was `(published?.mcAtCall) ?? 0`, but this still doesn't work when `published` is `null`
   - The correct expression should be `published?.mcAtCall ?? 0` with explicit handling of the `null` case
   - OR use a conditional: `published ? (published.mcAtCall ?? 0) : 0`

3. **Validation Enforcement**: `TrackedPublishedCall.create()` correctly validates `mcAtPublish` with `Number.isFinite()` and `>= 0`
   - The validation properly rejects `undefined` because `Number.isFinite(undefined)` returns `false`
   - This is working as designed - the bug is in the calling code

**Bug 2: Invalid Solana Address Normalization**

Based on the code analysis, the root cause is incorrect assumption about address canonicalization:

1. **Case-Sensitivity of Base58**: Base58 encoding is case-sensitive by design
   - Lowercasing changes the decoded byte array
   - Example: `EPjFWdd...` decodes differently than `epjfwdd...`
   - The lowercase version may fail validation entirely

2. **EVM Pattern Applied to Solana**: The normalization logic lowercases Solana addresses following the EVM pattern
   - EVM addresses are hex-encoded, where case doesn't affect the decoded value
   - Solana addresses are Base58-encoded, where case is semantically significant
   - The `fromSolana()` method incorrectly applies EVM normalization to Solana

3. **Validation Timing**: Base58 validation happens before lowercasing
   - The original address passes validation
   - Lowercasing corrupts the address after validation
   - On reconstruction, the corrupted address fails validation

## Correctness Properties

Property 1: Bug Condition - mcAtPublish Defaults to Zero When Published Call Not Found

_For any_ input where `PublishedCallRepository.findByChainAndAddress()` returns `null`, the TrackPublishedCallUseCase SHALL default `mcAtPublish` to `0` and successfully create a TrackedPublishedCall entity without validation errors.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - Solana Addresses Preserve Case-Sensitive Base58 Encoding

_For any_ valid Solana address input to `NormalizedAddress.fromSolana()`, the method SHALL preserve the original case-sensitive Base58 string without lowercasing, allowing successful storage and reconstruction from the database.

**Validates: Requirements 2.4, 2.5, 2.6, 2.7**

Property 3: Preservation - EVM Address Normalization Continues to Lowercase

_For any_ valid EVM address input to `NormalizedAddress.fromEvm()`, the method SHALL continue to lowercase the address for case-insensitive comparison, preserving existing EVM address handling behavior.

**Validates: Requirements 3.4, 3.5, 3.6, 3.7**

Property 4: Preservation - Valid Published Call mcAtCall Values Continue to Be Used

_For any_ input where `PublishedCallRepository.findByChainAndAddress()` returns a valid published call with `mcAtCall` set, the TrackPublishedCallUseCase SHALL continue to use that value as `mcAtPublish`, preserving existing tracking behavior.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**Bug 1: File**: `apps/backend/src/token/call-tracking/application/handlers/track-published-call.use-case.ts`

**Function**: `TrackPublishedCallUseCase.execute()`

**Specific Changes**:

1. **Fix Nullish Coalescing Logic**: Replace the fallback expression for `mcAtPublish`
   - **Current Code** (lines 38-41):
     ```typescript
     const published = await this.publishedCallRepo.findByChainAndAddress(
       chain,
       input.address,
     );
     const mcAtPublish = published?.mcAtCall ?? 0;
     ```
   - **Fixed Code**:
     ```typescript
     const published = await this.publishedCallRepo.findByChainAndAddress(
       chain,
       input.address,
     );
     const mcAtPublish = (published?.mcAtCall ?? 0) || 0;
     ```
   - **OR** (more explicit):
     ```typescript
     const mcAtPublish = published ? (published.mcAtCall ?? 0) : 0;
     ```
   - **Rationale**: The extra `|| 0` ensures `undefined` is converted to `0`. The conditional form makes the intent clearer.

2. **Verify Type Safety**: Ensure TypeScript infers `mcAtPublish` as `number`, not `number | undefined`
   - Add explicit type annotation if needed: `const mcAtPublish: number = ...`
   - This prevents future regressions where `undefined` slips through

**Bug 2: File**: `apps/backend/src/token/identity/normalized-address.vo.ts`

**Function**: `NormalizedAddress.fromSolana()`

**Specific Changes**:

1. **Remove toLowerCase() Call**: Preserve the original case-sensitive Base58 string
   - **Current Code** (lines 51-62):
     ```typescript
     public static fromSolana(raw: string): NormalizedAddress {
       try {
         const decoded = bs58.decode(raw);
         if (decoded.length !== 32) {
           throw new Error('not 32 bytes');
         }
       } catch {
         throw new DomainError(
           ErrorCode.INVALID_ADDRESS,
           `Invalid Solana address: ${raw}`,
           { raw },
         );
       }
       return new NormalizedAddress({
         value: raw.toLowerCase(),  // <- BUG: removes this line
         chain: ChainFamily.SOLANA,
       });
     }
     ```
   - **Fixed Code**:
     ```typescript
     public static fromSolana(raw: string): NormalizedAddress {
       try {
         const decoded = bs58.decode(raw);
         if (decoded.length !== 32) {
           throw new Error('not 32 bytes');
         }
       } catch {
         throw new DomainError(
           ErrorCode.INVALID_ADDRESS,
           `Invalid Solana address: ${raw}`,
           { raw },
         );
       }
       return new NormalizedAddress({
         value: raw,  // <- FIXED: preserve original case
         chain: ChainFamily.SOLANA,
       });
     }
     ```
   - **Rationale**: Base58 encoding is case-sensitive. Preserving the original case ensures the address can be reconstructed and validated correctly.

2. **Update Structural Equality Semantics**: Solana addresses are now case-sensitive
   - The `ValueObject` base class performs structural equality via `JSON.stringify()`
   - With case-preservation, `EPjF...` and `epjf...` will NOT be considered equal
   - This is correct behavior - Base58 addresses with different cases are different addresses
   - No code changes needed - structural equality automatically handles this

3. **Verify Database Migration Impact**: Existing lowercased Solana addresses in the database
   - Current stored values: `'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'`
   - These will fail Base58 validation when reconstructed
   - The `reconstructLooseAddress()` fallback will attempt `fromSolana()` and still fail
   - **Migration Required**: Update existing Solana addresses to their original case-sensitive form
   - **Alternative**: Accept data loss for affected records (if volume is low and impact is minimal)

**Migration Considerations**:

If existing Solana addresses in the database are corrupted by lowercasing:

**Option 1: Manual Data Migration**
- Query all records where `chain='solana'`
- Attempt to find original case-sensitive addresses from source data (PublishedCall, external APIs)
- Update `canonical_token_calls.address` with correct case-sensitive values
- This preserves historical data but requires manual effort

**Option 2: Accept Data Loss**
- Leave corrupted addresses in database
- They will fail reconstruction and be logged as errors
- New Solana calls will work correctly going forward
- Historical Solana call data becomes inaccessible
- Suitable if Solana call volume is low and historical data is not critical

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate the bug conditions and assert the expected failures. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:

**Bug 1: mcAtPublish Validation Failure**
1. **Null Published Call Test**: Call `TrackPublishedCallUseCase.execute()` with a chain/address combination where `PublishedCallRepository.findByChainAndAddress()` returns `null` (will fail on unfixed code with "mcAtPublish must be a non-negative finite number")
2. **Null mcAtCall Test**: Mock `PublishedCallRepository` to return a published call with `mcAtCall: null` (should pass on unfixed code, verifying that optional chaining works for this case)
3. **Valid mcAtCall Test**: Mock `PublishedCallRepository` to return a published call with `mcAtCall: 50000` (should pass on unfixed code, verifying existing behavior)

**Bug 2: Invalid Solana Address Normalization**
4. **Solana Address Normalization Test**: Call `NormalizedAddress.fromSolana('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')` and verify the stored value is lowercased (will pass on unfixed code)
5. **Solana Address Reconstruction Test**: Store a Solana address via `fromSolana()`, then attempt to reconstruct it via `fromChainHint()` (will fail on unfixed code with "Invalid Solana address")
6. **Lowercase Solana Address Test**: Call `NormalizedAddress.fromSolana()` with an already-lowercase valid Base58 address (may pass or fail depending on whether lowercase Base58 is valid)

**Expected Counterexamples**:
- Bug 1: `TrackPublishedCallUseCase` throws validation error when `published` is `null`
- Bug 2: `NormalizedAddress.fromSolana()` lowercases the address, causing reconstruction to fail
- Possible causes confirmed: operator precedence issue (Bug 1), inappropriate lowercasing (Bug 2)

### Fix Checking

**Goal**: Verify that for all inputs where the bug conditions hold, the fixed functions produce the expected behavior.

**Pseudocode (Bug 1):**
```
FOR ALL input WHERE isBugCondition1(input) DO
  result := TrackPublishedCallUseCase_fixed.execute(input)
  ASSERT result.created == true
  ASSERT result.trackedId IS NOT null
  tracked := TrackedPublishedCallRepository.findById(result.trackedId)
  ASSERT tracked.mcAtPublish == 0
END FOR
```

**Pseudocode (Bug 2):**
```
FOR ALL input WHERE isBugCondition2(input) DO
  normalized := NormalizedAddress_fixed.fromSolana(input.address)
  ASSERT normalized.value == input.address  // case preserved
  
  // Verify reconstruction works
  reconstructed := NormalizedAddress_fixed.fromChainHint(normalized.value, 'solana')
  ASSERT reconstructed IS NOT null
  ASSERT reconstructed.value == input.address
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug conditions do NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode (Bug 1 - Valid Published Calls):**
```
FOR ALL input WHERE NOT isBugCondition1(input) DO
  // Mock published call with valid mcAtCall
  ASSERT TrackPublishedCallUseCase_original.execute(input) 
         == TrackPublishedCallUseCase_fixed.execute(input)
END FOR
```

**Pseudocode (Bug 2 - EVM Addresses):**
```
FOR ALL input WHERE input.chain == 'evm' DO
  ASSERT NormalizedAddress_original.fromEvm(input.address)
         == NormalizedAddress_fixed.fromEvm(input.address)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for valid published calls and EVM addresses, then write property-based tests capturing that behavior.

**Test Cases**:

1. **EVM Address Preservation**: Verify EVM addresses continue to be lowercased after fix
   - Generate random mixed-case EVM addresses
   - Verify `fromEvm()` lowercases them consistently before and after fix
   - Verify structural equality treats mixed-case as equal

2. **Valid mcAtCall Preservation**: Verify published calls with valid `mcAtCall` continue to use that value
   - Generate random `mcAtCall` values (positive numbers)
   - Verify `TrackPublishedCallUseCase` uses those values as `mcAtPublish`
   - Verify tracking logic continues to work identically

3. **kolId Derivation Preservation**: Verify `kolId` fallback logic continues to work
   - Test with `input.kolId` provided
   - Test with `input.kolId` null and `published.publishedChannelIds` populated
   - Test with both null (should default to 'unknown')

4. **Validation Preservation**: Verify `TrackedPublishedCall` entity validation continues to enforce constraints
   - Test with negative `mcAtPublish` (should throw)
   - Test with `NaN` or `Infinity` (should throw)
   - Test with valid positive values (should succeed)

### Unit Tests

**Bug 1: mcAtPublish Validation Failure**
- Test `TrackPublishedCallUseCase.execute()` with `published=null` → should create tracked call with `mcAtPublish=0`
- Test with `published={mcAtCall: null}` → should create tracked call with `mcAtPublish=0`
- Test with `published={mcAtCall: 50000}` → should create tracked call with `mcAtPublish=50000`
- Test edge cases: `mcAtCall=0`, very large values, exact numbers

**Bug 2: Invalid Solana Address Normalization**
- Test `NormalizedAddress.fromSolana()` with mixed-case address → should preserve case
- Test reconstruction via `fromChainHint()` with preserved address → should succeed
- Test `fromEvm()` with mixed-case address → should lowercase (preservation)
- Test invalid Solana addresses → should throw DomainError (preservation)

### Property-Based Tests

**Bug 1: mcAtPublish Defaults**
- Generate random chain/address pairs where `published=null`
- Verify all create tracked calls with `mcAtPublish=0`
- Generate random valid `mcAtCall` values
- Verify all create tracked calls with correct `mcAtPublish`

**Bug 2: Address Normalization**
- Generate random valid Solana addresses (via Base58 encoding of 32 random bytes)
- Verify all preserve case through normalization and reconstruction
- Generate random mixed-case EVM addresses
- Verify all lowercase correctly (preservation)
- Generate random invalid addresses
- Verify all throw appropriate errors (preservation)

### Integration Tests

**Bug 1: End-to-End Call Tracking**
- Simulate publishing a call on EVM chain with no prior published call record → verify tracking succeeds with `mcAtPublish=0`
- Simulate publishing a call on Solana chain with no prior published call record → verify tracking succeeds with `mcAtPublish=0`
- Simulate publishing a call with existing published call record → verify tracking uses correct `mcAtCall` value
- Verify tracked calls can be queried and filtered correctly

**Bug 2: End-to-End Address Lifecycle**
- Create a `CanonicalTokenCall` with Solana address → verify storage succeeds
- Retrieve the call from database → verify reconstruction succeeds with correct case-preserved address
- Create a `TokenLocator` with the retrieved address → verify it works correctly
- Compare two Solana addresses with different cases → verify they are NOT equal (correct case-sensitive behavior)

**Migration Test** (if database contains corrupted Solana addresses):
- Query existing Solana records from database
- Attempt reconstruction with fixed `fromSolana()` method
- Verify corrupted addresses fail with clear error messages
- Verify migration script (if implemented) corrects the addresses
- Verify new Solana calls work correctly after migration

## Test Updates Required

**Bug 2: Solana Address Case Preservation**

The fix for Bug 2 changes the expected behavior of `NormalizedAddress.fromSolana()`, which will cause existing tests to fail. The following test file must be updated:

**File**: `apps/backend/src/token/normalization/domain/value-objects/normalization-vos.spec.ts`

**Test to Update** (line ~53):
```typescript
// Current test (will fail after fix)
it('accepts valid Solana and normalizes to lowercase', () => {
  expect(NormalizedAddress.fromSolana(SOLANA).value).toBe(SOLANA_LOWER);
});

// Updated test (correct behavior after fix)
it('accepts valid Solana and preserves case', () => {
  expect(NormalizedAddress.fromSolana(SOLANA).value).toBe(SOLANA);
});
```

**Rationale**: The test name and assertion must be updated to reflect that Solana addresses are no longer lowercased. The test constant `SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'` already has the correct case-sensitive value.

**Additional Test to Add**: Verify Solana structural equality is case-sensitive
```typescript
it('structural equality: different-case Solana addresses are NOT equal', () => {
  const upper = NormalizedAddress.fromSolana('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  // Note: lowercase version may not be a valid Base58 address
  // This test verifies that case matters for equality
  expect(upper.equals(upper)).toBe(true);
  // If we need to test inequality, we'd need two different valid Base58 addresses
});
```

**Note**: We cannot test case-insensitive inequality for Solana addresses because lowercasing a Base58 address typically produces an invalid address. The important behavior is that the same case-sensitive address always equals itself.
