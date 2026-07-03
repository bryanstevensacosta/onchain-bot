-- Backfill: rename-vip-tables
-- Author: refactor-vip-calls-tables (Wave 4)
-- Date:   2026-07-02
--
-- What: Rename two tables so the BC ownership is reflected in the schema:
--         published_calls       → vip_published_calls       (owned by vip-channel)
--         notified_achievements → vip_notified_achievements (owned by vip-achievement)
--       The index names are also renamed to match the new table names (matches the
--       decorators on `PublishedCallEntity` / `VipAchievementEntity`).
-- Why:  Wave 4 of the refactor moves `notified_achievements` ownership from
--       `token/achievement/` to the new `vip-achievement/` sub-BC. The convention
--       in `telegram/vip-calls/` is that all tables carry the `vip_` prefix.
--
-- Pre-condition:
--   Both source tables must exist (abort if either is missing).
--   Expected pre-migration row counts in dev (2026-07-02 snapshot):
--     published_calls       : 69
--     notified_achievements : 402
--
-- Order matters: run BEFORE deploying the new backend code. If the new code boots
-- first, `synchronize: true` would CREATE empty `vip_published_calls` and
-- `vip_notified_achievements` tables while the old-named tables still hold data,
-- orphaning the existing records.
--
-- Verification:
--   \d+ vip_published_calls           -- expected: still shows 69 rows worth of data
--   \d+ vip_notified_achievements     -- expected: still shows 402 rows worth of data
--   SELECT COUNT(*) FROM vip_published_calls;
--   SELECT COUNT(*) FROM vip_notified_achievements;
--
-- Rollback:
--   psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner \
--     < apps/backend/scripts/backfills/2026-07-02-rename-vip-tables-rollback.sql

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.published_calls') IS NULL THEN
    RAISE EXCEPTION 'Source table published_calls does not exist';
  END IF;
  IF to_regclass('public.notified_achievements') IS NULL THEN
    RAISE EXCEPTION 'Source table notified_achievements does not exist';
  END IF;
END $$;

-- Pre-migration row counts (verification witness; harmless to leave in history)
SELECT 'published_calls::pre' AS tbl, COUNT(*) FROM published_calls
UNION ALL
SELECT 'notified_achievements::pre', COUNT(*) FROM notified_achievements;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. published_calls → vip_published_calls
-- ──────────────────────────────────────────────────────────────────────────
-- Both the PK and the idx_* indexes are renamed explicitly. Even though
-- `published_calls_pkey` follows the `<table>_pkey` convention, modern
-- Postgres (≥ 12) does NOT auto-rename the PK on `ALTER TABLE ... RENAME TO`.
-- The idx_* / uq_* indexes are likewise not auto-renamed (they don't follow
-- the `<table>_<col>_idx` convention that would be auto-renamed).
ALTER TABLE IF EXISTS published_calls RENAME TO vip_published_calls;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'published_calls_pkey') THEN
    ALTER INDEX published_calls_pkey RENAME TO vip_published_calls_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_published_calls_published_at') THEN
    ALTER INDEX idx_published_calls_published_at RENAME TO idx_vip_published_calls_published_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_published_calls_status') THEN
    ALTER INDEX idx_published_calls_status RENAME TO idx_vip_published_calls_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_published_calls_reserved_at') THEN
    ALTER INDEX idx_published_calls_reserved_at RENAME TO idx_vip_published_calls_reserved_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_published_calls_correlation_id') THEN
    ALTER INDEX idx_published_calls_correlation_id RENAME TO idx_vip_published_calls_correlation_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_published_calls_telegram_msg_id') THEN
    ALTER INDEX uq_published_calls_telegram_msg_id RENAME TO uq_vip_published_calls_telegram_msg_id;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. notified_achievements → vip_notified_achievements
-- ──────────────────────────────────────────────────────────────────────────
-- The PK here was auto-named by Postgres as `PK_b0df8235c86fae048a69a93addc`
-- (hashed convention because the underlying constraint used UUID DEFAULT).
-- That name does NOT follow the <table>_pkey convention, so it is NOT
-- auto-renamed by ALTER TABLE — we rename it explicitly to keep the schema
-- tidy and to match the dev-DB convention used by `synchronize: true`.
ALTER TABLE IF EXISTS notified_achievements RENAME TO vip_notified_achievements;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'PK_b0df8235c86fae048a69a93addc') THEN
    ALTER INDEX "PK_b0df8235c86fae048a69a93addc" RENAME TO vip_notified_achievements_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_notified_achievements_call_id') THEN
    ALTER INDEX idx_notified_achievements_call_id RENAME TO idx_vip_notified_achievements_call_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_notified_achievements_call_threshold') THEN
    ALTER INDEX uq_notified_achievements_call_threshold RENAME TO uq_vip_notified_achievements_call_threshold;
  END IF;
END $$;

-- Post-migration row counts (must match pre-migration)
SELECT 'vip_published_calls::post' AS tbl, COUNT(*) FROM vip_published_calls
UNION ALL
SELECT 'vip_notified_achievements::post', COUNT(*) FROM vip_notified_achievements;

COMMIT;
