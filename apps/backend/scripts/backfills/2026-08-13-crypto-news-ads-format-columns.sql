-- Backfill: crypto-news-ads format columns (format, video_media_id, album_media_ids)
-- Author: onchain-bot
-- Date:   2026-08-13
--
-- What:
--   Adds three columns to `crypto_news_ads` so ads can be published as
--   real Telegram posts with a format:
--     - `format` VARCHAR(16) NOT NULL DEFAULT 'text' — the post format
--       ('text' | 'photo' | 'video' | 'album'); pre-existing ads default
--       to 'text' so their publish behavior is unchanged.
--     - `video_media_id` VARCHAR(255) NULL — media-library id of the
--       video used when format = 'video'.
--     - `album_media_ids` jsonb NULL — array of media-library ids used
--       when format = 'album' (1..10 items, Bot API limit).
--   Idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.
--
-- Why:
--   crypto-news-ads-post-formats: ads move from "plain text + optional
--   image" to real Telegram post formats (text/photo/video/album). The
--   publish use case branches on `format` to pick the Bot API method
--   (sendMessage/sendPhoto/sendVideo/sendMediaGroup).
--
-- Verification:
--   SELECT format, video_media_id, album_media_ids
--     FROM crypto_news_ads
--     ORDER BY created_at DESC
--     LIMIT 5;
--   -- expected: format = 'text' on pre-existing rows, NULL media columns
--   \d crypto_news_ads
--   -- expected: format varchar(16) NOT NULL DEFAULT 'text'::character varying,
--   --           video_media_id varchar(255), album_media_ids jsonb
--
-- Rollback:
--   ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS album_media_ids;
--   ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS video_media_id;
--   ALTER TABLE crypto_news_ads DROP COLUMN IF EXISTS format;
--   Only run if the deploy is rolled back before any ad uses the new
--   columns; dropping `format` resets ads to text-only behavior.

ALTER TABLE crypto_news_ads
  ADD COLUMN IF NOT EXISTS format VARCHAR(16) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS video_media_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS album_media_ids jsonb NULL;