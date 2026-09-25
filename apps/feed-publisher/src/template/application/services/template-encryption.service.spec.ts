import { ConfigService } from '@nestjs/config';
import { TemplateEncryptionService } from './template-encryption.service';

const configWith = (key: string): ConfigService =>
  ({
    get: (path: string, fallback?: string): string | undefined => {
      if (path === 'app.encryptionKey') return key;
      return fallback;
    },
  }) as unknown as ConfigService;

describe('TemplateEncryptionService', () => {
  it('round-trips a token and fails closed on empty key', () => {
    const service = new TemplateEncryptionService(configWith('dev-secret-key'));
    const ciphertext = service.encrypt('bot-token-123');
    expect(ciphertext).not.toContain('bot-token-123');
    expect(service.decrypt(ciphertext)).toBe('bot-token-123');
    const broken = new TemplateEncryptionService(configWith(''));
    expect(() => broken.encrypt('x')).toThrow('ENCRYPTION_KEY is required');
  });

  it('rejects tampered payloads', () => {
    const service = new TemplateEncryptionService(configWith('dev-secret-key'));
    expect(() => service.decrypt('not-a-payload')).toThrow('failed to decrypt');
  });
});
