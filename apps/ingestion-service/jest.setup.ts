/**
 * Jest setup file for Ingestion Service
 * 
 * Runs before all tests to configure the test environment.
 */

// Force database to be enabled in tests (matches backend pattern)
process.env.DATABASE_ENABLED = 'true';

// Set test environment
process.env.NODE_ENV = 'test';

// Increase test timeout for integration tests
jest.setTimeout(30000);
