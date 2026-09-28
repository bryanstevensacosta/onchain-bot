import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VaultService } from '@/vault/application/vault.service';
import { InMemoryBotVaultRepository } from '@/vault/infrastructure/in-memory-bot-vault.repository';
import { EncryptionService } from '@/vault/infrastructure/encryption.service';
import { BotBindingService } from '@/vault/application/bot-binding.service';

const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

async function build() {
  const moduleRef = await Test.createTestingModule({
    providers: [
      VaultService,
      InMemoryBotVaultRepository,
      EncryptionService,
      BotBindingService,
      {
        provide: ConfigService,
        useValue: {
          get: (path: string, fallback?: string) => {
            if (path === 'app.encryptionKey') return KEY;
            return fallback;
          },
        },
      },
    ],
  }).compile();
  return {
    vault: moduleRef.get(VaultService),
    binding: moduleRef.get(BotBindingService),
  };
}

describe('BotBindingService exclusivity (dexter)', () => {
  it('second bind to a different app is rejected', async () => {
    const { vault, binding } = await build();
    const created = await vault.register({
      label: 'dexter-bot',
      token: '111:AAA',
      ownerApp: 'dexter-onchain-bot',
    });
    await binding.bind(created.id, 'dexter-onchain-bot');
    await expect(binding.bind(created.id, 'kol-system')).rejects.toThrow(
      'already bound',
    );
  });

  it('inventory lists availability', async () => {
    const { vault, binding } = await build();
    const created = await vault.register({
      label: 'dexter-bot',
      token: '111:AAA',
      ownerApp: 'dexter-onchain-bot',
    });
    await binding.bind(created.id, 'dexter-onchain-bot');
    const rows = await binding.inventory();
    const row = rows.find((r) => r.id === created.id);
    expect(row).toMatchObject({
      boundApp: 'dexter-onchain-bot',
      available: false,
    });
    await binding.unbind(created.id);
    const rows2 = await binding.inventory();
    expect(rows2.find((r) => r.id === created.id)).toMatchObject({
      boundApp: null,
      available: true,
    });
  });

  it('locked bot cannot be used by another app (send gate)', async () => {
    const { vault, binding } = await build();
    const created = await vault.register({
      label: 'dexter-bot',
      token: '111:AAA',
      ownerApp: 'dexter-onchain-bot',
    });
    await binding.bind(created.id, 'dexter-onchain-bot');
    expect(() =>
      binding.assertUsable(created.id, 'kol-system', 'dexter-onchain-bot'),
    ).toThrow('already bound');
    expect(() =>
      binding.assertUsable(
        created.id,
        'dexter-onchain-bot',
        'dexter-onchain-bot',
      ),
    ).not.toThrow();
  });
});
