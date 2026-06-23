-- =====================================================================
-- alpha-meta-token-scanner :: Top Scored Tokens
-- =====================================================================
-- Tokens con mejor score en el sistema.
-- =====================================================================

SELECT
    s.chain,
    s.address,
    c.ticker,
    c.name,
    c.market_cap_usd,
    s.score,
    s.tier,
    s.classification,
    s.source_count                        AS fuentes,
    s.mention_count                       AS menciones,
    ROUND(s.avg_channel_reputation::numeric, 3) AS rep_promedio_canal,
    s.scored_at
FROM token_scores s
LEFT JOIN canonical_token_calls c
       ON c.id = s.id AND c.chain = s.chain
ORDER BY s.score DESC, s.scored_at DESC
LIMIT 50;