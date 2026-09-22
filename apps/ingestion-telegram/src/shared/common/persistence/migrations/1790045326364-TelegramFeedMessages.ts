import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rename `crypto_news_messages` → `telegram_feed_messages` + `type`
 * discriminator + GIN index recreation.
 *
 * - `ALTER TABLE ... RENAME` preserves rows (NO copy, NO invented data).
 * - `ADD COLUMN type varchar(16) NOT NULL DEFAULT 'crypto-news'` backfills
 *   every renamed row in the same statement; the follow-up `UPDATE` is a
 *   no-op safety net for re-runs where the column already existed nullable.
 * - `message_entities` defensive normalization: the column is `jsonb` since
 *   `ConvertMessageEntitiesToJsonb`, but live writers persist `NULL` when a
 *   message has no entities (`MessagePersistenceCoordinator`), and legacy
 *   TEXT `''` rows abort a blind cast — normalize `NULL` → `'[]'` before
 *   and after the rename window so `@>` probes never see NULLs. `''`
 *   handling at read time lives in `parseMessageEntities`
 *   (`crypto-news.controller.ts`: `''`/unparseable → `[]`, never abort).
 * - GIN: the rename carries the old-named GIN index along on the table, so
 *   `up()` drops it and recreates `idx_telegram_feed_messages_entities_gin`
 *   (same definition, new-table naming). `down()` restores the old-named
 *   GIN on the renamed-back table.
 * - Btree/unique indexes are renamed (not rebuilt) in both directions.
 * - The media FK (`fk_crypto_news_message_media_message`) follows the
 *   rename by OID — untouched here; its re-point is item 4.
 *
 * Dev wart (recorded, NOT fixed via metadata — TypeORM 0.3.30 cannot
 * express `using:gin`): dev `synchronize:true` boots destroy the GIN;
 * staging/prod (`synchronize:false`) keep it. Workaround in dev:
 * `CREATE INDEX IF NOT EXISTS "idx_telegram_feed_messages_entities_gin"
 *  ON "telegram_feed_messages" USING GIN ("message_entities")` after boot.
 */
export class TelegramFeedMessages1790045326364 implements MigrationInterface {
  name = 'TelegramFeedMessages1790045326364';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Normalize legacy/NULL entities BEFORE the rename (never abort).
    await queryRunner.query(
      `UPDATE "crypto_news_messages" SET "message_entities" = '[]'::jsonb WHERE "message_entities" IS NULL`,
    );
    // 1. RENAME preserves rows (no copy).
    await queryRunner.query(
      `ALTER TABLE "crypto_news_messages" RENAME TO "telegram_feed_messages"`,
    );
    // 2. Rename btree/unique indexes to new-table naming.
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "uq_crypto_news_messages_channel_message" RENAME TO "uq_telegram_feed_messages_channel_message"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_crypto_news_messages_channel_id" RENAME TO "idx_telegram_feed_messages_channel_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_crypto_news_messages_ingested_at" RENAME TO "idx_telegram_feed_messages_ingested_at"`,
    );
    // 3. Recreate the GIN index under the new-table name.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_crypto_news_messages_entities_gin"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_telegram_feed_messages_entities_gin" ON "telegram_feed_messages" USING GIN ("message_entities")`,
    );
    // 4. ADD COLUMN type + backfill (DEFAULT fills existing rows inline).
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_messages" ADD COLUMN IF NOT EXISTS "type" character varying(16) NOT NULL DEFAULT 'crypto-news'`,
    );
    await queryRunner.query(
      `UPDATE "telegram_feed_messages" SET "type" = 'crypto-news' WHERE "type" IS NULL`,
    );
    // 5. Normalize NULL entities that live writers inserted during the window.
    await queryRunner.query(
      `UPDATE "telegram_feed_messages" SET "message_entities" = '[]'::jsonb WHERE "message_entities" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_telegram_feed_messages_entities_gin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_messages" DROP COLUMN IF EXISTS "type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_messages" RENAME TO "crypto_news_messages"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "uq_telegram_feed_messages_channel_message" RENAME TO "uq_crypto_news_messages_channel_message"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_telegram_feed_messages_channel_id" RENAME TO "idx_crypto_news_messages_channel_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "idx_telegram_feed_messages_ingested_at" RENAME TO "idx_crypto_news_messages_ingested_at"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_crypto_news_messages_entities_gin" ON "crypto_news_messages" USING GIN ("message_entities")`,
    );
  }
}
