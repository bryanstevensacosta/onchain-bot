import { BadRequestException } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { encodeFeedCursor } from 'feed/feed-cursor';

/**
 * Cursor pagination over `GET /api/feed/messages` (history reads only;
 * the SSE realtime path is untouched).
 *
 * Backward compatible: `limit`/`type` behave as before, the response gains
 * an additive `nextCursor` field (`null` at the end). Old clients that
 * ignore it see the same first page as before.
 */
describe('FeedController (cursor pagination over messages)', () => {
  const messageRepo: any = {
    findRecent: jest.fn(),
    findRecentPaged: jest.fn(),
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

  it('first page without cursor passes undefined cursor and returns nextCursor', async () => {
    messageRepo.findRecentPaged.mockResolvedValue({
      rows: [feedRow()],
      nextCursor: 'opaque-next',
    });

    const res = await controller.getRecentMessages(50, undefined, undefined);

    expect(messageRepo.findRecentPaged).toHaveBeenCalledWith(
      50,
      undefined,
      undefined,
    );
    expect(res.count).toBe(1);
    expect(res.nextCursor).toBe('opaque-next');
    expect(res.data[0].formattingEntities).toEqual([
      { type: 'url', offset: 0, length: 10 },
    ]);
  });

  it('second page decodes the cursor and forwards the keyset to the repo', async () => {
    const last = feedRow({
      id: '22222222-2222-2222-2222-222222222222',
      publishedAt: new Date('2026-09-21T09:00:00Z'),
    });
    const cursor = encodeFeedCursor(last.publishedAt, last.id);
    messageRepo.findRecentPaged.mockResolvedValue({
      rows: [feedRow()],
      nextCursor: null,
    });

    const res = await controller.getRecentMessages(50, undefined, cursor);

    expect(messageRepo.findRecentPaged).toHaveBeenCalledWith(50, undefined, {
      publishedAt: last.publishedAt,
      id: last.id,
    });
    expect(res.nextCursor).toBeNull();
  });

  it('keeps limit/type behavior with cursor (cap 200, type filter first)', async () => {
    messageRepo.findRecentPaged.mockResolvedValue({
      rows: [],
      nextCursor: null,
    });
    const cursor = encodeFeedCursor(
      new Date('2026-09-21T09:00:00Z'),
      'some-id',
    );

    await controller.getRecentMessages(9999, 'kol', cursor);

    expect(messageRepo.findRecentPaged).toHaveBeenCalledWith(
      200,
      'kol',
      expect.objectContaining({ id: 'some-id' }),
    );
  });

  it('rejects an invalid cursor with 400 without hitting the repo', async () => {
    await expect(
      controller.getRecentMessages(50, undefined, 'not-a-cursor'),
    ).rejects.toThrow(BadRequestException);
    expect(messageRepo.findRecentPaged).not.toHaveBeenCalled();
  });

  it('chained nextCursor decodes to the last row of the page', async () => {
    const rows = [
      feedRow({
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        publishedAt: new Date('2026-09-21T11:00:00Z'),
      }),
      feedRow({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        publishedAt: new Date('2026-09-21T10:00:00Z'),
      }),
    ];
    messageRepo.findRecentPaged.mockResolvedValue({
      rows,
      nextCursor: encodeFeedCursor(rows[1].publishedAt, rows[1].id),
    });

    const res = await controller.getRecentMessages(2);

    expect(res.nextCursor).toBe(
      encodeFeedCursor(rows[1].publishedAt, rows[1].id),
    );
  });
});
