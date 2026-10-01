/**
 * @deprecated Moved to apps/market-data/src/provider/infrastructure/alchemy/ (Tramo 3, todo 4, C-DATA-01).
 * Canonical owner is now market-data (ProvidersModule); this file is a
 * dual-run re-export shim so legacy backend consumers stay green.
 * Removed at cutover (todo 8). Do not extend it.
 *
 * New location: apps/market-data/src/provider/infrastructure/alchemy/
 * Reason: extracting market-data providers from backend monolith to dedicated app
 * Breaking change: Yes (removal at cutover)
 * Rollback: restore backend implementation from git history
 */
export * from '../../../../market-data/src/provider/infrastructure/alchemy/alchemy.types';
