/**
 * `SnapshotQuote.geckoLaunchpadHint` contract (dexter plan todo 72):
 * dedicated GeckoTerminal `/info` writer field, carried by the generic
 * merge exactly like `dexscreenerFdvUsd`.
 */
import {
  SNAPSHOT_QUOTE_FIELDS,
  emptySnapshotQuote,
} from './snapshot-quote.types';

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
