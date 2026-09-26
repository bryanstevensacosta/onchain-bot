/**
 * DI tokens for the enrichment BC (Tramo 1, todo 8).
 */
export const MARKET_DATA_PROVIDERS = Symbol('MARKET_DATA_PROVIDERS');

/** Inner leaf ports tried in order by the local cascade (default: none). */
export const LOCAL_CASCADE_DELEGATES = Symbol('LOCAL_CASCADE_DELEGATES');

/** Base URL for the HTTP market-data leaf (default: localhost:3060). */
export const MARKET_DATA_BASE_URL = Symbol('MARKET_DATA_BASE_URL');

/** Per-request timeout ms for the HTTP market-data leaf (default: 2000). */
export const MARKET_DATA_TIMEOUT_MS = Symbol('MARKET_DATA_TIMEOUT_MS');
