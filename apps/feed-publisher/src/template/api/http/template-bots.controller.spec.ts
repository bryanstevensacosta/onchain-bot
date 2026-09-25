import { ConfigService } from '@nestjs/config';
import { TemplateBotsController } from './template-bots.controller';
import { TemplateBotUseCases } from '../../application/use-cases/template-bot.use-cases';
import { TemplateEncryptionService } from '../../application/services/template-encryption.service';
import { InMemoryTemplateBotRepository } from '../../infrastructure/repositories/in-memory-template-bot.repository';

const config = {
  get: (path: string, fallback?: string): string | undefined => {
    if (path === 'app.encryptionKey') return 'test-encryption-key';
    return fallback;
  },
} as unknown as ConfigService;

describe('TemplateBotsController', () => {
  it('registers bots with redacted reads', async () => {
    const controller = new TemplateBotsController(
      new TemplateBotUseCases(
        new InMemoryTemplateBotRepository(),
        new TemplateEncryptionService(config),
      ),
    );
    const created = await controller.create({
      label: 'News',
      target: 'telegram',
      token: 'secret',
    });
    expect(created.token).toBe('***');
    await expect(controller.list()).resolves.toHaveLength(1);
  });
});
