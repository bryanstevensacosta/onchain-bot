import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQueuedAtToPublisherQueue1860000000000 implements MigrationInterface {
  name = 'AddQueuedAtToPublisherQueue1860000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add queued_at column with DEFAULT NOW()
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_queue" ADD "queued_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()`,
    );

    // 2. Backfill existing rows: set queued_at = message_received_at (best approximation)
    await queryRunner.query(
      `UPDATE "crypto_news_publisher_queue" SET "queued_at" = "message_received_at" WHERE "queued_at" IS NULL`,
    );

    // 3. Create composite index for TTL expiration query (status = PENDING, ordered by queued_at)
    await queryRunner.query(
      `CREATE INDEX "idx_publisher_queue_status_queued_at" ON "crypto_news_publisher_queue" ("status", "queued_at") WHERE status = 'PENDING'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop index
    await queryRunner.query(
      `DROP INDEX "idx_publisher_queue_status_queued_at"`,
    );

    // 2. Drop queued_at column
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_queue" DROP COLUMN "queued_at"`,
    );
  }
}
