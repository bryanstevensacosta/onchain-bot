import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P57 entity-kind bookkeeping columns on `telegram_feed_sources`
 * (central todo 11).
 *
 * `entity_kind` (real MTProto taxonomy at registration) + `is_bot`.
 * Nullable + idempotent (`IF NOT EXISTS`): pre-resolver rows stay valid
 * with NULLs (fail-open), and the subscribe filter only skips explicit
 * `user`/`bot` rows. The full per-id metadata store is the separate
 * P58 `metadata/` track — these columns are the minimal subscribable
 * signal, not that table.
 */
export class EntityKindColumns1790400000000 implements MigrationInterface {
  name = 'EntityKindColumns1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" ADD COLUMN IF NOT EXISTS "entity_kind" varchar(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" ADD COLUMN IF NOT EXISTS "is_bot" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" DROP COLUMN IF EXISTS "is_bot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" DROP COLUMN IF EXISTS "entity_kind"`,
    );
  }
}
