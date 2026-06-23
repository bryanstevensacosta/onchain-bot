-- =====================================================================
-- alpha-meta-token-scanner :: Score Evolution (last 24h)
-- =====================================================================
-- Cuántos scores se han generado por hora en las últimas 24h.
-- =====================================================================

SELECT
    date_trunc('hour', scored_at)               AS hora,
    COUNT(*)                                    AS scores_generados,
    COUNT(DISTINCT id||':'||chain)              AS tokens_unicos,
    ROUND(AVG(score)::numeric, 1)               AS score_promedio
FROM token_scores
WHERE scored_at > NOW() - INTERVAL '24 hours'
GROUP BY hora
ORDER BY hora;