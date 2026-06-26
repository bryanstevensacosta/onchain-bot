-- One-shot data fix for INV-2: backfill `breakdown` for tokens scored before
-- the use case recorded factors. Mirrors the formula in
-- `apps/backend/src/token/scoring/application/handlers/score-token.use-case.ts`
-- (liquidity/holders/mc/volume bonuses) using current `token_snapshots` data.
--
-- Idempotent: only touches rows whose `breakdown` IS NULL or empty.
-- Run from repo root: `npm run docker:up` first, then:
--   PGPASSWORD=alpha_meta_token_scanner psql -h localhost -U alpha_meta_token_scanner -d alpha_meta_token_scanner -f apps/backend/scripts/one-shot-backfill-token-breakdown.sql
--
-- Rollback:
--   UPDATE token_scores SET breakdown = NULL WHERE id IN (
--     'ethereum:0x92b89bd08d7625407de0f9e746c6546d3b52d64f',
--     'solana:4quuyzseunkbdwr3xqv83cqeb9enat348b9exbhgwory'
--   );

WITH affected AS (
  SELECT ts.id, ts.chain, ts.address,
    snp.liquidity_usd, snp.market_cap_usd, snp.holders, snp.volume_24h_usd
  FROM token_scores ts
  JOIN token_snapshots snp ON snp.chain = ts.chain AND snp.address = ts.address
  WHERE ts.breakdown IS NULL OR jsonb_array_length(ts.breakdown) = 0
),
computed AS (
  SELECT id,
    (CASE
      WHEN liquidity_usd >= 10000 THEN jsonb_build_array(jsonb_build_object('factor','LIQUIDITY_HIGH','delta',20,'note','$'||liquidity_usd||' ≥ $10,000'))
      WHEN liquidity_usd >= 5000  THEN jsonb_build_array(jsonb_build_object('factor','LIQUIDITY_MEDIUM','delta',10,'note','$'||liquidity_usd||' ≥ $5,000'))
      WHEN liquidity_usd >= 1000  THEN jsonb_build_array(jsonb_build_object('factor','LIQUIDITY_LOW','delta',5,'note','$'||liquidity_usd||' ≥ $1,000'))
      WHEN liquidity_usd > 0      THEN jsonb_build_array(jsonb_build_object('factor','LIQUIDITY_INSUFFICIENT','delta',-10,'note','$'||liquidity_usd||' < $1,000'))
      ELSE '[]'::jsonb
    END ||
    CASE
      WHEN holders >= 500 THEN jsonb_build_array(jsonb_build_object('factor','HOLDERS_HIGH','delta',15,'note',holders||' ≥ 500'))
      WHEN holders >= 100 THEN jsonb_build_array(jsonb_build_object('factor','HOLDERS_MEDIUM','delta',8,'note',holders||' ≥ 100'))
      WHEN holders >= 10  THEN jsonb_build_array(jsonb_build_object('factor','HOLDERS_LOW','delta',3,'note',holders||' ≥ 10'))
      WHEN holders = 0    THEN jsonb_build_array(jsonb_build_object('factor','HOLDERS_NONE','delta',-10,'note','0 holders'))
      ELSE '[]'::jsonb
    END ||
    CASE
      WHEN market_cap_usd >= 500000 THEN jsonb_build_array(jsonb_build_object('factor','MC_HIGH','delta',10,'note','$'||market_cap_usd||' ≥ $500,000'))
      WHEN market_cap_usd >= 100000 THEN jsonb_build_array(jsonb_build_object('factor','MC_MEDIUM','delta',5,'note','$'||market_cap_usd||' ≥ $100,000'))
      WHEN market_cap_usd >= 10000  THEN jsonb_build_array(jsonb_build_object('factor','MC_LOW','delta',2,'note','$'||market_cap_usd||' ≥ $10,000'))
      ELSE '[]'::jsonb
    END ||
    CASE
      WHEN volume_24h_usd >= 50000 THEN jsonb_build_array(jsonb_build_object('factor','VOLUME_HIGH','delta',5,'note','$'||volume_24h_usd||' ≥ $50,000'))
      WHEN volume_24h_usd >= 10000 THEN jsonb_build_array(jsonb_build_object('factor','VOLUME_LOW','delta',2,'note','$'||volume_24h_usd||' ≥ $10,000'))
      ELSE '[]'::jsonb
    END) AS breakdown
  FROM affected
)
UPDATE token_scores ts
SET breakdown = c.breakdown
FROM computed c
WHERE ts.id = c.id;