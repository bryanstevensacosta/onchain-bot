import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  DERIVED_PLACEHOLDERS,
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * `holderTopRow` (Rick parity, plan dexter-rick-compact-card §10.5-§10.9):
 * ONE composed derived placeholder fed by
 * `ResolvedToken.holderConcentration` =
 * `{ topPercents: number[]; top10Percent: number } | null`.
 *
 * Reference row (captured card, plan §10.1b):
 * `👥 TH: 4.3⋅3.3⋅2.8⋅2.3⋅1.8 [20%]` — per-holder percentages at 1
 * decimal (trailing zero KEPT), `⋅` between values, one space before
 * an integer bracket carrying the top-10 total. The value lowers a
 * BLANK line (`"\n\n👥 TH: " + payload`, same mechanics as
 * `honeypotBlock`).
 *
 * Monospace (owner request 2026-10-26): every percentage rides its
 * OWN code span joined by `⋅`, and the bracket span keeps its V2
 * escapes OUTSIDE the ticks — `\[`20%`\]`. Inside a code entity
 * numbers travel RAW (`4\.3` there would print the backslash);
 * `shownOf` below pins the text Telegram displays, byte-identical to
 * the captured Rick row.
 *
 * SILENCE (`""`) on ANY gap — absent/null/malformed, empty
 * `topPercents`, >5 entries, non-finite or out-of-range values,
 * `sum(topPercents) > top10Percent + ε`, or a non-increasing order.
 * Never `N/A`, never a half row, never padding.
 */

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const FIVE = {
  topPercents: [4.3, 3.3, 2.8, 2.3, 1.8],
  top10Percent: 20,
} as const;

