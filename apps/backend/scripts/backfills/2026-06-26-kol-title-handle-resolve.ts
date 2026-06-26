#!/usr/bin/env ts-node
/**
 * Backfill: kol-title-handle-resolve
 * Author: bstevens
 * Date:   2026-06-26
 *
 * What: Resolve missing / placeholder title or handle for 3 KOLs.
 * Why:  KOLs registered before the metadataCache+seed override path was
 *       wired ended up with:
 *         - 2054466090 "Cas Gem"        → handle IS NULL
 *         - 1960616143 "SpyDefi"        → handle IS NULL
 *         - 1756488143 "- SOL -"        → title is placeholder (dashes)
 *       MTProto resolution was attempted but failed (or returned null handle)
 *       and the rows were never corrected.
 *
 * Usage:
 *   npx ts-node scripts/backfills/2026-06-26-kol-title-handle-resolve.ts --dry-run
 *   npx ts-node scripts/backfills/2026-06-26-kol-title-handle-resolve.ts --validate
 *   npx ts-node scripts/backfills/2026-06-26-kol-title-handle-resolve.ts --estimate-cost
 *   npx ts-node scripts/backfills/2026-06-26-kol-title-handle-resolve.ts --apply
 *
 * Verification:
 *   SELECT kol_id, title, handle FROM kols
 *    WHERE kol_id IN ('2054466090','1960616143','1756488143');
 *   -- handle should be @something, title should be the real channel title
 *
 * Rollback:
 *   UPDATE kols SET title='Cas Gem', handle=NULL WHERE kol_id='2054466090';
 *   UPDATE kols SET title='SpyDefi', handle=NULL WHERE kol_id='1960616143';
 *   UPDATE kols SET title='- SOL -', handle='lowtaxsolana' WHERE kol_id='1756488143';
 *
 * COST: 0 external API calls (values come from MANUAL_RESOLUTIONS map below).
 *       Edit the map when real handles/titles are known — do NOT call MTProto
 *       in bulk from this script (use `npm run seed` with INGESTION_TELEGRAM_SEED_CHANNELS
 *       instead, which caches results and is idempotent).
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const MODE = (process.argv.find(a => a.startsWith('--')) ?? '--dry-run').slice(2);

interface KolRow {
  kol_id: string;
  title: string;
  handle: string | null;
  lifecycle_status: string;
  is_active: boolean;
}

interface Resolution {
  title?: string;
  handle?: string | null;
}

/**
 * EDIT THIS MAP with the real Telegram handles/titles when known.
 * Format: kol_id → { title?: string, handle?: string }.
 * Only set fields you want to override. UNCOMMENT and replace TODO once known.
 *
 * To discover the real handle, open the channel in Telegram and copy
 * the @username from the channel info. The title is the channel's display name.
 *
 * ALTERNATIVE PATH (no script changes): set INGESTION_TELEGRAM_SEED_CHANNELS
 * in apps/backend/.env using the override format "kolId|handle|title" for
 * these 3 KOLs. On next `npm run start:dev`, KolSeeder.onApplicationBootstrap
 * applies the override directly (idempotent, no SQL needed). Example:
 *
 *   INGESTION_TELEGRAM_SEED_CHANNELS=2054466090|@casgem|Cas Gem,1960616143|@spydefi|SpyDefi,1756488143|@lowtaxsolana|- SOL -,...
 *
 * EXAMPLE (script path):
 *   '2054466090': { handle: '@casgem' },
 *   '1756488143': { title: 'Low Tax Solana Calls' },
 */
