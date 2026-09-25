import { FilteredCryptoNewsService } from './filtered-crypto-news.service';
import type { CryptoNewsFeedPort } from '../../domain/ports/crypto-news-feed.port';
import type { ChannelFilterRepository } from '../../../filters/application/ports/channel-filter.repository';
import type { KeywordRepository } from '../../../keywords/application/ports/keyword.repository';
import type { BlacklistPhraseRepository } from '../../../keywords/application/ports/blacklist-phrase.repository';
import { Keyword } from '../../../keywords/domain/keyword.entity';
import { BlacklistPhrase } from '../../../keywords/domain/blacklist-phrase.entity';

describe('FilteredCryptoNewsService', () => {
  function build(feed: CryptoNewsFeedPort['fetchRecentMessages']) {
    const feedPort: CryptoNewsFeedPort = { fetchRecentMessages: feed };
    const filters: ChannelFilterRepository = {
      findFiltersByChannelId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };
    const keywords: KeywordRepository = {
      findAll: jest
        .fn()
        .mockResolvedValue([
          Keyword.create({ phrase: 'etf', matchMode: 'substring' }),
        ]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const blacklist: BlacklistPhraseRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findEnabled: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };
    return new FilteredCryptoNewsService(
      feedPort,
      filters,
      keywords,
      blacklist,
    );
  }

  function row(
    channelId: string,
    messageId: number,
    content: string,
    messageType: string,
  ) {
    return {
      channelId,
      messageId,
      title: null,
      content,
      publishedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      media: [],
      groupedId: null,
      messageType,
    };
  }

  it('keeps crypto-news rows and drops foreign feed types client-side', async () => {
    const svc = build(async () => [
      row('-1001', 1, 'etf inflows', 'crypto-news'),
      { ...row('-1001', 2, 'etf inflows', 'other'), messageType: 'other' },
    ]);
    const out = await svc.getMatchingMessages(50);
    expect(out.map((m) => m.messageId)).toEqual([1]);
  });

  it('returns empty when the feed throws (fail-closed batch, no throw)', async () => {
    const svc = build(async () => {
      throw new Error('feed down');
    });
    await expect(svc.getMatchingMessages(10)).resolves.toEqual([]);
  });

  it('excludes blacklisted content', async () => {
    const svc = build(async () => [
      row('-1001', 7, 'etf inflows', 'crypto-news'),
    ]);
    (svc as unknown as { blacklistRepo: { findAll: jest.Mock } })[
      'blacklistRepo'
    ].findAll.mockResolvedValue([
      BlacklistPhrase.create({ phrase: 'etf', matchMode: 'substring' }),
    ]);
    await expect(svc.getMatchingMessages(10)).resolves.toEqual([]);
  });
});
