import { Logger } from '@nestjs/common';
import type { SnapshotQuote } from 'snapshot/domain/snapshot-quote.types';
import {
  priceDivergeBps,
  selectPreferredQuote,
  TOLERANCE_DEFAULT_BPS,
} from './evm-tolerance';

const aggregator = (overrides?: Partial<SnapshotQuote>): SnapshotQuote => ({
  priceUsd: 100,
  marketCapUsd: 1_000_000,
  fdvUsd: 2_000_000,
  liquidityUsd: 500_000,
  volume24hUsd: 10_000,
  priceChange24h: 1.5,
  holders: 1000,
  top10HolderPercent: 12,
  symbol: 'T',
  name: 'Token',
  lockedLiquidityPercent: null,
  burnedPercent: null,
  totalSupply: 1_000_000_000,
  circulatingSupply: 800_000_000,
  maxSupply: 1_000_000_000,
  devWallets: null,
  devPctSupply: null,
  ...overrides,
});

const silentLogger = (): Pick<Logger, 'warn'> & {
  readonly lines: string[];
} => {
  const lines: string[] = [];
  return {
    lines,
    warn: (message: string) => {
      lines.push(message);
    },
  };
};

describe('evm tolerance (direct-vs-aggregator at the snapshot seam)', () => {
  it('pins the default tolerance (100bps = 1%)', () => {
    expect(TOLERANCE_DEFAULT_BPS).toBe(100);
  });

  it('measures signed bps (null when unmeasurable)', () => {
    expect(priceDivergeBps(103, 100)).toBeCloseTo(300, 6);
    expect(priceDivergeBps(99, 100)).toBeCloseTo(-100, 6);
    expect(priceDivergeBps(null, 100)).toBeNull();
    expect(priceDivergeBps(100, 0)).toBeNull();
    expect(priceDivergeBps(100, null)).toBeNull();
  });

  it('converges: within tolerance prefers direct silently', () => {
    const logger = silentLogger();
    const outcome = selectPreferredQuote({ priceUsd: 100.5 }, aggregator(), {
      logger,
    });
    expect(outcome.diverged).toBe(false);
    expect(outcome.divergeBps).toBeCloseTo(50, 6);
    expect(outcome.quote.priceUsd).toBe(100.5);
    expect(logger.lines).toHaveLength(0);
  });

  it('diverges: beyond tolerance still prefers direct + LOGS (render unblocked)', () => {
    const logger = silentLogger();
    const outcome = selectPreferredQuote({ priceUsd: 103 }, aggregator(), {
      logger,
    });
    expect(outcome.diverged).toBe(true);
    expect(outcome.divergeBps).toBeCloseTo(300, 6);
    // Fresh-direct wins even while diverged — the log is the metric.
    expect(outcome.quote.priceUsd).toBe(103);
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]).toContain('300.0bps');
  });

  it('falls back: direct null returns the aggregator quote verbatim', () => {
    const base = aggregator();
    const outcome = selectPreferredQuote(null, base, {
      logger: silentLogger(),
    });
    expect(outcome.quote).toBe(base);
    expect(outcome.diverged).toBe(false);
    expect(outcome.divergeBps).toBeNull();
  });

  it('merges partially: direct gaps never blank aggregator fields', () => {
    const outcome = selectPreferredQuote(
      { liquidityUsd: 600_000 },
      aggregator(),
      { logger: silentLogger() },
    );
    expect(outcome.quote.liquidityUsd).toBe(600_000);
    expect(outcome.quote.priceUsd).toBe(100);
    expect(outcome.diverged).toBe(false);
  });
});
