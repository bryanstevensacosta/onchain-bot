# Staging Migration Environment Propagation Bugfix Design

## Overview

The staging deployment fails because the `NODE_ENV=staging` environment variable passed via `docker compose run -e NODE_ENV=staging` does not reach the bash migration scripts (`run-migrations.sh`, `show-migrations.sh`) when invoked through npm scripts. The shell condition `[ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]` evaluates to false despite the variable being set, causing the scripts to fall back to TypeScript mode which fails in the Docker container (full TypeScript sources not present).

The fix strategy combines three defensive layers:

1. **Direct detection** - Explicitly export NODE_ENV in npm script chain
2. **Diagnostic visibility** - Add logging to surface variable state at decision point
3. **Fallback heuristics** - Detect compiled artifacts to auto-select mode

This ensures robust detection across npm script execution contexts while maintaining dev behavior and providing clear debugging output.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when migrations run in Docker with `NODE_ENV=staging` set via `-e` flag but bash scripts don't see the variable
- **Property (P)**: The desired behavior - migration scripts SHALL detect `NODE_ENV=staging` and use compiled JavaScript mode
- **Preservation**: Existing development behavior (TypeScript mode when NODE_ENV unset) and production behavior must remain unchanged
- **npm script barrier**: The execution context boundary where environment variables may not automatically propagate from docker `-e` flags through `npm run` to child bash processes
- **run-migrations.sh**: The bash script in `apps/backend/scripts/` that executes TypeORM migrations, selecting TypeScript (dev) or JavaScript (staging/prod) mode based on NODE_ENV
- **show-migrations.sh**: The bash script that displays pending migrations (read-only), using same mode detection logic as run-migrations.sh
- **Compiled artifact detection**: Heuristic that checks for existence of `./dist/backend/src/shared/common/persistence/data-source.js` to infer staging/production environment

## Bug Details

### Bug Condition

The bug manifests when the GitHub Actions workflow executes `docker compose run -e NODE_ENV=staging backend npm run migration:show`. Despite the explicit `-e NODE_ENV=staging` flag, the bash script's condition `[ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]` evaluates to false, causing fallback to TypeScript mode which then fails with "Cannot find module '/app/src/shared/common/persistence/entities'".

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type MigrationExecution
  OUTPUT: boolean

  RETURN input.environment == "staging"
         AND input.executionContext == "docker-compose-run"
         AND input.envFlag == "-e NODE_ENV=staging"
         AND bashScriptReceives(input, "NODE_ENV") == null
         AND scriptFallsBackTo(input) == "typescript-mode"
         AND typescriptSourcesAvailable(input) == false
END FUNCTION
```

### Examples

**Concrete Bug Manifestation:**

```bash
# GitHub Actions deploy-staging.yml step
docker compose run --rm --no-deps \
  -e NODE_ENV=staging \
  -e POSTGRES_HOST=postgres \
  backend npm run migration:show

# Expected output:
# "Showing migrations from compiled JavaScript (dist/)..."

