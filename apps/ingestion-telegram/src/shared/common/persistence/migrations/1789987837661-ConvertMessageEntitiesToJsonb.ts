import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convert `crypto_news_messages.message_entities` TEXT → JSONB + GIN index.
 *
 * Writers (`MessagePersistenceCoordinator`) only ever persist `NULL` or
 * `JSON.stringify(<entity array>)`, so the `USING` CASE below is total over
 * real data: `NULL`/`''` → `'[]'`, everything else must already be valid
 * JSON (verified with a try-cast sweep before applying — 0 non-JSON rows).
 * The `''` branch exists for legacy/edge rows and keeps the cast from
 * aborting mid-migration.
 *
 * Readers stay backward-compatible during rollout: TypeORM returns `jsonb`
 * as a parsed array but pre-migration TEXT rows come back as strings, so
 * `CryptoNewsController.transformMessageForApi` accepts both shapes.
 */
export class ConvertMessageEntitiesToJsonb1789987837661 implements MigrationInterface {
  name = 'ConvertMessageEntitiesToJsonb1789987837661';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crypto_news_messages" ALTER COLUMN "message_entities" TYPE jsonb USING (CASE WHEN "message_entities" IS NULL OR "message_entities" = '' THEN '[]'::jsonb ELSE "message_entities"::jsonb END)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_messages_entities_gin" ON "crypto_news_messages" USING GIN ("message_entities")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_crypto_news_messages_entities_gin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_messages" ALTER COLUMN "message_entities" TYPE text`,
    );
  }
}
