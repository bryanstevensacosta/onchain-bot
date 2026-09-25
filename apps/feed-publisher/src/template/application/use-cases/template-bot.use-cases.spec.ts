import { ConfigService } from '@nestjs/config';
import { TemplateBotUseCases } from './template-bot.use-cases';
import { TemplateEncryptionService } from '../services/template-encryption.service';
import { InMemoryTemplateBotRepository } from '../../infrastructure/repositories/in-memory-template-bot.repository';

const config = {
  get: (path: string, fallback?: string): string | undefined => {
    if (path === 'app.encryptionKey') return 'test-encryption-key';
    return fallback;
  },
} as unknown as ConfigService;

describe('TemplateBotUseCases', () => {
  it('stores ciphertext only and redacts reads; resolves tokens per call', async () => {
    const repo = new InMemoryTemplateBotRepository();
    const useCases = new TemplateBotUseCases(
      repo,
      new TemplateEncryptionService(config),
    );
    const created = await useCases.create({
      id: 'bot-1',
      label: 'News',
      target: 'telegram',
      token: 'secret-token',
      defaultChatId: '@news',
    });
    expect(created.token).toBe('***');
    const stored = await repo.findById('bot-1');
    expect(stored?.tokenCiphertext).not.toContain('secret-token');
    await expect(useCases.resolveToken('bot-1')).resolves.toBe('secret-token');
    await expect(useCases.resolveToken('missing')).rejects.toThrow(
      'unknown bot',
    );
  });
});
