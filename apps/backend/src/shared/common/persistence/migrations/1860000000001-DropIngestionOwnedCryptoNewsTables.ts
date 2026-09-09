import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop ingestion-owned crypto-news tables from the backend database.
 *
 * Hand-written (NOT generated): TypeORM 0.3 `migration:generate` only diffs
 * entity-mapped tables and never emits DROP TABLE for removed entities
 * (proven twice against a faithful scratch restore — see
 * .omo/evidence/task-5-db-separation.md §0). DDL below is transcribed VERBATIM
 * from /tmp/pre-split-backup.dump (pre-split backup taken in todo 4).
 *
 * - up(): drop the staging/prod remnant FKs on the filter table (TWO known names:
 *   synchronize-era "FK_f4d53649fee70f18bbc88502673" and migration-1815000000000-era
 *   "fk_channel_content_filter_configs_channel_id". Todo 4 removed the JOIN from entity
 *   metadata; dev never has either physically — IF EXISTS is safe everywhere), then
 *   drop the 3 tables in dependency-safe order (media → messages → sources).
 * - down(): recreate EXACTLY the 3 tables (CREATEs + their PKs + the
 *   media→messages FK + their indexes). Both filter-table FKs
 *   (FK_f4d53649fee70f18bbc88502673, fk_channel_content_filter_configs_channel_id)
 *   are DELIBERATELY NOT re-added: todo 4
 *   killed that JOIN and channel_id stays an opaque varchar.
 */
export class DropIngestionOwnedCryptoNewsTables1860000000001 implements MigrationInterface {
  name = 'DropIngestionOwnedCryptoNewsTables1860000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "channel_content_filter_configs" DROP CONSTRAINT IF EXISTS "FK_f4d53649fee70f18bbc88502673"`,
    );
    await queryRunner.query(
      `ALTER TABLE "channel_content_filter_configs" DROP CONSTRAINT IF EXISTS "fk_channel_content_filter_configs_channel_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "crypto_news_message_media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crypto_news_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crypto_news_sources"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "crypto_news_sources" ("channel_id" character varying(64) NOT NULL, "handle" character varying(64), "title" character varying(256) NOT NULL, "is_active" boolean DEFAULT false NOT NULL, "lifecycle_status" character varying(16) DEFAULT 'ACTIVE' NOT NULL, "added_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE TABLE "crypto_news_messages" ("id" uuid NOT NULL, "channel_id" character varying(64) NOT NULL, "message_id" integer NOT NULL, "title" character varying(512), "content" text NOT NULL, "published_at" timestamp with time zone NOT NULL, "ingested_at" timestamp with time zone NOT NULL, "link_preview_url" text, "link_preview_title" text, "link_preview_description" text, "link_preview_site_name" character varying(128), "message_entities" text, "grouped_id" character varying(64))`,
    );
    await queryRunner.query(
      `CREATE TABLE "crypto_news_message_media" ("id" uuid DEFAULT public.uuid_generate_v4() NOT NULL, "message_id" uuid NOT NULL, "media_index" smallint NOT NULL, "type" character varying(16) DEFAULT 'photo' NOT NULL, "file_path" text NOT NULL, "mime_type" character varying(64), "file_size" integer, "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY "crypto_news_sources" ADD CONSTRAINT "PK_a5452b296d6b0a05472cffa29ed" PRIMARY KEY ("channel_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY "crypto_news_messages" ADD CONSTRAINT "PK_1b5fd3363b8fd9c30475af4ffe0" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY "crypto_news_message_media" ADD CONSTRAINT "PK_6ae375e0bd0c76dd167ca595687" PRIMARY KEY ("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY "crypto_news_message_media" ADD CONSTRAINT "fk_crypto_news_message_media_message" FOREIGN KEY ("message_id") REFERENCES "crypto_news_messages"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_sources_lifecycle_status" ON "crypto_news_sources" USING btree ("lifecycle_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_messages_channel_id" ON "crypto_news_messages" USING btree ("channel_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_messages_ingested_at" ON "crypto_news_messages" USING btree ("ingested_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_crypto_news_messages_channel_message" ON "crypto_news_messages" USING btree ("channel_id", "message_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_crypto_news_message_media_message_id" ON "crypto_news_message_media" USING btree ("message_id")`,
    );
  }
}
