import { ConfigService } from '@nestjs/config';
import { TelegramClientManager } from 'core/infrastructure/services/telegram-client-manager.service';
import { TelegramMtprotoListenerAdapter } from './telegram-mtproto-listener.adapter';

const DUMMY_TRIPLE = {
  telegram: {
    apiId: 1,
    apiHash: 'dummy-hash',
    sessionString: 'dummy-invalid-session',
  },
};

function configStub(cfg: unknown): ConfigService {
  return { get: jest.fn().mockReturnValue(cfg) } as never;
}

function buildAdapter(deps: {
  appCfg: unknown;
  clientManager: unknown;
}): TelegramMtprotoListenerAdapter {
  const adapter = new TelegramMtprotoListenerAdapter(
    configStub(deps.appCfg),
    deps.clientManager as never,
    {} as never,
    {} as never,
    { findAllActive: jest.fn().mockResolvedValue([]) } as never,
    {} as never,
    {} as never,
    { maxChannels: 50, pollIntervalBaseMs: 90_000, jitterPercent: 30 } as never,
    { isAsleep: () => false, getNextWakeTime: () => null } as never,
  );
  return adapter;
}

describe('MTProto fail-soft boot (invalid session string)', () => {
  it('markAuthorizedIfTrue resolves with a dummy triple — listener off, never throws', async () => {
    const manager = new TelegramClientManager(configStub(DUMMY_TRIPLE));

    await expect(manager.markAuthorizedIfTrue()).resolves.toBeUndefined();

    expect(manager.isAuthorized()).toBe(false);
    expect(manager.isConnected()).toBe(false);
    expect(manager.getClient()).toBeNull();
  });

  it('adapter onModuleInit survives a throwing client manager and reports disabled', async () => {
    const adapter = buildAdapter({
      appCfg: DUMMY_TRIPLE,
      clientManager: {
        markAuthorizedIfTrue: jest
          .fn()
          .mockRejectedValue(new Error('Not a valid string')),
        disconnect: jest.fn().mockResolvedValue(undefined),
      },
    });

    await expect(adapter.onModuleInit()).resolves.toBeUndefined();
    expect(adapter.isListenerDisabled()).toBe(true);

    await adapter.onModuleDestroy();
  });

  it('adapter onModuleInit stays enabled when init succeeds', async () => {
    const adapter = buildAdapter({
      appCfg: DUMMY_TRIPLE,
      clientManager: {
        markAuthorizedIfTrue: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
      },
    });

    await adapter.onModuleInit();

    expect(adapter.isListenerDisabled()).toBe(false);

    await adapter.onModuleDestroy();
  });

  it('subscribe idles instead of throwing when ensureClient rejects the session', async () => {
    const adapter = buildAdapter({
      appCfg: DUMMY_TRIPLE,
      clientManager: {
        ensureClient: jest.fn(() => {
          throw new Error('Not a valid string');
        }),
      },
    });

    const seen: unknown[] = [];
    for await (const msg of adapter.subscribe(['-1001'])) {
      seen.push(msg);
    }

    expect(seen).toEqual([]);
  });
});
