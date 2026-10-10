import axios from 'axios';
import { CacheService } from 'cache/application/cache.service';
import { InMemoryCacheAdapter } from 'cache/infrastructure/in-memory-cache.adapter';
import {
  DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT,
  LaunchpadDetectorService,
  PONS_CACHE_TTL_DAYS_DEFAULT,
  ponsCacheKey,
  resolveDetectorSlowLegTimeoutMs,
  resolvePonsCacheTtlSeconds,
} from './launchpad-detector.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const STAGEVEIL = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';

function ponsPage(title: string, robots: string): string {
  return (
    `<html><head><title>${title}</title>` +
    `<meta name="robots" content="${robots}"/></head><body/></html>`
  );
}

const PONS_MATCH = ponsPage('STAGEVEIL ($SVEIL) | Pons', 'index, follow');
const PONS_SHELL = ponsPage('Token | Pons', 'noindex, nofollow');

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function stubRpc() {
  return {
    getMultipleAccounts: jest.fn(),
    getAccountInfo: jest.fn(),
  };
}

/**
 * EVM harness: every GET 404s except the Pons registry (configurable
 * body/delay); every POST answers `{}` (Blockscout-shaped misses fall
 * through to null via shape checks). Mirrors the todo-34 helper —
 * bankr/mintclub miss fast so the Pons leg is always reached.
 */
function detectorWithPons(
  ponsBody: string | null,
  ponsDelayMs = 0,
  cache: CacheService | null = null,
  seen: string[] = [],
): LaunchpadDetectorService {
  mockedAxios.post.mockResolvedValue({ data: {} });
  mockedAxios.get.mockImplementation(async (url: string) => {
    seen.push(String(url));
    if (String(url).includes('ponsfamily.com')) {
      if (ponsDelayMs > 0) await sleep(ponsDelayMs);
      return ponsBody === null
        ? { status: 500, data: null }
        : { status: 200, data: ponsBody };
    }
    return { status: 404, data: null };
  });
  return new LaunchpadDetectorService(stubRpc() as never, cache);
}

function realCache(): CacheService {
  return new CacheService(new InMemoryCacheAdapter());
}

/**
 * Detector own deadline + Pons cache (dexter plan todo 35): the Pons
 * SSR slow leg (~1.3s live) runs under its own ~2s AbortController
 * deadline — OUT of the 400ms snapshot-tail extras budget — and
 * positive resolutions are cached on the shared CacheService, so the
 * second scan of a mint never re-fires SSR.
 */