const MANUAL_RESOLUTIONS: Record<string, Resolution> = {
  '2054466090': { handle: '@casgem' },
  '1960616143': { handle: '@spydefi' },
  // 1756488143 has correct data: title "- SOL -" is the literal Telegram display name
  // (channel https://t.me/lowtaxsolana, founded 2022, ~73K subs).
  // The "dashes" looked like a placeholder but it's the actual stylized channel name.
};

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

  const sample = await client.query<KolRow>(`
    SELECT kol_id, title, handle, lifecycle_status, is_active
    FROM kols
    WHERE kol_id IN ('2054466090','1960616143','1756488143')
    ORDER BY kol_id
  `);
  const allRows = sample.rows;

  const needsBackfill = allRows.filter(r => {
    const res = MANUAL_RESOLUTIONS[r.kol_id];
    if (!res) return false;
    if (res.title !== undefined && res.title !== r.title) return true;
    if (res.handle !== undefined && res.handle !== r.handle) return true;
    return false;
  });

  console.log(`[backfill] ${allRows.length} KOL(s) targeted, ${needsBackfill.length} need backfill.`);
  console.log('Current state:');
  for (const r of allRows) console.log(`  ${r.kol_id}: title="${r.title}" handle=${r.handle ?? 'NULL'}`);

  if (MODE === 'dry-run') {
    console.log('[backfill] dry-run mode — no changes applied.');
    console.log('Planned resolutions:');
    for (const r of needsBackfill) console.log(`  ${r.kol_id}: ${JSON.stringify(MANUAL_RESOLUTIONS[r.kol_id])}`);
    return;
  }

  if (MODE === 'validate') {
    if (needsBackfill.length === 0) {
      console.log('[backfill] validate: NO backfill needed (all rows already correct).');
      process.exit(0);
    }
    const allResolved = needsBackfill.every(r => {
      const res = MANUAL_RESOLUTIONS[r.kol_id];
      const hasTitle = res.title !== undefined && res.title !== null && res.title.trim() !== '';
      const hasHandle = res.handle !== undefined && res.handle !== null && res.handle.trim() !== '';
      // Either title or handle override is sufficient
      return hasTitle || hasHandle;
    });
    if (!allResolved) {
      console.log('[backfill] validate: FAILED — MANUAL_RESOLUTIONS map has TODO entries.');
      console.log('Edit the map in scripts/backfills/2026-06-26-kol-title-handle-resolve.ts');
      process.exit(2);
    }
    console.log(`[backfill] validate: backfill IS needed for ${needsBackfill.length} row(s).`);
    return;
  }

  if (MODE === 'estimate-cost') {
    console.log(`[backfill] estimate-cost: ${needsBackfill.length} row(s) to update.`);
    console.log('[backfill] estimate-cost: 0 external API calls (values from MANUAL_RESOLUTIONS map).');
    console.log('[backfill] estimate-cost: $0.00 USD');
    return;
  }

  if (MODE === 'apply') {
    if (needsBackfill.length === 0) {
      console.log('[backfill] apply: nothing to do (all rows already correct).');
      return;
    }
    // Re-run validate check before applying
    const allResolved = needsBackfill.every(r => {
      const res = MANUAL_RESOLUTIONS[r.kol_id];
      const hasTitle = res.title !== undefined && res.title !== null && res.title.trim() !== '';
      const hasHandle = res.handle !== undefined && res.handle !== null && res.handle.trim() !== '';
      return hasTitle || hasHandle;
    });
    if (!allResolved) {
      console.error('[backfill] apply: ABORTED — MANUAL_RESOLUTIONS map has TODO entries.');
      console.error('Edit the map in scripts/backfills/2026-06-26-kol-title-handle-resolve.ts');
      process.exit(2);
    }

    console.log(`[backfill] applying backfill to ${needsBackfill.length} row(s)...`);
    await client.query('BEGIN');
    try {
      for (const r of needsBackfill) {
        const res = MANUAL_RESOLUTIONS[r.kol_id];
        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;
        if (res.title !== undefined) { updates.push(`title = $${i++}`); values.push(res.title); }
        if (res.handle !== undefined) { updates.push(`handle = $${i++}`); values.push(res.handle); }
        values.push(r.kol_id);
        await client.query(
          `UPDATE kols SET ${updates.join(', ')} WHERE kol_id = $${i}`,
          values,
        );
        console.log(`  ✓ ${r.kol_id} → ${JSON.stringify(res)}`);
      }
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