import {
  AbstractMediaExtractor,
  type MediaSlot,
  type RawMediaObject,
} from './abstract-media-extractor';
import type { TelegramMediaAttachment } from 'telegram/shared/ports/telegram-listener.port';

/**
 * Concrete implementation for testing
 */
class TestMediaExtractor extends AbstractMediaExtractor {
  protected readonly slots: MediaSlot[] = [
    { field: 'video', type: 'video' },
    {
      field: 'document',
      type: 'video',
      validate: (raw) =>
        ((raw.mimeType as string) ?? '').toLowerCase().startsWith('video/'),
    },
    { field: 'photo', type: 'photo' },
  ];

  extract(media: unknown): TelegramMediaAttachment | null {
    for (const slot of this.slots) {
      const result = this.trySlot(media, slot);
      if (result) return result;
    }
    return this.extractWebpagePreview(media);
  }

  // Expose protected methods for testing
  public testTrySlot(media: unknown, slot: MediaSlot) {
    return this.trySlot(media, slot);
  }

  public testBuildAttachment(raw: RawMediaObject, type: 'photo' | 'video') {
    return this.buildAttachment(raw, type);
  }

  public testExtractWebpagePreview(media: unknown) {
    return this.extractWebpagePreview(media);
  }

  public testIsValidMediaId(v: unknown) {
    return this.isValidMediaId(v);
  }

  public testFileReferenceToBuffer(v: unknown) {
    return this.fileReferenceToBuffer(v);
  }

  public testCoerceToString(v: unknown) {
    return this.coerceToString(v);
  }
}

