import { EnqueueThreadsCronScheduler } from 'threads/integration/application/scheduling/enqueue-threads-cron.scheduler';
import { FilteredThreadsService } from 'threads/integration/application/services/filtered-threads.service';
import type {
  ThreadsIngestionClient,
  ThreadsMessageDto,
} from 'threads/integration/infrastructure/http/threads-ingestion-client.service';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import type { ChannelFilterRepository } from 'telegram/ingestion/crypto-news/application/ports/channel-filter.repository';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import { InMemoryThreadsKeywordRepository } from 'threads/publisher/application/repositories/in-memory-threads-keyword.repository';
import { InMemoryThreadsBlacklistPhraseRepository } from 'threads/publisher/application/repositories/in-memory-threads-blacklist-phrase.repository';
import { InMemoryThreadsMatchingConfigRepository } from 'threads/integration/application/repositories/in-memory-threads-matching-config.repository';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import { ThreadsMatchingHealthState } from 'threads/integration/application/state/threads-matching-health.state';
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';

function rawDto(): ThreadsMessageDto {
  return {
    id: 'msg-1',
    channelId: '-1001',
    messageId: 7,
    title: null,
    content: 'bitcoin breaks above resistance, ETF inflows continue',
    publishedAt: new Date('2026-09-15T10:00:00Z').toISOString(),
    ingestedAt: new Date('2026-09-15T10:00:05Z').toISOString(),
    linkPreviewUrl: null,
    linkPreviewTitle: null,
    linkPreviewDescription: null,
    linkPreviewSiteName: null,
    messageEntities: null,
    groupedId: null,
    media: [],
  };
}

describe('EnqueueThreadsCronScheduler', () => {
  const SSE_ENV = process.env.USE_SSE_CRYPTO_NEWS;
  let fetchRecentMessages: jest.Mock;
  let matchingRepo: InMemoryThreadsMatchingConfigRepository;
  let queueRepo: InMemoryThreadsQueueRepository;
  let health: ThreadsMatchingHealthState;
  let scheduler: EnqueueThreadsCronScheduler;

  beforeEach(async () => {
    fetchRecentMessages = jest.fn().mockResolvedValue([rawDto()]);
    const client = {
      fetchRecentMessages,
    } as unknown as ThreadsIngestionClient;
    const channelFilters = {
      findFiltersByChannelId: async () => [],
    } as unknown as ChannelFilterRepository;
    const keywordRepo = new InMemoryThreadsKeywordRepository();
    await keywordRepo.save(
      ThreadsKeyword.create({ phrase: 'bitcoin', matchMode: 'substring' }),
    );
    const blacklistRepo = new InMemoryThreadsBlacklistPhraseRepository();
    const filtered = new FilteredThreadsService(
      client,
      new ContentFilterService(),
      channelFilters,
      keywordRepo as unknown as ThreadsKeywordRepository,
      blacklistRepo as unknown as ThreadsBlacklistPhraseRepository,
    );
    matchingRepo = new InMemoryThreadsMatchingConfigRepository();
    queueRepo = new InMemoryThreadsQueueRepository();
    health = new ThreadsMatchingHealthState();
    scheduler = new EnqueueThreadsCronScheduler(
      filtered,
      new EnqueueThreadsMessageUseCase(queueRepo),
      matchingRepo,
      health,
    );
  });

  afterEach(() => {
    if (SSE_ENV === undefined) {
      delete process.env.USE_SSE_CRYPTO_NEWS;
    } else {
      process.env.USE_SSE_CRYPTO_NEWS = SSE_ENV;
    }
  });

  it('tick() enqueues matches and records health on success', async () => {
    await scheduler.tick();

    expect(await queueRepo.countPending()).toBe(1);
    expect(health.lastFetchOk).toBe(true);
    expect(health.lastTickAt).not.toBeNull();
    expect(health.lastEnqueuedAt).not.toBeNull();
    expect(health.consecutiveFetchFailures).toBe(0);
  });

  it('tick() enqueues zero when matchingEnabled=false', async () => {
    matchingRepo.seed({ enabled: false });

    await scheduler.tick();

    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(0);
    expect(health.lastTickAt).toBeNull();
  });

  it('tickPrimary() runs the tick when SSE is disabled', async () => {
    process.env.USE_SSE_CRYPTO_NEWS = 'false';

    await scheduler.tickPrimary();

    expect(fetchRecentMessages).toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(1);
  });

  it('tickPrimary() skips when SSE is enabled', async () => {
    delete process.env.USE_SSE_CRYPTO_NEWS;

    await scheduler.tickPrimary();

    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(0);
  });

  it('tickSseFallback() runs the tick when SSE is enabled', async () => {
    delete process.env.USE_SSE_CRYPTO_NEWS;

    await scheduler.tickSseFallback();

    expect(fetchRecentMessages).toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(1);
  });

  it('tickSseFallback() skips when SSE is disabled', async () => {
    process.env.USE_SSE_CRYPTO_NEWS = 'false';

    await scheduler.tickSseFallback();

    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(0);
  });
});
