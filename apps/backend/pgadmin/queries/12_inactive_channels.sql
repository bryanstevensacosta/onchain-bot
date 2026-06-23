-- =====================================================================
-- alpha-meta-token-scanner :: Inactive Channels
-- =====================================================================
-- Canales marcados como inactivos o sin ingestar recientemente.
-- =====================================================================

SELECT
    channel_id,
    username,
    title,
    is_active,
    last_ingested_at,
    AGE(NOW(), last_ingested_at)     AS sin_ingestar_hace,
    added_at
FROM telegram_channels
WHERE is_active = FALSE
   OR last_ingested_at IS NULL
   OR last_ingested_at < NOW() - INTERVAL '7 days'
ORDER BY last_ingested_at DESC NULLS FIRST;