-- =====================================================================
-- alpha-meta-token-scanner :: Database Overview
-- =====================================================================
-- Vista rápida de todas las tablas: filas, tamaño, última actividad.
-- =====================================================================

SELECT
    schemaname                              AS schema,
    relname                                 AS tabla,
    n_live_tup                              AS filas_estimadas,
    pg_size_pretty(pg_total_relation_size(relid)) AS tamaño_total,
    seq_scan                                AS lecturas_seq,
    idx_scan                                AS lecturas_idx,
    last_vacuum                             AS ultimo_vacuum,
    last_autovacuum                         AS ultimo_autovacuum,
    last_analyze                            AS ultimo_analyze
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;