import { FilteredCryptoNewsService } from './filtered-crypto-news.service';
import type { CryptoNewsMessageDto } from '../../infrastructure/http/crypto-news-ingestion-client.service';
import { Keyword } from '../../../crypto-news-publisher/domain/entities/keyword.entity';

function rawMessage(
  overrides: Partial<CryptoNewsMessageDto> = {},
): CryptoNewsMessageDto {
  return {
    id: 'uuid-1',
    channelId: '-1001',
    messageId: 1,
    title: null,
    content: 'plain text',
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
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

function photo(channelId: string, messageId: number, index: number) {
  return {
    id: `media-${messageId}-${index}`,
    messageId: `uuid-${messageId}`,
    index,
    type: 'photo' as const,
    url: `/ingestion-api/media/${channelId}/${messageId}/${index}`,
    mimeType: 'image/jpeg',
    fileSize: 100,
    createdAt: new Date().toISOString(),
  };
}

function makeService(
  rawBatch: CryptoNewsMessageDto[],
  phrases: string[] = ['revolut'],
) {
  const ingestionClient = {
    fetchRecentMessages: jest.fn().mockResolvedValue(rawBatch),
  };
  const contentFilter = {
    filterTitleAndContent: jest
      .fn()
      .mockImplementation((title: string | null, content: string) => ({
        title,
        content,
      })),
  };
  const channelFilters = {
    findFiltersByChannelId: jest.fn().mockResolvedValue([]),
  };
  const keywordRepo = {
    findAll: jest
      .fn()
      .mockResolvedValue(phrases.map((phrase) => Keyword.create({ phrase }))),
  };
  const blacklistRepo = { findAll: jest.fn().mockResolvedValue([]) };
  const service = new FilteredCryptoNewsService(
    ingestionClient as never,
    contentFilter as never,
    channelFilters,
    keywordRepo as never,
    blacklistRepo as never,
  );
  return service;
}

describe('FilteredCryptoNewsService — album merge', () => {
  it('merges sibling photos into the matched entry (one album = one entry)', async () => {
    const batch = [
      rawMessage({
        id: 'uuid-a',
        messageId: 101,
        content: 'Revolut news with photo',
        groupedId: 'g1',
        media: [photo('-1001', 101, 0)],
      }),
      rawMessage({
        id: 'uuid-b',
        messageId: 102,
        content: '',
        groupedId: 'g1',
        media: [photo('-1001', 102, 0)],
      }),
    ];
    const service = makeService(batch);

    const matched = await service.getMatchingMessages(50);

    expect(matched).toHaveLength(1);
    expect(matched[0].messageId).toBe(101);
    expect(matched[0].groupedId).toBe('g1');
    expect(matched[0].media).toHaveLength(2);
    expect(matched[0].media.map((m) => m.index)).toEqual([0, 1]);
    expect(matched[0].media.map((m) => m.ownerMessageId)).toEqual([101, 102]);
  });

  it('collapses groups when several siblings match (no duplicate posts)', async () => {
    const batch = [
      rawMessage({
        id: 'uuid-a',
        messageId: 101,
        content: 'Revolut part one',
        groupedId: 'g1',
        media: [photo('-1001', 101, 0)],
      }),
      rawMessage({
        id: 'uuid-b',
        messageId: 102,
        content: 'Revolut part two',
        groupedId: 'g1',
        media: [photo('-1001', 102, 0)],
      }),
    ];
    const service = makeService(batch);

    const matched = await service.getMatchingMessages(50);

    expect(matched).toHaveLength(1);
    expect(matched[0].messageId).toBe(101);
    expect(matched[0].media).toHaveLength(2);
  });

  it('passes ungrouped messages through untouched', async () => {
    const batch = [
      rawMessage({
        messageId: 201,
        content: 'Revolut solo',
        groupedId: null,
        media: [photo('-1001', 201, 0)],
      }),
    ];
    const service = makeService(batch);

    const matched = await service.getMatchingMessages(50);

    expect(matched).toHaveLength(1);
    expect(matched[0].media).toHaveLength(1);
    expect(matched[0].media[0].ownerMessageId).toBeUndefined();
  });

  it('returns empty when nothing matches', async () => {
    const batch = [rawMessage({ messageId: 301, content: 'weather today' })];
    const service = makeService(batch);

    await expect(service.getMatchingMessages(50)).resolves.toEqual([]);
  });
});
