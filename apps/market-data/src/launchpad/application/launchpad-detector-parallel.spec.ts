import axios from 'axios';
import { LaunchpadDetectorService } from './launchpad-detector.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ROBINHOOD_TOKEN = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';
const BASE_TOKEN = '0x86Cd12345678901234567890123456789012Ab07';

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

interface LegDelays {
  readonly bankrMs?: number;
  readonly bankrHit?: boolean;
  readonly mintclubMs?: number;
  readonly ponsMs?: number;
  readonly ponsBody?: string;
}

/**
 * EVM harness with per-leg delays: every GET answers by host (bankr /
 * mintclub / pons / blockscout), every POST answers `{}`. Delays model
 * the live shapes (bankr 404 ~1.6s, Pons SSR ~1.3s) at a smaller scale
 * so the suite stays fast while still separating max from sum.
 */
function detectorWithDelays(
  token: string,
  delays: LegDelays,
  seen: string[] = [],
): LaunchpadDetectorService {
  const bankrMs = delays.bankrMs ?? 0;
  const mintclubMs = delays.mintclubMs ?? 0;
  const ponsMs = delays.ponsMs ?? 0;
  const ponsBody = delays.ponsBody ?? PONS_SHELL;
  mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  mockedAxios.get.mockImplementation(async (url: string) => {
    const target = String(url);
    seen.push(target);
    if (target.includes('api.bankr.bot')) {
      if (bankrMs > 0) await sleep(bankrMs);
      return delays.bankrHit === true
        ? { status: 200, data: { token, fees: '1' } }
        : { status: 404, data: null };
    }
    if (target.includes('ponsfamily.com')) {
      if (ponsMs > 0) await sleep(ponsMs);
      return { status: 200, data: ponsBody };
    }
    if (target.includes('blockscout')) {
      return { status: 200, data: { message: 'OK', result: [] } };
    }
    if (mintclubMs > 0) await sleep(mintclubMs);
    return { status: 404, data: null };
  });
  return new LaunchpadDetectorService(stubRpc() as never);
}

/**
 * Parallel slow legs (detector-budget follow-up): bankr ‖ mintclub ‖
 * Pons SSR run CONCURRENTLY via Promise.allSettled under ONE shared
 * deadline — total ~= max(legs), not sum — with precedence resolved
 * by POSITION (bankr > mintclub > pons > factory), never by finish
 * order. Detection semantics are unchanged; only the overlap is new.
 */
describe('LaunchpadDetectorService parallel slow legs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['LAUNCHPAD_SLOW_LEG_TIMEOUT_MS'];
  });

  it('parallel-timing: slow legs overlap (total ~= max, not sum)', async () => {
    const seen: string[] = [];
    const detector = detectorWithDelays(
      ROBINHOOD_TOKEN,
      { bankrMs: 400, ponsMs: 400, ponsBody: PONS_MATCH },
      seen,
    );
    const started = Date.now();
    const res = await detector.detectLaunchpad('robinhood', ROBINHOOD_TOKEN);
    const elapsed = Date.now() - started;
    expect(res?.id).toBe('pons');
    // Sequential would cost 400 + 400 = 800ms minimum; overlapped the
    // two 400ms legs share one window — well under the sum.
    expect(elapsed).toBeLessThan(700);
    expect(seen.some((url) => url.includes('api.bankr.bot'))).toBe(true);
    expect(seen.some((url) => url.includes('ponsfamily.com'))).toBe(true);
    // Pons hit short-circuits before the factory fallback (zero extra).
    expect(seen.some((url) => url.includes('blockscout'))).toBe(false);
  });

  it('precedence-preserved: slower higher-priority leg beats faster lower-priority', async () => {
    // On robinhood BOTH legs fire: Pons finishes first (~50ms) but the
    // slower bankr hit (~300ms) still wins — resolve order is by
    // priority, not by finish order.
    const detector = detectorWithDelays(ROBINHOOD_TOKEN, {
      bankrMs: 300,
      bankrHit: true,
      ponsMs: 50,
      ponsBody: PONS_MATCH,
    });
    const res = await detector.detectLaunchpad('robinhood', ROBINHOOD_TOKEN);
    expect(res?.id).toBe('bankr');
  });

  it('all-fail resolves null (fail-open, bounded by the shared deadline)', async () => {
    const detector = detectorWithDelays(ROBINHOOD_TOKEN, {
      bankrMs: 250,
      ponsMs: 250,
      ponsBody: PONS_SHELL,
    });
    const started = Date.now();
    await expect(
      detector.detectLaunchpad('robinhood', ROBINHOOD_TOKEN),
    ).resolves.toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('fast path untouched: bankr hit short-circuits with zero extra fetches', async () => {
    const seen: string[] = [];
    const detector = detectorWithDelays(BASE_TOKEN, { bankrHit: true }, seen);
    const started = Date.now();
    await expect(
      detector.detectLaunchpad('base', BASE_TOKEN),
    ).resolves.toMatchObject({ id: 'bankr' });
    // No Pons fetch (chain gate + short-circuit) and no factory fetch
    // (Phase 2 skipped on a hit) — byte-identical fetch shape to the
    // sequential path, so no extra latency vs today.
    expect(seen.some((url) => url.includes('ponsfamily.com'))).toBe(false);
    expect(seen.some((url) => url.includes('blockscout'))).toBe(false);
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(Date.now() - started).toBeLessThan(500);
  });
});
