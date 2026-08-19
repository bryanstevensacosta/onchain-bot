import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmDeduplicationStore } from '../typeorm-deduplication-store';
import { DedupRecordEntity } from '../../entities/dedup-record.entity';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';

describe('TypeOrmDeduplicationStore', () => {
  let store: TypeOrmDeduplicationStore;
  let mockRepo: jest.Mocked<Repository<DedupRecordEntity>>;

  beforeEach(async () => {
    mockRepo = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<DedupRecordEntity>>;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TypeOrmDeduplicationStore,
        {
          provide: getRepositoryToken(DedupRecordEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    store = moduleRef.get<TypeOrmDeduplicationStore>(TypeOrmDeduplicationStore);
  });

  describe('save() + findExisting()', () => {
    it('saves a record and finds it by fingerprint', async () => {
      const fingerprint = Fingerprint.content('abc123');
      const record = DedupRecord.create({
        fingerprint,
        source: 'test-source',
        channelId: 'channel-123',
        messageId: 42,
        tokens: ['BTC', 'ETH'],
        numbers: [1000, 2000],
        createdAt: new Date('2026-01-01T12:00:00Z'),
      });

      const savedEntity: DedupRecordEntity = {
        id: record.id,
        fingerprintType: 'content',
        fingerprintValue: 'abc123',
        source: 'test-source',
        channelId: 'channel-123',
        messageId: 42,
        urlsHashes: null,
        tokens: ['BTC', 'ETH'],
        numbers: [1000, 2000],
        entities: null,
        cashtags: null,
        embedding: null,
        referencedEntryId: null,
        referencedChannelId: null,
        referencedMessageId: null,
        createdAt: new Date('2026-01-01T12:00:00Z'),
      };

      mockRepo.save.mockResolvedValue(savedEntity);
      mockRepo.findOne.mockResolvedValue(savedEntity);

      await store.save(record);

      const found = await store.findExisting(fingerprint, 'test-source');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(record.id);
      expect(found!.source).toBe('test-source');
      expect(found!.fingerprint.type).toBe('content');
      expect(found!.fingerprint.value).toBe('abc123');
      expect(found!.channelId).toBe('channel-123');
      expect(found!.messageId).toBe(42);
      expect(Array.from(found!.tokens)).toEqual(['BTC', 'ETH']);
      expect(Array.from(found!.numbers)).toEqual([1000, 2000]);
    });

    it('returns null when no matching fingerprint exists', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const fingerprint = Fingerprint.content('nonexistent');
      const found = await store.findExisting(fingerprint, 'unknown-source');
      expect(found).toBeNull();
    });
  });

  describe('save() duplicate fingerprint constraint', () => {
    it('throws on duplicate fingerprint_type+value+source', async () => {
      const fingerprint = Fingerprint.url('https://example.com');
      const record1 = DedupRecord.create({
        fingerprint,
        source: 'dup-source',
        channelId: 'ch-1',
        messageId: 1,
        createdAt: new Date(),
      });

      mockRepo.save.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      await expect(store.save(record1)).rejects.toThrow();
    });
  });

  describe('findByUrlHash()', () => {
    it('finds a record by URL hash within time window', async () => {
      const urlHash = 'https://crypto-news.com/article';
      const fingerprint = Fingerprint.url(urlHash);
      const record = DedupRecord.create({
        fingerprint,
        source: 'news-source',
        channelId: 'ch-news',
        messageId: 100,
        createdAt: new Date('2026-06-15T10:00:00Z'),
      });

      const savedEntity: DedupRecordEntity = {
        id: record.id,
        fingerprintType: 'url',
        fingerprintValue: urlHash,
        source: 'news-source',
        channelId: 'ch-news',
        messageId: 100,
        urlsHashes: null,
        tokens: null,
        numbers: null,
        entities: null,
        cashtags: null,
        embedding: null,
        referencedEntryId: null,
        referencedChannelId: null,
        referencedMessageId: null,
        createdAt: new Date('2026-06-15T10:00:00Z'),
      };

      mockRepo.findOne.mockResolvedValue(savedEntity);

      const found = await store.findByUrlHash(
        urlHash,
        'news-source',
        new Date('2026-06-01T00:00:00Z'),
      );
      expect(found).not.toBeNull();
      expect(found!.messageId).toBe(100);
    });

    it('excludes records outside the time window', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const urlHash = 'https://old-news.com/article';
      const found = await store.findByUrlHash(
        urlHash,
        'old-source',
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(found).toBeNull();
    });
  });

  describe('findSimilarEmbeddings()', () => {
    it('finds records with similar embeddings above threshold', async () => {
      const embedding1 = [1.0, 0.0, 0.0];
      const embedding2 = [0.9, 0.1, 0.0];
      const embedding3 = [0.0, 1.0, 0.0];

      const mockEntities: DedupRecordEntity[] = [
        {
          id: 'id-1',
          fingerprintType: 'semantic',
          fingerprintValue: 'ch1:1',
          source: 'emb-source',
          channelId: 'ch1',
          messageId: 1,
          urlsHashes: null,
          tokens: null,
          numbers: null,
          entities: null,
          cashtags: null,
          embedding: embedding1,
          referencedEntryId: null,
          referencedChannelId: null,
          referencedMessageId: null,
          createdAt: new Date(),
        },
        {
          id: 'id-2',
          fingerprintType: 'semantic',
          fingerprintValue: 'ch2:2',
          source: 'emb-source',
          channelId: 'ch2',
          messageId: 2,
          urlsHashes: null,
          tokens: null,
          numbers: null,
          entities: null,
          cashtags: null,
          embedding: embedding2,
          referencedEntryId: null,
          referencedChannelId: null,
          referencedMessageId: null,
          createdAt: new Date(),
        },
        {
          id: 'id-3',
          fingerprintType: 'semantic',
          fingerprintValue: 'ch3:3',
          source: 'emb-source',
          channelId: 'ch3',
          messageId: 3,
          urlsHashes: null,
          tokens: null,
          numbers: null,
          entities: null,
          cashtags: null,
          embedding: embedding3,
          referencedEntryId: null,
          referencedChannelId: null,
          referencedMessageId: null,
          createdAt: new Date(),
        },
      ];

      mockRepo.find.mockResolvedValue(mockEntities);

      const results = await store.findSimilarEmbeddings(
        embedding1,
        'emb-source',
        new Date('2020-01-01T00:00:00Z'),
        0.8,
      );

      expect(results.length).toBe(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
      expect(results[0].record.messageId).toBe(1);
    });

    it('excludes records below similarity threshold', async () => {
      const queryEmbedding = [1.0, 0.0, 0.0];
      const unrelatedEmbedding = [0.0, 0.0, 1.0];

      const mockEntity: DedupRecordEntity = {
        id: 'id-1',
        fingerprintType: 'semantic',
        fingerprintValue: 'ch1:1',
        source: 'unrelated-source',
        channelId: 'ch-unrelated',
        messageId: 1,
        urlsHashes: null,
        tokens: null,
        numbers: null,
        entities: null,
        cashtags: null,
        embedding: unrelatedEmbedding,
        referencedEntryId: null,
        referencedChannelId: null,
        referencedMessageId: null,
        createdAt: new Date(),
      };

      mockRepo.find.mockResolvedValue([mockEntity]);

      const results = await store.findSimilarEmbeddings(
        queryEmbedding,
        'unrelated-source',
        new Date('2020-01-01T00:00:00Z'),
        0.95,
      );

      expect(results.length).toBe(0);
    });
  });

  describe('markSeen()', () => {
    it('delegates to save', async () => {
      const fingerprint = Fingerprint.exact('ch-mark', 55);
      const record = DedupRecord.create({
        fingerprint,
        source: 'mark-source',
        channelId: 'ch-mark',
        messageId: 55,
        createdAt: new Date(),
      });

      const savedEntity: DedupRecordEntity = {
        id: record.id,
        fingerprintType: 'exact',
        fingerprintValue: 'ch-mark:55',
        source: 'mark-source',
        channelId: 'ch-mark',
        messageId: 55,
        urlsHashes: null,
        tokens: null,
        numbers: null,
        entities: null,
        cashtags: null,
        embedding: null,
        referencedEntryId: null,
        referencedChannelId: null,
        referencedMessageId: null,
        createdAt: record.createdAt,
      };

      mockRepo.save.mockResolvedValue(savedEntity);
      mockRepo.findOne.mockResolvedValue(savedEntity);

      await store.markSeen(record);

      const found = await store.findExisting(fingerprint, 'mark-source');
      expect(found).not.toBeNull();
      expect(found!.messageId).toBe(55);
    });
  });

  describe('pruneOlderThan()', () => {
    it('removes records older than specified hours', async () => {
      mockRepo.delete.mockResolvedValue({ affected: 1, raw: {} });

      const pruned = await store.pruneOlderThan(24);

      expect(pruned).toBe(1);
      expect(mockRepo.delete).toHaveBeenCalled();
    });
  });
});
