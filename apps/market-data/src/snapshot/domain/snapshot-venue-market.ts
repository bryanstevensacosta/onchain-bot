/**
 * Venue market fill (dexter plan todo 72) — pure, null-only.
 *
 * GeckoTerminal's token `/info` carries price/FDV/holders but NOT
 * `volume_usd` nor `price_change_percentage`; the SAME token's pool
 * carries `reserve_in_usd`, `volume_usd.h24|h1`,
 * `price_change_percentage.h24|h1`, `transactions.h1` and
 * `pool_created_at`. This helper folds those pool numbers into the merged
 * quote WITHOUT making any provider the owner of
 * a field it does not own: a value is written ONLY where the merged
 * quote is null (`??`-only, so a real `0` is preserved and never
 * replaced by another provider's number).
 *
 * The reading is harvested by the OHLC-derivation leg from the pool pick
 * it ALREADY fetches (`acquireDerivationCandles`, plan todo 72 fork B),
 * so the healthy fan-out pays zero extra HTTP calls. Its `sources`
 * provenance is the plain `geckoterminal` (never `-ohlcv`: no candle
 * series is fetched when the pick itself answers the change).
 *
 * `applied` is true only when at least one of the SEVEN quote fields
 * (liquidity, volume24h, priceChange24h, volume1h, priceChange1h,
 * txns1hBuys, txns1hSells) was actually written. `poolCreatedAtMs` is a
 * plumbing value (it feeds the snapshot's `pairCreatedAt`), not a quote
 * field: it is returned in the same reading but never counts as a fill by
 * itself, so provenance is only claimed when the card really gained
 * market data.
 *
 * The transaction pair is a WHOLE-PAIR reading (same rule as the pool
 * mapper): a partial side is never completed from another source, and a
 * partially native pair is never mixed with venue numbers.
 *
 * The caller owns validation (finite numbers or null); this function
 * never coerces, never guesses, and returns the SAME quote object when
 * nothing changes (referential identity is asserted by its spec).
 */
import type { SnapshotQuote } from './snapshot-quote.types';

export interface VenueMarketReading {
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly priceChange24h: number | null;
  /**
   * 1-hour pool volume in USD (dexter `1H` row), harvested from the
   * SAME picked pool: PAIR-LEVEL (never summed), real `0` survives,
   * absent/non-finite is null.
   */
  readonly volume1hUsd: number | null;
  /**
   * 1-hour pool price change in percent (dexter `1H` row): BASE-SIDE
   * only — the pool's change describes its base token, so a quote-side
   * pick carries null.
   */
  readonly priceChange1h: number | null;
  /**
   * 1-hour transaction counts (dexter `1H` row), WHOLE-PAIR rule: both
   * sides are present together or BOTH are null (never `{0,0}`).
   */
  readonly txns1hBuys: number | null;
  readonly txns1hSells: number | null;
  /**
   * Pool dex id harvested from the SAME `selectPoolQuote` pick the
   * derivation leg already paid for (zero extra calls). Consumed
   * null-only by the snapshot seam's `venue` fallback: when the venue
   * tail dies (429/timeout) this pick still names the pool's DEX, so
   * the card keeps an honest venue instead of `null`.
   */
  readonly dexId: string | null;
  /**
   * Pool creation time (ms epoch) from the SAME pool that supplied the
   * numbers above. Consumed null-only by the snapshot seam's
   * `pairCreatedAt` (the DexScreener pair keeps precedence).
   */
  readonly poolCreatedAtMs: number | null;
}

export interface VenueMarketFillResult {
  readonly quote: SnapshotQuote;
  /**
   * True when at least one of `liquidityUsd` / `volume24hUsd` /
   * `priceChange24h` / `volume1hUsd` / `priceChange1h` /
   * `txns1hBuys` / `txns1hSells` was written from the venue reading.
   * Drives the provenance append (`geckoterminal` in `sources`).
   */
  readonly applied: boolean;
}

export function applyVenueMarketFields(
  quote: SnapshotQuote,
  market: VenueMarketReading | null,
): VenueMarketFillResult {
  if (market === null) return { quote, applied: false };

  const liquidityUsd = quote.liquidityUsd ?? market.liquidityUsd;
  const volume24hUsd = quote.volume24hUsd ?? market.volume24hUsd;
  const priceChange24h = quote.priceChange24h ?? market.priceChange24h;
  const volume1hUsd = quote.volume1hUsd ?? market.volume1hUsd;
  const priceChange1h = quote.priceChange1h ?? market.priceChange1h;
  const txns1h = mergeTxns1hPair(quote, market);

  const applied =
    liquidityUsd !== quote.liquidityUsd ||
    volume24hUsd !== quote.volume24hUsd ||
    priceChange24h !== quote.priceChange24h ||
    volume1hUsd !== quote.volume1hUsd ||
    priceChange1h !== quote.priceChange1h ||
    txns1h.buys !== quote.txns1hBuys ||
    txns1h.sells !== quote.txns1hSells;

  if (!applied) return { quote, applied: false };

  return {
    quote: {
      ...quote,
      liquidityUsd,
      volume24hUsd,
      priceChange24h,
      volume1hUsd,
      priceChange1h,
      txns1hBuys: txns1h.buys,
      txns1hSells: txns1h.sells,
    },
    applied: true,
  };
}

/**
 * WHOLE-PAIR 1h transactions: a native pair (either side non-null) is
 * kept verbatim — the venue never completes or mixes it; a fully-null
 * quote is filled ONLY when the reading itself carries both sides.
 */
function mergeTxns1hPair(
  quote: SnapshotQuote,
  market: VenueMarketReading,
): { readonly buys: number | null; readonly sells: number | null } {
  if (quote.txns1hBuys !== null || quote.txns1hSells !== null) {
    return { buys: quote.txns1hBuys, sells: quote.txns1hSells };
  }
  if (market.txns1hBuys === null || market.txns1hSells === null) {
    return { buys: null, sells: null };
  }
  return { buys: market.txns1hBuys, sells: market.txns1hSells };
}
