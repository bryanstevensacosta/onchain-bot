import axios from 'axios';
import { CacheService } from 'cache/application/cache.service';
import { InMemoryCacheAdapter } from 'cache/infrastructure/in-memory-cache.adapter';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { EVM_FACTORY_SETS } from '../domain/launchpad-table';
import {
  FLAPSH_CORROBORATION_CHAINS,
  LaunchpadDetectorService,
  flapCacheKey,
} from './launchpad-detector.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Fixtures verbatim from research 57
 * (`.omo/notepads/dexter-flapsh-pair-research.md`), re-probed live
 * 2026-10-17 (>=8s spacing) at implementation time: WENCAT flapsh pair
 * frozen (fdv 52090, liq null, price 0.00005208 — byte-identical to
 * the notepad); Froggie single flapsh pair live (liq 8863.5, fdv
 * 4003); CAKE 30 pairs 0 flapsh. The fourmeme negative control's
 * payload is from the notepad (its live probe now answers
 * `pairs: null` — delisted from DSC indexing, documented in the
 * evidence log).
 */
const WENCAT = '0xB596fc1980BA251B25B1D4BED33CB0B91bc17777';
const WENCAT_FLAPSH = '0xcf06C845597e0eF14814daf3cE101b40F211f009';
const FROGGIE = '0x22192FD46B991a71dEFe7CDa9a3701382a017777';
const STOCK_PAIRED = '0x4b621D07f417Fbf55D2fe8c823811efF8dfd7777';
const FOURMEME = '0xd8cf701dFD1aDA56649d0ecbbC6D46bfe16EFFfF';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const PRE_ERA = '0xbAb528425Edb1E0E36D3719bc3307d9C8ccE8888';
const TX = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

/**
 * Minimal live-shaped pair row. Only `dexId`/`chainId` are read by the
 * corroboration leg (side fields included so the stock-paired fixture
 * shape is honest — the base/quote addresses themselves are NOT part
 * of any assertion).
 */
function pair(f: {
  readonly chainId?: string;
  readonly dexId?: string;
  readonly pairAddress?: string;
  readonly baseAddress?: string;
  readonly baseSymbol?: string;
  readonly quoteAddress?: string;
  readonly liquidityUsd?: number | null;
  readonly fdv?: number | null;
  readonly priceUsd?: string | null;
  readonly pairCreatedAt?: number | null;
}): unknown {
  return {
    chainId: f.chainId ?? 'bsc',
    dexId: f.dexId ?? 'pancakeswap',
    url: 'https://dexscreener.com/bsc/0xpair',
    pairAddress: f.pairAddress ?? '0xpair',
    labels: [],
    baseToken: {
      address: f.baseAddress ?? '0xbase',
      name: 'Token',
      symbol: f.baseSymbol ?? 'TKN',
    },
    quoteToken: {
      address: f.quoteAddress ?? '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      name: 'WBNB',
      symbol: 'WBNB',
    },
    priceNative: '0',
    priceUsd: f.priceUsd === undefined ? '0.00005208' : f.priceUsd,
    txns: { h24: { buys: 0, sells: 0 } },
    volume: { h24: 0 },
    priceChange: null,
    liquidity: { usd: f.liquidityUsd ?? null, base: 0, quote: 0 },
    fdv: f.fdv ?? null,
    marketCap: null,
    pairCreatedAt: f.pairCreatedAt ?? 1791892874000,
  };
}

/** PCS-only shape (no flapsh pair) — the lane's negative/absence row. */
function pcsPair(extra: Parameters<typeof pair>[0] = {}): unknown {
  return pair({ dexId: 'pancakeswap', ...extra });
}

function stubRpc() {
  return {
    getMultipleAccounts: jest.fn(),
    getAccountInfo: jest.fn(),
  };
}

function realCache(): CacheService {
  return new CacheService(new InMemoryCacheAdapter());
}

interface DscHarnessOptions {
  readonly pairs?: ReadonlyArray<unknown> | null;
  readonly receiptTo?: string | null;
  readonly dscFails?: boolean;
  readonly cache?: CacheService | null;
  readonly seen?: string[];
}

/**
 * EVM harness: Phase-1 brand APIs all miss (404), Blockscout answers
 * the creation tx, the receipt answers `to`, and the DSC pair-list
 * endpoint answers `{ pairs }`. The REAL `DexScreenerService` is
 * injected (axios mocked) so URL + envelope + signal wiring are all
 * exercised, not just the detector's check.
 */
