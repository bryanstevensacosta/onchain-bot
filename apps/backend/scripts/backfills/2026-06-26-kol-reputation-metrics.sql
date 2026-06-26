-- Backfill: kol-reputation-metrics (jsonb)
-- Author: bstevens
-- Date:   2026-06-26
--
-- What: Add `metrics` jsonb column to `kol_reputations` and backfill from
--       the existing `total_calls` value. Replaces the fixed
--       `strong_calls`/`good_calls`/`neutral_calls`/`poor_calls`/
--       `failed_calls` columns (kept for backward compat — new code
--       uses `metrics`).
-- Why:  Dynamic shape. New outcome categories (X2/X5/X10/X50/rug-50/rug-80)
--       live in jsonb. Adding a new category is a code change, not a
--       schema migration.
--
-- Defense-in-depth layers:
--   Domain:  KolReputationMetrics VO + KolMetricsCalculator (pure)
--   DB:      metrics jsonb column
--   UI:      will show breakdown per metric (Slice 2 of the plan)
--
-- Verification (after apply):
--   SELECT kol_id, metrics FROM kol_reputations LIMIT 3;
--   -- expected: rows with metrics jsonb, totalMentions >= 0
--
-- Rollback:
--   ALTER TABLE kol_reputations DROP COLUMN metrics;

ALTER TABLE kol_reputations
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE kol_reputations
SET metrics = jsonb_build_object(
  'totalMentions', total_calls,
  'x2Count', 0,
  'x5Count', 0,
  'x10Count', 0,
  'x50Count', 0,
  'rug50Count', 0,
  'rug80Count', 0,
  'neutralCount', total_calls,
  'mentionScore', CASE
    WHEN total_calls >= 5 THEN LEAST(0.95, ROUND((0.5 + LOG(10, total_calls + 1) * 0.2)::numeric, 2))
    ELSE 0.5
  END,
  'qualityScore', 0.5,
  'drawdownScore', 0.5
)::jsonb
WHERE metrics = '{}'::jsonb;