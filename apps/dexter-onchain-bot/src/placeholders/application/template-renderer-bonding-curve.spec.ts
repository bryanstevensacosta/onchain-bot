import type {
  BondingCurveInfo,
  LaunchpadInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';
import {
  DERIVED_PLACEHOLDERS,
  TEMPLATE_COMMANDS,
  isKnownPlaceholder,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * Launchpad (bonding-curve) layout keys (2026-10-30). Rick docs:
 * "Tokens still on a launchpad bonding curve use a shorter layout:
 * 🆕💊 - the launchpad headline drops [FDV/24h change]; ⏳ 45% @ Pump -
 * bonding progress, launchpad; There is no USD or Liq row, and 5M:
 * replaces 1H:". Every key SILENCES off curve, so one body can serve
 * both layouts and an existing body stays byte-identical.
 *
 * Off-curve pins reuse the resolutions the pre-existing keys use
 * (`fdvUsd`/`priceChange24h`, `priceUsd` + the adaptive price
 * formatter, `formatMoneyText(liquidityUsd/2)` + `liquidityFlags`,
 * `market1hRow`) — but NOT their raw composition: `fdvChangeBracket`
 * owns its `\[`/`\]` MarkdownV2 escaping and `usdRow`/`liqRow` put
 * the number in a code span so the row emits zero backslashes (a body
 * composing `` `{{priceUsd}}` `` would receive an already escaped
 * value and print the `\.` backslash inside the span).
 *
 * NOTE on the seed: `message-template-seed.service.ts` still ships the
 * OLD full `ca` body (`💰 {{priceUsd}} ({{priceChange24h}}) • MC … •
 * Liq {{liquidityUsd}}`) — it has no `💰 USD:`/`💦 Liq:` lines. The
 * brief's composition is pinned here against the registry values it
 * reuses (and against the plan-documented live body rows), never
 * against the stale seed line.
 */

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const PUMP: LaunchpadInfo = {
  id: 'pump-fun',
  name: 'pump.fun',
  url: 'https://pump.fun/coin/2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump',
};

const ON_CURVE: BondingCurveInfo = {
  onCurve: true,
  launchpadId: 'pump-fun',
  quoteSymbol: 'Bitcoin',
  quoteMint: 'BitcoinMint111111111111111111111111111111',
  progressPercent: 75,
};

/** `launchpadName` DisplayMap override: `pump-fun` → `Pump`. */
const PUMP_RESOLVER: DisplayResolverPort = {
  resolve: (placeholderKey: string, matchValue: string) =>
    placeholderKey === 'launchpadName' && matchValue === 'pump-fun'
      ? 'Pump'
      : '',
};

const FULL_5M = {
  volume5mUsd: 159,
  priceChange5m: 1.7,
  txns5mBuys: 3,
  txns5mSells: 5,
} as const;

const FULL_1H = {
  volume1hUsd: 9_800,
  priceChange1h: -4.1,
  txns1hBuys: 25,
  txns1hSells: 26,
} as const;

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: CHALE_MINT,
    chain: 'solana',
    symbol: 'CHALE',
    name: 'Chale',
    marketCapUsd: null,
    fdvUsd: null,
    priceUsd: null,
    priceChange24h: null,
    liquidityUsd: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: null,
    holders: null,
    top10HolderPercent: null,
    top20HolderPercent: null,
    totalSupply: null,
    circulatingSupply: null,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    poolAddress: null,
    source: 'market-data-http',
    ...overrides,
  };
}

const render = (
  body: string,
  token: ResolvedToken,
  displayResolver: DisplayResolverPort | null = null,
): string =>
  new TemplateRendererService(displayResolver).render(body, token, 'ca').text;

