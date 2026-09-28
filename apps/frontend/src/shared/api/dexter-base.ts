import { DEXTER_BASE_URL } from '@/shared/config/env';

/**
 * Same-origin prefix that fronts dexter-onchain-bot in dev (vite
 * proxies it to `:4060` — `DEXTER_PROXY_TARGET`, default
 * `http://localhost:4060`; staging `:4061`, prod `:4062` via env
 * override).
 */
export const DEXTER_PREFIX = '/dexter-api';

/**
 * Build a dexter path. Same-origin `/dexter-api/*` by default
 * (vite dev proxy / future nginx location strips the prefix); when
 * `VITE_DEXTER_URL` is set (absolute service URL) the service path
 * is used verbatim.
 */
export function dexterPath(
  rest: string,
  base: string = DEXTER_BASE_URL,
): string {
  const normalized = rest.startsWith('/') ? rest : `/${rest}`;
  if (base) {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}${normalized}`;
  }
  return `${DEXTER_PREFIX}${normalized}`;
}
