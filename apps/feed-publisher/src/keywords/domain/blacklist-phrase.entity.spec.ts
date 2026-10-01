import { BlacklistPhrase } from './blacklist-phrase.entity';

describe('BlacklistPhrase', () => {
  it('matches OR phrases (simple)', () => {
    const p = BlacklistPhrase.create({
      phrase: 'scam',
      matchMode: 'substring',
    });
    expect(p.matches('this is a scam coin')).toBe(true);
    expect(p.matches('legit launch')).toBe(false);
  });

  it('checkMatchesWithMedia enforces requireMedia', () => {
    const p = BlacklistPhrase.create({
      phrase: 'airdrop',
      matchMode: 'substring',
      requireMedia: true,
    });
    expect(p.checkMatchesWithMedia('airdrop live', false)).toBe(false);
    expect(p.checkMatchesWithMedia('airdrop live', true)).toBe(true);
  });

  it('isApplicableTo scopes by channel when sourceChannelIds set', () => {
    const scoped = BlacklistPhrase.create({
      phrase: 'spam',
      sourceChannelIds: ['-1001'],
    });
    expect(scoped.isApplicableTo('-1001')).toBe(true);
    expect(scoped.isApplicableTo('-1002')).toBe(false);
    const global = BlacklistPhrase.create({ phrase: 'spam' });
    expect(global.isApplicableTo('-1009')).toBe(true);
  });

  it('rejects empty phrases', () => {
    expect(() => BlacklistPhrase.create({ phrase: '' })).toThrow();
  });
});