describe('TemplateRendererService launchpad (bonding-curve) layout keys', () => {
  describe('registry + catalog', () => {
    const KEYS = [
      'curveRow',
      'quoteSuffix',
      'fdvChangeBracket',
      'usdRow',
      'liqRow',
      'market5mRow',
      'marketRow',
    ] as const;

    it('whitelists all seven keys on every command', () => {
      for (const command of TEMPLATE_COMMANDS) {
        for (const key of KEYS) {
          expect(isKnownPlaceholder(command, key)).toBe(true);
          expect(placeholdersFor(command)).toContain(key);
        }
      }
    });

    it('holds 39 derived keys with the new block right after newTokenIcon', () => {
      expect(DERIVED_PLACEHOLDERS).toHaveLength(39);
      const keys = [...DERIVED_PLACEHOLDERS];
      const start = keys.indexOf('newTokenIcon') + 1;
      expect(keys.slice(start, start + KEYS.length)).toEqual([...KEYS]);
    });

    it('grants 61 keys (ca|x|z|bare) and 62 (c|cc)', () => {
      for (const command of ['ca', 'x', 'z', 'bare'] as const) {
        expect(placeholdersFor(command)).toHaveLength(61);
      }
      for (const command of ['c', 'cc'] as const) {
        expect(placeholdersFor(command)).toHaveLength(62);
      }
    });

    it('serves the catalog alphabetically with META for every new key', () => {
      const keys = placeholdersFor('ca');
      expect(keys.every((key, i) => i === 0 || keys[i - 1] < key)).toBe(true);
      const catalog = new PlaceholdersController().list('ca').placeholders;
      expect(catalog.map((row) => row.key)).toEqual(keys);
      for (const key of KEYS) {
        const entry = catalog.find((row) => row.key === key);
        expect(entry?.type).toBe('derived');
        expect(entry?.nullable).toBe(true);
        expect(entry?.example).not.toBe('');
        expect(entry?.description).toEqual(expect.any(String));
      }
    });
  });

  describe('curveRow', () => {
    it('is silent off curve (absent and explicit null)', () => {
      expect(render('A{{curveRow}}B', baseToken())).toBe('AB');
      expect(render('A{{curveRow}}B', baseToken({ bondingCurve: null }))).toBe(
        'AB',
      );
    });

    it('is silent when onCurve is not strictly true', () => {
      expect(
        render(
          'A{{curveRow}}B',
          baseToken({ bondingCurve: { ...ON_CURVE, onCurve: false } }),
        ),
      ).toBe('AB');
    });

    it('renders progress + the launchpadName override (75% @ Pump)', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({ bondingCurve: ON_CURVE, launchpad: PUMP }),
          PUMP_RESOLVER,
        ),
      ).toBe('\n⏳ 75% @ Pump');
    });

    it('omits the progress when progressPercent is unknown', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({
            bondingCurve: { ...ON_CURVE, progressPercent: null },
            launchpad: PUMP,
          }),
          PUMP_RESOLVER,
        ),
      ).toBe('\n⏳ @ Pump');
    });

    it('falls back to bondingCurve.launchpadId without a launchpad object', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({
            bondingCurve: { ...ON_CURVE, launchpadId: 'pump.fun' },
            launchpad: undefined,
          }),
        ),
      ).toBe('\n⏳ 75% @ pump\\.fun');
      expect(
        render(
          '{{curveRow}}',
          baseToken({ bondingCurve: ON_CURVE, launchpad: undefined }),
        ),
      ).toBe('\n⏳ 75% @ pump\\-fun');
    });

    it('applies the launchpadName override to the launchpadId fallback', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({ bondingCurve: ON_CURVE, launchpad: undefined }),
          PUMP_RESOLVER,
        ),
      ).toBe('\n⏳ 75% @ Pump');
    });

    it('keeps the launchpadId fallback when progress is also unknown', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({
            bondingCurve: {
              ...ON_CURVE,
              launchpadId: 'pump.fun',
              progressPercent: null,
            },
            launchpad: undefined,
          }),
        ),
      ).toBe('\n⏳ @ pump\\.fun');
    });

    it('escapes a dotted detector name when no override resolves', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({ bondingCurve: ON_CURVE, launchpad: PUMP }),
        ),
      ).toBe('\n⏳ 75% @ pump\\.fun');
    });

    it('accepts the 0 and 100 progress bounds and escapes decimals', () => {
      expect(
        render(
          '{{curveRow}}',
          baseToken({
            bondingCurve: { ...ON_CURVE, progressPercent: 0 },
            launchpad: PUMP,
          }),
        ),
      ).toBe('\n⏳ 0% @ pump\\.fun');
      expect(
        render(
          '{{curveRow}}',
          baseToken({
            bondingCurve: {
              ...ON_CURVE,
              launchpadId: 'pump.fun',
              progressPercent: 100,
            },
          }),
        ),
      ).toBe('\n⏳ 100% @ pump\\.fun');
      expect(
        render(
          '{{curveRow}}',
          baseToken({
            bondingCurve: {
              ...ON_CURVE,
              launchpadId: 'pump.fun',
              progressPercent: 45.5,
            },
          }),
        ),
      ).toBe('\n⏳ 45\\.5% @ pump\\.fun');
    });

    it('is silent on an out-of-range progress (whole object rejected)', () => {
      expect(
        render(
          'A{{curveRow}}B',
          baseToken({ bondingCurve: { ...ON_CURVE, progressPercent: 101 } }),
        ),
      ).toBe('AB');
    });

    it('emits no backslashes on plain ASCII names', () => {
      const out = render(
        '{{curveRow}}',
        baseToken({ bondingCurve: ON_CURVE, launchpad: PUMP }),
        PUMP_RESOLVER,
      );
      expect(out.match(/\\/g)).toBeNull();
    });
  });

  describe('quoteSuffix', () => {
    it('renders /Bitcoin on curve', () => {
      expect(
        render('{{quoteSuffix}}', baseToken({ bondingCurve: ON_CURVE })),
      ).toBe('/Bitcoin');
    });

    it('is silent off curve and on a null quote symbol', () => {
      expect(render('A{{quoteSuffix}}B', baseToken())).toBe('AB');
      expect(
        render(
          'A{{quoteSuffix}}B',
          baseToken({
            bondingCurve: { ...ON_CURVE, quoteSymbol: null },
          }),
        ),
      ).toBe('AB');
    });

    it('escapes a dotted quote symbol', () => {
      expect(
        render(
          '{{quoteSuffix}}',
          baseToken({
            bondingCurve: { ...ON_CURVE, quoteSymbol: 'BTC.USDT' },
          }),
        ),
      ).toBe('/BTC\\.USDT');
    });
  });

  describe('fdvChangeBracket', () => {
    it('emits the escaped MarkdownV2 bracket off curve (trailing space)', () => {
      const out = render(
        '{{fdvChangeBracket}}',
        baseToken({ fdvUsd: 9_600, priceChange24h: 353 }),
      );
      expect(out).toBe('\\[9\\.6K/353%\\] ');
      expect(out.startsWith('\\[')).toBe(true);
      expect(out.endsWith('\\] ')).toBe(true);
    });

    it('matches the two registry values it reuses inside the escaped bracket', () => {
      const token = baseToken({ fdvUsd: 23_300, priceChange24h: -2.5 });
      expect(render('{{fdvChangeBracket}}', token)).toBe(
        `\\[${render('{{fdvUsd}}', token)}/${render('{{priceChange24h}}', token)}\\] `,
      );
    });

    it('is silent when BOTH values are unknown (never [N/A/N/A])', () => {
      const out = render('{{fdvChangeBracket}}', baseToken());
      expect(out).toBe('');
      expect(out).not.toContain('N/A');
    });

    it('renders the known side and N/A when exactly one value is unknown', () => {
      expect(
        render(
          '{{fdvChangeBracket}}',
          baseToken({ fdvUsd: 9_600, priceChange24h: null }),
        ),
      ).toBe('\\[9\\.6K/N/A\\] ');
      expect(
        render(
          '{{fdvChangeBracket}}',
          baseToken({ fdvUsd: null, priceChange24h: 353 }),
        ),
      ).toBe('\\[N/A/353%\\] ');
    });

    it('is silent on curve (the launchpad headline drops the bracket)', () => {
      expect(
        render(
          'A{{fdvChangeBracket}}B',
          baseToken({ bondingCurve: ON_CURVE, fdvUsd: 9_600 }),
        ),
      ).toBe('AB');
    });
  });

  describe('usdRow', () => {
    it('lowers the USD line off curve with the price in a code span', () => {
      const row = render('{{usdRow}}', baseToken({ priceUsd: 0.00007707 }));
      expect(row).toBe('\n💰 USD: `0.00007707`');
      expect(row).not.toContain('\\');
    });

    it('emits no backslashes (raw value inside the code span)', () => {
      const token = baseToken({ priceUsd: 0.00002434 });
      const row = render('{{usdRow}}', token);
      expect(row).toBe('\n💰 USD: `0.00002434`');
      expect(row.match(/\\/g)).toBeNull();
    });

    it('renders N/A inside the code span on a null price', () => {
      expect(render('{{usdRow}}', baseToken())).toBe('\n💰 USD: `N/A`');
    });

    it('is silent on curve (the launchpad layout has no USD row)', () => {
      expect(
        render(
          'A{{usdRow}}B',
          baseToken({ bondingCurve: ON_CURVE, priceUsd: 0.00007707 }),
        ),
      ).toBe('AB');
    });
  });

  describe('liqRow', () => {
    it('lowers one-side Liq in a code span plus the flags off curve', () => {
      const row = render(
        '{{liqRow}}',
        baseToken({
          liquidityUsd: 787.253,
          lockedLiquidityPercent: 100,
          burnedPercent: 0,
        }),
      );
      expect(row).toBe('\n💦 Liq: `394` ⚠️🔒');
      expect(row).not.toContain('\\');
    });

    it('emits no backslashes (raw value inside the code span)', () => {
      const token = baseToken({ liquidityUsd: 30_000 });
      const row = render('{{liqRow}}', token);
      expect(row).toBe('\n💦 Liq: `15K`');
      expect(row.match(/\\/g)).toBeNull();
    });

    it('keeps N/A inside the code span when the liquidity is unknown', () => {
      expect(render('{{liqRow}}', baseToken())).toBe('\n💦 Liq: `N/A`');
    });

    it('is silent on curve (the launchpad layout has no Liq row)', () => {
      expect(
        render(
          'A{{liqRow}}B',
          baseToken({ bondingCurve: ON_CURVE, liquidityUsd: 787.253 }),
        ),
      ).toBe('AB');
    });
  });

  describe('market5mRow', () => {
    it('renders the exact 5M row with zero backslashes', () => {
      const out = render('{{market5mRow}}', baseToken(FULL_5M));
      expect(out).toBe('📈 5M: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`');
      expect(out).not.toContain('\\');
      expect(out.match(/`/g)?.length).toBe(8);
    });

    it('renders 📉 for a negative change and 📈 for zero', () => {
      expect(
        render(
          '{{market5mRow}}',
          baseToken({ ...FULL_5M, priceChange5m: -3.4 }),
        ),
      ).toBe('📉 5M: `159` ⋅ `-3.4%` 🅑 `3` Ⓢ `5`');
      expect(
        render('{{market5mRow}}', baseToken({ ...FULL_5M, priceChange5m: 0 })),
      ).toBe('📈 5M: `159` ⋅ `0%` 🅑 `3` Ⓢ `5`');
    });

    it.each([
      ['volume5mUsd', { volume5mUsd: undefined }],
      ['priceChange5m', { priceChange5m: undefined }],
      ['txns5mBuys', { txns5mBuys: undefined }],
      ['txns5mSells', { txns5mSells: undefined }],
    ])('SILENCE when %s is missing (no half row)', (_key, missing) => {
      expect(
        render('{{market5mRow}}', baseToken({ ...FULL_5M, ...missing })),
      ).toBe('');
    });

    it.each([
      ['volume NaN', { volume5mUsd: Number.NaN }],
      ['volume Infinity', { volume5mUsd: Number.POSITIVE_INFINITY }],
      ['change NaN', { priceChange5m: Number.NaN }],
      ['buys negative', { txns5mBuys: -1 }],
      ['sells Infinity', { txns5mSells: Number.POSITIVE_INFINITY }],
    ])('SILENCE on a non-finite/invalid 5m value (%s)', (_label, bad) => {
      expect(render('{{market5mRow}}', baseToken({ ...FULL_5M, ...bad }))).toBe(
        '',
      );
    });

    it('SILENCE when every 5m field is absent (older snapshots)', () => {
      expect(render('{{market5mRow}}', baseToken())).toBe('');
    });

    it('emits no leading/trailing whitespace (templates own separators)', () => {
      const out = render('Prev\n{{market5mRow}}\nNext', baseToken(FULL_5M));
      expect(out).toBe('Prev\n📈 5M: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`\nNext');
      expect(out).not.toMatch(/^\s|\s$/);
    });
  });

  describe('marketRow', () => {
    it('is exactly market5mRow on curve', () => {
      const token = baseToken({
        ...FULL_1H,
        ...FULL_5M,
        bondingCurve: ON_CURVE,
      });
      const out = render('{{marketRow}}', token);
      expect(out).toBe(render('{{market5mRow}}', token));
      expect(out).toBe('📈 5M: `159` ⋅ `1.7%` 🅑 `3` Ⓢ `5`');
    });

    it('is exactly market1hRow off curve (byte-for-byte)', () => {
      const token = baseToken({ ...FULL_1H, ...FULL_5M });
      const out = render('{{marketRow}}', token);
      expect(out).toBe(render('{{market1hRow}}', token));
      expect(out).toBe('📉 1H: `9.8K` ⋅ `-4.1%` 🅑 `25` Ⓢ `26`');
    });

    it('does NOT fall back to 1H when the 5m window is missing on curve', () => {
      expect(
        render(
          'A{{marketRow}}B',
          baseToken({ ...FULL_1H, bondingCurve: ON_CURVE }),
        ),
      ).toBe('AB');
    });

    it('stays silent off curve when the 1h window is missing', () => {
      expect(render('A{{marketRow}}B', baseToken(FULL_5M))).toBe('AB');
    });

    it('carries marketRow in placeholdersUsed', () => {
      const out = new TemplateRendererService().render(
        '{{marketRow}}',
        baseToken(FULL_1H),
        'ca',
      );
      expect(out.placeholdersUsed).toContain('marketRow');
    });
  });

  it('keeps the 1H row byte-identical after the shared-helper extraction', () => {
    const token = baseToken(FULL_1H);
    expect(render('{{market1hRow}}', token)).toBe(
      '📉 1H: `9.8K` ⋅ `-4.1%` 🅑 `25` Ⓢ `26`',
    );
  });
});
