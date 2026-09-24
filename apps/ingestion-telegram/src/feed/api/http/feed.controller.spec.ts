import { BadRequestException } from '@nestjs/common';
import { FeedController, parseMessageEntities } from './feed.controller';

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

describe('FeedController (feed message reads + stats)', () => {
  const messageRepo: any = {
    findRecent: jest.fn(),
    findByChannelId: jest.fn(),
    count: jest.fn(),
  };
  const sourceRepo: any = { findAll: jest.fn(), findAllActive: jest.fn() };
  const controller = new FeedController(messageRepo, sourceRepo);

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

  it('getRecentMessages without type passes undefined (mixed, legacy behavior)', async () => {
    messageRepo.findRecent.mockResolvedValue([feedRow()]);

    await controller.getRecentMessages(50);

    expect(messageRepo.findRecent).toHaveBeenCalledWith(50, undefined);
  });

  it('getRecentMessages with type=kol filters to kol only', async () => {
    messageRepo.findRecent.mockResolvedValue([feedRow({ type: 'kol' })]);

    const res = await controller.getRecentMessages(50, 'kol');

    expect(messageRepo.findRecent).toHaveBeenCalledWith(50, 'kol');
    expect(res.count).toBe(1);
    expect(res.data[0].type).toBe('kol');
  });

  it('getRecentMessages with type=crypto-news filters to news only', async () => {
    messageRepo.findRecent.mockResolvedValue([feedRow()]);

    const res = await controller.getRecentMessages(50, 'crypto-news');

    expect(messageRepo.findRecent).toHaveBeenCalledWith(50, 'crypto-news');
    expect(res.data[0].type).toBe('crypto-news');
  });

  it('getRecentMessages caps limit at 200 AFTER type filtering', async () => {
    messageRepo.findRecent.mockResolvedValue([]);

    await controller.getRecentMessages(9999, 'crypto-news');

    expect(messageRepo.findRecent).toHaveBeenCalledWith(200, 'crypto-news');
  });

  it('getRecentMessages rejects invalid type with 400', async () => {
    await expect(controller.getRecentMessages(50, 'kol-news')).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.getRecentMessages(50, 'kol-news')).rejects.toThrow(
      'type must be one of kol, crypto-news',
    );
    expect(messageRepo.findRecent).not.toHaveBeenCalled();
  });

  it("getRecentMessages maps '' entities rows to []", async () => {
    messageRepo.findRecent.mockResolvedValue([
      feedRow({ messageEntities: '' }),
    ]);

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

  it('getMessagesByChannel caps limit at 200', async () => {
    messageRepo.findByChannelId.mockResolvedValue([]);

    await controller.getMessagesByChannel('-1001', 9999);

    expect(messageRepo.findByChannelId).toHaveBeenCalledWith('-1001', 200);
  });

  it('getStats returns message/source counts', async () => {
    messageRepo.count.mockResolvedValue(7);
    sourceRepo.findAll.mockResolvedValue([{}, {}, {}]);
    sourceRepo.findAllActive.mockResolvedValue([{}, {}]);

    const res = await controller.getStats();

    expect(res).toEqual({
      totalMessages: 7,
      totalSources: 3,
      activeSources: 2,
    });
  });
});
