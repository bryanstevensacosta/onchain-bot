import { Logger } from '@nestjs/common';
import { ChainId } from 'chain/identity/chain-id.vo';
import {
  HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS,
  HttpMarketDataAdapter,
} from './http-market-data.adapter';

const ADDRESS = `0x${'a'.repeat(40)}`;

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('HttpMarketDataAdapter (backend leaf, USE_DATA_SERVICE_API=true)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    fetchMock.mockReset();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('default timeout honors the p95<500ms SLO budget', () => {
    expect(HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(2000);
  });

  it('maps an ok response onto the backend MarketData shape', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ priceUsd: 1.5, marketCapUsd: 42000, symbol: 'WIF' }),
    );
    const adapter = new HttpMarketDataAdapter();

    const result = await adapter.fetch(ChainId.ETHEREUM, ADDRESS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('chain=ethereum');
    expect(url).toContain(`address=${ADDRESS}`);
    expect(result?.priceUsd).toBe(1.5);
    expect(result?.marketCapUsd).toBe(42000);
    expect(result?.symbol).toBe('WIF');
    expect(result?.pairs).toEqual([]);
    expect(result?.imageUrls).toEqual([]);
  });

  it('non-ok status -> null (no throw, local cascade serves next)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const adapter = new HttpMarketDataAdapter();

    await expect(adapter.fetch(ChainId.ETHEREUM, ADDRESS)).resolves.toBeNull();
  });

  it('transport error -> null (no throw)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new HttpMarketDataAdapter();

    await expect(adapter.fetch(ChainId.ETHEREUM, ADDRESS)).resolves.toBeNull();
  });

  it('timeout -> null (aborts the request)', async () => {
    fetchMock.mockImplementation(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    process.env.MARKET_DATA_TIMEOUT_MS = '20';
    try {
      const adapter = new HttpMarketDataAdapter();

      await expect(
        adapter.fetch(ChainId.ETHEREUM, ADDRESS),
      ).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.MARKET_DATA_TIMEOUT_MS;
    }
  });
});
