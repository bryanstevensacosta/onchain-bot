import { TemplateBot } from './template-bot.entity';

describe('TemplateBot', () => {
  it('creates a telegram bot and redacts reads', () => {
    const bot = TemplateBot.create({
      id: 'bot-1',
      label: 'News Bot',
      target: 'telegram',
      tokenCiphertext: 'iv:tag:data',
      defaultChatId: '@news',
    });
    expect(bot.label).toBe('News Bot');
    expect(bot.target).toBe('telegram');
    expect(bot.adminVerifiedAt).toBeNull();
    expect(bot.toRedacted()).toEqual({
      id: 'bot-1',
      label: 'News Bot',
      target: 'telegram',
      token: '***',
      defaultChatId: '@news',
      adminVerifiedAt: null,
    });
  });

  it('rejects empty label and missing ciphertext', () => {
    expect(() =>
      TemplateBot.create({
        label: '  ',
        target: 'telegram',
        tokenCiphertext: 'x',
      }),
    ).toThrow('label must not be empty');
    expect(() =>
      TemplateBot.create({
        label: 'B',
        target: 'threads',
        tokenCiphertext: '',
      }),
    ).toThrow('ciphertext is required');
  });

  it('marks channel verification', () => {
    const bot = TemplateBot.create({
      label: 'Threads Bot',
      target: 'threads',
      tokenCiphertext: 'iv:tag:data',
    });
    const at = new Date('2026-09-25T00:00:00Z');
    bot.markChannelVerified(at);
    expect(bot.adminVerifiedAt).toBe(at);
  });
});
