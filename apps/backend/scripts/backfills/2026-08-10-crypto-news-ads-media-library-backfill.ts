#!/usr/bin/env ts-node
/**
 * Backfill: crypto-news-ads-media-library
 * Date:  2026-08-10
 *
 * What: Register every existing `crypto_news_ad_media` row into the new
 *       `crypto_news_ad_media_library` table (migration 183), while copying
 *       each ad image file into a content-addressed `crypto-news-ads-library/`
 *       directory named by its sha256 hash.
 * Why:  The media library (new feature set) enables ad-image reuse (clone-on-
 *       reuse, `POST /ads/:id/reuse-image`). Ad images uploaded before the
 *       library existed are not yet content-addressed nor referenced by it.
 *       This backfill closes that gap without touching `crypto_news_ad_media`
 *       rows or their files.
 *
 * Safety / idempotency (READ ME):
 *   - The ONLY writes are an idempotent `INSERT ... ON CONFLICT (content_hash)
 *     DO NOTHING` and a skip-if-exists `fs.copyFile` into
 *     `<UPLOADS_ROOT>/crypto-news-ads-library/`. There are NO deletes, NO
 *     replaces of existing ad files, and NO modifications to
 *     `crypto_news_ad_media` rows/files (source files are never re-hashed,
 *     renamed, or rewritten). Re-running `--apply` is a no-op — the second run
 *     reports 0 inserted.
 *   - STAGING GUARD DECISION: this script intentionally does NOT copy the
 *     `POSTGRES_DB === '...staging'` guard from
 *     `2026-08-03-crypto-insider-handle-backfill.ts`. That script UPDATEs
 *     existing rows, so it restricts itself to staging. This one only appends
 *     new idempotent rows and copies NEW files — it is safe to run on dev AND
 *     prod. Do not re-add a staging guard when copying this backfill.
 *
 * Usage (run from apps/backend/ so `./uploads` and `.env` resolve):
 *   npx ts-node scripts/backfills/2026-08-10-crypto-news-ads-media-library-backfill.ts --dry-run
 *   npx ts-node scripts/backfills/2026-08-10-crypto-news-ads-media-library-backfill.ts --validate
 *   npx ts-node scripts/backfills/2026-08-10-crypto-news-ads-media-library-backfill.ts --estimate-cost
 *   npx ts-node scripts/backfills/2026-08-10-crypto-news-ads-media-library-backfill.ts --apply
 *
 * Environment:
 *   DATABASE_ENABLED must be 'true' (otherwise skip with a warning).
 *   POSTGRES_HOST/PORT/USER/PASSWORD/DB — defaults `localhost:5432` /
 *     `alpha_meta_token_scanner` / `alpha_meta_token_scanner` /
 *     `alpha_meta_token_scanner` (same defaults as scripts/backfills/migrate.ts).
 *   UPLOADS_ROOT (default `'./uploads'`, resolved from the backend cwd) — the
 *     same source as `LocalAdMediaStorageAdapter` via `app.config.ts`
 *     (uploadsRoot). Source `file_path` values are relative to this root.
 *
 * Verification:
 *   SELECT count(*) FROM crypto_news_ad_media_library;
 *   SELECT file_path, content_hash FROM crypto_news_ad_media_library;
 *
 * Rollback:
 *   DELETE FROM crypto_news_ad_media_library;   -- rows only. Copied canonical
 *   files under <UPLOADS_ROOT>/crypto-news-ads-library/ can be removed by hand;
 *   `crypto_news_ad_media` rows/files are never touched either way.
 */
import { Client } from 'pg';
import * as crypto from 'node:crypto';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';

dotenv.config({ path: '.env' });

const MODE = (
  process.argv.find((a) => a.startsWith('--')) ?? '--dry-run'
).slice(2);

/** In-script MIME → extension map for computating the canonical library path. */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const DEFAULT_EXT = '.bin';
const LIBRARY_REL_DIR = 'crypto-news-ads-library';
const SAMPLE_LIMIT = 5;

interface MediaRow {
  id: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
}

interface ExistingHashRow {
  content_hash: string;
}

type RowPlan =
  | { kind: 'missing'; id: string }
  | { kind: 'dup'; id: string; hash: string }
  | {
      kind: 'insert';
      id: string;
      hash: string;
      sourceAbs: string;
      canonicalRel: string;
      mimeType: string | null;
      fileSize: number | null;
    };

function extForMime(mimeType: string | null): string {
  return MIME_TO_EXT[mimeType ?? ''] ?? DEFAULT_EXT;
}

