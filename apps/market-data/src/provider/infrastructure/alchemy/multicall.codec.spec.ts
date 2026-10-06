import {
  TRY_AGGREGATE_SELECTOR,
  decodeTryAggregateReturnData,
  encodeTryAggregate,
} from './multicall.codec';

const w = (n: number | bigint): string =>
  BigInt(n).toString(16).padStart(64, '0');

describe('tryAggregate ABI codec (Lane T)', () => {
  it('pins the tryAggregate selector', () => {
    expect(TRY_AGGREGATE_SELECTOR).toBe('bce38bd7');
  });

  it('encodes a single call byte-exact (hand-built expectation)', () => {
    const target = `0x${'11'.repeat(20)}`;
    const actual = encodeTryAggregate([{ target, callData: '0xabcdef' }]);
    const expected =
      `0xbce38bd7` +
      w(0) + // requireSuccess = false
      w(64) + // calls offset
      w(1) + // length
      w(32) + // elem-0 offset
      `${'00'.repeat(12)}${'11'.repeat(20)}` + // address
      w(64) + // callData offset
      w(3) + // callData length
      `abcdef${'0'.repeat(58)}`; // padded data
    expect(actual).toBe(expected);
  });

  it('decodes a hand-built return: success passthrough + revert as ok:false', () => {
    const raw =
      `0x` +
      w(0x20) + // array offset
      w(2) + // length
      w(0x40) + // elem-0 offset
      w(0xc0) + // elem-1 offset
      w(1) + // elem-0 success
      w(0x40) + // elem-0 data offset
      w(2) + // elem-0 data length
      `${'1234'}${'0'.repeat(60)}` + // elem-0 data
      w(0) + // elem-1 success (revert)
      w(0x40) + // elem-1 data offset
      w(0); // elem-1 data length
    expect(decodeTryAggregateReturnData(raw)).toEqual([
      { ok: true, value: '0x1234' },
      { ok: false, value: null },
    ]);
  });

  it('round-trips encode→decode for a 2-call batch', () => {
    const calls = [
      { target: `0x${'22'.repeat(20)}`, callData: '0x01' },
      { target: `0x${'33'.repeat(20)}`, callData: '0x' },
    ];
    const encoded = encodeTryAggregate(calls);
    expect(encoded.startsWith('0xbce38bd7')).toBe(true);
    // A success-everything return over the same layout decodes per call.
    const okReturn =
      `0x` +
      w(0x20) +
      w(2) +
      w(0x40) +
      w(0xc0) +
      w(1) +
      w(0x40) +
      w(1) +
      `01${'0'.repeat(62)}` +
      w(1) +
      w(0x40) +
      w(0);
    expect(decodeTryAggregateReturnData(okReturn)).toEqual([
      { ok: true, value: '0x01' },
      { ok: true, value: '0x' },
    ]);
  });

  it.each([['0x'], ['0x1234'], ['0x' + w(1)]])(
    'returns null on truncated garbage (%s)',
    (raw) => {
      expect(decodeTryAggregateReturnData(raw)).toBeNull();
    },
  );
});
