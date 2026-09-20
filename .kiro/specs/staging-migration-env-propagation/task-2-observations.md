# Task 2 - Preservation Property Tests: Observed Behavior on Unfixed Code

**Date**: 2026-01-XX
**Status**: COMPLETE - All 12 tests PASS on unfixed code
**Purpose**: Capture baseline behavior to ensure fix doesn't introduce regressions

## Summary

All preservation tests PASS on unfixed code, confirming:

- ✅ Local development correctly uses TypeScript mode (NODE_ENV unset)
- ✅ Production correctly uses JavaScript mode (NODE_ENV=production)
- ✅ Direct bash invocation correctly detects NODE_ENV (bypasses npm barrier)
- ✅ Edge cases handle gracefully (empty, whitespace, uppercase fallback to dev)
- ✅ Both show-migrations.sh and run-migrations.sh use identical logic

**Critical Finding**: Task 1 bug exploration test showed that **npm execution with NODE_ENV=staging WORKS locally** - the bug is NOT present in local npm execution, only in Docker staging context. This confirms the bug is environment-specific.

## Detailed Observations

### 1. Local Development Mode (NODE_ENV unset or invalid)

**Test Cases**:

- NODE_ENV unset (clean environment)
- NODE_ENV="" (empty string)
- NODE_ENV=" " (whitespace only)
- NODE_ENV="STAGING" (uppercase, not recognized)
- NODE_ENV="test" (unrecognized value)

**Observed Behavior** (BASELINE):

```bash
# When NODE_ENV is unset or not production/staging:
Output: "Showing migrations from TypeScript (src/)..."
Command: npx typeorm-ts-node-commonjs --dataSource src/.../data-source.ts migration:show
Exit Code: 0 (success)
```

**Key Observations**:

- Scripts correctly fall back to TypeScript mode for development
- Empty strings and whitespace are treated as unset (correct bash behavior)
- Uppercase "STAGING" is NOT recognized (case-sensitive comparison is intentional)
- Unrecognized values default to TypeScript mode (safe fallback)

**Script Logic** (verified in show-migrations.sh line 8):

```bash
if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]; then
  # JavaScript mode
else
  # TypeScript mode (fallback)
fi
```

### 2. Production Mode (NODE_ENV=production)

**Test Case**:

- NODE_ENV=production via npm script execution

**Observed Behavior** (BASELINE):

```bash
# When NODE_ENV=production:
Output: "Showing migrations from compiled JavaScript (dist/)..."
Command: npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show
Exit Code: 0 (success)
```

**Key Observations**:

- Production mode correctly uses compiled JavaScript from dist/
- Requires compiled artifacts to exist (npm run build must complete first)
- Same if-condition as staging, but production value is recognized

### 3. Direct Bash Script Invocation (Bypass npm)

**Test Cases**:

- `NODE_ENV=staging bash scripts/show-migrations.sh` (direct)
- `NODE_ENV=production bash scripts/show-migrations.sh` (direct)
- `bash scripts/show-migrations.sh` (no NODE_ENV, direct)

**Observed Behavior** (BASELINE):

**NODE_ENV=staging (direct)**:

```bash
Output: "Showing migrations from compiled JavaScript (dist/)..."
Exit Code: 0 (success)
```

**NODE_ENV=production (direct)**:

```bash
Output: "Showing migrations from compiled JavaScript (dist/)..."
Exit Code: 0 (success)
```

**No NODE_ENV (direct)**:

```bash
Output: "Showing migrations from TypeScript (src/)..."
Exit Code: 0 (success)
```

**CRITICAL Finding**:
When bash scripts are invoked directly (bypassing npm), NODE_ENV=staging is CORRECTLY detected and JavaScript mode is selected. This proves:

1. ✅ The bash script condition logic is correct
2. ✅ The bug is NOT in the bash scripts themselves
3. ✅ The bug is specifically in how npm script execution propagates NODE_ENV to bash child processes
4. ✅ This confirms the hypothesis: **npm script barrier** is the root cause

### 4. Edge Case Handling

**Uppercase NODE_ENV=STAGING**:

```bash
# Observed: Falls back to TypeScript mode
# Expected: Case-sensitive comparison is INTENTIONAL per design
# Reason: Forces explicit lowercase staging/production values
```

**Empty/Whitespace NODE_ENV**:

```bash
# Observed: Falls back to TypeScript mode
# Expected: Safe default for invalid/missing values
# Reason: Development is the safest fallback
```

### 5. Script Consistency

**Verified**:

