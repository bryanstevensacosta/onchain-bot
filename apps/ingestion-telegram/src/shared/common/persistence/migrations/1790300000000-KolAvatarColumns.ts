import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KOL avatar bookkeeping columns on `telegram_feed_sources`
 * (Tramo 1, todo 13, P19).
 *
 * `avatar_path` (absolute file under `uploads/avatar/`, NULL = placeholder)
 * + `avatar_updated_at`. The FILE is the serving source of truth; these
 * columns are bookkeeping only. Idempotent (`IF NOT EXISTS`) and
 * non-destructive — pre-avatar rows stay valid with NULLs.
 */
export class KolAvatarColumns1790300000000 implements MigrationInterface {
  name = 'KolAvatarColumns1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" ADD COLUMN IF NOT EXISTS "avatar_path" varchar(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" ADD COLUMN IF NOT EXISTS "avatar_updated_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" DROP COLUMN IF EXISTS "avatar_updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "telegram_feed_sources" DROP COLUMN IF EXISTS "avatar_path"`,
    );
  }
}
