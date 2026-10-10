import {
  KNOWN_LAUNCHPAD_IDS,
  LAUNCHPAD_CATALOG,
  LaunchpadOverrideValidationError,
  launchpadOverrideInfo,
  normalizeMint,
  normalizeMintOrNull,
  validateLaunchpadId,
  validateNote,
} from './launchpad-override.validators';
import { LaunchpadOverride } from './launchpad-override.entity';

const EVM_MIXED = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC';
const SOL_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

describe('normalizeMint (single normalization fn, spec-pinned)', () => {
  it('lowercases EVM mints (checksummed input collapses to one key)', () => {
    expect(normalizeMint(EVM_MIXED)).toBe(EVM_MIXED.toLowerCase());
    expect(normalizeMint(EVM_MIXED.toLowerCase())).toBe(
      EVM_MIXED.toLowerCase(),
    );
  });

  it('keeps Solana mints EXACT (base58 case carries data)', () => {
    expect(normalizeMint(SOL_MINT)).toBe(SOL_MINT);
  });

  it('trims surrounding whitespace before classifying', () => {
    expect(normalizeMint(`  ${SOL_MINT}  `)).toBe(SOL_MINT);
    expect(normalizeMint(` ${EVM_MIXED} `)).toBe(EVM_MIXED.toLowerCase());
  });

  it.each([
    ['empty', ''],
    ['short hex', '0x1234'],
    ['41 hex chars', `0x${'a'.repeat(41)}`],
    ['non-hex 40', `0x${'g'.repeat(40)}`],
    ['missing 0x (all zeros — 0 is not base58)', '0'.repeat(40)],
    ['too-short base58', 'abc'],
    ['base58 with 0', `1${'a'.repeat(43)}`.replace('a', '0')],
    ['non-string', 42],
  ])('rejects malformed mint (%s)', (_label, raw) => {
    expect(() => normalizeMint(raw)).toThrow(LaunchpadOverrideValidationError);
  });

  it('normalizeMintOrNull returns null (never throws) on malformed input', () => {
    expect(normalizeMintOrNull('garbage')).toBeNull();
    expect(normalizeMintOrNull('')).toBeNull();
    expect(normalizeMintOrNull(undefined)).toBeNull();
    expect(normalizeMintOrNull(SOL_MINT)).toBe(SOL_MINT);
  });
});

describe('detector-slug mirror (closed validation)', () => {
  it('mirrors the 22 detector slugs (11 solana + 11 evm)', () => {
    expect(KNOWN_LAUNCHPAD_IDS).toHaveLength(22);
    for (const slug of [
      'pump-fun',
      'bonk-fun',
      'stonkfun',
      'raydium-launchlab',
      'heaven',
      'boop',
      'moonit',
      'believe',
      'jupiter-studio',
      'jups-fun',
      'meteora-dbc',
      'bankr',
      'clanker',
      'pons',
      'four-meme',
      'zora',
      'flaunch',
      'openserv',
      'mintclub',
      'virtuals',
      'pinksale',
      'dxsale',
    ]) {
      expect(KNOWN_LAUNCHPAD_IDS).toContain(slug);
      expect(LAUNCHPAD_CATALOG[slug].name).not.toBe('');
    }
  });

  it('accepts a known slug, rejects unknown with the whitelist', () => {
    expect(validateLaunchpadId('pump-fun')).toBe('pump-fun');
    expect(validateLaunchpadId('  pons  ')).toBe('pons');
    let error: unknown;
    try {
      validateLaunchpadId('gofundmeme');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(LaunchpadOverrideValidationError);
    expect((error as Error).message).toContain('launchpad_id');
    expect((error as Error).message).toContain('pump-fun');
  });

  it('launchpadOverrideInfo builds curated fields; unknown → null', () => {
    expect(launchpadOverrideInfo('pump-fun', 'solana', SOL_MINT)).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${SOL_MINT}`,
    });
    expect(launchpadOverrideInfo('nope', 'solana', SOL_MINT)).toBeNull();
  });
});

describe('note + entity boundary', () => {
  it('absent/blank note → null; over-cap → 400-class error', () => {
    expect(validateNote(undefined)).toBeNull();
    expect(validateNote('   ')).toBeNull();
    expect(validateNote('curated by operator')).toBe('curated by operator');
    expect(() => validateNote('x'.repeat(281))).toThrow(
      LaunchpadOverrideValidationError,
    );
  });

  it('entity.create normalizes + validates in one boundary', () => {
    const row = LaunchpadOverride.create({
      mint: EVM_MIXED,
      launchpadId: 'bankr',
      note: 'INCOME graduate',
    });
    expect(row.mint).toBe(EVM_MIXED.toLowerCase());
    expect(row.launchpadId).toBe('bankr');
    expect(row.note).toBe('INCOME graduate');
    expect(() =>
      LaunchpadOverride.create({ mint: 'bad', launchpadId: 'bankr' }),
    ).toThrow(LaunchpadOverrideValidationError);
    expect(() =>
      LaunchpadOverride.create({ mint: SOL_MINT, launchpadId: 'nope' }),
    ).toThrow(LaunchpadOverrideValidationError);
  });
});
