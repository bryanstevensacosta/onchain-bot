import { PUBLISHING_QUEUE_BASE_URL } from '@/shared/config/env';

/**
 * Same-origin prefix that fronts publishing-queue in dev (vite proxies
 * it to `:4080` — `PUBLISHING_QUEUE_PROXY_TARGET`, default
 * `http://localhost:4080`; staging `:4081`, prod `:4082`).
 *
 * Scheduling (ads catalog, rotation-config, media library) moved out of
 * feed-publisher into publishing-queue (2026-09-28, live-errors-fix):
 * `GET /feed-api/api/scheduling/*` (:3040) answers 404 since the move,
 * while the same paths on `:4080` answer 200. Backend legacy
 * (`/crypto-news-scheduling/*`, `/feed-scheduling/*`) stays untouched.
 */
export const SCHEDULING_PREFIX = '/scheduling-api';

/**
 * Build a publishing-queue path. Same-origin `/scheduling-api/*` by
 * default (vite dev proxy strips the prefix); when
 * `VITE_PUBLISHING_QUEUE_URL` is set (absolute service URL, e.g. direct
 * `:4081` staging access) the service path is used verbatim.
 */
export function schedulingPath(
  rest: string,
  base: string = PUBLISHING_QUEUE_BASE_URL,
): string {
  const normalized = rest.startsWith('/') ? rest : `/${rest}`;
  if (base) {
    const trimmed = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${trimmed}${normalized}`;
  }
  return `${SCHEDULING_PREFIX}${normalized}`;
}
