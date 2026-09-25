import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BotsController } from './bots.controller';
import { BotResolverService } from '../../application/bot-resolver.service';
import { VaultService } from '../../../vault/application/vault.service';
import { InMemoryBotVaultRepository } from '../../../vault/infrastructure/in-memory-bot-vault.repository';
import { EncryptionService } from '../../../vault/infrastructure/encryption.service';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function botApiMock() {
  return jest.fn(async (url: string) => {
    if (url.includes('/getMe')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            id: 123456,
            username: 'vipcallsbot',
            first_name: 'VIP Calls',
          },
        }),
      };
    }
    if (url.includes('/getUserProfilePhotos')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: {
            total_count: 1,
            photos: [[{ file_id: 'pic123', width: 160, height: 160 }]],
          },
        }),
      };
    }
    if (url.includes('/getFile')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: { file_path: 'photos/pic123.jpg' },
        }),
      };
    }
    if (url.includes('api.telegram.org/file/')) {
      const bytes = Buffer.from('fake-jpeg-bytes');
      return {
        ok: true,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
      };
    }
    throw new Error(`unexpected url ${url}`);
  });
}

describe('BotsController GET /api/bots/:id/profile', () => {
  it('resolves handle, bot id, username + cached avatar', async () => {
    const fetchMock = botApiMock();
    const moduleRef = await Test.createTestingModule({
      controllers: [BotsController],
      providers: [
        BotResolverService,
        VaultService,
        InMemoryBotVaultRepository,
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (path: string, fallback?: string) => {
              if (path === 'app.encryptionKey') return KEY;
              if (path === 'app.avatarDir') return 'uploads/avatars';
              return fallback;
            },
          },
        },
        { provide: 'FETCH_FN', useValue: fetchMock },
      ],
    }).compile();
    const controller = moduleRef.get(BotsController);
    const vault = moduleRef.get(VaultService);
    const created = await vault.register({
      label: 'vip',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    const profile = await controller.getProfile(created.id);
    expect(profile).toMatchObject({
      id: created.id,
      handle: 'vip',
      botId: 123456,
      username: 'vipcallsbot',
    });
    expect(profile.avatarUrl).toBe(`/api/bots/${created.id}/avatar`);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/getMe'),
      expect.anything(),
    );
  });

  it('surfaces Bot API errors without leaking the token', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ok: false, description: 'Unauthorized' }),
    }));
    const moduleRef = await Test.createTestingModule({
      controllers: [BotsController],
      providers: [
        BotResolverService,
        VaultService,
        InMemoryBotVaultRepository,
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (path: string, fallback?: string) => {
              if (path === 'app.encryptionKey') return KEY;
              if (path === 'app.avatarDir') return 'uploads/avatars';
              return fallback;
            },
          },
        },
        { provide: 'FETCH_FN', useValue: fetchMock },
      ],
    }).compile();
    const vault = moduleRef.get(VaultService);
    const created = await vault.register({
      label: 'bad',
      token: 'bad-token',
      ownerApp: 'kol-system',
    });
    const controller = moduleRef.get(BotsController);
    await expect(controller.getProfile(created.id)).rejects.toThrow(
      'Bot API getMe failed',
    );
  });
});
