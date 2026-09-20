import { ProcessThreadsMessageHandler } from 'threads/integration/application/handlers/process-threads-message.handler';
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
import { EnqueueThreadsMessageUseCase } from 'threads/publisher/application/handlers/enqueue-threads-message.use-case';
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

const CHANNEL = '-1001';

function rawDto(): ThreadsMessageDto {
  return {
    id: 'msg-1',
    channelId: CHANNEL,
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

function sseEvent(
  overrides: Partial<TelegramRawMessage> = {},
): TelegramRawMessage {
  return {
    peerId: CHANNEL,
    messageId: 7,
    text: 'bitcoin breaks above resistance',
    occurredAt: new Date(),
    messageType: 'crypto-news',
    ...overrides,
  };
}

describe('ProcessThreadsMessageHandler', () => {
  let fetchRecentMessages: jest.Mock;
  let matchingRepo: InMemoryThreadsMatchingConfigRepository;
  let queueRepo: InMemoryThreadsQueueRepository;
  let handler: ProcessThreadsMessageHandler;

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
      keywordRepo,
      blacklistRepo,
    );
    matchingRepo = new InMemoryThreadsMatchingConfigRepository();
    queueRepo = new InMemoryThreadsQueueRepository();
    const enqueue = new EnqueueThreadsMessageUseCase(queueRepo);
    handler = new ProcessThreadsMessageHandler(
      filtered,
      enqueue,
      matchingRepo,
      queueRepo,
    );
  });

  it('enqueues a matched crypto-news SSE event into PENDING', async () => {
    await handler.handle(sseEvent());

    expect(await queueRepo.countPending()).toBe(1);
    expect(fetchRecentMessages).toHaveBeenCalled();
  });

  it("ignores messageType='kol' events without fetching", async () => {
    await handler.handle(sseEvent({ messageType: 'kol' }));

    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(0);
  });

  it('enqueues nothing when matchingEnabled=false', async () => {
    matchingRepo.seed({ enabled: false });

    await handler.handle(sseEvent());

    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.countPending()).toBe(0);
  });

  it('skips dedup when the message is already PENDING', async () => {
    await handler.handle(sseEvent());
    expect(await queueRepo.countPending()).toBe(1);

    fetchRecentMessages.mockClear();
    await handler.handle(sseEvent());

    // Dedup skip happens BEFORE fetch: no second fetch, no second row.
    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.findAllForDisplay(10)).toHaveLength(1);
  });

  it('skips dedup when the message FAILED with a blocking reason', async () => {
    await handler.handle(sseEvent());
    const entry = await queueRepo.findByChannelIdAndMessageId(CHANNEL, 7);
    expect(entry).not.toBeNull();
    await queueRepo.markFailed(entry?.id ?? '', 'content violates policy');

    fetchRecentMessages.mockClear();
    await handler.handle(sseEvent());

    expect(fetchRecentMessages).not.toHaveBeenCalled();
    expect(await queueRepo.findAllForDisplay(10)).toHaveLength(1);
  });
});
