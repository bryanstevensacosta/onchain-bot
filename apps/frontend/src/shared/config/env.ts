export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3030';

/**
 * Feed-publisher service base (Tramo 2, todo 9). Empty = same-origin
 * `/feed-api` proxy (vite dev → `:3040`, staging `:3041`, prod `:3042`).
 * Set to an absolute URL for direct service access.
 * FEED naming (not CONTENT) per the P35 content→feed rename.
 */
export const FEED_PUBLISHER_BASE_URL =
  import.meta.env.VITE_FEED_PUBLISHER_URL ?? '';

/**
 * Market-data service base (Tramo 3, todo 7). Empty = same-origin
 * `/market-data-api` proxy (vite dev → `:4000`, staging `:4001`,
 * prod `:4002`). Set to an absolute URL for direct service access.
 */
export const MARKET_DATA_BASE_URL = import.meta.env.VITE_MARKET_DATA_URL ?? '';
