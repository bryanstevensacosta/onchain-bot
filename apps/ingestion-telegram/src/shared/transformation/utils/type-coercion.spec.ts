import {
  safeToString,
  coerceToString,
  coerceToLong,
  fileReferenceToBuffer,
} from './type-coercion';

describe('type-coercion utils', () => {
  describe('safeToString()', () => {
    it('should return empty string for null/undefined', () => {
      expect(safeToString(null)).toBe('');
      expect(safeToString(undefined)).toBe('');
    });

    it('should return string unchanged', () => {
      expect(safeToString('test')).toBe('test');
    });

    it('should convert number to string', () => {
      expect(safeToString(123)).toBe('123');
      expect(safeToString(0)).toBe('0');
      expect(safeToString(-456)).toBe('-456');
    });

    it('should convert bigint to string', () => {
      expect(safeToString(BigInt(123))).toBe('123');
      expect(safeToString(BigInt('9007199254740991'))).toBe('9007199254740991');
    });

    it('should convert boolean to string', () => {
      expect(safeToString(true)).toBe('true');
      expect(safeToString(false)).toBe('false');
    });

    it('should convert symbol to string', () => {
      const sym = Symbol('test');
      expect(safeToString(sym)).toContain('Symbol(test)');
    });

    it('should call toString() on objects', () => {
      const obj = { toString: () => 'custom' };
      expect(safeToString(obj)).toBe('custom');
    });
  });

  describe('coerceToString()', () => {
    it('should return empty string for null/undefined', () => {
      expect(coerceToString(null)).toBe('');
      expect(coerceToString(undefined)).toBe('');
    });

    it('should return bigint unchanged', () => {
      const big = BigInt(123);
      expect(coerceToString(big)).toBe(big);
    });

    it('should return string unchanged', () => {
      expect(coerceToString('test')).toBe('test');
    });

    it('should convert number to string', () => {
      expect(coerceToString(123)).toBe('123');
    });

    it('should convert boolean to string', () => {
      expect(coerceToString(true)).toBe('true');
      expect(coerceToString(false)).toBe('false');
    });
  });

  describe('coerceToLong()', () => {
    it('should convert bigint to BigInteger', () => {
      const result = coerceToLong(BigInt(123));
      expect(result.toString()).toBe('123');
    });

    it('should convert string to BigInteger', () => {
      const result = coerceToLong('456');
      expect(result.toString()).toBe('456');
    });

    it('should handle large numbers', () => {
      const large = '9007199254740991';
      const result = coerceToLong(large);
      expect(result.toString()).toBe(large);
    });
  });

  describe('fileReferenceToBuffer()', () => {
    it('should return Buffer unchanged', () => {
      const buf = Buffer.from('test');
      expect(fileReferenceToBuffer(buf)).toBe(buf);
    });

    it('should convert string to Buffer (binary)', () => {
      const result = fileReferenceToBuffer('test');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result?.toString('binary')).toBe('test');
    });

    it('should convert array to Buffer', () => {
      const result = fileReferenceToBuffer([116, 101, 115, 116]);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result?.toString()).toBe('test');
    });

    it('should return null for invalid input', () => {
      expect(fileReferenceToBuffer(123)).toBeNull();
      expect(fileReferenceToBuffer(null)).toBeNull();
      expect(fileReferenceToBuffer(undefined)).toBeNull();
      expect(fileReferenceToBuffer({})).toBeNull();
    });
  });
});
