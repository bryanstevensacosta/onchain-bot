import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { GeckoTerminalService } from './geckoterminal.service';
import {
  GECKOTERMINAL_CONFIG,
  type GeckoTerminalConfig,
} from './geckoterminal.config';
import { RetryableProviderError } from '../../domain/retryable-provider.error';

/**
 * One-shot ATH-seed day leg (dexter plan todo 68): bounds, params and
 * failure taxonomy of `getPoolOhlcvDay`. All network mocked at the
 * axios layer — the taxonomy pinned here is what the seed's negative
 * memo classifies on:
 *
 * - `null` = DEFINITIVE absence (404 / 400 / 401 / empty / invalid
 *   rows) -> memoizable by the caller;
 * - THROW `RetryableProviderError` = TRANSIENT (429 — headerless
 *   included — and 5xx/timeout) -> never memoized, retried next
 *   request;
 * - anything else -> logged + `null` (same fail-open shape every leg
 *   above uses).
 */
const POOL = '0x9c7ec8b1a2f4de5c6b7a8091d2e3f4a5b6c7d8e9';
const MINT = '0xAbCd000000000000000000000000000000000001';

async function realService(): Promise<GeckoTerminalService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      GeckoTerminalService,
      { provide: GECKOTERMINAL_CONFIG, useValue: {} as GeckoTerminalConfig },
    ],
  }).compile();
  return module.get(GeckoTerminalService);
}

function ohlcvList(): ReadonlyArray<ReadonlyArray<unknown>> {
  return [
    [1_760_000_000, '5', '6', '4', '5.5', '1000'],
    [1_759_913_600, 3, 4, 2, 3.5, 900],
  ];
}

describe('GeckoTerminalService.getPoolOhlcvDay (todo 68 ATH seed)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls the day endpoint with the pinned params + 2s timeout, parses rows', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: { attributes: { ohlcv_list: ohlcvList() } } },
    });
    const rows = await service.getPoolOhlcvDay('robinhood', POOL, 'base');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(`/networks/robinhood/pools/${POOL}/ohlcv/day`),
      expect.objectContaining({
        params: { aggregate: 1, limit: 100, currency: 'usd', token: 'base' },
        timeout: 2_000,
      }),
    );
    expect(rows).toEqual([
      [1_760_000_000, 5, 6, 4, 5.5, 1000],
      [1_759_913_600, 3, 4, 2, 3.5, 900],
    ]);
  });

  it('selects the quote-side series when asked (token=quote)', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: { attributes: { ohlcv_list: ohlcvList() } } },
    });
    await service.getPoolOhlcvDay('robinhood', POOL, 'quote');
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: { aggregate: 1, limit: 100, currency: 'usd', token: 'quote' },
      }),
    );
  });

  it('empty / absent / malformed series resolve null (definitive absence)', async () => {
    const service = await realService();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { data: null } });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).resolves.toBeNull();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: { attributes: { ohlcv_list: [] } } },
    });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).resolves.toBeNull();
    // Short rows + non-finite cells are skipped; all-skipped -> null.
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: {
          attributes: {
            ohlcv_list: [
              [1, 2, 3],
              [4, 5, 'nope', 7, 8, 9],
            ],
          },
        },
      },
    });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).resolves.toBeNull();
  });

  it('404 resolves null (pool/series absent — memoizable)', async () => {
    const service = await realService();
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue({ response: { status: 404 }, isAxiosError: true });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).resolves.toBeNull();
  });

  it('400/401 resolve null (definitive absence — window/params)', async () => {
    const service = await realService();
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    for (const status of [400, 401]) {
      jest
        .spyOn(axios, 'get')
        .mockRejectedValue({ response: { status }, isAxiosError: true });
      await expect(
        service.getPoolOhlcvDay('robinhood', POOL, 'base'),
      ).resolves.toBeNull();
    }
  });

  it('429 with Retry-After THROWS RetryableProviderError (transient, never memoized)', async () => {
    const service = await realService();
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    jest.spyOn(axios, 'get').mockRejectedValue({
      response: { status: 429, headers: { 'retry-after': '1' } },
      isAxiosError: true,
    });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).rejects.toBeInstanceOf(RetryableProviderError);
  });

  it('HEADERLESS 429 still throws (throttle is transient, not absence)', async () => {
    const service = await realService();
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue({ response: { status: 429 }, isAxiosError: true });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).rejects.toMatchObject({ kind: 'rate-limited', status: 429 });
  });

  it('5xx / timeout codes throw; unclassified network errors resolve null', async () => {
    const service = await realService();
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue({ response: { status: 500 }, isAxiosError: true });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).rejects.toBeInstanceOf(RetryableProviderError);
    jest.spyOn(axios, 'get').mockRejectedValue({ code: 'ECONNABORTED' });
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).rejects.toMatchObject({ kind: 'timeout' });
    jest.restoreAllMocks();
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('socket hang up'));
    await expect(
      service.getPoolOhlcvDay('robinhood', POOL, 'base'),
    ).resolves.toBeNull();
  });

  it('never leaks the mint: the day leg is pool-addressed only', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: { attributes: { ohlcv_list: [] } } },
    });
    await service.getPoolOhlcvDay('robinhood', POOL, 'base');
    const [url] = spy.mock.calls[0] as [string, unknown];
    expect(url).not.toContain(MINT);
  });
});
