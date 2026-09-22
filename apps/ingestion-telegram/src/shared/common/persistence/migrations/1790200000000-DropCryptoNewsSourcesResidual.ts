import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the residual `crypto_news_sources` table after the feed cutover.
 *
 * Preconditions (feed-unification item 5):
 * - `telegram_feed_sources` already carries every live row (cloned by
 *   `CreateTelegramFeedSources1790000000000` with `type = 'crypto-news'`);
 * - the unified `/api/feed/*` controllers serve reads/writes from the new
 *   table (no code path references `crypto_news_sources` anymore).
 *
 * Safety: the migration ABORTS unless `crypto_news_sources` is empty
 * (`SELECT count(*) == 0`). A synchronize-era leftover FK from the residual
 * `channel_content_filter_configs` artifact
 * (`FK_f4d53649fee70f18bbc88502673` — same name the backend split
 * migration dropped on its side; no ingestion code references that table)
 * is dropped first so the DROP can proceed; filter rows are kept with an
 * opaque `channel_id` (backend owns filter CRUD). The old
 * `crypto_news_messages` / `crypto_news_message_media` names are NOT
 * dropped here — they vanished with the item 3/4 RENAMEs (assert with
 * `SELECT to_regclass('public.crypto_news_messages')`, never DROP).
 */
export class DropCryptoNewsSourcesResidual1790200000000
  implements MigrationInterface
{
  name = 'DropCryptoNewsSourcesResidual1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*) AS count FROM "crypto_news_sources"`,
    );
    const count = Number(rows?.[0]?.count ?? NaN);
    if (!Number.isFinite(count)) {
      throw new Error(
        'DropCryptoNewsSourcesResidual: could not count crypto_news_sources rows — aborting',
      );
    }
    if (count !== 0) {
      throw new Error(
        `DropCryptoNewsSourcesResidual: crypto_news_sources still holds ${count} row(s) — aborting (migrate rows to telegram_feed_sources first)`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "channel_content_filter_configs" DROP CONSTRAINT IF EXISTS "FK_f4d53649fee70f18bbc88502673"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crypto_news_sources"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "crypto_news_sources" ("channel_id" character varying(64) NOT NULL, "handle" character varying(64), "title" character varying(256) NOT NULL, "is_active" boolean NOT NULL DEFAULT false, "lifecycle_status" character varying(16) NOT NULL DEFAULT 'ACTIVE', "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_crypto_news_sources_channel_id" PRIMARY KEY ("channel_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_crypto_news_sources_lifecycle_status" ON "crypto_news_sources" ("lifecycle_status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "channel_content_filter_configs" ADD CONSTRAINT "FK_f4d53649fee70f18bbc88502673" FOREIGN KEY ("channel_id") REFERENCES "crypto_news_sources"("channel_id") ON DELETE CASCADE`,
    );
  }
}
