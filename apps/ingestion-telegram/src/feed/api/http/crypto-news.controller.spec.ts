/**
 * Specs for the feed message API reader (`CryptoNewsController`, item 3).
 *
 * Covers (item 3 acceptance):
 * - `''` entities → `'[]'` (legacy TEXT rows never abort the API)
 * - string-vs-array `message_entities` reader fallback matrix
 * - `type` discriminator passthrough (`crypto-news` union member)
 *
 * Reader semantics are UNCHANGED from the pre-rename controller (rename +
 * `type` only); these specs lock that contract.
 */
import { CryptoNewsController } from './crypto-news.controller';
import { parseMessageEntities } from './crypto-news.controller';

describe('parseMessageEntities (string-vs-array reader fallback)', () => {
  it('returns undefined for null/undefined (column NULL)', () => {
    expect(parseMessageEntities(null)).toBeUndefined();
    expect(parseMessageEntities(undefined)).toBeUndefined();
  });

  it("maps legacy '' TEXT rows to [] (never abort)", () => {
    expect(parseMessageEntities('')).toEqual([]);
  });

  it('maps unparseable strings to [] (never abort)', () => {
    expect(parseMessageEntities('not-json{{{')).toEqual([]);
    expect(parseMessageEntities('   ')).toEqual([]);
  });

  it('parses pre-migration JSON TEXT rows', () => {
    expect(
      parseMessageEntities('[{"type":"url","offset":0,"length":10}]'),
    ).toEqual([{ type: 'url', offset: 0, length: 10 }]);
    expect(parseMessageEntities('[]')).toEqual([]);
  });

  it('passes post-migration jsonb arrays through', () => {
    const arr = [{ type: 'bold', offset: 0, length: 5 }];
    expect(parseMessageEntities(arr)).toBe(arr);
  });
});

describe('CryptoNewsController (feed message transform)', () => {
  const messageRepo: any = {
    findRecent: jest.fn(),
    findByChannelId: jest.fn(),
    count: jest.fn(),
  };
  const sourceRepo: any = { findAll: jest.fn(), findAllActive: jest.fn() };
  const registerSourceUseCase: any = { execute: jest.fn() };
  const controller = new CryptoNewsController(
    messageRepo,
    sourceRepo,
    registerSourceUseCase,
  );

  beforeEach(() => jest.clearAllMocks());

  function feedRow(overrides: Record<string, unknown> = {}) {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      channelId: '-1001',
      messageId: 3,
      type: 'crypto-news',
      title: null,
      content: 'hello',
      publishedAt: new Date('2026-09-21T10:00:00Z'),
      ingestedAt: new Date('2026-09-21T10:05:00Z'),
      messageEntities: [{ type: 'url', offset: 0, length: 10 }],
      groupedId: null,
      media: [],
      ...overrides,
    };
  }

  it('getRecentMessages exposes formattingEntities + type passthrough', async () => {
    messageRepo.findRecent.mockResolvedValue([feedRow()]);

    const res = await controller.getRecentMessages(50);

    expect(res.count).toBe(1);
    expect(res.data[0].formattingEntities).toEqual([
      { type: 'url', offset: 0, length: 10 },
    ]);
    expect(res.data[0].type).toBe('crypto-news');
    expect(res.data[0].messageEntities).toBeUndefined();
  });

  it("getRecentMessages maps '' entities rows to []", async () => {
    messageRepo.findRecent.mockResolvedValue([feedRow({ messageEntities: '' })]);

    const res = await controller.getRecentMessages(50);

    expect(res.data[0].formattingEntities).toEqual([]);
  });

  it('getMessagesByChannel maps NULL entities rows to undefined', async () => {
    messageRepo.findByChannelId.mockResolvedValue([
      feedRow({ messageEntities: null }),
    ]);

    const res = await controller.getMessagesByChannel('-1001', 50);

    expect(res).toHaveLength(1);
    expect(res[0].formattingEntities).toBeUndefined();
  });
});
