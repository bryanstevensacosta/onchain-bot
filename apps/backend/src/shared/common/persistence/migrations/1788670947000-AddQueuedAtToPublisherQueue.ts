import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQueuedAtToPublisherQueue1860000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add column as nullable
    await queryRunner.addColumn(
      'crypto_news_publisher_queue',
      new TableColumn({
        name: 'queued_at',
        type: 'timestamptz',
        isNullable: true,
      }),
    );

    // Step 2: Backfill existing rows with current timestamp
    await queryRunner.query(`
      UPDATE crypto_news_publisher_queue
      SET queued_at = NOW()
      WHERE queued_at IS NULL
    `);

    // Step 3: Make column NOT NULL
    await queryRunner.query(`
      ALTER TABLE crypto_news_publisher_queue
      ALTER COLUMN queued_at SET NOT NULL
    `);

    // Step 4: Set DEFAULT for future inserts
    await queryRunner.query(`
      ALTER TABLE crypto_news_publisher_queue
      ALTER COLUMN queued_at SET DEFAULT NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('crypto_news_publisher_queue', 'queued_at');
  }
}
