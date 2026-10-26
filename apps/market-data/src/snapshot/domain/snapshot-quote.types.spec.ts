/**
 * `SnapshotQuote.geckoLaunchpadHint` contract (dexter plan todo 72):
 * dedicated GeckoTerminal `/info` writer field, carried by the generic
 * merge exactly like `dexscreenerFdvUsd`.
 */
import {
  SNAPSHOT_QUOTE_FIELDS,
  emptySnapshotQuote,
} from './snapshot-quote.types';

describe('SnapshotQuote 1h bucket (dexter 1H row)', () => {
  it('emptySnapshotQuote carries the four 1h fields as null', () => {
    const quote = emptySnapshotQuote();
    expect(quote.volume1hUsd).toBeNull();
    expect(quote.priceChange1h).toBeNull();
    expect(quote.txns1hBuys).toBeNull();
    expect(quote.txns1hSells).toBeNull();
  });

  it('SNAPSHOT_QUOTE_FIELDS lists all four (merge whitelist)', () => {
    expect([...SNAPSHOT_QUOTE_FIELDS]).toEqual(
      expect.arrayContaining([
        'volume1hUsd',
        'priceChange1h',
        'txns1hBuys',
        'txns1hSells',
      ]),
    );
  });
});

describe('SnapshotQuote geckoLaunchpadHint (todo 72)', () => {
  it('emptySnapshotQuote carries geckoLaunchpadHint: null', () => {
    expect(emptySnapshotQuote().geckoLaunchpadHint).toBeNull();
  });

  it('SNAPSHOT_QUOTE_FIELDS includes it immediately after dexscreenerFdvUsd', () => {
    const fields = [...SNAPSHOT_QUOTE_FIELDS];
    expect(fields).toContain('geckoLaunchpadHint');
    expect(fields.indexOf('geckoLaunchpadHint')).toBe(
      fields.indexOf('dexscreenerFdvUsd') + 1,
    );
  });
});
