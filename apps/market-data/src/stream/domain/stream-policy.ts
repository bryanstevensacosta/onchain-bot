import { buildGatewayClientKey } from 'gateway/domain/gateway-policy';
import type { ApiKeyScope } from 'auth/domain/api-key-scope';
import type { StreamKind } from './stream-types';

/**
 * Stream edge policy (Tramo 3, todo 11, P49 — stream domain).
 *
 * Pure constants + key builders. Subscribe traffic shares the SAME
 * sliding-window budget as REST (the key builder delegates to the
 * gateway policy, so a client hammering REST also throttles its WS
 * subscribes and vice versa — one budget, two transports).
 */

export const STREAM_MAX_SUBS_PER_CLIENT = 100;

export const STREAM_QUEUE_DEPTH = 128;

export const STREAM_BACKOFF_BASE_MS = 1000;

export const STREAM_BACKOFF_MAX_MS = 30_000;

export const STREAM_DEFAULT_EXCHANGES: ReadonlyArray<string> = ['binance', 'coinbase', 'kraken'];

export const STREAM_TICKER_SCOPE: ApiKeyScope = 'read';

export const STREAM_OHLCV_SCOPE: ApiKeyScope = 'snapshot';

export function requiredScopeFor(kind: StreamKind): ApiKeyScope {
  return kind === 'ohlcv' ? STREAM_OHLCV_SCOPE : STREAM_TICKER_SCOPE;
}

/** Exponential backoff in ms, capped at 30s (exchange-down retries). */
export function streamBackoffMs(attempt: number): number {
  const safe = Math.max(0, Math.floor(attempt));
  return Math.min(STREAM_BACKOFF_MAX_MS, STREAM_BACKOFF_BASE_MS * 2 ** safe);
}

/** Shared-budget key: identical to the REST guard key for the client. */
export function buildStreamRateKey(client: string): string {
  return buildGatewayClientKey(client);
}

export function parseExchangeAllowlist(raw: string | undefined): Array<string> {
  const parsed = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
  return parsed.length > 0 ? parsed : [...STREAM_DEFAULT_EXCHANGES];
}
