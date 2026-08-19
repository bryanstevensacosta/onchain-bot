import { DomainError } from 'shared/kernel/domain-error';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';

describe('DedupRecord', () => {
  describe('create()', () => {
    it('creates entity with valid props and auto-generated id and createdAt', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.id).toBeDefined();
      expect(entity.id.length).toBe(36); // UUID v4
      expect(entity.createdAt).toBeInstanceOf(Date);
      expect(entity.fingerprint).toBe(fingerprint);
      expect(entity.source).toBe('telegram');
      expect(entity.channelId).toBe('channel123');
      expect(entity.messageId).toBe(42);
    });

    it('throws DomainError when source is empty', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.create({
          fingerprint,
          source: '',
          channelId: 'channel123',
          messageId: 42,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when source is whitespace only', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.create({
          fingerprint,
          source: '   ',
          channelId: 'channel123',
          messageId: 42,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when fingerprint is not a Fingerprint instance', () => {
      expect(() =>
        DedupRecord.create({
          // @ts-expect-error - testing invalid input
          fingerprint: { type: 'exact', value: 'test' },
          source: 'telegram',
          channelId: 'channel123',
          messageId: 42,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when fingerprint is undefined', () => {
      expect(() =>
        DedupRecord.create({
          // @ts-expect-error - testing invalid input
          fingerprint: undefined,
          source: 'telegram',
          channelId: 'channel123',
          messageId: 42,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when channelId is empty', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.create({
          fingerprint,
          source: 'telegram',
          channelId: '',
          messageId: 42,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when messageId is negative', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.create({
          fingerprint,
          source: 'telegram',
          channelId: 'channel123',
          messageId: -1,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when messageId is not an integer', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.create({
          fingerprint,
          source: 'telegram',
          channelId: 'channel123',
          // @ts-expect-error - testing invalid input
          messageId: 1.5,
        }),
      ).toThrow(DomainError);
    });

    it('throws DomainError when messageId is null', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.create({
          fingerprint,
          source: 'telegram',
          channelId: 'channel123',
          // @ts-expect-error - testing invalid input
          messageId: null,
        }),
      ).toThrow(DomainError);
    });

    it('creates with fingerprint from content factory method', () => {
      const fingerprint = Fingerprint.content('abc123hash');
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.fingerprint.toString()).toBe('content:abc123hash');
    });

    it('creates with fingerprint from url factory method', () => {
      const fingerprint = Fingerprint.url('https://example.com');
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.fingerprint.toString()).toBe('url:https://example.com');
    });

    it('creates with fingerprint from semantic factory method', () => {
      const fingerprint = Fingerprint.semantic('channel123', 42);
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.fingerprint.toString()).toBe('semantic:channel123:42');
    });

    it('creates with optional fields provided', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const embedding = [0.1, 0.2, 0.3];
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
        urlsHashes: ['hash1', 'hash2'],
        tokens: ['BTC', 'ETH'],
        numbers: [1000, 2000],
        entities: ['entity1'],
        cashtags: ['$BTC', '$ETH'],
        embedding,
        referencedEntryId: 'entry-123',
        referencedChannelId: 'ref-channel',
        referencedMessageId: 100,
      });

      expect(entity.urlsHashes).toEqual(['hash1', 'hash2']);
      expect(entity.tokens).toEqual(['BTC', 'ETH']);
      expect(entity.numbers).toEqual([1000, 2000]);
      expect(entity.entities).toEqual(['entity1']);
      expect(entity.cashtags).toEqual(['$BTC', '$ETH']);
      expect(entity.embedding).toEqual(embedding);
      expect(entity.referencedEntryId).toBe('entry-123');
      expect(entity.referencedChannelId).toBe('ref-channel');
      expect(entity.referencedMessageId).toBe(100);
    });

    it('defaults optional arrays to empty when not provided', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.urlsHashes).toEqual([]);
      expect(entity.tokens).toEqual([]);
      expect(entity.numbers).toEqual([]);
      expect(entity.entities).toEqual([]);
      expect(entity.cashtags).toEqual([]);
    });

    it('defaults embedding to null when not provided', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.embedding).toBeNull();
    });

    it('defaults referenced fields to null when not provided', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.referencedEntryId).toBeNull();
      expect(entity.referencedChannelId).toBeNull();
      expect(entity.referencedMessageId).toBeNull();
    });

    it('uses provided id when specified', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.create({
        id: 'custom-uuid-123',
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
      });

      expect(entity.id).toBe('custom-uuid-123');
    });

    it('uses provided createdAt when specified', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const customDate = new Date('2025-01-01T00:00:00Z');
      const entity = DedupRecord.create({
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
        createdAt: customDate,
      });

      expect(entity.createdAt).toEqual(customDate);
    });

    it('trims source and channelId', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.create({
        fingerprint,
        source: '  telegram  ',
        channelId: '  channel123  ',
        messageId: 42,
      });

      expect(entity.source).toBe('telegram');
      expect(entity.channelId).toBe('channel123');
    });
  });

  describe('reconstitute()', () => {
    it('rehydrates entity with all fields', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const embedding = [0.1, 0.2];
      const entity = DedupRecord.reconstitute({
        id: 'persisted-id-123',
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
        urlsHashes: ['hash1'],
        tokens: ['BTC'],
        numbers: [100],
        entities: ['entity1'],
        cashtags: ['$BTC'],
        embedding,
        referencedEntryId: 'entry-1',
        referencedChannelId: 'ref-ch',
        referencedMessageId: 100,
        createdAt: new Date('2025-01-01'),
      });

      expect(entity.id).toBe('persisted-id-123');
      expect(entity.fingerprint).toBe(fingerprint);
      expect(entity.source).toBe('telegram');
      expect(entity.channelId).toBe('channel123');
      expect(entity.messageId).toBe(42);
      expect(entity.urlsHashes).toEqual(['hash1']);
      expect(entity.tokens).toEqual(['BTC']);
      expect(entity.numbers).toEqual([100]);
      expect(entity.entities).toEqual(['entity1']);
      expect(entity.cashtags).toEqual(['$BTC']);
      expect(entity.embedding).toEqual(embedding);
      expect(entity.referencedEntryId).toBe('entry-1');
      expect(entity.referencedChannelId).toBe('ref-ch');
      expect(entity.referencedMessageId).toBe(100);
      expect(entity.createdAt).toEqual(new Date('2025-01-01'));
    });

    it('reconstitutes with minimal fields without validation', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const entity = DedupRecord.reconstitute({
        id: 'minimal-id',
        fingerprint,
        source: 'telegram',
        channelId: 'channel123',
        messageId: 42,
        urlsHashes: [],
        tokens: [],
        numbers: [],
        entities: [],
        cashtags: [],
        embedding: null,
        referencedEntryId: null,
        referencedChannelId: null,
        referencedMessageId: null,
        createdAt: new Date(),
      });

      expect(entity.id).toBe('minimal-id');
      expect(entity.urlsHashes).toEqual([]);
      expect(entity.tokens).toEqual([]);
      expect(entity.embedding).toBeNull();
    });

    it('throws when id is not provided', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      expect(() =>
        DedupRecord.reconstitute({
          // @ts-expect-error - testing invalid input
          id: undefined,
          fingerprint,
          source: 'telegram',
          channelId: 'channel123',
          messageId: 42,
          urlsHashes: [],
          tokens: [],
          numbers: [],
          entities: [],
          cashtags: [],
          embedding: null,
          referencedEntryId: null,
          referencedChannelId: null,
          referencedMessageId: null,
          createdAt: new Date(),
        }),
      ).toThrow(DomainError);
    });
  });

  describe('Getters', () => {
    it('returns correct values for all getters', () => {
      const fingerprint = Fingerprint.exact('channel123', 42);
      const createdAt = new Date('2025-06-15');
      const entity = DedupRecord.reconstitute({
        id: 'test-id',
        fingerprint,
        source: 'test-source',
        channelId: 'test-channel',
        messageId: 999,
        urlsHashes: ['url-hash'],
        tokens: ['SOL', 'ETH'],
        numbers: [1, 2, 3],
        entities: ['mention'],
        cashtags: ['$SOL'],
        embedding: [0.5],
        referencedEntryId: 'ref-entry',
        referencedChannelId: 'ref-channel',
        referencedMessageId: 777,
        createdAt,
      });

      expect(entity.id).toBe('test-id');
      expect(entity.fingerprint).toBe(fingerprint);
      expect(entity.source).toBe('test-source');
      expect(entity.channelId).toBe('test-channel');
      expect(entity.messageId).toBe(999);
      expect(entity.urlsHashes).toEqual(['url-hash']);
      expect(entity.tokens).toEqual(['SOL', 'ETH']);
      expect(entity.numbers).toEqual([1, 2, 3]);
      expect(entity.entities).toEqual(['mention']);
      expect(entity.cashtags).toEqual(['$SOL']);
      expect(entity.embedding).toEqual([0.5]);
      expect(entity.referencedEntryId).toBe('ref-entry');
      expect(entity.referencedChannelId).toBe('ref-channel');
      expect(entity.referencedMessageId).toBe(777);
      expect(entity.createdAt).toBe(createdAt);
    });
  });
});
