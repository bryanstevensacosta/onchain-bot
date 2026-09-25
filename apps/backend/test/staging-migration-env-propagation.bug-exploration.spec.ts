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
 * **Bug Condition (original hypothesis, see F-a below)**:
 * When `docker compose run -e NODE_ENV=staging backend npm run migration:show` executes:
 * - Script outputs: "Showing migrations from TypeScript (src/)..." on broken mode detection
 * - TypeORM fails: "Cannot find module '/app/src/shared/common/persistence/entities'"
 *
 * **Expected Behavior (encoded in this test)**:
 * - Bash script SHALL detect NODE_ENV=staging
 * - Script outputs: "Showing migrations from compiled JavaScript (dist/)..."
 * - TypeORM SHALL execute against data-source.js (compiled)
 * - Command SHALL exit successfully without module errors
 *
 * **FINDING F-a (2026-09-19) - "npm barrier" hypothesis REFUTED, do NOT re-adopt**:
 * The original spec assumed `bashScriptReceives(execution, "NODE_ENV") = null`
 * through an "npm script barrier". Live evidence refutes this:
 * `NODE_ENV=staging npm run migration:show` prints `[MIGRATION-DEBUG]
 * NODE_ENV='staging'` + `Showing migrations from compiled JavaScript (dist/)...`,
 * byte-identical to the direct `NODE_ENV=staging bash scripts/show-migrations.sh`
 * invocation. `package.json` propagates via `NODE_ENV=${NODE_ENV:-development}`.
 * The real failure was exit 1 from the compiled data-source against a read-only
 * local PG volume (`FATAL could not open file "base/16384/2601"`, code 42501),
 * with the mode selection CORRECT. See `.omo/drafts/staging-migration-test-fix.md`
 * (Failure contract F-a) and `.omo/evidence/task-1-staging-migration-test-fix.log`.
 *
 * **Test Strategy (deterministic rewrite)**:
 * - Test 1 (mode selection): `--dry-run` on both invocation paths (direct bash +
 *   npm propagation). Prints `[DRYRUN] mode=<javascript|typescript>
 *   data-source=<path>`, exit 0 WITHOUT touching the DB. Deterministic.
 * - Test 2 (live-DB integration): `SELECT 1` probe with a short timeout BEFORE
 *   connecting; SKIP with an explicit `console.warn` when no live DB answers.
 *   Only when the probe succeeds does the real `migration:show` run (exit 0).
 *
 * **QA FAILURE CONTROL**: removing `--dry-run` from the test-1 asserts re-fails
 * with the FATAL 42501 read-only-volume error whenever the local PG volume is
 * broken (verbatim in `.omo/evidence/task-1-staging-migration-test-fix.log`,
 * QA-1 exit 1). Test 1 MUST stay DB-free; never weaken its asserts to pass
 * against a broken DB (false-green).
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ExecFailure {
  status?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  message?: string;
}

interface CommandResult {
  output: string;
  exitCode: number;
}

function toText(value: string | Buffer | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  return value?.toString() ?? '';
}

