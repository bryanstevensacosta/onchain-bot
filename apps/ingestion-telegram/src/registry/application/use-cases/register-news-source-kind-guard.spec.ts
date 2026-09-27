import { RegisterNewsSourceUseCase } from './register-news-source.use-case';

/**
 * P57 channel/group-only guard on register + batch (FAILING-FIRST).
 *
 * A bot/user id must be REJECTED with an explicit 400 — never stored
 * as a fake `-100…` "channel".
 */
describe('RegisterNewsSourceUseCase kind guard', () => {
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

  function listenerFor(kind: string, isBot = false) {
    return {
      resolveChannelMetadata: jest.fn(async () => ({
        peerId: '1',
        title: 'Some entity',
        handle: 'someentity',
        kind,
        isBot,
      })),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('execute stores entityKind/isBot for a channel', async () => {
    const repo = fakeRepo();
    const useCase = new RegisterNewsSourceUseCase(
      repo as any,
      listenerFor('channel') as any,
    );
    const out = await useCase.execute({ channelId: '123', title: 'T' });
    expect(out.channelId).toBe('-100123');
    expect(repo.store.get('-100123').entityKind).toBe('channel');
  });

  it.each(['user', 'bot', 'unknown'] as const)(
    'execute rejects kind=%s with explicit 400 and writes nothing',
    async (kind) => {
      const repo = fakeRepo();
      const useCase = new RegisterNewsSourceUseCase(
        repo as any,
        listenerFor(kind, kind === 'bot') as any,
      );
      await expect(
        useCase.execute({ channelId: '424242', title: 'Not a channel' }),
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.store.size).toBe(0);
    },
  );

  it('executeBatch rejects a batch containing a bot with 400 (all-or-nothing)', async () => {
    const repo = fakeRepo();
    const channelListener = listenerFor('channel') as any;
    const botListener = listenerFor('bot', true) as any;
    const resolvingListener = {
      resolveChannelMetadata: jest.fn(async (id: string) =>
        id.includes('999')
          ? botListener.resolveChannelMetadata(id)
          : channelListener.resolveChannelMetadata(id),
      ),
    };
    const useCase = new RegisterNewsSourceUseCase(
      repo as any,
      resolvingListener as any,
    );
    await expect(
      useCase.executeBatch({
        sources: [
          { channelId: '-1001', title: 'News' },
          { channelId: '999', title: 'Bot' },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.store.size).toBe(0);
  });

  it('execute probes the raw id form too: bot via stripped id still 400s (live -100 bypass regression)', async () => {
    const repo = fakeRepo();
    const prefixBlindListener = {
      resolveChannelMetadata: jest.fn(async (id: string) => {
        if (id.startsWith('-100')) {
          throw new Error('Could not find the input entity');
        }
        return {
          peerId: '93372553',
          title: 'BotFather',
          handle: 'BotFather',
          kind: 'bot',
          isBot: true,
        };
      }),
    };
    const useCase = new RegisterNewsSourceUseCase(
      repo as any,
      prefixBlindListener as any,
    );
    await expect(
      useCase.execute({ channelId: '93372553', title: 'BotFather probe' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.store.size).toBe(0);
  });

  it('execute stays fail-open when MTProto resolution throws (title given)', async () => {
    const repo = fakeRepo();
    const failing = {
      resolveChannelMetadata: jest.fn(async () => {
        throw new Error('FLOOD_WAIT_30');
      }),
    };
    const useCase = new RegisterNewsSourceUseCase(repo as any, failing as any);
    const out = await useCase.execute({ channelId: '123', title: 'T' });
    expect(out.channelId).toBe('-100123');
  });
});
