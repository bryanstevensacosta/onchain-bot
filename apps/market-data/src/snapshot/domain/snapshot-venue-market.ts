/**
 * Venue market fill (dexter plan todo 72) — pure, null-only.
 *
 * GeckoTerminal's token `/info` carries price/FDV/holders but NOT
 * `volume_usd` nor `price_change_percentage`; the SAME token's pool
 * carries `reserve_in_usd`, `volume_usd.h24`, `price_change_percentage.h24` and
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
 * `applied` is true only when at least one of the THREE quote fields was
 * actually written. `poolCreatedAtMs` is a plumbing value (it feeds the
 * snapshot's `pairCreatedAt`), not a quote field: it is returned in the
 * same reading but never counts as a fill by itself, so provenance is
 * only claimed when the card really gained market data.
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
   * `priceChange24h` was written from the venue reading. Drives the
   * provenance append (`geckoterminal` in `sources`).
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

  const applied =
    liquidityUsd !== quote.liquidityUsd ||
    volume24hUsd !== quote.volume24hUsd ||
    priceChange24h !== quote.priceChange24h;

  if (!applied) return { quote, applied: false };

  return {
    quote: { ...quote, liquidityUsd, volume24hUsd, priceChange24h },
    applied: true,
  };
}
