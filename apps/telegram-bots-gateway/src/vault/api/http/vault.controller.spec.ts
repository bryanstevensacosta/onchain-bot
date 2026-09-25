import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VaultController } from './vault.controller';
import { VaultService } from '../../application/vault.service';
import { EncryptionService } from '../../infrastructure/encryption.service';
import { InMemoryBotVaultRepository } from '../../infrastructure/in-memory-bot-vault.repository';
import { REDACTED_TOKEN } from '../../domain/bot-vault.entity';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('VaultController (internal CRUD, redacted)', () => {
  let controller: VaultController;
  let vault: VaultService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VaultController],
      providers: [
        VaultService,
        InMemoryBotVaultRepository,
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: (path: string) =>
              path === 'app.encryptionKey' ? KEY : undefined,
          },
        },
      ],
    }).compile();
    controller = moduleRef.get(VaultController);
    vault = moduleRef.get(VaultService);
  });

  it('creates + lists redacted (no ciphertext leaks)', async () => {
    const created = await controller.create({
      label: 'vip-calls',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    expect(created.token).toBe(REDACTED_TOKEN);
    const list = await controller.list();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('111:AAA');
  });

  it('rotates the token without redeploy', async () => {
    const created = await controller.create({
      label: 'news',
      token: 'old-token',
      ownerApp: 'feed-publisher',
    });
    const before = await vault.decryptToken(created.id);
    const rotated = await controller.rotate(created.id, {
      token: 'new-token',
    });
    expect(rotated.token).toBe(REDACTED_TOKEN);
    expect(rotated.rotatedAt).not.toBeNull();
    expect(await vault.decryptToken(created.id)).toBe('new-token');
    expect(await vault.decryptToken(created.id)).not.toBe(before);
  });

  it('deletes entries', async () => {
    const created = await controller.create({
      label: 'tmp',
      token: 't',
      ownerApp: 'dexter-onchain-bot',
    });
    await controller.remove(created.id);
    await expect(controller.get(created.id)).rejects.toThrow();
  });
});
