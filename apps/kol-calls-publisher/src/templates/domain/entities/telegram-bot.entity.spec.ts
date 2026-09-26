import { DomainError } from '../../../shared/kernel/domain-error';
import { TelegramBot, REDACTED_TOKEN } from './telegram-bot.entity';

describe('TelegramBot catalog entity (P23, failing-first)', () => {
  it('creates a bot with an encrypted token (never plaintext on the entity)', () => {
    const bot = TelegramBot.create({
      label: 'vip-publisher',
      encryptedToken: 'iv:tag:ct',
    });
    expect(bot.id).toHaveLength(36);
    expect(bot.label).toBe('vip-publisher');
    expect(bot.encryptedToken).toBe('iv:tag:ct');
    expect(bot.encryptedToken).not.toContain('123456:ABC-DEF');
  });

  it('rejects empty label or empty encrypted token', () => {
    expect(() =>
      TelegramBot.create({ label: '', encryptedToken: 'x' }),
    ).toThrow(DomainError);
    expect(() =>
      TelegramBot.create({ label: 'b', encryptedToken: '' }),
    ).toThrow(DomainError);
  });

  it('redacts the token in read projections (GET never leaks ciphertext)', () => {
    const bot = TelegramBot.create({ label: 'b', encryptedToken: 'iv:tag:ct' });
    const redacted = bot.toRedacted();
    expect(redacted.token).toBe(REDACTED_TOKEN);
    expect(redacted.token).toBe('***');
    expect('encryptedToken' in redacted).toBe(false);
    expect(redacted.id).toBe(bot.id);
    expect(redacted.label).toBe('b');
  });

  it('rotates the token and renames the label', () => {
    const bot = TelegramBot.create({ label: 'b', encryptedToken: 'old' });
    bot.rotateToken('new-ciphertext');
    expect(bot.encryptedToken).toBe('new-ciphertext');
    bot.rename('b2');
    expect(bot.label).toBe('b2');
    expect(() => bot.rotateToken('')).toThrow(DomainError);
    expect(() => bot.rename('')).toThrow(DomainError);
  });
});
