#!/usr/bin/env ts-node
/**
 * Backfill: crypto-insider-handle
 * Date:   2026-08-03
 *
 * What: Set crypto_news_sources.handle='coinmarket' for channel_id='1350475252' (Crypto Insider)
 * Why:  MTProto resolver didn't expose Telegram @username at ingestion time (channel had no linked @username then).
 *       The channel IS public (https://t.me/coinmarket resolves correctly), so we set it manually.
 *
 * Usage:
 *   npx ts-node scripts/backfills/2026-08-03-crypto-insider-handle-backfill.ts --dry-run
 *   npx ts-node scripts/backfills/2026-08-03-crypto-insider-handle-backfill.ts --validate
 *   npx ts-node scripts/backfills/2026-08-03-crypto-insider-handle-backfill.ts --estimate-cost
 *   npx ts-node scripts/backfills/2026-08-03-crypto-insider-handle-backfill.ts --apply
 *
 * Verification:
 *   SELECT channel_id, handle FROM crypto_news_sources WHERE channel_id = '1350475252';
 *   Expected: handle = 'coinmarket'
 *
 * Rollback:
 *   UPDATE crypto_news_sources SET handle = NULL WHERE channel_id = '1350475252';
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const MODE = (process.argv.find(a => a.startsWith('--')) ?? '--dry-run').slice(2);

const TARGET_CHANNEL_ID = '1350475252';
const NEW_HANDLE = 'coinmarket';

async function main(): Promise<void> {
  if (process.env.DATABASE_ENABLED !== 'true') {
    console.warn('[backfill] DATABASE_ENABLED!=true — skipping.');
    return;
  }

  // HARD staging guard — refuses to run unless POSTGRES_DB contains 'staging'
  const pgDb = process.env.POSTGRES_DB ?? '';
  if (!pgDb.includes('staging')) {
    throw new Error(
      `REFUSING: this script is staging-only. POSTGRES_DB must contain "staging" (got "${pgDb}"). ` +
      `Set POSTGRES_DB to a staging database or remove this guard if you intend to run on prod.`,
    );
  }

  const client = new Client({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'alpha_meta_token_scanner',
    password: process.env.POSTGRES_PASSWORD ?? 'alpha_meta_token_scanner',
    database: pgDb,
  });
  await client.connect();

  const beforeSample = await client.query<{ channel_id: string; handle: string | null; title: string }>(`
    SELECT channel_id, handle, title
    FROM crypto_news_sources
    WHERE channel_id = $1
  `, [TARGET_CHANNEL_ID]);

  const wouldUpdateResult = await client.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM crypto_news_sources
    WHERE channel_id = $1 AND (handle IS NULL OR handle = '')
  `, [TARGET_CHANNEL_ID]);
  const wouldUpdate = Number(wouldUpdateResult.rows[0].count);

  console.log(`[backfill] target channel_id: ${TARGET_CHANNEL_ID}`);
  console.log(`[backfill] current state:`, beforeSample.rows[0] ?? '(no row)');
  console.log(`[backfill] rows that need update: ${wouldUpdate}`);

  if (MODE === 'dry-run') {
    console.log('[backfill] dry-run mode — no changes applied.');
    await client.end();
    return;
  }

  if (MODE === 'validate') {
    if (wouldUpdate === 0) {
      console.log('[backfill] validate: NO backfill needed (0 rows need update; handle already correct or row missing).');
      await client.end();
      process.exit(0);
    }
    console.log(`[backfill] validate: backfill IS needed for ${wouldUpdate} row(s).`);
    await client.end();
    return;
  }

  if (MODE === 'estimate-cost') {
    console.log('[backfill] estimate-cost: 0 external API calls (pure DB UPDATE).');
    console.log('[backfill] estimate-cost: $0.00 USD.');
    await client.end();
    return;
  }

  if (MODE === 'apply') {
    if (wouldUpdate === 0) {
      console.log('[backfill] apply: nothing to do — handle already set or row missing.');
      await client.end();
      return;
    }
    console.log(`[backfill] applying UPDATE to ${wouldUpdate} row(s)...`);
    await client.query('BEGIN');
    try {
      const result = await client.query<{ channel_id: string; handle: string; title: string }>(`
        UPDATE crypto_news_sources
        SET handle = $1, updated_at = NOW()
        WHERE channel_id = $2 AND (handle IS NULL OR handle = '')
        RETURNING channel_id, handle, title
      `, [NEW_HANDLE, TARGET_CHANNEL_ID]);
      await client.query('COMMIT');
      console.log('[backfill] ✓ applied:', result.rows);
      console.log(`[backfill] ✓ ${result.rowCount} row(s) updated.`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[backfill] ✗ FAILED:', (err as Error).message);
      throw err;
    } finally {
      await client.end();
    }
    return;
  }

  console.error(`[backfill] unknown mode: --${MODE}. Use --dry-run | --validate | --estimate-cost | --apply.`);
  await client.end();
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[backfill] fatal:', err);
    process.exit(1);
  });
