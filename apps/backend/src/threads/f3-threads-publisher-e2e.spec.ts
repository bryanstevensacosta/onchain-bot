/**
 * F3 Agent E2E (mock-only, red-ban vigente: cero red Meta).
 *
 * Part A (dev-DB proof, gated on F3_DEV_DB_PROOF=true): real dev Postgres
 * via the shared TypeORM data-source — asserts the 8 threads_* tables exist,
 * seeds 1 keyword + matching config enabled + llm config row, asserts rows.
 *
 * Part B (always runs, zero network + zero DB): enqueue a 600-char fixture
 * via the real EnqueueThreadsMessageUseCase, drain it via the real
 * ProcessNextThreadsArticleUseCase wired to the REAL
 * ThreadsApiPublisherAdapter with a MOCKED global fetch (CREATE -> FINISHED
 * -> threads_publish). Asserts: PUBLISHED status, dailyCap decrement,
 * 600-char truncated to <=500 pre-publish, stale PENDING >24h -> FAILED,
 * FAKE-token refuse path performs zero fetch calls.
 *
 * No TypeORM queue/keyword repositories exist (only in-memory + the matching
 * TypeORM repo), so the drain is proven via the in-memory + fake port path
 * used in unit specs; the dev-DB proof covers migration + raw SQL asserts.
 */
import { ConfigService } from '@nestjs/config';
import { LlmPort } from 'shared/llm';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import {
  ThreadsQueueEntry,
  type ThreadsQueueEntryProps,
} from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import { InMemoryThreadsLlmConfigRepository } from 'threads/publisher/application/repositories/in-memory-threads-llm-config.repository';
import {
  EnqueueThreadsMessageUseCase,
  type EnqueueThreadsMessageDto,
} from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import { ProcessNextThreadsArticleUseCase } from 'threads/publisher/application/handlers/process-next-threads-article.use-case';
import { ExpireStaleThreadsScheduler } from 'threads/publisher/application/scheduling/expire-stale-threads.scheduler';
import { ThreadsApiPublisherAdapter } from 'threads/publisher/infrastructure/senders/threads-api-publisher.adapter';
import dataSource from 'shared/common/persistence/data-source';

const EXPECTED_THREADS_TABLES = [
  'threads_queue_entries',
  'threads_keywords',
  'threads_blacklist_phrases',
  'threads_llm_configs',
  'threads_prompt_templates',
  'threads_throttle_states',
  'threads_matching_configs',
  'threads_oauth_tokens',
];

const runDevDbProof =
  process.env.F3_DEV_DB_PROOF === 'true' ? describe : describe.skip;

runDevDbProof('F3 Part A — dev-DB proof (migration + seed rows)', () => {
  const createdKeywordIds: string[] = [];

  beforeAll(async () => {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
  }, 60000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (createdKeywordIds.length > 0) {
        await dataSource.query(
          'DELETE FROM threads_keywords WHERE id = ANY($1)',
          [createdKeywordIds],
        );
      }
      await dataSource.query('DELETE FROM threads_llm_configs WHERE id = 999');
      await dataSource.query(
        'DELETE FROM threads_matching_configs WHERE id = 999999',
      );
      await dataSource.destroy();
    }
  });

  it('migration 1875000000001 is recorded as executed', async () => {
    const rows = await dataSource.query(
      "SELECT name FROM typeorm_migrations WHERE name LIKE '%1875000000001%'",
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toContain('CreateThreadsPublisherTables');
  });

  it('all 8 threads_* tables exist', async () => {
    const rows = await dataSource.query(
      'SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)',
      [EXPECTED_THREADS_TABLES],
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      [...EXPECTED_THREADS_TABLES].sort(),
    );
  });

  it('seeds 1 keyword + matching config enabled + llm config row', async () => {
    const keywordId = crypto.randomUUID();
    await dataSource.query(
      'INSERT INTO threads_keywords(id, phrase, case_sensitive, enabled, match_mode) VALUES ($1, $2, false, true, $3)',
      [keywordId, 'bitcoin', 'substring'],
    );
    createdKeywordIds.push(keywordId);

    await dataSource.query(
      'INSERT INTO threads_matching_configs(id, enabled) VALUES (999999, true) ON CONFLICT (id) DO UPDATE SET enabled = true',
    );
    await dataSource.query(
      'INSERT INTO threads_llm_configs(id, default_template_id, llm_enabled, publishing_enabled, reject_non_latin, daily_cap, daily_reset_utc_hour, random_delay_min_ms, random_delay_max_ms, llm_max_attempts) VALUES (999, $1, false, true, true, 60, 0, 1000, 5000, 3) ON CONFLICT (id) DO UPDATE SET publishing_enabled = true',
      [crypto.randomUUID()],
    );

    const kw = await dataSource.query(
      'SELECT phrase, enabled FROM threads_keywords WHERE id = $1',
      [keywordId],
    );
    expect(kw).toHaveLength(1);
    expect(kw[0].phrase).toBe('bitcoin');
    expect(kw[0].enabled).toBe(true);

    const mc = await dataSource.query(
      'SELECT enabled FROM threads_matching_configs WHERE id = 999999',
    );
    expect(mc[0].enabled).toBe(true);

    const lc = await dataSource.query(
      'SELECT publishing_enabled, daily_cap FROM threads_llm_configs WHERE id = 999',
    );
    expect(lc[0].publishing_enabled).toBe(true);
    expect(lc[0].daily_cap).toBe(60);
  });
});

