import {
  isCryptoNewsData,
  isCryptoNewsFrame,
  toCryptoNewsMessage,
} from './raw-crypto-news-message.dto';

describe('raw-crypto-news-message.dto', () => {
  it('maps a feed row with tolerant keys', () => {
    expect(
      toCryptoNewsMessage({
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
    expect(toCryptoNewsMessage({ text: 'no keys' })).toBeNull();
    expect(toCryptoNewsMessage({ channelId: '-1001' })).toBeNull();
  });

  it('accepts only crypto-news-marked data', () => {
    expect(isCryptoNewsData({ messageType: 'crypto-news' })).toBe(true);
    expect(isCryptoNewsData({ message_type: 'crypto-news' })).toBe(true);
    expect(isCryptoNewsData({ messageType: 'digest' })).toBe(false);
    expect(isCryptoNewsData(null)).toBe(false);
  });

  it('accepts only message:telegram frames with crypto-news data', () => {
    expect(
      isCryptoNewsFrame({
        type: 'message:telegram',
        data: { messageType: 'crypto-news' },
      }),
    ).toBe(true);
    expect(
      isCryptoNewsFrame({
        type: 'message:telegram',
        data: { messageType: 'digest' },
      }),
    ).toBe(false);
    expect(isCryptoNewsFrame({ type: 'health:ping' })).toBe(false);
  });
});
