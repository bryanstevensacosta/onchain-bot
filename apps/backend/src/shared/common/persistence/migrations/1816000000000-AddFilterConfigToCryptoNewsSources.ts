import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFilterConfigToCryptoNewsSources1816000000000 implements MigrationInterface {
  public name = 'AddFilterConfigToCryptoNewsSources1816000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Add filter_config JSONB column to crypto_news_sources (nullable).
    // IF NOT EXISTS: staging already carries the column from a past
    // synchronize episode while the migration itself was never recorded.
    await qr.query(
      `ALTER TABLE crypto_news_sources ADD COLUMN IF NOT EXISTS filter_config jsonb NULL`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Drop filter_config column
    await qr.query(
      `ALTER TABLE crypto_news_sources DROP COLUMN IF EXISTS filter_config`,
    );
  }
}
