-- =====================================================================
-- alpha-meta-token-scanner :: Call Performance Distribution
-- =====================================================================
-- Distribución de outcomes de las llamadas evaluadas.
-- =====================================================================

SELECT
    outcome,
    COUNT(*)                            AS total,
    COUNT(DISTINCT channel_id)          AS canales_unicos,
    COUNT(DISTINCT token_id)            AS tokens_unicos,
    ROUND(AVG(ath_multiple)::numeric, 3) AS ath_promedio,
    ROUND(AVG(mc_at_call)::numeric, 2)   AS mc_promedio_call,
    MIN(call_timestamp)                  AS primera,
    MAX(call_timestamp)                  AS ultima
FROM call_performances
GROUP BY outcome
ORDER BY total DESC;