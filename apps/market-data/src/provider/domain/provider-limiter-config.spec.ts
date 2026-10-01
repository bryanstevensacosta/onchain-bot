import {
  DEFAULT_PROVIDER_RATE_LIMIT_CONFIG,
  resolveEndpointCost,
  resolveProviderLimiterConfig,
} from './provider-limiter-config';

/**
 * Failing-first spec (Tramo 3, todo 16, P48-bis).
 *
 * Every provider exposes its FULL limiter configuration through the
 * port layer: window, quota, per-endpoint cost, and backoff. Unknown
 * providers fall back to the conservative default — never unlimited.
 */
describe('provider limiter config (P48-bis)', () => {
  it('exposes full defaults (window, quota, cost map, backoff)', () => {
    expect(DEFAULT_PROVIDER_RATE_LIMIT_CONFIG).toEqual({
      windowMs: 60_000,
      limitPerWindow: 60,
      endpointCosts: {},
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
    });
  });

  it('resolves cost 1 for unknown endpoints and missing endpoint', () => {
    expect(
      resolveEndpointCost(DEFAULT_PROVIDER_RATE_LIMIT_CONFIG, 'quote'),
    ).toBe(1);
    expect(
      resolveEndpointCost(DEFAULT_PROVIDER_RATE_LIMIT_CONFIG, undefined),
    ).toBe(1);
  });

  it('resolves the configured per-endpoint cost (ccxt ohlcv is heavier)', () => {
    const config = resolveProviderLimiterConfig({
      name: 'ccxt',
      kind: 'market',
      supportsChains: [],
      rateLimitPerMin: 600,
      endpointCosts: { ticker: 1, ohlcv: 5 },
    });
    expect(resolveEndpointCost(config, 'ticker')).toBe(1);
    expect(resolveEndpointCost(config, 'ohlcv')).toBe(5);
  });

  it('composes descriptor quota + costs + backoff', () => {
    const config = resolveProviderLimiterConfig({
      name: 'ccxt',
      kind: 'market',
      supportsChains: [],
      rateLimitPerMin: 600,
      endpointCosts: { ticker: 1 },
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
    });
    expect(config).toEqual({
      windowMs: 60_000,
      limitPerWindow: 600,
      endpointCosts: { ticker: 1 },
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
    });
  });

  it('falls back to defaults when the descriptor is unknown', () => {
    expect(resolveProviderLimiterConfig(undefined, 'nope')).toEqual(
      DEFAULT_PROVIDER_RATE_LIMIT_CONFIG,
    );
  });
});
