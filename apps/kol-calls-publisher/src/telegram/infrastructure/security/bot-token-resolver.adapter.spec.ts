import { BotTokenResolverAdapter } from './bot-token-resolver.adapter';
import { InMemoryTelegramBotRepository } from '../../../templates/infrastructure/repositories/in-memory-telegram-bot.repository';
import { TelegramBot } from '../../../templates/domain/entities/telegram-bot.entity';
import { EncryptionService } from '../../../templates/infrastructure/security/encryption.service';

describe('BotTokenResolverAdapter (todo 11, failing-first, P23 DB tokens)', () => {
  it('resolves plaintext from the catalog and 401s when the bot is unknown', async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    const bots = new InMemoryTelegramBotRepository();
    const encryption = new EncryptionService({ get: () => undefined } as never);
    const adapter = new BotTokenResolverAdapter(bots, encryption);
    await bots.save(
      TelegramBot.create({
        id: 'bot-1',
        label: 'b',
        encryptedToken: encryption.encrypt('AAA:secret'),
      }),
    );
    await expect(adapter.resolveBotToken('bot-1')).resolves.toBe('AAA:secret');
    await expect(adapter.resolveBotToken('ghost')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    delete process.env.ENCRYPTION_KEY;
  });
});
