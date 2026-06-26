-- Backfill: tracked-published-calls-from-published
-- Author: bstevens
-- Date:   2026-06-26
--
-- What: Populate `tracked_published_calls` from `published_calls` for rows
--       that have a real numeric KOL id (extracted from
--       `published_channel_ids[0]`). Tracked calls table is the source for
--       the "🎯 Tracked calls" widget on the Dashboard (INV-6).
-- Why:  `publishing.telegram.published` events emitted before the bridge
--       handler (commit 1483afb) was wired created published_calls rows
--       but never triggered `CallPublishedTrackedHandler` →
--       `TrackPublishedCallUseCase.execute()`. Result: 3 published_calls
--       exist but tracked_published_calls is empty, so the widget shows
--       "No tracked calls".
--
-- Filter: skip rows whose published_channel_ids[0] is NOT a numeric KOL id
--         (e.g. test artifacts using channel name "AlphaPremiumHub" instead
--         of a numeric KOL id like 2088887132). These are excluded from
--         the widget to keep the list meaningful — the user can clean them
--         up separately if needed.
--
-- Verification:
--   SELECT COUNT(*) FROM tracked_published_calls;
--   -- expected: > 0 (was 0 before this backfill)
--
--   SELECT chain, address, ticker, kol_id, published_at
--   FROM tracked_published_calls ORDER BY published_at DESC;
--
-- Rollback:
--   DELETE FROM tracked_published_calls
--   WHERE created_at > now() - interval '1 hour'
--     AND kol_id ~ '^[0-9]+$';

INSERT INTO tracked_published_calls (
  id, kol_id, chain, address, ticker,
  mc_at_publish, mc_now, milestones_hit, max_milestone,
  price_drop_percent, published_at, last_updated_at,
  is_active, created_at, updated_at
)
SELECT
  gen_random_uuid() AS id,
  pc.published_channel_ids ->> 0 AS kol_id,
  pc.chain,
  pc.address,
  pc.ticker,
  0 AS mc_at_publish,
  NULL AS mc_now,
  '[]'::jsonb AS milestones_hit,
  NULL AS max_milestone,
  NULL AS price_drop_percent,
  pc.published_at,
  pc.published_at AS last_updated_at,
  TRUE AS is_active,
  now() AS created_at,
  now() AS updated_at
FROM published_calls pc
LEFT JOIN tracked_published_calls tpc
  ON tpc.chain = pc.chain AND tpc.address = pc.address
WHERE tpc.id IS NULL
  AND jsonb_array_length(pc.published_channel_ids) > 0
  AND (pc.published_channel_ids ->> 0) ~ '^[0-9]+$';