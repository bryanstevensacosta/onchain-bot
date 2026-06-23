-- =====================================================================
-- alpha-meta-token-scanner :: Tokens Without Score Yet
-- =====================================================================
-- Tokens canónicos que aún no han sido puntuados.
-- =====================================================================

SELECT
    c.chain,
    c.id,
    c.address,
    c.ticker,
    c.name,
    c.market_cap_usd,
    c.mention_count,
    c.first_seen_at,
    c.last_seen_at
FROM canonical_token_calls c
LEFT JOIN token_scores s
       ON s.id = c.id AND s.chain = c.chain
WHERE s.id IS NULL
ORDER BY c.last_seen_at DESC;