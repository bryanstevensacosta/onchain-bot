import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline for synchronize-era orphan tables + migration-ordering gaps.
 *
 * Fresh databases fail at `AddPresetsAndDescriptions1782270612825` with
 * 42P01 (`settings_filters` does not exist) because these tables were born
 * via `synchronize:true` in dev and NO migration ever CREATEs them. Staging
 * Oracle was unblocked via dump restore (not a fix) — this file IS the fix.
 *
 * Orphan set (referenced-but-never-created, proven by diffing every
 * ALTER/SELECT/INSERT/REFERENCES against every CREATE TABLE across
 * `migrations/*.ts`; shapes verified against entities + the restored PROD
 * schema read-only via information_schema):
 * - `settings_filters` — ALTERed by 1782270612825. Shape WITHOUT
 *   `description` (original synchronize-era shape; 1782270612825 adds it).
 * - `signals` — SELECTed by 1782270612825 (code/penalty/risk_level/enabled).
 * - `scoring_thresholds` — SELECTed by 1782270612825
 *   (scope/min_score/max_score/decision).
 * - `crypto_news_publisher_llm_config` — ORDERING gap: ALTERed by
 *   1788659125192 + 1790000000000 but only CREATEd later by 1840000000000.
 *   Shape is the VERBATIM pre-split CREATE from 1840000000000 (legacy
 *   `enabled`, no 3-flag columns, with `reject_non_latin`) so 1788659125192
 *   migrates `enabled` -> flags and 1840000000000 becomes a safe no-op.
 * - `crypto_news_sources` — ORDERING gap: FK-referenced by 1815000000000 +
 *   ALTERed by 1816000000000, CREATEd only in the down() of
 *   1860000000001 (rollback-only), then DROPPED by its up(). Shape is the
 *   VERBATIM pre-split DDL from that down(). `crypto_news_messages/media`
 *   need NO baseline (only DROP IF EXISTS references them — guarded).
 *   Final state still holds ZERO crypto-news tables in the backend DB
 *   (1860000000001 drops `sources` at the end of the chain), so the
 *   ingestion-ownership split is unaffected.
 *
 * Idempotency: every statement is guarded (IF NOT EXISTS / DO $$ with
 * pg_type + pg_constraint checks), so re-runs and already-migrated DBs
 * (staging/prod restores) are unaffected. down() drops the 5 tables
 * (`sources` with CASCADE — the 1815000000000-era FK lives on the later
 * `channel_content_filter_configs` table); enum types + uuid-ossp are
 * deliberately left in place (shared, harmless).
 */
export class BaselineOrphanTables1782270612824 implements MigrationInterface {
  name = 'BaselineOrphanTables1782270612824';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() id defaults (synchronize-era shape, per PROD).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Native enum types (synchronize-era shape, per PROD pg_enum).
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signals_risk_level_enum') THEN
          CREATE TYPE signals_risk_level_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
        END IF;
      END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signals_applies_to_enum') THEN
          CREATE TYPE signals_applies_to_enum AS ENUM ('token', 'kol');
        END IF;
      END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settings_filters_scope_enum') THEN
          CREATE TYPE settings_filters_scope_enum AS ENUM ('token', 'kol', 'all', 'global');
        END IF;
      END $$`);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scoring_thresholds_scope_enum') THEN
          CREATE TYPE scoring_thresholds_scope_enum AS ENUM ('token', 'kol');
        END IF;
      END $$`);

    // settings_filters — original shape WITHOUT description
    // (1782270612825 adds it via ALTER).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS settings_filters (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        type varchar(64) NOT NULL,
        value varchar(256) NOT NULL,
        numeric_value real NULL,
        scope settings_filters_scope_enum NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        notes text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_settings_filters_type
        ON settings_filters (type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_settings_filters_scope
        ON settings_filters (scope)
    `);

    // signals
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS signals (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar(100) NOT NULL,
        name varchar(200) NOT NULL,
        penalty integer NOT NULL,
        risk_level signals_risk_level_enum NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        applies_to signals_applies_to_enum NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_signals_code ON signals (code)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_signals_applies_to
        ON signals (applies_to)
    `);

    // scoring_thresholds
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scoring_thresholds (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        scope scoring_thresholds_scope_enum NOT NULL,
        min_score integer NOT NULL,
        max_score integer NOT NULL,
        decision varchar(32) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_scoring_thresholds_scope
        ON scoring_thresholds (scope)
    `);

    // crypto_news_publisher_llm_config — VERBATIM pre-split shape from
    // 1840000000000 (legacy `enabled`; 1788659125192 migrates it to the
    // 3-flag columns, 1790000000000's reject_non_latin is already present).
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS crypto_news_publisher_llm_config (` +
        `id integer PRIMARY KEY, ` +
        `default_template_id uuid NOT NULL, ` +
        `target_channel varchar(64) NOT NULL DEFAULT '', ` +
        `enabled boolean NOT NULL DEFAULT false, ` +
        `reject_non_latin boolean NOT NULL DEFAULT true, ` +
        `daily_cap integer NOT NULL, ` +
        `daily_reset_utc_hour integer NOT NULL, ` +
        `random_delay_min_ms integer NOT NULL, ` +
        `random_delay_max_ms integer NOT NULL, ` +
        `llm_max_attempts integer NOT NULL, ` +
        `updated_at timestamptz NOT NULL DEFAULT now()` +
        `)`,
    );

    // crypto_news_sources — VERBATIM pre-split shape from the down() of
    // 1860000000001 (transcribed there from the pre-split backup dump).
    // Bridge only: 1860000000001 drops it at the end of the chain.
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "crypto_news_sources" ("channel_id" character varying(64) NOT NULL, "handle" character varying(64), "title" character varying(256) NOT NULL, "is_active" boolean DEFAULT false NOT NULL, "lifecycle_status" character varying(16) DEFAULT 'ACTIVE' NOT NULL, "added_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PK_a5452b296d6b0a05472cffa29ed') THEN
          ALTER TABLE ONLY "crypto_news_sources" ADD CONSTRAINT "PK_a5452b296d6b0a05472cffa29ed" PRIMARY KEY ("channel_id");
        END IF;
      END $$`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_crypto_news_sources_lifecycle_status"
        ON "crypto_news_sources" USING btree ("lifecycle_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "crypto_news_sources" CASCADE`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS crypto_news_publisher_llm_config`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS scoring_thresholds`);
    await queryRunner.query(`DROP TABLE IF EXISTS signals`);
    await queryRunner.query(`DROP TABLE IF EXISTS settings_filters`);
    // Enum types + uuid-ossp extension intentionally left in place
    // (shared objects; dropping them would break re-up and restored DBs).
  }
}
