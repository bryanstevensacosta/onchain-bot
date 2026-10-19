import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * `venueSuffix` (plan todo 71, owner decision 2026-10-19): the
 * venue-line resolution composed as a suffix (`" @ X"` / `""`).
 * Mirrors the `venueLine` semantics of `template-renderer-venue.spec.ts`
 * (same origin/tech tables, same display-name override, escaped once
 * on the composed string) but removes the empty-line hole of bodies
 * that keep ` @ ` literals around an empty `{{venueLine}}`.
 */
function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump',
    chain: 'solana',
    symbol: 'TKN',
    name: 'Token',
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

describe('TemplateRendererService venueSuffix (plan todo 71)', () => {
  it('whitelists venueSuffix on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('venueSuffix');
    }
  });

  it('exposes META for venueSuffix (derived, nullable, suffix example)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'venueSuffix');
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    expect(entry?.example).toBe(' @ Flap via Pancakeswap V2');
  });

  it.each([
    [
      'origin + tech-different',
      { id: 'l', name: 'LaunchLab', url: 'https://x' },
      { dexId: 'raydium', labels: [] },
      'Solana @ LaunchLab via Raydium',
    ],
    [
      'origin-only',
      { id: 'l', name: 'LaunchLab', url: 'https://x' },
      null,
      'Solana @ LaunchLab',
    ],
    [
      'tech-only',
      null,
      { dexId: 'pancakeswap', labels: ['v3'] },
      'Solana @ Pancakeswap V3',
    ],
    ['neither → silence (no ` @ ` left behind)', null, null, 'Solana'],
  ])(
    'composes `{{chainName}}{{venueSuffix}}`: %s',
    (_label, launchpad, venue, expected) => {
      const token = baseToken({
        launchpad: launchpad as never,
        venue: venue as never,
      });
      expect(render('{{chainName}}{{venueSuffix}}', token)).toBe(expected);
    },
  );

  it('kills the empty-line hole of the ` @ {{venueLine}}` composition', () => {
    // Todo-71 finding: with no venue, `{{chainName}} @ {{venueLine}}`
    // collapses the whole line to a BLANK one (the cleanup removes
    // only the match — `'\nNext'`). `venueSuffix` keeps the line.
    const noVenue = baseToken({ launchpad: null, venue: null });
    expect(render('{{chainName}} @ {{venueLine}}\nNext', noVenue)).toBe(
      '\nNext',
    );
    expect(render('{{chainName}}{{venueSuffix}}\nNext', noVenue)).toBe(
      'Solana\nNext',
    );
  });

  it('line-start standalone: the pinned `@` recovery keeps the venue text (never a bare separator)', () => {
    // The value is a SUFFIX (`" @ X"`): attached after text it stays
    // byte-intact (composition tests above). Alone at line start the
    // pinned todo-4 `@`-family rule (`clean(' @ X') → 'X'`) strips
    // the separator and keeps the venue text.
    expect(
      render(
        '{{venueSuffix}}',
        baseToken({
          launchpad: { id: 'l', name: 'LaunchLab', url: 'https://x' },
          venue: null,
        }),
      ),
    ).toBe('LaunchLab');
    expect(
      render('{{venueSuffix}}', baseToken({ launchpad: null, venue: null })),
    ).toBe('');
  });

  it('escapes the composed suffix exactly once (dex table + origin name)', () => {
    expect(
      render(
        '{{chainName}}{{venueSuffix}}',
        baseToken({
          launchpad: null,
          venue: { dexId: 'some-new-dex', labels: [] },
        }),
      ),
    ).toBe('Solana @ Some\\-new\\-dex');
    expect(
      render(
        '{{chainName}}{{venueSuffix}}',
        baseToken({
          launchpad: { id: 'pump-fun', name: 'Pump.fun', url: 'https://x' },
          venue: null,
        }),
      ),
    ).toBe('Solana @ Pump\\.fun');
  });

  it('resolves the launchpad display-name override (same as venueLine)', () => {
    const renderer = new TemplateRendererService({
      resolve: (placeholderKey: string, matchValue: string) =>
        placeholderKey === 'launchpadName' && matchValue === 'pump-fun'
          ? 'Flap'
          : '',
    });
    const token = baseToken({
      launchpad: { id: 'pump-fun', name: 'Pump.fun', url: 'https://x' },
      venue: { dexId: 'pancakeswap', labels: ['v2'] },
    });
    expect(
      renderer.render('{{chainName}}{{venueSuffix}}', token, 'ca').text,
    ).toBe('Solana @ Flap via Pancakeswap V2');
  });

  it('carries venueSuffix in placeholdersUsed', () => {
    const out = new TemplateRendererService().render(
      '{{venueSuffix}}',
      baseToken({
        launchpad: { id: 'l', name: 'LaunchLab', url: 'https://x' },
      }),
      'ca',
    );
    expect(out.placeholdersUsed).toContain('venueSuffix');
  });
});
