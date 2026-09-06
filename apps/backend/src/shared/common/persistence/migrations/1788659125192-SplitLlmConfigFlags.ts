import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitLlmConfigFlags1788659125192 implements MigrationInterface {
  name = 'SplitLlmConfigFlags1788659125192';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create new MatchingConfig table
    await queryRunner.query(
      `CREATE TABLE "crypto_news_matching_config" ("id" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0e6e9ef0ce229d6633dd8002f6a" PRIMARY KEY ("id"))`,
    );

    // 2. Seed MatchingConfig with id=1, enabled=false
    await queryRunner.query(
      `INSERT INTO "crypto_news_matching_config" ("id", "enabled", "updatedAt") VALUES (1, false, NOW())`,
    );

    // 3. Add new columns to LlmConfig (before dropping old column)
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD "matching_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD "llm_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD "publishing_enabled" boolean NOT NULL DEFAULT false`,
    );

    // 4. Migrate existing enabled value to all 3 new columns
    await queryRunner.query(
      `UPDATE "crypto_news_publisher_llm_config" SET "matching_enabled" = "enabled", "llm_enabled" = "enabled", "publishing_enabled" = "enabled"`,
    );

    // 5. Drop old enabled column
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" DROP COLUMN "enabled"`,
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
