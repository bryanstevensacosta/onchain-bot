import { MigrateBotsToGatewayUseCase } from './migrate-bots-to-gateway.use-case';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import { GatewayHmacSigner } from '../../infrastructure/gateway/gateway-hmac-signer.service';
import { TemplateBot } from '../../../template/domain/entities/template-bot.entity';
import type { TemplateBotRepository } from '../../../template/domain/ports/template-bot.repository';
import type { TemplateEncryptionService } from '../../../template/application/services/template-encryption.service';
import type { ConfigService } from '@nestjs/config';

function makeBot(id: string, label: string): TemplateBot {
  return TemplateBot.create({
    id,
    label,
    target: 'telegram',
    tokenCiphertext: 'CIPHERTEXT',
    defaultChatId: '@c',
  });
}

function makeConfig(env: Record<string, string> = {}): ConfigService {
  return {
    get: (path: string, fallback = ''): unknown => {
      if (path === 'telegram') {
        return {
          feedBotToken: env.CRYPTO_NEWS_BOT_TOKEN ?? '',
          threadsBotToken: env.THREADS_BOT_TOKEN ?? '',
          botsGateway: {
            baseUrl: 'http://localhost:4070',
            clientId: '',
            clientSecret: '',
          },
        };
      }
      return env[path] ?? fallback;
    },
  } as unknown as ConfigService;
}

describe('MigrateBotsToGatewayUseCase', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('migrates catalog bots vault-to-vault and records the mapping', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'vault-aaa' }),
    });
    const bots = {
      list: jest.fn().mockResolvedValue([makeBot('local-1', 'feed-bot')]),
      findById: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as TemplateBotRepository;
    const encryption = {
      decrypt: jest.fn().mockReturnValue('999:PLAINTEXT'),
    } as unknown as TemplateEncryptionService;
    const mapping = new GatewayBotMappingService();
    const useCase = new MigrateBotsToGatewayUseCase(
      bots,
      encryption,
      new GatewayHmacSigner(),
      mapping,
      makeConfig({}),
    );
    const out = await useCase.execute();
    expect(out.failed).toEqual([]);
    expect(out.migrated).toEqual([
      { localId: 'local-1', gatewayId: 'vault-aaa', label: 'feed-bot' },
    ]);
    expect(mapping.resolveGatewayId('local-1')).toBe('vault-aaa');
    const fetchMock = globalThis.fetch as jest.Mock;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:4070/api/vault/bots');
    expect(JSON.parse(init.body as string)).toMatchObject({
      label: 'feed-bot',
      token: '999:PLAINTEXT',
      ownerApp: 'feed-publisher',
    });
  });

  it('fails per-bot on tampered ciphertext without touching the gateway', async () => {
    const spy = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = spy;
    const bots = {
      list: jest.fn().mockResolvedValue([makeBot('local-9', 'bad-bot')]),
      findById: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as TemplateBotRepository;
    const encryption = {
      decrypt: jest.fn().mockImplementation(() => {
        throw new Error('failed to decrypt payload');
      }),
    } as unknown as TemplateEncryptionService;
    const useCase = new MigrateBotsToGatewayUseCase(
      bots,
      encryption,
      new GatewayHmacSigner(),
      new GatewayBotMappingService(),
      makeConfig({}),
    );
    const out = await useCase.execute();
    expect(out.migrated).toEqual([]);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0]).toMatchObject({ localId: 'local-9' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips already-mapped bots (no duplicate vault entries per boot)', async () => {
    const spy = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = spy;
    const bots = {
      list: jest.fn().mockResolvedValue([makeBot('local-1', 'feed-bot')]),
      findById: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as TemplateBotRepository;
    const mapping = new GatewayBotMappingService();
    mapping.register('local-1', 'vault-existing');
    const useCase = new MigrateBotsToGatewayUseCase(
      bots,
      {
        decrypt: jest.fn(),
      } as unknown as TemplateEncryptionService,
      new GatewayHmacSigner(),
      mapping,
      makeConfig({}),
    );
    const out = await useCase.execute();
    expect(out).toEqual({ migrated: [], failed: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});
