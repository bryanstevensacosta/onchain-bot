/**
 * Source transport type — which KOL channel the mention came from.
 *
 * v1: only TELEGRAM is used in production.
 * v2: add DISCORD when a Discord ingestion BC is built.
 *
 * Adding a new value does NOT require touching consumers — the
 * `Source.kolId` is still the join key. The `SourceType` exists so
 * the system can attribute outcomes to specific transports and apply
 * per-transport rules (e.g., different reputation calculations).
 */
export type SourceType = 'TELEGRAM' | 'DISCORD' | 'OTHER';
