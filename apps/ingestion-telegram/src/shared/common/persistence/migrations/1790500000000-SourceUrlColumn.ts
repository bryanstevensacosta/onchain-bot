import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P57 public t.me link on `telegram_feed_sources` (central todo 12).
 *
 * `url` (`https://t.me/<handle>`, NULL for handle-less channels).
 * Nullable + idempotent (`IF NOT EXISTS`): pre-url rows stay valid with
 * NULLs; the register/batch/PATCH paths backfill it on write and the
 * avatar backfill never touches it. Display-only — the listener
 * subscribes by `channel_id`, never by this URL.
 */
export class SourceUrlColumn1790500000000 implements MigrationInterface {
  name = 'SourceUrlColumn1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" ADD COLUMN IF NOT EXISTS "url" varchar(256)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" DROP COLUMN IF EXISTS "url"`,
    );
  }
}
