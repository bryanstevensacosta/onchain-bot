-- =====================================================================
-- alpha-meta-token-scanner :: Channel Performance Ranking
-- =====================================================================
-- Canales ordenados por reputación y precisión de llamadas.
-- =====================================================================

SELECT
    s.channel_id,
    ch.username,
    ch.title,
    ch.is_active,
    ROUND(s.score::numeric, 3)         AS reputacion,
    s.total_calls,
    s.strong_calls,
    s.good_calls,
    s.neutral_calls,
    s.poor_calls,
    s.failed_calls,
    CASE WHEN s.total_calls > 0
         THEN ROUND((s.strong_calls + s.good_calls)::numeric * 100 / s.total_calls, 1)
         ELSE 0
    END                                 AS winrate_pct,
    ROUND(s.avg_ath_multiple::numeric, 2) AS ath_promedio,
    s.confidence,
    s.last_evaluated_at
FROM channel_reputation_stats s
LEFT JOIN telegram_channels ch ON ch.channel_id = s.channel_id
ORDER BY s.score DESC, s.total_calls DESC;