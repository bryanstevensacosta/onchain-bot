-- =====================================================================
-- alpha-meta-token-scanner :: Liquidity Distribution
-- =====================================================================
-- Distribución de market cap y liquidity por rangos.
-- =====================================================================

SELECT
    chain,
    CASE
        WHEN market_cap_usd IS NULL            THEN 'sin_datos'
        WHEN market_cap_usd < 10000            THEN '<10k'
        WHEN market_cap_usd < 100000           THEN '10k-100k'
        WHEN market_cap_usd < 1000000          THEN '100k-1M'
        WHEN market_cap_usd < 10000000         THEN '1M-10M'
        ELSE '>10M'
    END                              AS mc_bucket,
    COUNT(*)                         AS tokens,
    ROUND(AVG(liquidity_usd)::numeric, 0) AS avg_liquidity
FROM canonical_token_calls
GROUP BY chain, mc_bucket
ORDER BY chain, mc_bucket;