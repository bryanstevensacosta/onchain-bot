import type {
  DexScreenerPair,
  DexScreenerPairSummary,
} from './dexscreener.types';
import { selectBestPairSummaryForSlug } from './dexscreener.service';
import { DiscoveryCacheService } from 'snapshot/application/discovery-cache.service';
import { DiscoveryCacheRepository } from 'snapshot/infrastructure/discovery-cache.repository';

/**
 * 1-hour market bucket (dexter `1H` row) — summary mapper contract.
 *
 * BOTH mappers must stay byte-parity: `toPairSummary` in
 * `dexscreener.service.ts` and `toSummaryFromTripwire` in
 * `discovery-cache.service.ts`. Pair-level only — `volume.h1` and
 * `priceChange.h1` are NOT summed with other buckets (the pre-existing
 * `volume24h` bucket-sum oddity is deliberately untouched). Honesty
 * rules pinned here: absent/non-finite → `null` (never `0`), a real
 * `0` survives as `0`, and a partial/non-finite `txns.h1` nulls the
 * WHOLE object (never a `{buys:0,sells:0}` default — absence must
 * silence downstream).
 */
const MINT = 'Mint1111111111111111111111111111111111111111';
const SLUG = 'solana';
const PAIR = 'Pair11111111111111111111111111111111111111';

function pair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: SLUG,
    dexId: 'raydium',
    url: 'https://dexscreener.com/solana/pair',
    pairAddress: PAIR,
    labels: [],
    baseToken: { address: MINT, name: 'Mint', symbol: 'MINT' },
    quoteToken: { address: null, name: null, symbol: null },
    priceNative: '0.01',
    priceUsd: '0.5',
    txns: { h24: { buys: 10, sells: 5 }, h1: { buys: 7, sells: 3 } },
    volume: { h24: 1000, h1: 12.5 },
    priceChange: { h24: 2.5, h1: -0.25 },
    liquidity: { usd: 5000, base: 1, quote: 1 },
    fdv: 100,
    marketCap: 90,
    pairCreatedAt: null,
    ...overrides,
  };
}

const viaServiceMapper = async (
  input: DexScreenerPair,
): Promise<DexScreenerPairSummary> => {
  const summary = selectBestPairSummaryForSlug([input], SLUG);
  if (summary === null) throw new Error('service mapper returned null');
  return summary;
};

const viaTripwireMapper = async (
  input: DexScreenerPair,
): Promise<DexScreenerPairSummary> => {
  const repo = new DiscoveryCacheRepository();
  await repo.save(SLUG, MINT, input.pairAddress, input.dexId);
  const service = new DiscoveryCacheService(repo, {
    getPairByAddress: async () => input,
  } as never);
  const summary = await service.resolveDiscovery(SLUG, MINT);
  if (summary === null) throw new Error('tripwire mapper returned null');
  return summary;
};

const MAPPERS: ReadonlyArray<
  [
    name: string,
    map: (input: DexScreenerPair) => Promise<DexScreenerPairSummary>,
  ]
> = [
  ['toPairSummary (service)', viaServiceMapper],
  ['toSummaryFromTripwire (discovery cache)', viaTripwireMapper],
];

describe.each(MAPPERS)('DexScreenerSummary 1h bucket — %s', (_name, map) => {
  it('carries pair-level volume.h1 + priceChange.h1 + txns.h1 verbatim', async () => {
    const summary = await map(pair());
    expect(summary.volume1hUsd).toBe(12.5);
    expect(summary.priceChange1h).toBe(-0.25);
    expect(summary.txns1h).toEqual({ buys: 7, sells: 3 });
    // Untouched neighbors (the 24h bucket sum/mapping keeps its
    // pre-existing behavior: `volume24h` sums EVERY bucket present,
    // including h1 — the documented oddity stays as-is).
    expect(summary.volume24h).toBe(1012.5);
    expect(summary.priceChange24h).toBe(2.5);
    expect(summary.txns24h).toEqual({ buys: 10, sells: 5 });
  });

  it('nulls every 1h field when the buckets are absent', async () => {
    const summary = await map(
      pair({
        txns: { h24: { buys: 10, sells: 5 } },
        volume: { h24: 1000 },
        priceChange: { h24: 2.5 },
      }),
    );
    expect(summary.volume1hUsd).toBeNull();
    expect(summary.priceChange1h).toBeNull();
    expect(summary.txns1h).toBeNull();
  });

  it('nulls non-finite h1 values (never 0)', async () => {
    const summary = await map(
      pair({
        txns: { h24: { buys: 10, sells: 5 }, h1: { buys: 7, sells: 3 } },
        volume: { h24: 1000, h1: Number.NaN },
        priceChange: { h24: 2.5, h1: Number.POSITIVE_INFINITY },
      }),
    );
    expect(summary.volume1hUsd).toBeNull();
    expect(summary.priceChange1h).toBeNull();
    // txns.h1 itself was finite here — only the numeric buckets null.
    expect(summary.txns1h).toEqual({ buys: 7, sells: 3 });
  });

  it('nulls txns1h when h1 is partial (missing side) — no {0,0} default', async () => {
    const summary = await map(
      pair({
        // Runtime shape guard: a partial upstream object must not be
        // completed with zeros.
        txns: {
          h24: { buys: 10, sells: 5 },
          h1: { buys: 7 } as unknown as { buys: number; sells: number },
        },
        volume: { h24: 1000 },
        priceChange: { h24: 2.5 },
      }),
    );
    expect(summary.txns1h).toBeNull();
  });

  it('nulls txns1h when either side is non-finite', async () => {
    const summary = await map(
      pair({
        txns: {
          h24: { buys: 10, sells: 5 },
          h1: { buys: 7, sells: Number.NaN },
        },
      }),
    );
    expect(summary.txns1h).toBeNull();
  });

  it('keeps a real 0 in every 1h field', async () => {
    const summary = await map(
      pair({
        txns: { h24: { buys: 10, sells: 5 }, h1: { buys: 0, sells: 0 } },
        volume: { h24: 1000, h1: 0 },
        priceChange: { h24: 2.5, h1: 0 },
      }),
    );
    expect(summary.volume1hUsd).toBe(0);
    expect(summary.priceChange1h).toBe(0);
    expect(summary.txns1h).toEqual({ buys: 0, sells: 0 });
  });
});

describe('1h mapper parity (byte-equality across both mappers)', () => {
  it('service and tripwire mappers emit identical 1h values', async () => {
    const input = pair();
    const [service, tripwire] = await Promise.all([
      viaServiceMapper(input),
      viaTripwireMapper(input),
    ]);
    expect(tripwire.volume1hUsd).toBe(service.volume1hUsd);
    expect(tripwire.priceChange1h).toBe(service.priceChange1h);
    expect(tripwire.txns1h).toEqual(service.txns1h);
  });
});
