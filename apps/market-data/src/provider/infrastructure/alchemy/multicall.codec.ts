/**
 * Minimal ABI codec for Multicall3 `tryAggregate` (Lane T, todo 22).
 *
 * Only this ONE function shape is supported — no generic ABI layer:
 * `tryAggregate(bool requireSuccess, Call[] calls)` where
 * `Call = (address target, bytes callData)`, returning
 * `(bool success, bytes returnData)[]`.
 *
 * Selector `bce38bd7` = first 4 bytes of
 * `keccak256("tryAggregate(bool,(address,bytes)[])")` (canonical
 * Multicall3 ABI; cross-check against the Multicall3 source linked in
 * the service file). `requireSuccess` is always encoded `false` —
 * tryAggregate semantics: one revert NEVER fails the batch.
 */

export const TRY_AGGREGATE_SELECTOR = 'bce38bd7';

function toWord(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function strip0x(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function padBytes(hex: string): string {
  const raw = strip0x(hex);
  const pad = (32 - ((raw.length / 2) % 32)) % 32;
  return raw + '00'.repeat(pad);
}

function encodeAddress(address: string): string {
  return strip0x(address).toLowerCase().padStart(64, '0');
}

export function encodeTryAggregate(
  calls: ReadonlyArray<{ readonly target: string; readonly callData: string }>,
): string {
  const head: string[] = [
    toWord(0n),
    toWord(64n),
    toWord(BigInt(calls.length)),
  ];
  const offsets: string[] = [];
  const bodies: string[] = [];
  // Element data starts after the offset table (N words past content start).
  let cursor = calls.length * 32;
  for (const call of calls) {
    offsets.push(toWord(BigInt(cursor)));
    const dataLen = strip0x(call.callData).length / 2;
    const body =
      encodeAddress(call.target) +
      toWord(64n) +
      toWord(BigInt(dataLen)) +
      padBytes(call.callData);
    bodies.push(body);
    cursor += body.length / 2;
  }
  return `0x${TRY_AGGREGATE_SELECTOR}${head.join('')}${offsets.join('')}${bodies.join('')}`;
}

export interface DecodedMulticallResult {
  readonly ok: boolean;
  readonly value: string | null;
}

function readWord(bytes: Buffer, at: number): bigint | null {
  if (at < 0 || at + 32 > bytes.length) return null;
  return BigInt(`0x${bytes.subarray(at, at + 32).toString('hex')}`);
}

export function decodeTryAggregateReturnData(
  data: string,
): ReadonlyArray<DecodedMulticallResult> | null {
  const bytes = Buffer.from(strip0x(data), 'hex');
  if (bytes.length < 64) return null;
  const arrayOffset = readWord(bytes, 0);
  if (arrayOffset === null) return null;
  const contentStart = Number(arrayOffset) + 0;
  const length = readWord(bytes, contentStart);
  if (length === null || length > 10_000n) return null;
  const count = Number(length);
  const offsetsStart = contentStart + 32;
  const out: DecodedMulticallResult[] = [];
  for (let i = 0; i < count; i++) {
    const elemOffset = readWord(bytes, offsetsStart + i * 32);
    if (elemOffset === null) return null;
    const elemStart = offsetsStart + Number(elemOffset);
    const success = readWord(bytes, elemStart);
    const dataOffset = readWord(bytes, elemStart + 32);
    if (success === null || dataOffset === null) return null;
    if (success !== 0n && success !== 1n) return null;
    const dataStart = elemStart + Number(dataOffset);
    const dataLen = readWord(bytes, dataStart);
    if (dataLen === null) return null;
    const len = Number(dataLen);
    if (dataStart + 32 + len > bytes.length) return null;
    const raw = bytes.subarray(dataStart + 32, dataStart + 32 + len);
    out.push({
      ok: success === 1n,
      value: success === 1n ? `0x${raw.toString('hex')}` : null,
    });
  }
  return out;
}
