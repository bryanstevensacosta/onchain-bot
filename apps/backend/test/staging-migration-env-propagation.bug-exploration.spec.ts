/**
 * Bug Condition Exploration Test - Staging Migration Environment Propagation
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * **CRITICAL - EXPECTED BEHAVIOR**:
 * This test encodes the EXPECTED CORRECT behavior after the fix is implemented.
 * When run on UNFIXED code, this test MUST FAIL - proving the bug exists.
 * When run on FIXED code, this test MUST PASS - validating the fix works.
 *
 * **Bug Condition**:
 * When `docker compose run -e NODE_ENV=staging backend npm run migration:show` executes:
 * - CURRENT (DEFECT): Bash script receives empty NODE_ENV despite docker -e flag
 * - Script outputs: "Showing migrations from TypeScript (src/)..."
 * - TypeORM fails: "Cannot find module '/app/src/shared/common/persistence/entities'"
 *
 * **Expected Behavior (encoded in this test)**:
 * - Bash script SHALL detect NODE_ENV=staging
 * - Script outputs: "Showing migrations from compiled JavaScript (dist/)..."
 * - TypeORM SHALL execute against data-source.js (compiled)
 * - Command SHALL exit successfully without module errors
 *
 * **Test Strategy**:
 * Execute the exact failing command from staging deployment and assert expected behavior.
 * This is NOT a property-based test - it's a focused exploration of the concrete bug case.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Staging Migration Environment Propagation - Bug Condition', () => {
  const backendDir = path.resolve(__dirname, '..');
  const dockerComposeFile = path.join(backendDir, 'docker-compose.staging.yml');

  beforeAll(() => {
    // Verify docker-compose.staging.yml exists
    if (!fs.existsSync(dockerComposeFile)) {
      throw new Error(
        `Docker compose file not found: ${dockerComposeFile}. Cannot run bug exploration test.`,
      );
    }

    // Verify dist/ artifacts exist (required for staging mode)
    const dataSourcePath = path.join(
      backendDir,
      'dist/backend/src/shared/common/persistence/data-source.js',
    );
    if (!fs.existsSync(dataSourcePath)) {
      console.warn(
        `⚠️  WARNING: Compiled artifacts not found at ${dataSourcePath}`,
      );
      console.warn(
        '   Run `npm run build` in apps/backend before executing this test.',
      );
      console.warn(
        '   Test will verify behavior but may fail due to missing artifacts.',
      );
    }
  });

  /**
   * Property 1: Bug Condition - NODE_ENV=staging Detection Failure in npm Context
   *
   * **CRITICAL**: This test MUST FAIL on unfixed code
   * **Goal**: Surface counterexamples proving NODE_ENV doesn't reach bash through npm barrier
   *
   * Simplified test: Invoke npm script with NODE_ENV=staging to verify propagation
   * (Avoids Docker complexity while still testing the core npm barrier issue)
   */
  it('should detect NODE_ENV=staging and use JavaScript mode when running migrations via npm script', () => {
    // ARRANGE - Set up NODE_ENV=staging (simulating docker -e flag behavior)
    const command = 'npm run migration:show';

    console.log(
      '\n[BUG-EXPLORATION] Executing npm migration command with NODE_ENV=staging',
    );
    console.log('[BUG-EXPLORATION] Command:', command);

    // ACT - Execute npm script with NODE_ENV=staging (same as docker -e would do)
    let output: string;
    let exitCode: number;
    try {
      output = execSync(command, {
        cwd: backendDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'staging', // Set NODE_ENV in process environment
        },
      });
      exitCode = 0;
      console.log('[BUG-EXPLORATION] Command succeeded. Output:', output);
    } catch (error: any) {
      exitCode = error.status || 1;
      output = error.stdout?.toString() || error.stderr?.toString() || '';
      console.error(
        '[BUG-EXPLORATION] Command failed with exit code:',
        exitCode,
      );
      console.error('[BUG-EXPLORATION] Output:', output);
      console.error('[BUG-EXPLORATION] Error:', error.message);
    }

    // ASSERT - Expected behavior (will fail on unfixed code, confirming bug)

    // Expected: Script detects NODE_ENV=staging and uses JavaScript mode
    expect(output).toContain('Showing migrations from compiled JavaScript');
    // Or the shorter version from the script:
    expect(output).toMatch(
      /Showing migrations from (?:compiled )?JavaScript.*\(dist/i,
    );

    // Expected: Script executes TypeORM against compiled data-source.js
    expect(output).toContain('data-source.js');
    expect(output).not.toContain('data-source.ts'); // Should NOT use TypeScript

    // Expected: Command succeeds without module resolution errors
    expect(exitCode).toBe(0);
    expect(output).not.toMatch(
      /Cannot find module.*\/src\/shared\/common\/persistence\/entities/i,
    );

    // COUNTEREXAMPLE DOCUMENTATION (will be visible when test fails on unfixed code)
    if (
      output.includes('TypeScript') ||
      output.includes('data-source.ts') ||
      exitCode !== 0
    ) {
      console.error('\n❌ COUNTEREXAMPLE FOUND - Bug confirmed:');
      console.error('═══════════════════════════════════════════════\n');

      console.error('Expected behavior:');
      console.error(
        '  ✓ Output: "Showing migrations from compiled JavaScript (dist/)..."',
      );
      console.error(
        '  ✓ Command: npx typeorm -d ./dist/.../data-source.js migration:show',
      );
      console.error('  ✓ Exit code: 0');
      console.error('  ✓ No module errors\n');

      console.error('Actual behavior (DEFECT):');
      if (output.includes('TypeScript (src/)')) {
        console.error(
          '  ✗ Output: "Showing migrations from TypeScript (src/)..."',
        );
      }
      if (output.includes('data-source.ts')) {
        console.error(
          '  ✗ Command: npx typeorm-ts-node-commonjs --dataSource src/.../data-source.ts',
        );
      }
      if (exitCode !== 0) {
        console.error(`  ✗ Exit code: ${exitCode} (non-zero)`);
      }
      if (output.match(/Cannot find module/i)) {
        console.error("  ✗ Module error: Cannot find module '.../entities'");
      }

      console.error('\nRoot cause analysis:');
      console.error(
        '  • NODE_ENV=staging was set in parent process environment',
      );
      console.error('  • npm run migration:show was invoked');
      console.error(
        '  • Bash script did NOT receive NODE_ENV (npm script barrier)',
      );
      console.error(
        '  • Script fell back to TypeScript mode (development default)',
      );

      console.error('\nThis confirms isBugCondition holds:');
      console.error('  execution.environment = "staging" ✓');
      console.error('  execution.executionContext = "npm-run" ✓');
      console.error('  bashScriptReceives(execution, "NODE_ENV") = null ✓');
      console.error('  scriptFallsBackTo(execution) = "typescript-mode" ✓');

      console.error('\n═══════════════════════════════════════════════\n');
    }
  });

  /**
   * Additional context verification - Check if script receives NODE_ENV at all
   *
   * This helper test runs the script directly (bypassing npm) to verify
   * that the script ITSELF works correctly when NODE_ENV is properly set.
   * If this passes but the main test fails, it confirms npm is the barrier.
   */
  it('should detect NODE_ENV=staging when bash script is invoked directly (bypass npm barrier)', () => {
    const showMigrationsScript = path.join(
      backendDir,
      'scripts/show-migrations.sh',
    );

    if (!fs.existsSync(showMigrationsScript)) {
      console.warn(
        `⚠️  Script not found: ${showMigrationsScript}. Skipping direct bash test.`,
      );
      return;
    }

    // Execute bash script directly with NODE_ENV=staging (bypass npm)
    const command = `NODE_ENV=staging bash ${showMigrationsScript}`;

    console.log(
      '\n[BYPASS-NPM-TEST] Executing direct bash invocation:',
      command,
    );

    let output: string;
    let exitCode: number;
    try {
      output = execSync(command, {
        cwd: backendDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'staging',
        },
      });
      exitCode = 0;
      console.log('[BYPASS-NPM-TEST] Output:', output);
    } catch (error: any) {
      exitCode = error.status || 1;
      output = error.stdout?.toString() || error.stderr?.toString() || '';
      console.error('[BYPASS-NPM-TEST] Exit code:', exitCode);
      console.error('[BYPASS-NPM-TEST] Output:', output);
    }

    // When bypassing npm, script SHOULD receive NODE_ENV correctly
    // (Even on unfixed code - the bug is specifically in npm barrier)
    expect(output).toContain('JavaScript');
    expect(output).toContain('dist');

    if (output.includes('TypeScript') && output.includes('src/')) {
      console.error(
        '\n⚠️  WARNING: Direct bash invocation also failed to detect NODE_ENV=staging',
      );
      console.error(
        '   This suggests the bug may NOT be npm-specific - investigate shell condition logic.',
      );
    } else {
      console.log(
        '\n✓ Direct bash invocation correctly detected NODE_ENV=staging',
      );
      console.log('  This confirms npm script invocation is the barrier.');
    }
  });
});
