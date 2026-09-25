import { Keyword } from './keyword.entity';

describe('Keyword.matches', () => {
  it('matches simple substring case-insensitively', () => {
    const kw = Keyword.create({ phrase: 'ETF', matchMode: 'substring' });
    expect(kw.matches('spot etf inflows rise')).toBe(true);
    expect(kw.matches('nothing here')).toBe(false);
  });

  it('exact mode respects word boundaries', () => {
    const kw = Keyword.create({ phrase: 'AI', matchMode: 'exact' });
    expect(kw.matches('AI agents launch')).toBe(true);
    expect(kw.matches('blockchain summit')).toBe(false);
  });

  it('exact mode matches phrases starting with a non-word character', () => {
    const kw = Keyword.create({ phrase: '#Bitcoin ETFs', matchMode: 'exact' });
    expect(kw.matches('\n#Bitcoin ETFs:\nflows up')).toBe(true);
    expect(kw.matches('ab#Bitcoin ETFs')).toBe(false);
  });

  it('caseSensitive=true distinguishes case in substring mode', () => {
    const kw = Keyword.create({
      phrase: 'ETF',
      caseSensitive: true,
      matchMode: 'substring',
    });
    expect(kw.matches('etf lows')).toBe(false);
    expect(kw.matches('ETF highs')).toBe(true);
  });

  it('returns false for empty content', () => {
    const kw = Keyword.create({ phrase: 'ETF' });
    expect(kw.matches('')).toBe(false);
  });

  it('rejects empty and over-long phrases', () => {
    expect(() => Keyword.create({ phrase: '   ' })).toThrow();
    expect(() => Keyword.create({ phrase: 'x'.repeat(201) })).toThrow();
  });

  it('isApplicableTo scopes by channel when sourceChannelIds set', () => {
    const scoped = Keyword.create({
      phrase: 'ETF',
      sourceChannelIds: ['-1001'],
    });
    expect(scoped.isApplicableTo('-1001')).toBe(true);
    expect(scoped.isApplicableTo('-1002')).toBe(false);
    const global = Keyword.create({ phrase: 'ETF' });
    expect(global.isApplicableTo('-1009')).toBe(true);
  });
});
