import { toCryptoNewsSource } from './crypto-news-source.dto';

describe('crypto-news-source.dto', () => {
  it('maps a feed row with tolerant keys', () => {
    expect(
      toCryptoNewsSource({
        channel_id: '-1001',
        title: 'Markets Daily',
        username: '@marketsdaily',
        type: 'crypto-news',
      }),
    ).toEqual({
      channelId: '-1001',
      title: 'Markets Daily',
      handle: '@marketsdaily',
      type: 'crypto-news',
    });
  });

  it('returns null without a channel id', () => {
    expect(toCryptoNewsSource({ title: 'No channel' })).toBeNull();
  });

  it('defaults the type when absent', () => {
    expect(toCryptoNewsSource({ channelId: '-1001' })?.type).toBe(
      'crypto-news',
    );
  });
});
