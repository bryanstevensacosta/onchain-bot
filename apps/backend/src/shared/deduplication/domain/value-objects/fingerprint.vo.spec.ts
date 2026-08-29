import { Fingerprint } from './fingerprint.vo';

describe('Fingerprint', () => {
  describe('exact', () => {
    it('should create exact fingerprint', () => {
      const fp = Fingerprint.exact('channel123', 456);
      expect(fp.type).toBe('exact');
      expect(fp.value).toBe('channel123:456');
    });
  });

  describe('content', () => {
    it('should create content fingerprint', () => {
      const hash = 'abc123def456';
      const fp = Fingerprint.content(hash);
      expect(fp.type).toBe('content');
      expect(fp.value).toBe(hash);
    });
  });

  describe('url', () => {
    it('should create url fingerprint', () => {
      const url = 'https://example.com';
      const fp = Fingerprint.url(url);
      expect(fp.type).toBe('url');
      expect(fp.value).toBe(url);
    });
  });

  describe('semantic', () => {
    it('should create semantic fingerprint', () => {
      const fp = Fingerprint.semantic('channel123', 456);
      expect(fp.type).toBe('semantic');
      expect(fp.value).toBe('channel123:456');
    });
  });

  describe('toString', () => {
    it('should return type:value format', () => {
      const fp = Fingerprint.exact('channel123', 456);
      expect(fp.toString()).toBe('exact:channel123:456');
    });

    it('should work for content fingerprint', () => {
      const fp = Fingerprint.content('hash123');
      expect(fp.toString()).toBe('content:hash123');
    });
  });

  describe('equals', () => {
    it('should be equal for same type and value', () => {
      const fp1 = Fingerprint.exact('channel', 123);
      const fp2 = Fingerprint.exact('channel', 123);
      expect(fp1.equals(fp2)).toBe(true);
    });

    it('should not be equal for different values', () => {
      const fp1 = Fingerprint.exact('channel', 123);
      const fp2 = Fingerprint.exact('channel', 456);
      expect(fp1.equals(fp2)).toBe(false);
    });

    it('should not be equal for different types', () => {
      const fp1 = Fingerprint.exact('channel', 123);
      const fp2 = Fingerprint.semantic('channel', 123);
      expect(fp1.equals(fp2)).toBe(false);
    });

    it('should not be equal to null', () => {
      const fp = Fingerprint.exact('channel', 123);
      expect(fp.equals(null)).toBe(false);
    });
  });

  describe('immutability', () => {
    it('should not expose setters', () => {
      const fp = Fingerprint.exact('channel', 123);
      // @ts-expect-error - value is readonly
      expect(() => {
        fp.value = 'newvalue';
      }).toThrow();
    });

    it('should return shallow copy from toObject', () => {
      const fp = Fingerprint.exact('channel', 123);
      const obj = fp.toObject();
      expect(obj).toEqual({ type: 'exact', value: 'channel:123' });
      expect(obj).not.toBe(fp.toObject());
    });
  });
});