describe('Staging Migration Environment Propagation - Bug Condition', () => {
  const backendDir = path.resolve(__dirname, '..');
  const dockerComposeFile = path.join(backendDir, 'docker-compose.staging.yml');
  let hasCompiledArtifacts = false;

  beforeAll(() => {
    // Verify docker-compose.staging.yml exists
    if (!fs.existsSync(dockerComposeFile)) {
      throw new Error(
        `Docker compose file not found: ${dockerComposeFile}. Cannot run bug exploration test.`,
      );
    }

    // Check if dist/ artifacts exist (required for staging mode)
    const dataSourcePath = path.join(
      backendDir,
      'dist/backend/src/shared/common/persistence/data-source.js',
    );
    hasCompiledArtifacts = fs.existsSync(dataSourcePath);

    if (!hasCompiledArtifacts) {
      console.warn(`⚠️  Compiled artifacts not found at ${dataSourcePath}`);
      console.warn(
        '   Tests will be SKIPPED. Run `npm run build` in apps/backend to enable.',
      );
    }
  });

  function stagingEnv(): NodeJS.ProcessEnv {
    // Caveat: `migration:*` scripts force `NODE_ENV=${NODE_ENV:-development}`
    // when unset, so NODE_ENV=staging MUST be set on the child env explicitly.
    return { ...process.env, NODE_ENV: 'staging' };
  }

  function runCommand(command: string): CommandResult {
    try {
      const output = execSync(command, {
        cwd: backendDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: stagingEnv(),
      });
      return { output, exitCode: 0 };
    } catch (error: unknown) {
      const failure = error as ExecFailure;
      const output =
        toText(failure.stdout) ||
        toText(failure.stderr) ||
        failure.message ||
        '';
      return {
        output,
        exitCode:
          typeof failure.status === 'number' && failure.status !== null
            ? failure.status
            : 1,
      };
    }
  }

  function assertDryRunSelectsJavaScriptMode(output: string): void {
    // Format contract: `[DRYRUN] mode=<javascript|typescript> data-source=<path> args=<resto>`
    expect(output).toContain('[DRYRUN]');
    expect(output).toContain('mode=javascript');
    expect(output).toContain('data-source.js');
    expect(output).not.toContain('data-source.ts');
  }

  /**
   * Test 1: Mode selection is deterministic via DRY_RUN (no DB touched).
   *
   * Covers BOTH invocation paths with NODE_ENV=staging:
   * (a) direct: `NODE_ENV=staging bash scripts/show-migrations.sh --dry-run`
   * (b) npm propagation: `npm run migration:show -- --dry-run` (args after `--`
   *     MUST reach the script; `package.json` runs
   *     `NODE_ENV=${NODE_ENV:-development} bash scripts/show-migrations.sh`).
   * F-a note: (b) passing alongside (a) is the standing refutation of the
   * "npm barrier" hypothesis — npm propagates NODE_ENV intact.
   */
  it('should select JavaScript mode via --dry-run on both direct and npm paths', () => {
    if (!hasCompiledArtifacts) {
      console.warn(
        '⚠️  Skipping test: compiled artifacts not found. Run `npm run build` to enable.',
      );
      return;
    }

    const direct = runCommand(
      'NODE_ENV=staging bash scripts/show-migrations.sh --dry-run',
    );
    expect(direct.exitCode).toBe(0);
    assertDryRunSelectsJavaScriptMode(direct.output);

    const viaNpm = runCommand('npm run migration:show -- --dry-run');
    expect(viaNpm.exitCode).toBe(0);
    assertDryRunSelectsJavaScriptMode(viaNpm.output);
  });

  /**
   * Test 2: Live-DB integration with a pre-flight probe and explicit skip.
   *
   * Probe: `SELECT 1` via psql with a short timeout (<=10s) against the same
   * defaults the compiled data-source falls back to in local
   * (`localhost:5432` / `onchain_bot`, see `data-source.ts:35-39`;
   * the CLI only reads `.env`, never `.env.staging`).
   * NOTE: `pg_isready` alone is NOT a sufficient probe — it reports "accepting
   * connections" even when the datadir is read-only; the query-level `SELECT 1`
   * fails with the same FATAL 42501 the real command would hit, so the skip
   * triggers exactly when the DB cannot serve migrations. No live DB (or a
   * broken one) => SKIP with warning. Live DB => real `migration:show`, exit 0.
   */
  it('should show migrations against a live DB, or skip when no live DB answers', () => {
    if (!hasCompiledArtifacts) {
      console.warn(
        '⚠️  Skipping test: compiled artifacts not found. Run `npm run build` to enable.',
      );
      return;
    }

    // ARRANGE - pre-flight probe (query-level, short timeout, no migration run)
    const probeHost = process.env.POSTGRES_HOST ?? 'localhost';
    const probePort = process.env.POSTGRES_PORT ?? '5432';
    const probeUser = process.env.POSTGRES_USER ?? 'onchain_bot';
    const probeDb = process.env.POSTGRES_DB ?? 'onchain_bot';
    let databaseLive = false;
    try {
      execSync(
        `psql -h ${probeHost} -p ${probePort} -U ${probeUser} -d ${probeDb} -c "SELECT 1"`,
        {
          cwd: backendDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 8000,
          env: {
            ...stagingEnv(),
            PGPASSWORD: process.env.POSTGRES_PASSWORD ?? 'onchain_bot',
          },
        },
      );
      databaseLive = true;
    } catch {
      databaseLive = false;
    }

    if (!databaseLive) {
      console.warn(
        `⚠️  Skipping integration test: no live DB at ${probeHost}:${probePort}/${probeDb} ` +
          '(probe `SELECT 1` failed or timed out; FATAL 42501 read-only volumes also land here).',
      );
      return;
    }

    // ACT - real migration:show against the live DB (no --dry-run by design)
    const result = runCommand('npm run migration:show');

    // ASSERT - full expected behavior including exit 0
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('compiled JavaScript');
    expect(result.output).toContain('data-source.js');
    expect(result.output).not.toContain('data-source.ts');
    expect(result.output).not.toMatch(
      /Cannot find module.*\/src\/shared\/common\/persistence\/entities/i,
    );
  });
});
