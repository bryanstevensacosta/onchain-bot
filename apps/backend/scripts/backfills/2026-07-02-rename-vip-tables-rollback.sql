-- Backfill: rename-vip-tables-rollback
-- Author: refactor-vip-calls-tables (Wave 4)
-- Date:   2026-07-02
--
-- What: Rollback for `2026-07-02-rename-vip-tables.sql`.
--       Renames `vip_published_calls`       → `published_calls`
--       and      `vip_notified_achievements` → `notified_achievements`.
--
-- Usage:
--   psql -U alpha_meta_token_scanner -d alpha_meta_token_scanner \
--     < apps/backend/scripts/backfills/2026-07-02-rename-vip-tables-rollback.sql

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.vip_published_calls') IS NULL THEN
    RAISE EXCEPTION 'Source table vip_published_calls does not exist';
  END IF;
  IF to_regclass('public.vip_notified_achievements') IS NULL THEN
    RAISE EXCEPTION 'Source table vip_notified_achievements does not exist';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. vip_published_calls → published_calls
-- ──────────────────────────────────────────────────────────────────────────
-- Modern Postgres does NOT auto-rename indexes on `ALTER TABLE ... RENAME TO`,
-- so we rename the PK explicitly. Reverse direction is symmetric to the
-- forward migration script.
ALTER TABLE IF EXISTS vip_published_calls RENAME TO published_calls;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'vip_published_calls_pkey') THEN
    ALTER INDEX vip_published_calls_pkey RENAME TO published_calls_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vip_published_calls_published_at') THEN
    ALTER INDEX idx_vip_published_calls_published_at RENAME TO idx_published_calls_published_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vip_published_calls_status') THEN
    ALTER INDEX idx_vip_published_calls_status RENAME TO idx_published_calls_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vip_published_calls_reserved_at') THEN
    ALTER INDEX idx_vip_published_calls_reserved_at RENAME TO idx_published_calls_reserved_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vip_published_calls_correlation_id') THEN
    ALTER INDEX idx_vip_published_calls_correlation_id RENAME TO idx_published_calls_correlation_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_vip_published_calls_telegram_msg_id') THEN
    ALTER INDEX uq_vip_published_calls_telegram_msg_id RENAME TO uq_published_calls_telegram_msg_id;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. vip_notified_achievements → notified_achievements
-- ──────────────────────────────────────────────────────────────────────────
-- Reverse the explicit PK rename: vip_notified_achievements_pkey → original
-- hashed name. If the rename was never executed (because the rollback is
-- being run against a fresh dev DB), this guard does nothing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'vip_notified_achievements_pkey') THEN
    ALTER INDEX vip_notified_achievements_pkey RENAME TO "PK_b0df8235c86fae048a69a93addc";
  END IF;
END $$;

ALTER TABLE IF EXISTS vip_notified_achievements RENAME TO notified_achievements;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_vip_notified_achievements_call_id') THEN
    ALTER INDEX idx_vip_notified_achievements_call_id RENAME TO idx_notified_achievements_call_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_vip_notified_achievements_call_threshold') THEN
    ALTER INDEX uq_vip_notified_achievements_call_threshold RENAME TO uq_notified_achievements_call_threshold;
  END IF;
END $$;

COMMIT;
