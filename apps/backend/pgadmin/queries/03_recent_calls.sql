-- =====================================================================
-- alpha-meta-token-scanner :: Recent Canonical Calls
-- =====================================================================
-- Llamadas canónicas vistas recientemente en el sistema.
-- =====================================================================

SELECT
    chain,
    address,
    ticker,
    name,
    market_cap_usd,
    liquidity_usd,
    fdv_usd,
    holders,
    mention_count,
    last_confidence,
    first_seen_at,
    last_seen_at,
    AGE(NOW(), last_seen_at)           AS visto_hace
FROM canonical_token_calls
ORDER BY last_seen_at DESC
LIMIT 100;