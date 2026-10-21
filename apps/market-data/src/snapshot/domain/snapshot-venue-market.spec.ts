/**
 * `applyVenueMarketFields` (dexter plan todo 72) — contract pins:
 * null-only fill, `0` preserved, same-object on a no-op, provenance
 * signal only when a quote field was actually written.
 */
import { emptySnapshotQuote } from './snapshot-quote.types';
import {
  applyVenueMarketFields,
  type VenueMarketReading,
} from './snapshot-venue-market';

const MARKET: VenueMarketReading = {
  liquidityUsd: 2365.4217,
  volume24hUsd: 0,
  priceChange24h: 0,
  poolCreatedAtMs: Date.parse('2026-10-14T12:44:35.000Z'),
};

function quoteWith(overrides: Partial<ReturnType<typeof emptySnapshotQuote>>) {
  return { ...emptySnapshotQuote(), ...overrides };
}

describe('applyVenueMarketFields', () => {
  it('fills the three null quote fields from the venue reading', () => {
    const { quote, applied } = applyVenueMarketFields(
      emptySnapshotQuote(),
      MARKET,
    );

    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(2365.4217);
    expect(quote.volume24hUsd).toBe(0);
    expect(quote.priceChange24h).toBe(0);
  });

  it('keeps a real 0 from the quote (never "nullish" a zero away)', () => {
    const base = quoteWith({ volume24hUsd: 0, priceChange24h: 0 });

    const { quote, applied } = applyVenueMarketFields(base, {
      ...MARKET,
      volume24hUsd: 99,
      priceChange24h: 42,
    });

    // The zeroes survive; liquidity is the only field that was null.
    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(2365.4217);
    expect(quote.volume24hUsd).toBe(0);
    expect(quote.priceChange24h).toBe(0);
  });

  it('is null-only per field: a non-null quote field always wins', () => {
    const base = quoteWith({
      liquidityUsd: 500,
      volume24hUsd: 12,
      priceChange24h: -3.5,
    });

    const { quote, applied } = applyVenueMarketFields(base, MARKET);

    expect(applied).toBe(false);
    expect(quote).toBe(base);
    expect(quote.liquidityUsd).toBe(500);
    expect(quote.volume24hUsd).toBe(12);
    expect(quote.priceChange24h).toBe(-3.5);
  });

  it('fills only the missing fields and leaves the others untouched', () => {
    const base = quoteWith({ liquidityUsd: 500 });

    const { quote, applied } = applyVenueMarketFields(base, MARKET);

    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(500);
    expect(quote.volume24hUsd).toBe(0);
    expect(quote.priceChange24h).toBe(0);
  });

  it('returns the SAME quote object when nothing changes', () => {
    const base = emptySnapshotQuote();

    const { quote, applied } = applyVenueMarketFields(base, {
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      poolCreatedAtMs: null,
    });

    expect(applied).toBe(false);
    expect(quote).toBe(base);
  });

  it('returns the same object for a null reading', () => {
    const base = emptySnapshotQuote();

    const { quote, applied } = applyVenueMarketFields(base, null);

    expect(applied).toBe(false);
    expect(quote).toBe(base);
  });

  it('never treats pairCreatedAt alone as a fill (provenance rule)', () => {
    const base = emptySnapshotQuote();

    const { quote, applied } = applyVenueMarketFields(base, {
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      poolCreatedAtMs: 1791892874000,
    });

    expect(applied).toBe(false);
    expect(quote).toBe(base);
  });

  it('does not touch any other quote field', () => {
    const base = quoteWith({ priceUsd: 0.000002325209423, holders: 66 });

    const { quote } = applyVenueMarketFields(base, MARKET);

    expect(quote.priceUsd).toBe(0.000002325209423);
    expect(quote.holders).toBe(66);
    expect(quote.totalSupply).toBeNull();
    expect(quote.fdvUsd).toBeNull();
  });
});
