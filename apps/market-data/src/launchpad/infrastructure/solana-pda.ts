import { createHash } from 'node:crypto';

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const ED25519_P = 2n ** 255n - 19n;
const ED25519_D =
  3709570593466944313808350875456518954211387984321901638878553308594028357065n;
const ED25519_SQRT_M1 =
  196811613767075059568070793049885420154460665159018070209982863036521263069n;

function base58ToBytes(value: string): Uint8Array {
  let num = 0n;
  for (const ch of value) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`Invalid base58 character: ${ch}`);
    num = num * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  for (const ch of value) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes.length === 0 ? [0] : bytes);
}

function bytesToBase58(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) + BigInt(b);
  let out = '';
  while (num > 0n) {
    out = BASE58_ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out === '' ? '1' : out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function isOnEd25519Curve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(bytes[i]);
  const y0 = y & ((1n << 255n) - 1n);
  const y2 = (y0 * y0) % ED25519_P;
  const num = (y2 - 1n + ED25519_P) % ED25519_P;
  const den = (ED25519_D * y2 + 1n) % ED25519_P;
  if (den === 0n) return false;
  const x2 = (num * modPow(den, ED25519_P - 2n, ED25519_P)) % ED25519_P;
  let x = modPow(x2, (ED25519_P + 3n) / 8n, ED25519_P);
  if ((x * x) % ED25519_P !== x2) x = (x * ED25519_SQRT_M1) % ED25519_P;
  return (x * x) % ED25519_P === x2;
}

export interface ProgramAddress {
  readonly address: string;
  readonly nonce: number;
}

/**
 * `findProgramAddress` without `@solana/web3.js` (zero new deps).
 *
 * sha256 over `node:crypto`, base58 coded by hand, off-curve check via
 * BigInt ed25519 arithmetic (RFC 8032). Throws on invalid input or
 * when no off-curve address exists (practically unreachable).
 */
export function findProgramAddress(
  seeds: ReadonlyArray<Uint8Array>,
  programId: string,
): ProgramAddress {
  const programBytes = base58ToBytes(programId);
  if (programBytes.length !== 32) {
    throw new Error('Program ID must decode to 32 bytes');
  }
  for (const seed of seeds) {
    if (seed.length > 32) throw new Error('Seed longer than 32 bytes');
  }
  for (let nonce = 255; nonce >= 0; nonce--) {
    const hash = createHash('sha256');
    for (const seed of seeds) hash.update(seed);
    hash.update(Uint8Array.from([nonce]));
    hash.update(programBytes);
    hash.update('ProgramDerivedAddress');
    const candidate = Uint8Array.from(hash.digest());
    if (!isOnEd25519Curve(candidate)) {
      return { address: bytesToBase58(candidate), nonce };
    }
  }
  throw new Error('No off-curve program address found');
}

export function utf8Seed(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'utf8'));
}

export function addressToBytes(address: string): Uint8Array {
  const bytes = base58ToBytes(address);
  if (bytes.length !== 32) throw new Error('Address must decode to 32 bytes');
  return bytes;
}

export function bytesToAddress(bytes: Uint8Array): string {
  return bytesToBase58(bytes);
}
