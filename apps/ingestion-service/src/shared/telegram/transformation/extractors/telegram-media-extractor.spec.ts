import { TelegramMediaExtractor } from './telegram-media-extractor';

describe('TelegramMediaExtractor', () => {
  let extractor: TelegramMediaExtractor;

  beforeEach(() => {
    extractor = new TelegramMediaExtractor();
  });

  describe('slot priority', () => {
    it('should extract video from video field (priority 1)', () => {
      const media = {
        video: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('video-ref'),
          mimeType: 'video/mp4',
        },
      };

      const result = extractor.extract(media);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('video');
      expect(result?.fileId).toBe(BigInt(123));
    });

    it('should extract video from document field with video MIME type (priority 2)', () => {
      const media = {
        document: {
          id: BigInt(789),
          accessHash: BigInt(101),
          fileReference: Buffer.from('doc-ref'),
          mimeType: 'video/mp4',
        },
      };

      const result = extractor.extract(media);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('video');
      expect(result?.fileId).toBe(BigInt(789));
      expect(result?.mimeType).toBe('video/mp4');
    });

    it('should extract photo from photo field (priority 3)', () => {
      const media = {
        photo: {
          id: BigInt(111),
          accessHash: BigInt(222),
          fileReference: Buffer.from('photo-ref'),
          mimeType: 'image/jpeg',
        },
      };

      const result = extractor.extract(media);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('photo');
      expect(result?.fileId).toBe(BigInt(111));
    });

    it('should NOT extract photo from webpage preview (external URL preview images)', () => {
      const media = {
        webpage: {
          url: 'https://example.com',
          title: 'Example Page',
          photo: {
            id: BigInt(333),
            accessHash: BigInt(444),
            fileReference: Buffer.from('preview-ref'),
          },
        },
      };

      const result = extractor.extract(media);

      // Webpage preview photos should NOT be extracted as they are:
      // 1. External URL preview images, not actual message attachments
      // 2. Would show as "broken image" icons in frontend
      // 3. Should not waste storage on external preview images
      expect(result).toBeNull();
    });
  });

  describe('slot priority order', () => {
    it('should prefer video over document when both present', () => {
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

    it('should prefer video over photo when both present', () => {
      const media = {
        video: {
          id: BigInt(111),
          accessHash: BigInt(222),
          fileReference: Buffer.from('video-ref'),
        },
        photo: {
          id: BigInt(333),
          accessHash: BigInt(444),
          fileReference: Buffer.from('photo-ref'),
        },
      };

      const result = extractor.extract(media);

      expect(result?.fileId).toBe(BigInt(111)); // Video wins
    });

    it('should prefer photo over webpage preview when both present', () => {
      const media = {
        photo: {
          id: BigInt(111),
          accessHash: BigInt(222),
          fileReference: Buffer.from('photo-ref'),
        },
        webpage: {
          photo: {
            id: BigInt(333),
            accessHash: BigInt(444),
            fileReference: Buffer.from('preview-ref'),
          },
        },
      };

      const result = extractor.extract(media);

      expect(result?.fileId).toBe(BigInt(111)); // Direct photo wins
    });
  });

  describe('document MIME type validation', () => {
    it('should accept document with video/mp4 MIME type', () => {
      const media = {
        document: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'video/mp4',
        },
      };

      const result = extractor.extract(media);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('video');
    });

    it('should accept document with video/quicktime MIME type', () => {
      const media = {
        document: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'video/quicktime',
        },
      };

      const result = extractor.extract(media);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('video');
    });

    it('should reject document with non-video MIME type', () => {
      const media = {
        document: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'application/pdf',
        },
      };

      const result = extractor.extract(media);

      expect(result).toBeNull();
    });

    it('should reject document with image MIME type', () => {
      const media = {
        document: {
          id: BigInt(123),
          accessHash: BigInt(456),
          fileReference: Buffer.from('ref'),
          mimeType: 'image/png',
        },
      };

      const result = extractor.extract(media);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return null when no media found', () => {
      const media = {};
      expect(extractor.extract(media)).toBeNull();
    });

    it('should return null for null media', () => {
      expect(extractor.extract(null)).toBeNull();
    });

    it('should return null for undefined media', () => {
      expect(extractor.extract(undefined)).toBeNull();
    });

    it('should return null for invalid photo (missing fileReference)', () => {
      const media = {
        photo: {
          id: BigInt(123),
          accessHash: BigInt(456),
          // Missing fileReference
        },
      };

      expect(extractor.extract(media)).toBeNull();
    });
  });
});
