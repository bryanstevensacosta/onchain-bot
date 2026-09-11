import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill crypto_news_matching_config.enabled from the deprecated
 * crypto_news_publisher_llm_config.matching_enabled.
 *
 * Fixes the prod divergence where the UI wrote llm_config.matching_enabled
 * (via PATCH /crypto-news-publisher/llm/config) while the scheduler
 * (EnqueueMatchingCronScheduler.tick) and the SSE handler
 * (ProcessCryptoNewsMessageHandler.handle) read ONLY
 * crypto_news_matching_config id=1 — prod showed llm=t vs matching=f
 * with the UI lying ON.
 *
 * - up(): ensure the matching row exists (fail-closed false on fresh DB),
 *   then set enabled=true where llm_config.matching_enabled=true.
 *   Idempotent: re-running is a no-op once backfilled. Guards handle
 *   synchronize-era DBs where the llm column may already be gone.
 * - down(): reset matching_config id=1 to false (revert the backfill).
 */
export class BackfillMatchingConfigFromLlm1875000000000 implements MigrationInterface {
  name = 'BackfillMatchingConfigFromLlm1875000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "crypto_news_matching_config" ("id" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0e6e9ef0ce229d6633dd8002f6a" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `INSERT INTO "crypto_news_matching_config" ("id", "enabled", "updatedAt") VALUES (1, false, NOW()) ON CONFLICT ("id") DO NOTHING`,
    );

    const llmCol: Array<unknown> = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'crypto_news_publisher_llm_config' AND column_name = 'matching_enabled'`,
    );
    if (llmCol.length > 0) {
      await queryRunner.query(
        `UPDATE "crypto_news_matching_config" SET "enabled" = true, "updatedAt" = NOW() WHERE "id" = 1 AND EXISTS (SELECT 1 FROM "crypto_news_publisher_llm_config" WHERE "id" = 1 AND "matching_enabled" = true)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "crypto_news_matching_config" SET "enabled" = false, "updatedAt" = NOW() WHERE "id" = 1`,
    );
  }
}
