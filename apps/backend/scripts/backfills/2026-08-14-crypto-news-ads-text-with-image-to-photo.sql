-- Backfill: crypto-news-ads text-with-image → photo format
-- Author: onchain-bot
-- Date:   2026-08-14
--
-- What:
--   Migrates legacy `crypto_news_ads` rows that carry an image
--   (`image_media_id IS NOT NULL`) but are still flagged `format = 'text'`
--   to `format = 'photo'`. The 2026-08-13 backfill added the `format`
--   column with DEFAULT 'text', so every pre-existing ad (including ones
--   that already had an image) defaulted to 'text'.
--   Idempotent: the WHERE clause only matches rows still needing the fix,
--   so a re-run is a no-op (0 rows).
--
-- Why:
--   crypto-news-ads-post-formats: `format = 'text'` becomes pure text in
--   the publish use case (sendMessage). A legacy text row that has an
--   `image_media_id` would silently drop its image at publish time because
--   the text branch never sends the photo. Flipping those rows to 'photo'
--   makes the publish use case send the image via sendPhoto, preserving
--   the ad's original intent.
--
-- Verification:
--   SELECT count(*) FROM crypto_news_ads
--     WHERE format = 'text' AND image_media_id IS NOT NULL;
--   -- expected: 0 after apply (>= 0 before; in prod with legacy ads it
--   --           will be > 0, in a fresh dev DB 0 is correct and the
--   --           backfill is a no-op)
--
--   SELECT count(*) FROM crypto_news_ads WHERE format = 'photo';
--   -- expected: number of migrated rows (>= 0)
--
-- Rollback:
--   LOSSY — NOT REVERSIBLE via SQL. Reversing with
--   `UPDATE crypto_news_ads SET format='text' WHERE format='photo'`
--   cannot distinguish rows that were originally 'text' from rows that
--   were originally 'photo', so it would corrupt genuinely-photo ads.
--   Do NOT attempt an inverse rollback. Restore from a backup taken
--   before deploy (`npm run db:backup` pre-deploy) if this must be undone.
--
-- Gate-of-order note:
--   `deploy.yml` runs TypeORM `migration:run` but NOT backfills. This
--   backfill must be applied manually on prod BEFORE the new app version
--   deploys: `npm run db:migrate:dry-run` then `npm run db:migrate`.

UPDATE crypto_news_ads
SET format = 'photo'
WHERE format = 'text'
  AND image_media_id IS NOT NULL;