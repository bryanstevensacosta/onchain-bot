-- =====================================================================
-- alpha-meta-token-scanner :: Activity by Chain
-- =====================================================================
-- Resumen de actividad (tokens, scores, calls) por blockchain.
-- =====================================================================

SELECT
    chain,
    (SELECT COUNT(*) FROM canonical_token_calls    WHERE canonical_token_calls.chain    = c.chain) AS tokens,
    (SELECT COUNT(*) FROM token_scores             WHERE token_scores.chain             = c.chain) AS scored,
    (SELECT COUNT(*) FROM token_classifications    WHERE token_classifications.chain    = c.chain) AS classified,
    (SELECT COUNT(*) FROM call_evaluation_jobs     WHERE call_evaluation_jobs.chain     = c.chain) AS jobs_total,
    (SELECT COUNT(*) FROM call_evaluation_jobs     WHERE call_evaluation_jobs.chain     = c.chain AND status='failed') AS jobs_failed,
    (SELECT COUNT(*) FROM call_performances        WHERE call_performances.token_id IN (SELECT id FROM canonical_token_calls WHERE chain=c.chain)) AS performances
FROM (SELECT DISTINCT chain FROM canonical_token_calls) c
ORDER BY chain;