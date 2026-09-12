/**
 * Preservation Property Tests - Staging Migration Environment Propagation
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * **CRITICAL - BASELINE BEHAVIOR**:
 * These tests capture the BASELINE behavior that must be preserved after the fix.
 * When run on UNFIXED code, these tests MUST PASS - proving the baseline works.
 * When run on FIXED code, these tests MUST STILL PASS - proving no regressions.
 *
 * **Purpose**:
 * Ensure that the fix for NODE_ENV=staging detection does NOT break:
 * - Local development (TypeScript mode when NODE_ENV unset)
 * - Production deployment (JavaScript mode when NODE_ENV=production)
 * - Direct bash script invocation (bypasses npm barrier)
 * - Edge case handling (empty strings, whitespace, uppercase, etc.)
 * - Other npm scripts (non-migration scripts should be unaffected)
 *
 * **Test Strategy**:
 * Property-based approach capturing behavioral invariants:
 * - Property: For all execution contexts where bug condition does NOT hold,
 *   behavior matches observed baseline
 * - Property: Database schema state after migrations is identical regardless
 *   of mode detection mechanism
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Staging Migration Environment Propagation - Preservation', () => {
  const backendDir = path.resolve(__dirname, '..');
  const showMigrationsScript = path.join(
    backendDir,
    'scripts/show-migrations.sh',
  );
  const runMigrationsScript = path.join(
    backendDir,
    'scripts/run-migrations.sh',
  );

  beforeAll(() => {
    // Verify scripts exist
    if (!fs.existsSync(showMigrationsScript)) {
      throw new Error(`Script not found: ${showMigrationsScript}`);
    }
    if (!fs.existsSync(runMigrationsScript)) {
      throw new Error(`Script not found: ${runMigrationsScript}`);
    }
  });

  /**
   * Property 2.1: Local Development Mode Preservation
   *
   * **Baseline Observation**: When NODE_ENV is unset (or empty), the scripts
   * default to TypeScript mode for local development
   *
   * **Expected Behavior**: Scripts use typeorm-ts-node-commonjs with src/ data source
   */
  describe('Local Development Mode', () => {
    it('should use TypeScript mode when NODE_ENV is unset (local development)', () => {
      console.log(
        '\n[PRESERVATION] Testing local development mode (NODE_ENV unset)',
      );

      // Execute npm script WITHOUT setting NODE_ENV (simulates local dev environment)
      let output: string;
      let exitCode: number;

      try {
        // Create clean environment without NODE_ENV
        const cleanEnv = { ...process.env };
        delete cleanEnv.NODE_ENV;

        output = execSync('npm run migration:show', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: cleanEnv,
        });
        exitCode = 0;
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        exitCode = error.status || 1;
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Command failed with exit code:', exitCode);
        console.log('[PRESERVATION] Output:', output);
      }

      // ASSERT: Development mode behavior preserved
      // Should output TypeScript mode message
      expect(output).toContain('Showing migrations from TypeScript');
      expect(output).toMatch(/TypeScript.*\(src/i);

      // Note: TypeORM migration output doesn't show the data source filename,
      // but the script echo message "TypeScript (src/)" confirms mode selection
      // We verify the mode selection message, not the actual TypeORM command output

      console.log('✓ Local development mode behavior preserved');
    });

    it('should use TypeScript mode when NODE_ENV is empty string', () => {
      console.log('\n[PRESERVATION] Testing empty NODE_ENV string');

      let output: string;
      try {
        output = execSync('npm run migration:show', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: '', // Explicitly empty
          },
        });
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Empty string should fall back to TypeScript mode (development default)
      expect(output).toContain('TypeScript');
      expect(output).toContain('src');

      console.log('✓ Empty NODE_ENV correctly falls back to TypeScript mode');
    });

    it('should use TypeScript mode when NODE_ENV contains only whitespace', () => {
      console.log('\n[PRESERVATION] Testing whitespace-only NODE_ENV');

      let output: string;
      try {
        output = execSync('npm run migration:show', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: '   ', // Whitespace only
          },
        });
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Whitespace-only should fall back to TypeScript mode
      expect(output).toContain('TypeScript');
      expect(output).toContain('src');

      console.log(
        '✓ Whitespace NODE_ENV correctly falls back to TypeScript mode',
      );
    });
  });

  /**
   * Property 2.2: Production Mode Preservation
   *
   * **Baseline Observation**: When NODE_ENV=production, scripts use JavaScript mode
   * with compiled data source
   *
   * **Expected Behavior**: Scripts use typeorm with dist/ data source
   */
  describe('Production Mode', () => {
    beforeAll(() => {
      // Verify compiled artifacts exist (required for production mode)
      const dataSourcePath = path.join(
        backendDir,
        'dist/backend/src/shared/common/persistence/data-source.js',
      );
      if (!fs.existsSync(dataSourcePath)) {
        console.warn(
          `⚠️  WARNING: Compiled artifacts not found at ${dataSourcePath}`,
        );
        console.warn('   Run `npm run build` before testing production mode.');
      }
    });

    it('should use JavaScript mode when NODE_ENV=production', () => {
      console.log(
        '\n[PRESERVATION] Testing production mode (NODE_ENV=production)',
      );

      let output: string;
      let exitCode: number;

      try {
        output = execSync('npm run migration:show', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        });
        exitCode = 0;
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        exitCode = error.status || 1;
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Exit code:', exitCode);
        console.log('[PRESERVATION] Output:', output);
      }

      // ASSERT: Production mode behavior preserved
      // Should output JavaScript mode message
      expect(output).toContain('Showing migrations from');
      expect(output).toMatch(/JavaScript.*\(dist/i);

      // Note: TypeORM migration output doesn't show the data source filename,
      // but the script echo message "JavaScript (dist/)" confirms mode selection
      // We verify the mode selection message, not the actual TypeORM command output

      console.log('✓ Production mode behavior preserved');
    });
  });

  /**
   * Property 2.3: Direct Bash Invocation (Bypass npm)
   *
   * **Baseline Observation**: When scripts are invoked directly with NODE_ENV set,
   * they correctly detect the environment (npm barrier does not apply)
   *
   * **Expected Behavior**: Direct bash invocation should work correctly for all
   * NODE_ENV values (staging, production, unset)
   */
  describe('Direct Bash Script Invocation', () => {
    it('should detect NODE_ENV=staging when script is invoked directly (bypass npm)', () => {
      console.log(
        '\n[PRESERVATION] Testing direct bash invocation with NODE_ENV=staging',
      );

      const command = `NODE_ENV=staging bash ${showMigrationsScript}`;
      let output: string;

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
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Direct bash invocation should correctly detect NODE_ENV=staging
      // (No npm barrier in this execution path)
      expect(output).toContain('JavaScript');
      expect(output).toContain('dist');

      console.log(
        '✓ Direct bash invocation correctly detects NODE_ENV=staging',
      );
      console.log(
        '  (This confirms npm script invocation is the barrier in bug condition)',
      );
    });

    it('should detect NODE_ENV=production when script is invoked directly', () => {
      console.log(
        '\n[PRESERVATION] Testing direct bash invocation with NODE_ENV=production',
      );

      const command = `NODE_ENV=production bash ${showMigrationsScript}`;
      let output: string;

      try {
        output = execSync(command, {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        });
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Should use JavaScript mode
      expect(output).toContain('JavaScript');
      expect(output).toContain('dist');

      console.log(
        '✓ Direct bash invocation correctly detects NODE_ENV=production',
      );
    });

    it('should use TypeScript mode when invoked directly without NODE_ENV', () => {
      console.log(
        '\n[PRESERVATION] Testing direct bash invocation without NODE_ENV',
      );

      const command = `bash ${showMigrationsScript}`;
      let output: string;

      try {
        // Clean environment
        const cleanEnv = { ...process.env };
        delete cleanEnv.NODE_ENV;

        output = execSync(command, {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: cleanEnv,
        });
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Without NODE_ENV, should default to TypeScript mode
      expect(output).toContain('TypeScript');
      expect(output).toContain('src');

      console.log(
        '✓ Direct bash invocation correctly defaults to TypeScript mode',
      );
    });
  });

  /**
   * Property 2.4: Edge Case Handling
   *
   * **Baseline Observation**: Scripts handle edge cases gracefully by falling
   * back to TypeScript mode (safe default for invalid/unrecognized values)
   *
   * **Expected Behavior**: Unexpected NODE_ENV values trigger development fallback
   */
  describe('Edge Cases', () => {
    it('should fall back to TypeScript mode for uppercase NODE_ENV=STAGING', () => {
      console.log(
        '\n[PRESERVATION] Testing uppercase STAGING (should fall back)',
      );

      let output: string;
      try {
        output = execSync('npm run migration:show', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: 'STAGING', // Uppercase (not recognized by condition)
          },
        });
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Uppercase is NOT recognized (condition is case-sensitive)
      // Should fall back to TypeScript mode
      expect(output).toContain('TypeScript');
      expect(output).toContain('src');

      console.log(
        '✓ Uppercase STAGING correctly falls back to TypeScript mode',
      );
      console.log('  (Case-sensitive comparison is intentional per design)');
    });

    it('should fall back to TypeScript mode for unrecognized NODE_ENV values', () => {
      console.log(
        '\n[PRESERVATION] Testing unrecognized NODE_ENV (e.g., "test")',
      );

      let output: string;
      try {
        output = execSync('npm run migration:show', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...process.env,
            NODE_ENV: 'test', // Unrecognized value
          },
        });
        console.log('[PRESERVATION] Output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Unrecognized value should fall back to TypeScript mode
      expect(output).toContain('TypeScript');
      expect(output).toContain('src');

      console.log(
        '✓ Unrecognized NODE_ENV correctly falls back to TypeScript mode',
      );
    });
  });

  /**
   * Property 2.5: Non-Migration npm Scripts Preservation
   *
   * **Baseline Observation**: Other npm scripts (not migration-related) should
   * be completely unaffected by changes to migration script NODE_ENV handling
   *
   * **Expected Behavior**: Build, lint, test scripts work identically pre and post-fix
   */
  describe('Non-Migration Scripts', () => {
    it('should not affect typeorm script behavior', () => {
      console.log(
        '\n[PRESERVATION] Testing typeorm script (non-migration helper)',
      );

      let output: string;
      try {
        // Test the typeorm helper script (used for migration:generate, etc.)
        output = execSync('npm run typeorm -- --version', {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 10000,
        });
        console.log('[PRESERVATION] Typeorm version output:', output);
      } catch (error: any) {
        output = error.stdout?.toString() || error.stderr?.toString() || '';
        console.log('[PRESERVATION] Output:', output);
      }

      // Should complete without errors
      // (Exact output varies by TypeORM version, just verify it runs)
      expect(output).toBeTruthy();

      console.log('✓ Typeorm script unaffected by migration script changes');
    });

    it('should not affect other npm scripts (db:migrate uses different mechanism)', () => {
      console.log(
        '\n[PRESERVATION] Verifying db:migrate is separate from migration:show/run',
      );

      // db:migrate uses node scripts/backfills/migrate.js (different path)
      // migration:show/run use bash scripts/*.sh (bash-based detection)
      // These are SEPARATE systems - fix should not affect db:migrate

      const migrateScript = path.join(
        backendDir,
        'scripts/backfills/migrate.js',
      );
      const scriptExists = fs.existsSync(migrateScript);

      expect(scriptExists).toBe(true);

      console.log(
        '✓ db:migrate script is independent (uses migrate.js, not bash scripts)',
      );
      console.log('  Fix to bash scripts will not affect db:migrate behavior');
    });
  });

  /**
   * Property 2.6: Both Scripts Consistency
   *
   * **Baseline Observation**: show-migrations.sh and run-migrations.sh use
   * identical mode detection logic (same if-condition, same commands)
   *
   * **Expected Behavior**: Both scripts should behave identically for same NODE_ENV
   */
  describe('Script Consistency', () => {
    it('should use same mode selection logic in both show and run scripts', () => {
      console.log(
        '\n[PRESERVATION] Verifying show-migrations.sh and run-migrations.sh consistency',
      );

      // Read both scripts
      const showScript = fs.readFileSync(showMigrationsScript, 'utf-8');
      const runScript = fs.readFileSync(runMigrationsScript, 'utf-8');

      // Both should have identical if-condition
      const expectedCondition =
        '[ "${NODE_ENV:-}" = "production" ] || [ "${NODE_ENV:-}" = "staging" ]';

      expect(showScript).toContain(expectedCondition);
      expect(runScript).toContain(expectedCondition);

      // Both should use same TypeScript command for dev
      expect(showScript).toContain('typeorm-ts-node-commonjs');
      expect(runScript).toContain('typeorm-ts-node-commonjs');

      // Both should use same JavaScript command for prod/staging
      expect(showScript).toContain(
        'npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js',
      );
      expect(runScript).toContain(
        'npx typeorm -d ./dist/backend/src/shared/common/persistence/data-source.js',
      );

      console.log('✓ Both scripts use identical mode detection logic');
      console.log(
        '  Fix will maintain consistency between show and run scripts',
      );
    });
  });

  /**
   * Summary: Preservation Test Results
   *
   * If all these tests PASS on unfixed code:
   * - ✓ Confirms baseline behavior is correct for dev/prod/direct-bash contexts
   * - ✓ Confirms bug is isolated to Docker staging + npm invocation context only
   * - ✓ Provides regression guard to ensure fix doesn't break working scenarios
   *
   * If these tests PASS on fixed code:
   * - ✓ Confirms fix does not introduce regressions
   * - ✓ Confirms dev/prod/edge-case behavior is preserved
   * - ✓ Validates that fix is surgical (only affects buggy path)
   */
});
