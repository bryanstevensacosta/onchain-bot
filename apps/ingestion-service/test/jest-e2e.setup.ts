/**
 * E2E setup file for Ingestion Service (task 3, db-separation).
 *
 * Runs BEFORE any *.e2e-spec.ts (wired via test/jest-e2e.json `setupFiles`).
 * All 7 e2e specs boot the full AppModule, whose TypeORM config reads
 * INGESTION_DATABASE_NAME — without this file the suites connect to the dev
 * DB from `.env` (alpha_meta_token_scanner_ingestion).
 *
 * Behavior:
 * - If INGESTION_DATABASE_NAME is explicitly set to a NON-test database
 *   (does not end in _test / _entity / _e2e), REFUSE to start with a loud
 *   error instead of risking dev data. This is the QA-failure guard.
 * - Otherwise force INGESTION_DATABASE_NAME=onchain_bot_test (empty DB;
 *   synchronize:true from .env creates the 5 entities on boot).
 *
 * Do NOT change business asserts here — DB pinning only.
 */

const TEST_DATABASE = 'onchain_bot_test';

const isTestDatabase = (name: string | undefined): boolean =>
  !!name && /(_test|_entity|_e2e)$/.test(name);

const requested = process.env.INGESTION_DATABASE_NAME;

if (requested && !isTestDatabase(requested)) {
  throw new Error(
    `[e2e-guard] Refusing to run ingestion e2e suite against non-test database "${requested}". ` +
      `Unset INGESTION_DATABASE_NAME or point it at a *_test database (default: "${TEST_DATABASE}").`,
  );
}

process.env.INGESTION_DATABASE_NAME = TEST_DATABASE;

if (!process.env.DATABASE_ENABLED) {
  process.env.DATABASE_ENABLED = 'true';
}

process.env.NODE_ENV = 'test';