/** MarkdownV2 unescape for display-form assertions (test-only). */
const displayOf = (text: string): string =>
  text.replace(/\\([_*[\]()~`>#+=|{}.!\\-])/g, '$1');

/** Telegram's rendered TEXT: V2 backslashes gone, code-span ticks gone. */
const shownOf = (text: string): string => displayOf(text).replace(/`/g, '');

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

const render = (body: string, token: ResolvedToken): string =>
  new TemplateRendererService().render(body, token, 'ca').text;

describe('TemplateRendererService holderTopRow (plan §10.5-§10.9)', () => {
  it('whitelists holderTopRow on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('holderTopRow');
    }
  });

  it('registers holderTopRow in DERIVED_PLACEHOLDERS right after market1hRow', () => {
    const keys = [...DERIVED_PLACEHOLDERS];
    expect(keys).toContain('holderTopRow');
    expect(keys.indexOf('holderTopRow')).toBe(keys.indexOf('market1hRow') + 1);
  });

  it('exposes META for holderTopRow (derived, nullable, blank line in the example)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'holderTopRow');
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    // Literal `\n\n` encoding, byte-identical in style to
    // `honeypotBlock` (the VALUE carries the blank-line prefix).
    expect(entry?.example).toBe(
      '\\n\\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` [`20%`]',
    );
    expect(entry?.example.startsWith('\\n\\n')).toBe(true);
  });

  it('renders the exact captured 5-value row (blank line prefix, monospaced values)', () => {
    const out = render(
      '{{holderTopRow}}',
      baseToken({ holderConcentration: FIVE }),
    );
    // Only the bracket pair keeps a V2 escape; the numbers travel RAW
    // inside their code spans (a `\.` there would print the backslash).
    expect(out).toBe('\n\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` \\[`20%`\\]');
    expect(shownOf(out)).toBe('\n\n👥 TH: 4.3⋅3.3⋅2.8⋅2.3⋅1.8 [20%]');
    // Exactly two newlines (blank line), never three.
    expect(out.startsWith('\n\n👥 TH: ')).toBe(true);
    expect(out.startsWith('\n\n\n')).toBe(false);
  });

  it('renders 3 values (no padding to 5)', () => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: {
            topPercents: [12.5, 7, 3.25],
            top10Percent: 42,
          },
        }),
      ),
    ).toBe('\n\n👥 TH: `12.5`⋅`7.0`⋅`3.3` \\[`42%`\\]');
  });

  it('renders 1 value', () => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: { topPercents: [5], top10Percent: 5 },
        }),
      ),
    ).toBe('\n\n👥 TH: `5.0` \\[`5%`\\]');
  });

  it('keeps the trailing zero (toFixed(1), never trimmed)', () => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: { topPercents: [4.3, 2.0], top10Percent: 20 },
        }),
      ),
    ).toBe('\n\n👥 TH: `4.3`⋅`2.0` \\[`20%`\\]');
  });

  it('SILENCE on an empty topPercents array (the object is valid, the row is not)', () => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: { topPercents: [], top10Percent: 0 },
        }),
      ),
    ).toBe('');
  });

  it('SILENCE on absent/null holderConcentration', () => {
    expect(render('{{holderTopRow}}', baseToken())).toBe('');
    expect(
      render('{{holderTopRow}}', baseToken({ holderConcentration: null })),
    ).toBe('');
  });

  it('SILENCE on more than 5 values', () => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: {
            topPercents: [9, 8, 7, 6, 5, 4],
            top10Percent: 50,
          },
        }),
      ),
    ).toBe('');
  });

  it.each([
    ['NaN entry', { topPercents: [4.3, Number.NaN], top10Percent: 20 }],
    [
      'Infinity entry',
      { topPercents: [4.3, Number.POSITIVE_INFINITY], top10Percent: 20 },
    ],
    ['negative entry', { topPercents: [4.3, -0.5], top10Percent: 20 }],
    ['entry above 100', { topPercents: [100.5], top10Percent: 100 }],
    ['NaN top10', { topPercents: [4.3], top10Percent: Number.NaN }],
    [
      'top10 above 100 by more than ε',
      { topPercents: [4.3], top10Percent: 100.000001 },
    ],
    ['top10 below -ε', { topPercents: [], top10Percent: -0.000001 }],
    ['sum above top10 + ε', { topPercents: [5, 5], top10Percent: 9 }],
    ['topPercents not an array', { topPercents: '4.3', top10Percent: 20 }],
    ['top10 missing', { topPercents: [4.3] }],
  ])('SILENCE on a malformed object (%s)', (_label, bad) => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({ holderConcentration: bad as never }),
      ),
    ).toBe('');
  });

  it('ACCEPTS ties in topPercents (non-increasing, not strictly decreasing)', () => {
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: { topPercents: [5, 5, 2], top10Percent: 12 },
        }),
      ),
    ).toBe('\n\n👥 TH: `5.0`⋅`5.0`⋅`2.0` \\[`12%`\\]');
  });

  it('computes the bracket from DISPLAYED TENTHS (binary carry never yields 21)', () => {
    // `0.1+0.1+0.1+16.1+3.6 === 20.000000000000004`; `Math.ceil` over
    // the raw sum would print 21 while the row shows 20.0.
    const out = render(
      '{{holderTopRow}}',
      baseToken({
        holderConcentration: {
          topPercents: [0.1, 0.1, 0.1, 16.1, 3.6],
          top10Percent: 20.000000000000004,
        },
      }),
    );
    expect(out).toBe('\n\n👥 TH: `0.1`⋅`0.1`⋅`0.1`⋅`16.1`⋅`3.6` \\[`20%`\\]');
    expect(out).not.toContain('21');
  });

  it('does NOT re-enforce the client ordering rule (renderer contract §10.7)', () => {
    // §10.7 pins the non-increasing rejection at the CLIENT guard;
    // the pipeline re-validates, so ordered data is what normally
    // arrives. A raw structural value is rendered, not silenced.
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: { topPercents: [1, 9], top10Percent: 20 },
        }),
      ),
    ).toBe('\n\n👥 TH: `1.0`⋅`9.0` \\[`20%`\\]');
  });

  it('never prints a bracket below the displayed sum (max of round(top10) and ceil(tenths/10))', () => {
    // Each 0.05 prints as `0.1` → displayed tenths = 5 → ceil = 1,
    // while round(top10Percent 0.25) = 0. The max keeps `[1%]`.
    expect(
      render(
        '{{holderTopRow}}',
        baseToken({
          holderConcentration: {
            topPercents: [0.05, 0.05, 0.05, 0.05, 0.05],
            top10Percent: 0.25,
          },
        }),
      ),
    ).toBe('\n\n👥 TH: `0.1`⋅`0.1`⋅`0.1`⋅`0.1`⋅`0.1` \\[`1%`\\]');
  });

  it('wraps every value in a code span and escapes ONLY the brackets', () => {
    const out = render(
      '{{holderTopRow}}',
      baseToken({ holderConcentration: FIVE }),
    );
    // Five payload spans + the bracket span = 6 spans = 12 ticks.
    expect(out.match(/`/g)?.length).toBe(12);
    // The only V2 escapes left are `\[` and `\]`.
    expect(out.match(/\\/g)?.length).toBe(2);
    expect(out).toContain('\\[`20%`\\]');
    expect(out).not.toContain('\\\\.');
    expect(out).not.toContain('\\`');
  });

  it('never emits N/A', () => {
    for (const token of [
      baseToken(),
      baseToken({ holderConcentration: null }),
      baseToken({ holderConcentration: { topPercents: [], top10Percent: 0 } }),
    ]) {
      expect(render('{{holderTopRow}}', token)).not.toContain('N/A');
    }
  });

  it('lowers a blank line in place and leaves no dangling separator when silent', () => {
    expect(
      render(
        'Prev{{holderTopRow}}Next',
        baseToken({ holderConcentration: FIVE }),
      ),
    ).toBe('Prev\n\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` \\[`20%`\\]Next');
    expect(render('Prev{{holderTopRow}}Next', baseToken())).toBe('PrevNext');
  });

  it('carries holderTopRow in placeholdersUsed', () => {
    const out = new TemplateRendererService().render(
      '{{holderTopRow}}',
      baseToken({ holderConcentration: FIVE }),
      'ca',
    );
    expect(out.placeholdersUsed).toContain('holderTopRow');
  });
});
