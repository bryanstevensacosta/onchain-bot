import axios from 'axios';
import { CacheService } from 'cache/application/cache.service';
import { InMemoryCacheAdapter } from 'cache/infrastructure/in-memory-cache.adapter';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import {
  FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
  LaunchpadDetectorService,
  flapCacheKey,
  flapFactoryMismatchCacheKey,
  resolveFlapFactoryMismatchTtlMs,
} from './launchpad-detector.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Fix 5 — BSC Flap factory leg without Blockscout.
 *
 * `bnb.blockscout.com` / `bsc.blockscout.com` answer HTTP 404 for the
 * current `getcontractcreation` call, so the creation-tx hash now comes
 * from Alchemy `getAssetTransfers` (first ERC-20 transfer ascending)
 * and the receipt `to` factory match stays the mandatory gate. The
 * keyless Flap page is a BSC-only corroboration used ONLY when the
 * Alchemy hash/receipt path is unavailable; the short negative cache
 * (15 min) records explicit non-factory receipts only.
 */
const TOKEN = '0xcEb8F67378C10107783683d8170BAfC962db7777';
const TX = `0x${'ab'.repeat(32)}`;
// Portal addresses verbatim from Phase A evidence
// (`.omo/evidence/task-fe-flap-intake.log` §1).
const BNB_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
const ROBINHOOD_PORTAL = '0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09';
const NON_FACTORY = '0x0000000000000000000000000000000000000001';
const FLAP_URL = `https://flap.sh/bnb/${TOKEN}`;

const PAGE_POSITIVE =
  `<html><head><title>WENCAT | FLAP</title></head><body><script>` +
  `self.__next_f.push([1,"{\\"createdAt\\":1791892874}"])` +
  `</script></body></html>`;
const PAGE_POSITIVE_PLAIN =
  `<html><head><title>WENCAT | FLAP</title></head><body>` +
  `{"createdAt":1791892874}</body></html>`;
const PAGE_GENERIC =
  '<html><head><title>Flap — The Programmable Token Launchpad</title></head><body/></html>';
const PAGE_TITLE_ONLY =
  '<html><head><title>WENCAT | FLAP</title></head><body/></html>';

function stubRpc() {
  return {
    getMultipleAccounts: jest.fn(),
    getAccountInfo: jest.fn(),
  };
}

function realCache(): CacheService {
  return new CacheService(new InMemoryCacheAdapter());
}

function stubAlchemy(outcome: string | null | Error = TX) {
  return {
    getAssetTransfers: jest.fn().mockImplementation(async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }),
  };
}

interface DetectorOptions {
  readonly alchemy?: unknown;
  readonly receiptTo?: string | null;
  readonly receiptThrows?: boolean;
  readonly page?: { readonly status: number; readonly data: unknown } | 'throw';
  readonly cache?: CacheService | null;
  readonly dexscreener?: DexScreenerService | null;
  readonly seen?: string[];
}

function detectorFor(opts: DetectorOptions = {}): LaunchpadDetectorService {
  const seen = opts.seen ?? [];
  mockedAxios.get.mockImplementation(async (url: string) => {
    seen.push(`GET ${String(url)}`);
    if (String(url).includes('flap.sh')) {
      if (opts.page === 'throw') throw new Error('flap page down');
      return opts.page ?? { status: 404, data: null };
    }
    return { status: 404, data: null };
  });
  mockedAxios.post.mockImplementation(async (url: string) => {
    seen.push(`POST ${String(url)}`);
    if (opts.receiptThrows === true) throw new Error('receipt down');
    return { status: 200, data: { result: { to: opts.receiptTo ?? null } } };
  });
  return new LaunchpadDetectorService(
    stubRpc() as never,
    opts.cache ?? null,
    null,
    opts.dexscreener ?? null,
    opts.alchemy as never,
  );
}

function dscPairs(pairs: unknown): DexScreenerService {
  const dsc = new DexScreenerService({});
  jest.spyOn(dsc, 'getPairsByToken').mockResolvedValue(pairs as never);
  return dsc;
}

