import type {
  BondingCurveInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';

/**
 * Line normalization of `render()`: the body is split on '\n', every
 * line renders on its own, a line that CONTAINED a placeholder but
 * renders whitespace-only is dropped whole, and the surviving lines are
 * joined with '\n'. The value's own leading/trailing newlines are
 * stripped only when the key sits at that end of its body line — so a
 * key alone on a line renders ON that line while an appended key keeps
 * its lowering, and a blank line with NO placeholder stays author
 * intent (`holderTopRow` / `honeypotBlock` stay composable).
 */

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

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

const FIVE = {
  topPercents: [4.3, 3.3, 2.8, 2.3, 1.8],
  top10Percent: 20,
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

describe('TemplateRendererService line normalization', () => {
  // Owner decision 2026-10-30: the template author owns the layout, the
  // key owns only its content.

  it('renders a key alone on its body line ON that line (no blank line)', () => {
    const body = ['Line A', '{{curveRow}}', 'Line B'].join('\n');
    expect(
      render(body, baseToken({ bondingCurve: ON_CURVE }), PUMP_RESOLVER),
    ).toBe('Line A\n⏳ 75% @ Pump\nLine B');
  });

  it('appends byte-identically to the key-on-its-own-line layout', () => {
    const token = baseToken({ bondingCurve: ON_CURVE });
    const appended = render(
      ['A{{curveRow}}', 'B'].join('\n'),
      token,
      PUMP_RESOLVER,
    );
    expect(appended).toBe(
      render(['A', '{{curveRow}}', 'B'].join('\n'), token, PUMP_RESOLVER),
    );
    expect(appended).toBe('A\n⏳ 75% @ Pump\nB');
  });

  it('leaves NO line for a silent key alone on its line', () => {
    // `usdRow` is silent on curve...
    expect(
      render(
        ['A', '{{usdRow}}', 'B'].join('\n'),
        baseToken({ bondingCurve: ON_CURVE, priceUsd: 0.00007707 }),
      ),
    ).toBe('A\nB');
    // ...and `market5mRow` is silent without the 5m window.
    expect(render(['A', '{{market5mRow}}', 'B'].join('\n'), baseToken())).toBe(
      'A\nB',
    );
  });

  it('preserves an authored blank body line (no placeholder) as author intent', () => {
    expect(render(['A', '', 'B'].join('\n'), baseToken())).toBe('A\n\nB');
    // The silent key line disappears, the authored blank line survives.
    const body = ['A', '{{holderTopRow}}', '{{usdRow}}', '', 'B'].join('\n');
    expect(
      render(
        body,
        baseToken({
          bondingCurve: ON_CURVE,
          holderConcentration: FIVE,
          priceUsd: 0.00007707,
        }),
      ),
    ).toBe('A\n👥 TH: `4.3`⋅`3.3`⋅`2.8`⋅`2.3`⋅`1.8` \\[`20%`\\]\n\nB');
  });

  it('keeps the literal text of a line whose only placeholder resolves to ""', () => {
    expect(
      render(
        'X{{usdRow}}',
        baseToken({ bondingCurve: ON_CURVE, priceUsd: 0.00007707 }),
      ),
    ).toBe('X');
  });
});
