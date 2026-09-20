import { FilteredThreadsService } from 'threads/integration/application/services/filtered-threads.service';
import type { ThreadsMessageDto } from 'threads/integration/infrastructure/http/threads-ingestion-client.service';
import type { ThreadsIngestionClient } from 'threads/integration/infrastructure/http/threads-ingestion-client.service';
import { ContentFilterService } from 'telegram/ingestion/crypto-news/application/services/content-filter.service';
import type { ChannelFilterRepository } from 'telegram/ingestion/crypto-news/application/ports/channel-filter.repository';
import { ThreadsKeywordRepository } from 'threads/publisher/application/ports/threads-keyword.repository';
import { ThreadsBlacklistPhraseRepository } from 'threads/publisher/application/ports/threads-blacklist-phrase.repository';
import { InMemoryThreadsKeywordRepository } from 'threads/publisher/application/repositories/in-memory-threads-keyword.repository';
import { InMemoryThreadsBlacklistPhraseRepository } from 'threads/publisher/application/repositories/in-memory-threads-blacklist-phrase.repository';
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';
import { ThreadsBlacklistPhrase } from 'threads/publisher/domain/entities/threads-blacklist-phrase.entity';

function rawMessage(
  overrides: Partial<ThreadsMessageDto> = {},
): ThreadsMessageDto {
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
    ...overrides,
  };
}

describe('FilteredThreadsService', () => {
  let fetchRecentMessages: jest.Mock;
  let keywordRepo: InMemoryThreadsKeywordRepository;
  let blacklistRepo: InMemoryThreadsBlacklistPhraseRepository;
  let service: FilteredThreadsService;

  beforeEach(() => {
    fetchRecentMessages = jest.fn();
    const client = {
      fetchRecentMessages,
    } as unknown as ThreadsIngestionClient;
    const channelFilters = {
      findFiltersByChannelId: async () => [],
    } as unknown as ChannelFilterRepository;
    keywordRepo = new InMemoryThreadsKeywordRepository();
    blacklistRepo = new InMemoryThreadsBlacklistPhraseRepository();
    service = new FilteredThreadsService(
      client,
      new ContentFilterService(),
      channelFilters,
      keywordRepo,
      blacklistRepo,
    );
  });

  it('matches a simple keyword and returns the filtered message', async () => {
    await keywordRepo.save(
      ThreadsKeyword.create({ phrase: 'bitcoin', matchMode: 'substring' }),
    );
    fetchRecentMessages.mockResolvedValue([rawMessage()]);

    const matches = await service.getMatchingMessages(50);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.messageId).toBe(7);
    expect(matches[0]?.matchedKeywords).toHaveLength(1);
    expect(matches[0]?.content).toContain('bitcoin');
  });

  it('matches an AND-group only when ALL group keywords are present', async () => {
    await keywordRepo.save(
      ThreadsKeyword.create({
        phrase: 'etf',
        andGroupId: 'g1',
        matchMode: 'substring',
      }),
    );
    await keywordRepo.save(
      ThreadsKeyword.create({
        phrase: 'inflows',
        andGroupId: 'g1',
        matchMode: 'substring',
      }),
    );
    fetchRecentMessages.mockResolvedValue([rawMessage()]);

    const bothPresent = await service.getMatchingMessages(50);
    expect(bothPresent).toHaveLength(1);
    expect(bothPresent[0]?.matchedKeywords).toHaveLength(2);

    fetchRecentMessages.mockResolvedValue([
      rawMessage({ id: 'msg-2', messageId: 8, content: 'etf news today' }),
    ]);
    const partial = await service.getMatchingMessages(50);
    expect(partial).toHaveLength(0);
  });

  it('returns empty when no keyword matches', async () => {
    await keywordRepo.save(
      ThreadsKeyword.create({ phrase: 'solana', matchMode: 'substring' }),
    );
    fetchRecentMessages.mockResolvedValue([rawMessage()]);

    const matches = await service.getMatchingMessages(50);
    expect(matches).toHaveLength(0);
  });

  it('blocks a keyword match when a blacklist phrase matches', async () => {
    await keywordRepo.save(
      ThreadsKeyword.create({ phrase: 'bitcoin', matchMode: 'substring' }),
    );
    await blacklistRepo.save(
      ThreadsBlacklistPhrase.create({
        phrase: 'resistance',
        matchMode: 'substring',
      }),
    );
    fetchRecentMessages.mockResolvedValue([rawMessage()]);

    const matches = await service.getMatchingMessages(50);
    expect(matches).toHaveLength(0);
  });

  it('returns empty when the ingestion client yields nothing', async () => {
    await keywordRepo.save(
      ThreadsKeyword.create({ phrase: 'bitcoin', matchMode: 'substring' }),
    );
    fetchRecentMessages.mockResolvedValue([]);

    const matches = await service.getMatchingMessages(50);
    expect(matches).toHaveLength(0);
  });
});
