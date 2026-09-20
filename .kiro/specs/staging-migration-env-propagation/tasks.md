# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - NODE_ENV=staging Detection Failure in Docker npm Context
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate NODE_ENV=staging not reaching bash scripts through npm barrier
  - **Scoped PBT Approach**: Focus on the concrete failing case: docker compose run with -e NODE_ENV=staging invoking npm run migration:show
  - Test implementation:
    - Set up Docker context with NODE_ENV=staging via -e flag
    - Execute `docker compose run -e NODE_ENV=staging backend npm run migration:show`
    - Capture script output and parse for mode selection message
    - Assert script output contains "Showing migrations from compiled JavaScript (dist/)..."
    - Assert script executes TypeORM against data-source.js (not data-source.ts)
    - Assert command exits successfully without module resolution errors
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS - output shows "TypeScript (src/)..." instead of "JavaScript (dist/)..."
  - Document counterexamples found:
    - Expected: "Showing migrations from compiled JavaScript (dist/)..."
    - Actual: "Showing migrations from TypeScript (src/)..."
    - Error: "Cannot find module '/app/src/shared/common/persistence/entities'"
  - This confirms isBugCondition holds: NODE_ENV=staging set via docker -e flag, npm script invoked, bash script receives empty NODE_ENV, TypeScript mode selected, module error occurs
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Development and Production Mode Selection Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Local development (NODE_ENV unset): `npm run migration:show` without Docker
    - Production (NODE_ENV=production): Docker execution with production flag
    - Direct script invocation: `NODE_ENV=staging bash scripts/show-migrations.sh` (bypass npm)
    - Edge cases: NODE_ENV="" (empty), NODE_ENV=" " (whitespace), NODE_ENV=STAGING (uppercase)
  - Document observed outputs:
    - Local dev: "Showing migrations from TypeScript (src/)..." + typeorm-ts-node-commonjs command
    - Production: "Showing migrations from compiled JavaScript (dist/)..." + typeorm JS command
    - Direct bash: Correctly detects NODE_ENV value (no npm barrier)
    - Empty/whitespace/uppercase: Falls back to TypeScript mode (expected)
  - Write property-based tests capturing observed behavior patterns:
    - Property: For all execution contexts where NODE_ENV ∉ {production, staging} OR execution bypasses npm, mode selection matches unfixed behavior
    - Property: For all non-migration npm scripts, behavior is identical pre and post-fix
    - Property: Database schema state after successful migrations is identical regardless of mode detection fix
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. Fix for NODE_ENV propagation through npm script barrier
  - [ ] 3.1 Implement three-layer detection strategy
    - **Layer 1: Explicit NODE_ENV Export in npm Scripts**
      - Modify `apps/backend/package.json` scripts:
        - `"migration:show": "NODE_ENV=${NODE_ENV:-development} bash scripts/show-migrations.sh"`
        - `"migration:run": "NODE_ENV=${NODE_ENV:-development} bash scripts/run-migrations.sh"`
      - This explicitly exports NODE_ENV before invoking bash, ensuring it crosses the npm barrier
      - Uses shell parameter expansion `${NODE_ENV:-development}` to default to development if unset
      - Works in both Docker (NODE_ENV set by -e) and local (NODE_ENV unset) contexts
    - **Layer 2: Diagnostic Logging in Bash Scripts**
      - Add debug output in `apps/backend/scripts/show-migrations.sh` before mode detection:
        ```bash
        echo "[MIGRATION-DEBUG] NODE_ENV='${NODE_ENV:-<unset>}'"
        echo "[MIGRATION-DEBUG] Compiled artifacts check: ./dist/backend/src/shared/common/persistence/data-source.js"
        if [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
          echo "[MIGRATION-DEBUG] ✓ Compiled artifacts found"
        else
          echo "[MIGRATION-DEBUG] ✗ Compiled artifacts not found"
        fi
        ```
      - Add mode selection reason to both branches:
        - JavaScript mode: `echo "[MIGRATION-DEBUG] Mode: JavaScript (NODE_ENV='${NODE_ENV:-<unset>}' or dist/ detected)"`
        - TypeScript mode: `echo "[MIGRATION-DEBUG] Mode: TypeScript (NODE_ENV='${NODE_ENV:-<unset>}', no dist/ artifacts)"`
      - Repeat identical logging in `apps/backend/scripts/run-migrations.sh`
    - **Layer 3: Compiled Artifact Detection Fallback**
      - Enhance if-condition in both scripts to add dist/ check:
        ```bash
        if [ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ] || [ -f "./dist/backend/src/shared/common/persistence/data-source.js" ]; then
        ```
      - This acts as safety net: even if NODE_ENV propagation fails, presence of compiled artifacts signals staging/production context
      - Aligns with Docker image structure (dist/ present, full src/ not)
    - _Bug_Condition: isBugCondition(execution) = execution.environment == "staging" AND execution.executionContext == "docker-compose-run" AND bashScriptReceives(execution, "NODE_ENV") == null_
    - _Expected_Behavior: For all inputs satisfying Bug_Condition, fixed scripts SHALL output "JavaScript (dist/)..." and execute TypeORM against data-source.js (Property 1)_
    - _Preservation: For all inputs NOT satisfying Bug_Condition, fixed scripts SHALL produce identical output to unfixed scripts (Property 2)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - NODE_ENV=staging Correctly Detected After Fix
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (JavaScript mode selection)
    - When this test passes, it confirms the expected behavior is satisfied
    - Execute: `docker compose run -e NODE_ENV=staging backend npm run migration:show`
    - **EXPECTED OUTCOME**: Test PASSES
      - Output shows: "Showing migrations from compiled JavaScript (dist/)..."
      - Debug log shows: `[MIGRATION-DEBUG] NODE_ENV='staging'` (explicit export worked)
      - Command succeeds without module errors
      - Confirms NODE_ENV propagated through npm barrier OR artifact fallback detected dist/
    - _Requirements: 2.1, 2.2, 2.3, 2.4 (Expected Behavior Properties from design)_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Development and Production Behavior Unchanged After Fix
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Execute all preservation test cases:
      - Local development: `npm run migration:show` (no Docker, NODE_ENV unset)
      - Production: `docker compose run -e NODE_ENV=production backend npm run migration:show`
      - Direct bash: `NODE_ENV=staging bash scripts/show-migrations.sh`
      - Edge cases: NODE_ENV="" / " " / STAGING
    - **EXPECTED OUTCOME**: All tests PASS with identical outputs to unfixed code
      - Local dev still uses TypeScript mode (NODE_ENV defaults to development in npm script)
      - Production still uses JavaScript mode (NODE_ENV=production detected)
      - Direct bash invocation works correctly (no npm barrier)
      - Edge cases maintain original fallback behavior
    - Confirms no regressions introduced by fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5 (Preservation Requirements from design)_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run exploration test (task 1 test) - should PASS on fixed code
  - Run preservation tests (task 2 tests) - should PASS on fixed code
  - Verify staging deployment workflow succeeds:
    - GitHub Actions deploy-staging.yml dry-run step completes successfully
    - Migration:run step applies pending migrations without errors
    - Backend starts successfully after migrations
  - Verify diagnostic logs are visible and helpful in GitHub Actions logs
  - Verify local development workflow remains unchanged (npm run start:dev works)
  - If any test fails, diagnose root cause before marking complete
  - Ask user if questions arise or if additional verification is needed
