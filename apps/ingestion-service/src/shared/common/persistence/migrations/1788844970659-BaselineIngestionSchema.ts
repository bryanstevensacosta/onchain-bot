import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineIngestionSchema1788844970659 implements MigrationInterface {
  name = 'BaselineIngestionSchema1788844970659';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "crypto_news_sources" ("channel_id" character varying(64) NOT NULL, "handle" character varying(64), "title" character varying(256) NOT NULL, "is_active" boolean NOT NULL DEFAULT false, "lifecycle_status" character varying(16) NOT NULL DEFAULT 'ACTIVE', "added_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a5452b296d6b0a05472cffa29ed" PRIMARY KEY ("channel_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_sources_lifecycle_status" ON "crypto_news_sources" ("lifecycle_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "crypto_news_message_media" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "message_id" uuid NOT NULL, "media_index" smallint NOT NULL, "type" character varying(16) NOT NULL DEFAULT 'photo', "file_path" text NOT NULL, "mime_type" character varying(64), "file_size" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6ae375e0bd0c76dd167ca595687" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_message_media_message_id" ON "crypto_news_message_media" ("message_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "crypto_news_messages" ("id" uuid NOT NULL, "channel_id" character varying(64) NOT NULL, "message_id" integer NOT NULL, "title" character varying(512), "content" text NOT NULL, "published_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ingested_at" TIMESTAMP WITH TIME ZONE NOT NULL, "link_preview_url" text, "link_preview_title" text, "link_preview_description" text, "link_preview_site_name" character varying(128), "message_entities" text, "grouped_id" character varying(64), CONSTRAINT "PK_1b5fd3363b8fd9c30475af4ffe0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_crypto_news_messages_channel_message" ON "crypto_news_messages" ("channel_id", "message_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_messages_ingested_at" ON "crypto_news_messages" ("ingested_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_messages_channel_id" ON "crypto_news_messages" ("channel_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "channel_content_filter_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" character varying(64) NOT NULL, "pattern" character varying(512) NOT NULL, "replacement" character varying(512) NOT NULL DEFAULT '', "flags" character varying(8) NOT NULL DEFAULT 'gi', "is_active" boolean NOT NULL DEFAULT true, "priority" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6314152ab3f82227e72f42a95ba" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_channel_content_filter_configs_ordering" ON "channel_content_filter_configs" ("channel_id", "priority", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "backfill_messages" ("event_id" character varying(36) NOT NULL, "timestamp" bigint NOT NULL, "channel_id" character varying(64) NOT NULL, "message_id" integer NOT NULL, "payload" text NOT NULL, CONSTRAINT "PK_3549a20b13ac841a428377cb4b0" PRIMARY KEY ("event_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_timestamp" ON "backfill_messages" ("timestamp") `,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_message_media" ADD CONSTRAINT "fk_crypto_news_message_media_message" FOREIGN KEY ("message_id") REFERENCES "crypto_news_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "channel_content_filter_configs" ADD CONSTRAINT "FK_f4d53649fee70f18bbc88502673" FOREIGN KEY ("channel_id") REFERENCES "crypto_news_sources"("channel_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "channel_content_filter_configs" DROP CONSTRAINT "FK_f4d53649fee70f18bbc88502673"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crypto_news_message_media" DROP CONSTRAINT "fk_crypto_news_message_media_message"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_backfill_timestamp"`);
    await queryRunner.query(`DROP TABLE "backfill_messages"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_channel_content_filter_configs_ordering"`,
    );
    await queryRunner.query(`DROP TABLE "channel_content_filter_configs"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_crypto_news_messages_channel_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_crypto_news_messages_ingested_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."uq_crypto_news_messages_channel_message"`,
    );
    await queryRunner.query(`DROP TABLE "crypto_news_messages"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_crypto_news_message_media_message_id"`,
    );
    await queryRunner.query(`DROP TABLE "crypto_news_message_media"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_crypto_news_sources_lifecycle_status"`,
    );
    await queryRunner.query(`DROP TABLE "crypto_news_sources"`);
  }
}
