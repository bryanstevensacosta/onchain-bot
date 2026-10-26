/**
 * `applyVenueMarketFields` (dexter plan todo 72) — contract pins:
 * null-only fill, `0` preserved, same-object on a no-op, provenance
 * signal only when a quote field was actually written. The 1h bucket
 * (`volume1hUsd` / `priceChange1h` / `txns1hBuys` / `txns1hSells`) rides
 * the SAME pick and follows the same null-only rule; txns stay a WHOLE
 * PAIR (never half-filled, never mixed across sources).
 */
import { emptySnapshotQuote } from './snapshot-quote.types';
import {
  applyVenueMarketFields,
  type VenueMarketReading,
} from './snapshot-venue-market';

const MARKET: VenueMarketReading = {
  dexId: 'pumpswap',
  liquidityUsd: 2365.4217,
  volume24hUsd: 0,
  priceChange24h: 0,
  volume1hUsd: 12.5,
  priceChange1h: 3.25,
  txns1hBuys: 7,
  txns1hSells: 3,
  poolCreatedAtMs: Date.parse('2026-10-14T12:44:35.000Z'),
};

function quoteWith(overrides: Partial<ReturnType<typeof emptySnapshotQuote>>) {
  return { ...emptySnapshotQuote(), ...overrides };
}

describe('applyVenueMarketFields', () => {
  it('fills the seven null quote fields from the venue reading', () => {
    const { quote, applied } = applyVenueMarketFields(
      emptySnapshotQuote(),
      MARKET,
    );

    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(2365.4217);
    expect(quote.volume24hUsd).toBe(0);
    expect(quote.priceChange24h).toBe(0);
    expect(quote.volume1hUsd).toBe(12.5);
    expect(quote.priceChange1h).toBe(3.25);
    expect(quote.txns1hBuys).toBe(7);
    expect(quote.txns1hSells).toBe(3);
  });

  it('keeps a real 0 from the quote (never "nullish" a zero away)', () => {
    const base = quoteWith({
      volume24hUsd: 0,
      priceChange24h: 0,
      volume1hUsd: 0,
      priceChange1h: 0,
      txns1hBuys: 0,
      txns1hSells: 0,
    });

    const { quote, applied } = applyVenueMarketFields(base, {
      ...MARKET,
      volume24hUsd: 99,
      priceChange24h: 42,
      volume1hUsd: 99,
      priceChange1h: 42,
      txns1hBuys: 9,
      txns1hSells: 9,
    });

    // The native zeroes survive; liquidity is the only null field left.
    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(2365.4217);
    expect(quote.volume24hUsd).toBe(0);
    expect(quote.priceChange24h).toBe(0);
    expect(quote.volume1hUsd).toBe(0);
    expect(quote.priceChange1h).toBe(0);
    expect(quote.txns1hBuys).toBe(0);
    expect(quote.txns1hSells).toBe(0);
  });

  it('is null-only per field: a non-null quote field always wins', () => {
    const base = quoteWith({
      liquidityUsd: 500,
      volume24hUsd: 12,
      priceChange24h: -3.5,
      volume1hUsd: 7,
      priceChange1h: -0.5,
      txns1hBuys: 4,
      txns1hSells: 2,
    });

    const { quote, applied } = applyVenueMarketFields(base, MARKET);

    expect(applied).toBe(false);
    expect(quote).toBe(base);
    expect(quote.liquidityUsd).toBe(500);
    expect(quote.volume24hUsd).toBe(12);
    expect(quote.priceChange24h).toBe(-3.5);
    expect(quote.volume1hUsd).toBe(7);
    expect(quote.priceChange1h).toBe(-0.5);
    expect(quote.txns1hBuys).toBe(4);
    expect(quote.txns1hSells).toBe(2);
  });

  it('applies when ONLY the 1h fields fill', () => {
    const base = quoteWith({
      liquidityUsd: 500,
      volume24hUsd: 12,
      priceChange24h: -3.5,
    });

    const { quote, applied } = applyVenueMarketFields(base, MARKET);

    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(500);
    expect(quote.volume24hUsd).toBe(12);
    expect(quote.priceChange24h).toBe(-3.5);
    expect(quote.volume1hUsd).toBe(12.5);
    expect(quote.priceChange1h).toBe(3.25);
    expect(quote.txns1hBuys).toBe(7);
    expect(quote.txns1hSells).toBe(3);
  });

  it('fills only the missing fields and leaves the others untouched', () => {
    const base = quoteWith({ liquidityUsd: 500 });

    const { quote, applied } = applyVenueMarketFields(base, MARKET);

    expect(applied).toBe(true);
    expect(quote.liquidityUsd).toBe(500);
    expect(quote.volume24hUsd).toBe(0);
    expect(quote.priceChange24h).toBe(0);
    expect(quote.volume1hUsd).toBe(12.5);
    expect(quote.priceChange1h).toBe(3.25);
    expect(quote.txns1hBuys).toBe(7);
    expect(quote.txns1hSells).toBe(3);
  });

  it('never half-fills the txns pair from a partial reading', () => {
    const base = emptySnapshotQuote();

    const { quote, applied } = applyVenueMarketFields(base, {
      ...MARKET,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      volume1hUsd: null,
      priceChange1h: null,
      txns1hBuys: 7,
      txns1hSells: null,
    });

    // One side missing = no reading at all; absence never becomes 0.
    expect(applied).toBe(false);
    expect(quote).toBe(base);
  });

  it('never mixes a native txns side with a venue side', () => {
    const base = quoteWith({ txns1hBuys: 4, txns1hSells: null });

    const { quote, applied } = applyVenueMarketFields(base, {
      ...MARKET,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      volume1hUsd: null,
      priceChange1h: null,
    });

    // A partially native pair stays exactly as it came in — the venue
    // never completes it, and nothing else was blank.
    expect(applied).toBe(false);
    expect(quote).toBe(base);
    expect(quote.txns1hBuys).toBe(4);
    expect(quote.txns1hSells).toBeNull();
  });

  it('returns the SAME quote object when nothing changes', () => {
    const base = emptySnapshotQuote();

    const { quote, applied } = applyVenueMarketFields(base, {
      dexId: null,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      volume1hUsd: null,
      priceChange1h: null,
      txns1hBuys: null,
      txns1hSells: null,
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
      dexId: 'pumpswap',
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24h: null,
      volume1hUsd: null,
      priceChange1h: null,
      txns1hBuys: null,
      txns1hSells: null,
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
