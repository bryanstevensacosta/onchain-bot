-- =====================================================================
-- alpha-meta-token-scanner :: Risky / Flagged Tokens
-- =====================================================================
-- Tokens con flags de seguridad o clasificaciones de riesgo.
-- =====================================================================

SELECT
    c.chain,
    c.address,
    cc.ticker,
    cc.name,
    cc.market_cap_usd,
    cc.liquidity_usd,
    c.classification,
    c.security_flag,
    c.highest_severity,
    ROUND(c.confidence::numeric, 2)     AS confianza,
    c.risk_weight,
    ROUND(c.snapshot_completeness::numeric, 2) AS completitud,
    c.signals,
    c.classified_at
FROM token_classifications c
LEFT JOIN canonical_token_calls cc
       ON cc.id = c.id AND cc.chain = c.chain
WHERE c.security_flag <> 'none'
   OR c.risk_weight > 0
   OR c.highest_severity IN ('high', 'critical')
ORDER BY c.risk_weight DESC, c.classified_at DESC;