-- Backfill: crypto-news-ads provisioning (singleton rows)
-- Author: onchain-bot
-- Date:   2026-08-04
--
-- What:
--   Seeds the two singleton rows the ads BC needs before it can run:
--     - `crypto_news_ad_rotation_config` (id=1) with the master switch
--       OFF (enabled=false) and the default cadence knobs
--       (every_n_posts=4, min_minutes_between_ads=30).
--     - `crypto_news_ad_rotation_state` (id=1) with a fresh rotation
--       cursor (posts_since_last_ad=0, last_ad_id=NULL,
--       last_ad_published_at=NULL).
--   Both are pure INSERT ... ON CONFLICT DO NOTHING, keyed on the PK,
--   so re-running is safe (idempotent).
--
-- Why:
--   New ads BC lands in crypto-news-ads. The rotation config's
--   `enabled` flag doubles as the safety dead-man's switch — defaulting
--   it to `false` guarantees ads never self-enable on a fresh deploy
--   until an operator flips it on through the T8 REST API.
--
-- Verification:
--   SELECT id, enabled, every_n_posts, min_minutes_between_ads
--     FROM crypto_news_ad_rotation_config;
--   -- expected: exactly one row (id=1), enabled=false
--   SELECT id, posts_since_last_ad, last_ad_id, last_ad_published_at
--     FROM crypto_news_ad_rotation_state;
--   -- expected: exactly one row (id=1), posts_since_last_ad=0
--
-- Rollback:
--   NOT REVERSIBLE in the general sense (the rows are the normal
--   production state going forward). If a deploy that had never seeded
--   them needs to clean up: DELETE FROM crypto_news_ad_rotation_config
--   WHERE id = 1; DELETE FROM crypto_news_ad_rotation_state WHERE id = 1;
--   But do NOT delete them once ads are in use — that resets the rotation
--   cursor and would immediately allow an ad.

INSERT INTO crypto_news_ad_rotation_config
  (id, enabled, every_n_posts, min_minutes_between_ads, created_at, updated_at)
VALUES
  (1, false, 4, 30, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO crypto_news_ad_rotation_state
  (id, posts_since_last_ad, last_ad_id, last_ad_published_at, updated_at)
VALUES
  (1, 0, NULL, NULL, now())
ON CONFLICT (id) DO NOTHING;