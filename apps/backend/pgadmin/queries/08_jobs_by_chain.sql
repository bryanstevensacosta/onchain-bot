-- =====================================================================
-- alpha-meta-token-scanner :: Jobs by Chain & Status
-- =====================================================================
-- Distribución de jobs agrupados por chain y estado.
-- =====================================================================

SELECT
    chain,
    status,
    COUNT(*)                  AS total,
    AVG(attempts)::numeric(10,1) AS avg_attempts,
    MAX(attempts)             AS max_attempts,
    MIN(scheduled_at)         AS primer_scheduled,
    MAX(scheduled_at)         AS ultimo_scheduled
FROM call_evaluation_jobs
GROUP BY chain, status
ORDER BY chain, status;