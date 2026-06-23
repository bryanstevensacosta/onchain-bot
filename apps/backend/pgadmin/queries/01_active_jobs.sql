-- =====================================================================
-- alpha-meta-token-scanner :: Active Evaluation Jobs
-- =====================================================================
-- Jobs pendientes, en proceso y recientemente completados/fallidos.
-- =====================================================================

SELECT
    id,
    chain,
    address,
    status,
    attempts,
    horizon,
    mc_at_call,
    scheduled_at,
    completed_at,
    CASE
        WHEN last_error IS NULL OR last_error = '' THEN NULL
        ELSE LEFT(last_error, 80)
    END                         AS last_error_short,
    AGE(NOW(), scheduled_at)    AS en_cola_hace
FROM call_evaluation_jobs
WHERE status IN ('pending', 'running', 'failed')
   OR completed_at > NOW() - INTERVAL '24 hours'
ORDER BY
    CASE status
        WHEN 'running'  THEN 1
        WHEN 'pending'  THEN 2
        WHEN 'failed'   THEN 3
        ELSE 4
    END,
    scheduled_at DESC NULLS LAST;