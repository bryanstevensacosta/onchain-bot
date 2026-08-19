import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the 5 crypto-news ads / slot-state tables that were previously
 * created only by TypeORM `synchronize: true` at boot.
 *
 * Prod deploy failure 42P01 (`relation "crypto_news_ads" does not exist`):
 * no migration created these tables, so `1810000000000-add-ad-expiry`
 * (ALTER TABLE crypto_news_ads) and `1820000000000-add-ad-media`
 * (REFERENCES crypto_news_ads) failed in one transaction. This migration
 * (timestamp between 1800000000000 and 1810000000000) creates them first,
 * idempotently, so the rest of the pending batch passes.
 *
 * DDL replicates the entity shapes EXACTLY (names/types/defaults) so a later
 * `synchronize: true` boot does not alter the schema:
 *   - ad.entity.ts                          -> crypto_news_ads
 *   - ads-throttle-state.entity.ts          -> crypto_news_ads_throttle_state
 *   - ad-rotation-config.entity.ts          -> crypto_news_ad_rotation_config
 *   - ad-rotation-state.entity.ts           -> crypto_news_ad_rotation_state
 *   - publisher-slot-state.entity.ts        -> crypto_news_publisher_slot_state
 */
export class CreateCryptoNewsAdsTables1805000000000 implements MigrationInterface {
  name = 'CreateCryptoNewsAdsTables1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_ads (` +
        `id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ` +
        `name varchar(128) NOT NULL, ` +
        `body text NOT NULL, ` +
        `image_media_id uuid NULL, ` +
        `enabled boolean NOT NULL DEFAULT true, ` +
        `"order" integer NOT NULL DEFAULT 0, ` +
        `times_published integer NOT NULL DEFAULT 0, ` +
        `consecutive_failures integer NOT NULL DEFAULT 0, ` +
        `last_published_at timestamptz NULL, ` +
        `expires_at timestamptz NULL, ` +
        `expiration_action varchar(8) NOT NULL DEFAULT 'disable', ` +
        `format varchar(16) NOT NULL DEFAULT 'text', ` +
        `video_media_id varchar(255) NULL, ` +
        `album_media_ids jsonb NULL, ` +
        `buttons jsonb NULL, ` +
        `created_at timestamptz NOT NULL DEFAULT now(), ` +
        `updated_at timestamptz NOT NULL DEFAULT now(), ` +
        `CONSTRAINT uq_crypto_news_ads_name UNIQUE (name)` +
        `)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_crypto_news_ads_enabled_order ON crypto_news_ads (enabled, "order")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_crypto_news_ads_expires_at ON crypto_news_ads (expires_at)`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_ads_throttle_state (` +
        `id integer PRIMARY KEY, ` +
        `last_publish_at timestamptz NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_ad_rotation_config (` +
        `id integer PRIMARY KEY, ` +
        `enabled boolean NOT NULL DEFAULT false, ` +
        `every_n_posts integer NOT NULL DEFAULT 4, ` +
        `min_minutes_between_ads integer NOT NULL DEFAULT 30, ` +
        `created_at timestamptz NOT NULL DEFAULT now(), ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_ad_rotation_state (` +
        `id integer PRIMARY KEY, ` +
        `posts_since_last_ad integer NOT NULL DEFAULT 0, ` +
        `last_ad_id uuid NULL, ` +
        `last_ad_published_at timestamptz NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_slot_state (` +
        `id integer PRIMARY KEY, ` +
        `last_scope varchar(16) NULL, ` +
        `CONSTRAINT ck_slot_state_last_scope CHECK (last_scope IN ('news', 'ads')), ` +
        `last_publish_at timestamptz NULL, ` +
        `min_seconds_between_slots integer NOT NULL DEFAULT 60, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS crypto_news_publisher_slot_state`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS crypto_news_ad_rotation_state`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS crypto_news_ad_rotation_config`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS crypto_news_ads_throttle_state`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS crypto_news_ads`);
  }
}
