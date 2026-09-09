/**
 * Type coercion utilities for Telegram message transformation
 * 
 * Shared utilities for converting between GramJS types and standard JS types.
 * Handles bigint, Buffer, and string conversions safely.
 */

import bigInt from 'big-integer';

/**
 * Convert any value to string representation
 * 
 * Safe conversion that handles null/undefined, primitives, and objects.
 * 
 * @param v - Value to convert
 * @returns String representation
 */
export function safeToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'symbol') return v.toString();
  return (v as { toString(): string }).toString();
}

/**
 * Coerce value to string or bigint (for IDs and hashes)
 * 
 * Preserves bigint type, converts everything else to string.
 * Used for Telegram file IDs and access hashes.
 * 
 * @param v - Value to coerce
 * @returns bigint (unchanged) or string
 */
export function coerceToString(v: unknown): bigint | string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return v;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'symbol') return v.toString();
  return (v as { toString(): string }).toString();
}

/**
 * Convert bigint or string to big-integer library format
 * 
 * Used for compatibility with legacy code using the 'big-integer' library.
 * 
 * @param value - bigint or string to convert
 * @returns BigInteger instance
 */
export function coerceToLong(value: bigint | string): bigInt.BigInteger {
  if (typeof value === 'bigint') return bigInt(value.toString());
  return bigInt(String(value));
}

/**
 * Convert file reference to Buffer
 * 
 * Telegram file references can come as Buffer, string (binary), or array.
 * This normalizes all formats to Buffer.
 * 
 * @param v - File reference value
 * @returns Buffer or null if conversion failed
 */
export function fileReferenceToBuffer(v: unknown): Buffer | null {
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'string') return Buffer.from(v, 'binary');
  if (Array.isArray(v)) return Buffer.from(v);
  return null;
}
