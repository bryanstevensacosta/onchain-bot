import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the deprecated `crypto_news_publisher_llm_config.matching_enabled`
 * column (T12 of `.omo/plans/deprecados-deuda-tecnica.md`).
 *
 * Preconditions (T11 gate, owner approved 2026-09-20):
 * - `1875000000000-BackfillMatchingConfigFromLlm` ran first, copying
 *   `matching_enabled=true` into `crypto_news_matching_config.enabled`
 *   (single source of truth, id=1). This migration is timestamped AFTER
 *   it (1875000000002 > 1875000000000) so ordering is guaranteed.
 * - Full DB backup at /tmp/pre-deploy-20260920_044744.dump.gz.
 *
 * - up(): DROP COLUMN IF EXISTS (idempotent; safe on synchronize-era
 *   DBs where the column may already be gone).
 * - down(): re-ADD the column (IF NOT EXISTS, default false). Note this
 *   restores the SHAPE only — backfilled `true` values are NOT restored
 *   (matching truth lives in `crypto_news_matching_config` since 1875).
 */
export class DropLlmConfigMatchingEnabled1875000000002 implements MigrationInterface {
  name = 'DropLlmConfigMatchingEnabled1875000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" DROP COLUMN IF EXISTS "matching_enabled"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_llm_config" ADD COLUMN IF NOT EXISTS "matching_enabled" boolean NOT NULL DEFAULT false`,
    );
  }
}
