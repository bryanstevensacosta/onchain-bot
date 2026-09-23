import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the unified `telegram_feed_sources` catalog and clone the live
 * `crypto_news_sources` rows into it as `type = 'crypto-news'`.
 *
 * - Table is created with `IF NOT EXISTS` (dev boots run `synchronize:true`,
 *   so the table may already exist there — the INSERT is the source of
 *   truth for data, the DDL for schema).
 * - The clone uses an explicit column list (never `SELECT *`); rows that
 *   already exist in the target (re-run / dev synchronize overlap) are
 *   skipped via `ON CONFLICT (channel_id) DO NOTHING` — the migration is
 *   idempotent.
 * - `last_ingested_at` is left NULL: it comes from backend `kols` and is
 *   backfilled in plan item 6.
 * - `crypto_news_sources` is NOT touched otherwise — it stays live until
 *   plan item 5.
 */
export class CreateTelegramFeedSources1790000000000
  implements MigrationInterface
{
  name = 'CreateTelegramFeedSources1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "telegram_feed_sources" ("channel_id" character varying(64) NOT NULL, "handle" character varying(64), "title" character varying(256) NOT NULL, "type" character varying(16) NOT NULL, "is_active" boolean NOT NULL DEFAULT false, "lifecycle_status" character varying(16) NOT NULL DEFAULT 'ACTIVE', "last_ingested_at" TIMESTAMP WITH TIME ZONE, "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_telegram_feed_sources_channel_id" PRIMARY KEY ("channel_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_telegram_feed_sources_lifecycle_status" ON "telegram_feed_sources" ("lifecycle_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_telegram_feed_sources_type" ON "telegram_feed_sources" ("type")`,
    );
    await queryRunner.query(
      `INSERT INTO "telegram_feed_sources" ("channel_id", "handle", "title", "type", "is_active", "lifecycle_status", "added_at", "updated_at") SELECT "channel_id", "handle", "title", 'crypto-news', "is_active", "lifecycle_status", "added_at", "updated_at" FROM "crypto_news_sources" ON CONFLICT ("channel_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_feed_sources"`);
  }
}