describe('LaunchpadDetectorService own deadline + pons cache (todo 35)', () => {
  const ENV_KEY = 'LAUNCHPAD_SLOW_LEG_TIMEOUT_MS';
  const TTL_KEY = 'PONS_CACHE_TTL_DAYS';
  let savedDeadline: string | undefined;
  let savedTtl: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    savedDeadline = process.env[ENV_KEY];
    savedTtl = process.env[TTL_KEY];
    delete process.env[ENV_KEY];
    delete process.env[TTL_KEY];
  });

  afterEach(() => {
    if (savedDeadline === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = savedDeadline;
    if (savedTtl === undefined) delete process.env[TTL_KEY];
    else process.env[TTL_KEY] = savedTtl;
  });

  it('pins config defaults (deadline 2s, TTL inside the 7-30d band)', () => {
    expect(DETECTOR_SLOW_LEG_TIMEOUT_MS_DEFAULT).toBe(2_000);
    expect(resolveDetectorSlowLegTimeoutMs(undefined)).toBe(2_000);
    expect(resolveDetectorSlowLegTimeoutMs('nope')).toBe(2_000);
    expect(resolveDetectorSlowLegTimeoutMs('0')).toBe(2_000);
    expect(resolveDetectorSlowLegTimeoutMs('-5')).toBe(2_000);
    expect(resolveDetectorSlowLegTimeoutMs('3500')).toBe(3_500);
    expect(PONS_CACHE_TTL_DAYS_DEFAULT).toBeGreaterThanOrEqual(7);
    expect(PONS_CACHE_TTL_DAYS_DEFAULT).toBeLessThanOrEqual(30);
    expect(resolvePonsCacheTtlSeconds(undefined)).toBe(
      PONS_CACHE_TTL_DAYS_DEFAULT * 24 * 60 * 60,
    );
  });

  it('pons cache key is namespaced and case-insensitive', () => {
    expect(ponsCacheKey('robinhood', STAGEVEIL)).toMatch(/^pons:launchpad:/);
    expect(ponsCacheKey('Robinhood', STAGEVEIL)).toBe(
      ponsCacheKey('robinhood', STAGEVEIL.toLowerCase()),
    );
  });

  it('slow leg resolves within the deadline (300ms SSR under 2s)', async () => {
    const detector = detectorWithPons(PONS_MATCH, 300);
    const started = Date.now();
    const res = await detector.detectLaunchpad('robinhood', STAGEVEIL);
    expect(res?.id).toBe('pons');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('SSR past the deadline aborts to null via AbortController (never hangs)', async () => {
    process.env[ENV_KEY] = '80';
    let seenSignal: unknown = null;
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockImplementation(
      async (url: string, config?: unknown) => {
        if (String(url).includes('ponsfamily.com')) {
          const signal = (config as { signal?: AbortSignal })?.signal ?? null;
          seenSignal = signal;
          // Honor the abort like real axios (CanceledError → catch →
          // fail-open null); without this the mock would outlive the
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
          return { status: 200, data: PONS_MATCH };
        }
        return { status: 404, data: null };
      },
    );
    const detector = new LaunchpadDetectorService(stubRpc() as never);
    const started = Date.now();
    await expect(
      detector.detectLaunchpad('robinhood', STAGEVEIL),
    ).resolves.toBeNull();
    // Well under the 500ms SSR hang: the abort fired at ~80ms, then
    // only the (mock-instant) factory miss ran after it.
    expect(Date.now() - started).toBeLessThan(400);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect((seenSignal as AbortSignal).aborted).toBe(true);
  });

  it('second scan of a cached mint is a hit with zero SSR fetch (spy)', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const detector = detectorWithPons(PONS_MATCH, 0, cache, seen);
    await expect(
      detector.detectLaunchpad('robinhood', STAGEVEIL),
    ).resolves.toMatchObject({ id: 'pons' });
    expect(seen.filter((url) => url.includes('ponsfamily.com'))).toHaveLength(
      1,
    );
    expect(await cache.get<boolean>(ponsCacheKey('robinhood', STAGEVEIL))).toBe(
      true,
    );
    await expect(
      detector.detectLaunchpad('robinhood', STAGEVEIL),
    ).resolves.toMatchObject({ id: 'pons' });
    expect(seen.filter((url) => url.includes('ponsfamily.com'))).toHaveLength(
      1,
    );
  });

  it('nulls are never cached (no-match re-probes SSR every scan)', async () => {
    const cache = realCache();
    const seen: string[] = [];
    const detector = detectorWithPons(PONS_SHELL, 0, cache, seen);
    await expect(
      detector.detectLaunchpad('robinhood', STAGEVEIL),
    ).resolves.toBeNull();
    await expect(
      detector.detectLaunchpad('robinhood', STAGEVEIL),
    ).resolves.toBeNull();
    expect(seen.filter((url) => url.includes('ponsfamily.com'))).toHaveLength(
      2,
    );
    expect(await cache.get<boolean>(ponsCacheKey('robinhood', STAGEVEIL))).toBe(
      null,
    );
  });

  it('fast-leg hit never touches the slow leg (timing unchanged when they hit)', async () => {
    const token = '0x86Cd12345678901234567890123456789012Ab07';
    const seen: string[] = [];
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockImplementation(async (url: string) => {
      seen.push(String(url));
      if (String(url).includes('api.bankr.bot')) {
        return { status: 200, data: { token, fees: '1' } };
      }
      return { status: 404, data: null };
    });
    const detector = new LaunchpadDetectorService(stubRpc() as never);
    await expect(
      detector.detectLaunchpad('base', token),
    ).resolves.toMatchObject({ id: 'bankr' });
    expect(seen.some((url) => url.includes('ponsfamily.com'))).toBe(false);
  });

  it('absent cache behaves byte-identical to pre-cache (SSR direct)', async () => {
    const detector = detectorWithPons(PONS_MATCH);
    await expect(
      detector.detectLaunchpad('robinhood', STAGEVEIL),
    ).resolves.toMatchObject({ id: 'pons' });
  });
});
