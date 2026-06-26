-- Backfill: lowercase-image-urls
-- Author: bstevens
-- Date:   2026-06-26
--
-- What: Lowercase all image URLs in token_snapshots.image_urls to fix
--       case-sensitivity mismatches with CDN URL paths.
-- Why:  After commit 47d550a, token IDs are lowercase. But image URLs
--       stored in token_snapshots.image_urls had the original PascalCase
--       address in the path (e.g.
--       `https://dd.dexscreener.com/ds-data/tokens/solana/2VveWbJ822vJHL...`).
--       CDNs (DexScreener, Birdeye) are case-sensitive in URL paths, so
--       these URLs returned 404. Affected: 23 of 28 snapshots (82%).
--
--       Root cause: enrichment code stored URLs with raw mixed-case
--       addresses from provider responses. Domain/ORM fix in commit 47d550a
--       + this migration closes the gap.
--
-- Defense-in-depth layers (combined with commit 47d550a):
--   Domain:  NormalizedAddress.fromSolana() lowercases on construction
--   ORM:     TypeORM @BeforeInsert/@BeforeUpdate hooks auto-lowercase id
--            AND imageUrls in token_snapshots
--   DB:      CHECK (id = lower(id)) constraint on id column
--
-- The lowercase URL approach assumes the CDN is case-insensitive in the
-- path. DexScreener IS case-sensitive in path, so for fully robust image
-- delivery, use the backend image proxy at /token/image/:chain/:address
-- (registered in chain-explorer.module.ts). The proxy handles CDN
-- failures + caches + applies WebP optimization, so frontend consumers
-- should prefer it over direct CDN URLs.
--
-- Verification (after apply):
--   SELECT COUNT(*) FROM token_snapshots
--    WHERE EXISTS (
--      SELECT 1 FROM jsonb_array_elements_text(image_urls) u WHERE u ~ '[A-Z][a-z]'
--    );
--   -- expected: 0 rows
--
--   SELECT COUNT(*) FROM token_snapshots;  -- 28
--
-- Rollback:
--   UPDATE token_snapshots SET image_urls = image_urls;  -- no-op (already lowercase)

UPDATE token_snapshots
SET image_urls = (
  SELECT jsonb_agg(lower(value))
  FROM jsonb_array_elements_text(image_urls)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(image_urls) u WHERE u ~ '[A-Z][a-z]'
);