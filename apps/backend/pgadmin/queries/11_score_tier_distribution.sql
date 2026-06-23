-- =====================================================================
-- alpha-meta-token-scanner :: Score Tier Distribution
-- =====================================================================
-- Distribución de tokens por tier y classification.
-- =====================================================================

SELECT
    tier,
    classification,
    COUNT(*)                       AS total,
    ROUND(AVG(score)::numeric, 1)  AS score_promedio,
    MIN(score)                     AS min_score,
    MAX(score)                     AS max_score,
    ROUND(AVG(mention_count)::numeric, 1) AS menciones_promedio,
    ROUND(AVG(source_count)::numeric, 1)  AS fuentes_promedio
FROM token_scores
GROUP BY tier, classification
ORDER BY
    CASE tier WHEN 'STRONG' THEN 1 WHEN 'GOOD' THEN 2 WHEN 'NEUTRAL' THEN 3 ELSE 4 END,
    classification;