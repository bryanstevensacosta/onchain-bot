import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdExpiry1810000000000 implements MigrationInterface {
  name = 'AddAdExpiry1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads ADD COLUMN IF NOT EXISTS expiration_action VARCHAR(8) NOT NULL DEFAULT 'disable'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_crypto_news_ads_expires_at ON crypto_news_ads (expires_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_crypto_news_ads_expires_at`,
    );
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS expiration_action`,
    );
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS expires_at`,
    );
  }
}
