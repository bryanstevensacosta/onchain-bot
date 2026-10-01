import { CoreModule } from './core.module';

/**
 * Item 7 — local channel registry, gap-15 (no-restart add) + cold-start.
 *
 * Gap 15 root cause: the 5-min refresh re-entered the single-listener
 * subscribe() ("already running" throw). Fix: subscribe() is called EXACTLY
 * ONCE per process; refreshes only swap the peer snapshot via
 * updateSubscribedChannels(). Cold-start: an empty registry yields [] and
 * still pushes the snapshot; the 0 → N transition starts the listener.
 */
describe('CoreModule - local registry, no-restart refresh, cold-start', () => {
  const flush = async (n = 3) => {
    for (let i = 0; i < n; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  function createHarness(
    initialSources: Array<{ channelId: string; title: string; type: string }>,
  ) {
    let sources = initialSources;
    const feedSourceRepo = {
      findAllActiveWithTypes: jest.fn(async () => sources),
    };
    const yielded: Array<Record<string, unknown>> = [];
    let subscribeCalls = 0;
    const listener = {
      // Single-listener constraint: 2nd subscribe() throws (gap-15 mechanism).
      subscribe: jest.fn(async function* () {
        subscribeCalls += 1;
        if (subscribeCalls > 1) {
          throw new Error('Telegram listener already running');
        }
        for (const msg of yielded) {
          yield msg;
        }
      }),
      updateSubscribedChannels: jest.fn(),
    };
    const coordinator = { route: jest.fn(async () => undefined) };
    const sseBroadcast = { broadcast: jest.fn(async () => undefined) };

    const mod = new CoreModule(
      feedSourceRepo as any,
      listener as any,
      coordinator as any,
      sseBroadcast as any,
    );

    return {
      mod,
      feedSourceRepo,
      listener,
      coordinator,
      sseBroadcast,
      yielded,
      subscribeCalls: () => subscribeCalls,
      setSources: (
        next: Array<{ channelId: string; title: string; type: string }>,
      ) => {
        sources = next;
      },
      refresh: () => (mod as any).refreshChannels() as Promise<void>,
      stopTimer: () => {
        const id = (mod as any).refreshIntervalId as NodeJS.Timeout | undefined;
        if (id) {
          clearInterval(id);
        }
      },
    };
  }

  const rawMsg = (peerId: string, messageId: number) => ({
    peerId,
    messageId,
    text: 'alpha',
    occurredAt: new Date(),
    media: [],
  });

  it('cold-start: empty DB yields [] + pushes snapshot, no crash', async () => {
    const h = createHarness([]);

    await expect(h.refresh()).resolves.not.toThrow();

    expect((h.mod as any).currentChannelIds).toEqual([]);
    expect(h.listener.updateSubscribedChannels).toHaveBeenCalledWith([]);
    expect((h.mod as any).listening).toBe(false);
  });

  it('cold-start recovery: 0 → N starts the listener without restart', async () => {
    const h = createHarness([]);
    await h.refresh();

    h.setSources([
      { channelId: '-1001', title: 'KOL one', type: 'kol' },
      { channelId: '-1002', title: 'News two', type: 'crypto-news' },
    ]);
    h.yielded.push(rawMsg('-1001', 1), rawMsg('-1002', 2));

    await h.refresh();
    await flush();

    expect(h.subscribeCalls()).toBe(1);
    expect(h.listener.subscribe).toHaveBeenCalledWith(['-1001', '-1002']);
    // Classified by registry row type
    expect(h.coordinator.route).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: '-1001' }),
      'kol',
    );
    expect(h.coordinator.route).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: '-1002' }),
      'crypto-news',
    );
  });

  it('gap-15: adding a channel needs no restart and never re-subscribes', async () => {
    const h = createHarness([
      { channelId: '-1001', title: 'KOL one', type: 'kol' },
    ]);
    await h.refresh();
    await flush();
    expect(h.subscribeCalls()).toBe(1);

    // New channel appears in the registry (operator POST /api/feed/sources)
    h.setSources([
      { channelId: '-1001', title: 'KOL one', type: 'kol' },
      { channelId: '-1009', title: 'KOL nine', type: 'kol' },
    ]);

    await expect(h.refresh()).resolves.not.toThrow();

    // Still exactly one subscribe() — the refresh only swapped the snapshot.
    expect(h.subscribeCalls()).toBe(1);
    expect(h.listener.updateSubscribedChannels).toHaveBeenCalledWith([
      '-1001',
      '-1009',
    ]);
  });

  it("unknown channels default to 'kol' (previous newsIds-membership default)", async () => {
    const h = createHarness([
      { channelId: '-1001', title: 'KOL one', type: 'kol' },
    ]);
    h.yielded.push(rawMsg('-9999', 5)); // No registry row
    await h.refresh();
    await flush();

    expect(h.coordinator.route).toHaveBeenCalledWith(
      expect.objectContaining({ peerId: '-9999' }),
      'kol',
    );
  });

  it('onModuleInit with empty DB schedules refresh and returns listening=false', async () => {
    const h = createHarness([]);
    await h.mod.onModuleInit();

    expect((h.mod as any).listening).toBe(false);
    expect((h.mod as any).refreshIntervalId).toBeDefined();

    h.stopTimer();
  });
});
