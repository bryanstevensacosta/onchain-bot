import {
  AbstractMessageTransformer,
  type RawTelegramMessage,
  type TransformedMessage,
} from './abstract-message-transformer';
import { AbstractTextExtractor } from './abstract-text-extractor';
import { AbstractMediaExtractor } from './abstract-media-extractor';
import { AbstractEntityNormalizer, type NormalizedEntity } from './abstract-entity-normalizer';

/**
 * Mock extractors for testing
 */
class MockTextExtractor extends AbstractTextExtractor {
  extract(raw: any): string {
    return raw.message ?? raw.text ?? '';
  }
}

class MockMediaExtractor extends AbstractMediaExtractor {
  protected readonly slots = [{ field: 'photo' as const, type: 'photo' as const }];

  extract(media: unknown): any {
    if (!media || typeof media !== 'object') return null;
    const obj = media as any;
    if (obj.photo) {
      return {
        type: 'photo',
        fileId: obj.photo.id ?? 'test-id',
        accessHash: obj.photo.accessHash ?? 'test-hash',
        fileReference: 'test-ref',
        mimeType: 'image/jpeg',
      };
    }
    return null;
  }
}

class MockEntityNormalizer extends AbstractEntityNormalizer {
  normalize(entities: unknown[]): NormalizedEntity[] {
    if (!Array.isArray(entities)) return [];
    return entities.map((e: any) => ({
      offset: e.offset,
      length: e.length,
      type: e.type ?? 'unknown',
    }));
  }
}

/**
 * Concrete transformer for testing
 */
class TestMessageTransformer extends AbstractMessageTransformer {
  // Expose protected methods for testing
  public testExtractText(raw: RawTelegramMessage) {
    return this.extractText(raw);
  }

  public testExtractMedia(raw: RawTelegramMessage) {
    return this.extractMedia(raw);
  }

  public testNormalizeEntities(raw: RawTelegramMessage) {
    return this.normalizeEntities(raw);
  }

  public testIsValidMessage(raw: RawTelegramMessage) {
    return this.isValidMessage(raw);
  }

  public testNormalizePeerId(peerId: unknown) {
    return this.normalizePeerId(peerId);
  }

  public testExtractDate(raw: RawTelegramMessage) {
    return this.extractDate(raw);
  }

  public testExtractGroupedId(raw: RawTelegramMessage) {
    return this.extractGroupedId(raw);
  }
}

