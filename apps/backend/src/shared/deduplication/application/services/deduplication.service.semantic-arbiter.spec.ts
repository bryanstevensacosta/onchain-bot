/**
 * Semantic-gated LLM arbiter consult (Wave 2 of dedup-semantic-arbiter).
 *
 * Locks the contract: when the composite dedup score lands in the
 * 'different' zone but the raw semantic cosine is at/above
 * `DEDUP_SEMANTIC_ARBITER_THRESHOLD`, the LLM arbiter MUST be consulted
 * before fail-open publishing. The gate is disabled when the env var
 * is unset or set to 0 (default 0.70 in production), preserving
 * byte-identical behavior to today in that case.
 *
 * Test cases (per plan T5):
 *  1. semantic ≥ 0.70 + composite zone 'different' → arbiter IS
 *     consulted, arbiter DUPLICATE → blocked with reason
 *     'Semantic duplicate (LLM confirmed)'.
 *  2. semantic ≥ 0.70 + composite zone 'different' + arbiter throws
 *     → fail-open 'different' (not blocked).
 *  3. semantic < 0.70 → arbiter NOT consulted, existing fail-open
 *     path unchanged.
 *  4. threshold = 0 → gate disabled, behavior identical to today.
 *
 * The first three cases must be RED against current code (the gate
 * does not exist yet). Case 4 is a behavioral lock against future
 * regressions and is the only one that is expected to pass against
 * the current code (existing 'different' zone already short-circuits
 * to fail-open).
 */
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { appConfig } from 'shared/common/config/app.config';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';
import { DeduplicationService } from './deduplication.service';
import { DeduplicationStore } from '../ports/deduplication-store.port';

