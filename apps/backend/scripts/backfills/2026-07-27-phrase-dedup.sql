-- Backfill: Remove intra-table and cross-table phrase duplicates
-- Author: Sisyphus
-- Date:   2026-07-27
--
-- What:
--   Phase 1 of the phrase-registry-consolidation plan. Removes duplicate
--   phrases from `crypto_news_publisher_keywords` and `blacklist_phrases`
--   that would be rejected by the new `PhraseRegistryService` validation.
--   Only touches simple phrases (and_group_id IS NULL); compounds are
--   excluded.
--
--   Two phases:
--     1. Intra-table: within each table, same phrase (case-insensitive)
--        → keep most recent (by created_at), delete the rest.
--     2. Cross-table: same phrase (case-insensitive) + same case_sensitive
--        + same match_mode across both tables → keep most recent, delete
--        the older one from its respective table.
--
-- Why:  phrase-registry-consolidation plan (adds PhraseRegistryService
--       validation that rejects duplicates with 409 Conflict).
--
-- Verification:
--   SELECT LOWER(phrase), COUNT(*) FROM crypto_news_publisher_keywords
--     WHERE and_group_id IS NULL GROUP BY LOWER(phrase) HAVING COUNT(*) > 1;
--   SELECT LOWER(phrase), COUNT(*) FROM blacklist_phrases
--     WHERE and_group_id IS NULL GROUP BY LOWER(phrase) HAVING COUNT(*) > 1;
--   -- Cross-table (same phrase + settings):
--   SELECT k.id, k.phrase, k.case_sensitive, k.match_mode, k.created_at,
--          b.id, b.phrase, b.case_sensitive, b.match_mode, b.created_at
--   FROM crypto_news_publisher_keywords k
--   JOIN blacklist_phrases b
--     ON LOWER(k.phrase) = LOWER(b.phrase)
--    AND k.case_sensitive = b.case_sensitive
--    AND k.match_mode = b.match_mode
--   WHERE k.and_group_id IS NULL AND b.and_group_id IS NULL;
--
-- Rollback:
--   Restore from backup tables (created below if rows were deleted):
--     INSERT INTO crypto_news_publisher_keywords SELECT * FROM backup_keywords_20260727;
--     INSERT INTO blacklist_phrases SELECT * FROM backup_blacklist_20260727;
--   Drop backup tables after verifying:
--     DROP TABLE IF EXISTS backup_keywords_20260727, backup_blacklist_20260727;

-- =============================================================================
-- Phase 0: Create backup tables
-- =============================================================================
CREATE TABLE IF NOT EXISTS backup_keywords_20260727 AS
SELECT * FROM crypto_news_publisher_keywords;

CREATE TABLE IF NOT EXISTS backup_blacklist_20260727 AS
SELECT * FROM blacklist_phrases;

-- =============================================================================
-- Phase 1: Intra-table dedup — keywords
-- =============================================================================
WITH keyword_dupes AS (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(phrase)
             ORDER BY created_at DESC
           ) AS rn
    FROM crypto_news_publisher_keywords
    WHERE and_group_id IS NULL
  ) ranked
  WHERE rn > 1
)
DELETE FROM crypto_news_publisher_keywords
WHERE id IN (SELECT id FROM keyword_dupes);

-- =============================================================================
-- Phase 1: Intra-table dedup — blacklist phrases
-- =============================================================================
WITH blacklist_dupes AS (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(phrase)
             ORDER BY created_at DESC
           ) AS rn
    FROM blacklist_phrases
    WHERE and_group_id IS NULL
  ) ranked
  WHERE rn > 1
)
DELETE FROM blacklist_phrases
WHERE id IN (SELECT id FROM blacklist_dupes);

-- =============================================================================
-- Phase 2: Cross-table dedup
--   Same phrase (case-insensitive) + same case_sensitive + same match_mode
--   exists in both tables. Keep the most recent, delete from the older table.
-- =============================================================================
WITH cross_dupes AS (
  SELECT
    k.id AS keyword_id,
    b.id AS blacklist_id,
    k.created_at AS keyword_created,
    b.created_at AS blacklist_created,
    CASE
      WHEN k.created_at >= b.created_at THEN 'keep_keyword'
      ELSE 'keep_blacklist'
    END AS keeper
  FROM crypto_news_publisher_keywords k
  JOIN blacklist_phrases b
    ON LOWER(k.phrase) = LOWER(b.phrase)
   AND k.case_sensitive = b.case_sensitive
   AND k.match_mode = b.match_mode
  WHERE k.and_group_id IS NULL
    AND b.and_group_id IS NULL
)
DELETE FROM crypto_news_publisher_keywords
WHERE id IN (
  SELECT keyword_id FROM cross_dupes WHERE keeper = 'keep_blacklist'
);

WITH cross_dupes AS (
  SELECT
    k.id AS keyword_id,
    b.id AS blacklist_id,
    k.created_at AS keyword_created,
    b.created_at AS blacklist_created,
    CASE
      WHEN k.created_at >= b.created_at THEN 'keep_keyword'
      ELSE 'keep_blacklist'
    END AS keeper
  FROM crypto_news_publisher_keywords k
  JOIN blacklist_phrases b
    ON LOWER(k.phrase) = LOWER(b.phrase)
   AND k.case_sensitive = b.case_sensitive
   AND k.match_mode = b.match_mode
  WHERE k.and_group_id IS NULL
    AND b.and_group_id IS NULL
)
DELETE FROM blacklist_phrases
WHERE id IN (
  SELECT blacklist_id FROM cross_dupes WHERE keeper = 'keep_keyword'
);
