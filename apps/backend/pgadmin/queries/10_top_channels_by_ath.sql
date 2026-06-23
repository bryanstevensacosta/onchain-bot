-- =====================================================================
-- alpha-meta-token-scanner :: Top Channels by ATH Multiple
-- =====================================================================
-- Canales cuyo ATH promedio en llamadas ha sido más alto.
-- =====================================================================

SELECT
    s.channel_id,
    ch.username,
    ch.title,
    s.total_calls,
    s.strong_calls,
    ROUND(s.avg_ath_multiple::numeric, 2)        AS ath_promedio,
    ROUND(s.score::numeric, 3)                   AS reputacion,
    s.confidence
FROM channel_reputation_stats s
LEFT JOIN telegram_channels ch ON ch.channel_id = s.channel_id
WHERE s.total_calls >= 3
ORDER BY s.avg_ath_multiple DESC NULLS LAST
LIMIT 25;