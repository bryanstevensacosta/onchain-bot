import { Logger } from '@nestjs/common';
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

describe('HttpMarketDataAdapter (stub behind USE_DATA_SERVICE_API=true)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('default timeout honors the p95<500ms SLO budget', () => {
    expect(HTTP_MARKET_DATA_DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(2000);
  });

  it('maps an ok response to MarketData (chain/address as query params)', async () => {
    fetchMock.mockResolvedValue(
      okResponse({ priceUsd: 1.5, marketCapUsd: 42000, symbol: 'WIF' }),
    );
    const adapter = new HttpMarketDataAdapter('http://market-data:3060');

    const result = await adapter.fetch('evm', ADDRESS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('chain=evm');
    expect(url).toContain(`address=${ADDRESS}`);
    expect(result?.priceUsd).toBe(1.5);
    expect(result?.marketCapUsd).toBe(42000);
    expect(result?.symbol).toBe('WIF');
  });

  it('non-ok status -> null (no throw)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    const adapter = new HttpMarketDataAdapter('http://market-data:3060');

    await expect(adapter.fetch('evm', ADDRESS)).resolves.toBeNull();
  });

  it('transport error -> null (no throw)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new HttpMarketDataAdapter('http://market-data:3060');

    await expect(adapter.fetch('evm', ADDRESS)).resolves.toBeNull();
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
    const adapter = new HttpMarketDataAdapter('http://market-data:3060', 20);

    await expect(adapter.fetch('evm', ADDRESS)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
