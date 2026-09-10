import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitLlmConfigFlags1788659125192 implements MigrationInterface {
  name = 'SplitLlmConfigFlags1788659125192';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotency guards (IF NOT EXISTS / ON CONFLICT / column check):
    // environments that carried these objects via synchronize episodes
    // never recorded this migration, so a plain re-run would abort on
    // duplicate table/column. The guards make re-running a no-op there
    // while fresh databases take the full path.
    // 1. Create new MatchingConfig table
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "crypto_news_matching_config" ("id" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0e6e9ef0ce229d6633dd8002f6a" PRIMARY KEY ("id"))`,
    );

    // 2. Seed MatchingConfig with id=1, enabled=false
    await queryRunner.query(
      `INSERT INTO "crypto_news_matching_config" ("id", "enabled", "updatedAt") VALUES (1, false, NOW()) ON CONFLICT ("id") DO NOTHING`,
    );

    // 3. Add new columns to LlmConfig (before dropping old column)
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD COLUMN IF NOT EXISTS "matching_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD COLUMN IF NOT EXISTS "llm_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD COLUMN IF NOT EXISTS "publishing_enabled" boolean NOT NULL DEFAULT false`,
    );

    // 4. Migrate existing enabled value to all 3 new columns (only when
    // the legacy column still exists — synchronize-era DBs already dropped it)
    const legacyCol: Array<unknown> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'crypto_news_publisher_llm_config' AND column_name = 'enabled'`,
    );
    if (legacyCol.length > 0) {
      await queryRunner.query(
        `UPDATE "crypto_news_publisher_llm_config" SET "matching_enabled" = "enabled", "llm_enabled" = "enabled", "publishing_enabled" = "enabled"`,
      );
    }

    // 5. Drop old enabled column
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" DROP COLUMN IF EXISTS "enabled"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Add back old enabled column
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD "enabled" boolean NOT NULL DEFAULT false`,
    );

    // 2. Migrate: if ANY of the 3 flags is true, set enabled=true (conservative rollback)
    await queryRunner.query(
      `UPDATE "crypto_news_publisher_llm_config" SET "enabled" = ("matching_enabled" OR "llm_enabled" OR "publishing_enabled")`,
    );

    // 3. Drop new columns
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" DROP COLUMN "publishing_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" DROP COLUMN "llm_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" DROP COLUMN "matching_enabled"`,
    );

    // 4. Drop MatchingConfig table
    await queryRunner.query(`DROP TABLE "crypto_news_matching_config"`);
  }
}
