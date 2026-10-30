import type { DexScreenerPair } from './dexscreener.types';
import {
  selectBestPairSummaryForSlug,
  selectPumpfunPairForSlug,
} from './dexscreener.service';

/**
 * 5-minute market bucket (dexter `5M` row, `rick-compact-card` §10.16).
 *
 * SOURCE is the `dexId === 'pumpfun'` pair — NEVER the best-liquidity
 * pick: the strict discovery answer is usually a MIGRATED pool, so the
 * curve's own pair is unreachable through a liquidity sort. The
 * selector is explicit (`chainId === slug` + `dexId === 'pumpfun'`,
 * first match, no sort, no fallback to another dex).
 *
 * Guard rules pinned here (identical to the 1h bucket, byte-parity with
 * `toSummaryFromTripwire` in `discovery-cache.service.ts`): absent /
 * non-finite → `null` (never `0`), a real `0` survives, and a
 * partial/non-finite `txns.m5` nulls BOTH sides (never a
 * `{buys:0,sells:0}` completion).
 */
const SLUG = 'solana';
const MINT = '2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC';
const PUMPFUN_PAIR = '5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC';
const METEORA_PAIR = 'DGTReDmeteoraPairFixture1111111111111111';
const BTC_QUOTE = 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump';

function pair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: SLUG,
    dexId: 'pumpfun',
    url: 'https://dexscreener.com/solana/pair',
    pairAddress: PUMPFUN_PAIR,
    labels: [],
    baseToken: { address: MINT, name: 'Bitcoin', symbol: 'BTC' },
    quoteToken: { address: BTC_QUOTE, name: 'Bitcoin', symbol: 'Bitcoin' },
    priceNative: '0.0000001',
    priceUsd: null,
    txns: {
      h24: { buys: 10, sells: 5 },
      m5: { buys: 1, sells: 3 },
    },
    volume: { h24: 1000, m5: 0 },
    priceChange: { h24: 2.5, m5: -1.25 },
    liquidity: null,
    fdv: null,
    marketCap: null,
    pairCreatedAt: null,
    ...overrides,
  };
}

describe('selectPumpfunPairForSlug (dexter 5M row source)', () => {
  it('picks the pumpfun row even when a higher-liquidity pair exists (no sort)', () => {
    const meteora = pair({
      pairAddress: METEORA_PAIR,
      dexId: 'meteora',
      liquidity: { usd: 25.53, base: 1, quote: 1 },
      volume: { h24: 900, m5: 42 },
    });
    const pumpfun = pair({ liquidity: null });

    // Contrast: the strict discovery selector takes the liquid pool …
    expect(selectBestPairSummaryForSlug([meteora, pumpfun], SLUG)?.dexId).toBe(
      'meteora',
    );
    // … while the 5m selector is explicit and order-insensitive.
    expect(
      selectPumpfunPairForSlug([meteora, pumpfun], SLUG)?.pairAddress,
    ).toBe(PUMPFUN_PAIR);
    expect(
      selectPumpfunPairForSlug([pumpfun, meteora], SLUG)?.pairAddress,
    ).toBe(PUMPFUN_PAIR);
  });

  it('rejects a pumpfun row from another chain (chain-honest)', () => {
    const foreign = pair({ chainId: 'base' });
    expect(selectPumpfunPairForSlug([foreign], SLUG)).toBeNull();
  });

  it('resolves null when no pumpfun row exists, the list is empty or missing', () => {
    expect(
      selectPumpfunPairForSlug([pair({ dexId: 'raydium' })], SLUG),
    ).toBeNull();
    expect(selectPumpfunPairForSlug([], SLUG)).toBeNull();
    expect(selectPumpfunPairForSlug(null, SLUG)).toBeNull();
    expect(selectPumpfunPairForSlug(undefined, SLUG)).toBeNull();
  });

  it('carries the pair-level 5m bucket verbatim through toPairSummary', () => {
    const summary = selectPumpfunPairForSlug([pair()], SLUG);
    expect(summary).not.toBeNull();
    expect(summary?.volume5mUsd).toBe(0);
    expect(summary?.priceChange5m).toBe(-1.25);
    expect(summary?.txns5mBuys).toBe(1);
    expect(summary?.txns5mSells).toBe(3);
  });

  it('nulls every 5m field when the buckets are absent', () => {
    const summary = selectPumpfunPairForSlug(
      [
        pair({
          txns: { h24: { buys: 10, sells: 5 } },
          volume: { h24: 1000 },
          priceChange: { h24: 2.5 },
        }),
      ],
      SLUG,
    );
    expect(summary?.volume5mUsd).toBeNull();
    expect(summary?.priceChange5m).toBeNull();
    expect(summary?.txns5mBuys).toBeNull();
    expect(summary?.txns5mSells).toBeNull();
  });

  it('nulls non-finite m5 values (never 0)', () => {
    const summary = selectPumpfunPairForSlug(
      [
        pair({
          txns: { m5: { buys: 1, sells: 3 } },
          volume: { m5: Number.NaN },
          priceChange: { m5: Number.POSITIVE_INFINITY },
        }),
      ],
      SLUG,
    );
    expect(summary?.volume5mUsd).toBeNull();
    expect(summary?.priceChange5m).toBeNull();
    // txns.m5 itself was finite — only the numeric buckets null.
    expect(summary?.txns5mBuys).toBe(1);
    expect(summary?.txns5mSells).toBe(3);
  });

  it('nulls BOTH txns sides when the m5 pair is partial (no {0,0} default)', () => {
    const summary = selectPumpfunPairForSlug(
      [
        pair({
          // Runtime shape guard: a partial upstream object must never
          // be completed with zeros.
          txns: {
            h24: { buys: 10, sells: 5 },
            m5: { buys: 1 } as unknown as { buys: number; sells: number },
          },
        }),
      ],
      SLUG,
    );
    expect(summary?.txns5mBuys).toBeNull();
    expect(summary?.txns5mSells).toBeNull();
  });

  it('nulls BOTH txns sides when either side is non-finite', () => {
    const summary = selectPumpfunPairForSlug(
      [pair({ txns: { m5: { buys: 1, sells: Number.NaN } } })],
      SLUG,
    );
    expect(summary?.txns5mBuys).toBeNull();
    expect(summary?.txns5mSells).toBeNull();
  });

  it('keeps a real 0 in every 5m field (a zero count is a reading)', () => {
    const summary = selectPumpfunPairForSlug(
      [
        pair({
          txns: { m5: { buys: 0, sells: 0 } },
          volume: { m5: 0 },
          priceChange: { m5: 0 },
        }),
      ],
      SLUG,
    );
    expect(summary?.volume5mUsd).toBe(0);
    expect(summary?.priceChange5m).toBe(0);
    expect(summary?.txns5mBuys).toBe(0);
    expect(summary?.txns5mSells).toBe(0);
  });
});
