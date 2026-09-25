import {
  STREAM_BACKOFF_BASE_MS,
  STREAM_BACKOFF_MAX_MS,
  STREAM_DEFAULT_EXCHANGES,
  STREAM_MAX_SUBS_PER_CLIENT,
  STREAM_OHLCV_SCOPE,
  STREAM_QUEUE_DEPTH,
  STREAM_TICKER_SCOPE,
  buildStreamRateKey,
  parseExchangeAllowlist,
  requiredScopeFor,
  streamBackoffMs,
} from './stream-policy';
import { buildGatewayClientKey } from 'gateway/domain/gateway-policy';

/**
 * Failing-first spec (Tramo 3, todo 11, P49): stream edge policy.
 */
describe('stream-policy', () => {
  it('caps a single client at 100 subscriptions (acceptance: 100 subs)', () => {
    expect(STREAM_MAX_SUBS_PER_CLIENT).toBe(100);
  });

  it('bounds per-client queues so a slow consumer cannot OOM the broker', () => {
    expect(STREAM_QUEUE_DEPTH).toBeGreaterThan(0);
    expect(STREAM_QUEUE_DEPTH).toBeLessThanOrEqual(1024);
  });

  it('requires read for tickers and snapshot for ohlcv (mirrors REST)', () => {
    expect(requiredScopeFor('ticker')).toBe(STREAM_TICKER_SCOPE);
    expect(requiredScopeFor('ticker')).toBe('read');
    expect(requiredScopeFor('ohlcv')).toBe(STREAM_OHLCV_SCOPE);
    expect(requiredScopeFor('ohlcv')).toBe('snapshot');
  });

  it('shares the rate-limit key with the REST guard (shared budget)', () => {
    expect(buildStreamRateKey('1.2.3.4')).toBe(buildGatewayClientKey('1.2.3.4'));
  });

  it('backs off exponentially with a 30s ceiling', () => {
    expect(streamBackoffMs(0)).toBe(STREAM_BACKOFF_BASE_MS);
    expect(streamBackoffMs(1)).toBe(STREAM_BACKOFF_BASE_MS * 2);
    expect(streamBackoffMs(100)).toBe(STREAM_BACKOFF_MAX_MS);
  });

  it('parses the exchange allowlist from env (lowercased, trimmed)', () => {
    expect(parseExchangeAllowlist('Binance, KRAKEN')).toEqual(['binance', 'kraken']);
    expect(parseExchangeAllowlist('')).toEqual(STREAM_DEFAULT_EXCHANGES);
    expect(parseExchangeAllowlist(undefined)).toEqual(STREAM_DEFAULT_EXCHANGES);
  });
});
