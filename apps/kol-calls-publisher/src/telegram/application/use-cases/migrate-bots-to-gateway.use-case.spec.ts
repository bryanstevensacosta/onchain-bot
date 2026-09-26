import { ConfigService } from '@nestjs/config';
import { InMemoryTelegramBotRepository } from '../../../templates/infrastructure/repositories/in-memory-telegram-bot.repository';
import { TelegramBot } from '../../../templates/domain/entities/telegram-bot.entity';
import { EncryptionService } from '../../../templates/infrastructure/security/encryption.service';
import { GatewayHmacSigner } from '../../infrastructure/gateway/gateway-hmac-signer.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import { MigrateBotsToGatewayUseCase } from './migrate-bots-to-gateway.use-case';

function configStub() {
  return {
    get: (key: string) => {
      if (key === 'telegram')
        return {
          botToken: '',
          apiKey: '',
          botsGateway: {
            baseUrl: 'http://gateway:4070',
            clientId: 'ops-admin',
            clientSecret: 'admin-secret',
            publishMode: 'dual' as const,
          },
        };
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('MigrateBotsToGatewayUseCase (gateway todo 4, failing-first)', () => {
  const posts: Array<{
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];
  const prevKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    posts.length = 0;
    process.env.ENCRYPTION_KEY = 'test-key-for-migration-only';
    (global as unknown as { fetch: unknown }).fetch = async (
      url: string,
      init: { headers?: Record<string, string>; body?: string },
    ) => {
      const body = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
      posts.push({ url, headers: init.headers ?? {}, body });
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `vault-${body.label}`,
          label: body.label,
          token: '***',
        }),
      };
    };
  });

  afterEach(() => {
    delete (global as unknown as { fetch?: unknown }).fetch;
    if (prevKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = prevKey;
  });

  function setup() {
    const bots = new InMemoryTelegramBotRepository();
    const config = configStub();
    const encryption = new EncryptionService(config);
    const signer = new GatewayHmacSigner(config);
    const mapping = new GatewayBotMappingService();
    const uc = new MigrateBotsToGatewayUseCase(
      bots,
      encryption,
      signer,
      mapping,
      config,
    );
    return { bots, encryption, mapping, uc };
  }

  it('re-encrypts catalog tokens into the gateway vault (never plaintext at rest)', async () => {
    const { bots, encryption, mapping, uc } = setup();
    await bots.save(
      TelegramBot.create({
        id: 'local-1',
        label: 'vip-bot',
        encryptedToken: encryption.encrypt('111:AAA-PLAIN'),
      }),
    );
    const out = await uc.execute();
    expect(out.migrated).toHaveLength(1);
    expect(out.migrated[0]).toMatchObject({
      localId: 'local-1',
      gatewayId: 'vault-vip-bot',
    });
    expect(out.failed).toHaveLength(0);
    expect(mapping.resolveGatewayId('local-1')).toBe('vault-vip-bot');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('http://gateway:4070/api/vault/bots');
    expect(posts[0].body).toMatchObject({
      label: 'vip-bot',
      token: '111:AAA-PLAIN',
      ownerApp: 'kol-system',
    });
    expect(posts[0].headers['x-api-key']).toBe('ops-admin');
    expect(posts[0].headers['x-signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records tampered ciphertext as failure without calling the gateway', async () => {
    const { bots, uc } = setup();
    await bots.save(
      TelegramBot.create({
        id: 'local-bad',
        label: 'bad-bot',
        encryptedToken: 'dead:beef:00',
      }),
    );
    const out = await uc.execute();
    expect(out.migrated).toHaveLength(0);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].localId).toBe('local-bad');
    expect(posts).toHaveLength(0);
  });

  it('skips bots already mapped in this boot (no duplicate vault entries)', async () => {
    const { bots, encryption, uc } = setup();
    await bots.save(
      TelegramBot.create({
        id: 'local-1',
        label: 'vip-bot',
        encryptedToken: encryption.encrypt('111:AAA'),
      }),
    );
    await uc.execute();
    const second = await uc.execute();
    expect(second.migrated).toHaveLength(0);
    expect(posts).toHaveLength(1);
  });
});
