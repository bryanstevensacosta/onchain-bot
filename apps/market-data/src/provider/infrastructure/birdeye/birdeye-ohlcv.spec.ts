import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { BirdeyeService } from './birdeye.service';
import { BIRDEYE_CONFIG } from './birdeye.config';

/**
 * Birdeye token-level OHLCV leg (dexter plan todo 55, keyed smokes).
 *
 * Probe 2026-10-17 (`.omo/evidence/task-fe-keyed-smokes.log`): WENCAT
 * bsc `GET /defi/v3/ohlcv?type=1H` → HTTP 200, 18 hourly candles
 * covering the 24h window, `unix_time` epoch SECONDS. Rows below are
 * VERBATIM probe items (first two + the newest) — the mapping spec
 * pins the exact tuple order the OHLC backfill consumes.
 */
const WENCAT = '0xB596fc1980BA251B25B1D4BED33CB0B91bc17777';

const LIVE_ITEMS = [
  {
    o: 0.000012107787152685499,
    h: 0.000013945530999805002,
    l: 0.00001205082638452316,
    v: 62792996.77303118,
    c: 0.000013945530999805002,
    address: WENCAT,
    type: '1H',
    unix_time: 1792152000,
    v_usd: 831.5924043033376,
    currency: 'usd',
  },
  {
    o: 0.000013945530999805002,
    h: 0.000014062961116487644,
    l: 0.00001299725862644272,
    v: 22844507.695657387,
    c: 0.00001299725862644272,
    address: WENCAT,
    type: '1H',
    unix_time: 1792155600,
    v_usd: 308.7212235719517,
    currency: 'usd',
  },
  {
    o: 0.00001987106806930963,
    h: 0.00001989453755850527,
    l: 0.000019515402173685134,
    v: 7555047.119087909,
    c: 0.000019646778620411308,
    address: WENCAT,
    type: '1H',
    unix_time: 1792234800,
    v_usd: 148.91428905201278,
    currency: 'usd',
  },
];

const EXPECTED_ROWS = [
  [
    1792152000, 0.000012107787152685499, 0.000013945530999805002,
    0.00001205082638452316, 0.000013945530999805002, 62792996.77303118,
  ],
  [
    1792155600, 0.000013945530999805002, 0.000014062961116487644,
    0.00001299725862644272, 0.00001299725862644272, 22844507.695657387,
  ],
  [
    1792234800, 0.00001987106806930963, 0.00001989453755850527,
    0.000019515402173685134, 0.000019646778620411308, 7555047.119087909,
  ],
];

async function keyedService(): Promise<BirdeyeService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      BirdeyeService,
      { provide: BIRDEYE_CONFIG, useValue: { apiKey: 'test-key' } },
    ],
  }).compile();
  return module.get(BirdeyeService);
}

async function keylessService(): Promise<BirdeyeService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      BirdeyeService,
      { provide: BIRDEYE_CONFIG, useValue: { apiKey: '' } },
    ],
  }).compile();
  return module.get(BirdeyeService);
}

describe('Birdeye getTokenOhlcv (todo 55 keyed OHLC leg)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps v3 items to the verbatim [ts, o, h, l, c, v] tuple and sends the window params', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { success: true, data: { items: LIVE_ITEMS } },
    });
    const rows = await service.getTokenOhlcv(
      WENCAT,
      'bsc',
      '1H',
      1792146000,
      1792239600,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/defi/v3/ohlcv'),
      expect.objectContaining({
        params: {
          address: WENCAT,
          type: '1H',
          time_from: '1792146000',
          time_to: '1792239600',
        },
        headers: { 'X-API-KEY': 'test-key', 'x-chain': 'bsc' },
      }),
    );
    expect(rows).toEqual(EXPECTED_ROWS);
  });

  it('omits the window params when no bounds are given (upstream defaults)', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { success: true, data: { items: LIVE_ITEMS } },
    });
    await service.getTokenOhlcv(WENCAT, 'bsc');
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { address: WENCAT, type: '1H' },
      }),
    );
  });

  it('skips malformed rows, empty items resolve null, failed envelope resolves null', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get');
    spy.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            LIVE_ITEMS[0],
            { o: 1, h: 1, l: 1, c: 1, v: 1, unix_time: 'not-a-number' },
            { o: 1, h: 1, l: 1, c: Number.NaN, v: 1, unix_time: 1792159200 },
            { o: 1, h: 1, l: 1, v: 1, unix_time: 1792159200 },
          ],
        },
      },
    });
    await expect(service.getTokenOhlcv(WENCAT, 'bsc')).resolves.toEqual([
      EXPECTED_ROWS[0],
    ]);
    spy.mockResolvedValueOnce({
      data: { success: true, data: { items: [] } },
    });
    await expect(service.getTokenOhlcv(WENCAT, 'bsc')).resolves.toBeNull();
    spy.mockResolvedValueOnce({
      data: { success: false, data: null },
    });
    await expect(service.getTokenOhlcv(WENCAT, 'bsc')).resolves.toBeNull();
  });

  it('keyless and unmapped chains resolve null zero-network (fail-open)', async () => {
    const keyless = await keylessService();
    const keylessSpy = jest.spyOn(axios, 'get');
    await expect(keyless.getTokenOhlcv(WENCAT, 'bsc')).resolves.toBeNull();
    expect(keylessSpy).not.toHaveBeenCalled();

    const keyed = await keyedService();
    const unmappedSpy = jest.spyOn(axios, 'get');
    await expect(keyed.getTokenOhlcv(WENCAT, 'unichain')).resolves.toBeNull();
    expect(unmappedSpy).not.toHaveBeenCalled();
  });

  it('404 resolves null without throwing', async () => {
    const service = await keyedService();
    jest.spyOn(axios, 'get').mockRejectedValue({ response: { status: 404 } });
    await expect(service.getTokenOhlcv(WENCAT, 'bsc')).resolves.toBeNull();
  });
});
