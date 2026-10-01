import { BotVaultEntry, REDACTED_TOKEN } from './bot-vault.entity';

describe('BotVaultEntry', () => {
  it('creates with id, label, ciphertext, owner_app', () => {
    const bot = BotVaultEntry.create({
      label: 'vip-calls',
      encryptedToken: 'aa:bb:cc',
      ownerApp: 'kol-system',
    });
    expect(bot.id).toBeTruthy();
    expect(bot.label).toBe('vip-calls');
    expect(bot.ownerApp).toBe('kol-system');
    expect(bot.createdAtDate).toBeInstanceOf(Date);
    expect(bot.rotatedAtDate).toBeNull();
  });

  it('rejects empty label or missing ciphertext', () => {
    expect(() =>
      BotVaultEntry.create({ label: '  ', encryptedToken: 'x', ownerApp: 'a' }),
    ).toThrow('bot label must not be empty');
    expect(() =>
      BotVaultEntry.create({ label: 'x', encryptedToken: '', ownerApp: 'a' }),
    ).toThrow('encryptedToken must not be empty');
  });

  it('rotates without redeploy (ciphertext swap + rotatedAt)', () => {
    const bot = BotVaultEntry.create({
      label: 'x',
      encryptedToken: 'old',
      ownerApp: 'feed-publisher',
    });
    expect(bot.rotatedAtDate).toBeNull();
    bot.rotateToken('new-cipher');
    expect(bot.encryptedToken).toBe('new-cipher');
    expect(bot.rotatedAtDate).toBeInstanceOf(Date);
  });

  it('redacts the token on every read projection', () => {
    const bot = BotVaultEntry.create({
      id: 'bot-1',
      label: 'dexter',
      encryptedToken: 'secret-cipher',
      ownerApp: 'dexter-onchain-bot',
    });
    const view = bot.toRedacted();
    expect(view).toEqual({
      id: 'bot-1',
      label: 'dexter',
      token: REDACTED_TOKEN,
      ownerApp: 'dexter-onchain-bot',
      createdAt: expect.any(Date),
      rotatedAt: null,
    });
    expect(JSON.stringify(view)).not.toContain('secret-cipher');
  });
});
