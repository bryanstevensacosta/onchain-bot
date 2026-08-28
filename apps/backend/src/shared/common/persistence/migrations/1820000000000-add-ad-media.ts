import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdMedia1820000000000 implements MigrationInterface {
  name = 'AddAdMedia1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_ad_media (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ad_id uuid NOT NULL, file_path text NOT NULL, mime_type varchar(64) NULL, file_size integer NULL, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT fk_crypto_news_ad_media_ad FOREIGN KEY (ad_id) REFERENCES crypto_news_ads (id) ON DELETE CASCADE)`,
    );
    // Ensure unique constraint on ad_id exists (for ON CONFLICT) - PostgreSQL doesn't support IF NOT EXISTS for ADD CONSTRAINT
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_crypto_news_ad_media_ad_id') THEN ALTER TABLE crypto_news_ad_media ADD CONSTRAINT uq_crypto_news_ad_media_ad_id UNIQUE (ad_id); END IF; END $$`,
    );
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads ADD COLUMN IF NOT EXISTS image_media_id uuid`,
    );
    await queryRunner.query(
      `INSERT INTO crypto_news_ad_media (ad_id, file_path, created_at) SELECT id, image_path, now() FROM crypto_news_ads WHERE image_path IS NOT NULL AND image_path <> '' ON CONFLICT (ad_id) DO NOTHING`,
    );
    await queryRunner.query(
      `UPDATE crypto_news_ads a SET image_media_id = m.id FROM crypto_news_ad_media m WHERE m.ad_id = a.id AND a.image_media_id IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS image_path`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads ADD COLUMN IF NOT EXISTS image_path VARCHAR(512) NULL`,
    );
    await queryRunner.query(
      `UPDATE crypto_news_ads a SET image_path = m.file_path FROM crypto_news_ad_media m WHERE m.ad_id = a.id AND a.image_path IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS image_media_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS crypto_news_ad_media`);
  }
}
