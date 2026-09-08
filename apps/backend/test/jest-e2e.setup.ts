/**
 * E2E setup file for Backend (task 3, db-separation).
 *
 * Runs BEFORE any test/*.e2e-spec.ts (wired via test/jest-e2e.json
 * `setupFiles`). app.e2e-spec.ts boots the full AppModule, whose TypeORM
 * config reads POSTGRES_DB — without this file the suite connects to the dev
 * DB (alpha_meta_token_scanner via .env.dev).
 *
 * Behavior:
 * - If POSTGRES_DB is explicitly set to a NON-test database (does not end in
 *   _test / _entity / _e2e), REFUSE to start with a loud error instead of
 *   risking dev data. This is the QA-failure guard.
 * - Otherwise force POSTGRES_DB=alpha_meta_token_scanner_e2e (dedicated DB
 *   created for this todo; synchronize:true creates the schema on boot).
 *
 * NOTE: src/settings/settings.e2e-spec.ts runs under the UNIT jest regex
 * (*.spec.ts) and builds its own TypeOrmModule — it is pinned separately
 * inside that file (default database + same guard). Do NOT touch unit
 * jest.setup.ts.
 */

const TEST_DATABASE = 'alpha_meta_token_scanner_e2e';

const isTestDatabase = (name: string | undefined): boolean =>
  !!name && /(_test|_entity|_e2e)$/.test(name);

const requested = process.env.POSTGRES_DB;

if (requested && !isTestDatabase(requested)) {
  throw new Error(
    `[e2e-guard] Refusing to run backend e2e suite against non-test database "${requested}". ` +
      `Unset POSTGRES_DB or point it at a *_test database (default: "${TEST_DATABASE}").`,
  );
}

process.env.POSTGRES_DB = TEST_DATABASE;

if (!process.env.DATABASE_ENABLED) {
  process.env.DATABASE_ENABLED = 'true';
}

process.env.NODE_ENV = 'test';
