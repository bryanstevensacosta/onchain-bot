import { MtprotoAvatarPhotoAdapter } from './mtproto-avatar-photo.adapter';

describe('MtprotoAvatarPhotoAdapter (P29 guarded, null-safe)', () => {
  it('returns null without a client (no session in tests/dev)', async () => {
    const adapter = new MtprotoAvatarPhotoAdapter(
      { getClient: () => null } as never,
      {} as never,
      {} as never,
    );
    await expect(adapter.fetchChannelPhoto('-1001')).resolves.toBe(null);
  });

  it('returns null when MTProto resolution fails (placeholder path)', async () => {
    const client = {};
    const adapter = new MtprotoAvatarPhotoAdapter(
      { getClient: () => client } as never,
      {
        resolvePeerAsChannel: async () => {
          throw new Error('CHANNEL_PRIVATE');
        },
      } as never,
      {
        withRetry: async (_label: string, fn: () => Promise<Buffer | null>) =>
          fn(),
      } as never,
    );
    await expect(adapter.fetchChannelPhoto('-1002')).resolves.toBe(null);
  });

  it('routes the download through the flood-wait guard and returns bytes', async () => {
    const client = {
      downloadProfilePhoto: async () => Buffer.from('photo-bytes'),
    };
    const seen: string[] = [];
    const adapter = new MtprotoAvatarPhotoAdapter(
      { getClient: () => client } as never,
      {
        resolvePeerAsChannel: async () => ({ id: '-1003' }),
      } as never,
      {
        withRetry: async (_label: string, fn: () => Promise<Buffer | null>) => {
          seen.push(_label);
          return fn();
        },
      } as never,
    );
    const photo = await adapter.fetchChannelPhoto('-1003');
    expect(photo).toEqual(Buffer.from('photo-bytes'));
    expect(seen).toEqual(['kol-avatar']);
  });

  it('returns null when the channel has no profile photo', async () => {
    const client = {
      downloadProfilePhoto: async () => Buffer.alloc(0),
    };
    const adapter = new MtprotoAvatarPhotoAdapter(
      { getClient: () => client } as never,
      {
        resolvePeerAsChannel: async () => ({ id: '-1004' }),
      } as never,
      {
        withRetry: async (_label: string, fn: () => Promise<Buffer | null>) =>
          fn(),
      } as never,
    );
    await expect(adapter.fetchChannelPhoto('-1004')).resolves.toBe(null);
  });
});
