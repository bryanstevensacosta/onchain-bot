import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the backend `kols` table (item 8, telegram-feed-unification).
 *
 * KOL identity moved to ingestion-telegram (`telegram_feed_sources`,
 * `type='kol'`); backend reads go through `FeedIdentityHttpClient`
 * (`GET {INGESTION_TELEGRAM_URL}/api/feed/sources?type=kol`). No other
 * backend table holds an FK into `kols` (verified: no `REFERENCES "kols"`
 * in any migration), so a plain DROP suffices — same hand-written pattern
 * as `1860000000001-DropIngestionOwnedCryptoNewsTables` (TypeORM
 * `migration:generate` never emits DROP TABLE for removed entities).
 *
 * PARITY GATE (manual pre-check, evidenced in
 * `.omo/evidence/task-8-telegram-feed-unification.txt` — the migration
 * itself stays a plain reversible DROP):
 *   backend:    SELECT count(*) FROM kols;
 *   ingestion:  SELECT count(*) FROM telegram_feed_sources WHERE type='kol';
 *   sample:     20-row column diff
 *     (channel_id, handle, title, lifecycle_status, last_ingested_at)
 *   Run ONLY when counts match and the sample diff is empty.
 *   Dev 2026-09-22: kols=0 rows (vacuous gate — zero rows at risk).
 *
 * REVERT NOTE: `down()` recreates the EMPTY schema only — it does NOT
 * restore rows. Row restore = item-6 backfill re-run
 * (`scripts/backfill-kols-to-feed.ts` in ingestion-telegram, reversed
 * direction) or a pre-drop `pg_dump -t kols` restore.
 */
export class DropKolsTable1877000000000 implements MigrationInterface {
  name = 'DropKolsTable1877000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "kols"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "kols" ("kol_id" character varying(64) NOT NULL, "handle" character varying(64), "title" character varying(256) NOT NULL, "is_active" boolean DEFAULT false NOT NULL, "lifecycle_status" character varying(16) DEFAULT 'ACTIVE' NOT NULL, "last_ingested_at" timestamp with time zone, "added_at" timestamp with time zone NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE ONLY "kols" ADD CONSTRAINT "PK_4f572bd5935b6c4641fab0e6ad8" PRIMARY KEY ("kol_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_kols_handle" ON "kols" USING btree ("handle") WHERE handle IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_kols_lifecycle_status" ON "kols" USING btree ("lifecycle_status")`,
    );
  }
}
