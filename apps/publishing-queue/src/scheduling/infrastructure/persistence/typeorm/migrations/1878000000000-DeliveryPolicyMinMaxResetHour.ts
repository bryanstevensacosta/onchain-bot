import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R-c A4/B11 DDL (`feed_scheduling_config`, single row `id = 1`):
 * canonical per-target `DeliveryPolicy` columns (6 new: delay window +
 * UTC reset hour each).
 *
 * Backfill: `delayMin = delayMax = <legacy scalar>` (conserves
 * exact-time behaviour); `resetHour` keeps its default (`0` UTC — the
 * operator adjusts from `LlmConfig.dailyResetUtcHour` via
 * `MigrateLlmConfigToPoliciesUseCase`, A7). Idempotent (`IF NOT
 * EXISTS` + conditional backfill).
 *
 * FILE ONLY — never run (GAP-1: TypeORM unwired, no data-source;
 * DB state untouched).
 */
export class DeliveryPolicyMinMaxResetHour1878000000000
  implements MigrationInterface
{
  public readonly name = 'DeliveryPolicyMinMaxResetHour1878000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feed_scheduling_config"
        ADD COLUMN IF NOT EXISTS "telegramDelayMinMs" bigint NOT NULL DEFAULT 60000,
        ADD COLUMN IF NOT EXISTS "telegramDelayMaxMs" bigint NOT NULL DEFAULT 60000,
        ADD COLUMN IF NOT EXISTS "telegramResetHour" int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "threadsDelayMinMs" bigint NOT NULL DEFAULT 60000,
        ADD COLUMN IF NOT EXISTS "threadsDelayMaxMs" bigint NOT NULL DEFAULT 60000,
        ADD COLUMN IF NOT EXISTS "threadsResetHour" int NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "feed_scheduling_config"
      SET
        "telegramDelayMinMs" = "telegramPublishDelayMs",
        "telegramDelayMaxMs" = "telegramPublishDelayMs",
        "threadsDelayMinMs" = "threadsPublishDelayMs",
        "threadsDelayMaxMs" = "threadsPublishDelayMs"
      WHERE "id" = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "feed_scheduling_config"
        DROP COLUMN IF EXISTS "telegramDelayMinMs",
        DROP COLUMN IF EXISTS "telegramDelayMaxMs",
        DROP COLUMN IF EXISTS "telegramResetHour",
        DROP COLUMN IF EXISTS "threadsDelayMinMs",
        DROP COLUMN IF EXISTS "threadsDelayMaxMs",
        DROP COLUMN IF EXISTS "threadsResetHour"
    `);
  }
}