describe('F3 Part B — mock-only drain (zero Meta network, zero DB)', () => {
  const realFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  const jsonResponse = (ok: boolean, status: number, body: unknown): Response =>
    ({ ok, status, json: () => Promise.resolve(body) }) as unknown as Response;

  const mockCreateFinishedPublish = (remoteId: string): void => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: 'container-f3' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { status: 'FINISHED' }))
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: remoteId }));
  };

  const makeAdapter = (accessToken: string): ThreadsApiPublisherAdapter => {
    const config = {
      get: (): unknown => ({ threads: { accessToken, userId: 'me' } }),
    } as unknown as ConfigService;
    const adapter = new ThreadsApiPublisherAdapter(config);
    adapter.pollIntervalMs = 0;
    return adapter;
  };

  class FakeThrottleStateRepo extends SharedThrottleStateRepository {
    private last: Date | null = null;
    public async load(): Promise<never> {
      throw new Error('not used');
    }
    public async save(): Promise<void> {
      return undefined;
    }
    public async getLastPublishAt(): Promise<Date | null> {
      return this.last;
    }
    public async setLastPublishAt(at: Date): Promise<void> {
      this.last = at;
    }
  }

  class FakeLlm extends LlmPort {
    public calls = 0;
    public async generateText(): Promise<string> {
      this.calls += 1;
      return 'llm output (unused in raw mode)';
    }
    public async isAvailable(): Promise<boolean> {
      return true;
    }
  }

  const fixture = (
    messageId: number,
    content: string,
  ): EnqueueThreadsMessageDto => ({
    channelId: '-100123',
    messageId,
    content,
    publishedAt: new Date('2026-09-01T12:00:00Z'),
    ingestedAt: new Date('2026-09-01T12:01:00Z'),
    media: [],
    groupedId: null,
    matchedKeywords: [],
  });

  const staleProps = (
    queuedAt: Date,
    messageId: number,
  ): ThreadsQueueEntryProps => ({
    id: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    channelId: '-100123',
    messageId,
    rawContent: 'old news',
    rawTitle: null,
    imagePath: null,
    imagePaths: [],
    groupedId: null,
    messageReceivedAt: new Date(queuedAt.getTime() - 60 * 60 * 1000),
    queuedAt,
    matchedKeywordIds: [],
    keywordTemplateId: null,
    formattingEntities: null,
    status: 'PENDING',
    publishedAt: null,
    telegramMessageId: null,
    lastError: null,
    attempts: 0,
    generatedContent: null,
    generatedSystemPrompt: null,
    generatedUserPrompt: null,
    generatedTemperature: null,
    generatedReasoningEffort: null,
    generatedModel: null,
    blockedReason: null,
    duplicateOfChannelId: null,
    duplicateOfMessageId: null,
    duplicateOfEntryId: null,
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('enqueue 600-char fixture (no length reject) -> drain CREATE->FINISHED -> PUBLISHED, dailyCap decremented, text <=500', async () => {
    const queueRepo = new InMemoryThreadsQueueRepository();
    const configRepo = new InMemoryThreadsLlmConfigRepository();
    configRepo.seed({ publishingEnabled: true, dailyCap: 60 });
    const throttle = new SharedThrottleSchedulerService(
      new FakeThrottleStateRepo(),
      {
        minDelayMs: 0,
        maxDelayMs: 0,
      },
    );
    const llm = new FakeLlm();
    const adapter = makeAdapter('E2E_TEST_TOKEN');
    mockCreateFinishedPublish('media-f3-1');

    const enqueue = new EnqueueThreadsMessageUseCase(queueRepo);
    const long = 'x'.repeat(600);
    await enqueue.execute({ message: fixture(701, long) });
    expect(await queueRepo.findNextPending()).not.toBeNull();

    const before = await queueRepo.countPublishedToday(0);
    const drain = new ProcessNextThreadsArticleUseCase(
      queueRepo,
      throttle,
      llm,
      adapter,
      configRepo,
    );
    await drain.execute();

    // Real adapter hit the (mocked) fetch exactly 3 times: CREATE + poll + publish.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const published = await queueRepo.findByChannelIdAndMessageId(
      '-100123',
      701,
    );
    expect(published).not.toBeNull();
    expect(published!.status).toBe('PUBLISHED');
    // 600-char fixture truncated to <=500 pre-publish by the adapter.
    // CREATE body is form-encoded (media_type=TEXT&text=...), never JSON.
    const rawBody = fetchMock.mock.calls[0][1].body as unknown;
    const sent =
      typeof rawBody === 'string'
        ? new URLSearchParams(rawBody).get('text')
        : (rawBody as URLSearchParams).get('text');
    expect(sent).not.toBeNull();
    expect(sent!.length).toBeLessThanOrEqual(500);
    // dailyCap decremented: one more PUBLISHED row today.
    expect(await queueRepo.countPublishedToday(0)).toBe(before + 1);
    // Raw pipeline: LLM untouched.
    expect(llm.calls).toBe(0);
  });

  it('dailyCap reached -> tick skipped, entry stays PENDING, zero fetch calls', async () => {
    const queueRepo = new InMemoryThreadsQueueRepository();
    const configRepo = new InMemoryThreadsLlmConfigRepository();
    configRepo.seed({ publishingEnabled: true, dailyCap: 1 });
    const throttle = new SharedThrottleSchedulerService(
      new FakeThrottleStateRepo(),
      {
        minDelayMs: 0,
        maxDelayMs: 0,
      },
    );

    const enqueue = new EnqueueThreadsMessageUseCase(queueRepo);
    await enqueue.execute({ message: fixture(702, 'first') });
    const first = await queueRepo.findByChannelIdAndMessageId('-100123', 702);
    await queueRepo.markPublished(first!.id, 'media-cap-1');
    await enqueue.execute({ message: fixture(703, 'second') });

    const drain = new ProcessNextThreadsArticleUseCase(
      queueRepo,
      throttle,
      new FakeLlm(),
      makeAdapter('E2E_TEST_TOKEN'),
      configRepo,
    );
    await drain.execute();

    expect(fetchMock).not.toHaveBeenCalled();
    const second = await queueRepo.findByChannelIdAndMessageId('-100123', 703);
    expect(second!.status).toBe('PENDING');
  });

  it('stale PENDING >24h -> FAILED (TTL), fresh PENDING untouched', async () => {
    const queueRepo = new InMemoryThreadsQueueRepository();
    const stale = ThreadsQueueEntry.reconstitute(
      staleProps(new Date(Date.now() - 25 * 60 * 60 * 1000), 704),
    );
    const fresh = ThreadsQueueEntry.reconstitute(
      staleProps(new Date(Date.now() - 1 * 60 * 60 * 1000), 705),
    );
    await queueRepo.enqueue(stale);
    await queueRepo.enqueue(fresh);

    await new ExpireStaleThreadsScheduler(queueRepo).tick();

    const afterStale = await queueRepo.findById(stale.id);
    expect(afterStale!.status).toBe('FAILED');
    expect(afterStale!.lastError).toContain('Expired');
    const afterFresh = await queueRepo.findById(fresh.id);
    expect(afterFresh!.status).toBe('PENDING');
  });

  it('FAKE token refuse-path performs zero fetch calls (red-ban proof)', async () => {
    const adapter = makeAdapter('FAKE');
    const result = await adapter.publish({
      text: 'must not leave the process',
    });
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
