import { toKolSource } from './dto/kol-source.dto';

describe('toKolSource avatarUrl (P19 projection)', () => {
  it('keeps avatarUrl from the feed projection', () => {
    expect(
      toKolSource({
        channelId: '-1001',
        title: 'Alpha',
        handle: 'alpha',
        type: 'kol',
        avatarUrl: '/api/kol-avatar/-1001',
      }),
    ).toMatchObject({
      channelId: '-1001',
      avatarUrl: '/api/kol-avatar/-1001',
    });
  });

  it('accepts avatar_url snake_case', () => {
    expect(
      toKolSource({ channelId: '-1002', avatar_url: '/api/kol-avatar/-1002' }),
    ).toMatchObject({ avatarUrl: '/api/kol-avatar/-1002' });
  });

  it('defaults avatarUrl to null when the projection lacks it', () => {
    expect(toKolSource({ channelId: '-1003' })).toMatchObject({
      avatarUrl: null,
    });
  });
});
