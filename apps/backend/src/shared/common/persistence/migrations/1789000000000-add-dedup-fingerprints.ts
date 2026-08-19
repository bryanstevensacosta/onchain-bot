import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDedupFingerprints1789000000000 implements MigrationInterface {
  name = 'AddDedupFingerprints1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS dedup_fingerprints (
        id UUID NOT NULL,
        fingerprint_type VARCHAR(16) NOT NULL,
        fingerprint_value VARCHAR(512) NOT NULL,
        source VARCHAR(64) NOT NULL,
        channel_id VARCHAR(64) NOT NULL,
        message_id INTEGER NOT NULL,
        urls_hashes TEXT NULL,
        tokens TEXT NULL,
        numbers TEXT NULL,
        entities TEXT NULL,
        cashtags TEXT NULL,
        embedding TEXT NULL,
        referenced_entry_id VARCHAR(255) NULL,
        referenced_channel_id VARCHAR(64) NULL,
        referenced_message_id INTEGER NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dedup_fingerprints_source_created
        ON dedup_fingerprints (source, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dedup_fingerprints_source_type
        ON dedup_fingerprints (source, fingerprint_type)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_dedup_fingerprints_type_value_source
        ON dedup_fingerprints (fingerprint_type, fingerprint_value, source)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_dedup_fingerprints_type_value_source`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_dedup_fingerprints_source_type`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_dedup_fingerprints_source_created`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS dedup_fingerprints`);
  }
}
