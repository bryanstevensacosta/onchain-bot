import { HttpTelegramAdminVerifierAdapter } from './http-telegram-admin-verifier.adapter';

describe('HttpTelegramAdminVerifierAdapter getChatMember (P23-bis, failing-first)', () => {
  const adapter = new HttpTelegramAdminVerifierAdapter();
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function mockFetch(handlers: Array<unknown>) {
    let calls = 0;
    globalThis.fetch = (async () => {
      const body = handlers[calls++];
      return { ok: true, json: async () => body };
    }) as never;
  }

  it('returns true when the bot is administrator', async () => {
    mockFetch([
      { ok: true, result: { id: 7 } },
      { ok: true, result: { status: 'administrator' } },
    ]);
    await expect(
      adapter.verifyAdmin({ botToken: 't', channelTarget: '@c' }),
    ).resolves.toBe(true);
  });

  it('returns true when the bot is creator', async () => {
    mockFetch([
      { ok: true, result: { id: 7 } },
      { ok: true, result: { status: 'creator' } },
    ]);
    await expect(
      adapter.verifyAdmin({ botToken: 't', channelTarget: '@c' }),
    ).resolves.toBe(true);
  });

  it('returns false for plain members (fail-closed)', async () => {
    mockFetch([
      { ok: true, result: { id: 7 } },
      { ok: true, result: { status: 'member' } },
    ]);
    await expect(
      adapter.verifyAdmin({ botToken: 't', channelTarget: '@c' }),
    ).resolves.toBe(false);
  });

  it('returns false on transport errors (fail-closed, no throw)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as never;
    await expect(
      adapter.verifyAdmin({ botToken: 't', channelTarget: '@c' }),
    ).resolves.toBe(false);
  });
});