function detectorWithDsc(
  token: string,
  opts: DscHarnessOptions = {},
): { detector: LaunchpadDetectorService; seen: string[] } {
  const seen = opts.seen ?? [];
  mockedAxios.get.mockImplementation(async (url: string) => {
    seen.push(`GET ${String(url)}`);
    if (String(url).includes('api.dexscreener.com')) {
      if (opts.dscFails === true) throw new Error('dsc down');
      return {
        status: 200,
        data: { pairs: opts.pairs === undefined ? null : opts.pairs },
      };
    }
    if (String(url).includes('blockscout')) {
      return {
        status: 200,
        data: { result: [{ contractAddress: token, txHash: TX }] },
      };
    }
    return { status: 404, data: null };
  });
  mockedAxios.post.mockImplementation(async () => {
    seen.push('POST receipt');
    return { status: 200, data: { result: { to: opts.receiptTo ?? null } } };
  });
  const detector = new LaunchpadDetectorService(
    stubRpc() as never,
    opts.cache ?? null,
    null,
    new DexScreenerService({}),
  );
  return { detector, seen };
}

const FLAP_URL = (chain: string, address: string): string =>
  `https://flap.sh/${chain === 'bsc' ? 'bnb' : chain}/${address}`;

describe('LaunchpadDetectorService flapsh-pair corroboration (dexter plan todo 60, research 57)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
  });

  afterEach(() => {
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
  });

  it('pins the bsc-only corroboration gate (research 57: flapsh seen only on BSC)', () => {
    expect([...FLAPSH_CORROBORATION_CHAINS]).toEqual(['bsc']);
  });

  it('WENCAT-class: mixed pair list (pcs live + flapsh frozen) resolves flap via `/latest/dex/tokens`', async () => {
    const seen: string[] = [];
    const { detector } = detectorWithDsc(WENCAT, {
      seen,
      pairs: [
        pcsPair({ liquidityUsd: 14000, fdv: 21110, pairAddress: '0xAdD9pair' }),
        pair({
          dexId: 'flapsh',
          pairAddress: WENCAT_FLAPSH,
          liquidityUsd: null,
          fdv: 52090,
        }),
      ],
    });
    const res = await detector.detectLaunchpad('bsc', WENCAT);
    expect(res).toEqual({
      id: 'flap',
      name: 'Flap',
      url: FLAP_URL('bsc', WENCAT),
    });
    expect(
      seen.filter(
        (s) =>
          s === `GET https://api.dexscreener.com/latest/dex/tokens/${WENCAT}`,
      ),
    ).toHaveLength(1);
  });

  it('Froggie-class: single live flapsh pair resolves flap', async () => {
    const { detector } = detectorWithDsc(FROGGIE, {
      pairs: [
        pair({
          dexId: 'flapsh',
          liquidityUsd: 8863.5,
          fdv: 4003,
          priceUsd: '0.000004003',
          pairCreatedAt: 1792234340000,
        }),
      ],
    });
    await expect(detector.detectLaunchpad('bsc', FROGGIE)).resolves.toEqual({
      id: 'flap',
      name: 'Flap',
      url: FLAP_URL('bsc', FROGGIE),
    });
  });

  it('stock-paired (caveat c+d): empty price/liq pair, token on the QUOTE side, resolves flap', async () => {
    // P3/P4 shape: baseToken = wTCENTx xStock (placeholder base address —
    // the exact xStock address is not in the research notes; the pinned
    // SHAPE is what matters), quoteToken = the launched token; price/liq
    // null, zero volume. `baseToken.address == mint` is NOT required by
    // design — the list read includes quote-side rows (caveat d).
    const { detector } = detectorWithDsc(STOCK_PAIRED, {
      pairs: [
        pair({
          dexId: 'flapsh',
          baseAddress: '0xwTCENTxStock',
          baseSymbol: 'wTCENTx',
          quoteAddress: STOCK_PAIRED,
          liquidityUsd: null,
          fdv: null,
          priceUsd: null,
        }),
      ],
    });
    await expect(
      detector.detectLaunchpad('bsc', STOCK_PAIRED),
    ).resolves.toMatchObject({ id: 'flap' });
  });

  it('negative control (fourmeme — same meme/era rival launchpad): absence resolves null', async () => {
    const { detector, seen } = detectorWithDsc(FOURMEME, {
      pairs: [pair({ dexId: 'fourmeme' })],
    });
    await expect(detector.detectLaunchpad('bsc', FOURMEME)).resolves.toBeNull();
    expect(seen.filter((s) => s.includes('api.dexscreener.com'))).toHaveLength(
      1,
    );
  });

  it('major negative (CAKE-class: many non-flapsh pairs) resolves null', async () => {
    const { detector } = detectorWithDsc(CAKE, {
      pairs: [
        pcsPair({ liquidityUsd: 9_000_000 }),
        pair({ dexId: 'biswap' }),
        pair({ dexId: 'squadswap' }),
        pair({ dexId: '0xC2D8d27F3196D9989aBf366230a47384010440c0' }),
      ],
    });
    await expect(detector.detectLaunchpad('bsc', CAKE)).resolves.toBeNull();
  });

  it('absence is NOT negative evidence (caveat a): flapsh-less token stays null, never cached, re-probed', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const { detector } = detectorWithDsc(PRE_ERA, {
      cache,
      seen,
      pairs: [pcsPair({ pairCreatedAt: 1748649600000 })],
    });
    await expect(detector.detectLaunchpad('bsc', PRE_ERA)).resolves.toBeNull();
    await expect(detector.detectLaunchpad('bsc', PRE_ERA)).resolves.toBeNull();
    // Absence never writes a positive row (19a) — both scans re-probe.
    expect(await cache.get<boolean>(flapCacheKey('bsc', PRE_ERA))).toBe(null);
    expect(seen.filter((s) => s.includes('api.dexscreener.com'))).toHaveLength(
      2,
    );
  });

  it('era (caveat b): pre-era token (2025 pairs, no flapsh) resolves null honestly', async () => {
    // flapsh pairs observed only since 2026-09-29 05:04:14Z; pre-era
    // tokens (A1/A5) may legitimately lack the marker — null, no verdict.
    const { detector } = detectorWithDsc(PRE_ERA, {
      pairs: [
        pcsPair({ pairCreatedAt: 1748649600000 }),
        pcsPair({ dexId: 'pancakeswap', pairCreatedAt: 1748649600000 }),
      ],
    });
    await expect(detector.detectLaunchpad('bsc', PRE_ERA)).resolves.toBeNull();
  });

  it('chain honesty: a flapsh row on a DIFFERENT chainId never corroborates a bsc card', async () => {
    const { detector } = detectorWithDsc(WENCAT, {
      pairs: [pair({ chainId: 'solana', dexId: 'flapsh' }), pcsPair()],
    });
    await expect(detector.detectLaunchpad('bsc', WENCAT)).resolves.toBeNull();
  });

  it('DSC 404-shape (pairs null) resolves null, never throws', async () => {
    const { detector } = detectorWithDsc(WENCAT, { pairs: null });
    await expect(detector.detectLaunchpad('bsc', WENCAT)).resolves.toBeNull();
  });

  it('DSC transport failure resolves null, never throws', async () => {
    const { detector } = detectorWithDsc(WENCAT, { dscFails: true });
    await expect(detector.detectLaunchpad('bsc', WENCAT)).resolves.toBeNull();
  });

  it('precedence: a Phase-1 detector positive (mintclub) beats flapsh presence — DSC never fires', async () => {
    const token = WENCAT;
    const seen: string[] = [];
    mockedAxios.get.mockImplementation(async (url: string) => {
      seen.push(`GET ${String(url)}`);
      if (String(url).includes('mint.club')) {
        return { status: 200, data: { address: token, symbol: 'WENCAT' } };
      }
      if (String(url).includes('api.dexscreener.com')) {
        return { status: 200, data: { pairs: [pair({ dexId: 'flapsh' })] } };
      }
      return { status: 404, data: null };
    });
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
    const detector = new LaunchpadDetectorService(
      stubRpc() as never,
      null,
      null,
      new DexScreenerService({}),
    );
    const res = await detector.detectLaunchpad('bsc', token);
    expect(res?.id).toBe('mintclub');
    expect(seen.some((s) => s.includes('api.dexscreener.com'))).toBe(false);
    expect(seen.some((s) => s.includes('blockscout'))).toBe(false);
  });

  it('precedence: a factory-positive (receipt `to` == four-meme factory) beats flapsh presence', async () => {
    const fourMemeFactory = EVM_FACTORY_SETS['four-meme'].factories[0];
    const { detector } = detectorWithDsc(WENCAT, {
      receiptTo: fourMemeFactory,
      pairs: [pair({ dexId: 'flapsh' })],
    });
    const res = await detector.detectLaunchpad('bsc', WENCAT);
    expect(res?.id).toBe('four-meme');
  });

  it('factory `flap` and flapsh agree: factory path unchanged and positive-cached', async () => {
    const cache = realCache();
    const { detector } = detectorWithDsc(WENCAT, {
      cache,
      receiptTo: EVM_FACTORY_SETS.flap.factories[0],
      pairs: [pair({ dexId: 'flapsh' })],
    });
    await expect(
      detector.detectLaunchpad('bsc', WENCAT),
    ).resolves.toMatchObject({ id: 'flap' });
    expect(await cache.get<boolean>(flapCacheKey('bsc', WENCAT))).toBe(true);
  });

  it('flapsh-corroborated flap is positive-cached: second scan skips receipt + DSC', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const { detector } = detectorWithDsc(WENCAT, {
      cache,
      seen,
      pairs: [pcsPair(), pair({ dexId: 'flapsh' })],
    });
    await expect(
      detector.detectLaunchpad('bsc', WENCAT),
    ).resolves.toMatchObject({ id: 'flap' });
    expect(await cache.get<boolean>(flapCacheKey('bsc', WENCAT))).toBe(true);
    expect(seen.filter((s) => s.includes('blockscout'))).toHaveLength(1);
    expect(seen.filter((s) => s.includes('api.dexscreener.com'))).toHaveLength(
      1,
    );
    await expect(
      detector.detectLaunchpad('bsc', WENCAT),
    ).resolves.toMatchObject({ id: 'flap', url: FLAP_URL('bsc', WENCAT) });
    expect(seen.filter((s) => s.includes('blockscout'))).toHaveLength(1);
    expect(seen.filter((s) => s.includes('api.dexscreener.com'))).toHaveLength(
      1,
    );
  });

  it('non-gated chains (robinhood) never fire the flapsh DSC leg', async () => {
    const robinhood = '0xdc453b1405CfE25e2afBA8E7F4272b0a00437777';
    const seen: string[] = [];
    const { detector } = detectorWithDsc(robinhood, { seen, pairs: [] });
    await expect(
      detector.detectLaunchpad('robinhood', robinhood),
    ).resolves.toBeNull();
    expect(seen.some((s) => s.includes('api.dexscreener.com'))).toBe(false);
  });

  it('DSC service absent (hand-built DI) stays byte-identical: all-miss null, zero DSC traffic', async () => {
    const seen: string[] = [];
    mockedAxios.get.mockImplementation(async (url: string) => {
      seen.push(`GET ${String(url)}`);
      if (String(url).includes('blockscout')) {
        return {
          status: 200,
          data: { result: [{ contractAddress: WENCAT, txHash: TX }] },
        };
      }
      return { status: 404, data: null };
    });
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { result: { to: null } },
    });
    const detector = new LaunchpadDetectorService(stubRpc() as never);
    await expect(detector.detectLaunchpad('bsc', WENCAT)).resolves.toBeNull();
    expect(seen.some((s) => s.includes('api.dexscreener.com'))).toBe(false);
  });

  it('flapsh leg honors the shared deadline AbortSignal (never hangs the detect)', async () => {
    process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'] = '80';
    let seenSignal: unknown = null;
    mockedAxios.get.mockImplementation(
      async (url: string, config?: unknown) => {
        if (String(url).includes('api.dexscreener.com')) {
          const signal =
            (config as { signal?: AbortSignal } | undefined)?.signal ?? null;
          seenSignal = signal;
          // Honor the abort like real axios (CanceledError → catch →
          // fail-open false); without this the mock would outlive the
          // deadline and the test would prove nothing.
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => resolve(), 500);
            signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new Error('canceled'));
              },
              { once: true },
            );
          });
          return { status: 200, data: { pairs: [pair({ dexId: 'flapsh' })] } };
        }
        if (String(url).includes('blockscout')) {
          return { status: 200, data: { result: [] } };
        }
        return { status: 404, data: null };
      },
    );
    mockedAxios.post.mockResolvedValue({
      status: 200,
      data: { result: { to: null } },
    });
    const detector = new LaunchpadDetectorService(
      stubRpc() as never,
      null,
      null,
      new DexScreenerService({}),
    );
    const started = Date.now();
    await expect(detector.detectLaunchpad('bsc', WENCAT)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(400);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect((seenSignal as AbortSignal).aborted).toBe(true);
  });
});
