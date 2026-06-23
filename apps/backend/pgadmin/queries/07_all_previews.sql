-- =====================================================================
-- alpha-meta-token-scanner :: Universal Quick Preview
-- =====================================================================
-- Hasta 5 filas de cada tabla en una sola consulta (todo a la vista).
-- =====================================================================

SELECT tabla, id, detail
FROM (
    SELECT 'telegram_channels'        AS tabla, channel_id::text AS id, username::text AS detail, added_at AS ts FROM telegram_channels
    UNION ALL
    SELECT 'canonical_token_calls'    AS tabla, id              AS id, COALESCE(ticker,'-')||' mc='||COALESCE(market_cap_usd::text,'-'), last_seen_at FROM canonical_token_calls
    UNION ALL
    SELECT 'call_evaluation_jobs'     AS tabla, id              AS id, status||' attempts='||attempts, scheduled_at FROM call_evaluation_jobs
    UNION ALL
    SELECT 'call_performances'        AS tabla, id::text        AS id, outcome||' ath='||COALESCE(ath_multiple::text,'-'), evaluated_at FROM call_performances
    UNION ALL
    SELECT 'channel_reputation_stats' AS tabla, channel_id      AS id, 'score='||ROUND(score::numeric,3)||' calls='||total_calls, last_evaluated_at FROM channel_reputation_stats
    UNION ALL
    SELECT 'token_classifications'    AS tabla, id||':'||chain  AS id, classification||' flag='||security_flag, classified_at FROM token_classifications
    UNION ALL
    SELECT 'token_scores'             AS tabla, id||':'||chain  AS id, 'score='||score||' tier='||tier, scored_at FROM token_scores
) p
ORDER BY tabla, ts DESC NULLS LAST;