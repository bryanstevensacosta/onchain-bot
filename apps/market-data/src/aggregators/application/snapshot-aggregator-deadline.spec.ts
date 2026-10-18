import { SnapshotAggregatorService } from './snapshot-aggregator.service';
import type {
  QuoteFetcher,
  SnapshotQuote,
} from 'snapshot/domain/snapshot-quote.types';

/**
 * Fan-out race deadline (dexter plan todo 21c). The deadline path
 * abandons stragglers at `deadlineMs` (records naming the abandonment,
 * fail-open) so a slow provider NEVER blocks the serve; the default
 * path (no options) keeps the byte-identical allSettled behavior.
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function okFetcher(
  name: string,
  quote: Partial<SnapshotQuote>,
  chains: ReadonlyArray<string> = ['ethereum'],
): QuoteFetcher {
  return {
    name,
    supportsChains: chains,
    fetch: async () => quote,
  };
}

function hangFetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['ethereum'],
    fetch: async () => new Promise<null>(() => undefined),
  };
}

function delayedFetcher(
  name: string,
  delayMs: number,
  quote: Partial<SnapshotQuote>,
): QuoteFetcher {
  return {
    name,
    supportsChains: ['ethereum'],
    fetch: async () => {
      await sleep(delayMs);
      return quote;
    },
  };
}

describe('SnapshotAggregatorService deadline path (plan todo 21c)', () => {
  let aggregator: SnapshotAggregatorService;

  beforeEach(() => {
    aggregator = new SnapshotAggregatorService();
  });

  it('abandons a straggler at the deadline: fast rows merge, serve unblocked', async () => {
    const started = Date.now();
    const outcome = await aggregator.aggregate(
      'ethereum',
      '0xabc',
      [
        okFetcher('dexscreener', { priceUsd: 5, symbol: 'FAST' }),
        hangFetcher('geckoterminal'),
      ],
      8_000,
      { deadlineMs: 50 },
    );
    const elapsed = Date.now() - started;
    expect(outcome.quote.priceUsd).toBe(5);
    expect(outcome.quote.symbol).toBe('FAST');
    expect(outcome.sources).toEqual(['dexscreener']);
    expect(outcome.errors['geckoterminal']).toContain(
      'abandoned at fanout deadline (50ms)',
    );
    expect(outcome.allFailed).toBe(false);
    // The straggler hangs forever (8s per-call timeout); the serve
    // must resolve at the fan-out deadline, not wait for it.
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2_000);
  });

  it('all stragglers abandoned: allFailed fast, never a 10s hang', async () => {
    const started = Date.now();
    const outcome = await aggregator.aggregate(
      'ethereum',
      '0xabc',
      [hangFetcher('dexscreener'), hangFetcher('geckoterminal')],
      8_000,
      { deadlineMs: 40 },
    );
    const elapsed = Date.now() - started;
    expect(outcome.allFailed).toBe(true);
    expect(outcome.sources).toEqual([]);
    expect(outcome.errors['dexscreener']).toContain('abandoned at fanout deadline');
    expect(outcome.errors['geckoterminal']).toContain('abandoned at fanout deadline');
    expect(elapsed).toBeLessThan(2_000);
  });

  it('a synchronous throw is recorded, never crashes the deadline path', async () => {
    const boom: QuoteFetcher = {
      name: 'boom',
      supportsChains: ['ethereum'],
      fetch: (() => {
        throw new Error('sync boom');
      }) as unknown as QuoteFetcher['fetch'],
    };
    const outcome = await aggregator.aggregate(
      'ethereum',
      '0xabc',
      [boom, okFetcher('dexscreener', { priceUsd: 1 })],
      8_000,
      { deadlineMs: 50 },
    );
    expect(outcome.errors['boom']).toContain('sync boom');
    expect(outcome.quote.priceUsd).toBe(1);
  });

  it('a late settler after abandonment cannot change the returned outcome', async () => {
    const late = delayedFetcher('late', 120, { priceUsd: 42 });
    const outcome = await aggregator.aggregate(
      'ethereum',
      '0xabc',
      [late],
      8_000,
      { deadlineMs: 30 },
    );
    expect(outcome.allFailed).toBe(true);
    expect(outcome.quote.priceUsd).toBeNull();
    // Let the abandoned task settle; the returned outcome stays frozen.
    await sleep(150);
    expect(outcome.quote.priceUsd).toBeNull();
    expect(outcome.sources).toEqual([]);
  });

  it('eligibility filter still applies inside the deadline path', async () => {
    let called = 0;
    const solanaOnly: QuoteFetcher = {
      name: 'solana-only',
      supportsChains: ['solana'],
      fetch: async () => {
        called += 1;
        return { priceUsd: 9 };
      },
    };
    const outcome = await aggregator.aggregate(
      'ethereum',
      '0xabc',
      [solanaOnly, okFetcher('dexscreener', { priceUsd: 1 })],
      8_000,
      { deadlineMs: 50 },
    );
    expect(called).toBe(0);
    expect(outcome.sources).toEqual(['dexscreener']);
    expect(outcome.errors['solana-only']).toBeUndefined();
  });

  describe('default path (byte-identical allSettled behavior)', () => {
    it('no options: a delayed fetcher IS awaited (no abandonment)', async () => {
      const started = Date.now();
      const outcome = await aggregator.aggregate(
        'ethereum',
        '0xabc',
        [delayedFetcher('slowpoke', 80, { priceUsd: 7 })],
        8_000,
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(70);
      expect(outcome.quote.priceUsd).toBe(7);
      expect(outcome.sources).toEqual(['slowpoke']);
      expect(outcome.allFailed).toBe(false);
    });

    it('deadlineMs 0 keeps the default path (awaits the straggler)', async () => {
      const outcome = await aggregator.aggregate(
        'ethereum',
        '0xabc',
        [delayedFetcher('slowpoke', 60, { priceUsd: 8 })],
        8_000,
        { deadlineMs: 0 },
      );
      expect(outcome.quote.priceUsd).toBe(8);
      expect(outcome.errors['slowpoke']).toBeUndefined();
    });

    it('throw + null + ok merge exactly as before (records by name)', async () => {
      const throwing: QuoteFetcher = {
        name: 'thrower',
        supportsChains: ['ethereum'],
        fetch: async () => {
          throw new Error('down-a');
        },
      };
      const nulling: QuoteFetcher = {
        name: 'nuller',
        supportsChains: ['ethereum'],
        fetch: async () => null,
      };
      const outcome = await aggregator.aggregate('ethereum', '0xabc', [
        throwing,
        okFetcher('dexscreener', { priceUsd: 3 }),
        nulling,
      ]);
      expect(outcome.errors['thrower']).toContain('down-a');
      expect(outcome.errors['nuller']).toBe('no data');
      expect(outcome.sources).toEqual(['dexscreener']);
      expect(outcome.allFailed).toBe(false);
    });
  });
});
