import {
  BASE_TOKEN_PLACEHOLDERS,
  DERIVED_PLACEHOLDERS,
  PLACEHOLDERS_BY_COMMAND,
  TEMPLATE_COMMANDS,
  TIMEFRAME_PLACEHOLDER,
  isKnownPlaceholder,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';

describe('placeholder-registry (todo 4 closed vocabulary)', () => {
  it('exposes the six template commands', () => {
    expect([...TEMPLATE_COMMANDS]).toEqual(['ca', 'x', 'z', 'c', 'cc', 'bare']);
  });

  it('holds exactly the 22 ResolvedToken base keys', () => {
    expect(BASE_TOKEN_PLACEHOLDERS).toHaveLength(22);
    expect([...BASE_TOKEN_PLACEHOLDERS]).toEqual([
      'symbol',
      'name',
      'chain',
      'address',
      'priceUsd',
      'priceChange24h',
      'marketCapUsd',
      'fdvUsd',
      'liquidityUsd',
      'lockedLiquidityPercent',
      'burnedPercent',
      'volume24hUsd',
      'holders',
      'top10HolderPercent',
      'top20HolderPercent',
      'totalSupply',
      'circulatingSupply',
      'maxSupply',
      'devPctSupply',
      'devWallets',
      'poolAddress',
      'source',
    ]);
  });

  it('holds the six derived keys (devLine is derived, not base)', () => {
    expect([...DERIVED_PLACEHOLDERS]).toEqual([
      'chainEmoji',
      'scanLinks',
      'dexscreenerUrl',
      'geckoterminalUrl',
      'tradeHint',
      'devLine',
    ]);
  });

  it('grants every command base + derived (28 keys)', () => {
    for (const command of ['ca', 'x', 'z', 'bare'] as const) {
      expect(PLACEHOLDERS_BY_COMMAND[command]).toHaveLength(28);
    }
  });

  it('grants timeframe ONLY to c/cc (29 keys)', () => {
    expect(PLACEHOLDERS_BY_COMMAND.c).toHaveLength(29);
    expect(PLACEHOLDERS_BY_COMMAND.cc).toHaveLength(29);
    expect(PLACEHOLDERS_BY_COMMAND.c).toContain(TIMEFRAME_PLACEHOLDER);
    expect(PLACEHOLDERS_BY_COMMAND.cc).toContain(TIMEFRAME_PLACEHOLDER);
    for (const command of ['ca', 'x', 'z', 'bare'] as const) {
      expect(PLACEHOLDERS_BY_COMMAND[command]).not.toContain(
        TIMEFRAME_PLACEHOLDER,
      );
    }
  });

  it('placeholdersFor returns a defensive copy', () => {
    const first = placeholdersFor('ca');
    first.push('{{hack}}');
    expect(placeholdersFor('ca')).not.toContain('{{hack}}');
  });

  it('placeholdersFor rejects unknown commands', () => {
    expect(() => placeholdersFor('start' as never)).toThrow(
      'Unknown template command',
    );
  });

  it('isKnownPlaceholder gates per command', () => {
    expect(isKnownPlaceholder('ca', 'symbol')).toBe(true);
    expect(isKnownPlaceholder('ca', 'timeframe')).toBe(false);
    expect(isKnownPlaceholder('c', 'timeframe')).toBe(true);
    expect(isKnownPlaceholder('cc', 'timeframe')).toBe(true);
    expect(isKnownPlaceholder('z', 'precio')).toBe(false);
  });
});
