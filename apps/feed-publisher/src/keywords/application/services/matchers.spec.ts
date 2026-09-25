import { AllowedKeywordMatcher } from './keyword-matcher.service';
import { BlacklistMatcher } from './blacklist-matcher.service';
import { Keyword } from '../../domain/keyword.entity';
import { BlacklistPhrase } from '../../domain/blacklist-phrase.entity';

function kw(
  phrase: string,
  extra?: Partial<Parameters<typeof Keyword.create>[0]>,
): Keyword {
  return Keyword.create({ phrase, matchMode: 'substring', ...extra });
}

function bl(
  phrase: string,
  extra?: Partial<Parameters<typeof BlacklistPhrase.create>[0]>,
): BlacklistPhrase {
  return BlacklistPhrase.create({ phrase, matchMode: 'substring', ...extra });
}

describe('AllowedKeywordMatcher (OR + AND-groups)', () => {
  const matcher = new AllowedKeywordMatcher();

  it('matches any simple keyword (OR semantics)', () => {
    const all = [kw('etf'), kw('halving')];
    const hit = matcher.findMatches(all, 'etf inflows hit record', false);
    expect(hit.map((k) => k.phrase)).toEqual(['etf']);
  });

  it('returns empty when nothing matches', () => {
    expect(matcher.findMatches([kw('etf')], 'quiet markets', false)).toEqual(
      [],
    );
  });

  it('AND-group fires only when all members match', () => {
    const g = 'g-1';
    const all = [
      kw('etf', { andGroupId: g }),
      kw('inflow', { andGroupId: g }),
      kw('halving'),
    ];
    const both = matcher.findMatches(all, 'etf inflow record', false);
    expect(both.map((k) => k.phrase).sort()).toEqual(['etf', 'inflow']);
    const partial = matcher.findMatches(all, 'etf outflow record', false);
    expect(partial).toEqual([]);
  });

  it('skips disabled keywords and out-of-scope channels', () => {
    const all = [
      kw('etf', { enabled: false }),
      kw('airdrop', { sourceChannelIds: ['-1001'] }),
    ];
    expect(matcher.findMatches(all, 'etf airdrop', false, '-1002')).toEqual([]);
    expect(
      matcher
        .findMatches(all, 'etf airdrop', false, '-1001')
        .map((k) => k.phrase),
    ).toEqual(['airdrop']);
  });

  it('enforces requireMedia on simple keywords and AND-groups', () => {
    const g = 'g-media';
    const all = [
      kw('chart', { requireMedia: true }),
      kw('photo', { andGroupId: g, requireMedia: true }),
      kw('drop', { andGroupId: g }),
    ];
    expect(matcher.findMatches(all, 'chart photo drop', false)).toEqual([]);
    const hit = matcher.findMatches(all, 'chart photo drop', true);
    expect(hit.map((k) => k.phrase).sort()).toEqual(['chart', 'drop', 'photo']);
  });
});

describe('BlacklistMatcher', () => {
  const matcher = new BlacklistMatcher();

  it('blocks on any simple phrase match', () => {
    const all = [bl('scam'), bl('rug')];
    const hit = matcher.findMatches(all, 'total scam coin', false);
    expect(hit.map((p) => p.phrase)).toEqual(['scam']);
  });

  it('AND-group blocks only when every member matches', () => {
    const g = 'b-1';
    const all = [bl('free', { andGroupId: g }), bl('mint', { andGroupId: g })];
    expect(matcher.findMatches(all, 'free mint now', false)).toHaveLength(2);
    expect(matcher.findMatches(all, 'free claim now', false)).toEqual([]);
  });

  it('skips disabled phrases and enforces requireMedia', () => {
    const all = [
      bl('spam', { enabled: false }),
      bl('promo', { requireMedia: true }),
    ];
    expect(matcher.findMatches(all, 'spam promo', false)).toEqual([]);
    expect(
      matcher.findMatches(all, 'spam promo', true).map((p) => p.phrase),
    ).toEqual(['promo']);
  });
});
