#!/usr/bin/env node
/**
 * Wrapper that loads ts-node and runs migrate.ts.
 * Forwards CLI args correctly (which `node -e` cannot do).
 *
 * Usage: node scripts/backfills/migrate.js [--dry-run | --status]
 */
require('ts-node/register/transpile-only');
require('./migrate.ts');