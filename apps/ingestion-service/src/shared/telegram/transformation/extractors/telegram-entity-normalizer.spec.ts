import { TelegramEntityNormalizer } from './telegram-entity-normalizer';

describe('TelegramEntityNormalizer', () => {
  let normalizer: TelegramEntityNormalizer;

  beforeEach(() => {
    normalizer = new TelegramEntityNormalizer();
  });

  describe('className normalization', () => {
    it('should normalize MessageEntityUrl to url', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityUrl' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('url');
    });

    it('should normalize MessageEntityTextUrl to text_url', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityTextUrl', url: 'https://example.com' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('text_url');
      expect(result[0].url).toBe('https://example.com');
    });

    it('should normalize MessageEntityMention to mention', () => {
      const entities = [
        { offset: 0, length: 5, className: 'MessageEntityMention' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('mention');
    });

    it('should normalize MessageEntityHashtag to hashtag', () => {
      const entities = [
        { offset: 0, length: 8, className: 'MessageEntityHashtag' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('hashtag');
    });

    it('should normalize formatting entities', () => {
      const entities = [
        { offset: 0, length: 4, className: 'MessageEntityBold' },
        { offset: 5, length: 6, className: 'MessageEntityItalic' },
        { offset: 12, length: 4, className: 'MessageEntityCode' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('bold');
      expect(result[1].type).toBe('italic');
      expect(result[2].type).toBe('code');
    });

    it('should handle unknown className as "unknown"', () => {
      const entities = [
        { offset: 0, length: 10, className: 'CustomEntityType' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('unknown');
    });
  });

  describe('entity structure preservation', () => {
    it('should preserve offset and length', () => {
      const entities = [
        { offset: 123, length: 456, className: 'MessageEntityUrl' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].offset).toBe(123);
      expect(result[0].length).toBe(456);
    });

    it('should include url field when present', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityTextUrl', url: 'https://example.com' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].url).toBe('https://example.com');
    });

    it('should NOT include url field when absent', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityBold' },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].url).toBeUndefined();
    });
  });

  describe('multiple entities', () => {
    it('should normalize array of multiple entities', () => {
      const entities = [
        { offset: 0, length: 10, className: 'MessageEntityUrl' },
        { offset: 11, length: 5, className: 'MessageEntityBold' },
        { offset: 17, length: 8, className: 'MessageEntityHashtag' },
      ];

      const result = normalizer.normalize(entities);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('url');
      expect(result[1].type).toBe('bold');
      expect(result[2].type).toBe('hashtag');
    });

    it('should handle empty array', () => {
      expect(normalizer.normalize([])).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for non-array input', () => {
      expect(normalizer.normalize(null as any)).toEqual([]);
      expect(normalizer.normalize(undefined as any)).toEqual([]);
      expect(normalizer.normalize('not an array' as any)).toEqual([]);
    });

    it('should handle entities without className', () => {
      const entities = [
        { offset: 0, length: 10 },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('unknown');
    });

    it('should handle entities with null className', () => {
      const entities = [
        { offset: 0, length: 10, className: null },
      ];

      const result = normalizer.normalize(entities);

      expect(result[0].type).toBe('unknown');
    });
  });
});
