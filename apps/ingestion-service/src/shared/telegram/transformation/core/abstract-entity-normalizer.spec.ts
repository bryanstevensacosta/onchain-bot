import {
  AbstractEntityNormalizer,
  type NormalizedEntity,
} from './abstract-entity-normalizer';

/**
 * Concrete implementation for testing
 */
class TestEntityNormalizer extends AbstractEntityNormalizer {
  normalize(entities: unknown[]): NormalizedEntity[] {
    if (!Array.isArray(entities)) return [];

    return entities.map((e: any) => ({
      offset: e.offset,
      length: e.length,
      type: this.normalizeType(e.className),
      ...(e.url ? { url: e.url } : {}),
    }));
  }

  // Expose protected method for testing
  public testNormalizeType(className?: string): string {
    return this.normalizeType(className);
  }
}

describe('AbstractEntityNormalizer', () => {
  let normalizer: TestEntityNormalizer;

  beforeEach(() => {
    normalizer = new TestEntityNormalizer();
  });

  describe('normalizeType()', () => {
    it('should map MessageEntityUrl to url', () => {
      expect(normalizer.testNormalizeType('MessageEntityUrl')).toBe('url');
    });

    it('should map MessageEntityTextUrl to text_url', () => {
      expect(normalizer.testNormalizeType('MessageEntityTextUrl')).toBe('text_url');
    });

    it('should map MessageEntityBold to bold', () => {
      expect(normalizer.testNormalizeType('MessageEntityBold')).toBe('bold');
    });

    it('should map MessageEntityItalic to italic', () => {
      expect(normalizer.testNormalizeType('MessageEntityItalic')).toBe('italic');
    });

    it('should map MessageEntityCode to code', () => {
      expect(normalizer.testNormalizeType('MessageEntityCode')).toBe('code');
    });

    it('should map MessageEntityPre to pre', () => {
      expect(normalizer.testNormalizeType('MessageEntityPre')).toBe('pre');
    });

    it('should map MessageEntityMention to mention', () => {
      expect(normalizer.testNormalizeType('MessageEntityMention')).toBe('mention');
    });

    it('should map MessageEntityHashtag to hashtag', () => {
      expect(normalizer.testNormalizeType('MessageEntityHashtag')).toBe('hashtag');
    });

    it('should map MessageEntityCashtag to cashtag', () => {
      expect(normalizer.testNormalizeType('MessageEntityCashtag')).toBe('cashtag');
    });

    it('should return "unknown" for unrecognized className', () => {
      expect(normalizer.testNormalizeType('UnknownEntity')).toBe('unknown');
    });

    it('should return "unknown" for null className', () => {
      expect(normalizer.testNormalizeType(null as any)).toBe('unknown');
    });

    it('should return "unknown" for undefined className', () => {
      expect(normalizer.testNormalizeType(undefined)).toBe('unknown');
    });

    it('should return "unknown" for empty string', () => {
      expect(normalizer.testNormalizeType('')).toBe('unknown');
    });
  });

  describe('normalize()', () => {
    it('should normalize array of entities', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityUrl', url: 'https://example.com' },
        { offset: 11, length: 5, className: 'MessageEntityBold' },
      ];

      const result = normalizer.normalize(entities);

      expect(result).toEqual([
        { offset: 0, length: 10, type: 'url', url: 'https://example.com' },
        { offset: 11, length: 5, type: 'bold' },
      ]);
    });

    it('should handle empty array', () => {
      expect(normalizer.normalize([])).toEqual([]);
    });

    it('should return empty array for non-array input', () => {
      expect(normalizer.normalize(null as any)).toEqual([]);
      expect(normalizer.normalize(undefined as any)).toEqual([]);
      expect(normalizer.normalize('not an array' as any)).toEqual([]);
    });

    it('should preserve offset and length', () => {
      const entities = [
        { offset: 123, length: 456, className: 'MessageEntityUrl' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].offset).toBe(123);
      expect(result[0].length).toBe(456);
    });

    it('should only include url field when present', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityUrl', url: 'https://example.com' },
        { offset: 11, length: 5, className: 'MessageEntityBold' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].url).toBe('https://example.com');
      expect(result[1].url).toBeUndefined();
    });

    it('should handle entities without className', () => {
      const entities = [
        { offset: 0, length: 10 },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('unknown');
    });
  });
});