describe('LaunchpadDetectorService flap factory via Alchemy (fix 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
    delete process.env['FLAP_FACTORY_MISMATCH_TTL_MS'];
  });

  afterEach(() => {
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
    delete process.env['FLAP_FACTORY_MISMATCH_TTL_MS'];
  });

  it('pins the negative-cache contract (15 min default, separate namespace, case-insensitive)', () => {
    expect(FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT).toBe(15 * 60 * 1000);
    expect(resolveFlapFactoryMismatchTtlMs(undefined)).toBe(
      FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
    );
    expect(resolveFlapFactoryMismatchTtlMs('nope')).toBe(
      FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
    );
    expect(resolveFlapFactoryMismatchTtlMs('0')).toBe(
      FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
    );
    expect(resolveFlapFactoryMismatchTtlMs('-1')).toBe(
      FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
    );
    expect(resolveFlapFactoryMismatchTtlMs('60000')).toBe(60_000);
    expect(flapFactoryMismatchCacheKey('bsc', TOKEN)).toMatch(
      /^flap:factory-mismatch:/,
    );
    expect(flapFactoryMismatchCacheKey('BSC', TOKEN.toUpperCase())).toBe(
      flapFactoryMismatchCacheKey('bsc', TOKEN.toLowerCase()),
    );
    expect(flapFactoryMismatchCacheKey('bsc', TOKEN)).not.toBe(
      flapCacheKey('bsc', TOKEN),
    );
  });

  it('Alchemy hash + factory receipt -> flap (receipt `to` stays the mandatory gate)', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const alchemy = stubAlchemy();
    const detector = detectorFor({
      alchemy,
      receiptTo: BNB_PORTAL,
      cache,
      seen,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toEqual({
      id: 'flap',
      name: 'Flap',
      url: FLAP_URL,
    });
    expect(alchemy.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(alchemy.getAssetTransfers).toHaveBeenCalledWith(
      'bsc',
      TOKEN,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // Factory match short-circuits page + flapsh legs.
    expect(seen.some((entry) => entry.includes('blockscout'))).toBe(false);
    expect(seen.some((entry) => entry.includes('flap.sh'))).toBe(false);
    expect(await cache.get<boolean>(flapCacheKey('bsc', TOKEN))).toBe(true);
    expect(
      await cache.get<boolean>(flapFactoryMismatchCacheKey('bsc', TOKEN)),
    ).toBe(null);
  });

  it('non-factory receipt -> null + short negative cache (page never overturns an explicit mismatch)', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const detector = detectorFor({
      alchemy: stubAlchemy(),
      receiptTo: NON_FACTORY,
      cache,
      seen,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toBeNull();
    expect(seen.some((entry) => entry.includes('flap.sh'))).toBe(false);
    expect(await cache.get<boolean>(flapCacheKey('bsc', TOKEN))).toBe(null);
    expect(
      await cache.get<boolean>(flapFactoryMismatchCacheKey('bsc', TOKEN)),
    ).toBe(true);
  });

  it('negative hit skips the Alchemy lookup but keeps flapsh + page keyless paths', async () => {
    const cache = realCache();
    await cache.set(
      flapFactoryMismatchCacheKey('bsc', TOKEN),
      true,
      FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
    );
    const seen: string[] = [];
    const alchemy = stubAlchemy();
    const dexscreener = dscPairs([]);
    const detector = detectorFor({
      alchemy,
      cache,
      seen,
      dexscreener,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toEqual({
      id: 'flap',
      name: 'Flap',
      url: FLAP_URL,
    });
    expect(alchemy.getAssetTransfers).not.toHaveBeenCalled();
    expect(dexscreener.getPairsByToken).toHaveBeenCalledTimes(1);
    expect(seen.some((entry) => entry.includes('flap.sh'))).toBe(true);
    expect(await cache.get<boolean>(flapCacheKey('bsc', TOKEN))).toBe(true);
  });

  it('negative hit keeps the flapsh corroboration path (positive cache written)', async () => {
    const cache = realCache();
    await cache.set(
      flapFactoryMismatchCacheKey('bsc', TOKEN),
      true,
      FLAP_FACTORY_MISMATCH_TTL_MS_DEFAULT,
    );
    const alchemy = stubAlchemy();
    const detector = detectorFor({
      alchemy,
      cache,
      dexscreener: dscPairs([
        { chainId: 'bsc', dexId: 'flapsh', pairAddress: '0xpair' },
      ]),
      page: { status: 200, data: PAGE_GENERIC },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toMatchObject(
      { id: 'flap' },
    );
    expect(alchemy.getAssetTransfers).not.toHaveBeenCalled();
    expect(await cache.get<boolean>(flapCacheKey('bsc', TOKEN))).toBe(true);
  });

  it('Alchemy unavailable -> keyless Flap page positive -> flap', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const detector = detectorFor({
      alchemy: stubAlchemy(null),
      cache,
      seen,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toEqual({
      id: 'flap',
      name: 'Flap',
      url: FLAP_URL,
    });
    expect(seen).toContain(`GET https://flap.sh/bnb/${TOKEN}`);
    expect(seen.some((entry) => entry.startsWith('POST'))).toBe(false);
    expect(await cache.get<boolean>(flapCacheKey('bsc', TOKEN))).toBe(true);
    // A transient Alchemy miss is never negative-cached.
    expect(
      await cache.get<boolean>(flapFactoryMismatchCacheKey('bsc', TOKEN)),
    ).toBe(null);
  });

  it('Alchemy throw -> page fallback still fires (transient, never negative-cached)', async () => {
    const cache = realCache();
    const detector = detectorFor({
      alchemy: stubAlchemy(new Error('429')),
      cache,
      page: { status: 200, data: PAGE_POSITIVE_PLAIN },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toMatchObject(
      { id: 'flap' },
    );
    expect(
      await cache.get<boolean>(flapFactoryMismatchCacheKey('bsc', TOKEN)),
    ).toBe(null);
  });

  it('page with the generic title stays negative (no fake launchpad)', async () => {
    const cache = realCache();
    const detector = detectorFor({
      alchemy: stubAlchemy(null),
      cache,
      page: { status: 200, data: PAGE_GENERIC },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toBeNull();
    expect(await cache.get<boolean>(flapCacheKey('bsc', TOKEN))).toBe(null);
  });

  it('page title without the RSC "createdAt" stays negative', async () => {
    const detector = detectorFor({
      alchemy: stubAlchemy(null),
      page: { status: 200, data: PAGE_TITLE_ONLY },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toBeNull();
  });

  it('page transport error stays negative (never throws)', async () => {
    const detector = detectorFor({
      alchemy: stubAlchemy(null),
      page: 'throw',
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toBeNull();
  });

  it('page never overrides a fresh explicit receiptTo mismatch', async () => {
    const seen: string[] = [];
    const detector = detectorFor({
      alchemy: stubAlchemy(),
      receiptTo: NON_FACTORY,
      seen,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toBeNull();
    expect(seen.some((entry) => entry.includes('flap.sh'))).toBe(false);
  });

  it('page fallback is BSC-only (robinhood never fetches flap.sh)', async () => {
    const seen: string[] = [];
    const detector = detectorFor({
      alchemy: stubAlchemy(null),
      seen,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(
      detector.detectLaunchpad('robinhood', TOKEN),
    ).resolves.toBeNull();
    expect(seen.some((entry) => entry.includes('flap.sh'))).toBe(false);
  });

  it('no Alchemy DI (hand-built detector) still reaches the keyless page fallback', async () => {
    const detector = detectorFor({
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toMatchObject(
      { id: 'flap', url: FLAP_URL },
    );
  });

  it('a missing receipt is transient: no negative cache, page may still corroborate', async () => {
    const cache = realCache();
    const detector = detectorFor({
      alchemy: stubAlchemy(),
      receiptTo: null,
      cache,
      page: { status: 200, data: PAGE_POSITIVE },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toMatchObject(
      { id: 'flap' },
    );
    expect(
      await cache.get<boolean>(flapFactoryMismatchCacheKey('bsc', TOKEN)),
    ).toBe(null);
  });

  it('day-14 positive cache is unchanged: second factory scan skips Alchemy', async () => {
    const cache = realCache();
    const alchemy = stubAlchemy();
    const detector = detectorFor({
      alchemy,
      receiptTo: BNB_PORTAL,
      cache,
      page: { status: 404, data: null },
    });
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toMatchObject(
      { id: 'flap' },
    );
    await expect(detector.detectLaunchpad('bsc', TOKEN)).resolves.toMatchObject(
      { id: 'flap' },
    );
    expect(alchemy.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('robinhood factory match still works through Alchemy (robinhood Portal)', async () => {
    const alchemy = stubAlchemy();
    const detector = detectorFor({
      alchemy,
      receiptTo: ROBINHOOD_PORTAL,
    });
    await expect(detector.detectLaunchpad('robinhood', TOKEN)).resolves.toEqual(
      {
        id: 'flap',
        name: 'Flap',
        url: `https://flap.sh/robinhood/${TOKEN}`,
      },
    );
    expect(alchemy.getAssetTransfers).toHaveBeenCalledWith(
      'robinhood',
      TOKEN,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
