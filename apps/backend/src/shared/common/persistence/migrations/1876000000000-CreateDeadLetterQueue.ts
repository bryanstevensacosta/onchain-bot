import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeadLetterQueue1876000000000 implements MigrationInterface {
  name = 'CreateDeadLetterQueue1876000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "dead_letter_queue" ("id" uuid NOT NULL, "channel_id" character varying(64) NOT NULL, "message_id" integer NOT NULL, "failure_reason" text NOT NULL, "failed_payload" text, "failed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), "retry_count" integer NOT NULL DEFAULT 0, "status" character varying(16) NOT NULL DEFAULT 'PENDING', CONSTRAINT "PK_dead_letter_queue_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dead_letter_queue_status" ON "dead_letter_queue" ("status")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dead_letter_queue_failed_at" ON "dead_letter_queue" ("failed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_dead_letter_queue_failed_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_dead_letter_queue_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "dead_letter_queue"`);
  }
}