function sha256File(absPath: string): string {
  const buf = fs.readFileSync(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
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

  // Match `app.config.ts` uploadsRoot exactly: `'./uploads'` resolved relative
  // to the backend cwd unless UPLOADS_ROOT is set.
  const uploadsRoot = path.resolve(process.env.UPLOADS_ROOT ?? './uploads');
  const libraryDir = path.join(uploadsRoot, LIBRARY_REL_DIR);

  const mediaResult = await client.query<MediaRow>(`
    SELECT id, file_path, mime_type, file_size
    FROM crypto_news_ad_media
  `);
  const rows = mediaResult.rows;

  const hashResult = await client.query<ExistingHashRow>(
    'SELECT content_hash FROM crypto_news_ad_media_library',
  );
  const existingHashes = new Set<string>(
    hashResult.rows.map((r) => r.content_hash),
  );

  const plans: RowPlan[] = [];
  let missingFiles = 0;

  for (const row of rows) {
    const sourceAbs = path.join(uploadsRoot, row.file_path);
    let hash: string;
    try {
      hash = sha256File(sourceAbs);
    } catch {
      console.warn(
        `[backfill] missing source file for ${row.id}: ${sourceAbs} — skipping row.`,
      );
      missingFiles++;
      continue;
    }
    if (existingHashes.has(hash)) {
      plans.push({ kind: 'dup', id: row.id, hash });
      continue;
    }
    const canonicalRel = `${LIBRARY_REL_DIR}/${hash}${extForMime(row.mime_type)}`;
    plans.push({
      kind: 'insert',
      id: row.id,
      hash,
      sourceAbs,
      canonicalRel,
      mimeType: row.mime_type,
      fileSize: row.file_size,
    });
    existingHashes.add(hash);
  }

  const wouldInsert = plans.filter((p) => p.kind === 'insert').length;
  const wouldSkipDuplicate = plans.filter((p) => p.kind === 'dup').length;

  console.log(`[backfill] uploadsRoot: ${uploadsRoot}`);
  console.log(`[backfill] rows read from crypto_news_ad_media: ${rows.length}`);
  console.log(`[backfill] would-insert: ${wouldInsert}`);
  console.log(`[backfill] would-skip-duplicate: ${wouldSkipDuplicate}`);
  console.log(`[backfill] missing files: ${missingFiles}`);
  const sample = plans
    .filter(
      (p): p is Extract<RowPlan, { kind: 'insert' }> => p.kind === 'insert',
    )
    .slice(0, SAMPLE_LIMIT);
  for (const p of sample) {
    console.log(`[backfill]   would insert: ${p.id} → ${p.canonicalRel}`);
  }

  if (MODE === 'dry-run') {
    console.log('[backfill] dry-run mode — no changes applied.');
    await client.end();
    return;
  }

  if (MODE === 'validate') {
    if (wouldInsert === 0) {
      console.log(
        '[backfill] validate: NO backfill needed (0 rows would be inserted).',
      );
      await client.end();
      return;
    }
    console.log(
      `[backfill] validate: backfill IS needed (${wouldInsert} would-insert, ${wouldSkipDuplicate} would-skip-duplicate, ${missingFiles} missing).`,
    );
    await client.end();
    return;
  }

  if (MODE === 'estimate-cost') {
    console.log(
      '[backfill] estimate-cost: 0 external API calls (pure DB INSERT + local fs copy).',
    );
    console.log('[backfill] estimate-cost: $0.00 USD.');
    await client.end();
    return;
  }

  if (MODE === 'apply') {
    console.log(`[backfill] applying to ${wouldInsert} row(s)...`);
    let inserted = 0;
    let skipped = 0;
    let copySkipped = 0;
    await client.query('BEGIN');
    try {
      fs.mkdirSync(libraryDir, { recursive: true });
      for (const plan of plans) {
        if (plan.kind !== 'insert') {
          continue;
        }
        const canonicalAbs = path.join(uploadsRoot, plan.canonicalRel);
        if (fs.existsSync(canonicalAbs)) {
          copySkipped++;
        } else {
          fs.copyFileSync(plan.sourceAbs, canonicalAbs);
        }
        const result = await client.query(
          `INSERT INTO crypto_news_ad_media_library
             (id, file_path, content_hash, original_file_name, mime_type, file_size, created_at)
           VALUES ($1, $2, $3, NULL, $4, $5, now())
           ON CONFLICT (content_hash) DO NOTHING`,
          [plan.id, plan.canonicalRel, plan.hash, plan.mimeType, plan.fileSize],
        );
        if (result.rowCount === 1) {
          inserted++;
        } else {
          skipped++;
        }
        existingHashes.add(plan.hash);
      }
      await client.query('COMMIT');
      console.log('[backfill] ✓ transaction committed.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[backfill] ✗ FAILED:', (err as Error).message);
      await client.end();
      throw err;
    }
    console.log(`[backfill] ✓ inserted: ${inserted}`);
    console.log(
      `[backfill] skipped (duplicate / would-be DO NOTHING): ${skipped + wouldSkipDuplicate}`,
    );
    console.log(
      `[backfill] file-copies skipped (already present): ${copySkipped}`,
    );
    console.log(`[backfill] missing files: ${missingFiles}`);
    await client.end();
    return;
  }

  console.error(
    `[backfill] unknown mode: --${MODE}. Use --dry-run | --validate | --estimate-cost | --apply.`,
  );
  await client.end();
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] fatal:', err);
    process.exit(1);
  });