describe('AbstractMessageTransformer', () => {
  let transformer: TestMessageTransformer;
  let textExtractor: MockTextExtractor;
  let mediaExtractor: MockMediaExtractor;
  let entityNormalizer: MockEntityNormalizer;

  beforeEach(() => {
    textExtractor = new MockTextExtractor();
    mediaExtractor = new MockMediaExtractor();
    entityNormalizer = new MockEntityNormalizer();
    transformer = new TestMessageTransformer(textExtractor, mediaExtractor, entityNormalizer);
  });

  describe('isValidMessage()', () => {
    it('should return true for valid message', () => {
      const raw: RawTelegramMessage = { id: 123, peerId: '-100456' };
      expect(transformer.testIsValidMessage(raw)).toBe(true);
    });

    it('should return false when id missing', () => {
      const raw: RawTelegramMessage = { peerId: '-100456' };
      expect(transformer.testIsValidMessage(raw)).toBe(false);
    });

    it('should return false when peerId missing', () => {
      const raw: RawTelegramMessage = { id: 123 };
      expect(transformer.testIsValidMessage(raw)).toBe(false);
    });
  });

  describe('normalizePeerId()', () => {
    it('should convert bigint to string', () => {
      expect(transformer.testNormalizePeerId(BigInt(123))).toBe('123');
    });

    it('should return string unchanged', () => {
      expect(transformer.testNormalizePeerId('-100456')).toBe('-100456');
    });

    it('should convert number to string', () => {
      expect(transformer.testNormalizePeerId(123)).toBe('123');
    });

    it('should return empty string for null/undefined', () => {
      expect(transformer.testNormalizePeerId(null)).toBe('');
      expect(transformer.testNormalizePeerId(undefined)).toBe('');
    });

    it('should call toString() on objects', () => {
      const obj = { toString: () => 'custom-id' };
      expect(transformer.testNormalizePeerId(obj)).toBe('custom-id');
    });
  });

  describe('extractDate()', () => {
    it('should convert Unix timestamp to Date', () => {
      const raw: RawTelegramMessage = { date: 1609459200 }; // 2021-01-01 00:00:00 UTC
      const result = transformer.testExtractDate(raw);
      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCFullYear()).toBe(2021);
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCDate()).toBe(1);
    });

    it('should fallback to current date when date missing', () => {
      const raw: RawTelegramMessage = {};
      const before = Date.now();
      const result = transformer.testExtractDate(raw);
      const after = Date.now();
      
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('extractGroupedId()', () => {
    it('should return bigint unchanged', () => {
      const raw: RawTelegramMessage = { groupedId: BigInt(123) };
      expect(transformer.testExtractGroupedId(raw)).toBe(BigInt(123));
    });

    it('should return string unchanged', () => {
      const raw: RawTelegramMessage = { groupedId: 'group-123' };
      expect(transformer.testExtractGroupedId(raw)).toBe('group-123');
    });

    it('should convert number to string', () => {
      const raw: RawTelegramMessage = { groupedId: 123 };
      expect(transformer.testExtractGroupedId(raw)).toBe('123');
    });

    it('should return null for null/undefined', () => {
      expect(transformer.testExtractGroupedId({ groupedId: null })).toBeNull();
      expect(transformer.testExtractGroupedId({})).toBeNull();
    });
  });

  describe('extractText()', () => {
    it('should delegate to text extractor', () => {
      const spy = jest.spyOn(textExtractor, 'extract');
      const raw: RawTelegramMessage = { message: 'Hello' };
      
      const result = transformer.testExtractText(raw);
      
      expect(spy).toHaveBeenCalledWith(raw);
      expect(result).toBe('Hello');
    });
  });

  describe('extractMedia()', () => {
    it('should delegate to media extractor', () => {
      const spy = jest.spyOn(mediaExtractor, 'extract');
      const raw: RawTelegramMessage = {
        media: { photo: { id: 'test', accessHash: 'hash' } },
      };
      
      const result = transformer.testExtractMedia(raw);
      
      expect(spy).toHaveBeenCalledWith(raw.media);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('photo');
    });

    it('should return empty array when no media', () => {
      const raw: RawTelegramMessage = { media: null };
      expect(transformer.testExtractMedia(raw)).toEqual([]);
    });
  });

  describe('normalizeEntities()', () => {
    it('should delegate to entity normalizer', () => {
      const spy = jest.spyOn(entityNormalizer, 'normalize');
      const raw: RawTelegramMessage = {
        entities: [{ offset: 0, length: 10, type: 'url' }],
      };
      
      const result = transformer.testNormalizeEntities(raw);
      
      expect(spy).toHaveBeenCalledWith(raw.entities);
      expect(result).toEqual([{ offset: 0, length: 10, type: 'url' }]);
    });

    it('should return empty array when entities not array', () => {
      const raw: RawTelegramMessage = { entities: null as any };
      expect(transformer.testNormalizeEntities(raw)).toEqual([]);
    });
  });

  describe('transform() (template method)', () => {
    it('should transform complete message', () => {
      const raw: RawTelegramMessage = {
        id: 123,
        peerId: '-100456',
        message: 'Hello World',
        media: { photo: { id: 'photo-id', accessHash: 'hash' } },
        entities: [{ offset: 0, length: 5, type: 'bold' }],
        groupedId: BigInt(789),
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(123);
      expect(result!.peerId).toBe('-100456');
      expect(result!.text).toBe('Hello World');
      expect(result!.media).toHaveLength(1);
      expect(result!.media[0].type).toBe('photo');
      expect(result!.entities).toHaveLength(1);
      expect(result!.entities[0].type).toBe('bold');
      expect(result!.groupedId).toBe(BigInt(789));
      expect(result!.occurredAt).toBeInstanceOf(Date);
    });

    it('should return null for invalid message', () => {
      const raw: RawTelegramMessage = { id: 123 }; // Missing peerId
      expect(transformer.transform(raw)).toBeNull();
    });

    it('should handle message with no media', () => {
      const raw: RawTelegramMessage = {
        id: 123,
        peerId: '-100456',
        message: 'Text only',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result).not.toBeNull();
      expect(result!.text).toBe('Text only');
      expect(result!.media).toEqual([]);
      expect(result!.entities).toEqual([]);
      expect(result!.groupedId).toBeNull();
    });

    it('should handle message with no entities', () => {
      const raw: RawTelegramMessage = {
        id: 123,
        peerId: '-100456',
        message: 'Plain text',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.entities).toEqual([]);
    });

    it('should handle message with no groupedId', () => {
      const raw: RawTelegramMessage = {
        id: 123,
        peerId: '-100456',
        message: 'Single message',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.groupedId).toBeNull();
    });
  });
});
