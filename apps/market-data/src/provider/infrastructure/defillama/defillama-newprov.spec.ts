import axios from 'axios';
import {
  DEFILLAMA_SUPPORTED_CHAINS,
  DefiLlamaService,
  resolveDefiLlamaCoin,
} from './defillama.service';

/**
 * New providers (dexter plan todo 32): DeFiLlama Coins keyless legs.
 *
 * Fixtures are byte-faithful to live keyless captures (this lane,
 * 2026-10-09, evidence `.omo/evidence/task-fe-newprov.log`):
 * `GET /prices/current/ethereum:0xC02a…Cc2` (WETH 2482.25, conf 0.99)
 * and `GET /chart/ethereum:0xC02a…Cc2` (1-point coarse series — the
 * documented ATH weakness).
 */
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

function service(): DefiLlamaService {
  return new DefiLlamaService({ baseUrl: undefined });
}

describe('DeFiLlama (todo 32: keyless price + chart-max)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves proven chains and refuses robinhood (never invent coverage)', () => {
    expect(resolveDefiLlamaCoin('ethereum', WETH)).toBe(`ethereum:${WETH}`);
    expect(resolveDefiLlamaCoin('unichain', WETH)).toBe(`unichain:${WETH}`);
    expect(resolveDefiLlamaCoin('robinhood', WETH)).toBeNull();
    expect(resolveDefiLlamaCoin('ethereum', '  ')).toBeNull();
  });

  it('queries only STATIC-catalog chains (optimism/unichain mapped-but-unqueried)', () => {
    expect([...DEFILLAMA_SUPPORTED_CHAINS]).toEqual([
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ]);
  });

  it('getPrice hits /prices/current/{coin} and returns the entry (live shape)', async () => {
    const svc = service();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        coins: {
          [`ethereum:${WETH}`]: {
            decimals: 18,
            symbol: 'WETH',
            price: 2482.2571247035803,
            timestamp: 1791573594,
            confidence: 0.99,
          },
        },
      },
    });
    const priced = await svc.getPrice('ethereum', WETH);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(`/prices/current/ethereum:${WETH}`),
      expect.anything(),
    );
    expect(priced?.price).toBe(2482.2571247035803);
    expect(priced?.symbol).toBe('WETH');
  });

  it('getPrice returns null on miss (unknown coin), 404, and sub-confidence', async () => {
    const svc = service();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { coins: {} } });
    await expect(svc.getPrice('ethereum', WETH)).resolves.toBeNull();
    jest.restoreAllMocks();
    jest.spyOn(axios, 'get').mockRejectedValue({ response: { status: 404 } });
    await expect(svc.getPrice('ethereum', WETH)).resolves.toBeNull();
    jest.restoreAllMocks();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        coins: { [`ethereum:${WETH}`]: { price: 1.0, confidence: 0.1 } },
      },
    });
    await expect(svc.getPrice('ethereum', WETH)).resolves.toBeNull();
  });

  it('getPrice returns null zero-network for unmapped chains', async () => {
    const svc = service();
    const spy = jest.spyOn(axios, 'get');
    await expect(svc.getPrice('robinhood', WETH)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('getChartMax returns the client-side max (weakness pinned: 1-point series)', async () => {
    const svc = service();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        coins: {
          [`ethereum:${WETH}`]: {
            symbol: 'WETH',
            confidence: 0.99,
            prices: [{ timestamp: 1791570656, price: 2482.018876524298 }],
          },
        },
      },
    });
    const max = await svc.getChartMax('ethereum', WETH);
    // Single coarse point: max IS the point — this is why the fetcher
    // never wires the chart (ATH stays own-history, ATH-history rule).
    expect(max?.maxPrice).toBe(2482.018876524298);
    expect(max?.at).toBe(new Date(1791570656 * 1_000).toISOString());
  });

  it('getChartMax picks the max over multi-point series, null on empty/404', async () => {
    const svc = service();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        coins: {
          [`ethereum:${WETH}`]: {
            prices: [
              { timestamp: 100, price: 10 },
              { timestamp: 200, price: 30 },
              { timestamp: 300, price: 20 },
            ],
          },
        },
      },
    });
    const max = await svc.getChartMax('ethereum', WETH);
    expect(max).toEqual({
      maxPrice: 30,
      at: new Date(200 * 1_000).toISOString(),
    });
    jest.restoreAllMocks();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { coins: {} } });
    await expect(svc.getChartMax('ethereum', WETH)).resolves.toBeNull();
  });

  it('propagates retryable errors to the 19b2 wrapper (429-with-Retry-After)', async () => {
    const svc = service();
    const retryable = {
      response: { status: 429, headers: { 'retry-after': '1' } },
      code: 'ERR_BAD_REQUEST',
    };
    jest.spyOn(axios, 'get').mockRejectedValue(retryable);
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    await expect(svc.getPrice('ethereum', WETH)).rejects.toThrow();
    await expect(svc.getChartMax('ethereum', WETH)).rejects.toThrow();
  });
});
