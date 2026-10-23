import axios from 'axios';
import { CacheService } from 'cache/application/cache.service';
import { InMemoryCacheAdapter } from 'cache/infrastructure/in-memory-cache.adapter';
import {
  FLAP_CACHE_TTL_DAYS_DEFAULT,
  LaunchpadDetectorService,
  flapCacheKey,
  flapFactoryMismatchCacheKey,
  resolveFlapCacheTtlSeconds,
} from './launchpad-detector.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Plan fixture (dexter plan todo 44, owner-ratified full address):
// Robinhood Flap launch, acceptance case.
const FLAP_ROBINHOOD = '0xdc453b1405CfE25e2afBA8E7F4272b0a00437777';
const FLAP_BNB = '0x1111111111111111111111111111111111111111';
// Portal addresses verbatim from Phase A evidence
// (`.omo/evidence/task-fe-flap-intake.log` §1 — canonical docs
// `docs.flap.sh/.../deployed-contract-addresses`, never from memory).
const ROBINHOOD_PORTAL = '0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09';
const BNB_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
const TX = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

function stubRpc() {
  return {
    getMultipleAccounts: jest.fn(),
    getAccountInfo: jest.fn(),
  };
}

/**
 * EVM harness for the factory path: Phase-1 brand APIs all miss
 * (404, fast), the Alchemy creation-hash leg answers the tx hash
 * (fix 5 — Blockscout is dead: HTTP 404 on BSC), the receipt answers
 * `to`. `receiptTo` may be a string or null (to:null leg).
 */
function stubAlchemy(tx: string | null = TX) {
  return { getAssetTransfers: jest.fn().mockResolvedValue(tx) };
}

function detectorWithFactoryFor(
  _token: string,
  receiptTo: string | null,
  cache: CacheService | null = null,
  seen: string[] = [],
  alchemy: ReturnType<typeof stubAlchemy> = stubAlchemy(),
): LaunchpadDetectorService {
  mockedAxios.get.mockImplementation(async (url: string) => {
    seen.push(`GET ${String(url)}`);
    return { status: 404, data: null };
  });
  mockedAxios.post.mockImplementation(async (url: string, body?: unknown) => {
    seen.push(`POST ${String(url)}`);
    const params = (body as { params?: unknown[] })?.params ?? [];
    expect(params[0]).toBe(TX);
    return { status: 200, data: { result: { to: receiptTo } } };
  });
  return new LaunchpadDetectorService(
    stubRpc() as never,
    cache,
    null,
    null,
    alchemy as never,
  );
}

function realCache(): CacheService {
  return new CacheService(new InMemoryCacheAdapter());
}

