import { Logger } from '@nestjs/common';
import {
  BOT_IDENTITY_TIMEOUT_MS,
  BotIdentityService,
} from './bot-identity.service';

function makeConfig(
  botToken = '',
  botUsername = '',
  extra: { botVaultId?: string; botsGatewayBaseUrl?: string } = {},
) {
  return {
    get: () => ({
      botToken,
      botUsername,
      botVaultId: extra.botVaultId ?? '',
      botsGatewayBaseUrl: extra.botsGatewayBaseUrl ?? 'http://localhost:4070',
    }),
  } as never;
}

function makeMapping(vaultId: string | null) {
  return {
    resolveGatewayId: (localId: string) =>
      vaultId && localId === 'dexter' ? vaultId : localId,
  } as never;
}

const keylessSigner = { authHeaders: () => ({}) } as never;

interface ProfileStub {
  readonly status: number;
  readonly body: unknown;
}

function profileBody(username: unknown) {
  return {
    id: 'vault-1',
    handle: 'dexter',
    botId: 1,
    username,
    displayName: 'Dexter',
    avatarUrl: null,
  };
}

function mockFetch(
  profile: ProfileStub | Error | null,
  getMeUsername: unknown,
  getMeOk = true,
) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url: string | URL | Request) => {
      const u =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (u.includes('/api/bots/')) {
        if (profile instanceof Error) throw profile;
        if (!profile) throw new Error('profile must not be called');
        return {
          ok: profile.status >= 200 && profile.status < 300,
          status: profile.status,
          json: async () => profile.body,
        } as never;
      }
      if (u.includes('/getMe')) {
        return {
          ok: getMeOk,
          status: getMeOk ? 200 : 401,
          json: async () => ({
            ok: getMeOk,
            result: { id: 1, username: getMeUsername },
          }),
        } as never;
      }
      throw new Error(`unexpected fetch ${u}`);
    });
}

function assertTokenNeverLogged(
  warnSpy: jest.SpyInstance,
  token: string,
): void {
  for (const call of warnSpy.mock.calls) {
    expect(String(call[0])).not.toContain(token);
  }
}

describe('BotIdentityService (todo 12 bound-vault profile order)', () => {
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

  it('prefers the bound vault profile and never calls getMe', async () => {
    fetchSpy = mockFetch(
      { status: 200, body: profileBody('ProfileBot') },
      'LiveBot',
    );
    const svc = new BotIdentityService(
      makeConfig('TOKEN', 'EnvBot'),
      makeMapping('vault-1'),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('ProfileBot');
    expect(svc.isResolved()).toBe(true);
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/getMe'))).toBe(false);
    expect(urls.some((u) => u.includes('/api/bots/vault-1/profile'))).toBe(
      true,
    );
    assertTokenNeverLogged(warnSpy, 'TOKEN');
  });

  it('uses DEXTER_BOT_VAULT_ID when the local mapping is empty', async () => {
    fetchSpy = mockFetch(
      { status: 200, body: profileBody('VaultBot') },
      'LiveBot',
    );
    const svc = new BotIdentityService(
      makeConfig('TOKEN', '', { botVaultId: 'vault-9' }),
      makeMapping(null),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('VaultBot');
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/getMe'))).toBe(false);
    expect(urls.some((u) => u.includes('/api/bots/vault-9/profile'))).toBe(
      true,
    );
  });

  it('falls through a 403 profile to getMe', async () => {
    fetchSpy = mockFetch(
      { status: 403, body: { error: 'forbidden' } },
      'LiveBot',
    );
    const svc = new BotIdentityService(
      makeConfig('TOKEN', ''),
      makeMapping('vault-1'),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('LiveBot');
    const urls = fetchSpy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes('/getMe'))).toBe(true);
    assertTokenNeverLogged(warnSpy, 'TOKEN');
  });

  it('falls through a 404 profile to getMe', async () => {
    fetchSpy = mockFetch(
      { status: 404, body: { error: 'not found' } },
      'LiveBot',
    );
    const svc = new BotIdentityService(
      makeConfig('TOKEN', ''),
      makeMapping('vault-1'),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('LiveBot');
  });

  it('falls through a profile timeout to getMe', async () => {
    fetchSpy = mockFetch(new Error('profile timeout'), 'LiveBot');
    const svc = new BotIdentityService(
      makeConfig('TOKEN', ''),
      makeMapping('vault-1'),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('LiveBot');
  });

  it('falls through an invalid profile username to getMe', async () => {
    fetchSpy = mockFetch(
      { status: 200, body: profileBody('!!!not-a-handle') },
      'LiveBot',
    );
    const svc = new BotIdentityService(
      makeConfig('TOKEN', ''),
      makeMapping('vault-1'),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('LiveBot');
  });

  it('makes zero profile calls when unbound and falls back to env', async () => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('must not be called'));
    const svc = new BotIdentityService(
      makeConfig('', 'EnvBot'),
      makeMapping(null),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('EnvBot');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to BOT_USERNAME when getMe is unreachable', async () => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'));
    const svc = new BotIdentityService(
      makeConfig('TOKEN', 'EnvBot'),
      makeMapping(null),
      keylessSigner,
    );
    await svc.onApplicationBootstrap();
    expect(svc.getUsername()).toBe('EnvBot');
    assertTokenNeverLogged(warnSpy, 'TOKEN');
  });

  it('warns (never throws) when env disagrees with the live source', async () => {
    fetchSpy = mockFetch(
      { status: 200, body: profileBody('ProfileBot') },
      'LiveBot',
    );
    const svc = new BotIdentityService(
      makeConfig('TOKEN', 'StaleBot'),
      makeMapping('vault-1'),
      keylessSigner,
    );
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(svc.getUsername()).toBe('ProfileBot');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('BOT_USERNAME disagrees'),
    );
  });

  it('resolves "" with a healthy boot when everything is offline', async () => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'));
    const svc = new BotIdentityService(
      makeConfig('', ''),
      makeMapping(null),
      keylessSigner,
    );
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(svc.getUsername()).toBe('');
    expect(svc.isResolved()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the 5s identity timeout budget', () => {
    expect(BOT_IDENTITY_TIMEOUT_MS).toBe(5_000);
  });
});
