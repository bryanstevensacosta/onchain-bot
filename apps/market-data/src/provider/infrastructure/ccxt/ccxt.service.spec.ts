import { CcxtService } from './ccxt.service';

/**
 * Failing-first spec (Tramo 3, todo 16, P48 gap + P48-bis).
 *
 * The ccxt REST adapter (P48) covers CEX tickers/OHLCV only: it
 * short-circuits to null for onchain addresses, for exchanges outside
 * the allowlist, and when the optional `ccxt` peer is not installed
 * (fail-open null — the cascade keeps merging the other providers).
 * It exposes its full limiter config through the port (P48-bis).
 */
describe('CcxtService REST adapter (P48)', () => {
  it('builds with its canonical name', () => {
    const service = new CcxtService({
      defaultExchange: 'binance',
      exchanges: ['binance'],
    });
    expect(service.name).toBe('ccxt');
  });

  it('recognises CEX pair symbols and rejects onchain addresses', () => {
    expect(CcxtService.isCexSymbol('BTC/USDT')).toBe(true);
    expect(CcxtService.isCexSymbol('sol/usdc')).toBe(true);
    expect(
      CcxtService.isCexSymbol(
        'So11111111111111111111111111111111111111112',
      ),
    ).toBe(false);
    expect(CcxtService.isCexSymbol('0x1234')).toBe(false);
    expect(CcxtService.isCexSymbol('')).toBe(false);
  });

  it('returns null for exchanges outside the allowlist (no network)', async () => {
    const seen: Array<string> = [];
    const service = new CcxtService(
      { defaultExchange: 'binance', exchanges: ['binance'] },
      () => {
        seen.push('loaded');
        return {};
      },
    );
    await expect(service.fetchTicker('ftx', 'BTC/USDT')).resolves.toBeNull();
    expect(seen).toEqual([]);
  });

  it('returns null when the ccxt peer is missing (fail-open, never throws)', async () => {
    const service = new CcxtService(
      { defaultExchange: 'binance', exchanges: ['binance'] },
      () => {
        throw new Error('Cannot find module');
      },
    );
    await expect(
      service.fetchTicker('binance', 'BTC/USDT'),
    ).resolves.toBeNull();
    await expect(
      service.fetchOHLCV('binance', 'BTC/USDT'),
    ).resolves.toBeNull();
  });

  it('maps fetchTicker through the stubbed lib (ccxt hit first)', async () => {
    const service = new CcxtService(
      { defaultExchange: 'binance', exchanges: ['binance'] },
      () => ({
        binance: class {
          public readonly enableRateLimit = true;
          public async fetchTicker(symbol: string): Promise<unknown> {
            return { symbol, last: 42000.5 };
          }
        },
      }),
    );
    await expect(
      service.fetchTicker('binance', 'BTC/USDT'),
    ).resolves.toEqual({ symbol: 'BTC/USDT', last: 42000.5 });
  });

  it('exposes the full limiter config via the port (P48-bis)', () => {
    const service = new CcxtService({
      defaultExchange: 'binance',
      exchanges: ['binance'],
    });
    expect(service.getRateLimitConfig()).toEqual({
      windowMs: 60_000,
      limitPerWindow: 600,
      endpointCosts: { ticker: 1, ohlcv: 5, quote: 1 },
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
    });
  });
});
