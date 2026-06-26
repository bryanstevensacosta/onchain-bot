#!/usr/bin/env ts-node
/**
 * Backfill: <short-name>
 * Author: <github-handle>
 * Date:   YYYY-MM-DD
 *
 * What: <one-line description>
 * Why:  <link to PR/issue>
 *
 * Usage:
 *   npx ts-node scripts/backfills/<this-file>.ts --dry-run         # count affected
 *   npx ts-node scripts/backfills/<this-file>.ts --validate        # check if needed
 *   npx ts-node scripts/backfills/<this-file>.ts --estimate-cost    # if external API
 *   npx ts-node scripts/backfills/<this-file>.ts --apply           # perform backfill
 *
 * Verification:
 *   <SQL query to confirm state changed>
 *
 * Rollback:
 *   <SQL to undo, or 'NOT REVERSIBLE — restore from backup.'>
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const MODE = (process.argv.find(a => a.startsWith('--')) ?? '--dry-run').slice(2);

interface AffectedRow {
  id: string;
  // Add fields you'll SELECT for the sample preview
}

async function main(): Promise<void> {
  if (process.env.DATABASE_ENABLED !== 'true') {
    console.warn('[backfill] DATABASE_ENABLED!=true — skipping.');
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

  // Step 1: Dry-run — count + sample affected rows
  const sample = await client.query<AffectedRow>(`
    SELECT id FROM <table>
    WHERE <condition-that-defines-rows-needing-backfill>
    LIMIT 5
  `);
  const countResult = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count FROM <table>
    WHERE <condition-that-defines-rows-needing-backfill>
  `);
  const affected = Number(countResult.rows[0].count);

  console.log(`[backfill] ${affected} row(s) match backfill condition.`);
  console.log('Sample:', sample.rows);

  if (MODE === 'dry-run') {
    console.log('[backfill] dry-run mode — no changes applied.');
    return;
  }

  if (MODE === 'validate') {
    if (affected === 0) {
      console.log('[backfill] validate: NO backfill needed (0 rows match).');
      process.exit(0);
    }
    console.log(`[backfill] validate: backfill IS needed for ${affected} row(s).`);
    return;
  }

  if (MODE === 'estimate-cost') {
    // If this backfill touches external APIs, report the cost here.
    console.log(`[backfill] estimate-cost: ${affected} external API call(s) needed.`);
    console.log(`[backfill] estimate-cost: $${(affected * 0.001).toFixed(4)} USD (assumed $0.001/call).`);
    return;
  }

  if (MODE === 'apply') {
    if (affected === 0) {
      console.log('[backfill] apply: nothing to do.');
      return;
    }
    console.log(`[backfill] applying backfill to ${affected} row(s)...`);
    await client.query('BEGIN');
    try {
      // Step 2: Apply the backfill
      await client.query(`
        UPDATE <table>
        SET <column> = <new-value>
        WHERE <condition>
      `);
      await client.query('COMMIT');
      console.log('[backfill] ✓ applied.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[backfill] ✗ FAILED:', (err as Error).message);
      throw err;
    }
    return;
  }

  console.error(`[backfill] unknown mode: --${MODE}. Use --dry-run | --validate | --estimate-cost | --apply.`);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[backfill] fatal:', err);
    process.exit(1);
  });