# Actual output (DEFECT):
# "Showing migrations from TypeScript (src/)..."
# Error: Cannot find module '/app/src/shared/common/persistence/entities'
```

**Why it fails:**

1. Docker sets `NODE_ENV=staging` in container environment
2. `npm run migration:show` executes → `bash scripts/show-migrations.sh`
3. Inside bash script: `[ "${NODE_ENV:-}" = "staging" ]` evaluates to **false**
4. Script chooses: `npx typeorm-ts-node-commonjs --dataSource src/.../data-source.ts`
5. TypeORM tries to load TypeScript files not present in Docker image → module error

**Known working case (production):**

```bash
# Production deploy uses same pattern, NODE_ENV=production
docker compose run -e NODE_ENV=production backend npm run migration:run
# This MAY work due to different npm/node version or entrypoint behavior
# OR production also has this bug but goes unnoticed (needs verification)
```

**Edge cases:**

- Local dev (`npm run migration:show` without docker) - should use TypeScript mode
- Direct script invocation (`NODE_ENV=staging bash scripts/show-migrations.sh`) - may work (bypasses npm)
- Production deployment - needs same fix to ensure consistency

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- Local development migrations (`npm run start:dev` → db:migrate) MUST continue using TypeScript mode
- Direct TypeORM CLI commands (`npm run typeorm`) MUST continue working in development
- Production migrations with `NODE_ENV=production` MUST continue using compiled JavaScript
- All other npm scripts that don't involve migrations MUST be unaffected
- Database schema changes resulting from successful migrations MUST remain identical

**Scope:**
All execution contexts that do NOT involve running migrations in Docker staging environment should be completely unaffected by this fix. This includes:

- Local development without Docker (`npm run migration:show` in terminal)
- Production Docker deployments (should continue working)
- Any non-migration npm scripts (start:dev, test, lint, etc.)
- Direct bash script execution (if someone runs `bash scripts/run-migrations.sh` manually)

## Hypothesized Root Cause

Based on the bug description and npm script execution model, the most likely issues are:

1. **npm Script Environment Barrier**: npm may not automatically forward all environment variables from the parent process to child bash scripts
   - npm uses `child_process.spawn()` which has configurable env inheritance
   - The `-e` flag sets Docker container env, but npm's script runner may use a clean/filtered environment
   - Some npm versions/configurations don't pass through arbitrary environment variables

2. **Docker Entrypoint Behavior**: The `docker-entrypoint.sh` may be manipulating or filtering environment variables before npm runs
   - Entrypoint script uses `gosu` to drop privileges (root → node user)
   - `gosu` command may not preserve all environment variables when switching users
   - Need to verify if entrypoint explicitly passes NODE_ENV through

3. **Bash Variable Expansion**: The shell comparison syntax may have subtle issues
   - `[ "${NODE_ENV:-}" = "staging" ]` uses parameter expansion with empty default
   - Whitespace, case sensitivity, or shell quoting could affect comparison
   - Variable might be set but with unexpected value (e.g., "staging\n" with newline)

4. **npm Script Execution Context**: The way `npm run` invokes bash scripts may differ from direct execution
   - `npm run migration:show` → looks up "migration:show" script → executes `bash scripts/show-migrations.sh`
   - npm may inject its own environment variables that interfere
   - npm config settings could affect child process env propagation

## Correctness Properties

Property 1: Bug Condition - Migration Scripts Detect Staging Environment

_For any_ migration execution where `NODE_ENV=staging` is passed via docker compose `-e` flag and the script is invoked through npm (`npm run migration:show` or `npm run migration:run`), the fixed bash scripts SHALL correctly detect `NODE_ENV=staging`, output "Showing/Running migrations from compiled JavaScript (dist/)...", and execute TypeORM against the compiled data-source.js file.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Development and Production Behavior

_For any_ migration execution where the bug condition does NOT hold (NODE_ENV unset for dev, NODE_ENV=production for prod, or non-Docker contexts), the fixed scripts SHALL produce exactly the same behavior as the original scripts, preserving TypeScript mode for development and JavaScript mode for production.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct (npm script barrier is primary issue):

**File**: `apps/backend/package.json`

**Scripts**: `migration:show` and `migration:run`

**Specific Changes**:

1. **Explicit NODE_ENV Export in npm Scripts**: Modify the scripts to explicitly export NODE_ENV before invoking bash
   ```json
   "migration:show": "NODE_ENV=${NODE_ENV:-development} bash scripts/show-migrations.sh",
   "migration:run": "NODE_ENV=${NODE_ENV:-development} bash scripts/run-migrations.sh"
   ```
   - This ensures the variable is explicitly passed through npm's script runner
   - Uses shell parameter expansion to default to "development" if unset
   - Works in both docker (NODE_ENV set by -e flag) and local (NODE_ENV unset)

**File**: `apps/backend/scripts/run-migrations.sh` and `apps/backend/scripts/show-migrations.sh`

**Function**: Mode detection condition block (lines 8-15)

**Specific Changes**:

2. **Add Diagnostic Logging**: Insert debug output before the if-condition to surface variable state

   ```bash
   # Debug: Show what NODE_ENV value we received
   echo "[MIGRATION-DEBUG] NODE_ENV='${NODE_ENV:-<unset>}'"
   echo "[MIGRATION-DEBUG] Checking condition: [ \"\${NODE_ENV:-}\" = \"production\" ] || [ \"\${NODE_ENV:-}\" = \"staging\" ]"
   ```
   - Logs exact variable value at decision point
   - Visible in GitHub Actions logs and local execution
   - `<unset>` marker makes it clear when variable is empty vs containing "unset" string

3. **Compiled Artifact Detection Fallback**: Add heuristic check for dist/ presence as secondary detection

   ```bash
   # Fallback: If dist/ artifacts exist, assume staging/production
   if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ] || [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
   ```
   - Checks for compiled data-source.js file
   - Acts as safety net if NODE_ENV propagation still fails
   - Aligns with Docker image contents (dist/ is present, full src/ is not)

4. **Enhanced Error Messaging**: Add context if wrong mode is selected

   ```bash
   else
     echo "Running migrations from TypeScript (src/)..."
     echo "[MIGRATION-DEBUG] Using TypeScript mode because: NODE_ENV='${NODE_ENV:-<unset>}' (not production/staging) and dist/ artifacts not found"
   ```
   - Explains why TypeScript mode was chosen
   - Helps diagnose if fallback heuristic also failed

5. **Docker Entrypoint Verification** (if npm fix insufficient): Ensure entrypoint preserves NODE_ENV
   ```bash
   # In docker-entrypoint.sh, before exec gosu:
   export NODE_ENV="${NODE_ENV:-production}"
   ```
   - Only needed if npm script fix doesn't resolve the issue
   - Ensures variable survives privilege drop

### Complete Fixed Script Structure

**show-migrations.sh** (and run-migrations.sh with migration:run substituted):

```bash
#!/usr/bin/env bash
set -euo pipefail

# Debug: Surface environment variable state at decision point
echo "[MIGRATION-DEBUG] NODE_ENV='${NODE_ENV:-<unset>}'"
echo "[MIGRATION-DEBUG] Compiled artifacts check: ./dist/backend/src/shared/common/persistence/data-source.js"
if [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
  echo "[MIGRATION-DEBUG] ✓ Compiled artifacts found"
else
  echo "[MIGRATION-DEBUG] ✗ Compiled artifacts not found"
fi

# Primary detection: NODE_ENV value
# Fallback detection: Presence of compiled artifacts
if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ] || [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
  echo "Showing migrations from compiled JavaScript (dist/)..."
  echo "[MIGRATION-DEBUG] Mode: JavaScript (NODE_ENV='${NODE_ENV:-<unset>}' or dist/ detected)"
  npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js migration:show
else
  echo "Showing migrations from TypeScript (src/)..."
  echo "[MIGRATION-DEBUG] Mode: TypeScript (NODE_ENV='${NODE_ENV:-<unset>}', no dist/ artifacts)"
  npx typeorm-ts-node-commonjs --dataSource src/shared/common/persistence/data-source.ts migration:show
fi
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis (npm script barrier hypothesis). If we refute, we will need to re-hypothesize.

**Test Plan**: Execute the migration dry-run command in a staging-like Docker context and observe the script output. Run on UNFIXED code to confirm it chooses TypeScript mode and fails.

**Test Cases**:

1. **Staging Docker Execution (UNFIXED)**: Run `docker compose run -e NODE_ENV=staging backend npm run migration:show` with current code
   - Expected counterexample: Output shows "Showing migrations from TypeScript (src/)..." despite NODE_ENV=staging
   - Confirms bug condition

2. **Direct Bash Execution (UNFIXED)**: Run `NODE_ENV=staging bash scripts/show-migrations.sh` directly (bypass npm)
   - If this works (shows JavaScript mode), confirms npm is the barrier
   - If this also fails, suggests deeper shell issue

3. **Diagnostic Output Visibility (UNFIXED)**: Temporarily add `echo "NODE_ENV=${NODE_ENV:-EMPTY}"` to show-migrations.sh and re-run
   - Observe what value (if any) the script receives
   - Expected counterexample: Variable is empty or contains unexpected value

4. **Entrypoint Behavior (UNFIXED)**: Add debug logging to docker-entrypoint.sh to show env before/after gosu
   - Check if NODE_ENV survives privilege drop
   - May fail on unfixed code if entrypoint strips variables

**Expected Counterexamples**:

- Script receives empty NODE_ENV despite docker `-e` flag
- Possible causes: npm script runner doesn't forward env, entrypoint strips it, shell expansion issue

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed scripts produce the expected behavior.

**Pseudocode:**

```
FOR ALL execution WHERE isBugCondition(execution) DO
  result := runMigrationScript_fixed(execution)
  ASSERT result.mode == "javascript"
  ASSERT result.command CONTAINS "dist/backend/src/shared/common/persistence/data-source.js"
  ASSERT result.exitCode == 0
END FOR
```

**Test Plan**: After implementing the fix (explicit NODE_ENV export in package.json + diagnostic logging + artifact fallback), re-run all exploratory tests and verify correct mode selection.

**Test Cases**:

1. **Staging Docker with Fix**: `docker compose run -e NODE_ENV=staging backend npm run migration:show`
   - Output MUST show: "Showing migrations from compiled JavaScript (dist/)..."
   - Debug log MUST show: `[MIGRATION-DEBUG] NODE_ENV='staging'`
   - Command MUST succeed (no module error)

2. **Staging Docker migration:run**: Same as above but with `npm run migration:run`
   - MUST execute TypeORM against data-source.js
   - MUST apply pending migrations successfully

3. **Artifact Fallback**: If NODE_ENV still doesn't propagate, verify fallback heuristic works
   - Even with NODE_ENV empty, script MUST detect dist/ file and choose JavaScript mode
   - Provides defense-in-depth

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed scripts produce the same result as the original scripts.

**Pseudocode:**

```
FOR ALL execution WHERE NOT isBugCondition(execution) DO
  ASSERT runMigrationScript_original(execution) = runMigrationScript_fixed(execution)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many test cases automatically across the input domain (dev, prod, local, docker contexts)
- It catches edge cases that manual unit tests might miss (unusual NODE_ENV values, missing dist/, etc.)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for dev and production contexts, then write tests capturing that behavior and verify fixed code matches.

**Test Cases**:

1. **Local Development Preservation**: Run `npm run migration:show` locally (no Docker, NODE_ENV unset)
   - UNFIXED: Shows "TypeScript (src/)..." and uses ts-node
   - FIXED: MUST show identical output and use ts-node
   - Verify no regression in dev workflow

2. **Production Deployment Preservation**: Run with `NODE_ENV=production` in Docker
   - UNFIXED: Should show "JavaScript (dist/)..." (if production works)
   - FIXED: MUST show identical output
   - No change in production behavior

3. **Direct Script Invocation Preservation**: Run `bash scripts/show-migrations.sh` directly with various NODE_ENV values
   - UNFIXED: Behavior may differ from npm invocation
   - FIXED: MUST maintain same behavior for direct invocation
   - Ensures fix doesn't break non-npm usage

4. **Unrelated npm Scripts Preservation**: Run `npm run start:dev`, `npm test`, etc.
   - UNFIXED: These work correctly
   - FIXED: MUST continue working identically
   - NODE_ENV modifications MUST NOT affect other scripts

5. **Empty/Whitespace NODE_ENV**: Test with `NODE_ENV=" "` (space) or `NODE_ENV=""` (empty string)
   - UNFIXED: Falls back to TypeScript mode
   - FIXED: MUST maintain same fallback behavior (TypeScript mode)
   - Edge case: whitespace-only values should be treated as unset

6. **Case Sensitivity**: Test with `NODE_ENV=STAGING` (uppercase) or `NODE_ENV=Staging` (mixed case)
   - UNFIXED: Falls back to TypeScript mode (condition is case-sensitive)
   - FIXED: MUST maintain same behavior (case-sensitive comparison)
   - This is intentional - staging must be lowercase per convention

### Unit Tests

- Test bash condition logic with various NODE_ENV values (production, staging, development, empty, whitespace)
- Test artifact detection fallback with dist/ present and absent
- Test npm script execution in isolation (mock docker environment)
- Test that diagnostic logs are emitted correctly

### Property-Based Tests

- Generate random NODE_ENV values and verify correct mode selection for known-good values (production/staging → JS, others → TS)
- Generate random file system states (dist/ present/absent) and verify fallback logic
- Generate random execution contexts (docker vs local, npm vs direct bash) and verify preservation

### Integration Tests

- Full staging deployment pipeline with fixed scripts (GitHub Actions workflow)
- Test migration:show followed by migration:run in sequence (dry-run → actual)
- Test that database schema ends up in correct state after migrations
- Test rollback: verify migration:revert works with same mode detection logic
