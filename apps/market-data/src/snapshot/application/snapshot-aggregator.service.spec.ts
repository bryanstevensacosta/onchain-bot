import { SnapshotAggregatorService } from './snapshot-aggregator.service';
import type { QuoteFetcher, SnapshotQuote } from '../domain/snapshot-quote.types';

function okFetcher(
  name: string,
  quote: Partial<SnapshotQuote>,
  chains: ReadonlyArray<string> = ['solana', 'ethereum'],
): QuoteFetcher {
  return {
    name,
    supportsChains: chains,
    fetch: async () => quote,
  };
}

function failFetcher(name: string, message: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana', 'ethereum'],
    fetch: async () => {
      throw new Error(message);
    },
  };
}

function nullFetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana', 'ethereum'],
    fetch: async () => null,
  };
}

/**
 * Failing-first spec (Tramo 3, todo-3 aggregation gap).
 *
 * The aggregator fans out to supporting providers in parallel
 * (allSettled + per-call timeout) and merges first-non-null per field.
 * `ready` needs a single field; `pending` (all failed) carries
 * per-provider errors — never a silent shell.
 */
describe('SnapshotAggregatorService (parallel fan-out + first-non-null merge)', () => {
  let aggregator: SnapshotAggregatorService;

  beforeEach(() => {
    aggregator = new SnapshotAggregatorService();
  });

  it('merges one ok + one fail: fields from ok, error from fail', async () => {
    const outcome = await aggregator.aggregate('solana', 'addr', [
      okFetcher('dexscreener', { priceUsd: 1.5, symbol: 'WIF' }),
      failFetcher('geckoterminal', 'boom'),
    ]);
    expect(outcome.quote.priceUsd).toBe(1.5);
    expect(outcome.quote.symbol).toBe('WIF');
    expect(outcome.sources).toEqual(['dexscreener']);
    expect(outcome.errors['geckoterminal']).toContain('boom');
    expect(outcome.allFailed).toBe(false);
  });

  it('first-non-null wins per field across providers', async () => {
    const outcome = await aggregator.aggregate('solana', 'addr', [
      okFetcher('dexscreener', { priceUsd: 1.5 }),
      okFetcher('geckoterminal', {
        priceUsd: 1.6,
        holders: 42,
      }),
    ]);
    expect(outcome.quote.priceUsd).toBe(1.5);
    expect(outcome.quote.holders).toBe(42);
    expect(outcome.sources).toEqual(['dexscreener', 'geckoterminal']);
    expect(outcome.allFailed).toBe(false);
  });

  it('all fail -> allFailed with every provider error recorded', async () => {
    const outcome = await aggregator.aggregate('solana', 'addr', [
      failFetcher('dexscreener', 'down-a'),
      failFetcher('geckoterminal', 'down-b'),
    ]);
    expect(outcome.allFailed).toBe(true);
    expect(outcome.quote.priceUsd).toBeNull();
    expect(outcome.errors['dexscreener']).toContain('down-a');
    expect(outcome.errors['geckoterminal']).toContain('down-b');
    expect(outcome.sources).toEqual([]);
  });

  it('all null (no data) -> allFailed with misses recorded', async () => {
    const outcome = await aggregator.aggregate('solana', 'addr', [
      nullFetcher('dexscreener'),
      nullFetcher('geckoterminal'),
    ]);
    expect(outcome.allFailed).toBe(true);
    expect(Object.keys(outcome.errors)).toHaveLength(2);
  });

  it('slow provider past the timeout counts as failed, fast one still merges', async () => {
    const slow: QuoteFetcher = {
      name: 'slowpoke',
      supportsChains: ['solana'],
      fetch: async () => new Promise<null>(() => undefined),
    };
    const outcome = await aggregator.aggregate(
      'solana',
      'addr',
      [slow, okFetcher('dexscreener', { priceUsd: 2 })],
      50,
    );
    expect(outcome.quote.priceUsd).toBe(2);
    expect(outcome.errors['slowpoke']).toMatch(/timeout/i);
    expect(outcome.allFailed).toBe(false);
  });

  it('skips fetchers that do not support the chain', async () => {
    let called = 0;
    const evmOnly: QuoteFetcher = {
      name: 'evmonly',
      supportsChains: ['ethereum'],
      fetch: async () => {
        called += 1;
        return { priceUsd: 9 };
      },
    };
    const outcome = await aggregator.aggregate('solana', 'addr', [
      evmOnly,
      okFetcher('dexscreener', { priceUsd: 1 }),
    ]);
    expect(called).toBe(0);
    expect(outcome.quote.priceUsd).toBe(1);
  });
});
