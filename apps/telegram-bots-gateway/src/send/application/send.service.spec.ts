import { ConfigService } from '@nestjs/config';
import { SendService } from './send.service';
import { VaultService } from '../../vault/application/vault.service';
import { InMemoryBotVaultRepository } from '../../vault/infrastructure/in-memory-bot-vault.repository';
import { EncryptionService } from '../../vault/infrastructure/encryption.service';
import { PerBotRateLimiterService } from './per-bot-rate-limiter.service';
import { InMemoryIdempotencyStore } from './idempotency.store';
import { SendAccountingService } from './send-accounting.service';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const configStub = {
  get: (path: string, fallback?: string) => {
    if (path === 'app.encryptionKey') return KEY;
    if (path === 'app.avatarDir') return 'uploads/avatars';
    return fallback;
  },
} as unknown as ConfigService;

function makeSendService(deps: {
  limiter?: PerBotRateLimiterService;
  botApi?: {
    post: (
      botId: string,
      token: string,
      method: string,
      payload: Record<string, unknown>,
    ) => Promise<{ result: unknown; attempts: number }>;
  };
}) {
  const repo = new InMemoryBotVaultRepository();
  const vault = new VaultService(
    repo,
    new EncryptionService(configStub),
  );
  const service = new SendService(
    vault,
    deps.limiter ?? new PerBotRateLimiterService(),
    deps.botApi ?? {
      post: async () => ({ result: { message_id: 1 }, attempts: 1 }),
    },
    new InMemoryIdempotencyStore(),
    new SendAccountingService(),
  );
  return { service, vault };
}

describe('SendService idempotency (todo 2, red)', () => {
  it('sends once and replays the cached result for the same client_msg_id', async () => {
    const post = jest.fn(async () => ({
      result: { message_id: 7 },
      attempts: 1,
    }));
    const { service, vault } = makeSendService({ botApi: { post } });
    const created = await vault.register({
      label: 'vip',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    const dto = {
      kind: 'message',
      chat_id: '-100123',
      text: 'hello',
      client_msg_id: 'app1-msg-1',
    } as const;
    const first = await service.send(created.id, dto, 'kol-system');
    const second = await service.send(created.id, dto, 'kol-system');
    expect(first).toMatchObject({ ok: true, message_id: 7, cached: false });
    expect(second).toMatchObject({ ok: true, message_id: 7, cached: true });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sends again for a different client_msg_id (no false dedup)', async () => {
    const post = jest.fn(async () => ({
      result: { message_id: 8 },
      attempts: 1,
    }));
    const { service, vault } = makeSendService({ botApi: { post } });
    const created = await vault.register({
      label: 'vip',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    await service.send(
      created.id,
      {
        kind: 'message',
        chat_id: '-100123',
        text: 'hello',
        client_msg_id: 'msg-a',
      } as const,
      'kol-system',
    );
    await service.send(
      created.id,
      {
        kind: 'message',
        chat_id: '-100123',
        text: 'hello',
        client_msg_id: 'msg-b',
      } as const,
      'kol-system',
    );
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('scopes idempotency per (bot, chat, client_msg_id)', async () => {
    const post = jest.fn(async () => ({
      result: { message_id: 9 },
      attempts: 1,
    }));
    const { service, vault } = makeSendService({ botApi: { post } });
    const created = await vault.register({
      label: 'vip',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    const dto = {
      kind: 'message',
      chat_id: '-100123',
      text: 'hello',
      client_msg_id: 'shared-id',
    } as const;
    await service.send(created.id, dto, 'kol-system');
    await service.send(created.id, { ...dto, chat_id: '-100999' }, 'kol-system');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND for an unknown bot without touching Telegram', async () => {
    const post = jest.fn();
    const { service } = makeSendService({ botApi: { post } });
    await expect(
      service.send(
        'no-such-bot',
        { kind: 'message', chat_id: '1', text: 'hi' } as const,
        'kol-system',
      ),
    ).rejects.toThrow('not found');
    expect(post).not.toHaveBeenCalled();
  });
});

describe('SendService multi-app burst under quota (todo 2, red)', () => {
  it('3 apps x 12 sends stay within 30/s per bot', async () => {
    const stamps: number[] = [];
    const post = jest.fn(async () => {
      stamps.push(Date.now());
      return { result: { message_id: stamps.length }, attempts: 1 };
    });
    const { service, vault } = makeSendService({ botApi: { post } });
    const created = await vault.register({
      label: 'burst',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    const apps = ['kol-system', 'feed-publisher', 'dexter'];
    await Promise.all(
      apps.flatMap((app, a) =>
        Array.from({ length: 12 }, (_, i) =>
          service.send(
            created.id,
            {
              kind: 'message',
              chat_id: `-100${a}${i}`,
              text: `burst ${app} ${i}`,
              client_msg_id: `${app}-${i}`,
            } as const,
            app,
          ),
        ),
      ),
    );
    expect(post).toHaveBeenCalledTimes(36);
    const sorted = [...stamps].sort((x, y) => x - y);
    let maxInWindow = 0;
    for (const t of sorted) {
      const inWindow = sorted.filter((u) => u >= t && u < t + 1000).length;
      if (inWindow > maxInWindow) maxInWindow = inWindow;
    }
    expect(maxInWindow).toBeLessThanOrEqual(30);
  });
});
