// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it } from 'vitest';

import { MARKET_DATA_PREFIX, marketDataPath } from './market-data-base';

describe('marketDataPath', () => {
  it('routes through the same-origin /market-data-api proxy by default', () => {
    expect(marketDataPath('/api/v1/chains')).toBe(
      '/market-data-api/api/v1/chains',
    );
  });

  it('normalises a missing leading slash', () => {
    expect(marketDataPath('api/v1/providers')).toBe(
      '/market-data-api/api/v1/providers',
    );
  });

  it('keeps the compat snapshot route behind the same prefix', () => {
    expect(marketDataPath('/api/market-data/snapshot')).toBe(
      '/market-data-api/api/market-data/snapshot',
    );
  });

  it('uses an absolute VITE_MARKET_DATA_URL override without the proxy prefix', () => {
    expect(marketDataPath('/api/v1/chains', 'http://localhost:4000')).toBe(
      'http://localhost:4000/api/v1/chains',
    );
  });

  it('strips a trailing slash from the override base', () => {
    expect(marketDataPath('/api/v1/providers', 'http://localhost:4000/')).toBe(
      'http://localhost:4000/api/v1/providers',
    );
  });

  it('exposes the proxy prefix for route mocking', () => {
    expect(MARKET_DATA_PREFIX).toBe('/market-data-api');
  });
});
