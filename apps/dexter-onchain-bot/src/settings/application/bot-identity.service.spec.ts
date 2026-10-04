import { Logger } from '@nestjs/common';
import {
  BOT_IDENTITY_TIMEOUT_MS,
  BotIdentityService,
} from './bot-identity.service';
import { DexterBotBindingService } from '@/gateway/application/dexter-bot-binding.service';

function makeConfig(botToken = '', botUsername = '') {
  return {
    get: () => ({
      botToken,
      botUsername,
    }),
  } as never;
}

function makeBinding(rows: unknown[] | Error) {
  return {
    inventory: async () => {
      if (rows instanceof Error) throw rows;
      return rows as Awaited<ReturnType<DexterBotBindingService['inventory']>>;
    },
  } as never;
}

function mockGetMe(username: unknown, ok = true) {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 401,
    json: async () => ({ ok, result: { id: 1, username } }),
  } as never);
}

describe('BotIdentityService (todo 11 hybrid order)', () => {
  let warnSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance | null = null;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (fetchSpy) {
      fetchSpy.mockRestore();
      fetchSpy = null;
    }
  });

  it('prefers the gateway inventory bound-bot username and never calls getMe', async () => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('must not be called'));
    const binding = makeBinding([
      {
        id: 'vault-1',
        label: 'dexter',
        ownerApp: 'dexter-onchain-bot',
        boundApp: DexterBotBindingService.APP_ID,
        available: false,
        username: 'InventoryBot',
      },
    ]);
    const svc = new BotIdentityService(makeConfig('TOKEN', 'EnvBot'), binding);
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('InventoryBot');
    expect(svc.isResolved()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls through inventory-without-username to getMe', async () => {
    fetchSpy = mockGetMe('LiveBot');
    const binding = makeBinding([
      {
        id: 'vault-1',
        label: 'dexter',
        ownerApp: 'dexter-onchain-bot',
        boundApp: DexterBotBindingService.APP_ID,
        available: false,
      },
    ]);
    const svc = new BotIdentityService(makeConfig('TOKEN', ''), binding);
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('LiveBot');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/getMe');
    for (const call of warnSpy.mock.calls) {
      expect(String(call[0])).not.toContain('TOKEN');
    }
  });

  it('skips a failing inventory and continues the chain', async () => {
    fetchSpy = mockGetMe('LiveBot');
    const binding = makeBinding(new Error('gateway down'));
    const svc = new BotIdentityService(makeConfig('TOKEN', ''), binding);
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('LiveBot');
  });

  it('falls back to BOT_USERNAME when getMe is unreachable', async () => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'));
    const svc = new BotIdentityService(makeConfig('TOKEN', 'EnvBot'), null);
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('EnvBot');
  });

  it('warns (never throws) when env disagrees with the live source', async () => {
    fetchSpy = mockGetMe('LiveBot');
    const svc = new BotIdentityService(makeConfig('TOKEN', 'StaleBot'), null);
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(svc.getUsername()).toBe('LiveBot');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('BOT_USERNAME disagrees'),
    );
  });

  it('resolves "" with a healthy boot when everything is offline', async () => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'));
    const svc = new BotIdentityService(makeConfig('', ''), null);
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(svc.getUsername()).toBe('');
    expect(svc.isResolved()).toBe(true);
  });

  it('uses the 5s getMe timeout budget', () => {
    expect(BOT_IDENTITY_TIMEOUT_MS).toBe(5_000);
  });
});
