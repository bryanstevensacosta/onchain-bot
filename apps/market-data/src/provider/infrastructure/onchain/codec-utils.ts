import { bytesToAddress } from 'provider/launchpad/infrastructure/solana-pda';

/**
 * Null-safe binary readers for the Lane S on-chain decoders
 * (dexter plan todo 22). Buffer/DataView only — zero new deps.
 *
 * Every reader returns `null` past the end of the buffer instead of
 * throwing, so decoders degrade to `null` (fallback) rather than
 * crashing the snapshot path. Public decoders add a final
 * try/catch belt-and-suspenders for the same reason.
 */

export function base64ToBytes(data: string): Uint8Array | null {
  try {
    if (typeof data !== 'string' || data.length === 0) return null;
    return Uint8Array.from(Buffer.from(data, 'base64'));
  } catch {
    return null;
  }
}

/** 32-byte pubkey at `at` as base58, or `null` (bounds + decode). */
export function readAddress(bytes: Uint8Array, at: number): string | null {
  if (at < 0 || at + 32 > bytes.length) return null;
  try {
    return bytesToAddress(bytes.subarray(at, at + 32));
  } catch {
    return null;
  }
}

/** True when the 32 bytes at `at` are all zero (uninitialized slot). */
export function isZeroAddress(bytes: Uint8Array, at: number): boolean {
  if (at < 0 || at + 32 > bytes.length) return true;
  for (let i = at; i < at + 32; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

function readUnsigned(
  bytes: Uint8Array,
  at: number,
  size: 1 | 2 | 4 | 8 | 16,
): bigint | null {
  if (at < 0 || at + size > bytes.length) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, size);
    switch (size) {
      case 1:
        return BigInt(view.getUint8(0));
      case 2:
        return BigInt(view.getUint16(0, true));
      case 4:
        return BigInt(view.getUint32(0, true));
      case 8:
        return view.getBigUint64(0, true);
      case 16: {
        const lo = view.getBigUint64(0, true);
        const hi = view.getBigUint64(8, true);
        return (hi << 64n) | lo;
      }
    }
  } catch {
    return null;
  }
}

export function readU8(bytes: Uint8Array, at: number): bigint | null {
  return readUnsigned(bytes, at, 1);
}

export function readU16(bytes: Uint8Array, at: number): bigint | null {
  return readUnsigned(bytes, at, 2);
}

export function readU32(bytes: Uint8Array, at: number): bigint | null {
  return readUnsigned(bytes, at, 4);
}

export function readU64(bytes: Uint8Array, at: number): bigint | null {
  return readUnsigned(bytes, at, 8);
}

export function readU128(bytes: Uint8Array, at: number): bigint | null {
  return readUnsigned(bytes, at, 16);
}

export function readI32(bytes: Uint8Array, at: number): bigint | null {
  if (at < 0 || at + 4 > bytes.length) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, 4);
    return BigInt(view.getInt32(0, true));
  } catch {
    return null;
  }
}

const asNumber = (value: bigint): number | null => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
};

export function readU8Number(bytes: Uint8Array, at: number): number | null {
  const raw = readU8(bytes, at);
  return raw === null ? null : asNumber(raw);
}

export function readU16Number(bytes: Uint8Array, at: number): number | null {
  const raw = readU16(bytes, at);
  return raw === null ? null : asNumber(raw);
}
