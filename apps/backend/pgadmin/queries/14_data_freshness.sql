-- =====================================================================
-- alpha-meta-token-scanner :: Data Freshness
-- =====================================================================
-- Cuán frescos son los datos por tabla (tiempo desde último registro).
-- =====================================================================

SELECT 'telegram_channels'           AS tabla, MAX(added_at)            AS ultimo, MAX(updated_at)         AS ultimo_update, AGE(NOW(), MAX(COALESCE(updated_at, added_at)))              AS frescura FROM telegram_channels
UNION ALL
SELECT 'canonical_token_calls'       AS tabla, MAX(created_at)          AS ultimo, MAX(last_seen_at)        AS ultimo_update, AGE(NOW(), MAX(last_seen_at))                              AS frescura FROM canonical_token_calls
UNION ALL
SELECT 'call_evaluation_jobs'        AS tabla, MAX(created_at)          AS ultimo, MAX(completed_at)        AS ultimo_update, AGE(NOW(), MAX(COALESCE(completed_at, created_at)))        AS frescura FROM call_evaluation_jobs
UNION ALL
SELECT 'call_performances'           AS tabla, MAX(created_at)          AS ultimo, MAX(evaluated_at)        AS ultimo_update, AGE(NOW(), MAX(evaluated_at))                              AS frescura FROM call_performances
UNION ALL
SELECT 'channel_reputation_stats'    AS tabla, NULL                     AS ultimo, MAX(last_evaluated_at)   AS ultimo_update, AGE(NOW(), MAX(last_evaluated_at))                           AS frescura FROM channel_reputation_stats
UNION ALL
SELECT 'token_classifications'       AS tabla, MAX(created_at)          AS ultimo, MAX(classified_at)       AS ultimo_update, AGE(NOW(), MAX(classified_at))                             AS frescura FROM token_classifications
UNION ALL
SELECT 'token_scores'                AS tabla, MAX(created_at)          AS ultimo, MAX(scored_at)           AS ultimo_update, AGE(NOW(), MAX(scored_at))                                 AS frescura FROM token_scores
ORDER BY tabla;