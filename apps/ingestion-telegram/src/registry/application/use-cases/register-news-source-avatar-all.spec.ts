import { RegisterNewsSourceUseCase } from './register-news-source.use-case';

/**
 * Central todo 12 (P57): avatar for ALL ids + t.me url on sources.
 *
 * FAILING-FIRST: `kickProfilePhoto` still filters kol-only and outputs
 * carry no `url` — RED until the avatar-total work lands.
 */
describe('RegisterNewsSourceUseCase avatar-total + url (central todo 12)', () => {
  function fakeRepo(rows: Record<string, any> = {}) {
    const store = new Map<string, any>(Object.entries(rows));
    return {
      store,
      findByChannelId: jest.fn(async (id: string) => store.get(id) ?? null),
      create: jest.fn(
        (
          channelId: string,
          title: string,
          handle?: string,
          type = 'crypto-news',
          meta?: { entityKind?: string | null; isBot?: boolean | null },
        ) => ({
          channelId,
          title,
          handle: handle ?? null,
          type,
          isActive: true,
          lifecycleStatus: 'ACTIVE',
          lastIngestedAt: null,
          entityKind: meta?.entityKind ?? null,
          isBot: meta?.isBot ?? null,
          url: null as string | null,
          addedAt: new Date('2026-09-21T10:00:00Z'),
        }),
      ),
      save: jest.fn(async (s: any) => {
        store.set(s.channelId, s);
        return s;
      }),
      delete: jest.fn(async (id: string) => {
        store.delete(id);
      }),
    };
  }

  function listenerFor(kind: string) {
    return {
      resolveChannelMetadata: jest.fn(async (id: string) => ({
        peerId: id,
        title: 'Some channel',
        handle: 'somehandle',
        kind,
        isBot: false,
      })),
    };
  }

  function makeProfilePhotos() {
    const calls: Array<{ channelId: string; handle?: string | null }> = [];
    return {
      calls,
      fetchOnce: jest.fn(async (channelId: string, handle?: string | null) => {
        calls.push({ channelId, handle: handle ?? null });
        return 'fetched' as const;
      }),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('execute fetches the avatar for feed (crypto-news) sources too', async () => {
    const repo = fakeRepo();
    const profilePhotos = makeProfilePhotos();
    const useCase = new RegisterNewsSourceUseCase(
      repo as any,
      listenerFor('channel') as any,
      profilePhotos as never,
    );
    // Let the fire-and-forget avatar fetch settle.
    const out = await useCase.execute({ channelId: '123', title: 'News' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(out.type).toBe('crypto-news');
    expect(profilePhotos.fetchOnce).toHaveBeenCalledWith(
      '-100123',
      expect.anything(),
    );
  });

  it('execute exposes the t.me url', async () => {
    const repo = fakeRepo();
    const profilePhotos = makeProfilePhotos();
    const useCase = new RegisterNewsSourceUseCase(
      repo as any,
      listenerFor('channel') as any,
      profilePhotos as never,
    );
    const out = await useCase.execute({
      channelId: '123',
      title: 'News',
      handle: 'somehandle',
    });
    expect(out.url).toBe('https://t.me/somehandle');
  });

  it('executeBatch stores the t.me url on created rows', async () => {
    const repo = fakeRepo();
    const profilePhotos = makeProfilePhotos();
    const useCase = new RegisterNewsSourceUseCase(
      repo as any,
      listenerFor('channel') as any,
      profilePhotos as never,
    );
    const out = await useCase.executeBatch({
      sources: [{ channelId: '-1001', title: 'News', handle: 'newsdaily' }],
    });
    expect(out.results[0].url).toBe('https://t.me/newsdaily');
    expect(repo.store.get('-1001').url).toBe('https://t.me/newsdaily');
  });
});
