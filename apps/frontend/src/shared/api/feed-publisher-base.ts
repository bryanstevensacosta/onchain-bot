import { FEED_PUBLISHER_BASE_URL } from '@/shared/config/env';

/**
 * Same-origin prefix that fronts feed-publisher in dev (vite proxies it
 * to `:3040` — `FEED_PUBLISHER_PROXY_TARGET`, default
 * `http://localhost:3040`; staging `:3041`, prod `:3042`).
 *
 * NOTE the FEED naming (not CONTENT): the app + env vars were renamed
 * `content-publisher` → `feed-publisher` (P35), so every var/proxy in
 * this file says FEED (`VITE_FEED_PUBLISHER_URL`,
 * `FEED_PUBLISHER_PROXY_TARGET`).
 */
export const FEED_PUBLISHER_PREFIX = '/feed-api';

/**
 * Build a feed-publisher path. Same-origin `/feed-api/*` by default
 * (vite dev proxy / future nginx location strips the prefix); when
 * `VITE_FEED_PUBLISHER_URL` is set (absolute service URL, e.g. direct
 * `:3041` staging access) the service path is used verbatim.
 */
export function feedPublisherPath(
  rest: string,
  base: string = FEED_PUBLISHER_BASE_URL,
): string {
  const normalized = rest.startsWith('/') ? rest : `/${rest}`;
  if (base) {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}${normalized}`;
  }
  return `${FEED_PUBLISHER_PREFIX}${normalized}`;
}
