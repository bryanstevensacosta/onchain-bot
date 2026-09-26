import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { InMemoryTelegramBotRepository } from '../../infrastructure/repositories/in-memory-telegram-bot.repository';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { TelegramBot } from '../../domain/entities/telegram-bot.entity';
import { EncryptionService } from '../../infrastructure/security/encryption.service';
import { AssignTemplateChannelUseCase } from './assign-template-channel.use-case';

describe('AssignTemplateChannelUseCase admin verification (P23-bis, failing-first)', () => {
  function setup(verified: boolean) {
    process.env.ENCRYPTION_KEY = 'd'.repeat(64);
    const templates = new InMemoryTemplateRepository();
    const bots = new InMemoryTelegramBotRepository();
    const encryption = new EncryptionService({ get: () => undefined } as never);
    const verifier = { verifyAdmin: async () => verified };
    return {
      templates,
      bots,
      encryption,
      useCase: new AssignTemplateChannelUseCase(
        templates,
        bots,
        encryption,
        verifier,
      ),
    };
  }

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('stores admin_verified_at when the bot is admin/creator', async () => {
    const { templates, bots, encryption, useCase } = setup(true);
    await templates.save(PublishingTemplate.create({ id: 't', name: 't' }));
    const encrypted = encryption.encrypt('111:TOKEN');
    await bots.save(
      TelegramBot.create({
        id: 'bot-1',
        label: 'b',
        encryptedToken: encrypted,
      }),
    );
    const { template } = await useCase.execute({
      templateId: 't',
      botId: 'bot-1',
      channelTarget: '@vip',
    });
    expect(template.channelTarget).toBe('@vip');
    expect(template.adminVerifiedAt).toBeInstanceOf(Date);
    expect(template.canPublish()).toBe(true);
  });

  it('rejects the assign when the bot is NOT admin (fail-closed)', async () => {
    const { templates, bots, encryption, useCase } = setup(false);
    await templates.save(PublishingTemplate.create({ id: 't', name: 't' }));
    const encrypted = encryption.encrypt('111:TOKEN');
    await bots.save(
      TelegramBot.create({
        id: 'bot-1',
        label: 'b',
        encryptedToken: encrypted,
      }),
    );
    await expect(
      useCase.execute({
        templateId: 't',
        botId: 'bot-1',
        channelTarget: '@vip',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const template = await templates.findById('t');
    expect(template?.channelTarget).toBeNull();
    expect(template?.canPublish()).toBe(false);
  });

  it('returns NOT_FOUND for missing template or bot', async () => {
    const { useCase } = setup(true);
    await expect(
      useCase.execute({
        templateId: 'nope',
        botId: 'bot-1',
        channelTarget: '@x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
