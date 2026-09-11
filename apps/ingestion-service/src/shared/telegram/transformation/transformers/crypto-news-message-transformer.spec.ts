import { CryptoNewsMessageTransformer } from './crypto-news-message-transformer';

describe('CryptoNewsMessageTransformer', () => {
  let transformer: CryptoNewsMessageTransformer;

  beforeEach(() => {
    transformer = new CryptoNewsMessageTransformer();
  });

  describe('transform()', () => {
    it('should transform message with all fields', () => {
      const raw = {
        id: 123,
        peerId: '-1001234567890',
        message: 'Breaking: Bitcoin reaches new ATH!',
        media: {
          photo: {
            id: BigInt(456),
            accessHash: BigInt(789),
            fileReference: Buffer.from('ref'),
            mimeType: 'image/jpeg',
          },
        },
        entities: [
          { offset: 0, length: 8, className: 'MessageEntityBold' },
        ],
        groupedId: BigInt(999),
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(123);
      expect(result!.peerId).toBe('-1001234567890');
      expect(result!.text).toBe('Breaking: Bitcoin reaches new ATH!');
      expect(result!.media).toHaveLength(1);
      expect(result!.media[0].type).toBe('photo');
      expect(result!.entities).toHaveLength(1);
      expect(result!.entities[0].type).toBe('bold');
      expect(result!.groupedId).toBe(BigInt(999));
      expect(result!.occurredAt).toBeInstanceOf(Date);
    });

    it('should extract text via 4-source cascade', () => {
      // Priority 1: message field
      const msg1 = {
        id: 1,
        peerId: '123',
        message: 'Primary text',
        text: 'Secondary',
        date: 1609459200,
      };
      expect(transformer.transform(msg1)!.text).toBe('Primary text');

      // Priority 2: text field
      const msg2 = {
        id: 2,
        peerId: '123',
        text: 'Secondary text',
        media: { caption: 'Tertiary' },
        date: 1609459200,
      };
      expect(transformer.transform(msg2)!.text).toBe('Secondary text');

      // Priority 3: media.caption
      const msg3 = {
        id: 3,
        peerId: '123',
        media: { caption: 'Caption text' },
        fwdFrom: { message: 'Forwarded' },
        date: 1609459200,
      };
      expect(transformer.transform(msg3)!.text).toBe('Caption text');

      // Priority 4: fwdFrom.message
      const msg4 = {
        id: 4,
        peerId: '123',
        fwdFrom: { message: 'Forwarded text' },
        date: 1609459200,
      };
      expect(transformer.transform(msg4)!.text).toBe('Forwarded text');
    });

    it('should extract media metadata', () => {
      const raw = {
        id: 123,
        peerId: '456',
        media: {
          video: {
            id: BigInt(789),
            accessHash: BigInt(101),
            fileReference: Buffer.from('video-ref'),
            mimeType: 'video/mp4',
            dcId: 2,
          },
        },
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.media).toHaveLength(1);
      expect(result!.media[0].type).toBe('video');
      expect(result!.media[0].fileId).toBe(BigInt(789));
      expect(result!.media[0].mimeType).toBe('video/mp4');
      expect(result!.media[0].dcId).toBe(2);
    });

    it('should NOT extract webpage preview media (external URL preview images)', () => {
      const raw = {
        id: 123,
        peerId: '456',
        media: {
          webpage: {
            url: 'https://example.com',
            title: 'Example Article',
            description: 'Article description',
            siteName: 'Example Site',
            photo: {
              id: BigInt(789),
              accessHash: BigInt(101),
              fileReference: Buffer.from('preview-ref'),
            },
          },
        },
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      // Webpage preview photos should NOT be extracted as they are:
      // 1. External URL preview images, not actual message attachments
      // 2. Would show as "broken image" icons in frontend
      // 3. Should not waste storage on external preview images
      expect(result!.media).toHaveLength(0);
    });

    it('should normalize entities', () => {
      const raw = {
        id: 123,
        peerId: '456',
        entities: [
          { offset: 0, length: 18, className: 'MessageEntityUrl' },
          { offset: 19, length: 8, className: 'MessageEntityHashtag' },
          { offset: 28, length: 7, className: 'MessageEntityMention' },
        ],
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.entities).toHaveLength(3);
      expect(result!.entities[0].type).toBe('url');
      expect(result!.entities[1].type).toBe('hashtag');
      expect(result!.entities[2].type).toBe('mention');
    });

    it('should preserve groupedId for media albums', () => {
      const raw = {
        id: 123,
        peerId: '456',
        groupedId: BigInt(789),
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.groupedId).toBe(BigInt(789));
    });

    it('should handle message with no text sources', () => {
      const raw = {
        id: 123,
        peerId: '456',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.text).toBe('');
    });

    it('should handle message with no media', () => {
      const raw = {
        id: 123,
        peerId: '456',
        message: 'Text only message',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.text).toBe('Text only message');
      expect(result!.media).toEqual([]);
    });

    it('should handle message with no entities', () => {
      const raw = {
        id: 123,
        peerId: '456',
        message: 'Plain text',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.entities).toEqual([]);
    });

    it('should return null for invalid message', () => {
      const raw = { id: 123 }; // Missing peerId

      expect(transformer.transform(raw)).toBeNull();
    });

    it('should handle complex real-world message', () => {
      const raw = {
        id: 167,
        peerId: '-1004466661332',
        message: 'Check out this new DeFi protocol! 🚀',
        media: {
          document: {
            id: BigInt(123456),
            accessHash: BigInt(789012),
            fileReference: Buffer.from('doc-ref'),
            mimeType: 'video/mp4',
            dcId: 4,
          },
        },
        entities: [
          { offset: 0, length: 9, className: 'MessageEntityBold' },
          { offset: 39, length: 1, className: 'MessageEntityUnknown' },
        ],
        groupedId: null,
        date: 1704067200,
      };

      const result = transformer.transform(raw);

      expect(result).not.toBeNull();
      expect(result!.text).toBe('Check out this new DeFi protocol! 🚀');
      expect(result!.media).toHaveLength(1);
      expect(result!.media[0].type).toBe('video');
      expect(result!.entities).toHaveLength(2);
      expect(result!.entities[0].type).toBe('bold');
      expect(result!.entities[1].type).toBe('unknown');
      expect(result!.groupedId).toBeNull();
    });
  });
});
