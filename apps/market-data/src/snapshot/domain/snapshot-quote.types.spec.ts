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

describe('SnapshotQuote holderConcentration (rick-compact-card §10)', () => {
  it('emptySnapshotQuote carries holderConcentration: null', () => {
    expect(emptySnapshotQuote().holderConcentration).toBeNull();
  });

  it('SNAPSHOT_QUOTE_FIELDS includes it (the aggregator merge whitelist)', () => {
    expect([...SNAPSHOT_QUOTE_FIELDS]).toContain('holderConcentration');
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

describe('SnapshotQuote 5m bucket (dexter 5M row, rick-compact-card §10.16)', () => {
  it('emptySnapshotQuote carries the four 5m fields as null', () => {
    const quote = emptySnapshotQuote();
    expect(quote.volume5mUsd).toBeNull();
    expect(quote.priceChange5m).toBeNull();
    expect(quote.txns5mBuys).toBeNull();
    expect(quote.txns5mSells).toBeNull();
  });

  it('SNAPSHOT_QUOTE_FIELDS lists all four (merge whitelist)', () => {
    expect([...SNAPSHOT_QUOTE_FIELDS]).toEqual(
      expect.arrayContaining([
        'volume5mUsd',
        'priceChange5m',
        'txns5mBuys',
        'txns5mSells',
      ]),
    );
  });

  it('places the 5m block immediately after the 1h block (deterministic merge order)', () => {
    const fields = [...SNAPSHOT_QUOTE_FIELDS];
    const after = fields.indexOf('txns1hSells') + 1;
    expect(fields.slice(after, after + 4)).toEqual([
      'volume5mUsd',
      'priceChange5m',
      'txns5mBuys',
      'txns5mSells',
    ]);
  });
});
