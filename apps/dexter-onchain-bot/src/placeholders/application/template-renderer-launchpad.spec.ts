import type {
  LaunchpadInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const CHALE_LAUNCHPAD: LaunchpadInfo = {
  id: 'pump-fun',
  name: 'Pump.fun',
  url: `https://pump.fun/coin/${CHALE_MINT}`,
};

const CHALE: ResolvedToken = {
  address: CHALE_MINT,
  chain: 'solana',
  symbol: 'CHALE',
  name: 'Chale',
  marketCapUsd: 69_000,
  fdvUsd: 69_000,
  priceUsd: 0.000069,
  priceChange24h: 12.5,
  liquidityUsd: 30_000,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: 150_000,
  holders: 1_200,
  top10HolderPercent: 25.0,
  top20HolderPercent: null,
  totalSupply: 1_000_000_000,
  circulatingSupply: 1_000_000_000,
  maxSupply: null,
  devWallets: null,
  devPctSupply: null,
  poolAddress: null,
  source: 'market-data-http',
  launchpad: CHALE_LAUNCHPAD,
};

const launchpadResolver = (): DisplayResolverPort => ({
  resolve: (placeholderKey: string, matchValue: string) =>
    placeholderKey === 'launchpad' && matchValue === 'pump-fun' ? '💊' : '',
});

describe('TemplateRendererService launchpad placeholders (dexter-launchpad Lane R)', () => {
  it('renders the 4 variants from the CHALE snapshot', () => {
    const renderer = new TemplateRendererService(launchpadResolver());
    const out = renderer.render(
      '{{launchpadText}} | {{launchpadTextLink}} | {{launchpadIcon}} | {{launchpadIconLink}}',
      CHALE,
      'ca',
    );
    expect(out.text).toContain('Pump\\.fun');
    expect(out.text).toContain(
      `[Pump\\.fun](https://pump.fun/coin/${CHALE_MINT})`,
    );
    expect(out.text).toContain('💊');
    expect(out.text).toContain(`[💊](https://pump.fun/coin/${CHALE_MINT})`);
    expect(out.placeholdersUsed).toEqual(
      expect.arrayContaining([
        'launchpadText',
        'launchpadTextLink',
        'launchpadIcon',
        'launchpadIconLink',
      ]),
    );
  });

  it('falls back to the plain Link when the emoji is missing', () => {
    const renderer = new TemplateRendererService(launchpadResolver());
    const token: ResolvedToken = {
      ...CHALE,
      launchpad: {
        id: 'unmapped-launchpad',
        name: 'Unmapped',
        url: 'https://example.com/token/abc',
      },
    };
    const out = renderer.render('{{launchpadIconLink}}', token, 'x');
    expect(out.text).toBe('[Unmapped](https://example.com/token/abc)');
  });

  it('renders all four as empty when launchpad is null', () => {
    const renderer = new TemplateRendererService(launchpadResolver());
    const token: ResolvedToken = { ...CHALE, launchpad: null };
    const out = renderer.render(
      '{{launchpadText}}|{{launchpadTextLink}}|{{launchpadIcon}}|{{launchpadIconLink}}',
      token,
      'z',
    );
    expect(out.text).toBe('|');
  });

  it('renders all four as empty when launchpad is absent', () => {
    const renderer = new TemplateRendererService(launchpadResolver());
    const { launchpad: _omitted, ...withoutLaunchpad } = CHALE;
    const out = renderer.render(
      '{{launchpadText}}|{{launchpadTextLink}}|{{launchpadIcon}}|{{launchpadIconLink}}',
      withoutLaunchpad,
      'bare',
    );
    expect(out.text).toBe('|');
  });

  it('renders unknown launchpad ids as empty icon', () => {
    const renderer = new TemplateRendererService(launchpadResolver());
    const token: ResolvedToken = {
      ...CHALE,
      launchpad: {
        id: 'nope',
        name: 'Nope',
        url: 'https://example.com/nope',
      },
    };
    expect(renderer.render('{{launchpadIcon}}', token, 'ca').text).toBe('');
  });

  it('falls back to empty icons when no display resolver is injected', () => {
    const renderer = new TemplateRendererService();
    expect(
      renderer.render('{{launchpadIcon}}', CHALE, 'ca').text,
    ).toBe('');
    expect(
      renderer.render('{{launchpadIconLink}}', CHALE, 'ca').text,
    ).toBe(`[Pump\\.fun](https://pump.fun/coin/${CHALE_MINT})`);
  });
});
