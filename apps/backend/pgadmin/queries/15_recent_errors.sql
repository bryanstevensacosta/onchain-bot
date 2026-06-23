-- =====================================================================
-- alpha-meta-token-scanner :: Recent Evaluation Errors
-- =====================================================================
-- Últimos errores registrados en jobs de evaluación.
-- =====================================================================

SELECT
    id,
    chain,
    address,
    status,
    attempts,
    scheduled_at,
    completed_at,
    LEFT(last_error, 200) AS last_error_truncated
FROM call_evaluation_jobs
WHERE last_error IS NOT NULL
  AND last_error <> ''
ORDER BY COALESCE(completed_at, scheduled_at) DESC NULLS LAST
LIMIT 50;