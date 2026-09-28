import { MessageMatchStatusUseCase } from './message-match-status.use-case';
import { MessageMatchVerdictStore } from '../state/message-match-verdict.store';
import { EvaluateMessageMatchUseCase } from './evaluate-message-match.use-case';
import { MatchingEvaluator } from '../services/matching-evaluator.service';
import { KeywordRepository } from '@/keywords/application/ports/keyword.repository';
import { BlacklistPhraseRepository } from '@/keywords/application/ports/blacklist-phrase.repository';
import { ChannelFilterRepository } from '@/filters/application/ports/channel-filter.repository';
import { FeedPort } from '@/matching/domain/ports/feed.port';
import { QueueManager } from '@/queue/application/services/queue-manager.service';
import { PublisherQueueEntry } from '@/queue/domain/publisher-queue-entry.entity';
import { Keyword } from '@/keywords/domain/keyword.entity';
import { BlacklistPhrase } from '@/keywords/domain/blacklist-phrase.entity';
import type { FeedMessage } from '@/matching/domain/feed-message';

function row(
  channelId: string,
  messageId: number,
  content: string,
): FeedMessage {
  return {
    channelId,
    messageId,
    title: null,
    content,
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    media: [],
    groupedId: null,
    messageType: 'crypto-news',
  };
}

describe('MessageMatchStatusUseCase', () => {
  async function build(rows: FeedMessage[]) {
    const keywordRepo: KeywordRepository = {
      findAll: jest.fn().mockResolvedValue([
        Keyword.reconstitute({
          id: 'kw-1',
          phrase: 'etf',
          caseSensitive: false,
          sourceChannelIds: [],
          templateId: null,
          enabled: true,
          requireMedia: false,
          andGroupId: null,
          matchMode: 'substring',
          createdAt: new Date(),
        }),
      ]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as KeywordRepository;
    const blacklistRepo: BlacklistPhraseRepository = {
      findAll: jest.fn().mockResolvedValue([
        BlacklistPhrase.reconstitute({
          id: 'bl-1',
          phrase: 'scam',
          caseSensitive: false,
          matchMode: 'substring',
          andGroupId: null,
          requireMedia: false,
          sourceChannelIds: [],
          enabled: true,
          createdAt: new Date(),
        }),
      ]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as BlacklistPhraseRepository;
    const filters: ChannelFilterRepository = {
      findFiltersByChannelId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };
    const feed = {
      fetchRecentMessages: jest.fn().mockResolvedValue(rows),
    } as unknown as FeedPort;
    const tracked = new Map<string, PublisherQueueEntry>();
    const queue = {
      findTracked: jest
        .fn()
        .mockImplementation(
          async (channelId: string, messageId: number) =>
            tracked.get(`${channelId}:${messageId}`) ?? null,
        ),
    } as unknown as QueueManager;
    const store = new MessageMatchVerdictStore();
    const useCase = new MessageMatchStatusUseCase(
      feed,
      queue,
      new EvaluateMessageMatchUseCase(
        new MatchingEvaluator(),
        keywordRepo,
        blacklistRepo,
        filters,
      ),
      keywordRepo,
      blacklistRepo,
      store,
    );
    return { useCase, store, tracked };
  }

  it('badges a matched unqueued message as Pending to publish', async () => {
    const { useCase, store } = await build([
      row('-1001', 7, 'spot etf inflows'),
    ]);
    const status = await useCase.getStatus('-1001', 7);
    expect(status.ingested).toBe(true);
    expect(status.matched).toBe(true);
    expect(status.blocked).toBe(false);
    expect(status.badge).toBe('Pending to publish');
    expect(status.matchedKeywords).toEqual([{ id: 'kw-1', phrase: 'etf' }]);
    expect(status.queue).toBeNull();
    expect(status.reasons.length).toBeGreaterThan(0);
    expect(store.find('-1001', 7)).not.toBeNull();
  });

  it('badges a blacklist-blocked message as Blocked by with the phrase', async () => {
    const { useCase } = await build([row('-1001', 8, 'spot etf scam alert')]);
    const status = await useCase.getStatus('-1001', 8);
    expect(status.matched).toBe(false);
    expect(status.blocked).toBe(true);
    expect(status.blockedBy).toEqual([{ id: 'bl-1', phrase: 'scam' }]);
    expect(status.badge.startsWith('Blocked by')).toBe(true);
    expect(status.badge).toContain('scam');
  });

  it('badges an unmatched message as Not matched', async () => {
    const { useCase } = await build([row('-1001', 9, 'quiet markets today')]);
    const status = await useCase.getStatus('-1001', 9);
    expect(status.ingested).toBe(true);
    expect(status.matched).toBe(false);
    expect(status.blocked).toBe(false);
    expect(status.badge).toBe('Not matched');
  });

  it('badges a published queue entry as Published', async () => {
    const { useCase, tracked } = await build([
      row('-1001', 10, 'spot etf inflows'),
    ]);
    const entry = PublisherQueueEntry.create({
      contentType: 'crypto-news',
      channelId: '-1001',
      messageId: 10,
      rawContent: 'spot etf inflows',
      matchedKeywordIds: ['kw-1'],
    });
    entry.markPublished('777');
    tracked.set('-1001:10', entry);
    const status = await useCase.getStatus('-1001', 10);
    expect(status.badge).toBe('Published');
    expect(status.queue?.status).toBe('PUBLISHED');
    expect(status.queue?.telegramMessageId).toBe('777');
  });

  it('badges a dedup-blocked entry as Blocked by with the queue reason', async () => {
    const { useCase, tracked } = await build([]);
    const entry = PublisherQueueEntry.create({
      contentType: 'crypto-news',
      channelId: '-1001',
      messageId: 11,
      rawContent: 'spot etf inflows',
      matchedKeywordIds: ['kw-1'],
    });
    entry.markBlocked('Duplicate content of queue');
    tracked.set('-1001:11', entry);
    const status = await useCase.getStatus('-1001', 11);
    expect(status.ingested).toBe(false);
    expect(status.badge.startsWith('Blocked by')).toBe(true);
    expect(status.badge).toContain('Duplicate content of queue');
    expect(status.queue?.blockedReason).toBe('Duplicate content of queue');
  });

  it('badges an unknown message as Not found', async () => {
    const { useCase } = await build([]);
    const status = await useCase.getStatus('-1001', 99);
    expect(status.ingested).toBe(false);
    expect(status.matched).toBe(false);
    expect(status.queue).toBeNull();
    expect(status.badge).toBe('Not found');
    expect(status.reasons).not.toContain('no keyword matched');
  });
});
