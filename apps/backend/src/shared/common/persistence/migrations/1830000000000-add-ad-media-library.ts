import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdMediaLibrary1830000000000 implements MigrationInterface {
  name = 'AddAdMediaLibrary1830000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_ad_media_library (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_path text NOT NULL UNIQUE, content_hash varchar(64) NOT NULL UNIQUE, original_file_name varchar(512) NULL, mime_type varchar(64) NULL, file_size integer NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS crypto_news_ad_media_library`,
    );
  }
}
