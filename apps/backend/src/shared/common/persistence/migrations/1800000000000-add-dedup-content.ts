import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDedupContent1800000000000 implements MigrationInterface {
  name = 'AddDedupContent1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dedup_fingerprints ADD COLUMN IF NOT EXISTS content TEXT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dedup_fingerprints DROP COLUMN IF EXISTS content`,
    );
  }
}
