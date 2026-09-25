/**
 * Gateway edge policy (Tramo 3, todo 12, P50 — gateway domain).
 *
 * Pure edge constants + key builders. The ONLY place that knows the
 * 60 req/min/IP budget, the 50-item batch cap, the 30s batch TTL, and
 * the per-item batch cache key shared with the GET edge (so batch
 * traffic warms single reads and vice versa — the SLO layer for
 * p95<500ms). Moved verbatim from the guard + batch controller.
 */
export const GATEWAY_LIMIT_PER_MINUTE = 60;

export const GATEWAY_WINDOW_MS = 60_000;

export const GATEWAY_BATCH_MAX_ITEMS = 50;

export const GATEWAY_BATCH_TTL_SECONDS = 30;

export function buildGatewayClientKey(client: string): string {
  return `gw:${client}`;
}

export function buildBatchCacheKey(chain: string, address: string, kind: string): string {
  return `GET:/api/v1/addresses/${chain}/${address}?kind=${kind}`;
}
