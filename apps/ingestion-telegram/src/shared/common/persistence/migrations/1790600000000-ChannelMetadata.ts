import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P58 central metadata table (dual-write step 1, schema §4).
 *
 * Creates `telegram_channel_metadata` (ONE row per Telegram id: the full
 * `getEntity` taxonomy kind/handle/phone-if-present/photo/url/type per
 * `.omo/evidence/mtproto-metadata-schema.md` §2 + the fine `kind`
 * taxonomy). `telegram_feed_sources` keeps serving during dual-write;
 * its identity columns go read-dead only after staging is green (§4).
 *
 * PRIVACY: `phone` has no index and no lookup path (write-only at rest).
 */
export class ChannelMetadata1790600000000 implements MigrationInterface {
  public readonly name = 'ChannelMetadata1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "telegram_channel_metadata" (` +
        `"channel_id" character varying(64) NOT NULL, ` +
        `"peer_type" character varying(16), ` +
        `"kind" character varying(16), ` +
        `"title" character varying(256) NOT NULL, ` +
        `"first_name" character varying(128), ` +
        `"last_name" character varying(128), ` +
        `"handle" character varying(64), ` +
        `"usernames" jsonb, ` +
        `"about" text, ` +
        `"is_bot" boolean NOT NULL DEFAULT false, ` +
        `"verified" boolean NOT NULL DEFAULT false, ` +
        `"is_scam" boolean NOT NULL DEFAULT false, ` +
        `"is_fake" boolean NOT NULL DEFAULT false, ` +
        `"participants_count" integer, ` +
        `"phone" character varying(32), ` +
        `"avatar_path" character varying(512), ` +
        `"avatar_updated_at" TIMESTAMP WITH TIME ZONE, ` +
        `"photo_dc_id" integer, ` +
        `"photo_file_ref" character varying(512), ` +
        `"fetch_status" character varying(16) NOT NULL DEFAULT 'miss', ` +
        `"fetched_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_telegram_channel_metadata_channel_id" PRIMARY KEY ("channel_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_channel_metadata"`);
  }
}
