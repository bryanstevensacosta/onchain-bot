import { REDACTED_TOKEN } from '../../domain/entities/telegram-bot.entity';
import { InMemoryTelegramBotRepository } from '../../infrastructure/repositories/in-memory-telegram-bot.repository';
import { EncryptionService } from '../../infrastructure/security/encryption.service';
import { CreateTelegramBotUseCase } from './create-telegram-bot.use-case';
import {
  GetTelegramBotUseCase,
  ListTelegramBotsUseCase,
} from './list-telegram-bots.use-case';
import {
  DeleteTelegramBotUseCase,
  UpdateTelegramBotUseCase,
} from './update-telegram-bot.use-case';

describe('TelegramBots CRUD use-cases (P23, failing-first)', () => {
  function setup() {
    process.env.ENCRYPTION_KEY = 'c'.repeat(64);
    const bots = new InMemoryTelegramBotRepository();
    const encryption = new EncryptionService({ get: () => undefined } as never);
    return {
      bots,
      encryption,
      create: new CreateTelegramBotUseCase(bots, encryption),
      list: new ListTelegramBotsUseCase(bots),
      get: new GetTelegramBotUseCase(bots),
      update: new UpdateTelegramBotUseCase(bots, encryption),
      remove: new DeleteTelegramBotUseCase(bots),
    };
  }

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('stores ciphertext (never plaintext) and redacts reads', async () => {
    const { bots, encryption, create, get, list } = setup();
    const token = '999:SECRET-TOKEN';
    const { bot } = await create.execute({ label: 'vip', token });
    expect(bot.token).toBe(REDACTED_TOKEN);
    const raw = await bots.findById(bot.id);
    expect(raw?.encryptedToken).not.toContain(token);
    expect(encryption.decrypt(raw!.encryptedToken)).toBe(token);
    expect((await get.execute({ id: bot.id })).bot.token).toBe('***');
    expect((await list.execute()).bots[0].token).toBe('***');
  });

  it('rotates tokens and renames labels', async () => {
    const { encryption, create, update, bots } = setup();
    const { bot } = await create.execute({ label: 'vip', token: 'old' });
    const rotated = await update.execute({
      id: bot.id,
      token: 'new',
      label: 'vip2',
    });
    expect(rotated.bot.label).toBe('vip2');
    expect(rotated.bot.token).toBe('***');
    const raw = await bots.findById(bot.id);
    expect(encryption.decrypt(raw!.encryptedToken)).toBe('new');
  });

  it('deletes bots and reports NOT_FOUND for missing ids', async () => {
    const { create, remove, get } = setup();
    const { bot } = await create.execute({ label: 'vip', token: 't' });
    expect((await remove.execute({ id: bot.id })).deleted).toBe(true);
    await expect(get.execute({ id: bot.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(remove.execute({ id: 'nope' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
