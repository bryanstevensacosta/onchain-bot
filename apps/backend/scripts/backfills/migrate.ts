#!/usr/bin/env ts-node
/**
 * Backfill migration runner.
 *
 * Auto-executes unapplied SQL backfill scripts from `scripts/backfills/*.sql`
 * in lexical order (date-prefixed, e.g. `2026-06-26-token-score-breakdown.sql`).
 * Tracks applied scripts in the `backfill_migrations` table so each script
 * runs at most once per database.
 *
 * Modes (CLI flag or env var):
 *   --dry-run    : List scripts that would run, no DB writes.
 *   --status     : Show applied/pending for each script.
 *   (default)    : Apply all pending scripts in order, each in a transaction.
 *
 * Wired into `npm run dev:backend` and `npm run start:dev` so dev/staging
 * databases auto-apply new backfills on next boot. Production should invoke
 * explicitly: `npm run db:migrate -- --dry-run` then `npm run db:migrate`.
 *
 * Environment:
 *   DATABASE_ENABLED must be true (otherwise skip with warning — in-memory mode).
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB.
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env' });

const MODE = (process.argv.find(a => a.startsWith('--')) ?? '').slice(2) || 'apply';
const SCRIPTS_DIR = path.resolve(__dirname);

interface MigrationRow {
  filename: string;
  applied_at: Date;
}

async function main(): Promise<void> {
  if (process.env.DATABASE_ENABLED !== 'true') {
    console.warn('[migrate] DATABASE_ENABLED!=true — skipping (in-memory mode).');
    return;
  }

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'alpha_meta_token_scanner',
    password: process.env.POSTGRES_PASSWORD ?? 'alpha_meta_token_scanner',
    database: process.env.POSTGRES_DB ?? 'alpha_meta_token_scanner',
  });
  await client.connect();

  await ensureMigrationsTable(client);

  const all = fs
    .readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith('.sql') && !f.startsWith('_'))
    .sort();
  const applied = new Set(
    (await client.query<MigrationRow>(
      'SELECT filename, applied_at FROM backfill_migrations',
    )).rows.map(r => r.filename),
  );

  const pending = all.filter(f => !applied.has(f));

  if (MODE === 'status') {
    console.log(`[migrate] status: ${applied.size} applied, ${pending.length} pending`);
    for (const f of all) {
      console.log(`  ${applied.has(f) ? '✓' : '·'} ${f}`);
    }
    return;
  }

  if (MODE === 'dry-run') {
    console.log(`[migrate] dry-run: ${pending.length} would apply`);
    for (const f of pending) console.log(`  → ${f}`);
    return;
  }

  if (pending.length === 0) {
    console.log('[migrate] nothing to apply — all scripts up to date.');
    return;
  }

  console.log(`[migrate] applying ${pending.length} script(s)...`);
  for (const filename of pending) {
    const sql = fs.readFileSync(path.join(SCRIPTS_DIR, filename), 'utf8');
    console.log(`  → ${filename}`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO backfill_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      console.log(`    ✓ applied`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`    ✗ FAILED: ${(err as Error).message}`);
      throw err;
    }
  }
  console.log('[migrate] done.');
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS backfill_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[migrate] fatal:', err);
    process.exit(1);
  });