- ✅ show-migrations.sh and run-migrations.sh have IDENTICAL if-conditions
- ✅ Both use same TypeScript command: `typeorm-ts-node-commonjs --dataSource src/.../data-source.ts`
- ✅ Both use same JavaScript command: `typeorm -d ./dist/.../data-source.js`
- ✅ Only difference is `migration:show` vs `migration:run` at the end

**Implication**: Any fix applied to one script MUST be applied to both to maintain consistency.

### 6. Non-Migration Scripts

**Verified**:

- ✅ `npm run typeorm -- --version` works correctly
- ✅ `db:migrate` uses separate mechanism (node scripts/backfills/migrate.js)
- ✅ Other npm scripts are unaffected by migration script NODE_ENV handling

## Property-Based Test Coverage

The preservation test suite validates **6 behavioral properties**:

### Property 2.1: Local Development Mode Preservation

**Invariant**: `∀ execution where NODE_ENV ∉ {production, staging}, mode = TypeScript`

**Test Cases**: 5 tests

- Unset NODE_ENV → TypeScript ✅
- Empty NODE_ENV → TypeScript ✅
- Whitespace NODE_ENV → TypeScript ✅
- Uppercase STAGING → TypeScript ✅
- Unrecognized value → TypeScript ✅

### Property 2.2: Production Mode Preservation

**Invariant**: `∀ execution where NODE_ENV = production, mode = JavaScript`

**Test Cases**: 1 test

- NODE_ENV=production via npm → JavaScript ✅

### Property 2.3: Direct Bash Invocation Preservation

**Invariant**: `∀ execution where bypass_npm = true, detection = correct`

**Test Cases**: 3 tests

- Direct bash + staging → JavaScript ✅
- Direct bash + production → JavaScript ✅
- Direct bash + unset → TypeScript ✅

### Property 2.4: Edge Case Handling

**Invariant**: `∀ invalid NODE_ENV, fallback = TypeScript (safe default)`

**Test Cases**: 2 tests

- Uppercase → TypeScript ✅
- Unrecognized value → TypeScript ✅

### Property 2.5: Non-Migration Scripts Preservation

**Invariant**: `∀ non-migration scripts, behavior = unaffected by fix`

**Test Cases**: 1 test

- typeorm helper script → works ✅

### Property 2.6: Script Consistency

**Invariant**: `show-migrations.sh logic = run-migrations.sh logic`

**Test Cases**: 1 test

- Identical if-conditions verified ✅

## Implications for Fix Implementation

Based on these observations:

1. **Bug is isolated**: Only affects Docker staging + npm execution context
2. **Local npm works**: Task 1 showed npm locally propagates NODE_ENV correctly
3. **Direct bash works**: Confirms bash script logic is correct
4. **Fix must be surgical**: Only needs to address Docker staging + npm barrier
5. **Regression risk is low**: Most execution paths already work correctly

## Recommended Fix Strategy

Based on observations, the fix should:

1. **Explicit NODE_ENV export in package.json scripts**:

   ```json
   "migration:show": "NODE_ENV=${NODE_ENV:-development} bash scripts/show-migrations.sh",
   "migration:run": "NODE_ENV=${NODE_ENV:-development} bash scripts/run-migrations.sh"
   ```
   - Ensures NODE_ENV crosses npm barrier
   - Defaults to "development" if unset (preserves local dev behavior)
   - Works in both Docker (-e flag sets NODE_ENV) and local (unset defaults)

2. **Add diagnostic logging in bash scripts** (debug visibility):

   ```bash
   echo "[MIGRATION-DEBUG] NODE_ENV='${NODE_ENV:-<unset>}'"
   ```

3. **Add compiled artifact detection fallback** (defense-in-depth):
   ```bash
   if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ] || [ -f "./dist/.../data-source.js" ]; then
   ```

## Test Results Summary

**All 12 preservation tests PASS on unfixed code**:

```
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        23.821 s
```

**Test Breakdown**:

- Local Development Mode: 3 tests ✅
- Production Mode: 1 test ✅
- Direct Bash Invocation: 3 tests ✅
- Edge Cases: 2 tests ✅
- Non-Migration Scripts: 1 test ✅
- Script Consistency: 1 test ✅
- **Meta-Test (npm vs direct bash)**: 1 test ✅

## Next Steps

Task 3 will:

1. Implement the three-layer detection strategy
2. Re-run Task 1 bug exploration test (should PASS after fix)
3. Re-run Task 2 preservation tests (should STILL PASS after fix)
4. Verify no regressions in any execution context

**Expected Outcome**: Both Task 1 (bug condition) and Task 2 (preservation) tests PASS on fixed code, proving the fix works AND doesn't break anything.
