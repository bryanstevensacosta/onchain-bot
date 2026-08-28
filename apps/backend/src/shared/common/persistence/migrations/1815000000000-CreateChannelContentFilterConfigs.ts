import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChannelContentFilterConfigs1815000000000 implements MigrationInterface {
  public name = 'CreateChannelContentFilterConfigs1815000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Create channel_content_filter_configs table
    await qr.query(
      `CREATE TABLE channel_content_filter_configs (` +
        `id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `channel_id varchar(64) NOT NULL, ` +
        `pattern varchar(512) NOT NULL, ` +
        `replacement varchar(512) NOT NULL DEFAULT '', ` +
        `flags varchar(8) NOT NULL DEFAULT 'gi', ` +
        `is_active boolean NOT NULL DEFAULT true, ` +
        `priority integer NOT NULL DEFAULT 0, ` +
        `created_at timestamptz NOT NULL DEFAULT now(), ` +
        `updated_at timestamptz NOT NULL DEFAULT now() ` +
        `)`,
    );

    // Add FK to crypto_news_sources with CASCADE delete
    await qr.query(
      `ALTER TABLE channel_content_filter_configs ` +
        `ADD CONSTRAINT fk_channel_content_filter_configs_channel_id ` +
        `FOREIGN KEY (channel_id) REFERENCES crypto_news_sources(channel_id) ON DELETE CASCADE`,
    );

    // Add index for ordering
    await qr.query(
      `CREATE INDEX idx_channel_content_filter_configs_ordering ` +
        `ON channel_content_filter_configs (channel_id, priority, created_at)`,
    );

    // Add check constraint on flags: only valid regex flags
    await qr.query(
      `ALTER TABLE channel_content_filter_configs ` +
        `ADD CONSTRAINT chk_channel_content_filter_configs_flags_valid ` +
        `CHECK (flags ~ '^[gimsuy]+$')`,
    );

    // Add unique constraint on (channel_id, priority, created_at)
    await qr.query(
      `ALTER TABLE channel_content_filter_configs ` +
        `ADD CONSTRAINT uq_channel_content_filter_configs_channel_priority_created ` +
        `UNIQUE (channel_id, priority, created_at)`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Drop constraints first
    await qr.query(
      `ALTER TABLE channel_content_filter_configs ` +
        `DROP CONSTRAINT IF EXISTS uq_channel_content_filter_configs_channel_priority_created`,
    );
    await qr.query(
      `ALTER TABLE channel_content_filter_configs ` +
        `DROP CONSTRAINT IF EXISTS chk_channel_content_filter_configs_flags_valid`,
    );
    await qr.query(
      `ALTER TABLE channel_content_filter_configs ` +
        `DROP CONSTRAINT IF EXISTS fk_channel_content_filter_configs_channel_id`,
    );

    // Drop index
    await qr.query(
      `DROP INDEX IF EXISTS idx_channel_content_filter_configs_ordering`,
    );

    // Drop table
    await qr.query(`DROP TABLE IF EXISTS channel_content_filter_configs`);
  }
}