describe('LaunchpadDetectorService flap leg (dexter plan todo 44, Phase B)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
    delete process.env['FLAP_CACHE_TTL_DAYS'];
  });

  afterEach(() => {
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
    delete process.env['FLAP_CACHE_TTL_DAYS'];
  });

  it('pins the flap cache contract (TTL band + resolver + key shape)', () => {
    expect(FLAP_CACHE_TTL_DAYS_DEFAULT).toBeGreaterThanOrEqual(7);
    expect(FLAP_CACHE_TTL_DAYS_DEFAULT).toBeLessThanOrEqual(30);
    expect(resolveFlapCacheTtlSeconds(undefined)).toBe(
      FLAP_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60,
    );
    expect(resolveFlapCacheTtlSeconds('nope')).toBe(
      FLAP_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60,
    );
    expect(resolveFlapCacheTtlSeconds('0')).toBe(
      FLAP_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60,
    );
    expect(flapCacheKey('robinhood', FLAP_ROBINHOOD)).toMatch(
      /^flap:launchpad:/,
    );
    expect(flapCacheKey('Robinhood', FLAP_ROBINHOOD)).toBe(
      flapCacheKey('robinhood', FLAP_ROBINHOOD.toLowerCase()),
    );
  });

  it('flap match on the plan fixture (receipt `to` == Robinhood Portal)', async () => {
    const detector = detectorWithFactoryFor(FLAP_ROBINHOOD, ROBINHOOD_PORTAL);
    const res = await detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD);
    expect(res).toEqual({
      id: 'flap',
      name: 'Flap',
      url: `https://flap.sh/robinhood/${FLAP_ROBINHOOD}`,
    });
  });

  it('flap match is case-insensitive (checksummed Portal receipt)', async () => {
    const detector = detectorWithFactoryFor(
      FLAP_ROBINHOOD,
      ROBINHOOD_PORTAL.toUpperCase(),
    );
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toMatchObject({ id: 'flap' });
  });

  it('flap match on BNB via the `bnb` alias (chain-scoped `bnb` URL)', async () => {
    const detector = detectorWithFactoryFor(FLAP_BNB, BNB_PORTAL);
    const res = await detector.detectLaunchpad('bnb', FLAP_BNB);
    expect(res).toEqual({
      id: 'flap',
      name: 'Flap',
      url: `https://flap.sh/bnb/${FLAP_BNB}`,
    });
  });

  it('flap no-match (random receipt `to`) resolves null', async () => {
    const detector = detectorWithFactoryFor(
      FLAP_ROBINHOOD,
      '0x0000000000000000000000000000000000000000',
    );
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toBeNull();
  });

  it('graduated-state independence (creation receipt never changes on graduation)', async () => {
    // The factory path matches the CREATION receipt `to`, which is
    // immutable: bonding and graduated states share the same receipt,
    // so one fixture suffices — no per-state legs exist by design.
    const seen: string[] = [];
    const detector = detectorWithFactoryFor(
      FLAP_ROBINHOOD,
      ROBINHOOD_PORTAL,
      null,
      seen,
    );
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toMatchObject({ id: 'flap' });
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toMatchObject({ id: 'flap' });
  });

  it('deferred chains resolve null with ZERO factory fetch (xlayer/monad/morph)', async () => {
    // No detector instance work needed beyond construction: these
    // chains have no alias row (xlayer/monad: transports deferred;
    // morph: no documented Portal), so detectInner returns null
    // before any HTTP.
    const seen: string[] = [];
    const token = '0x2222222222222222222222222222222222222222';
    const detector = detectorWithFactoryFor(
      token,
      ROBINHOOD_PORTAL,
      null,
      seen,
    );
    await expect(detector.detectLaunchpad('xlayer', token)).resolves.toBeNull();
    await expect(detector.detectLaunchpad('monad', token)).resolves.toBeNull();
    await expect(detector.detectLaunchpad('morph', token)).resolves.toBeNull();
    expect(seen).toHaveLength(0);
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('factory past the shared deadline aborts to null (never hangs)', async () => {
    process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'] = '80';
    let seenSignal: unknown = null;
    const alchemy = {
      getAssetTransfers: jest.fn(
        async (
          _chain: string,
          _token: string,
          options?: { signal?: AbortSignal },
        ) => {
          const signal = options?.signal ?? null;
          seenSignal = signal;
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
          return TX;
        },
      ),
    };
    mockedAxios.get.mockResolvedValue({ status: 404, data: null });
    mockedAxios.post.mockResolvedValue({ data: {} });
    const detector = detectorWithFactoryFor(
      FLAP_BNB,
      BNB_PORTAL,
      null,
      [],
      alchemy,
    );
    const started = Date.now();
    await expect(detector.detectLaunchpad('bsc', FLAP_BNB)).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(400);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect((seenSignal as AbortSignal).aborted).toBe(true);
  });

  it('second scan of a cached flap mint skips Alchemy + receipt (spy)', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const alchemy = stubAlchemy();
    const detector = detectorWithFactoryFor(
      FLAP_ROBINHOOD,
      ROBINHOOD_PORTAL,
      cache,
      seen,
      alchemy,
    );
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toMatchObject({ id: 'flap' });
    expect(alchemy.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(seen.filter((s) => s.startsWith('POST'))).toHaveLength(1);
    expect(
      await cache.get<boolean>(flapCacheKey('robinhood', FLAP_ROBINHOOD)),
    ).toBe(true);
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toMatchObject({
      id: 'flap',
      url: `https://flap.sh/robinhood/${FLAP_ROBINHOOD}`,
    });
    expect(alchemy.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(seen.filter((s) => s.startsWith('POST'))).toHaveLength(1);
  });

  it('null never enters the 14d positive cache (explicit mismatch uses the short negative cache)', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const alchemy = stubAlchemy();
    const detector = detectorWithFactoryFor(
      FLAP_ROBINHOOD,
      '0x0000000000000000000000000000000000000000',
      cache,
      seen,
      alchemy,
    );
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toBeNull();
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toBeNull();
    // Explicit mismatch: the second scan skips the Alchemy leg.
    expect(alchemy.getAssetTransfers).toHaveBeenCalledTimes(1);
    expect(
      await cache.get<boolean>(flapCacheKey('robinhood', FLAP_ROBINHOOD)),
    ).toBe(null);
    expect(
      await cache.get<boolean>(
        flapFactoryMismatchCacheKey('robinhood', FLAP_ROBINHOOD),
      ),
    ).toBe(true);
  });

  it('absent cache behaves byte-identical to pre-cache (receipt direct)', async () => {
    const detector = detectorWithFactoryFor(FLAP_ROBINHOOD, ROBINHOOD_PORTAL);
    await expect(
      detector.detectLaunchpad('robinhood', FLAP_ROBINHOOD),
    ).resolves.toMatchObject({ id: 'flap' });
  });
});
