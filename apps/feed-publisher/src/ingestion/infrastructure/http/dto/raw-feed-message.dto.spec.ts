import {
  isFeedData,
  isFeedFrame,
  toFeedMessage,
} from './raw-feed-message.dto';

describe('raw-feed-message.dto', () => {
  it('maps a feed row with tolerant keys', () => {
    expect(
      toFeedMessage({
        channel_id: '-1001',
        message_id: 7,
        content: 'markets rally',
        ingested_at: '2026-09-25T00:00:00.000Z',
        message_type: 'crypto-news',
      }),
    ).toEqual({
      channelId: '-1001',
      messageId: 7,
      text: 'markets rally',
      occurredAt: '2026-09-25T00:00:00.000Z',
      messageType: 'crypto-news',
    });
  });

  it('returns null without channel or message id', () => {
    expect(toFeedMessage({ text: 'no keys' })).toBeNull();
    expect(toFeedMessage({ channelId: '-1001' })).toBeNull();
  });

  it('accepts only feed-marked data', () => {
    expect(isFeedData({ messageType: 'crypto-news' })).toBe(true);
    expect(isFeedData({ message_type: 'crypto-news' })).toBe(true);
    expect(isFeedData({ messageType: 'digest' })).toBe(false);
    expect(isFeedData(null)).toBe(false);
  });

  it('accepts only message:telegram frames with feed data', () => {
    expect(
      isFeedFrame({
        type: 'message:telegram',
        data: { messageType: 'crypto-news' },
      }),
    ).toBe(true);
    expect(
      isFeedFrame({
        type: 'message:telegram',
        data: { messageType: 'digest' },
      }),
    ).toBe(false);
    expect(isFeedFrame({ type: 'health:ping' })).toBe(false);
  });
});
