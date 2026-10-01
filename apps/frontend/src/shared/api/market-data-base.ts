import { MARKET_DATA_BASE_URL } from '@/shared/config/env';

/**
 * Same-origin prefix that fronts market-data in dev (vite proxies it
 * to `:4000` — `MARKET_DATA_PROXY_TARGET`, default
 * `http://localhost:4000`; staging `:4001`, prod `:4002` via env
 * override).
 */
export const MARKET_DATA_PREFIX = '/market-data-api';

/**
 * Build a market-data path. Same-origin `/market-data-api/*` by default
 * (vite dev proxy / future nginx location strips the prefix); when
 * `VITE_MARKET_DATA_URL` is set (absolute service URL, e.g. direct
 * `:4001` staging access) the service path is used verbatim.
 */
export function marketDataPath(
  rest: string,
  base: string = MARKET_DATA_BASE_URL,
): string {
  const normalized = rest.startsWith('/') ? rest : `/${rest}`;
  if (base) {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}${normalized}`;
  }
  return `${MARKET_DATA_PREFIX}${normalized}`;
}