describe('AbstractMediaExtractor', () => {
  let extractor: TestMediaExtractor;

  beforeEach(() => {
    extractor = new TestMediaExtractor();
  });

  describe('isValidMediaId()', () => {
    it('should return true for bigint', () => {
      expect(extractor.testIsValidMediaId(BigInt(123))).toBe(true);
    });

    it('should return true for string', () => {
      expect(extractor.testIsValidMediaId('123')).toBe(true);
    });

    it('should return true for number', () => {
      expect(extractor.testIsValidMediaId(123)).toBe(true);
    });

    it('should return true for object', () => {
      expect(extractor.testIsValidMediaId({ id: 123 })).toBe(true);
    });

    it('should return false for null', () => {
      expect(extractor.testIsValidMediaId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(extractor.testIsValidMediaId(undefined)).toBe(false);
    });
  });

  describe('fileReferenceToBuffer()', () => {
    it('should return Buffer unchanged', () => {
      const buf = Buffer.from('test');
      expect(extractor.testFileReferenceToBuffer(buf)).toBe(buf);
    });

    it('should convert string to Buffer (binary)', () => {
      const result = extractor.testFileReferenceToBuffer('test');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result?.toString('binary')).toBe('test');
    });

    it('should convert array to Buffer', () => {
      const result = extractor.testFileReferenceToBuffer([116, 101, 115, 116]);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result?.toString()).toBe('test');
    });

    it('should return null for invalid input', () => {
      expect(extractor.testFileReferenceToBuffer(123)).toBeNull();
      expect(extractor.testFileReferenceToBuffer(null)).toBeNull();
      expect(extractor.testFileReferenceToBuffer(undefined)).toBeNull();
    });
  });

  describe('coerceToString()', () => {
    it('should return bigint unchanged', () => {
      const big = BigInt(123);
      expect(extractor.testCoerceToString(big)).toBe(big);
    });

    it('should return string unchanged', () => {
      expect(extractor.testCoerceToString('test')).toBe('test');
    });

    it('should convert number to string', () => {
      expect(extractor.testCoerceToString(123)).toBe('123');
    });

    it('should convert boolean to string', () => {
      expect(extractor.testCoerceToString(true)).toBe('true');
      expect(extractor.testCoerceToString(false)).toBe('false');
    });

    it('should return empty string for null/undefined', () => {
      expect(extractor.testCoerceToString(null)).toBe('');
      expect(extractor.testCoerceToString(undefined)).toBe('');
    });
  });

  describe('buildAttachment()', () => {
    it('should build valid attachment from raw media', () => {
      const raw: RawMediaObject = {
        id: BigInt(123),
        accessHash: BigInt(456),
        fileReference: Buffer.from('ref123'),
        mimeType: 'image/jpeg',
        dcId: 2,
        date: 1234567890,
      };

      const result = extractor.testBuildAttachment(raw, 'photo');

      expect(result).toEqual({
        type: 'photo',
        fileId: BigInt(123),
        accessHash: BigInt(456),
        fileReference: Buffer.from('ref123').toString('base64'),
        mimeType: 'image/jpeg',
        dcId: 2,
        date: 1234567890,
      });
    });

    it('should return null when id is invalid', () => {
      const raw: RawMediaObject = {
        id: null,
        accessHash: BigInt(456),
        fileReference: Buffer.from('ref'),
      };

      expect(extractor.testBuildAttachment(raw, 'photo')).toBeNull();
    });

    it('should return null when fileReference is invalid', () => {
      const raw: RawMediaObject = {
        id: BigInt(123),
        accessHash: BigInt(456),
        fileReference: null,
      };

      expect(extractor.testBuildAttachment(raw, 'photo')).toBeNull();
    });
  });

  describe('trySlot()', () => {
    it('should extract from matching slot', () => {
      const media = {
        photo: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'image/jpeg',
        },
      };

      const slot: MediaSlot = { field: 'photo', type: 'photo' };
      const result = extractor.testTrySlot(media, slot);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('photo');
    });

    it('should return null when field missing', () => {
      const media = { video: {} };
      const slot: MediaSlot = { field: 'photo', type: 'photo' };

      expect(extractor.testTrySlot(media, slot)).toBeNull();
    });

    it('should respect validate function', () => {
      const media = {
        document: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'application/pdf', // Not a video
        },
      };

      const slot: MediaSlot = {
        field: 'document',
        type: 'video',
        validate: (raw) => raw.mimeType?.toString().startsWith('video/') ?? false,
      };

      expect(extractor.testTrySlot(media, slot)).toBeNull();
    });

    it('should pass validation for video MIME type', () => {
      const media = {
        document: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'video/mp4',
        },
      };

      const slot: MediaSlot = {
        field: 'document',
        type: 'video',
        validate: (raw) => raw.mimeType?.toString().startsWith('video/') ?? false,
      };

      const result = extractor.testTrySlot(media, slot);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('video');
    });
  });

  describe('extractWebpagePreview()', () => {
    it('should extract photo from webpage preview', () => {
      const media = {
        webpage: {
          url: 'https://example.com',
          title: 'Example Page',
          description: 'Test description',
          siteName: 'Example Site',
          photo: {
            id: BigInt(123),
            accessHash: BigInt(456),
            fileReference: Buffer.from('ref'),
          },
        },
      };

      const result = extractor.testExtractWebpagePreview(media);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('photo');
      expect(result?.webpageUrl).toBe('https://example.com');
      expect(result?.webpageTitle).toBe('Example Page');
      expect(result?.webpageDescription).toBe('Test description');
      expect(result?.webpageSiteName).toBe('Example Site');
    });

    it('should return null when webpage missing', () => {
      const media = { other: 'field' };
      expect(extractor.testExtractWebpagePreview(media)).toBeNull();
    });

    it('should return null when webpage.photo missing', () => {
      const media = {
        webpage: {
          url: 'https://example.com',
          title: 'No photo',
        },
      };
      expect(extractor.testExtractWebpagePreview(media)).toBeNull();
    });
  });

  describe('extract() (with slots priority)', () => {
    it('should extract video before document', () => {
      const media = {
        video: {
          id: BigInt(111),
          accessHash: BigInt(222),
          fileReference: Buffer.from('video-ref'),
        },
        document: {
          id: BigInt(333),
          accessHash: BigInt(444),
          fileReference: Buffer.from('doc-ref'),
          mimeType: 'video/mp4',
        },
      };

      const result = extractor.extract(media);
      expect(result?.fileId).toBe(BigInt(111)); // Video wins
    });

    it('should fall back to webpage preview when no slots match', () => {
      const media = {
        webpage: {
          photo: {
            id: BigInt(123),
            accessHash: BigInt(456),
            fileReference: Buffer.from('ref'),
          },
        },
      };

      const result = extractor.extract(media);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('photo');
    });
  });
});
