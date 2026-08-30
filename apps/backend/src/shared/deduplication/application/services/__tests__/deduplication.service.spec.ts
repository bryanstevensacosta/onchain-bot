import { Test, TestingModule } from '@nestjs/testing';
import { DeduplicationService } from '../deduplication.service';
import { DeduplicationStore } from '../../ports/deduplication-store.port';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { ContentNormalizerService } from 'shared/deduplication/domain/services/content-normalizer.service';

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let mockStore: jest.Mocked<DeduplicationStore>;
  let mockEmbeddingService: { embed: jest.Mock };
  let mockArbiterService: { classifyRelation: jest.Mock };

  beforeEach(async () => {
    mockStore = {
      save: jest.fn(),
      findExisting: jest.fn(),
      findByUrlHash: jest.fn(),
      findSimilarEmbeddings: jest.fn(),
      markSeen: jest.fn(),
      pruneOlderThan: jest.fn(),
    };

    mockEmbeddingService = {
      embed: jest.fn(),
    };

    mockArbiterService = {
      classifyRelation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeduplicationService,
        {
          provide: DeduplicationStore,
          useValue: mockStore,
        },
      ],
    }).compile();

    service = module.get<DeduplicationService>(DeduplicationService);
  });

  describe('checkExact', () => {
    it('should return duplicate when exact match exists', async () => {
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.exact('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
      });

      mockStore.findExisting.mockResolvedValue(existingRecord);

      const result = await service.checkExact('telegram', 'channel1', 123);

      expect(result.isDuplicate).toBe(true);
      expect(result.zone).toBe('duplicate');
      expect(result.blockedReason).toBe('Duplicate of queue');
      expect(result.existingRecord).toBe(existingRecord);
    });

    it('should return different when no exact match exists', async () => {
      mockStore.findExisting.mockResolvedValue(null);

      const result = await service.checkExact('telegram', 'channel1', 123);

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
      expect(result.blockedReason).toBeUndefined();
    });
  });

  describe('checkContent', () => {
    it('should return duplicate when content hash matches', async () => {
      const content = 'Test content for deduplication';
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.content(
          '5d41402abc4b2a76b9719d911017c592', // mock hash
        ),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
      });

      mockStore.findExisting.mockResolvedValue(existingRecord);

      const result = await service.checkContent('telegram', content);

      expect(result.isDuplicate).toBe(true);
      expect(result.zone).toBe('duplicate');
      expect(result.blockedReason).toBe('Duplicate content of queue');
    });

    it('should return different when content is unique', async () => {
      mockStore.findExisting.mockResolvedValue(null);

      const result = await service.checkContent('telegram', 'Unique content');

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
    });
  });

  describe('checkUrl', () => {
    it('should return urlOverlapCount when URL matches (not hard block)', async () => {
      const content = 'Check out https://example.com for more info';
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.url('abc123'),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
      });

      mockStore.findByUrlHash.mockResolvedValue(existingRecord);

      const result = await service.checkUrl('telegram', content);

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
      expect(result.urlOverlapCount).toBe(1);
      expect(result.blockedReason).toBeUndefined();
    });

    it('should return different when no URLs in content', async () => {
      const result = await service.checkUrl('telegram', 'No URLs here');

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
      expect(result.urlOverlapCount).toBe(0);
    });

    it('should return different when URLs are unique', async () => {
      const content = 'Check out https://example.com for more info';

      mockStore.findByUrlHash.mockResolvedValue(null);

      const result = await service.checkUrl('telegram', content);

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
      expect(result.urlOverlapCount).toBe(0);
    });

    it('should count multiple overlapping URLs', async () => {
      const content =
        'Check https://example.com and https://test.com for updates';

      mockStore.findByUrlHash.mockResolvedValueOnce(null).mockResolvedValueOnce(
        DedupRecord.create({
          fingerprint: Fingerprint.url('hash2'),
          source: 'telegram',
          channelId: 'channel1',
          messageId: 123,
        }),
      );

      const result = await service.checkUrl('telegram', content);

      expect(result.isDuplicate).toBe(false);
      expect(result.urlOverlapCount).toBe(1);
    });
  });

  describe('checkSemantic', () => {
    beforeEach(() => {
      // Inject embedding service
      (
        service as DeduplicationService & {
          embeddingService: typeof mockEmbeddingService;
        }
      ).embeddingService = mockEmbeddingService;
    });

    it('should return duplicate when semantic similarity is high', async () => {
      const content = 'Bitcoin just broke $100k!';
      const embedding = [1.0, 1.0, 1.0];
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding,
        tokens: ['bitcoin', 'just', 'broke', '100k'],
        numbers: [100000],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        createdAt: new Date(), // recent to avoid time penalties
      });

      mockEmbeddingService.embed.mockResolvedValue(embedding);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: 1.0 },
      ]);

      const result = await service.checkSemantic(
        'telegram',
        content,
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.zone).toBe('duplicate');
    });

    it('should return different when no similar embeddings found', async () => {
      mockEmbeddingService.embed.mockResolvedValue([0.1, 0.2, 0.3]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([]);

      const result = await service.checkSemantic(
        'telegram',
        'Unique content here',
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
    });

    it('should return different when embedding service unavailable', async () => {
      (
        service as DeduplicationService & {
          embeddingService?: typeof mockEmbeddingService;
        }
      ).embeddingService = undefined;

      const result = await service.checkSemantic(
        'telegram',
        'Some content',
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
    });

    it('should handle gray zone with LLM arbiter', async () => {
      const content = 'Ethereum going to $5k';
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: [0.5, 0.5, 0.5],
        tokens: ['ethereum', '5k'],
        numbers: [5000],
        entities: [],
        cashtags: ['ETH'],
        content:
          'Ethereum is pumping hard today and may soon hit five thousand dollars per coin as institutional inflows continue',
      });

      mockEmbeddingService.embed.mockResolvedValue([0.5, 0.5, 0.5]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: 0.8 },
      ]);
      mockArbiterService.classifyRelation.mockResolvedValue({
        relation: 'duplicate',
        confidence: 0.9,
      });

      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const result = await service.checkSemantic(
        'telegram',
        content,
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.eventRelation).toBe('duplicate');
      // 3-arg wiring: textA=incoming normalized, textB=candidate's real
      // normalized stored content, similarity=the real bestScore (not
      // the hardcoded 0.85 from the buggy prior wiring).
      expect(mockArbiterService.classifyRelation).toHaveBeenCalledTimes(1);
      const callArgs = mockArbiterService.classifyRelation.mock.calls[0] as [
        string,
        string,
        number,
      ];
      expect(callArgs[0]).toBe(ContentNormalizerService.normalize(content));
      expect(callArgs[1]).toBe(
        ContentNormalizerService.normalize(
          'Ethereum is pumping hard today and may soon hit five thousand dollars per coin as institutional inflows continue',
        ),
      );
      expect(typeof callArgs[2]).toBe('number');
      expect(callArgs[2]).toBeGreaterThan(0);
    });

    it('should fail-open gray zone with NULL stored content (no LLM call)', async () => {
      const content = 'Ethereum going to $5k';
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: [0.5, 0.5, 0.5],
        tokens: ['ethereum', '5k'],
        numbers: [5000],
        entities: [],
        cashtags: ['ETH'],
        content: null,
      });

      mockEmbeddingService.embed.mockResolvedValue([0.5, 0.5, 0.5]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: 0.8 },
      ]);

      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const result = await service.checkSemantic(
        'telegram',
        content,
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('gray_zone');
      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
    });

    it('should fail-open gray zone with short (<20 chars) stored content', async () => {
      const content = 'Ethereum going to $5k';
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: [0.5, 0.5, 0.5],
        tokens: ['ethereum', '5k'],
        numbers: [5000],
        entities: [],
        cashtags: ['ETH'],
        // Short, will normalize to fewer than 20 chars
        content: 'ETH pumping',
      });

      mockEmbeddingService.embed.mockResolvedValue([0.5, 0.5, 0.5]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: 0.8 },
      ]);

      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const result = await service.checkSemantic(
        'telegram',
        content,
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('gray_zone');
      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
    });

    it('should fail-open gray zone without LLM arbiter', async () => {
      const content = 'Ethereum going to $5k';
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: [0.5, 0.5, 0.5],
        tokens: ['ethereum', '5k'],
        numbers: [5000],
        entities: [],
        cashtags: ['ETH'],
      });

      mockEmbeddingService.embed.mockResolvedValue([0.5, 0.5, 0.5]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: 0.8 },
      ]);

      // No LLM arbiter
      (
        service as DeduplicationService & {
          arbiterService?: typeof mockArbiterService;
        }
      ).arbiterService = undefined;

      const result = await service.checkSemantic(
        'telegram',
        content,
        'channel1',
        124,
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('gray_zone');
    });

    /**
     * Integration: V_A_C 0.60 gray_zone boundary. Real scorer (no mocks of
     * DedupScorer) must classify score in the (0.60, 0.95) band as gray_zone,
     * then route to the LLM arbiter. With content usable, the arbiter mock's
     * "duplicate" verdict is propagated as isDuplicate:true. With content NULL,
     * the service must fail open to isDuplicate:false (operationally: requires
     * the d7efcb5 fingerprint content fix to be deployed in staging).
     */
    it('V_A_C: real scorer score in gray_zone + usable content → LLM "duplicate" → isDuplicate:true', async () => {
      // Incoming content uses $BTC cashtag so cashtagPenalty doesn't fire
      // (matching the stored record). With cosine 0.6 and jaccard(2/3)=0.07,
      // the score lands at 0.67 — inside the (0.60, 0.95) gray band.
      const COS = 0.6;
      const angle = Math.acos(COS);
      const y = Math.sin(angle);
      const x = Math.cos(angle);
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        // Long-ago createdAt to keep timeDiffMinutes > 30 so proximityBoost
        // does NOT fire (the production service computes it from now - record).
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        embedding: [x, y],
        tokens: ['bitcoin', '100k'],
        numbers: [100000],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        content:
          'Bitcoin breaks through one hundred thousand dollars as institutional inflows continue to accelerate across spot ETFs',
      });

      mockEmbeddingService.embed.mockResolvedValue([1, 0]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: COS },
      ]);
      mockArbiterService.classifyRelation.mockResolvedValue({
        relation: 'duplicate',
        confidence: 0.9,
      });
      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const result = await service.checkSemantic(
        'telegram',
        'Bitcoin $BTC hits 100k',
        'channel1',
        124,
      );

      // The scorer computed gray_zone (verified via the first-pass computeScore
      // call), then the LLM mock returned "duplicate" — the service propagates
      // that verdict as isDuplicate:true, zone: 'duplicate', eventRelation: 'duplicate'.
      // We assert isDuplicate + eventRelation + that the LLM was called exactly
      // once. result.zone is "duplicate" after the LLM verdict (see service
      // gray_zone branch line 360-368) — it does NOT stay "gray_zone".
      expect(result.isDuplicate).toBe(true);
      expect(result.eventRelation).toBe('duplicate');
      expect(mockArbiterService.classifyRelation).toHaveBeenCalledTimes(1);
    });

    it('V_A_C: real scorer score in gray_zone + NULL content → fail-open isDuplicate:false', async () => {
      // Same scoring inputs as above, but the stored record's content is NULL
      // (pre-d7efcb5 fingerprint shape). The service must NOT call the arbiter
      // and must return isDuplicate:false — the gray_zone band fails open when
      // there is no usable content to compare against.
      const COS = 0.6;
      const angle = Math.acos(COS);
      const y = Math.sin(angle);
      const x = Math.cos(angle);
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: [x, y],
        tokens: ['bitcoin', '100k'],
        numbers: [100000],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        content: null,
      });

      mockEmbeddingService.embed.mockResolvedValue([1, 0]);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: COS },
      ]);
      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const result = await service.checkSemantic(
        'telegram',
        'Bitcoin $BTC hits 100k',
        'channel1',
        124,
      );

      expect(result.zone).toBe('gray_zone');
      expect(result.isDuplicate).toBe(false);
      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
    });
  });

  describe('markAsSeen', () => {
    it('should create and save fingerprints for all types', async () => {
      const content = 'Check https://example.com for Bitcoin updates!';

      await service.markAsSeen(
        'telegram',
        'channel1',
        123,
        content,
        [0.1, 0.2, 0.3],
        'ref123',
      );

      // Should have saved 4 fingerprints: exact, content, url, semantic
      expect(mockStore.save).toHaveBeenCalledTimes(4);
    });

    it('should handle content without URLs', async () => {
      const content = 'Bitcoin to the moon!';

      await service.markAsSeen(
        'telegram',
        'channel1',
        123,
        content,
        [0.1, 0.2, 0.3],
      );

      // Should have saved 3 fingerprints: exact, content, semantic (no URL)
      expect(mockStore.save).toHaveBeenCalledTimes(3);
    });

    it('should handle content without embedding', async () => {
      const content = 'Some content without embedding';

      await service.markAsSeen('telegram', 'channel1', 123, content);

      // Should have saved fingerprints with null embedding
      const calls = mockStore.save.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should persist rawContent as the content field on each saved record', async () => {
      const content = 'Bitcoin breaking $100k resistance level today';

      await service.markAsSeen(
        'telegram',
        'channel1',
        123,
        content,
        [0.1, 0.2, 0.3],
      );

      // Every saved record must carry content = rawContent so that future
      // semantic gray-zone checks have something real to pass to the arbiter
      // (was missing in the prior wiring, causing the LLM to be passed channel
      // metadata as textB).
      const calls = mockStore.save.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const savedRecord = call[0];
        expect(savedRecord.content).toBe(content);
      }
    });
  });

  describe('classifyEvent', () => {
    it('should return null when LLM arbiter not available', async () => {
      (
        service as DeduplicationService & {
          arbiterService?: typeof mockArbiterService;
        }
      ).arbiterService = undefined;

      const record = DedupRecord.create({
        fingerprint: Fingerprint.exact('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        content: 'plenty of stored content here for the arbiter to read',
      });

      const result = await service.classifyEvent('some content', record);

      expect(result).toBeNull();
    });

    it('should call LLM arbiter with real content + similarity when available', async () => {
      mockArbiterService.classifyRelation.mockResolvedValue({
        relation: 'update',
        confidence: 0.8,
      });

      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const storedContent =
        'Ethereum continues to break resistance levels today with strong volume and bullish momentum building across major exchanges';
      const record = DedupRecord.create({
        fingerprint: Fingerprint.exact('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        content: storedContent,
      });

      const result = await service.classifyEvent('some content', record);

      expect(result).toBe('update');
      // 3-arg wiring: textA=incoming normalized content, textB=candidate's
      // real normalized stored content, similarity=0.85 default (callers
      // don't pass a value).
      expect(mockArbiterService.classifyRelation).toHaveBeenCalledTimes(1);
      const callArgs = mockArbiterService.classifyRelation.mock.calls[0];
      expect(callArgs[0]).toBe(
        ContentNormalizerService.normalize('some content'),
      );
      expect(callArgs[1]).toBe(
        ContentNormalizerService.normalize(storedContent),
      );
      expect(callArgs[2]).toBe(0.85);
    });

    it('should fail-open classifyEvent to null when candidate has NULL content', async () => {
      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const record = DedupRecord.create({
        fingerprint: Fingerprint.exact('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        content: null,
      });

      const result = await service.classifyEvent('some content', record);

      expect(result).toBeNull();
      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
    });

    it('should fail-open classifyEvent to null when candidate has short content', async () => {
      (
        service as DeduplicationService & {
          arbiterService: typeof mockArbiterService;
        }
      ).arbiterService = mockArbiterService;

      const record = DedupRecord.create({
        fingerprint: Fingerprint.exact('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        content: 'ETH up',
      });

      const result = await service.classifyEvent('some content', record);

      expect(result).toBeNull();
      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
    });
  });

  describe('extractTokens', () => {
    it('should extract and dedupe tokens', () => {
      const tokens = service.extractTokens('hello world hello');

      expect(tokens).toEqual(['hello', 'world']);
    });

    it('should sort tokens', () => {
      const tokens = service.extractTokens('zebra apple banana');

      expect(tokens).toEqual(['apple', 'banana', 'zebra']);
    });

    it('should filter empty tokens', () => {
      const tokens = service.extractTokens('hello   world');

      expect(tokens).toEqual(['hello', 'world']);
    });
  });
});
