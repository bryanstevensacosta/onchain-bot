import { KolMessageTransformer } from './kol-message-transformer';

describe('KolMessageTransformer', () => {
  let transformer: KolMessageTransformer;

  beforeEach(() => {
    transformer = new KolMessageTransformer();
  });

  describe('transform()', () => {
    it('should transform message with all fields', () => {
      const raw = {
        id: 123,
        peerId: '-1001234567890',
        message: 'BUY $SOL NOW!', // This will be ignored (ToS)
        media: {
          photo: {
            id: BigInt(456),
            accessHash: BigInt(789),
            fileReference: Buffer.from('ref'),
            mimeType: 'image/jpeg',
          },
        },
        entities: [
          { offset: 4, length: 4, className: 'MessageEntityBold' },
        ],
        groupedId: BigInt(999),
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(123);
      expect(result!.peerId).toBe('-1001234567890');
      expect(result!.text).toBe(''); // ToS invariant
      expect(result!.media).toHaveLength(1);
      expect(result!.media[0].type).toBe('photo');
      expect(result!.entities).toHaveLength(1);
      expect(result!.entities[0].type).toBe('bold');
      expect(result!.groupedId).toBe(BigInt(999));
      expect(result!.occurredAt).toBeInstanceOf(Date);
    });

    it('should enforce ToS invariant (text always empty)', () => {
      const messages = [
        { id: 1, peerId: '123', message: 'ALPHA CALL: $TOKEN' },
        { id: 2, peerId: '123', text: 'Check this out' },
        { id: 3, peerId: '123', message: 'BUY NOW', text: 'BACKUP' },
      ];

      messages.forEach((raw) => {
        const result = transformer.transform(raw);
        expect(result?.text).toBe('');
      });
    });

    it('should extract media metadata without download', () => {
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
      // No filePath field (metadata only)
    });

    it('should normalize entities from GramJS format', () => {
      const raw = {
        id: 123,
        peerId: '456',
        entities: [
          { offset: 0, length: 10, className: 'MessageEntityUrl' },
          { offset: 11, length: 8, className: 'MessageEntityHashtag' },
          { offset: 20, length: 5, className: 'MessageEntityBold' },
        ],
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.entities).toHaveLength(3);
      expect(result!.entities[0].type).toBe('url');
      expect(result!.entities[1].type).toBe('hashtag');
      expect(result!.entities[2].type).toBe('bold');
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

    it('should convert occurredAt correctly (Unix timestamp → Date)', () => {
      const raw = {
        id: 123,
        peerId: '456',
        date: 1609459200, // 2021-01-01 00:00:00 UTC
      };

      const result = transformer.transform(raw);

      expect(result!.occurredAt).toBeInstanceOf(Date);
      expect(result!.occurredAt.getUTCFullYear()).toBe(2021);
      expect(result!.occurredAt.getUTCMonth()).toBe(0);
      expect(result!.occurredAt.getUTCDate()).toBe(1);
    });

    it('should return null for invalid message', () => {
      const raw = { id: 123 }; // Missing peerId

      expect(transformer.transform(raw)).toBeNull();
    });

    it('should handle message with no media', () => {
      const raw = {
        id: 123,
        peerId: '456',
        message: 'Text only',
        date: 1609459200,
      };

      const result = transformer.transform(raw);

      expect(result!.text).toBe(''); // Still empty (ToS)
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
  });
});
