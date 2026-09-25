import { toFeedSource } from './feed-source.dto';

describe('feed-source.dto', () => {
  it('maps a feed row with tolerant keys', () => {
    expect(
      toFeedSource({
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
    expect(toFeedSource({ title: 'No channel' })).toBeNull();
  });

  it('defaults the type when absent', () => {
    expect(toFeedSource({ channelId: '-1001' })?.type).toBe(
      'crypto-news',
    );
  });
});
