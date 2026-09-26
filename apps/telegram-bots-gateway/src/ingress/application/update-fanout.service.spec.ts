import { SubscriptionRegistryService } from './subscription-registry.service';
import { DeadLetterStore } from './dead-letter.store';
import { UpdateFanoutService } from './update-fanout.service';

function okFetch() {
  return async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }) as unknown as Response;
}

describe('UpdateFanoutService (todo 3, red)', () => {
  it('fans out one update to 2 subscribed apps (pass-through, no business logic)', async () => {
    const registry = new SubscriptionRegistryService();
    const deadLetters = new DeadLetterStore();
    const seen: Array<{ url: string; body: unknown }> = [];
    const fetchFn = async (
      url: unknown,
      init?: {
        body?: unknown;
      },
    ) => {
      seen.push({ url: String(url), body: init?.body });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    };
    const fanout = new UpdateFanoutService(
      registry,
      deadLetters,
      fetchFn,
      async () => undefined,
    );
    registry.registerBot('bot-1', 'secret-1');
    registry.subscribe('bot-1', {
      appId: 'kol-system',
      url: 'http://kol/ingress',
    });
    registry.subscribe('bot-1', {
      appId: 'feed-publisher',
      url: 'http://feed/ingress',
    });

    const update = { update_id: 7, message: { text: 'hello' } };
    const result = await fanout.fanout('bot-1', update);

    expect(result.delivered.sort()).toEqual(['feed-publisher', 'kol-system']);
    expect(result.failed).toEqual([]);
    expect(seen).toHaveLength(2);
    for (const hit of seen) {
      expect(JSON.parse(String(hit.body))).toEqual(update);
    }
    expect(deadLetters.count()).toBe(0);
  });

  it('retries with backoff and dead-letters when an app is down', async () => {
    const registry = new SubscriptionRegistryService();
    const deadLetters = new DeadLetterStore();
    const sleeps: number[] = [];
    let calls = 0;
    const failingFetch = async () => {
      calls += 1;
      throw new Error('ECONNREFUSED');
    };
    const fanout = new UpdateFanoutService(
      registry,
      deadLetters,
      failingFetch,
      async (ms: number) => {
        sleeps.push(ms);
      },
      { maxAttempts: 3, backoffMs: [10, 20] },
    );
    registry.registerBot('bot-1', 'secret-1');
    registry.subscribe('bot-1', {
      appId: 'dexter',
      url: 'http://down/ingress',
    });

    const result = await fanout.fanout('bot-1', { update_id: 9 });

    expect(result.delivered).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].appId).toBe('dexter');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([10, 20]);
    expect(deadLetters.count()).toBe(1);
    expect(deadLetters.list('bot-1')[0]).toMatchObject({
      botId: 'bot-1',
      attempts: 3,
    });
  });

  it('sends the per-subscriber auth secret without mutating the update', async () => {
    const registry = new SubscriptionRegistryService();
    const deadLetters = new DeadLetterStore();
    const headersSeen: Array<Record<string, string>> = [];
    const fetchFn = (async (
      url: unknown,
      init?: { headers?: Record<string, string> },
    ): Promise<Response> => {
      headersSeen.push(init?.headers ?? {});
      return (await okFetch()()) as Response;
    }) as (url: unknown, init?: Record<string, unknown>) => Promise<Response>;
    const fanout = new UpdateFanoutService(
      registry,
      deadLetters,
      fetchFn,
      async () => undefined,
    );
    registry.registerBot('bot-1', 'secret-1');
    registry.subscribe('bot-1', {
      appId: 'kol-system',
      url: 'http://kol/ingress',
      secret: 'kol-hook-secret',
    });

    const update = { update_id: 11 };
    await fanout.fanout('bot-1', update);

    expect(update).toEqual({ update_id: 11 });
    expect(headersSeen[0]['x-gateway-bot']).toBe('bot-1');
    expect(headersSeen[0]['x-gateway-signature']).toBeTruthy();
  });
});
