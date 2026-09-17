/**
 * Jest setup file for Ingestion Service
 *
 * Runs before all tests to configure the test environment.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env file if it exists (provides DB credentials for tests)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Force database to be enabled in tests (matches backend pattern)
if (!process.env.DATABASE_ENABLED) {
  process.env.DATABASE_ENABLED = 'true';
}

// SAFETY: never let tests inherit the dev database name from .env
// (dev uses alpha_meta_token_scanner, and since todo 1
// alpha_meta_token_scanner_ingestion). Specs with dropSchema/synchronize
// would wipe dev data on `npm test` / pre-push.
if (
  !process.env.INGESTION_DATABASE_NAME ||
  process.env.INGESTION_DATABASE_NAME === 'alpha_meta_token_scanner' ||
  process.env.INGESTION_DATABASE_NAME === 'alpha_meta_token_scanner_ingestion'
) {
  process.env.INGESTION_DATABASE_NAME = 'onchain_bot_test_entity';
}

// Set test environment
process.env.NODE_ENV = 'test';

// Increase test timeout for integration tests
jest.setTimeout(30000);
