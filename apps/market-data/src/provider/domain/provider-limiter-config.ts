import type {
  ProviderDescriptor,
  ProviderKind,
} from './provider-descriptor';

/**
 * Per-provider limiter configuration (Tramo 3, todo 16, P48-bis).
 *
 * Every adapter exposes its FULL rate-limit contract through the port
 * layer (`DataProviderPort.getRateLimitConfig`): the sliding window,
 * the quota per window, the per-endpoint cost map, and the reconnect
 * backoff bounds. Fetchers enforce it pre-call and fail open with an
 * explicit error on deny — never a failed snapshot.
 *
 * Costs are bucket tokens per call inside the provider's own window
 * (dimensionally requests, not monthly CU budgets — Birdeye CU notes
 * stay in `.omo/evidence/providers-reference.md`). Unknown endpoints
 * cost 1; unknown providers get the conservative default.
 */
export interface ProviderBackoffConfig {
  readonly initialMs: number;
  readonly maxMs: number;
}

export interface ProviderRateLimitConfig {
  readonly windowMs: number;
  readonly limitPerWindow: number;
  readonly endpointCosts: Readonly<Record<string, number>>;
  readonly backoffInitialMs: number;
  readonly backoffMaxMs: number;
}

export const PROVIDER_LIMITER_DEFAULT_WINDOW_MS = 60_000;

export const PROVIDER_LIMITER_DEFAULT_PER_MIN = 60;

/** Mirrors the stream EXCHANGE_DOWN reconnect bounds (1s -> 30s). */
export const PROVIDER_LIMITER_DEFAULT_BACKOFF_INITIAL_MS = 1_000;

export const PROVIDER_LIMITER_DEFAULT_BACKOFF_MAX_MS = 30_000;

export const DEFAULT_PROVIDER_RATE_LIMIT_CONFIG: ProviderRateLimitConfig = {
  windowMs: PROVIDER_LIMITER_DEFAULT_WINDOW_MS,
  limitPerWindow: PROVIDER_LIMITER_DEFAULT_PER_MIN,
  endpointCosts: {},
  backoffInitialMs: PROVIDER_LIMITER_DEFAULT_BACKOFF_INITIAL_MS,
  backoffMaxMs: PROVIDER_LIMITER_DEFAULT_BACKOFF_MAX_MS,
};

export function resolveEndpointCost(
  config: ProviderRateLimitConfig,
  endpoint: string | undefined,
): number {
  if (!endpoint) {
    return 1;
  }
  const cost = config.endpointCosts[endpoint];
  return typeof cost === 'number' && cost >= 1 ? Math.floor(cost) : 1;
}

export type ProviderLimiterDescriptor = Pick<
  ProviderDescriptor,
  'name' | 'kind' | 'supportsChains' | 'rateLimitPerMin'
> & {
  readonly endpointCosts?: Readonly<Record<string, number>>;
  readonly backoffInitialMs?: number;
  readonly backoffMaxMs?: number;
};

export function resolveProviderLimiterConfig(
  descriptor: ProviderLimiterDescriptor | undefined,
  name: string,
): ProviderRateLimitConfig {
  void name;
  if (!descriptor) {
    return DEFAULT_PROVIDER_RATE_LIMIT_CONFIG;
  }
  return {
    windowMs: PROVIDER_LIMITER_DEFAULT_WINDOW_MS,
    limitPerWindow: descriptor.rateLimitPerMin,
    endpointCosts: descriptor.endpointCosts ?? {},
    backoffInitialMs:
      descriptor.backoffInitialMs ??
      PROVIDER_LIMITER_DEFAULT_BACKOFF_INITIAL_MS,
    backoffMaxMs:
      descriptor.backoffMaxMs ?? PROVIDER_LIMITER_DEFAULT_BACKOFF_MAX_MS,
  };
}

export type { ProviderKind };
