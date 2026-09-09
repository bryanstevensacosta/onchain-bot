import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFormattingEntitiesToPublisherQueue1870000000000 implements MigrationInterface {
  name = 'AddFormattingEntitiesToPublisherQueue1870000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The formatting_entities column exists on the entity (and in dev via
    // synchronize) but was never captured in a migration: staging/prod
    // tables lack it, so every queue SELECT fails. IF NOT EXISTS keeps
    // this safe on databases that already have the column.
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_queue" ADD COLUMN IF NOT EXISTS "formatting_entities" text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "crypto_news_publisher_queue" DROP COLUMN IF EXISTS "formatting_entities"`,
    );
  }
}
