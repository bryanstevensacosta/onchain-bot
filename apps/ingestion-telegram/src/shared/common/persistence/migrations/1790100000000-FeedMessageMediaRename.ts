import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename `crypto_news_message_media` → `telegram_feed_message_media` +
 * on-disk prefix rewrite `crypto-news/media` → `feed/media` in `file_path`.
 *
 * - `ALTER TABLE ... RENAME` preserves rows (NO copy, NO invented data).
 *   The media FK follows the messages rename (item 3, OID-based) untouched;
 *   only the FK *constraint name* and the message_id *index name* are
 *   renamed here for naming consistency.
 * - `file_path` rewrite is SEGMENT-based (host-independent): it swaps only
 *   the `crypto-news/media` segment, so it works regardless of the absolute
 *   `UPLOADS_ROOT` of the writer host vs the migration host. Backslashes
 *   are normalized to `/` first (Windows-authored rows), and ONLY rows
 *   whose normalized path contains the old segment are rewritten — every
 *   other row (empty string, already-new `feed/media`, foreign layouts) is
 *   left byte-identical and reported as no-match (see remediation note).
 * - Serving is glob-based (`{messageId}_{index}.*` under the channel dir)
 *   and never reads `file_path`; the janitor is the only `file_path`
 *   reader (unlink + orphan sweep), hence the rewrite.
 *
 * No-match remediation (rows the UPDATE leaves behind):
 *   1. `SELECT id, file_path FROM telegram_feed_message_media WHERE
 *      REPLACE(file_path, '\', '/') NOT LIKE '%feed/media/%';` — inspect
 *      each row: empty-string rows are benign (glob serves them).
 *   2. If a row points at the OLD on-disk layout, either re-run the
 *      idempotent disk move (`crypto-news/media/*` → `feed/media/*`) or
 *      rewrite the row manually to the new prefix.
 *   3. Orphan scan BOTH directions after the move:
 *      rows-without-files (`SELECT file_path ...` vs `find
 *      <ROOT>/feed/media -type f`) AND files-without-rows (janitor
 *      `cleanupOrphanFiles` covers the latter once item 10 re-points it).
 *   4. NEVER delete files that fail to move — report + remediate.
 */
export class FeedMessageMediaRename1790100000000 implements MigrationInterface {
  name = 'FeedMessageMediaRename1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. RENAME preserves rows (no copy).
    await queryRunner.query(
      `ALTER TABLE "crypto_news_message_media" RENAME TO "telegram_feed_message_media"`,
    );
    // 2. Rename the FK constraint + message_id index to new-table naming.
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_message_media" RENAME CONSTRAINT "fk_crypto_news_message_media_message" TO "fk_telegram_feed_message_media_message"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_crypto_news_message_media_message_id" RENAME TO "idx_telegram_feed_message_media_message_id"`,
    );
    // 3. Prefix rewrite: ONLY rows matching the old segment (normalized).
    await queryRunner.query(
      `UPDATE "telegram_feed_message_media" SET "file_path" = ` +
        `REPLACE(REPLACE("file_path", '\\', '/'), 'crypto-news/media', 'feed/media') ` +
        `WHERE REPLACE("file_path", '\\', '/') LIKE '%crypto-news/media/%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the prefix rewrite (same match-only semantics).
    await queryRunner.query(
      `UPDATE "telegram_feed_message_media" SET "file_path" = ` +
        `REPLACE(REPLACE("file_path", '\\', '/'), 'feed/media', 'crypto-news/media') ` +
        `WHERE REPLACE("file_path", '\\', '/') LIKE '%feed/media/%'`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_telegram_feed_message_media_message_id" RENAME TO "idx_crypto_news_message_media_message_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_message_media" RENAME CONSTRAINT "fk_telegram_feed_message_media_message" TO "fk_crypto_news_message_media_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_message_media" RENAME TO "crypto_news_message_media"`,
    );
  }
}