describe('DeduplicationService — semantic-gated LLM arbiter', () => {
  let mockStore: jest.Mocked<DeduplicationStore>;
  let mockEmbeddingService: { embed: jest.Mock };
  let mockArbiterService: { classifyRelation: jest.Mock };

  /**
   * Helper: build a service module with the given threshold. The
   * ConfigService is loaded from process.env (set BEFORE the test
   * module is built), and the DEDUP_SEMANTIC_ARBITER_THRESHOLD
   * env var is reset to its original value in afterEach.
   */
  async function buildService(
    threshold: string,
    options: { provideArbiter: boolean } = { provideArbiter: true },
  ): Promise<{
    service: DeduplicationService;
    restoreEnv: () => void;
  }> {
    const previous = process.env.DEDUP_SEMANTIC_ARBITER_THRESHOLD;
    if (threshold === null) {
      delete process.env.DEDUP_SEMANTIC_ARBITER_THRESHOLD;
    } else {
      process.env.DEDUP_SEMANTIC_ARBITER_THRESHOLD = threshold;
    }

    mockStore = {
      save: jest.fn(),
      findExisting: jest.fn(),
      findByUrlHash: jest.fn(),
      findSimilarEmbeddings: jest.fn(),
      markSeen: jest.fn(),
      pruneOlderThan: jest.fn(),
    };
    mockEmbeddingService = { embed: jest.fn() };
    mockArbiterService = { classifyRelation: jest.fn() };

    const providers: Array<unknown> = [
      DeduplicationService,
      { provide: DeduplicationStore, useValue: mockStore },
      { provide: 'EMBEDDING_SERVICE', useValue: mockEmbeddingService },
    ];
    if (options.provideArbiter) {
      providers.push({
        provide: 'LLM_ARBITER_SERVICE',
        useValue: mockArbiterService,
      });
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [appConfig], isGlobal: true })],
      providers,
    }).compile();

    return {
      service: moduleRef.get<DeduplicationService>(DeduplicationService),
      restoreEnv: () => {
        if (previous === undefined) {
          delete process.env.DEDUP_SEMANTIC_ARBITER_THRESHOLD;
        } else {
          process.env.DEDUP_SEMANTIC_ARBITER_THRESHOLD = previous;
        }
      },
    };
  }

  /**
   * Cosine-similarity geometry helpers. The vectors are normalized so
   * `cosineSimilarity(a, b) = a · b` (the project uses normalized
   * embeddings in production).
   */
  function unitVector(angle: number): number[] {
    return [Math.cos(angle), Math.sin(angle)];
  }

  function vecForCosine(cosTarget: number): {
    incoming: number[];
    existing: number[];
  } {
    const angle = Math.acos(cosTarget);
    return { incoming: [1, 0], existing: unitVector(angle) };
  }

  afterEach(() => {
    // nothing to clean here — restoreEnv is per-test
  });

  it('routes zone-different + semantic ≥ 0.70 to the arbiter; DUPLICATE verdict blocks with reason "Semantic duplicate (LLM confirmed)"', async () => {
    // semantic=0.75 (≥ 0.70), but composite lands in 'different' because
    // every other signal is mismatched. The expected composite score
    // with cosine=0.75 + zero jaccard + medium number/entity/cashtag
    // penalties is ~0.27 — comfortably below the 0.60 gray-zone floor.
    const { service, restoreEnv } = await buildService('0.70');
    try {
      const COS = 0.75;
      const { incoming, existing } = vecForCosine(COS);
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: existing,
        // Distinct tokens, numbers, entities, cashtags → low jaccard +
        // medium penalties → composite score stays in 'different' zone.
        tokens: ['bitcoin', 'crashing', 'today'],
        numbers: [999],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        content:
          'Bitcoin market is experiencing a dramatic crash today as major exchanges report significant outflows across spot markets',
      });

      mockEmbeddingService.embed.mockResolvedValue(incoming);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: COS },
      ]);
      mockArbiterService.classifyRelation.mockResolvedValue({
        relation: 'duplicate',
        confidence: 0.92,
        reason: 'same event',
      });

      const result = await service.checkSemantic(
        'telegram',
        'Solana pumping on launch news',
        'channel1',
        124,
      );

      expect(mockArbiterService.classifyRelation).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBe(true);
      expect(result.zone).toBe('duplicate');
      expect(result.blockedReason).toBe('Semantic duplicate (LLM confirmed)');
    } finally {
      restoreEnv();
    }
  });

  it('fail-opens to different (not blocked) when arbiter throws', async () => {
    const { service, restoreEnv } = await buildService('0.70');
    try {
      const COS = 0.75;
      const { incoming, existing } = vecForCosine(COS);
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: existing,
        tokens: ['bitcoin', 'crashing', 'today'],
        numbers: [999],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        content:
          'Bitcoin market is experiencing a dramatic crash today as major exchanges report significant outflows across spot markets',
      });

      mockEmbeddingService.embed.mockResolvedValue(incoming);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: COS },
      ]);
      mockArbiterService.classifyRelation.mockRejectedValue(
        new Error('gateway 503'),
      );

      const result = await service.checkSemantic(
        'telegram',
        'Solana pumping on launch news',
        'channel1',
        124,
      );

      expect(mockArbiterService.classifyRelation).toHaveBeenCalledTimes(1);
      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
      expect(result.blockedReason).toBeUndefined();
    } finally {
      restoreEnv();
    }
  });

  it('does NOT consult the arbiter when semantic < threshold', async () => {
    // semantic=0.5 is below the 0.70 gate. The pair lands in the
    // normal 'different' zone (low score) and the existing fail-open
    // path runs untouched. The arbiter mock would reject the test if
    // called.
    const { service, restoreEnv } = await buildService('0.70');
    try {
      const COS = 0.5;
      const { incoming, existing } = vecForCosine(COS);
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: existing,
        tokens: ['bitcoin', 'crashing', 'today'],
        numbers: [999],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        content:
          'Bitcoin market is experiencing a dramatic crash today as major exchanges report significant outflows across spot markets',
      });

      mockEmbeddingService.embed.mockResolvedValue(incoming);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: COS },
      ]);
      // The arbiter must never be invoked here. We attach a strict
      // assertion via the .not.toHaveBeenCalled() expectation below
      // rather than a rejectIfCalled side effect.
      mockArbiterService.classifyRelation.mockResolvedValue({
        relation: 'duplicate',
        confidence: 0.99,
      });

      const result = await service.checkSemantic(
        'telegram',
        'Solana pumping on launch news',
        'channel1',
        124,
      );

      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
    } finally {
      restoreEnv();
    }
  });

  it('disables the gate entirely when threshold=0 (byte-identical to today)', async () => {
    // Same shape as test #1 (semantic=0.75, zone-different), but with
    // the gate explicitly disabled by setting the threshold to 0. The
    // arbiter must NOT be called and the result must be the normal
    // 'different' fail-open — identical to a pre-gate world.
    const { service, restoreEnv } = await buildService('0');
    try {
      const COS = 0.75;
      const { incoming, existing } = vecForCosine(COS);
      const existingRecord = DedupRecord.create({
        fingerprint: Fingerprint.semantic('channel1', 123),
        source: 'telegram',
        channelId: 'channel1',
        messageId: 123,
        embedding: existing,
        tokens: ['bitcoin', 'crashing', 'today'],
        numbers: [999],
        entities: ['bitcoin'],
        cashtags: ['BTC'],
        content:
          'Bitcoin market is experiencing a dramatic crash today as major exchanges report significant outflows across spot markets',
      });

      mockEmbeddingService.embed.mockResolvedValue(incoming);
      mockStore.findSimilarEmbeddings.mockResolvedValue([
        { record: existingRecord, similarity: COS },
      ]);
      mockArbiterService.classifyRelation.mockResolvedValue({
        relation: 'duplicate',
        confidence: 0.99,
      });

      const result = await service.checkSemantic(
        'telegram',
        'Solana pumping on launch news',
        'channel1',
        124,
      );

      expect(mockArbiterService.classifyRelation).not.toHaveBeenCalled();
      expect(result.isDuplicate).toBe(false);
      expect(result.zone).toBe('different');
    } finally {
      restoreEnv();
    }
  });
});
